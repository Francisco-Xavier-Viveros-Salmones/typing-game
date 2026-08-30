import { seasonCarryOver } from "../../shared/elo";
import { ulid } from "../../shared/ids";
import type { Env } from "../index";

const SEASON_DAYS = 30;
/** Usuarios por tanda del cierre. D1 no aguanta un UPDATE masivo en 30 s. */
const PAGE = 500;

/** Crea la primera temporada si no hay ninguna. Idempotente. */
export async function ensureSeason(env: Env, now = Date.now()): Promise<string | null> {
  const active = await env.DB.prepare(
    "SELECT id FROM seasons WHERE state = 'active' LIMIT 1",
  ).first<{ id: string }>();
  if (active) return active.id;

  const id = ulid(now);
  const n = await env.DB.prepare("SELECT COUNT(*) AS c FROM seasons").first<{ c: number }>();
  await env.DB.prepare(
    `INSERT INTO seasons (id, name, starts_at, ends_at, state) VALUES (?, ?, ?, ?, 'active')`,
  ).bind(id, `Temporada ${(n?.c ?? 0) + 1}`, now, now + SEASON_DAYS * 86_400_000).run();

  return id;
}

/**
 * Cierre de temporada, por tandas con cursor.
 *
 * No puede ser un solo UPDATE: D1 no tiene transacciones largas y tiene un
 * presupuesto de 30 s por sentencia. Cada invocación del cron procesa una
 * página y devuelve; la siguiente continúa donde se quedó.
 */
export async function rolloverSeasons(env: Env, now = Date.now()): Promise<string> {
  // Cerrojo: el UPDATE condicional garantiza que solo una invocación toma la
  // temporada, aunque dos crons se solapen.
  const due = await env.DB.prepare(
    "SELECT id, name FROM seasons WHERE state = 'active' AND ends_at < ? LIMIT 1",
  ).bind(now).first<{ id: string; name: string }>();

  if (due) {
    const taken = await env.DB.prepare(
      "UPDATE seasons SET state = 'rolling_over' WHERE id = ? AND state = 'active'",
    ).bind(due.id).run();
    if ((taken.meta?.changes ?? 0) === 0) return "otra invocación la tomó";
  }

  const rolling = await env.DB.prepare(
    "SELECT id, rollover_cursor FROM seasons WHERE state = 'rolling_over' LIMIT 1",
  ).first<{ id: string; rollover_cursor: string | null }>();
  if (!rolling) return "nada que cerrar";

  const cursor = rolling.rollover_cursor ?? "";
  const { results: page } = await env.DB.prepare(
    `SELECT user_id, rating, matches_played FROM elo_ratings
      WHERE season_id = ? AND user_id > ? AND placements_left = 0
      ORDER BY user_id LIMIT ?`,
  ).bind(rolling.id, cursor, PAGE)
   .all<{ user_id: string; rating: number; matches_played: number }>();

  if (page.length === 0) {
    // Terminado: se archiva la clasificación y arranca la siguiente temporada.
    await env.DB.prepare("UPDATE seasons SET state = 'closed' WHERE id = ?").bind(rolling.id).run();
    const next = await ensureSeason(env, now);
    return `temporada ${rolling.id} cerrada, sigue ${next}`;
  }

  // El puesto se calcula una vez y se archiva; recalcularlo después exigiría
  // conservar la tabla viva de una temporada ya cerrada.
  const ranked = [...page].sort((a, b) => b.rating - a.rating);
  const { results: above } = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM season_final_standings WHERE season_id = ?",
  ).bind(rolling.id).all<{ c: number }>();
  const offset = above[0]?.c ?? 0;

  const nextSeason = await env.DB.prepare(
    "SELECT id FROM seasons WHERE state = 'active' LIMIT 1",
  ).first<{ id: string }>();

  const stmts: D1PreparedStatement[] = [];
  ranked.forEach((row, i) => {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO season_final_standings (season_id, user_id, rank, rating, matches)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(season_id, user_id) DO NOTHING`,
      ).bind(rolling.id, row.user_id, offset + i + 1, row.rating, row.matches_played),
    );

    if (nextSeason) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO elo_ratings (season_id, user_id, rating, peak_rating, placements_left, updated_at)
           VALUES (?, ?, ?, ?, 5, ?) ON CONFLICT(season_id, user_id) DO NOTHING`,
        ).bind(nextSeason.id, row.user_id, seasonCarryOver(row.rating), seasonCarryOver(row.rating), now),
      );
    }
  });

  const last = page[page.length - 1]!.user_id;
  stmts.push(
    env.DB.prepare("UPDATE seasons SET rollover_cursor = ? WHERE id = ?").bind(last, rolling.id),
  );

  await env.DB.batch(stmts);
  return `procesados ${page.length} jugadores de ${rolling.id}`;
}

/** Limpieza: sesiones caducadas y tablas diarias antiguas. */
export async function gc(env: Env, now = Date.now()): Promise<string> {
  const res = await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM wpm_board_daily WHERE day < ?")
      .bind(new Date(now - 90 * 86_400_000).toISOString().slice(0, 10)),
    env.DB.prepare("DELETE FROM auth_throttle WHERE window_start < ?").bind(now - 86_400_000),
  ]);
  return `gc: ${res.map((r) => r.meta?.changes ?? 0).join("/")} filas`;
}
