/**
 * Reglas de tecleo como reducer puro.
 *
 * Esta es la pieza que hace confiable el modelo cliente-predice / servidor-manda:
 * el mismo `applyEvent` corre en el navegador (para feedback instantáneo) y en
 * el Durable Object (que es quien decide de verdad). Al ser determinista, ambos
 * llegan al mismo estado desde el mismo log de eventos, y una divergencia solo
 * puede venir de pérdida de paquetes — nunca de que las reglas difieran.
 *
 * Sin DOM, sin Date.now(): el tiempo entra siempre como parámetro.
 */

export type KeyCode = number;
/** Cualquier code >= 0 es "carácter correcto". Estos dos son los especiales. */
export const KEY_WRONG: KeyCode = -1;
export const KEY_BACKSPACE: KeyCode = -2;

export type TypingMode = "normal" | "sudden_death" | "vidas";
export type RunState = "normal" | "nitro" | "tripped";

export interface TypingConfig {
  text: string;
  mode: TypingMode;
  /** Solo se usa en modo 'vidas'. */
  lives: number;
}

export interface TypingState {
  index: number;
  errors: number;
  /** Errores dentro de la palabra actual: a los 3 se tropieza. */
  errorsInWord: number;
  /** Palabras limpias seguidas: a las 3 entra el nitro. */
  streak: number;
  mistakeInWord: boolean;
  lives: number;
  state: RunState;
  /** Momento (ms de ronda) en que termina el tropiezo. null si no está tropezado. */
  trippedUntil: number | null;
  done: boolean;
  /** Motivo del fin. null mientras corre. */
  outcome: "finished" | "eliminated" | null;
}

export const STREAK_FOR_NITRO = 3;
export const ERRORS_FOR_TRIP = 3;
export const TRIP_DURATION_MS = 1000;

export function initialState(config: TypingConfig): TypingState {
  return {
    index: 0,
    errors: 0,
    errorsInWord: 0,
    streak: 0,
    mistakeInWord: false,
    lives: config.mode === "vidas" ? config.lives : 0,
    state: "normal",
    trippedUntil: null,
    done: false,
    outcome: null,
  };
}

export interface KeyEvent {
  /** Milisegundos desde el disparo de salida. Nunca un reloj absoluto. */
  at: number;
  code: KeyCode;
}

/**
 * Aplica un evento y devuelve el estado nuevo. No muta la entrada, para que el
 * cliente pueda guardar estados intermedios y reconciliar contra el servidor.
 */
export function applyEvent(
  config: TypingConfig,
  prev: TypingState,
  event: KeyEvent,
): TypingState {
  if (prev.done) return prev;

  // Salir del tropiezo es cuestión de tiempo, no de teclas: se comprueba en
  // cada evento en vez de con un temporizador, que no sería determinista.
  let s: TypingState =
    prev.trippedUntil !== null && event.at >= prev.trippedUntil
      ? { ...prev, trippedUntil: null, state: "normal", errorsInWord: 0 }
      : { ...prev };

  // Mientras dura el tropiezo las pulsaciones se descartan por completo: no
  // avanzan ni cuentan como error. Antes seguían contando y una sola errata
  // encadenaba decenas de errores.
  if (s.trippedUntil !== null) return s;

  if (event.code === KEY_BACKSPACE) return s; // no se puede retroceder, por diseño

  const expected = config.text[s.index];
  if (expected === undefined) return s;

  const correct = event.code >= 0 && config.text.codePointAt(s.index) === event.code;

  if (correct) {
    const isWordEnd = expected === " " || s.index === config.text.length - 1;

    s.index += 1;

    if (isWordEnd) {
      s.errorsInWord = 0;
      if (!s.mistakeInWord) {
        s.streak += 1;
        if (s.streak >= STREAK_FOR_NITRO) s.state = "nitro";
      }
      s.mistakeInWord = false;
    }

    if (s.index >= config.text.length) {
      s.done = true;
      s.outcome = "finished";
    }
    return s;
  }

  // --- error ---
  if (config.mode === "sudden_death") {
    s.errors += 1;
    s.done = true;
    s.outcome = "eliminated";
    return s;
  }

  s.errors += 1;
  s.errorsInWord += 1;
  s.streak = 0;
  s.mistakeInWord = true;
  if (s.state === "nitro") s.state = "normal";

  if (config.mode === "vidas") {
    s.lives -= 1;
    if (s.lives <= 0) {
      s.lives = 0;
      s.done = true;
      s.outcome = "eliminated";
    }
    return s; // en modo vidas no se tropieza: la penalización ya es la vida
  }

  if (s.errorsInWord >= ERRORS_FOR_TRIP) {
    s.trippedUntil = event.at + TRIP_DURATION_MS;
    s.state = "tripped";
  }

  return s;
}

/** Reproduce un log entero. Es la vía del servidor para recalcular sin confiar en nadie. */
export function replay(config: TypingConfig, events: readonly KeyEvent[]): TypingState {
  let state = initialState(config);
  for (const event of events) state = applyEvent(config, state, event);
  return state;
}

export function progressPercent(state: TypingState, text: string): number {
  if (text.length === 0) return 0;
  return Math.min(100, (state.index / text.length) * 100);
}
