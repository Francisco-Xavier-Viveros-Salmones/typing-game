import type { FinishStatus } from "./scoring";
import type { RunState, TypingMode } from "./typing-rules";

/**
 * Protocolo del Durable Object. Sustituye por completo al de PeerJS.
 *
 * El cambio de fondo: el cliente ya NO reporta resultados (`wpm`, `time`,
 * `finished`, `disqualified`, `LOSE_LIFE`). Reporta **pulsaciones**, y el
 * servidor deriva todo lo demás. Esa inversión es la que elimina de raíz los
 * bugs de ganador y cierra el agujero de confianza de LOSE_LIFE.
 */

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS_PER_ROOM = 6;

// ---------------------------------------------------------------- ajustes

export interface RoomSettings {
  totalRounds: number;
  timeLimitSeconds: number; // 0 = sin límite
  lang: "es" | "en";
  category: string;
  difficulty: "facil" | "normal" | "dificil";
  mode: TypingMode;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  totalRounds: 3,
  timeLimitSeconds: 0,
  lang: "es",
  category: "historia",
  difficulty: "normal",
  mode: "normal",
};

export type RoomPhase = "lobby" | "countdown" | "running" | "scoring" | "intermission" | "ended";

export interface PlayerView {
  slot: number;
  nickname: string;
  color: string;
  isOwner: boolean;
  isGuest: boolean;
  isReady: boolean;
  connected: boolean;
  totalPoints: number;
}

// ------------------------------------------------------- cliente → servidor

export type ClientMessage =
  | { t: "ping"; n: number; tc: number }
  | { t: "setName"; name: string }
  | { t: "setColor"; color: string }
  | { t: "ready"; ready: boolean }
  | { t: "settings"; settings: Partial<RoomSettings> }
  | { t: "start" }
  /**
   * El mensaje central. `ev` es una lista plana [dt, code, dt, code, ...]:
   * dt en ms desde el evento anterior, code >= 0 es el punto de código tecleado,
   * -1 error, -2 backspace. El servidor ya tiene la frase; no necesita los
   * caracteres reales para saber si acertaste.
   */
  | { t: "keys"; n: number; ev: number[] }
  | { t: "chat"; text: string }
  | { t: "leave" };

// ------------------------------------------------------- servidor → cliente

export interface RoundResultView {
  slot: number;
  nickname: string;
  status: FinishStatus;
  rank: number;
  points: number;
  /** null si no terminó. El cliente muestra la etiqueta del status, nunca un 0. */
  finishMs: number | null;
  wpm: number;
  accuracy: number;
  errors: number;
  charsTyped: number;
}

export interface StandingView {
  slot: number;
  nickname: string;
  rank: number;
  totalPoints: number;
  rankDelta: number;
}

export interface TickPlayer {
  slot: number;
  index: number;
  state: RunState;
  lives: number;
  streak: number;
  done: boolean;
}

export type ServerMessage =
  | {
      t: "welcome";
      version: number;
      you: { slot: number; userId: string | null };
      roomCode: string;
      phase: RoomPhase;
      settings: RoomSettings;
      players: PlayerView[];
      round: number;
      serverTime: number;
    }
  | { t: "pong"; n: number; tc: number; ts: number }
  | { t: "players"; players: PlayerView[] }
  | { t: "settings"; settings: RoomSettings }
  | {
      t: "countdown";
      /** Instante absoluto del RELOJ DEL SERVIDOR en que se abre la salida. */
      startAt: number;
      serverTime: number;
      text: string;
      phraseId: string;
      round: number;
      totalRounds: number;
      lives: number;
      settings: RoomSettings;
    }
  | { t: "tick"; ts: number; players: TickPlayer[] }
  | { t: "finished"; slot: number; rank: number; finishMs: number; wpm: number }
  | {
      t: "roundEnd";
      round: number;
      results: RoundResultView[];
      standings: StandingView[];
      hasNextRound: boolean;
      totalRounds: number;
    }
  | { t: "chat"; slot: number; nickname: string; color: string; text: string; ts: number }
  /** Reconciliación: solo se manda si el servidor y la predicción divergen. */
  | { t: "correction"; index: number; errors: number; lives: number; state: RunState }
  | { t: "error"; code: string; message: string }
  | { t: "roomClosed"; reason: string };

// ---------------------------------------------------------------- validación

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const MAX_KEY_EVENTS_PER_FRAME = 128;

/**
 * Valida un mensaje entrante. El DO trata todo lo que llega por el socket como
 * hostil: un cliente puede mandar cualquier cosa, incluso sin ser malicioso
 * (versión vieja, extensión, proxy que trunca).
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > 8192) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;

  switch (data.t) {
    case "ping":
      return typeof data.n === "number" && typeof data.tc === "number"
        ? { t: "ping", n: data.n, tc: data.tc }
        : null;

    case "setName":
      return typeof data.name === "string" ? { t: "setName", name: data.name } : null;

    case "setColor":
      return typeof data.color === "string" && data.color.length <= 64
        ? { t: "setColor", color: data.color }
        : null;

    case "ready":
      return typeof data.ready === "boolean" ? { t: "ready", ready: data.ready } : null;

    case "settings":
      return isObj(data.settings) ? { t: "settings", settings: data.settings } : null;

    case "start":
      return { t: "start" };

    case "keys": {
      if (typeof data.n !== "number" || !Array.isArray(data.ev)) return null;
      // Pares [dt, code]: longitud impar significa mensaje corrupto.
      if (data.ev.length % 2 !== 0) return null;
      if (data.ev.length > MAX_KEY_EVENTS_PER_FRAME * 2) return null;
      if (!data.ev.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
      return { t: "keys", n: data.n, ev: data.ev as number[] };
    }

    case "chat":
      return typeof data.text === "string" ? { t: "chat", text: data.text } : null;

    case "leave":
      return { t: "leave" };

    default:
      return null;
  }
}

/** Convierte el formato de cable [dt, code, ...] a eventos con tiempo absoluto de ronda. */
export function decodeKeyEvents(ev: number[], baseMs: number): { at: number; code: number }[] {
  const out: { at: number; code: number }[] = [];
  let at = baseMs;
  for (let i = 0; i < ev.length; i += 2) {
    // dt negativo retrocedería el reloj de ronda: se aplana a 0.
    at += Math.max(0, ev[i]!);
    out.push({ at, code: Math.trunc(ev[i + 1]!) });
  }
  return out;
}
