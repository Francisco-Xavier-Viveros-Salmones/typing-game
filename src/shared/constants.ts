/** Puntos estilo F1 por puesto en la ronda. Índice 0 = 1er puesto. */
export const F1_POINTS: readonly number[] = [25, 18, 15, 12, 10, 8];

export const MAX_PLAYERS = 6;

export const LIVES_BY_DIFFICULTY: Record<string, number> = {
  facil: 1,
  normal: 3,
  dificil: 5,
};

/** Techo físico de tecleo: ~600 WPM. Cota anti-speedhack de la fase 4. */
export const MIN_MS_PER_CHAR = 20;

export const MAX_CHAT_LENGTH = 200;
export const MAX_NICKNAME_LENGTH = 15;
