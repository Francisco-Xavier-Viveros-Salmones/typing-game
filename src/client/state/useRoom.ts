import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  PlayerView,
  RoomPhase,
  RoomSettings,
  RoundResultView,
  ServerMessage,
  StandingView,
  TickPlayer,
} from "../../shared/protocol";
import { DEFAULT_SETTINGS } from "../../shared/protocol";
import { RaceSocket, type SocketStatus } from "../engine/RaceSocket";

export interface ChatLine {
  id: number;
  slot: number;
  nickname: string;
  color: string;
  text: string;
}

export interface RoundInfo {
  text: string;
  phraseId: string;
  startAt: number;
  round: number;
  totalRounds: number;
  lives: number;
}

export interface RoomModel {
  status: SocketStatus;
  error: string | null;
  roomCode: string;
  mySlot: number;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerView[];
  tick: Map<number, TickPlayer>;
  round: RoundInfo | null;
  results: RoundResultView[];
  standings: StandingView[];
  hasNextRound: boolean;
  chat: ChatLine[];
  serverNow: () => number;
  send: (msg: ClientMessage) => void;
}

/**
 * Puente entre el socket y React.
 *
 * Los `tick` llegan a 15 Hz. Se guardan en estado de React porque a 15 Hz es
 * asumible; lo que NUNCA pasa por React es la posición del caballo cuadro a
 * cuadro — eso se interpola con requestAnimationFrame sobre un ref.
 */
export function useRoom(
  params: { roomCode: string; name: string; create: boolean; ranked?: boolean } | null,
): RoomModel {
  const socketRef = useRef<RaceSocket | null>(null);
  const chatId = useRef(0);

  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState(-1);
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [tick, setTick] = useState<Map<number, TickPlayer>>(new Map());
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [results, setResults] = useState<RoundResultView[]>([]);
  const [standings, setStandings] = useState<StandingView[]>([]);
  const [hasNextRound, setHasNextRound] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);

  useEffect(() => {
    if (!params) return;

    const socket = new RaceSocket({
      roomCode: params.roomCode,
      name: params.name,
      create: params.create,
      ranked: params.ranked,
      onStatus: (s, detail) => {
        setStatus(s);
        if (s === "error") setError("No se pudo conectar con la sala.");
        if (s === "closed" && detail) setError(detail);
      },
      onMessage: (msg: ServerMessage) => {
        switch (msg.t) {
          case "welcome":
            setMySlot(msg.you.slot);
            setPhase(msg.phase);
            setSettings(msg.settings);
            setPlayers(msg.players);
            setError(null);
            break;
          case "players":
            setPlayers(msg.players);
            break;
          case "settings":
            setSettings(msg.settings);
            break;
          case "countdown":
            setPhase("countdown");
            setSettings(msg.settings);
            setResults([]);
            setTick(new Map());
            setRound({
              text: msg.text,
              phraseId: msg.phraseId,
              startAt: msg.startAt,
              round: msg.round,
              totalRounds: msg.totalRounds,
              lives: msg.lives,
            });
            break;
          case "tick":
            setPhase((p) => (p === "countdown" ? "running" : p));
            setTick(new Map(msg.players.map((p) => [p.slot, p])));
            break;
          case "roundEnd":
            setPhase(msg.hasNextRound ? "intermission" : "ended");
            setResults(msg.results);
            setStandings(msg.standings);
            setHasNextRound(msg.hasNextRound);
            break;
          case "chat":
            setChat((prev) => [
              ...prev.slice(-99),
              {
                id: chatId.current++,
                slot: msg.slot,
                nickname: msg.nickname,
                color: msg.color,
                text: msg.text,
              },
            ]);
            break;
          case "error":
            setError(msg.message);
            break;
          case "roomClosed":
            setError(`Sala cerrada: ${msg.reason}`);
            break;
        }
      },
    });

    socketRef.current = socket;
    socket.connect();
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [params?.roomCode, params?.name, params?.create, params?.ranked]);

  const send = useCallback((msg: ClientMessage) => socketRef.current?.send(msg), []);
  const serverNow = useCallback(() => socketRef.current?.serverNow() ?? Date.now(), []);

  return {
    status, error, roomCode: params?.roomCode ?? "", mySlot, phase, settings,
    players, tick, round, results, standings, hasNextRound, chat, serverNow, send,
  };
}
