import { computeEloDeltas, type EloPlayer } from "../../shared/elo";
import { encodeGhost, MAX_GHOST_BYTES, type GhostRun } from "../../shared/ghost";
import { ulid } from "../../shared/ids";
import type { RoomSettings, RoundResultView, StandingView } from "../../shared/protocol";
import type { Env } from "../index";

/**
 * Construcción de los batches que el Durable Object escribe en D1.
 *
 * Todo camino de escritura es UN solo `db.batch()`: D1 no tiene transacciones
 * interactivas, así que la atomicidad es la del batch. Y todo batch es
 * idempotente —guardado por un índice único o por un UPDATE condicional—
 * para que reintentarlo tras un fallo desconocido sea seguro.
 */

export interface PersistPlayer {
  slot: number;
  userId: string | null;
  nickname: string;
}

export interface RoundPersist {
  matchId: string;
  roundId: string;
  roundNo: number;
  phraseId: string;
  charsTotal: number;
  startedAt: number;
  results: RoundResultView[];
  players: PersistPlayer[];
}

/** Día UTC, la clave de la tabla rodante diaria. */
export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function matchInsert(
  db: D1Database,
  matchId: string,
  roomCode: string,
  mode: "solo" | "casual" | "ranked",
  settings: RoomSettings,
  seasonId: string | null,
  playerCount: number,
  startedAt: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO matches (id, room_code, mode, life_mode, lang, category, difficulty,
                            time_limit_s, total_rounds, season_id, player_count, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      matchId, roomCode, mode, settings.mode, settings.lang, settings.category,
      settings.difficulty, settings.timeLimitSeconds, settings.totalRounds,
      seasonId, playerCount, startedAt,
    );
}

export function roundInsert(
  db: D1Database,
  p: { roundId: string; matchId: string; roundNo: number; phraseId: string; startedAt: number },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO match_rounds (id, match_id, round_no, phrase_id, started_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(p.roundId, p.matchId, p.roundNo, p.phraseId, p.startedAt);
}

/**
 * Cierre de ronda. La primera sentencia es el guard: si `scored_at` ya estaba
 * puesto, no toca filas — y como el llamador comprueba `meta.changes`, el
 * batch entero se descarta en vez de duplicar puntos.
 */
export function roundCloseBatch(db: D1Database, r: RoundPersist, now: number): D1PreparedStatement[] {
  const byUser = new Map(r.players.map((p) => [p.slot, p.userId]));
  const day = utcDay(now);

  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE match_rounds SET scored_at = ?, ended_at = ? WHERE id = ? AND scored_at IS NULL")
      .bind(now, now, r.roundId),
  ];

  for (const res of r.results) {
    const userId = byUser.get(res.slot) ?? null;

    stmts.push(
      db.prepare(
        `INSERT INTO round_results (round_id, slot, user_id, nickname, status, finish_rank,
                                    finish_seq, finish_ms, chars_typed, chars_total, errors,
                                    wpm, accuracy, points)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(round_id, slot) DO NOTHING`,
      ).bind(
        r.roundId, res.slot, userId, res.nickname, res.status, res.rank,
        null, res.finishMs, res.charsTyped, r.charsTotal, res.errors,
        res.wpm, res.accuracy, res.points,
      ),
    );

    // Los invitados juegan, pero no entran en estadísticas ni leaderboards.
    if (!userId) continue;

    stmts.push(
      db.prepare(
        `INSERT INTO user_stats (user_id, races, matches, wins, podiums, dnf, best_wpm,
                                 sum_wpm, sum_accuracy, chars_typed, time_ms, updated_at)
         VALUES (?1, 1, 0, 0, 0, ?2, ?3, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(user_id) DO UPDATE SET
           races        = user_stats.races + 1,
           dnf          = user_stats.dnf + ?2,
           -- MAX incremental: nunca se recalcula el récord por escaneo.
           best_wpm     = MAX(user_stats.best_wpm, ?3),
           sum_wpm      = user_stats.sum_wpm + ?3,
           sum_accuracy = user_stats.sum_accuracy + ?4,
           chars_typed  = user_stats.chars_typed + ?5,
           time_ms      = user_stats.time_ms + ?6,
           updated_at   = ?7`,
      ).bind(
        userId,
        res.status === "finished" ? 0 : 1,
        res.wpm,
        res.accuracy,
        res.charsTyped,
        res.finishMs ?? 0,
        now,
      ),
    );

    if (res.status === "finished") {
      stmts.push(
        db.prepare(
          `INSERT INTO wpm_board_daily (day, user_id, nickname, best_wpm, races)
           VALUES (?1, ?2, ?3, ?4, 1)
           ON CONFLICT(day, user_id) DO UPDATE SET
             best_wpm = MAX(wpm_board_daily.best_wpm, ?4),
             nickname = ?3,
             races    = wpm_board_daily.races + 1`,
        ).bind(day, userId, res.nickname, res.wpm),
      );
    }
  }

  return stmts;
}

export interface GhostCandidate {
  userId: string;
  phraseId: string;
  lang: string;
  difficulty: string;
  wpm: number;
  accuracy: number;
  errors: number;
  run: GhostRun;
}

/**
 * Un fantasma por jugador y frase: el récord personal.
 *
 * Se guarda solo si supera al que ya había. `ux_ghost_pb` garantiza que no
 * puedan coexistir dos, así que primero se baja el viejo y luego se inserta.
 */
