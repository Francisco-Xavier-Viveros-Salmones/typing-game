import type { Env } from "../index";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
/** Bloqueo exponencial desde el 5º fallo: 1, 2, 4, 8… minutos, con tope de 1 hora. */
const BASE_LOCK_MS = 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;

export interface ThrottleState {
  locked: boolean;
  retryAfterSeconds: number;
}

interface Row {
  key: string;
  fails: number;
  window_start: number;
  locked_until: number | null;
}

function read(env: Env, keys: string[]) {
  const placeholders = keys.map(() => "?").join(",");
  return env.DB.prepare(`SELECT * FROM auth_throttle WHERE key IN (${placeholders})`)
    .bind(...keys)
    .all<Row>();
}

/**
 * Un cubo por usuario y otro por IP: solo por IP deja pasar el ataque
 * distribuido, y solo por usuario permite barrer cuentas desde una máquina.
 * Basta con que uno de los dos esté bloqueado.
 */
export async function checkThrottle(env: Env, keys: string[]): Promise<ThrottleState> {
  const now = Date.now();
  const { results } = await read(env, keys);

  const until = results.reduce((max, r) => Math.max(max, r.locked_until ?? 0), 0);
  return { locked: until > now, retryAfterSeconds: Math.max(0, Math.ceil((until - now) / 1000)) };
}

/**
 * ponytail: leer-modificar-escribir en JS en vez de un UPSERT con la aritmética
 * embutida en SQL. D1 no tiene transacciones interactivas, así que dos fallos
 * simultáneos sobre la misma clave pueden contar como uno. El techo es real
 * pero irrelevante: un atacante gana como mucho un intento extra por ráfaga, y
 * el coste de PBKDF2 ya limita el ritmo. Si alguna vez importa, la respuesta es
 * un Durable Object por clave, no SQL más listo.
 */
export async function recordFailure(env: Env, keys: string[]): Promise<void> {
  const now = Date.now();
  const { results } = await read(env, keys);
  const byKey = new Map(results.map((r) => [r.key, r]));

  await env.DB.batch(
    keys.map((key) => {
      const prev = byKey.get(key);
      const expired = !prev || now - prev.window_start > WINDOW_MS;

      const fails = expired ? 1 : prev.fails + 1;
      const windowStart = expired ? now : prev.window_start;

      let lockedUntil = expired ? null : prev.locked_until;
      if (fails >= MAX_FAILS) {
        const step = Math.min(fails - MAX_FAILS, 10); // 1<<10 ya supera el tope
        lockedUntil = now + Math.min(BASE_LOCK_MS * 2 ** step, MAX_LOCK_MS);
      }

      return env.DB.prepare(
        `INSERT INTO auth_throttle (key, fails, window_start, locked_until)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET fails = ?2, window_start = ?3, locked_until = ?4`,
      ).bind(key, fails, windowStart, lockedUntil);
    }),
  );
}

/** Un login correcto limpia los cubos: quien sabe la contraseña no es el atacante. */
export async function clearThrottle(env: Env, keys: string[]): Promise<void> {
  const placeholders = keys.map(() => "?").join(",");
  await env.DB.prepare(`DELETE FROM auth_throttle WHERE key IN (${placeholders})`)
    .bind(...keys)
    .run();
}
