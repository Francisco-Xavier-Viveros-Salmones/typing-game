/**
 * Convierte las 102 frases hardcodeadas de db/seed/texts.js en una migración SQL.
 *
 * Se ejecuta a mano (`bun run seed:generate`), no en cada build: el resultado es
 * una migración versionada que debe ser estable. Si se regenerase sola, cualquier
 * cambio en texts.js reescribiría una migración ya aplicada en producción.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { textDatabase } from "../db/seed/texts.js";
import { CATEGORY_RENAME, countWords, phraseKey } from "../src/shared/phrase-key";

const OUT = "db/migrations/0002_seed_phrases.sql";
// Fecha fija: la migración debe producir el mismo SQL cada vez que se genere.
const CREATED_AT = Date.parse("2026-08-30T00:00:00Z");

/** ULID determinista derivado del hash, para que regenerar no cambie los ids. */
function idFrom(hash: string): string {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
  let out = "";
  for (let i = 0; i < 26; i++) {
    out += ALPHABET[parseInt(hash.slice(i * 2, i * 2 + 2), 16) % 32];
  }
  return out;
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

const rows: string[] = [];
const seen = new Set<string>();
let skipped = 0;

for (const [lang, byCategory] of Object.entries(textDatabase as Record<string, any>)) {
  for (const [oldCategory, byDifficulty] of Object.entries(byCategory as Record<string, any>)) {
    const category = CATEGORY_RENAME[oldCategory];
    if (!category) throw new Error(`Categoría desconocida: ${oldCategory}`);

    for (const [difficulty, phrases] of Object.entries(byDifficulty as Record<string, string[]>)) {
      for (const text of phrases) {
        const key = phraseKey(text);
        const hash = createHash("sha256").update(key, "utf8").digest("hex");

        // El índice único de D1 rechazaría el duplicado; mejor detectarlo aquí.
        if (seen.has(hash)) {
          console.warn(`duplicado omitido [${lang}/${category}/${difficulty}]: ${text.slice(0, 50)}...`);
          skipped++;
          continue;
        }
        seen.add(hash);

        rows.push(
          `  (${sqlStr(idFrom(hash))}, ${sqlStr(lang)}, ${sqlStr(category)}, ${sqlStr(difficulty)}, ` +
            `${sqlStr(text)}, ${sqlStr(hash)}, ${text.length}, ${countWords(text)}, 'seed', 1, 0, 0, ${CREATED_AT})`,
        );
      }
    }
  }
}

const sql = `-- GENERADO por scripts/generate-seed.ts — no editar a mano.
-- ${rows.length} frases del corpus original, con las categorías ya renombradas.
-- Marcadas source='seed' y active=1: el juego funciona desde el día cero, aunque
-- el cron de Gemini nunca llegue a correr.

INSERT INTO phrases
  (id, lang, category, difficulty, text, text_hash, char_len, word_count, source, active, needs_review, times_used, created_at)
VALUES
${rows.join(",\n")};
`;

writeFileSync(OUT, sql);
console.log(`${OUT}: ${rows.length} frases${skipped ? `, ${skipped} duplicadas omitidas` : ""}`);
