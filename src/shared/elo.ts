/**
 * Elo por pares, normalizado por número de rivales.
 *
 * Para cada jugador i con rating Ri y puesto final ri entre n:
 *   S_ij = 1 si ri < rj ; 0.5 si empatan ; 0 si no
 *   E_ij = 1 / (1 + 10^((Rj - Ri) / 400))
 *   Δi   = round( Ki / (n-1) * Σ_{j≠i} (S_ij - E_ij) )
 *
 * Frente a "rating contra el promedio del campo", por pares premia
 * correctamente ganarle al único fuerte de un lobby de débiles. Frente a
 * TrueSkill: TrueSkill calibra mejor, pero necesita μ/σ y un factor-graph, y es
 * opaco para el jugador ("¿por qué bajé si gané?"). Para 6 jugadores esto son
 * 25 líneas y se testea trivialmente.
 *
 * El /(n-1) mantiene la volatilidad de una partida de 6 comparable a un 1v1,
 * así que K significa lo mismo en cualquier tamaño de sala.
 *
 * La entrada es el PUESTO y nada más. Nada de ponderar por margen de WPM:
 * invita al sandbagging y vuelve el número inexplicable.
 */

export const START_RATING = 1200;
export const PLACEMENT_MATCHES = 10;
export const MIN_RANKED_PLAYERS = 3;

export interface EloPlayer {
  userId: string;
  rating: number;
  /** Puesto final, 1 = primero. Los empates comparten número. */
  rank: number;
  /** Partidas de colocación que le quedan. > 0 => K alto y fuera de la tabla. */
  placementsLeft: number;
}

export interface EloResult extends EloPlayer {
  delta: number;
  after: number;
  k: number;
}

export function kFactor(rating: number, placementsLeft: number): number {
  if (placementsLeft > 0) return 64;
  if (rating < 1600) return 40;
  if (rating < 2000) return 32;
  if (rating < 2400) return 24;
  return 16;
}

function expected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export function computeEloDeltas(players: readonly EloPlayer[]): EloResult[] {
  const n = players.length;

  // Con un solo jugador no hay contra quién medirse.
  if (n < 2) {
    return players.map((p) => ({ ...p, delta: 0, after: p.rating, k: kFactor(p.rating, p.placementsLeft) }));
  }

  return players.map((p) => {
    const k = kFactor(p.rating, p.placementsLeft);

    let sum = 0;
    for (const rival of players) {
      if (rival.userId === p.userId) continue;
      const actual = p.rank < rival.rank ? 1 : p.rank === rival.rank ? 0.5 : 0;
      sum += actual - expected(p.rating, rival.rating);
    }

    const delta = Math.round((k / (n - 1)) * sum);
    return { ...p, delta, after: p.rating + delta, k };
  });
}

/**
 * Rating de arranque de la temporada siguiente: se comprime hacia la media y
 * se acota. Un reinicio blando mantiene el orden relativo pero devuelve la
 * temporada a un rango jugable, y absorbe la inflación que produce tener un K
 * distinto por jugador.
 */
export function seasonCarryOver(rating: number): number {
  const compressed = Math.round(START_RATING + (rating - START_RATING) * 0.5);
  return Math.min(2000, Math.max(800, compressed));
}
