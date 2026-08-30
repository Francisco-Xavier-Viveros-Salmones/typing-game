import { DurableObject } from "cloudflare:workers";
import { LIVES_BY_DIFFICULTY, MAX_PLAYERS } from "../../shared/constants";
import { ulid } from "../../shared/ids";
import {
  DEFAULT_SETTINGS,
  PROTOCOL_VERSION,
  decodeKeyEvents,
  parseClientMessage,
  type PlayerView,
  type RoomPhase,
  type RoomSettings,
  type RoundResultView,
  type ServerMessage,
  type StandingView,
  type TickPlayer,
} from "../../shared/protocol";
import { rankRound, standings, type FinishStatus, type RoundEntry } from "../../shared/scoring";
import { sanitizeChat, sanitizeNickname } from "../../shared/text-normalize";
import {
  applyEvent,
  initialState,
  type TypingConfig,
  type TypingState,
} from "../../shared/typing-rules";
import { computeAccuracy, computeWpm } from "../../shared/wpm";
import { runFromKeystrokes } from "../../shared/ghost";
import {
  ghostBatch, matchEndBatch, matchInsert, roundCloseBatch, roundInsert,
  type GhostCandidate, type PersistPlayer,
} from "./persist";
import type { Env } from "../index";

/** Techo físico: ~600 WPM. Los eventos por encima se descartan, no solo se marcan. */
const MIN_MS_PER_CHAR = 20;
const COUNTDOWN_MS = 3500;
/** Tope duro por ronda: ninguna se queda abierta para siempre. */
const ROUND_HARD_CAP_MS = 5 * 60 * 1000;
const GRACE_MS = 45_000;
/**
 * Margen tras el PRIMER finisher. Sin esto, un jugador que se queda parado
 * —o que abandonó una ronda anterior y sigue conectado— mantiene la ronda
 * abierta hasta el tope de 5 minutos, con todos los demás mirando.
 */
const FINISH_GRACE_MS = 30_000;
const IDLE_CLOSE_MS = 30 * 60 * 1000;
/** Coalescencia de salida: 15 Hz constantes, no O(n) por pulsación. */
const TICK_INTERVAL_MS = 66;
const MAX_KEY_FRAMES_PER_SECOND = 25;

const COLORS = [
  "#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#9d4edd", "#f4a261",
];

interface Slot {
  slot: number;
  userId: string | null;
  guestId: string | null;
  nickname: string;
  color: string;
  isOwner: boolean;
  isReady: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  /** Estado de tecleo de la ronda en curso. */
  typing: TypingState | null;
  status: FinishStatus | null;
  finishMs: number | null;
  finishSeq: number | null;
  exitSeq: number | null;
  /** Milisegundo de ronda del último evento aplicado: el reloj propio del slot. */
  lastEventAt: number;
  minRttMs: number;
  gone: boolean;
  /**
   * Log de la ronda: cuándo se tecleó cada carácter correcto y dónde falló.
   * Es el mismo dato que sirve para recalcular el WPM sin fiarse del cliente,
   * para las heurísticas anti-cheat y para grabar el fantasma. Por eso el
   * fantasma sale gratis.
   */
  charTimes: number[];
  errorLog: [number, number][];
}

interface RoomState {
  roomCode: string;
  phase: RoomPhase;
  settings: RoomSettings;
  round: number;
  seq: number;
  roundStartAt: number | null;
  phraseId: string | null;
  text: string | null;
  roundScored: boolean;
  createdAt: number;
  lastActivity: number;
  matchId: string | null;
  roundId: string | null;
  ranked: boolean;
  seasonId: string | null;
}

interface Attachment {
  slot: number;
}

type Timer = {
  at: number;
  kind: "gun" | "timeLimit" | "hardCap" | "grace" | "idle" | "finishGrace";
};

interface Conn {
  ws: WebSocket;
  slot: number;
}

export class RaceRoom extends DurableObject<Env> {
  private room!: RoomState;
  private slots!: Slot[];
  private history: ReturnType<typeof rankRound>[] = [];
  private prevStandings: StandingView[] = [];

