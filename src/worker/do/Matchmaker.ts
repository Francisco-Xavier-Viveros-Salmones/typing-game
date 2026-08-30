import { DurableObject } from "cloudflare:workers";
import { MIN_RANKED_PLAYERS } from "../../shared/elo";
import { roomCode } from "../../shared/ids";
import type { RoomSettings } from "../../shared/protocol";
import type { Env } from "../index";

/**
 * Cola de ranked. Un único Durable Object: la cola es un punto de
 * serialización por naturaleza, y para este tamaño de juego un solo hilo sobra.
 *
 * El emparejamiento espera a MIN_RANKED_PLAYERS. Si pasan MAX_WAIT_MS y hay al
 * menos 2, arranca igual — una partida de 2 es peor para el Elo que una de 4,
 * pero una cola eterna es peor que las dos.
 */

const MAX_WAIT_MS = 45_000;
const TICK_MS = 3_000;
const MAX_LOBBY = 6;

/** Ajustes fijos: en ranked nadie elige las reglas. */
const RANKED_SETTINGS: RoomSettings = {
  totalRounds: 3,
  timeLimitSeconds: 0,
  lang: "es",
  category: "historia",
  difficulty: "normal",
  mode: "normal",
};

interface Waiting {
  userId: string;
  username: string;
  rating: number;
  since: number;
}

export class Matchmaker extends DurableObject<Env> {
  private queue: Waiting[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.queue = (await ctx.storage.get<Waiting[]>("queue")) ?? [];
    });
  }

  private async save() {
    await this.ctx.storage.put("queue", this.queue);
    if (this.queue.length > 0) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  /** Entra en la cola. Devuelve el código de sala si ya hay partida. */
  async join(userId: string, username: string, rating: number): Promise<{
    status: "queued" | "matched";
    roomCode?: string;
    settings?: RoomSettings;
    position?: number;
    waiting?: number;
  }> {
    if (!this.queue.some((w) => w.userId === userId)) {
      this.queue.push({ userId, username, rating, since: Date.now() });
    }

    const match = this.tryMatch();
    if (match) {
      await this.save();
      return { status: "matched", roomCode: match.code, settings: RANKED_SETTINGS };
    }

    await this.save();
    return {
      status: "queued",
      position: this.queue.findIndex((w) => w.userId === userId) + 1,
      waiting: this.queue.length,
    };
  }

  async leave(userId: string): Promise<void> {
    this.queue = this.queue.filter((w) => w.userId !== userId);
    await this.save();
  }

  /** Consulta sin entrar en la cola: para pintar el estado mientras se espera. */
  async status(userId: string): Promise<{ inQueue: boolean; waiting: number; matched: string | null }> {
    const matched = await this.ctx.storage.get<Record<string, string>>("matched");
    const code = matched?.[userId] ?? null;
    if (code) {
      // Se entrega una sola vez: al leerlo se borra.
      const rest = { ...matched };
      delete rest[userId];
      await this.ctx.storage.put("matched", rest);
      this.queue = this.queue.filter((w) => w.userId !== userId);
      await this.save();
    }
    return {
      inQueue: this.queue.some((w) => w.userId === userId),
      waiting: this.queue.length,
      matched: code,
    };
  }

  override async alarm() {
    const match = this.tryMatch();
    await this.save();
    if (match) await this.publish(match);
  }

  private tryMatch(): { code: string; players: Waiting[] } | null {
    const now = Date.now();
    const esperandoDemasiado = this.queue.some((w) => now - w.since > MAX_WAIT_MS);

    const suficientes =
      this.queue.length >= MIN_RANKED_PLAYERS ||
      (esperandoDemasiado && this.queue.length >= 2);
    if (!suficientes) return null;

    // Se emparejan los de rating más cercano: ordenar la cola y cortar por
    // arriba agrupa a los parecidos sin necesidad de ventanas de búsqueda.
    const ordenada = [...this.queue].sort((a, b) => b.rating - a.rating);
    const players = ordenada.slice(0, Math.min(MAX_LOBBY, ordenada.length));
    const code = roomCode();

    this.queue = this.queue.filter((w) => !players.some((p) => p.userId === w.userId));
    void this.publish({ code, players });
    return { code, players };
  }

  private async publish(match: { code: string; players: Waiting[] }) {
    const matched = (await this.ctx.storage.get<Record<string, string>>("matched")) ?? {};
    for (const p of match.players) matched[p.userId] = match.code;
    await this.ctx.storage.put("matched", matched);
  }
}