export function ghostBatch(db: D1Database, g: GhostCandidate, now: number): D1PreparedStatement[] {
  const bytes = encodeGhost(g.run);
  if (bytes.byteLength > MAX_GHOST_BYTES) return [];

  return [
    // Solo desmarca si el nuevo es mejor; si no, el INSERT de abajo chocaría
    // con el índice único y abortaría el batch — que es justo lo que queremos.
    db.prepare(
      `UPDATE ghosts SET is_pb = 0
        WHERE user_id = ? AND phrase_id = ? AND is_pb = 1 AND wpm < ?`,
    ).bind(g.userId, g.phraseId, g.wpm),

    db.prepare(
      `INSERT INTO ghosts (id, user_id, phrase_id, lang, difficulty, wpm, accuracy, errors,
                           duration_ms, data, byte_len, is_pb, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12
        WHERE NOT EXISTS (
          SELECT 1 FROM ghosts WHERE user_id = ?2 AND phrase_id = ?3 AND is_pb = 1
        )`,
    ).bind(
      ulid(now), g.userId, g.phraseId, g.lang, g.difficulty, g.wpm, g.accuracy,
      g.errors, g.run.durationMs, bytes, bytes.byteLength, now,
    ),
  ];
}

export interface MatchEndInput {
  matchId: string;
  seasonId: string | null;
  ranked: boolean;
  standings: StandingView[];
  players: PersistPlayer[];
  avgWpm: Map<number, number>;
  /** Rating actual por usuario. Vacío si la partida no es ranked. */
  ratings: Map<string, { rating: number; placementsLeft: number }>;
  now: number;
}

export function matchEndBatch(db: D1Database, m: MatchEndInput): D1PreparedStatement[] {
  const bySlot = new Map(m.players.map((p) => [p.slot, p]));
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE matches SET ended_at = ? WHERE id = ? AND ended_at IS NULL")
      .bind(m.now, m.matchId),
  ];

  // --- Elo, solo en ranked y solo entre jugadores con cuenta ---
  const eloBySlot = new Map<number, { before: number; after: number; delta: number; k: number }>();

  if (m.ranked && m.seasonId) {
    const input: (EloPlayer & { slot: number })[] = [];
    for (const s of m.standings) {
      const p = bySlot.get(s.slot);
      if (!p?.userId) continue;
      const cur = m.ratings.get(p.userId) ?? { rating: 1200, placementsLeft: 10 };
      input.push({ userId: p.userId, rating: cur.rating, rank: s.rank, placementsLeft: cur.placementsLeft, slot: s.slot });
    }

    const results = computeEloDeltas(input);
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const slot = input[i]!.slot;
      eloBySlot.set(slot, { before: r.rating, after: r.after, delta: r.delta, k: r.k });

      // elo_history va PRIMERO: su índice único (match_id, user_id) hace que un
      // batch reproducido aborte antes de tocar el rating.
      stmts.push(
        db.prepare(
          `INSERT INTO elo_history (id, season_id, user_id, match_id, before, after, delta, k_factor, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(ulid(m.now), m.seasonId, r.userId, m.matchId, r.rating, r.after, r.delta, r.k, m.now),
      );

      const standing = m.standings.find((s) => s.slot === slot)!;
      stmts.push(
        db.prepare(
          `INSERT INTO elo_ratings (season_id, user_id, rating, peak_rating, matches_played,
                                    wins, podiums, placements_left, updated_at)
           VALUES (?1, ?2, ?3, ?3, 1, ?4, ?5, ?6, ?7)
           ON CONFLICT(season_id, user_id) DO UPDATE SET
             -- Forma aditiva, no absoluta: dos partidas concurrentes componen
             -- en vez de pisarse.
             rating          = elo_ratings.rating + ?8,
             peak_rating     = MAX(elo_ratings.peak_rating, elo_ratings.rating + ?8),
             matches_played  = elo_ratings.matches_played + 1,
             wins            = elo_ratings.wins + ?4,
             podiums         = elo_ratings.podiums + ?5,
             placements_left = MAX(0, elo_ratings.placements_left - 1),
             updated_at      = ?7`,
        ).bind(
          m.seasonId, r.userId, r.after,
          standing.rank === 1 ? 1 : 0,
          standing.rank <= 3 ? 1 : 0,
          Math.max(0, (m.ratings.get(r.userId)?.placementsLeft ?? 10) - 1),
          m.now,
          r.delta,
        ),
      );
    }
  }

  // --- resultado final y estadísticas de torneo ---
  for (const s of m.standings) {
    const p = bySlot.get(s.slot);
    if (!p) continue;
    const elo = eloBySlot.get(s.slot);

    stmts.push(
      db.prepare(
        `INSERT INTO match_results (match_id, slot, user_id, nickname, final_rank,
                                    total_points, avg_wpm, elo_before, elo_after, elo_delta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, slot) DO NOTHING`,
      ).bind(
        m.matchId, s.slot, p.userId, p.nickname, s.rank, s.totalPoints,
        m.avgWpm.get(s.slot) ?? 0,
        elo?.before ?? null, elo?.after ?? null, elo?.delta ?? null,
      ),
    );

    if (p.userId) {
      stmts.push(
        db.prepare(
          `INSERT INTO user_stats (user_id, races, matches, wins, podiums, dnf, best_wpm,
                                   sum_wpm, sum_accuracy, chars_typed, time_ms, updated_at)
           VALUES (?1, 0, 1, ?2, ?3, 0, 0, 0, 0, 0, 0, ?4)
           ON CONFLICT(user_id) DO UPDATE SET
             matches    = user_stats.matches + 1,
             wins       = user_stats.wins + ?2,
             podiums    = user_stats.podiums + ?3,
             updated_at = ?4`,
        ).bind(p.userId, s.rank === 1 ? 1 : 0, s.rank <= 3 ? 1 : 0, m.now),
      );
    }
  }

  return stmts;
}
