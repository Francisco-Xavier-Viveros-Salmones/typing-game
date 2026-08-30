/**
 * Clave canónica de una frase para deduplicar.
 * Dos frases que solo difieran en mayúsculas, acentos compuestos vs. precompuestos,
 * o espaciado, colapsan a la misma clave — y el índice único de D1 rechaza la segunda.
 *
 * El hash se calcula fuera (node:crypto en el seed, WebCrypto en el Worker):
 * esta función es síncrona y pura para poder testearla sin plataforma.
 */
export function phraseKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  const t = phraseKey(text);
  return t.length === 0 ? 0 : t.split(" ").length;
}

/** Mapa de las claves viejas a las que ya usaban las etiquetas de la UI. */
export const CATEGORY_RENAME: Record<string, string> = {
  quotes: "historia",
  jokes: "ciencia",
  code: "tecnologia",
  tongue: "geografia",
};

export const CATEGORIES = ["historia", "ciencia", "tecnologia", "geografia"] as const;
export const LANGS = ["es", "en"] as const;
export const DIFFICULTIES = ["facil", "normal", "dificil"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Lang = (typeof LANGS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
