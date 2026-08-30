import { ulid } from "../../shared/ids";
import type { Env } from "../index";
import { buildCookie, clearCookie, isSecure, readCookie, sha256Hex } from "./http";

export const SESSION_COOKIE = "sid";
export const GUEST_COOKIE = "gid";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
/** Solo se refresca la sesión si lleva más de esto sin tocarse. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  flags: number;
}

/** Token opaco de 256 bits. Se guarda su sha256, nunca el token. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSession(
  env: Env,
  request: Request,
  userId: string,
): Promise<{ token: string; cookie: string }> {
  const token = newToken();
  const now = Date.now();
  const ua = request.headers.get("user-agent") ?? "";

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at, ua_hash, ip_cc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      await sha256Hex(token),
      userId,
      now,
      now + SESSION_TTL_MS,
      now,
      (await sha256Hex(ua)).slice(0, 16),
      (request as { cf?: { country?: string } }).cf?.country ?? null,
    )
    .run();

  return {
    token,
    cookie: buildCookie(SESSION_COOKIE, token, {
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      secure: isSecure(request),
    }),
  };
}

/**
 * Resuelve la sesión de la petición. Devuelve null si no hay, caducó, o el
 * usuario está borrado o baneado.
 */
export async function getSessionUser(
  env: Env,
  request: Request,
  ctx: ExecutionContext,
): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const id = await sha256Hex(token);
  const now = Date.now();

  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.expires_at, s.last_used_at,
            u.id, u.username, u.role, u.flags, u.banned_until, u.deleted_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(id)
    .first<{
      sid: string;
      expires_at: number;
      last_used_at: number;
      id: string;
      username: string;
      role: string;
      flags: number;
      banned_until: number | null;
      deleted_at: number | null;
    }>();

  if (!row) return null;
  if (row.expires_at <= now || row.deleted_at !== null) return null;
  if (row.banned_until !== null && row.banned_until > now) return null;

  // Expiración deslizante con freno de escritura: sin esto, cada petición de
  // una sesión activa sería un write a D1.
  if (now - row.last_used_at > REFRESH_AFTER_MS) {
    ctx.waitUntil(
      env.DB.prepare("UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?")
        .bind(now, now + SESSION_TTL_MS, row.sid)
        .run(),
    );
  }

  return { id: row.id, username: row.username, role: row.role, flags: row.flags };
}

export async function destroySession(env: Env, request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  }
  return clearCookie(SESSION_COOKIE, isSecure(request));
}

/** Al cambiar la contraseña se tiran todas las sesiones, incluida la actual. */
export async function destroyAllSessions(env: Env, userId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

/**
 * Identidad de invitado: permite jugar sin cuenta. No da acceso a ranked, ni a
 * fantasmas, ni a leaderboards, así que no necesita respaldo en la base — solo
 * distingue jugadores dentro de una sala.
 */
export function ensureGuestId(request: Request): { id: string; setCookie?: string } {
  const existing = readCookie(request, GUEST_COOKIE);
  if (existing && /^[0-9A-Z]{26}$/.test(existing)) return { id: existing };

  const id = ulid();
  return {
    id,
    setCookie: buildCookie(GUEST_COOKIE, id, {
      maxAge: 365 * 24 * 60 * 60,
      secure: isSecure(request),
    }),
  };
}
