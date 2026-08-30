import { MAX_GHOST_BYTES } from "../../shared/ghost";
import { ulid } from "../../shared/ids";
import { computeAccuracy, computeWpm } from "../../shared/wpm";
import { utcDay } from "../do/persist";
import type { Env } from "../index";
import { fail, json } from "../lib/http";
import type { SessionUser } from "../lib/session";

/**
 * Modo solo y fantasmas.
 *
 * El solo no necesita Durable Object: es una frase, un fantasma y el resultado.
 * Por eso también es la vía más barata para validar el códec antes de que los
 * fantasmas aparezcan en multijugador.
 */

/** GET /api/ghosts/pb?phrase=<id> — tu récord personal en esa frase. */
export async function personalBest(request: Request, env: Env, user: SessionUser | null) {
  if (!user) return json({ ghost: null, reason: "invitado" });

  const phraseId = new URL(request.url).searchParams.get("phrase");
  if (!phraseId) return fail(400, "falta_frase");

  const row = await env.DB.prepare(
    `SELECT id, wpm, accuracy, errors, duration_ms, data
       FROM ghosts WHERE user_id = ? AND phrase_id = ? AND is_pb = 1`,
  ).bind(user.id, phraseId).first<{
    id: string; wpm: number; accuracy: number; errors: number;
    duration_ms: number; data: ArrayBuffer;
  }>();

  if (!row) return json({ ghost: null });

  // El BLOB viaja en base64: es lo único que sobrevive a JSON sin inventar un
  // segundo endpoint binario para 500 bytes.
  const bytes = new Uint8Array(row.data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);

  return json({
    ghost: {
      id: row.id, wpm: row.wpm, accuracy: row.accuracy,
      errors: row.errors, durationMs: row.duration_ms,
      data: btoa(binary),
    },
  });
}

/** GET /api/ghosts/records?phrase=<id> — récords de la frase. */
export async function phraseRecords(request: Request, env: Env) {
  const phraseId = new URL(request.url).searchParams.get("phrase");
  if (!phraseId) return fail(400, "falta_frase");

  const { results } = await env.DB.prepare(
    `SELECT u.username, g.wpm, g.accuracy, g.created_at
       FROM ghosts g JOIN users u ON u.id = g.user_id
      WHERE g.phrase_id = ? AND g.visibility = 'public' AND g.is_pb = 1
      ORDER BY g.wpm DESC LIMIT 10`,
  ).bind(phraseId).all();

  return json({ rows: results });
}

interface SoloBody {
  phraseId?: unknown;
  charsTyped?: unknown;
  charsTotal?: unknown;
  errors?: unknown;
  durationMs?: unknown;
  ghost?: unknown; // base64 del códec v1
}

/**
 * POST /api/solo/result
 *
 * ponytail: aquí SÍ se confía en el cliente. Una carrera en solitario no tiene
 * servidor autoritativo —montar un Durable Object para una persona sería
 * absurdo—, así que el WPM es declarado. Por eso el resultado del solo
 * alimenta el récord personal y el fantasma, pero NUNCA el ranked ni el Elo.
 * Solo se aplican cotas de plausibilidad para que la tabla no se llene de
 * basura evidente.
 */
export async function soloResult(request: Request, env: Env, user: SessionUser | null) {
  let body: SoloBody;
  try {
    body = (await request.json()) as SoloBody;
  } catch {
    return fail(400, "json_no_valido");
  }

  const phraseId = typeof body.phraseId === "string" ? body.phraseId : null;
  const charsTyped = Number(body.charsTyped);
  const charsTotal = Number(body.charsTotal);
  const errors = Number(body.errors);
  const durationMs = Number(body.durationMs);

  if (!phraseId || ![charsTyped, charsTotal, errors, durationMs].every(Number.isFinite)) {
    return fail(400, "datos_incompletos");
  }

  const phrase = await env.DB.prepare("SELECT id, lang, difficulty, char_len FROM phrases WHERE id = ?")
    .bind(phraseId)
    .first<{ id: string; lang: string; difficulty: string; char_len: number }>();
  if (!phrase) return fail(404, "frase_no_encontrada");

  // Cotas de plausibilidad, no de seguridad.
  if (charsTyped > phrase.char_len || charsTyped < 0) return fail(400, "progreso_imposible");
  if (durationMs < charsTyped * 20) return fail(400, "demasiado_rapido");
  if (durationMs > 30 * 60 * 1000) return fail(400, "demasiado_lento");

  const finished = charsTyped >= phrase.char_len;
  const wpm = finished ? computeWpm(phrase.char_len, durationMs) : 0;
  const accuracy = computeAccuracy(charsTyped, errors);

  if (!user) return json({ saved: false, wpm, accuracy, reason: "invitado" });

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO user_stats (user_id, races, matches, wins, podiums, dnf, best_wpm,
                               sum_wpm, sum_accuracy, chars_typed, time_ms, updated_at)
       VALUES (?1, 1, 0, 0, 0, ?2, ?3, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(user_id) DO UPDATE SET
         races        = user_stats.races + 1,
         dnf          = user_stats.dnf + ?2,
         best_wpm     = MAX(user_stats.best_wpm, ?3),
         sum_wpm      = user_stats.sum_wpm + ?3,
         sum_accuracy = user_stats.sum_accuracy + ?4,
         chars_typed  = user_stats.chars_typed + ?5,
         time_ms      = user_stats.time_ms + ?6,
         updated_at   = ?7`,
    ).bind(user.id, finished ? 0 : 1, wpm, accuracy, charsTyped, durationMs, now),
  ];

  if (finished) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO wpm_board_daily (day, user_id, nickname, best_wpm, races)
         VALUES (?1, ?2, ?3, ?4, 1)
         ON CONFLICT(day, user_id) DO UPDATE SET
           best_wpm = MAX(wpm_board_daily.best_wpm, ?4),
           races    = wpm_board_daily.races + 1`,
      ).bind(utcDay(now), user.id, user.username, wpm),
    );
  }

  await env.DB.batch(stmts);

  // El fantasma solo se guarda si mejora el récord: ux_ghost_pb lo garantiza.
  let ghostSaved = false;
  if (finished && typeof body.ghost === "string" && body.ghost.length > 0) {
    const raw = Uint8Array.from(atob(body.ghost), (c) => c.charCodeAt(0));
    if (raw.byteLength <= MAX_GHOST_BYTES) {
      const res = await env.DB.batch([
        env.DB.prepare(
          "UPDATE ghosts SET is_pb = 0 WHERE user_id = ? AND phrase_id = ? AND is_pb = 1 AND wpm < ?",
        ).bind(user.id, phraseId, wpm),
        env.DB.prepare(
          `INSERT INTO ghosts (id, user_id, phrase_id, lang, difficulty, wpm, accuracy, errors,
                               duration_ms, data, byte_len, is_pb, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12
            WHERE NOT EXISTS (SELECT 1 FROM ghosts WHERE user_id = ?2 AND phrase_id = ?3 AND is_pb = 1)`,
        ).bind(
          ulid(now), user.id, phraseId, phrase.lang, phrase.difficulty,
          wpm, accuracy, errors, durationMs, raw, raw.byteLength, now,
        ),
      ]);
      ghostSaved = (res[1]?.meta?.changes ?? 0) > 0;
    }
  }

  return json({ saved: true, wpm, accuracy, finished, ghostSaved });
}
