import { describe, expect, test } from "bun:test";
import {
  compareEntries,
  rankRound,
  standings,
  totalPoints,
  type RoundEntry,
} from "../../src/shared/scoring";
import { F1_POINTS } from "../../src/shared/constants";

/** Constructor con defaults, para que cada test solo declare lo que le importa. */
function entry(over: Partial<RoundEntry> & { slot: number }): RoundEntry {
  return {
    status: "finished",
    finishMs: 10_000,
    finishSeq: 1,
    charsTyped: 100,
    exitSeq: null,
    ...over,
  };
}

const finisher = (slot: number, finishMs: number, finishSeq: number) =>
  entry({ slot, status: "finished", finishMs, finishSeq });

describe("bug 1 — el que abandona ya no se lleva el oro", () => {
  // La causa exacta: con "Sin Límite" (timeLimit=0), game.js:229 dejaba
  // timeInSeconds = 0 al descalificar, y el desempate era por tiempo ascendente.
  test("un DNF con finishMs=0 queda por detrás de un finisher lento", () => {
    const ranked = rankRound([
      entry({ slot: 0, status: "dnf", finishMs: 0, finishSeq: null, charsTyped: 3 }),
      finisher(1, 45_000, 1),
    ]);

    expect(ranked[0]!.slot).toBe(1);
    expect(ranked[0]!.points).toBe(25);
    expect(ranked[1]!.slot).toBe(0);
    expect(ranked[1]!.points).toBe(0);
  });

  test("aunque abandonen todos menos uno, el único finisher gana", () => {
    const ranked = rankRound([
      entry({ slot: 0, status: "dnf", finishMs: 0, finishSeq: null, charsTyped: 0 }),
      entry({ slot: 1, status: "dnf", finishMs: 0, finishSeq: null, charsTyped: 0 }),
      finisher(2, 120_000, 1),
    ]);

    expect(ranked[0]!.slot).toBe(2);
  });

  test("ningún status no-finisher puede puntuar", () => {
    const ranked = rankRound([
      entry({ slot: 0, status: "dnf", finishMs: 0, finishSeq: null }),
      entry({ slot: 1, status: "timeout", finishMs: 0, finishSeq: null }),
      entry({ slot: 2, status: "eliminated", finishMs: 0, finishSeq: null }),
      entry({ slot: 3, status: "disconnected", finishMs: 0, finishSeq: null }),
    ]);

    expect(ranked.every((r) => r.points === 0)).toBe(true);
  });
});

describe("bug 2 — eliminados sin tiempo no producen NaN", () => {
  // network.js:248-259 marcaba disqualified sin setear time/wpm; el comparador
  // recibía undefined y devolvía NaN, dejando toda la tabla en orden arbitrario.
  test("finishMs/finishSeq nulos no rompen el orden", () => {
    const ranked = rankRound([
      entry({ slot: 0, status: "eliminated", finishMs: null, finishSeq: null, charsTyped: 40, exitSeq: 2 }),
      finisher(1, 30_000, 1),
      entry({ slot: 2, status: "eliminated", finishMs: null, finishSeq: null, charsTyped: 80, exitSeq: 3 }),
    ]);

    expect(ranked.map((r) => r.slot)).toEqual([1, 2, 0]);
    expect(ranked.every((r) => Number.isFinite(r.rank))).toBe(true);
  });

  test("el comparador nunca devuelve NaN, ni con campos basura", () => {
    const garbage = [
      entry({ slot: 0, finishMs: NaN, finishSeq: NaN, charsTyped: NaN }),
      entry({ slot: 1, finishMs: undefined as never, finishSeq: undefined as never }),
      entry({ slot: 2, status: "eliminated", finishMs: null, finishSeq: null, charsTyped: undefined as never }),
      entry({ slot: 3, finishMs: Infinity, finishSeq: -Infinity }),
    ];

    for (const a of garbage) {
      for (const b of garbage) {
        expect(Number.isFinite(compareEntries(a, b))).toBe(true);
      }
    }
  });

  test("entre no-finishers gana el que llegó más lejos", () => {
    const ranked = rankRound([
      entry({ slot: 0, status: "eliminated", finishMs: null, finishSeq: null, charsTyped: 10, exitSeq: 1 }),
      entry({ slot: 1, status: "eliminated", finishMs: null, finishSeq: null, charsTyped: 90, exitSeq: 2 }),
    ]);

    expect(ranked[0]!.slot).toBe(1);
  });
});

