/**
 * Desconexión brusca a media carrera: uno termina, al otro se le cae el socket
 * sin mandar `leave`. La ronda debe cerrarse igual y el caído quedar detrás.
 *
 * Uso: bun run scripts/smoke-disconnect.ts
 */
const BASE = "http://127.0.0.1:8787";

function connect(room: string, name: string, create = false) {
  const url =
    `${BASE.replace(/^http/, "ws")}/ws/room?room=${room}&name=${encodeURIComponent(name)}` +
    (create ? "&create=1" : "");
  const ws = new WebSocket(url, { headers: { Origin: BASE } } as any);
  const inbox: any[] = [];
  ws.addEventListener("message", (e) => inbox.push(JSON.parse(String((e as MessageEvent).data))));

  const waitFor = (t: string, ms = 20000) =>
    new Promise<any>((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        const found = inbox.find((m) => m.t === t);
        if (found) { clearInterval(poll); resolve(found); }
        else if (Date.now() - started > ms) { clearInterval(poll); reject(new Error(`timeout '${t}' en ${name}`)); }
      }, 50);
    });

  return new Promise<{ ws: WebSocket; inbox: any[]; waitFor: typeof waitFor; slot: number }>((res, rej) => {
    ws.addEventListener("error", () => rej(new Error(`ws error ${name}`)));
    ws.addEventListener("open", async () => {
      const w = await waitFor("welcome");
      res({ ws, inbox, waitFor, slot: w.you.slot });
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASA" : "FALLA"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fallos++;
};

const room = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { Origin: BASE } })
  .then((r) => r.json()).then((d: any) => d.roomCode);

console.log(`\nSala ${room}\n`);
const ana = await connect(room, "Ana", true);
const beto = await connect(room, "Beto");
await sleep(400);

ana.ws.send(JSON.stringify({ t: "settings", settings: { totalRounds: 1, timeLimitSeconds: 0 } }));
await sleep(200);
ana.ws.send(JSON.stringify({ t: "start" }));

const cd = await ana.waitFor("countdown");
await sleep(cd.startAt - cd.serverTime + 400);
const texto: string = cd.text;

// Beto avanza un poco y luego se le cae el socket sin avisar.
for (let i = 0; i < 20; i++) {
  beto.ws.send(JSON.stringify({ t: "keys", n: i, ev: [60, texto.codePointAt(i)] }));
  await sleep(60);
}

// Ana termina la frase entera.
for (let i = 0; i < [...texto].length; i += 6) {
  const trozo = [...texto].slice(i, i + 6);
  const ev: number[] = [];
  for (const ch of trozo) ev.push(45, ch.codePointAt(0)!);
  ana.ws.send(JSON.stringify({ t: "keys", n: i, ev }));
  await sleep(45 * trozo.length);
}
await ana.waitFor("finished");
check("Ana termina", true);

// Corte brusco: sin `leave`, como una conexión que se cae de verdad.
console.log("  ...cortando el socket de Beto sin avisar");
beto.ws.close();

const fin = await ana.waitFor("roundEnd", 15000);
const [primero, segundo] = fin.results;

check("la ronda cierra sin esperar al tope de 5 minutos", true);
check("Ana queda 1ª con 25 puntos", primero.rank === 1 && primero.points === 25, `${primero.nickname} ${primero.points}pts`);
check("Beto queda 2º con 0 puntos", segundo.rank === 2 && segundo.points === 0);
check("Beto figura como desconectado", segundo.status === "disconnected", segundo.status);
check("Beto no tiene tiempo de llegada", segundo.finishMs === null, `finishMs=${segundo.finishMs}`);
check("el progreso de Beto se conservó", segundo.charsTyped > 0, `${segundo.charsTyped} caracteres`);

ana.ws.close();
console.log(`\n${fallos === 0 ? "TODO EN VERDE" : `${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
