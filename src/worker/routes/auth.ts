import { normalizeUsername, validatePassword, validateUsername } from "../../shared/auth-validate";
import { ulid } from "../../shared/ids";
import type { Env } from "../index";
import { fail, isSecure, json, sha256Hex } from "../lib/http";
import { dummyVerify, hashPassword, verifyPassword, PBKDF2_ITERATIONS } from "../lib/password";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  ensureGuestId,
  type SessionUser,
} from "../lib/session";
import { checkThrottle, clearThrottle, recordFailure } from "../lib/throttle";
import { track } from "../lib/metrics";

interface Credentials {
  username?: unknown;
  password?: unknown;
  /** Nombre de quien invitó, tal cual venía en el enlace ?ref=. */
  ref?: unknown;
}

async function readBody(request: Request): Promise<Credentials> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Credentials) : {};
  } catch {
    return {};
  }
}

/** La IP nunca se guarda ni se compara en claro; solo su hash, como clave de cubo. */
async function throttleKeys(request: Request, usernameNorm: string): Promise<string[]> {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  return [`u:${usernameNorm}`, `ip:${(await sha256Hex(ip)).slice(0, 32)}`];
}

const publicUser = (u: SessionUser) => ({ id: u.id, username: u.username, role: u.role });

export async function register(request: Request, env: Env) {
  const { username, password, ref: body_ref } = await readBody(request);

  const userCheck = validateUsername(username);
  if (!userCheck.ok) return fail(400, userCheck.error);
  const passCheck = validatePassword(password, username as string);
  if (!passCheck.ok) return fail(400, passCheck.error);

  const display = (username as string).normalize("NFKC").trim();
  const norm = normalizeUsername(display);

  // Referido: se resuelve el nombre a un id. Si no existe, el alta sigue igual;
  // un enlace roto nunca puede impedir que alguien se registre.
  let referredBy: string | null = null;
  if (typeof body_ref === "string" && body_ref.trim()) {
    const inviter = await env.DB.prepare(
      "SELECT id FROM users WHERE username_norm = ? AND deleted_at IS NULL",
    ).bind(normalizeUsername(body_ref)).first<{ id: string }>();
    referredBy = inviter?.id ?? null;
  }
  const { hash, salt, iterations } = await hashPassword(password as string);
  const now = Date.now();
  const id = ulid();

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, username, username_norm, password_hash, password_salt,
                          kdf_iterations, created_at, last_seen_at, referred_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, display, norm, hash, salt, iterations, now, now, referredBy)
      .run();
  } catch (err) {
    // ux_users_norm es el árbitro: comprobar antes y luego insertar tiene carrera.
    if (String(err).includes("UNIQUE")) return fail(409, "Ese nombre de usuario ya está en uso.");
    throw err;
  }

  track(env, "user_register");
  if (referredBy) track(env, "referral_signup");

  const { cookie } = await createSession(env, request, id);
  return json({ user: { id, username: display, role: "user" } }, { headers: { "set-cookie": cookie } });
}

export async function login(request: Request, env: Env) {
  const { username, password } = await readBody(request);
  if (typeof username !== "string" || typeof password !== "string") {
    return fail(400, "Usuario y contraseña son obligatorios.");
  }

  const norm = normalizeUsername(username);
  const keys = await throttleKeys(request, norm);

  const throttle = await checkThrottle(env, keys);
  if (throttle.locked) {
    return fail(429, "Demasiados intentos fallidos. Prueba más tarde.", {
      retryAfter: throttle.retryAfterSeconds,
    });
  }

  const row = await env.DB.prepare(
    `SELECT id, username, role, flags, password_hash, password_salt, kdf_iterations,
            banned_until, deleted_at
       FROM users WHERE username_norm = ?`,
  )
    .bind(norm)
    .first<{
      id: string;
      username: string;
      role: string;
      flags: number;
      password_hash: ArrayBuffer;
      password_salt: ArrayBuffer;
      kdf_iterations: number;
      banned_until: number | null;
      deleted_at: number | null;
    }>();

  if (!row || row.deleted_at !== null) {
    // Mismo coste que un login real: sin esto el tiempo de respuesta revela
    // qué cuentas existen.
    await dummyVerify(password);
    await recordFailure(env, keys);
    return fail(401, "Usuario o contraseña incorrectos.");
  }

  const ok = await verifyPassword(password, {
    hash: new Uint8Array(row.password_hash),
    salt: new Uint8Array(row.password_salt),
    iterations: row.kdf_iterations,
  });

  if (!ok) {
    await recordFailure(env, keys);
    // Mismo mensaje que arriba: no distinguir "no existe" de "contraseña mala".
    return fail(401, "Usuario o contraseña incorrectos.");
  }

  if (row.banned_until !== null && row.banned_until > Date.now()) {
    return fail(403, "Esta cuenta está suspendida.");
  }

  await clearThrottle(env, keys);

  // Las iteraciones se guardan por fila, así que subir el parámetro rehashea
  // solo, en el siguiente login de cada usuario.
  if (row.kdf_iterations < PBKDF2_ITERATIONS) {
    const fresh = await hashPassword(password);
    await env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, kdf_iterations = ? WHERE id = ?",
    )
      .bind(fresh.hash, fresh.salt, fresh.iterations, row.id)
      .run();
  }

  await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?")
    .bind(Date.now(), row.id)
    .run();

  track(env, "user_login");

  const { cookie } = await createSession(env, request, row.id);
  return json({ user: publicUser(row) }, { headers: { "set-cookie": cookie } });
}

export async function logout(request: Request, env: Env) {
  const cookie = await destroySession(env, request);
  return json({ ok: true }, { headers: { "set-cookie": cookie } });
}

/** Quién soy. Devuelve el usuario, o una identidad de invitado si no hay sesión. */
export function me(request: Request, user: SessionUser | null) {
  if (user) return json({ user: publicUser(user), guest: false });

  const guest = ensureGuestId(request);
  return json(
    { user: null, guestId: guest.id, guest: true },
    guest.setCookie ? { headers: { "set-cookie": guest.setCookie } } : undefined,
  );
}

export async function changePassword(request: Request, env: Env, user: SessionUser) {
  const body = (await readBody(request)) as { current?: unknown; next?: unknown };
  if (typeof body.current !== "string") return fail(400, "Falta la contraseña actual.");

  const check = validatePassword(body.next, user.username);
  if (!check.ok) return fail(400, check.error);

  const row = await env.DB.prepare(
    "SELECT password_hash, password_salt, kdf_iterations FROM users WHERE id = ?",
  )
    .bind(user.id)
    .first<{ password_hash: ArrayBuffer; password_salt: ArrayBuffer; kdf_iterations: number }>();
  if (!row) return fail(401, "Sesión no válida.");

  const ok = await verifyPassword(body.current, {
    hash: new Uint8Array(row.password_hash),
    salt: new Uint8Array(row.password_salt),
    iterations: row.kdf_iterations,
  });
  if (!ok) return fail(401, "La contraseña actual no es correcta.");

  const fresh = await hashPassword(body.next as string);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, kdf_iterations = ? WHERE id = ?",
  )
    .bind(fresh.hash, fresh.salt, fresh.iterations, user.id)
    .run();

  // Cambiar la contraseña invalida todo, incluida esta sesión: es el punto.
  await destroyAllSessions(env, user.id);

  const { cookie } = await createSession(env, request, user.id);
  return json({ ok: true }, { headers: { "set-cookie": cookie } });
}

export const secureFlag = isSecure;
