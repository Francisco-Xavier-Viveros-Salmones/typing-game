import { F1_POINTS } from "./constants";

/**
 * Cómo terminó un jugador una ronda. El orden de la tabla TIER es la regla
 * central: un finisher SIEMPRE va por delante de un no-finisher, sin importar
 * ningún tiempo. Esto es lo que hace imposible el bug 1 (el que abandona se
 * llevaba el oro porque su `time` quedaba en 0 y el desempate era por tiempo
 * ascendente).
 */
export type FinishStatus =
  | "finished"      // completó la frase
  | "timeout"       // se acabó el límite de tiempo
  | "eliminated"    // perdió todas las vidas / muerte súbita
  | "disconnected"  // se cayó la conexión
  | "dnf";          // abandonó voluntariamente

const TIER: Record<FinishStatus, number> = {
  finished: 0,
  timeout: 1,
  eliminated: 2,
  disconnected: 3,
  dnf: 4,
};

export interface RoundEntry {
  /** Posición estable asignada al entrar a la sala. Desempate final: garantiza orden total. */
  slot: number;
  status: FinishStatus;
  /**
   * Milisegundos desde el disparo de salida. `null` para quien no terminó.
   * NUNCA se consulta para un no-finisher: el tier corta antes. Por eso el
   * centinela `time = 0` de la implementación vieja deja de existir.
   */
  finishMs: number | null;
  /** Contador monotónico del servidor al cruzar la meta. Desempata tiempos idénticos (bug 3). */
  finishSeq: number | null;
  /** Caracteres correctos tecleados. Ordena entre los que no terminaron. */
  charsTyped: number;
  /** Contador monotónico al ser eliminado/desconectado. Más alto = aguantó más. */
  exitSeq: number | null;
}

export interface RankedEntry extends RoundEntry {
  rank: number;
  points: number;
}

/** Convierte cualquier cosa en un número finito. La red que hace imposible el NaN del bug 2. */
function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Comparador con orden total garantizado: nunca devuelve 0 para entradas
 * distintas, porque `slot` es único. Un comparador que devuelve 0 para entradas
 * distintas deja el resultado a merced del algoritmo de sort del motor — que es
 * exactamente lo que producía medallas arbitrarias.
 */
export function compareEntries(a: RoundEntry, b: RoundEntry): number {
  const tierDiff = TIER[a.status] - TIER[b.status];
  if (tierDiff !== 0) return tierDiff;

  if (a.status === "finished") {
    // Ambos terminaron: gana el tiempo menor, luego el que cruzó antes.
    const ta = finite(a.finishMs, Number.MAX_SAFE_INTEGER);
    const tb = finite(b.finishMs, Number.MAX_SAFE_INTEGER);
    if (ta !== tb) return ta - tb;

    const sa = finite(a.finishSeq, Number.MAX_SAFE_INTEGER);
    const sb = finite(b.finishSeq, Number.MAX_SAFE_INTEGER);
    if (sa !== sb) return sa - sb;
  } else {
    // Ninguno terminó: gana el que llegó más lejos, luego el que aguantó más.
    const ca = finite(a.charsTyped, 0);
    const cb = finite(b.charsTyped, 0);
    if (ca !== cb) return cb - ca;

    const xa = finite(a.exitSeq, -1);
    const xb = finite(b.exitSeq, -1);
    if (xa !== xb) return xb - xa;
  }

  return a.slot - b.slot;
}

/**
 * Ordena la ronda y reparte puntos F1. Función pura: misma entrada, misma
 * salida, siempre. No muta el array recibido.
 *
 * Solo puntúan los `finished`, igual que la implementación original
 * (`filter(p => !p.disqualified)`), pero ahora el reparto sigue un orden
 * determinista en vez de uno arbitrario.
 */
export function rankRound(entries: readonly RoundEntry[]): RankedEntry[] {
  const sorted = [...entries].sort(compareEntries);

  let scoringIndex = 0;
  return sorted.map((entry, i) => {
    let points = 0;
    if (entry.status === "finished") {
      points = F1_POINTS[scoringIndex] ?? 0;
      scoringIndex++;
    }
    return { ...entry, rank: i + 1, points };
  });
}

/**
 * Total acumulado como SUMA de todas las rondas jugadas, no como `+=`.
 * Volver a puntuar una ronda ya puntuada no puede inflar el marcador (bug 5):
 * el resultado depende solo del historial, no de cuántas veces se llamó.
 */
export function totalPoints(roundsBySlot: readonly (readonly RankedEntry[])[], slot: number): number {
  let sum = 0;
  for (const round of roundsBySlot) {
    for (const entry of round) {
      if (entry.slot === slot) sum += entry.points;
    }
  }
  return sum;
}

export interface Standing {
  slot: number;
  totalPoints: number;
  rank: number;
  /** Puestos ganados respecto a la ronda previa. Positivo = subió. Siempre finito (bug 6). */
  rankDelta: number;
}

/**
 * Clasificación general tras N rondas. `previous` es el standing anterior;
 * en la ronda 1 se pasa `[]` y todos los delta salen 0 — nunca NaN, que es
 * lo que pintaba el cliente cuando `prevPos` venía `undefined`.
 */
export function standings(
  rounds: readonly (readonly RankedEntry[])[],
  previous: readonly Standing[] = [],
): Standing[] {
  const slots = new Set<number>();
  for (const round of rounds) for (const e of round) slots.add(e.slot);

  const lastRound = rounds[rounds.length - 1] ?? [];
  const lastRank = new Map(lastRound.map((e) => [e.slot, e.rank]));
  const prevRank = new Map(previous.map((s) => [s.slot, s.rank]));

  const rows = [...slots]
    .map((slot) => ({ slot, totalPoints: totalPoints(rounds, slot) }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      // Empate a puntos: manda el puesto de la última ronda, luego el slot.
      const ra = lastRank.get(a.slot) ?? Number.MAX_SAFE_INTEGER;
      const rb = lastRank.get(b.slot) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.slot - b.slot;
    });

  return rows.map((row, i) => {
    const rank = i + 1;
    const before = prevRank.get(row.slot);
    return {
      ...row,
      rank,
      rankDelta: before === undefined ? 0 : before - rank,
    };
  });
}
