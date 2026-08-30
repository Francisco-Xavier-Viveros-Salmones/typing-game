import { describe, expect, test } from "bun:test";
import {
  MIN_PASSWORD_LENGTH,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "../../src/shared/auth-validate";
import { roomCode, ulid } from "../../src/shared/ids";

describe("normalizeUsername", () => {
  test("mayúsculas y espacios no crean cuentas distintas", () => {
    expect(normalizeUsername("  PakoFX  ")).toBe("pakofx");
    expect(normalizeUsername("PAKOFX")).toBe(normalizeUsername("pakofx"));
  });

  test("las dos formas Unicode del mismo nombre colapsan", () => {
    // "Jesús" precompuesta vs. u + acento combinante.
    expect(normalizeUsername("Jesús")).toBe(normalizeUsername("Jesús"));
  });
});

describe("validateUsername", () => {
  test("acepta un nombre normal y con acentos", () => {
    expect(validateUsername("JineteVeloz").ok).toBe(true);
    expect(validateUsername("Ni_o-Ñandú").ok).toBe(true);
  });

  test("rechaza demasiado corto o demasiado largo", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("x".repeat(16)).ok).toBe(false);
  });

  test("rechaza espacios y caracteres raros", () => {
    for (const bad of ["con espacio", "punto.com", "arroba@x", "barra/x", "emoji🐴"]) {
      expect(validateUsername(bad).ok).toBe(false);
    }
  });

  test("rechaza no-strings y vacío", () => {
    for (const bad of [null, undefined, 42, {}, "", "   "]) {
      expect(validateUsername(bad).ok).toBe(false);
    }
  });
});

describe("validatePassword", () => {
  test("acepta una contraseña razonable", () => {
    expect(validatePassword("caballo-verde-42").ok).toBe(true);
  });

  test("rechaza por debajo del mínimo", () => {
    expect(validatePassword("x".repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
    expect(validatePassword("x".repeat(MIN_PASSWORD_LENGTH) + "abc").ok).toBe(true);
  });

  test("rechaza las comunes", () => {
    for (const bad of ["password123", "contraseña", "qwertyuiop", "1234567890"]) {
      expect(validatePassword(bad).ok).toBe(false);
    }
  });

  test("rechaza la que contiene el propio usuario", () => {
    expect(validatePassword("pakofx-es-mi-clave", "PakoFX").ok).toBe(false);
    // Un usuario de menos de 3 letras no dispara la regla (demasiados falsos positivos).
    expect(validatePassword("ab-clave-larga-99", "ab").ok).toBe(true);
  });

  test("rechaza poca variedad aunque sea larga", () => {
    expect(validatePassword("aaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(validatePassword("ababababababab").ok).toBe(false);
  });

  test("rechaza una contraseña absurdamente larga (coste de PBKDF2)", () => {
    expect(validatePassword("x".repeat(5000)).ok).toBe(false);
  });

  test("todo rechazo trae un mensaje para el usuario", () => {
    const r = validatePassword("corta");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
});

describe("ulid", () => {
  test("mide 26 caracteres de Crockford base32", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("ordena por tiempo", () => {
    const antes = ulid(1_000_000);
    const despues = ulid(2_000_000);
    expect(antes < despues).toBe(true);
  });

  test("no colisiona en 20k tiradas del mismo milisegundo", () => {
    const seen = new Set(Array.from({ length: 20_000 }, () => ulid(1_700_000_000_000)));
    expect(seen.size).toBe(20_000);
  });
});

describe("roomCode", () => {
  test("6 caracteres, sin los que se dictan mal", () => {
    for (let i = 0; i < 1000; i++) {
      const code = roomCode();
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[O0I1L]/);
    }
  });
});
