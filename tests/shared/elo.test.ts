import { describe, expect, test } from "bun:test";
import {
  computeEloDeltas, kFactor, seasonCarryOver, START_RATING, type EloPlayer,
} from "../../src/shared/elo";

const p = (userId: string, rating: number, rank: number, placementsLeft = 0): EloPlayer =>
  ({ userId, rating, rank, placementsLeft });

describe("kFactor", () => {
  test("las colocaciones mueven mucho más", () => {
    expect(kFactor(1200, 5)).toBe(64);
    expect(kFactor(1200, 0)).toBe(40);
  });

  test("decrece por tramos al subir el rating", () => {
    const ks = [1000, 1700, 2100, 2500].map((r) => kFactor(r, 0));
    expect(ks).toEqual([40, 32, 24, 16]);
    for (let i = 1; i < ks.length; i++) expect(ks[i]!).toBeLessThan(ks[i - 1]!);
  });
});

describe("1v1", () => {
  test("con ratings iguales, ganar suma la mitad de K", () => {
    const [a, b] = computeEloDeltas([p("a", 1200, 1), p("b", 1200, 2)]);
    expect(a!.delta).toBe(20); // K=40, (1 - 0.5) * 40
    expect(b!.delta).toBe(-20);
  });

  test("es simétrico: lo que gana uno lo pierde el otro", () => {
    const [a, b] = computeEloDeltas([p("a", 1500, 1), p("b", 1500, 2)]);
    expect(a!.delta).toBe(-b!.delta);
  });

  test("un empate a igual rating no mueve nada", () => {
    const r = computeEloDeltas([p("a", 1300, 1), p("b", 1300, 1)]);
    expect(r.every((x) => x.delta === 0)).toBe(true);
  });

  test("ganar al favorito da más que ganar al débil", () => {
    const sorpresa = computeEloDeltas([p("a", 1200, 1), p("b", 1900, 2)])[0]!.delta;
    const esperado = computeEloDeltas([p("a", 1200, 1), p("b", 900, 2)])[0]!.delta;
    expect(sorpresa).toBeGreaterThan(esperado);
  });

  test("perder contra alguien muy superior casi no penaliza", () => {
    const d = computeEloDeltas([p("a", 1000, 2), p("b", 2200, 1)])[0]!.delta;
    expect(d).toBeGreaterThan(-5);
  });
});

describe("multijugador", () => {
  test("el delta es monótono en el puesto", () => {
    const r = computeEloDeltas([
      p("a", 1200, 1), p("b", 1200, 2), p("c", 1200, 3),
      p("d", 1200, 4), p("e", 1200, 5), p("f", 1200, 6),
    ]);
    for (let i = 1; i < r.length; i++) {
      expect(r[i]!.delta).toBeLessThan(r[i - 1]!.delta);
    }
  });

  test("la volatilidad de una sala de 6 es comparable a un 1v1", () => {
    // Es lo que compra el /(n-1): K significa lo mismo en cualquier tamaño.
    const uno = computeEloDeltas([p("a", 1200, 1), p("b", 1200, 2)])[0]!.delta;
    const seis = computeEloDeltas(
      Array.from({ length: 6 }, (_, i) => p(`p${i}`, 1200, i + 1)),
    )[0]!.delta;
    expect(Math.abs(seis - uno)).toBeLessThanOrEqual(10);
  });

  test("un empate a seis no mueve a nadie", () => {
    const r = computeEloDeltas(Array.from({ length: 6 }, (_, i) => p(`p${i}`, 1200, 1)));
    expect(r.every((x) => x.delta === 0)).toBe(true);
  });

  test("con un solo jugador no pasa nada", () => {
    expect(computeEloDeltas([p("a", 1200, 1)])[0]!.delta).toBe(0);
  });

  test("con el mismo K la suma solo se desvía por redondeo", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      let s = seed;
      const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const n = 2 + Math.floor(next() * 5);
      // Todos por debajo de 1600 y sin colocaciones => K=40 para todos.
      const players = Array.from({ length: n }, (_, i) =>
        p(`p${i}`, 900 + Math.floor(next() * 600), i + 1));

      const total = computeEloDeltas(players).reduce((acc, x) => acc + x.delta, 0);
      // Cada Δ se redondea a lo sumo 0.5, así que el total no puede pasar de n/2.
      expect(Math.abs(total)).toBeLessThanOrEqual(Math.ceil(n / 2));
    }
  });

  test("con K distintos la suma se desvía, pero acotada", () => {
    // El K por jugador rompe el cero exacto A PROPÓSITO: un novato en
    // colocaciones mueve ±64 contra los ±16 de un veterano, e inyecta puntos.
    // Lo que importa es que no se dispare; el reinicio blando de temporada
    // absorbe la deriva.
    let peor = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      let s = seed;
      const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const n = 2 + Math.floor(next() * 5);
      const players = Array.from({ length: n }, (_, i) =>
        p(`p${i}`, 800 + Math.floor(next() * 1700), i + 1, next() < 0.3 ? 5 : 0));

      const total = computeEloDeltas(players).reduce((acc, x) => acc + x.delta, 0);
      peor = Math.max(peor, Math.abs(total));
    }
    expect(peor).toBeLessThanOrEqual(64); // nunca más que el K más alto
  });

  test("el rating resultante siempre es finito", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      let s = seed;
      const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const n = 2 + Math.floor(next() * 5);
      const r = computeEloDeltas(
        Array.from({ length: n }, (_, i) => p(`p${i}`, 100 + Math.floor(next() * 3000), 1 + Math.floor(next() * n))),
      );
      expect(r.every((x) => Number.isFinite(x.after) && Number.isInteger(x.delta))).toBe(true);
    }
  });
});

describe("cambio de temporada", () => {
  test("comprime hacia la media conservando el orden", () => {
    const antes = [900, 1200, 1600, 2400];
    const despues = antes.map(seasonCarryOver);
    for (let i = 1; i < despues.length; i++) {
      expect(despues[i]!).toBeGreaterThan(despues[i - 1]!);
    }
    expect(seasonCarryOver(START_RATING)).toBe(START_RATING);
  });

  test("acota entre 800 y 2000", () => {
    expect(seasonCarryOver(50)).toBeGreaterThanOrEqual(800);
    expect(seasonCarryOver(9999)).toBeLessThanOrEqual(2000);
  });
});