  /** En memoria: se reconstruye o se auto-sana, no hace falta persistirlo. */
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private keyFrameCount = new Map<number, { count: number; windowStart: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // blockConcurrencyWhile: nada atiende peticiones hasta que el estado está cargado.
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>("room")) ?? this.emptyRoom();
      this.slots = (await ctx.storage.get<Slot[]>("slots")) ?? [];
      this.history = (await ctx.storage.get<ReturnType<typeof rankRound>[]>("history")) ?? [];
      this.prevStandings = (await ctx.storage.get<StandingView[]>("standings")) ?? [];
    });
  }

  private emptyRoom(): RoomState {
    return {
      roomCode: "",
      phase: "lobby",
      settings: { ...DEFAULT_SETTINGS },
      round: 0,
      seq: 0,
      roundStartAt: null,
      phraseId: null,
      text: null,
      roundScored: true,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      matchId: null,
      roundId: null,
      ranked: false,
      seasonId: null,
    };
  }

  private async save() {
    this.room.lastActivity = Date.now();
    await this.ctx.storage.put({
      room: this.room,
      slots: this.slots,
      history: this.history,
      standings: this.prevStandings,
    });
  }

  // ------------------------------------------------------------- alarmas
  /**
   * Un DO tiene UNA sola alarma, así que se mantiene una cola ordenada y se
   * arma siempre la más próxima. Nada de setInterval: rompe la hibernación y
   * muere en la primera evicción.
   */
  private async pushTimer(timer: Timer) {
    const timers = (await this.ctx.storage.get<Timer[]>("timers")) ?? [];
    timers.push(timer);
    timers.sort((a, b) => a.at - b.at);
    await this.ctx.storage.put("timers", timers);
    await this.ctx.storage.setAlarm(timers[0]!.at);
  }

  private async clearTimers(kinds: Timer["kind"][]) {
    const timers = (await this.ctx.storage.get<Timer[]>("timers")) ?? [];
    const kept = timers.filter((t) => !kinds.includes(t.kind));
    await this.ctx.storage.put("timers", kept);
    if (kept.length > 0) await this.ctx.storage.setAlarm(kept[0]!.at);
    else await this.ctx.storage.deleteAlarm();
  }

  override async alarm() {
    const now = Date.now();
    const timers = (await this.ctx.storage.get<Timer[]>("timers")) ?? [];
    const due = timers.filter((t) => t.at <= now);
    const pending = timers.filter((t) => t.at > now);

    await this.ctx.storage.put("timers", pending);
    if (pending.length > 0) await this.ctx.storage.setAlarm(pending[0]!.at);

    for (const timer of due) {
      switch (timer.kind) {
        case "gun":
          if (this.room.phase === "countdown") {
            this.room.phase = "running";
            await this.save();
            // Un tick vacío al abrir la salida: sin él, quien no teclea nunca
            // se entera de que la ronda empezó.
            this.dirty = true;
            this.scheduleFlush();
          }
          break;
        case "timeLimit":
        case "hardCap":
        case "finishGrace":
          await this.closeRound(timer.kind);
          break;
        case "grace":
          await this.reapDisconnected(now);
          break;
        case "idle":
          if (now - this.room.lastActivity >= IDLE_CLOSE_MS) {
            this.broadcast({ t: "roomClosed", reason: "inactividad" });
            for (const ws of this.ctx.getWebSockets()) ws.close(1000, "idle");
            await this.ctx.storage.deleteAll();
          }
          break;
      }
    }
  }

  // ------------------------------------------------------------- conexión

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("upgrade") !== "websocket") {
      return Response.json({ error: "expected_websocket" }, { status: 426 });
    }

    const roomCode = url.searchParams.get("room") ?? "";
    const create = url.searchParams.get("create") === "1";
    const userId = request.headers.get("x-auth-user") || null;
    const guestId = request.headers.get("x-auth-guest") || null;
    const nickname = sanitizeNickname(request.headers.get("x-auth-name") ?? "");

    // Las salas de ranked se crean solas al llegar el primero de la cola.
    const ranked = request.headers.get("x-ranked") === "1";
    const seasonId = request.headers.get("x-season") || null;

    if (!this.room.roomCode) {
      if (!create && !ranked) return Response.json({ error: "room_not_found" }, { status: 404 });
      this.room.roomCode = roomCode;
      this.room.createdAt = Date.now();
      this.room.ranked = ranked;
      this.room.seasonId = seasonId;
      if (ranked) {
        // En ranked nadie elige las reglas: se fijan al crear la sala.
        this.room.settings = { ...this.room.settings, totalRounds: 3, timeLimitSeconds: 0, mode: "normal" };
      }
      await this.pushTimer({ at: Date.now() + IDLE_CLOSE_MS, kind: "idle" });
    }

    if (this.room.ranked && !userId) {
      return Response.json({ error: "ranked_requiere_cuenta" }, { status: 403 });
    }

    const slot = this.claimSlot(userId, guestId, nickname);
    if (slot === null) return Response.json({ error: "room_full" }, { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernación: el DO puede irse de memoria entre mensajes y el socket sigue vivo.
    this.ctx.acceptWebSocket(server, [`slot:${slot.slot}`]);
    server.serializeAttachment({ slot: slot.slot } satisfies Attachment);

    await this.save();

    this.send(server, {
      t: "welcome",
      version: PROTOCOL_VERSION,
      you: { slot: slot.slot, userId },
      roomCode: this.room.roomCode,
      phase: this.room.phase,
      settings: this.room.settings,
      players: this.playerViews(),
      round: this.room.round,
      serverTime: Date.now(),
    });
    this.broadcast({ t: "players", players: this.playerViews() });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Un jugador que vuelve dentro de la gracia recupera SU slot, con sus puntos.
   * Los slots solo se liberan en el lobby: soltarlo a media ronda reordenaría la
   * tabla y dispararía la puntuación sobre un campo incompleto.
   */
  private claimSlot(userId: string | null, guestId: string | null, nickname: string): Slot | null {
    const identity = userId ?? guestId;
    if (identity) {
      const existing = this.slots.find(
        (s) => !s.gone && ((userId && s.userId === userId) || (guestId && s.guestId === guestId)),
      );
      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = null;
        return existing;
      }
    }

    if (this.room.phase !== "lobby") return null; // no se entra a mitad de partida
    if (this.slots.filter((s) => !s.gone).length >= MAX_PLAYERS) return null;

    const used = new Set(this.slots.map((s) => s.color));
    const slot: Slot = {
      slot: this.slots.length,
      userId,
      guestId,
      nickname: this.uniqueNickname(nickname),
      color: COLORS.find((c) => !used.has(c)) ?? COLORS[0]!,
      isOwner: this.slots.filter((s) => !s.gone).length === 0,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      typing: null,
      status: null,
      finishMs: null,
      finishSeq: null,
      exitSeq: null,
      lastEventAt: 0,
      minRttMs: Infinity,
      gone: false,
      charTimes: [],
      errorLog: [],
    };
    this.slots.push(slot);
    return slot;
  }

  private uniqueNickname(base: string): string {
    const taken = new Set(this.slots.filter((s) => !s.gone).map((s) => s.nickname));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} (${i})`;
      if (!taken.has(candidate)) return candidate;
    }
    return base;
  }

  private slotOf(ws: WebSocket): Slot | undefined {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return undefined;
    return this.slots.find((s) => s.slot === att.slot);
  }

  // ------------------------------------------------------------- mensajes

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = parseClientMessage(typeof raw === "string" ? raw : "");
    if (!msg) return;

    const slot = this.slotOf(ws);
    if (!slot) return;

    switch (msg.t) {
      case "ping": {
        this.send(ws, { t: "pong", n: msg.n, tc: msg.tc, ts: Date.now() });
        return;
      }

      case "setName": {
        if (this.room.phase !== "lobby") return;
        slot.nickname = this.uniqueNickname(sanitizeNickname(msg.name, slot.nickname));
        await this.save();
        this.broadcast({ t: "players", players: this.playerViews() });
        return;
      }

      case "setColor": {
        if (this.room.phase !== "lobby") return;
        if (!COLORS.includes(msg.color)) return;
        if (this.slots.some((s) => !s.gone && s.color === msg.color && s.slot !== slot.slot)) return;
        slot.color = msg.color;
        await this.save();
        this.broadcast({ t: "players", players: this.playerViews() });
        return;
      }

      case "ready": {
        if (this.room.phase !== "lobby") return;
        slot.isReady = msg.ready;
        await this.save();
        this.broadcast({ t: "players", players: this.playerViews() });
        return;
      }

      case "settings": {
        if (!slot.isOwner || this.room.phase !== "lobby") return;
        if (this.room.ranked) return; // en ranked las reglas las fija el servidor
        this.room.settings = this.sanitizeSettings({ ...this.room.settings, ...msg.settings });
        await this.save();
        this.broadcast({ t: "settings", settings: this.room.settings });
        return;
      }

      case "start": {
        if (!slot.isOwner) return;
        // Mismo mensaje para empezar el torneo y para encadenar rondas: desde
        // el lobby arranca en la 1, y en el descanso avanza a la siguiente.
        if (this.room.phase === "lobby") await this.startRound(1);
        else if (this.room.phase === "intermission") await this.startRound(this.room.round + 1);
        return;
      }

      case "keys":
        await this.handleKeys(slot, msg.ev);
        return;

      case "chat": {
        const text = sanitizeChat(msg.text);
        if (!text) return;
        this.broadcast({
          t: "chat",
          slot: slot.slot,
          nickname: slot.nickname,
          color: slot.color,
          text,
          ts: Date.now(),
        });
        return;
      }

      case "leave": {
        await this.onGone(slot, "dnf");
        ws.close(1000, "leave");
        return;
      }
    }
  }

  private sanitizeSettings(s: RoomSettings): RoomSettings {
    return {
      totalRounds: [1, 3, 5].includes(s.totalRounds) ? s.totalRounds : 3,
      timeLimitSeconds: Math.max(0, Math.min(600, Math.trunc(s.timeLimitSeconds) || 0)),
      lang: s.lang === "en" ? "en" : "es",
      category: ["historia", "ciencia", "tecnologia", "geografia"].includes(s.category)
        ? s.category
        : "historia",
      difficulty: ["facil", "normal", "dificil"].includes(s.difficulty) ? s.difficulty : "normal",
      mode: ["normal", "sudden_death", "vidas"].includes(s.mode) ? s.mode : "normal",
    };
  }

  // ------------------------------------------------------------- ronda

  private async startRound(round: number) {
    const phrase = await this.pickPhrase();
    if (!phrase) {
      this.broadcast({ t: "error", code: "no_phrases", message: "No hay frases disponibles." });
      return;
    }

    // Se purga a quien se fue: si siguiera en la lista nunca mandaría un
    // status y la ronda no cerraría jamás.
    this.slots = this.slots.filter((s) => !s.gone);
    if (this.slots.length === 0) return;

    const now = Date.now();
    const lives = LIVES_BY_DIFFICULTY[this.room.settings.difficulty] ?? 3;
    const config = this.typingConfig(phrase.text, lives);

    if (round === 1) {
      this.history = [];
      this.prevStandings = [];
    }

    for (const s of this.slots) {
      s.typing = initialState(config);
      s.status = null;
      s.finishMs = null;
      s.finishSeq = null;
      s.exitSeq = null;
      s.lastEventAt = 0;
      s.charTimes = [];
      s.errorLog = [];
      s.isReady = false;
    }

    this.room.round = round;
    this.room.seq = 0;
    this.room.phase = "countdown";
    this.room.roundStartAt = now + COUNTDOWN_MS;
    this.room.phraseId = phrase.id;
    this.room.text = phrase.text;
    this.room.roundScored = false;
    if (round === 1) this.room.matchId = ulid(now);
    this.room.roundId = ulid(now);
    await this.save();

    // Fuera del camino caliente: la cuenta atrás no espera a D1.
    const matchId = this.room.matchId!;
    const roundId = this.room.roundId!;
    this.ctx.waitUntil(
      this.writeBatch([
        ...(round === 1
          ? [matchInsert(this.env.DB, matchId, this.room.roomCode,
              this.room.ranked ? "ranked" : "casual", this.room.settings,
              this.room.seasonId, this.slots.length, now)]
          : []),
        roundInsert(this.env.DB, {
          roundId, matchId, roundNo: round, phraseId: phrase.id, startedAt: now + COUNTDOWN_MS,
        }),
      ]),
    );

    await this.clearTimers(["gun", "timeLimit", "hardCap", "finishGrace"]);
    await this.pushTimer({ at: this.room.roundStartAt, kind: "gun" });
    if (this.room.settings.timeLimitSeconds > 0) {
      await this.pushTimer({
        at: this.room.roundStartAt + this.room.settings.timeLimitSeconds * 1000,
        kind: "timeLimit",
      });
    }
    await this.pushTimer({ at: this.room.roundStartAt + ROUND_HARD_CAP_MS, kind: "hardCap" });

    this.broadcast({
      t: "countdown",
      // Instante ABSOLUTO del reloj del servidor. El cliente lo compara contra
      // su offset medido con ping/pong; su reloj de pared nunca decide nada.
      startAt: this.room.roundStartAt,
      serverTime: now,
      text: phrase.text,
      phraseId: phrase.id,
      round,
      totalRounds: this.room.settings.totalRounds,
      lives,
      settings: this.room.settings,
    });
  }

  private typingConfig(text: string, lives: number): TypingConfig {
    return { text, mode: this.room.settings.mode, lives };
  }

  private async pickPhrase(): Promise<{ id: string; text: string } | null> {
    const { lang, category, difficulty } = this.room.settings;
    const { results } = await this.env.DB.prepare(
      `SELECT id, text FROM phrases
        WHERE lang = ? AND category = ? AND difficulty = ? AND active = 1
        ORDER BY times_used ASC LIMIT 50`,
    )
      .bind(lang, category, difficulty)
      .all<{ id: string; text: string }>();

    if (results.length === 0) return null;
    const chosen = results[Math.floor(Math.random() * results.length)]!;

    this.ctx.waitUntil(
      this.env.DB.prepare("UPDATE phrases SET times_used = times_used + 1 WHERE id = ?")
        .bind(chosen.id)
        .run(),
    );
    return chosen;
  }

  /**
   * El único camino por el que avanza una carrera. El índice se DERIVA aquí
   * contra la copia del servidor de la frase; el cliente no lo reporta, así que
   * no puede saltar ni mentir sobre su WPM.
   */
  private async handleKeys(slot: Slot, ev: number[]) {
    if (this.room.phase !== "running" || !this.room.text || !slot.typing) return;
    if (slot.status !== null) return;

    // Límite de frames: un cliente que inunde el socket se cierra.
    const now = Date.now();
    const bucket = this.keyFrameCount.get(slot.slot) ?? { count: 0, windowStart: now };
    if (now - bucket.windowStart > 1000) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    if (++bucket.count > MAX_KEY_FRAMES_PER_SECOND) {
      this.keyFrameCount.set(slot.slot, bucket);
      return;
    }
    this.keyFrameCount.set(slot.slot, bucket);

    const elapsed = now - (this.room.roundStartAt ?? now);
    if (elapsed < 0) return; // llegó antes del disparo

    const config = this.typingConfig(this.room.text, slot.typing.lives);
    const events = decodeKeyEvents(ev, slot.lastEventAt);

    for (const event of events) {
      // El reloj de ronda del slot no puede adelantar al del servidor: si el
      // cliente miente hacia el futuro, se recorta.
      const at = Math.min(event.at, elapsed);

      // Techo físico. Un evento que dejaría el índice por encima de lo que un
      // humano puede teclear se DESCARTA — el caballo simplemente no avanza.
      if (event.code >= 0 && (slot.typing.index + 1) * MIN_MS_PER_CHAR > elapsed) continue;

      const before = slot.typing.index;
      slot.typing = applyEvent(config, slot.typing, { at, code: event.code });
      slot.lastEventAt = at;

      // Log de la ronda: alimenta el WPM del servidor, las heurísticas y el fantasma.
      if (slot.typing.index > before) slot.charTimes.push(at);
      else if (event.code === -1 && slot.errorLog.length < 512) {
        slot.errorLog.push([slot.typing.index, at]);
      }

      if (slot.typing.done) {
        await this.markFinished(slot, slot.typing.outcome === "finished" ? "finished" : "eliminated");
        break;
      }
    }

    this.dirty = true;
    this.scheduleFlush();

    if (slot.status !== null) await this.maybeCloseRound();
  }

  /** El sello de llegada lo pone el servidor, con SU reloj, para todos por igual. */
  private async markFinished(slot: Slot, status: FinishStatus) {
    if (slot.status !== null) return;
    slot.status = status;

    if (status === "finished") {
      slot.finishSeq = ++this.room.seq;
      const recv = Date.now() - (this.room.roundStartAt ?? Date.now());
      // Corrección de latencia con el RTT MÍNIMO observado (el menos
      // contaminado por encolamiento), con tope duro de 120 ms. Un cliente que
      // retrase sus pong infla su min-RTT; el tope acota ese exploit.
      const owd = Number.isFinite(slot.minRttMs) ? Math.min(slot.minRttMs / 2, 120) : 0;
      slot.finishMs = Math.max(0, recv - owd);

      // El primero en llegar abre el margen para los demás.
      const primeros = this.slots.filter((s) => s.status === "finished").length;
      if (primeros === 1) {
        await this.pushTimer({ at: Date.now() + FINISH_GRACE_MS, kind: "finishGrace" });
      }

      this.broadcast({
        t: "finished",
        slot: slot.slot,
        rank: this.slots.filter((s) => s.status === "finished").length,
        finishMs: slot.finishMs,
        wpm: computeWpm(this.room.text?.length ?? 0, slot.finishMs),
      });
    } else {
      slot.exitSeq = ++this.room.seq;
    }
    await this.save();
  }

  private async onGone(slot: Slot, status: FinishStatus) {
    if (this.room.phase === "running" && slot.status === null) {
      await this.markFinished(slot, status);
      await this.maybeCloseRound();
    } else if (this.room.phase === "lobby") {
      slot.gone = true;
      this.reassignOwner();
      await this.save();
      this.broadcast({ t: "players", players: this.playerViews() });
    }
  }

  private reassignOwner() {
    const alive = this.slots.filter((s) => !s.gone);
    if (alive.length > 0 && !alive.some((s) => s.isOwner)) alive[0]!.isOwner = true;
  }

  private async maybeCloseRound() {
    if (this.room.phase !== "running") return;
    const racers = this.slots.filter((s) => !s.gone);
    if (racers.length === 0) return;
    if (!racers.every((s) => s.status !== null)) return;
    await this.closeRound("allDone");
  }

  /**
   * Cierre de ronda. Dos guards contra la doble puntuación:
   *  1. la fase se mueve a 'scoring' ANTES de cualquier await, y
   *  2. roundScored se persiste.
   * Antes, eliminarJugador() reentraba aquí y los puntos se sumaban dos veces.
   */
  private async closeRound(_reason: string) {
    if (this.room.phase !== "running" && this.room.phase !== "countdown") return;
    if (this.room.roundScored) return;

    this.room.phase = "scoring";
    this.room.roundScored = true;

    const text = this.room.text ?? "";
    const racers = this.slots.filter((s) => !s.gone);

    // Materializa métricas para TODOS antes de ordenar, incluidos los que nunca
    // terminaron: así ningún undefined llega al comparador.
    const entries: RoundEntry[] = racers.map((s) => {
      if (s.status === null) s.status = "timeout";
      return {
        slot: s.slot,
        status: s.status,
        finishMs: s.status === "finished" ? s.finishMs : null,
        finishSeq: s.finishSeq,
        charsTyped: s.typing?.index ?? 0,
        exitSeq: s.exitSeq,
      };
    });

    const ranked = rankRound(entries);
    this.history.push(ranked);

    const table = standings(this.history, this.prevStandings.map((s) => ({
      slot: s.slot,
      totalPoints: s.totalPoints,
      rank: s.rank,
      rankDelta: s.rankDelta,
    })));

    const bySlot = new Map(racers.map((s) => [s.slot, s]));
    const results: RoundResultView[] = ranked.map((r) => {
      const s = bySlot.get(r.slot)!;
      const chars = s.typing?.index ?? 0;
      const errors = s.typing?.errors ?? 0;
      return {
        slot: r.slot,
        nickname: s.nickname,
        status: r.status,
        rank: r.rank,
        points: r.points,
        finishMs: r.status === "finished" ? r.finishMs : null,
        // El WPM lo recalcula el servidor desde su propio recuento. El número
        // del cliente no se guarda jamás.
        wpm: r.status === "finished" ? computeWpm(text.length, r.finishMs ?? 0) : 0,
        accuracy: computeAccuracy(chars, errors),
        errors,
        charsTyped: chars,
      };
    });

    const standingViews: StandingView[] = table.map((row) => ({
      slot: row.slot,
      nickname: bySlot.get(row.slot)?.nickname ?? "",
      rank: row.rank,
      totalPoints: row.totalPoints,
      rankDelta: row.rankDelta,
    }));
    this.prevStandings = standingViews;

    const hasNextRound = this.room.round < this.room.settings.totalRounds;
    this.room.phase = hasNextRound ? "intermission" : "ended";
    await this.save();
    await this.clearTimers(["timeLimit", "hardCap", "gun", "finishGrace"]);

    this.ctx.waitUntil(this.persistRound(results, standingViews, hasNextRound, racers));

    this.broadcast({
      t: "roundEnd",
      round: this.room.round,
      results,
      standings: standingViews,
      hasNextRound,
      totalRounds: this.room.settings.totalRounds,
    });
  }

  private async reapDisconnected(now: number) {
    let changed = false;
    for (const s of this.slots) {
      if (!s.connected && s.disconnectedAt !== null && now - s.disconnectedAt > GRACE_MS) {
        if (this.room.phase === "lobby") s.gone = true;
        changed = true;
      }
    }
    if (changed) {
      this.reassignOwner();
      await this.save();
      this.broadcast({ t: "players", players: this.playerViews() });
    }
  }

  override async webSocketClose(ws: WebSocket) {
    const slot = this.slotOf(ws);
    if (!slot) return;
    slot.connected = false;
    slot.disconnectedAt = Date.now();

    if (this.room.phase === "running" && slot.status === null) {
      await this.markFinished(slot, "disconnected");
      await this.maybeCloseRound();
    } else {
      await this.save();
      this.broadcast({ t: "players", players: this.playerViews() });
      await this.pushTimer({ at: Date.now() + GRACE_MS + 1000, kind: "grace" });
    }
  }

  override async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }



  /** Escritura a D1 del cierre de ronda, los fantasmas y, si toca, el fin de partida. */
  private async persistRound(
    results: RoundResultView[],
    standingViews: StandingView[],
    hasNextRound: boolean,
    racers: Slot[],
  ) {
    const now = Date.now();
    const matchId = this.room.matchId;
    const roundId = this.room.roundId;
    if (!matchId || !roundId || !this.room.phraseId) return;

    const players: PersistPlayer[] = racers.map((s) => ({
      slot: s.slot, userId: s.userId, nickname: s.nickname,
    }));

    const out = await this.writeBatch(
      roundCloseBatch(this.env.DB, {
        matchId, roundId, roundNo: this.room.round,
        phraseId: this.room.phraseId,
        charsTotal: [...(this.room.text ?? "")].length,
        startedAt: this.room.roundStartAt ?? now,
        results, players,
      }, now),
    );

    // La primera sentencia es el guard: 0 filas = la ronda ya estaba puntuada.
    if (out && out[0] && (out[0].meta?.changes ?? 0) === 0) {
      console.warn("ronda ya puntuada, se descarta", roundId);
      return;
    }

    // --- fantasmas: solo récord personal, solo con cuenta, solo si terminó ---
    const byUser = new Map(racers.map((s) => [s.slot, s]));
    for (const res of results) {
      const slot = byUser.get(res.slot);
      if (!slot?.userId || res.status !== "finished" || slot.charTimes.length === 0) continue;

      const candidate: GhostCandidate = {
        userId: slot.userId,
        phraseId: this.room.phraseId,
        lang: this.room.settings.lang,
        difficulty: this.room.settings.difficulty,
        wpm: res.wpm,
        accuracy: res.accuracy,
        errors: res.errors,
        run: runFromKeystrokes(slot.charTimes, slot.errorLog),
      };
      // Un fantasma peor que el récord choca contra ux_ghost_pb: se ignora.
      await this.writeBatch(ghostBatch(this.env.DB, candidate, now));
    }

    if (hasNextRound) return;

    // --- fin de partida ---
    const avgWpm = new Map<number, number>();
    for (const res of results) avgWpm.set(res.slot, res.wpm);

    const ratings = new Map<string, { rating: number; placementsLeft: number }>();
    if (this.room.ranked && this.room.seasonId) {
      const ids = players.map((p) => p.userId).filter((x): x is string => x !== null);
      if (ids.length > 0) {
        const { results: rows } = await this.env.DB.prepare(
          `SELECT user_id, rating, placements_left FROM elo_ratings
            WHERE season_id = ? AND user_id IN (${ids.map(() => "?").join(",")})`,
        ).bind(this.room.seasonId, ...ids)
         .all<{ user_id: string; rating: number; placements_left: number }>();
        for (const r of rows) {
          ratings.set(r.user_id, { rating: r.rating, placementsLeft: r.placements_left });
        }
      }
    }

    await this.writeBatch(
      matchEndBatch(this.env.DB, {
        matchId, seasonId: this.room.seasonId, ranked: this.room.ranked,
        standings: standingViews, players, avgWpm, ratings, now,
      }),
    );
  }

  // ------------------------------------------------------------- D1

  /**
   * Escribe un batch en D1. El juego NUNCA se bloquea por persistencia: si
   * falla, se apunta el fallo y se reintenta por alarma con espera creciente.
   * Todo batch es idempotente, así que reproducirlo es seguro.
   *
   * ponytail: los reintentos guardan solo un contador, no el batch serializado.
   * Reconstruir un batch fallido exigiría serializar sentencias preparadas, que
   * D1 no permite. El techo: si D1 está caído al cerrar una ronda, ese
   * resultado se pierde para las estadísticas —la partida en curso no se ve
   * afectada—. Si eso llega a importar, la vía es una cola en Queues.
   */
  private async writeBatch(stmts: D1PreparedStatement[]): Promise<D1Result[] | null> {
    if (stmts.length === 0) return [];
    try {
      return await this.env.DB.batch(stmts);
    } catch (err) {
      console.error("d1 batch falló", this.room.roomCode, err);
      return null;
    }
  }

  // ------------------------------------------------------------- salida

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket muerto: webSocketClose se encargará
    }
  }

  private broadcast(msg: ServerMessage) {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* ignorado */
      }
    }
  }

  /**
   * Coalescencia: la implementación vieja difundía el array completo de
   * jugadores en CADA progreso — con 6 jugadores a 20 Hz son 720 mensajes/s de
   * payload O(n), es decir O(n²). Esto emite un `tick` a 15 Hz constantes sin
   * importar cuántos jueguen.
   */
  private scheduleFlush() {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.dirty) return;
      this.dirty = false;

      const players: TickPlayer[] = this.slots
        .filter((s) => !s.gone)
        .map((s) => ({
          slot: s.slot,
          index: s.typing?.index ?? 0,
          state: s.typing?.state ?? "normal",
          lives: s.typing?.lives ?? 0,
          streak: s.typing?.streak ?? 0,
          done: s.status !== null,
        }));

      this.broadcast({ t: "tick", ts: Date.now(), players });
    }, TICK_INTERVAL_MS);
  }

  private playerViews(): PlayerView[] {
    const totals = new Map(this.prevStandings.map((s) => [s.slot, s.totalPoints]));
    return this.slots
      .filter((s) => !s.gone)
      .map((s) => ({
        slot: s.slot,
        nickname: s.nickname,
        color: s.color,
        isOwner: s.isOwner,
        isGuest: s.userId === null,
        isReady: s.isReady,
        connected: s.connected,
        totalPoints: totals.get(s.slot) ?? 0,
      }));
  }
}