describe("bug 3 — empates deterministas", () => {
  test("tiempos idénticos se desempatan por finishSeq", () => {
    const ranked = rankRound([finisher(0, 20_000, 7), finisher(1, 20_000, 3)]);

    expect(ranked[0]!.slot).toBe(1); // cruzó antes
    expect(ranked[0]!.points).toBe(25);
    expect(ranked[1]!.points).toBe(18);
  });

  test("tiempo y seq idénticos se desempatan por slot", () => {
    const ranked = rankRound([finisher(5, 20_000, 1), finisher(2, 20_000, 1)]);
    expect(ranked.map((r) => r.slot)).toEqual([2, 5]);
  });

  test("el resultado es estable ante cualquier permutación de la entrada", () => {
    const base = [
      finisher(0, 20_000, 1),
      finisher(1, 20_000, 1),
      entry({ slot: 2, status: "dnf", finishMs: null, finishSeq: null, charsTyped: 5, exitSeq: 1 }),
      entry({ slot: 3, status: "dnf", finishMs: null, finishSeq: null, charsTyped: 5, exitSeq: 1 }),
    ];
    const expected = rankRound(base).map((r) => r.slot);

    // Las 24 permutaciones deben dar exactamente el mismo orden.
    const permute = <T>(xs: T[]): T[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
          );

    for (const perm of permute(base)) {
      expect(rankRound(perm).map((r) => r.slot)).toEqual(expected);
    }
  });
});

describe("bug 5 — puntuar dos veces es idempotente", () => {
  // eliminarJugador() volvía a llamar comprobarFinDeCarrera() y hacía
  // totalPoints += ptos otra vez. Ahora el total es una suma del historial.
  test("rankRound es puro: dos llamadas dan el mismo resultado", () => {
    const input = [finisher(0, 10_000, 1), finisher(1, 12_000, 2)];
    expect(rankRound(input)).toEqual(rankRound(input));
  });

  test("no muta la entrada", () => {
    const input = [finisher(0, 10_000, 1), finisher(1, 12_000, 2)];
    const snapshot = structuredClone(input);
    rankRound(input);
    expect(input).toEqual(snapshot);
  });

  test("recalcular el total del historial no lo infla", () => {
    const r1 = rankRound([finisher(0, 10_000, 1), finisher(1, 12_000, 2)]);
    const r2 = rankRound([finisher(0, 11_000, 1), finisher(1, 9_000, 2)]);

    expect(totalPoints([r1, r2], 0)).toBe(25 + 18);
    expect(totalPoints([r1, r2], 0)).toBe(25 + 18); // otra vez, idéntico
    expect(standings([r1, r2])).toEqual(standings([r1, r2]));
  });
});

describe("bug 6 — rankDelta siempre finito", () => {
  test("en la ronda 1 todos los delta son 0, nunca NaN", () => {
    const r1 = rankRound([finisher(0, 10_000, 1), finisher(1, 12_000, 2), finisher(2, 14_000, 3)]);
    const table = standings([r1]);

    expect(table.every((s) => s.rankDelta === 0)).toBe(true);
    expect(table.every((s) => Number.isFinite(s.rankDelta))).toBe(true);
  });

  test("un jugador ausente del standing previo sale con delta 0", () => {
    const r1 = rankRound([finisher(0, 10_000, 1), finisher(1, 12_000, 2)]);
    const previous = standings([r1]);

    const r2 = rankRound([finisher(0, 10_000, 1), finisher(1, 12_000, 2), finisher(9, 5_000, 3)]);
    const table = standings([r1, r2], previous);

    expect(table.find((s) => s.slot === 9)!.rankDelta).toBe(0);
    expect(table.every((s) => Number.isFinite(s.rankDelta))).toBe(true);
  });

  test("el delta refleja el cambio real de puesto", () => {
    const r1 = rankRound([finisher(0, 10_000, 1), finisher(1, 20_000, 2)]);
    const previous = standings([r1]); // slot 0 va 1º, slot 1 va 2º

    // El slot 1 arrasa la ronda 2 y adelanta.
    const r2 = rankRound([finisher(1, 5_000, 1), finisher(0, 60_000, 2)]);
    const table = standings([r1, r2], previous);

    expect(table[0]!.slot).toBe(1);
    expect(table.find((s) => s.slot === 1)!.rankDelta).toBe(1); // subió un puesto
    expect(table.find((s) => s.slot === 0)!.rankDelta).toBe(-1);
  });
});

