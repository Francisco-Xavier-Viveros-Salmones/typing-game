import { describe, expect, test } from "bun:test";
import { CATEGORIES, CATEGORY_RENAME, countWords, phraseKey } from "../../src/shared/phrase-key";

describe("phraseKey", () => {
  test("colapsa mayúsculas y espaciado", () => {
    expect(phraseKey("  El   IMPERIO  Romano ")).toBe("el imperio romano");
  });

  test("acentos compuestos y precompuestos dan la misma clave", () => {
    // "café" con é precompuesta (U+00E9) vs. e + acento combinante (U+0065 U+0301).
    expect(phraseKey("café")).toBe(phraseKey("café"));
  });

  test("frases distintas no colisionan", () => {
    expect(phraseKey("El Imperio romano.")).not.toBe(phraseKey("El Imperio incaico."));
  });

  test("es idempotente", () => {
    const once = phraseKey("  Hola   MUNDO  ");
    expect(phraseKey(once)).toBe(once);
  });
});

describe("countWords", () => {
  test("cuenta palabras, no espacios", () => {
    expect(countWords("El Imperio romano fue posterior.")).toBe(5);
    expect(countWords("  uno   dos  ")).toBe(2);
  });

  test("cadena vacía es 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("renombrado de categorías", () => {
  test("las 4 claves viejas mapean a categorías válidas", () => {
    const mapped = Object.values(CATEGORY_RENAME);
    expect(mapped).toHaveLength(4);
    expect(new Set(mapped).size).toBe(4); // sin colisiones
    for (const c of mapped) expect(CATEGORIES).toContain(c as never);
  });
});
