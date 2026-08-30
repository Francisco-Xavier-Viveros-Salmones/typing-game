import { changePassword, login, logout, me, register } from "./routes/auth";
import { randomPhrase } from "./routes/phrases";
import { leaderboard, profile } from "./routes/boards";
import { personalBest, phraseRecords, soloResult } from "./routes/solo";
import { ensureSeason, gc, rolloverSeasons } from "./jobs/seasons";
import { activeSeason } from "./routes/boards";
import { track } from "./lib/metrics";
import { checkOrigin, fail, json } from "./lib/http";
import { ensureGuestId, getSessionUser } from "./lib/session";
import { roomCode as newRoomCode } from "../shared/ids";

export { RaceRoom } from "./do/RaceRoom";
export { Matchmaker } from "./do/Matchmaker";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RACE_ROOM: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
  /** Opcional: en local puede no estar configurado. */
  METRICS?: AnalyticsEngineDataset;
  /** Solo lo usa el cron de frases (fase 8). */
  GEMINI_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws/room") return handleRoomSocket(request, env, ctx);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    // Antes que nada: ninguna petición que muta estado pasa sin Origin propio.
    if (!checkOrigin(request)) return fail(403, "origen_no_valido");

    try {
      const route = `${request.method} ${url.pathname}`;

      switch (route) {
        case "GET /api/health":
          return Response.json({ ok: true, phase: 4 });

        case "POST /api/rooms": {
          const code = newRoomCode();
          track(env, "room_create");
          return json({ roomCode: code });
        }

        case "GET /api/phrases/random":
          return await randomPhrase(request, env, ctx);

        case "GET /api/leaderboard":
          return await leaderboard(request, env);
        case "GET /api/profile":
          return await profile(request, env, await getSessionUser(env, request, ctx));

        case "GET /api/ghosts/pb":
          return await personalBest(request, env, await getSessionUser(env, request, ctx));
        case "GET /api/ghosts/records":
          return await phraseRecords(request, env);
        case "POST /api/ranked/queue": {
          const u = await getSessionUser(env, request, ctx);
          // El ranked exige cuenta: sin identidad estable no hay ladder.
          if (!u) return fail(401, "El ranked necesita una cuenta.");
          track(env, "ranked_queue", { labels: [u.username] });
          return await rankedQueue(env, u.id, u.username);
        }
        case "GET /api/ranked/status": {
          const u = await getSessionUser(env, request, ctx);
          if (!u) return fail(401, "El ranked necesita una cuenta.");
          const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("ranked:v1")) as unknown as
            { status(id: string): Promise<unknown> };
          return json(await mm.status(u.id));
        }
        case "POST /api/ranked/leave": {
          const u = await getSessionUser(env, request, ctx);
          if (!u) return fail(401, "El ranked necesita una cuenta.");
          const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("ranked:v1")) as unknown as
            { leave(id: string): Promise<void> };
          await mm.leave(u.id);
          return json({ ok: true });
        }

        case "POST /api/solo/result":
          return await soloResult(request, env, await getSessionUser(env, request, ctx));

        case "POST /api/auth/register":
          return await register(request, env);
        case "POST /api/auth/login":
          return await login(request, env);
        case "POST /api/auth/logout":
          return await logout(request, env);

        case "GET /api/auth/me":
          return me(request, await getSessionUser(env, request, ctx));

        case "POST /api/auth/password": {
          const user = await getSessionUser(env, request, ctx);
          if (!user) return fail(401, "Necesitas iniciar sesión.");
          return await changePassword(request, env, user);
        }

        default:
          return fail(404, "not_found");
      }
    } catch (err) {
      console.error("api error", url.pathname, err);
      return fail(500, "internal");
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await ensureSeason(env);
        console.log(await rolloverSeasons(env));
        console.log(await gc(env));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * La autenticación del WebSocket ocurre AQUÍ, no en el Durable Object.
 *
 * El navegador no puede poner cabeceras en `new WebSocket()`, así que la cookie
 * de sesión es la única credencial disponible — y solo viaja si el socket es
 * del mismo origen. Por eso todo vive en un Worker con assets en vez de Pages
 * más un Worker aparte.
 *
 * El DO se fía de las cabeceras X-Auth-* porque un Durable Object no es
 * enrutable desde internet: solo este Worker tiene el binding. Aun así el DO
 * ignora cualquier identidad que venga dentro del payload.
 *
 * Validar la sesión dentro del DO serializaría cada entrada tras su único hilo
 * y metería D1 en el camino caliente.
 */
async function handleRoomSocket(request: Request, env: Env, ctx: ExecutionContext) {
  if (request.headers.get("upgrade") !== "websocket") {
    return fail(426, "se_esperaba_websocket");
  }

  // El upgrade no está protegido por SameSite como un fetch, así que se
  // comprueba el Origin a mano.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return fail(403, "origen_no_valido");
  }

  const url = new URL(request.url);
  const code = (url.searchParams.get("room") ?? "").toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return fail(400, "codigo_no_valido");

  const user = await getSessionUser(env, request, ctx);
  const guest = user ? null : ensureGuestId(request);

  // El ranked lo marca el servidor, no el cliente: si la sala viene de la cola
  // se sella aquí con la temporada activa. Un invitado nunca entra a ranked.
  const wantsRanked = url.searchParams.get("ranked") === "1";
  const seasonId = wantsRanked && user ? await ensureSeason(env) : null;

  const headers = new Headers(request.headers);
  headers.set("x-auth-user", user?.id ?? "");
  headers.set("x-auth-guest", guest?.id ?? "");
  headers.set("x-auth-name", url.searchParams.get("name") ?? user?.username ?? "Jinete");
  headers.set("x-ranked", seasonId ? "1" : "0");
  headers.set("x-season", seasonId ?? "");

  const stub = env.RACE_ROOM.get(env.RACE_ROOM.idFromName(code));
  return stub.fetch(new Request(request.url, { headers, method: request.method }));
}

/** Entra en la cola de ranked con el rating de la temporada activa. */
async function rankedQueue(env: Env, userId: string, username: string) {
  const season = await ensureSeason(env);
  if (!season) return fail(503, "No hay temporada activa.");

  const row = await env.DB.prepare(
    "SELECT rating FROM elo_ratings WHERE season_id = ? AND user_id = ?",
  ).bind(season, userId).first<{ rating: number }>();

  const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("ranked:v1")) as unknown as {
    join(id: string, name: string, rating: number): Promise<unknown>;
  };
  return json(await mm.join(userId, username, row?.rating ?? 1200));
}
