import { describe, expect, test } from "bun:test";
import {
  decodeGhost, encodeGhost, ghostCharAt, MAX_GHOST_BYTES, type GhostRun,
} from "../../src/shared/ghost";

function runAleatorio(seed: number, chars = 200, errores = 20): GhostRun {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const charTimes: number[] = [];
  let t = 0;
  for (let i = 0; i < chars; i++) {
    t += 40 + Math.floor(next() * 260); // intervalo humano típico
    charTimes.push(t);
  }
  const errors: [number, number][] = Array.from({ length: errores }, () => [
    Math.floor(next() * chars), Math.floor(next() * t),
  ]);
  return { charTimes, errors, durationMs: t };
}

describe("ida y vuelta", () => {
  test("decode(encode(x)) === x en 500 grabaciones aleatorias", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const original = runAleatorio(seed);
      expect(decodeGhost(encodeGhost(original))).toEqual(original);
    }
  });

  test("aguanta una grabación vacía", () => {
    const vacia: GhostRun = { charTimes: [], errors: [], durationMs: 0 };
    expect(decodeGhost(encodeGhost(vacia))).toEqual(vacia);
  });

  test("aguanta pausas largas (varints multibyte)", () => {
    const run: GhostRun = { charTimes: [100, 50_000, 50_100], errors: [], durationMs: 50_100 };
    expect(decodeGhost(encodeGhost(run))).toEqual(run);
  });

  test("rechaza datos truncados en vez de devolver basura", () => {
    const bytes = encodeGhost(runAleatorio(1));
    expect(() => decodeGhost(bytes.slice(0, 8))).toThrow();
    expect(() => decodeGhost(bytes.slice(0, 20))).toThrow();
  });

  test("rechaza una versión desconocida", () => {
    const bytes = encodeGhost(runAleatorio(1));
    bytes[0] = 99;
    expect(() => decodeGhost(bytes)).toThrow();
  });
});

describe("tamaño", () => {
  test("una frase difícil cabe de sobra en el tope", () => {
    const bytes = encodeGhost(runAleatorio(7, 260, 40));
    expect(bytes.length).toBeLessThan(MAX_GHOST_BYTES);
    expect(bytes.length).toBeLessThan(1000); // ~1.6 B por carácter
  });

  test("ninguna grabación normal se acerca al tope", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(encodeGhost(runAleatorio(seed, 300, 50)).length).toBeLessThan(MAX_GHOST_BYTES);
    }
  });
});

describe("ghostCharAt", () => {
  const times = [100, 200, 300, 400, 500];

  test("los extremos son exactos", () => {
    expect(ghostCharAt(times, 0)).toBe(0);
    expect(ghostCharAt(times, -50)).toBe(0);
    expect(ghostCharAt(times, 500)).toBe(times.length);
    expect(ghostCharAt(times, 99999)).toBe(times.length);
  });

  test("interpola entre caracteres, no salta", () => {
    const medio = ghostCharAt(times, 250);
    expect(medio).toBeGreaterThan(2);
    expect(medio).toBeLessThan(3);
  });

  test("nunca decrece", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const run = runAleatorio(seed, 60);
      let prev = -1;
      for (let t = 0; t <= run.durationMs + 500; t += 37) {
        const at = ghostCharAt(run.charTimes, t);
        expect(at).toBeGreaterThanOrEqual(prev);
        expect(Number.isFinite(at)).toBe(true);
        prev = at;
      }
    }
  });

  test("una grabación vacía devuelve 0", () => {
    expect(ghostCharAt([], 1000)).toBe(0);
  });
});