describe("propiedades sobre entradas aleatorias", () => {
  const STATUSES = ["finished", "timeout", "eliminated", "disconnected", "dnf"] as const;

  function randomRound(seed: number): RoundEntry[] {
    // LCG: aleatorio pero reproducible si un caso falla.
    let s = seed;
    const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const n = 1 + Math.floor(next() * 6);

    return Array.from({ length: n }, (_, slot) => {
      const status = STATUSES[Math.floor(next() * STATUSES.length)]!;
      const done = status === "finished";
      return {
        slot,
        status,
        finishMs: done ? Math.floor(next() * 60_000) : null,
        finishSeq: done ? Math.floor(next() * 10) : null,
        charsTyped: Math.floor(next() * 200),
        exitSeq: done ? null : Math.floor(next() * 10),
      };
    });
  }

  test("la salida es una permutación de la entrada con puestos 1..n", () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const input = randomRound(seed);
      const ranked = rankRound(input);

      expect(ranked.length).toBe(input.length);
      expect(ranked.map((r) => r.rank)).toEqual(input.map((_, i) => i + 1));
      expect([...ranked.map((r) => r.slot)].sort((a, b) => a - b)).toEqual(
        input.map((e) => e.slot).sort((a, b) => a - b),
      );
    }
  });

  test("los finishers siempre preceden a los no-finishers", () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const ranked = rankRound(randomRound(seed));
      const lastFinisher = ranked.findLastIndex((r) => r.status === "finished");
      const firstOther = ranked.findIndex((r) => r.status !== "finished");
      if (lastFinisher !== -1 && firstOther !== -1) {
        expect(lastFinisher).toBeLessThan(firstOther);
      }
    }
  });

  test("los puntos son un prefijo de la tabla F1 y solo van a finishers", () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const ranked = rankRound(randomRound(seed));
      const scored = ranked.filter((r) => r.points > 0);
      const finishers = ranked.filter((r) => r.status === "finished");

      expect(scored.every((r) => r.status === "finished")).toBe(true);
      expect(scored.map((r) => r.points)).toEqual(
        F1_POINTS.slice(0, Math.min(finishers.length, F1_POINTS.length)),
      );
    }
  });

  test("el orden es total: ninguna pareja distinta compara igual", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const input = randomRound(seed);
      for (const a of input) {
        for (const b of input) {
          if (a.slot === b.slot) continue;
          expect(compareEntries(a, b)).not.toBe(0);
          // antisimetría
          expect(Math.sign(compareEntries(a, b))).toBe(-Math.sign(compareEntries(b, a)));
        }
      }
    }
  });
});

describe("casos límite", () => {
  test("ronda vacía", () => {
    expect(rankRound([])).toEqual([]);
    expect(standings([])).toEqual([]);
  });

  test("un solo jugador que termina se lleva 25", () => {
    const ranked = rankRound([finisher(0, 5_000, 1)]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.points).toBe(25);
  });

  test("un solo jugador que abandona no puntúa", () => {
    expect(rankRound([entry({ slot: 0, status: "dnf", finishMs: null, finishSeq: null })])[0]!.points).toBe(0);
  });

  test("más de 6 finishers: el 7º en adelante saca 0", () => {
    const ranked = rankRound(Array.from({ length: 8 }, (_, i) => finisher(i, 1000 * (i + 1), i + 1)));
    expect(ranked.map((r) => r.points)).toEqual([...F1_POINTS, 0, 0]);
  });
});
