import {
  CATEGORIES,
  DIFFICULTIES,
  LANGS,
  type Category,
  type Difficulty,
  type Lang,
} from "../../shared/phrase-key";
import type { Env } from "../index";

/** Cuántas candidatas se traen antes de elegir una al azar en JS. */
const SAMPLE_SIZE = 50;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

interface PhraseRow {
  id: string;
  text: string;
  lang: Lang;
  category: Category;
  difficulty: Difficulty;
  char_len: number;
}

/**
 * GET /api/phrases/random?lang=&category=&difficulty=&exclude=id,id
 *
 * Se muestrean las SAMPLE_SIZE menos usadas del cubo y se elige una al azar,
 * en vez de ORDER BY RANDOM(): eso escanearía la tabla entera, y con 100
 * frases nuevas al día deja de ser gratis rápido. De paso, ordenar por
 * times_used reparte el desgaste y evita que las frases viejas monopolicen.
 */
export async function randomPhrase(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const lang = pick(url.searchParams.get("lang"), LANGS, "es");
  const category = pick(url.searchParams.get("category"), CATEGORIES, "historia");
  const difficulty = pick(url.searchParams.get("difficulty"), DIFFICULTIES, "normal");

  // Ids que el cliente ya usó en este torneo, para no repetir.
  const exclude = new Set(
    (url.searchParams.get("exclude") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50),
  );

  const { results } = await env.DB.prepare(
    `SELECT id, text, lang, category, difficulty, char_len
       FROM phrases
      WHERE lang = ? AND category = ? AND difficulty = ? AND active = 1
      ORDER BY times_used ASC
      LIMIT ?`,
  )
    .bind(lang, category, difficulty, SAMPLE_SIZE)
    .all<PhraseRow>();

  if (results.length === 0) {
    return Response.json(
      { error: "no_phrases", lang, category, difficulty },
      { status: 404 },
    );
  }

  // Si excluir todo lo dejaría vacío, se ignora la exclusión antes que fallar.
  const fresh = results.filter((r) => !exclude.has(r.id));
  const pool = fresh.length > 0 ? fresh : results;
  const chosen = pool[Math.floor(Math.random() * pool.length)]!;

  // No bloquea la respuesta: el contador es una heurística de reparto,
  // perderlo alguna vez no rompe nada.
  ctx.waitUntil(
    env.DB.prepare("UPDATE phrases SET times_used = times_used + 1 WHERE id = ?")
      .bind(chosen.id)
      .run(),
  );

  return Response.json(chosen, {
    headers: { "cache-control": "no-store" },
  });
}
