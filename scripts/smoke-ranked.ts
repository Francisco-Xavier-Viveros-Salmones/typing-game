/**
 * Ranked de punta a punta: tres cuentas entran en la cola, se emparejan,
 * corren una partida y se comprueba que el Elo se aplica una sola vez.
 *
 * Uso: bun run scripts/smoke-ranked.ts
 */
const BASE = "http://127.0.0.1:8787";
const H = { Origin: BASE, "Content-Type": "application/json" };

let fallos = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASA" : "FALLA"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fallos++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cada usuario lleva su propia cookie: aquí no hay navegador que la guarde. */
async function crearUsuario(username: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: H,
    body: JSON.stringify({ username, password: "clave-de-prueba-larga" }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`registro falló: ${await res.text()}`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: H,
    body: JSON.stringify({ username, password: "clave-de-prueba-larga" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) throw new Error(`login sin cookie para ${username}`);
  return cookie;
}

const api = (cookie: string) => ({
  get: (path: string) => fetch(`${BASE}${path}`, { headers: { Cookie: cookie } }).then((r) => r.json()),
  post: (path: string, body: unknown = {}) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: { ...H, Cookie: cookie }, body: JSON.stringify(body) })
      .then((r) => r.json()),
});

const sufijo = Date.now().toString(36).slice(-4);
const nombres = [`Ranked${sufijo}A`, `Ranked${sufijo}B`, `Ranked${sufijo}C`];
const cookies = await Promise.all(nombres.map(crearUsuario));
console.log(`\n3 cuentas: ${nombres.join(", ")}\n`);

// --- cola ---
const respuestas = [];
for (const c of cookies) respuestas.push(await api(c).post("/api/ranked/queue"));

const emparejado = respuestas.find((r: any) => r.status === "matched") as any;
check("los tres entran y se forma partida", Boolean(emparejado?.roomCode), emparejado?.roomCode);
if (!emparejado?.roomCode) { console.log("\nSIN SALA\n"); process.exit(1); }

const room: string = emparejado.roomCode;

// --- conectarse a la sala de ranked ---
function conectar(cookie: string, nombre: string) {
  const ws = new WebSocket(
    `${BASE.replace(/^http/, "ws")}/ws/room?room=${room}&name=${nombre}&ranked=1`,
    { headers: { Origin: BASE, Cookie: cookie } } as any,
  );
  const inbox: any[] = [];
  ws.addEventListener("message", (e) => inbox.push(JSON.parse(String((e as MessageEvent).data))));
  const waitFor = (t: string, ms = 25000) =>
    new Promise<any>((res, rej) => {
      const t0 = Date.now();
      const poll = setInterval(() => {
        const f = inbox.find((m) => m.t === t);
        if (f) { clearInterval(poll); res(f); }
        else if (Date.now() - t0 > ms) { clearInterval(poll); rej(new Error(`timeout '${t}' en ${nombre}`)); }
      }, 50);
    });
  return new Promise<{ ws: WebSocket; inbox: any[]; waitFor: typeof waitFor }>((res, rej) => {
    ws.addEventListener("error", () => rej(new Error(`ws error ${nombre}`)));
    ws.addEventListener("open", async () => { await waitFor("welcome"); res({ ws, inbox, waitFor }); });
  });
}

const jugadores = [];
for (let i = 0; i < 3; i++) jugadores.push(await conectar(cookies[i]!, nombres[i]!));
await sleep(600);

const w = jugadores[0]!.inbox.find((m) => m.t === "welcome");
const roster = jugadores[0]!.inbox.filter((m) => m.t === "players").pop() ?? w;
check("la sala tiene a los tres", roster.players.length === 3, `${roster.players.length} jugadores`);
check("las reglas de ranked son fijas: 3 rondas", w.settings.totalRounds === 3);

// El anfitrión intenta cambiar las reglas: en ranked no debe poder.
jugadores[0]!.ws.send(JSON.stringify({ t: "settings", settings: { totalRounds: 1, difficulty: "facil" } }));
await sleep(500);
const tras = jugadores[0]!.inbox.filter((m) => m.t === "settings").pop();
check("el anfitrión NO puede cambiar las reglas en ranked", !tras || tras.settings.totalRounds === 3);

// --- 3 rondas: A gana siempre, C abandona siempre ---
for (let ronda = 1; ronda <= 3; ronda++) {
  jugadores[0]!.ws.send(JSON.stringify({ t: "start" }));
  const cd = await jugadores[0]!.waitFor("countdown");
  await sleep(cd.startAt - cd.serverTime + 300);
  const texto: string = cd.text;
  const n = [...texto].length;

  // A termina rápido, B más lento, C abandona.
  for (const [idx, paso] of [[0, 40], [1, 70]] as const) {
    void (async () => {
      for (let i = 0; i < n; i++) {
        jugadores[idx]!.ws.send(JSON.stringify({ t: "keys", n: i, ev: [paso, texto.codePointAt(i)] }));
        await sleep(paso);
      }
    })();
  }
  await sleep(400);
  if (ronda === 1) jugadores[2]!.ws.send(JSON.stringify({ t: "leave" }));
  if (ronda === 1) setTimeout(() => jugadores[2]!.ws.close(), 200);

  const fin = await jugadores[0]!.waitFor("roundEnd", 40000);
  jugadores.forEach((j) => { j.inbox.length = 0; });
  console.log(`  ronda ${ronda}: ${fin.results.map((r: any) => `${r.rank}º ${r.nickname}`).join(", ")}`);
  if (!fin.hasNextRound) break;
  await sleep(400);
}

await sleep(2500);
jugadores.forEach((j) => j.ws.close());

// --- comprobar el Elo ---
const perfilA: any = await api(cookies[0]!).get("/api/profile");
const perfilB: any = await api(cookies[1]!).get("/api/profile");

check("se creó rating de temporada", Boolean(perfilA.elo), JSON.stringify(perfilA.elo?.rating));
check("el ganador sube", (perfilA.elo?.rating ?? 1200) > 1200, `${perfilA.elo?.rating}`);
check("el segundo no sube tanto como el primero",
  (perfilB.elo?.rating ?? 1200) < (perfilA.elo?.rating ?? 1200),
  `A=${perfilA.elo?.rating} B=${perfilB.elo?.rating}`);
check("quedan colocaciones pendientes", (perfilA.elo?.placements_left ?? 10) === 9,
  `${perfilA.elo?.placements_left}/10`);
check("la partida aparece en el historial", perfilA.history.length >= 1, `${perfilA.history.length}`);
check("el historial trae el delta de Elo", perfilA.history[0]?.elo_delta !== null,
  `${perfilA.history[0]?.elo_delta}`);
check("el ranked no muestra a quien está en colocaciones",
  ((await api(cookies[0]!).get("/api/leaderboard?kind=ranked")) as any).rows.length === 0);

console.log(`\n${fallos === 0 ? "TODO EN VERDE" : `${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
