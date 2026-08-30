import type { ClientMessage, ServerMessage } from "../../shared/protocol";

export type SocketStatus = "connecting" | "open" | "closed" | "error";

export interface RaceSocketOptions {
  roomCode: string;
  name: string;
  create: boolean;
  /** El servidor vuelve a comprobarlo; esto solo dice a qué sala se entra. */
  ranked?: boolean;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: SocketStatus, detail?: string) => void;
}

const PING_INTERVAL_MS = 5000;

/**
 * Transporte al Durable Object. Además de enviar y recibir, mide el desfase de
 * reloj contra el servidor: el cliente NUNCA usa su hora de pared para nada que
 * importe, solo para pintar la cuenta atrás en el instante correcto.
 */
export class RaceSocket {
  private ws: WebSocket | null = null;
  private opts: RaceSocketOptions;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSeq = 0;

  /** serverTime - clientTime, estimado con el RTT más bajo visto. */
  private clockOffset = 0;
  private bestRtt = Infinity;

  constructor(opts: RaceSocketOptions) {
    this.opts = opts;
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({ room: this.opts.roomCode, name: this.opts.name });
    if (this.opts.create) params.set("create", "1");
    if (this.opts.ranked) params.set("ranked", "1");

    this.opts.onStatus("connecting");
    const ws = new WebSocket(`${proto}//${location.host}/ws/room?${params}`);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.opts.onStatus("open");
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS);
    });

    ws.addEventListener("message", (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === "pong") {
        this.onPong(msg.tc, msg.ts);
        return;
      }
      this.opts.onMessage(msg);
    });

    ws.addEventListener("close", (e) => {
      this.stopPing();
      this.opts.onStatus("closed", e.reason);
    });

    ws.addEventListener("error", () => {
      this.stopPing();
      this.opts.onStatus("error");
    });
  }

  private ping() {
    this.send({ t: "ping", n: ++this.pingSeq, tc: Date.now() });
  }

  private stopPing() {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /**
   * Se queda con el desfase medido en el ping de MENOR ida y vuelta: es la
   * muestra menos contaminada por encolamiento de red.
   */
  private onPong(sentAt: number, serverTime: number) {
    const now = Date.now();
    const rtt = now - sentAt;
    if (rtt < this.bestRtt) {
      this.bestRtt = rtt;
      this.clockOffset = serverTime + rtt / 2 - now;
    }
  }

  /** Hora del servidor estimada, para saber cuándo cae la salida. */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }
}
