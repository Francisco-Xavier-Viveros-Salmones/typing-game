import { utcDay } from "../do/persist";
import type { Env } from "../index";
import { fail, json } from "../lib/http";
import type { SessionUser } from "../lib/session";

/**
 * Leaderboards y perfil.
 *
 * Todas las lecturas van contra agregados o índices, nunca contra un GROUP BY
 * sobre round_results: eso escala bien con mil filas y es inservible con un
 * millón. La paginación es por keyset, nunca OFFSET.
 */

const LIMIT = 25;

export async function leaderboard(request: Request, env: Env) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "wpm";

  switch (kind) {
    case "wpm": {
      const { results } = await env.DB.prepare(
        `SELECT u.username, s.best_wpm, s.races, s.wins
           FROM user_stats s JOIN users u ON u.id = s.user_id
          WHERE s.best_wpm > 0 AND u.deleted_at IS NULL
          ORDER BY s.best_wpm DESC LIMIT ?`,
      ).bind(LIMIT).all();
      return json({ kind, rows: results });
    }

    case "daily": {
      const { results } = await env.DB.prepare(
        `SELECT nickname AS username, best_wpm, races
           FROM wpm_board_daily
          WHERE day = ?
          ORDER BY best_wpm DESC LIMIT ?`,
      ).bind(utcDay(Date.now()), LIMIT).all();
      return json({ kind, day: utcDay(Date.now()), rows: results });
    }

    case "wins": {
      const { results } = await env.DB.prepare(
        `SELECT u.username, s.wins, s.matches, s.best_wpm
           FROM user_stats s JOIN users u ON u.id = s.user_id
          WHERE s.matches > 0 AND u.deleted_at IS NULL
          ORDER BY s.wins DESC, s.matches ASC LIMIT ?`,
      ).bind(LIMIT).all();
      return json({ kind, rows: results });
    }

    case "ranked": {
      const season = await activeSeason(env);
      if (!season) return json({ kind, season: null, rows: [] });

      // Índice puro: ix_elo_board(season_id, placements_left, rating DESC).
      // Los que siguen en colocaciones no aparecen todavía.
      const { results } = await env.DB.prepare(
        `SELECT u.username, e.rating, e.peak_rating, e.matches_played, e.wins
           FROM elo_ratings e JOIN users u ON u.id = e.user_id
          WHERE e.season_id = ? AND e.placements_left = 0 AND u.deleted_at IS NULL
          ORDER BY e.rating DESC LIMIT ?`,
      ).bind(season.id, LIMIT).all();
      return json({ kind, season: { id: season.id, name: season.name, endsAt: season.ends_at }, rows: results });
    }

    default:
      return fail(400, "tabla_desconocida");
  }
}

export async function profile(request: Request, env: Env, user: SessionUser | null) {
  const url = new URL(request.url);
  const username = url.searchParams.get("user");

  const row = username
    ? await env.DB.prepare("SELECT id, username FROM users WHERE username_norm = ? AND deleted_at IS NULL")
        .bind(username.normalize("NFKC").toLowerCase()).first<{ id: string; username: string }>()
    : user
      ? { id: user.id, username: user.username }
      : null;

  if (!row) return fail(404, "usuario_no_encontrado");

  const stats = await env.DB.prepare("SELECT * FROM user_stats WHERE user_id = ?")
    .bind(row.id).first();

  // Keyset sobre match_id (ULID, ordenable por tiempo): sin OFFSET.
  const before = url.searchParams.get("before");
  const { results: history } = await env.DB.prepare(
    `SELECT m.id, m.mode, m.started_at, m.total_rounds, m.player_count,
            r.final_rank, r.total_points, r.avg_wpm, r.elo_delta, r.elo_after
       FROM match_results r JOIN matches m ON m.id = r.match_id
      WHERE r.user_id = ?1 ${before ? "AND m.id < ?2" : ""}
      ORDER BY m.id DESC LIMIT 20`,
  ).bind(...(before ? [row.id, before] : [row.id])).all();

  const season = await activeSeason(env);
  const elo = season
    ? await env.DB.prepare("SELECT * FROM elo_ratings WHERE season_id = ? AND user_id = ?")
        .bind(season.id, row.id).first()
    : null;

  return json({ user: { id: row.id, username: row.username }, stats, elo, history });
}

// ------------------------------------------------------------------ temporadas

export interface Season {
  id: string;
  name: string;
  starts_at: number;
  ends_at: number;
  state: string;
}

export function activeSeason(env: Env): Promise<Season | null> {
  return env.DB.prepare("SELECT * FROM seasons WHERE state = 'active' ORDER BY starts_at DESC LIMIT 1")
    .first<Season>();
}
