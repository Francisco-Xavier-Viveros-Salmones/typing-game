import { describe, expect, test } from "bun:test";
import { computeAccuracy, computeWpm } from "../../src/shared/wpm";

describe("computeWpm", () => {
  test("vector conocido: 250 chars en 60s = 50 WPM", () => {
    expect(computeWpm(250, 60_000)).toBe(50);
  });

  test("vector conocido: 100 chars en 30s = 40 WPM", () => {
    expect(computeWpm(100, 30_000)).toBe(40);
  });

  test("duración 0 devuelve 0, no Infinity", () => {
    expect(computeWpm(100, 0)).toBe(0);
    expect(Number.isFinite(computeWpm(100, 0))).toBe(true);
  });

  test("entradas basura devuelven 0, nunca NaN", () => {
    for (const [chars, ms] of [
      [NaN, 1000],
      [100, NaN],
      [Infinity, 1000],
      [100, -500],
      [-100, 1000],
      [0, 0],
    ] as const) {
      const out = computeWpm(chars, ms);
      expect(Number.isFinite(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
    }
  });

  test("crece de forma monótona con los caracteres", () => {
    let prev = -1;
    for (let chars = 0; chars <= 500; chars += 25) {
      const wpm = computeWpm(chars, 60_000);
      expect(wpm).toBeGreaterThanOrEqual(prev);
      prev = wpm;
    }
  });
});

describe("computeAccuracy", () => {
  test("sin errores es 1", () => {
    expect(computeAccuracy(100, 0)).toBe(1);
  });

  test("mitad y mitad es 0.5", () => {
    expect(computeAccuracy(50, 50)).toBe(0.5);
  });

  test("sin pulsaciones es 1", () => {
    expect(computeAccuracy(0, 0)).toBe(1);
  });

  test("siempre queda dentro de [0,1]", () => {
    for (const [c, e] of [
      [100, 0],
      [0, 100],
      [-50, 10],
      [10, -50],
      [NaN, 10],
    ] as const) {
      const acc = computeAccuracy(c, e);
      expect(acc).toBeGreaterThanOrEqual(0);
      expect(acc).toBeLessThanOrEqual(1);
    }
  });
});
