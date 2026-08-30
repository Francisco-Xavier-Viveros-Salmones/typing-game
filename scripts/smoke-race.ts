/**
 * Prueba de humo del Durable Object: dos jugadores reales por WebSocket.
 *
 * Reproduce el escenario del bug 1 contra el servidor autoritativo: uno termina
 * la frase, el otro abandona. Antes, el que abandonaba se llevaba el oro porque
 * su tiempo quedaba en 0. Aquí se comprueba contra el servidor de verdad, no
 * contra la función pura.
 *
 * Uso: bun run scripts/smoke-race.ts [http://127.0.0.1:8787]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:8787";
const ORIGIN = BASE;

interface Client {
  ws: WebSocket;
  name: string;
  slot: number;
  inbox: any[];
  waitFor: (t: string, timeoutMs?: number) => Promise<any>;
}

function connect(room: string, name: string, create = false): Promise<Client> {
  const url =
    `${BASE.replace(/^http/, "ws")}/ws/room?room=${room}&name=${encodeURIComponent(name)}` +
    (create ? "&create=1" : "");
  const ws = new WebSocket(url, { headers: { Origin: ORIGIN } } as any);
  const inbox: any[] = [];
  const waiters: { t: string; resolve: (v: any) => void }[] = [];

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(String((e as MessageEvent).data));
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.t === msg.t) waiters.splice(i, 1)[0]!.resolve(msg);
    }
  });

  const waitFor = (t: string, timeoutMs = 15000) =>
    new Promise<any>((resolve, reject) => {
      const found = inbox.find((m) => m.t === t);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error(`timeout esperando '${t}' en ${name}`)), timeoutMs);
      waiters.push({ t, resolve: (v) => { clearTimeout(timer); resolve(v); } });
    });

  return new Promise((resolve, reject) => {
    ws.addEventListener("error", (e) => reject(new Error(`ws error ${name}: ${e}`)));
    ws.addEventListener("open", async () => {
      const welcome = await waitFor("welcome");
      resolve({ ws, name, slot: welcome.you.slot, inbox, waitFor });
    });
  });
}

const send = (c: Client, msg: unknown) => c.ws.send(JSON.stringify(msg));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASA" : "FALLA"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const room: string = await fetch(`${BASE}/api/rooms`, {
  method: "POST",
  headers: { Origin: ORIGIN },
}).then((r) => r.json()).then((d: any) => d.roomCode);

console.log(`\nSala ${room}\n`);

// El primero en entrar crea la sala y es el anfitrión.
const ana = await connect(room, "Ana", true);
const beto = await connect(room, "Beto");
await sleep(300);

check("dos jugadores en slots distintos", ana.slot === 0 && beto.slot === 1, `Ana=${ana.slot} Beto=${beto.slot}`);

// Medir RTT: el servidor lo usa para corregir latencia al sellar la llegada.
for (const c of [ana, beto]) {
  send(c, { t: "ping", n: 1, tc: Date.now() });
  await c.waitFor("pong");
}

send(ana, { t: "settings", settings: { totalRounds: 1, timeLimitSeconds: 0, mode: "normal" } });
await sleep(200);

// Solo el anfitrión puede arrancar: Beto lo intenta primero.
send(beto, { t: "start" });
await sleep(400);
check("un no-anfitrión no puede arrancar", !beto.inbox.some((m) => m.t === "countdown"));

send(ana, { t: "start" });
const countdown = await ana.waitFor("countdown");
await beto.waitFor("countdown");

const texto: string = countdown.text;
const espera = countdown.startAt - countdown.serverTime;
check("la salida llega con instante absoluto del servidor", espera > 0 && espera < 6000, `${espera}ms`);
check("los dos reciben la misma frase", beto.inbox.find((m) => m.t === "countdown").text === texto);

await sleep(espera + 300);

// --- Ana teclea la frase entera, a ritmo humano ---
// El servidor descarta lo que vaya por encima de ~600 WPM, así que hay que
// respetar el techo físico de 20 ms por carácter.
const MS_POR_CHAR = 45;
for (let i = 0; i < texto.length; i += 8) {
  const trozo = [...texto].slice(i, i + 8);
  const ev: number[] = [];
  for (const ch of trozo) ev.push(MS_POR_CHAR, ch.codePointAt(0)!);
  send(ana, { t: "keys", n: i, ev });
  await sleep(MS_POR_CHAR * trozo.length);
}

const fin = await ana.waitFor("finished");
check("Ana termina y el servidor le pone el sello", fin.slot === ana.slot, `${fin.wpm} WPM en ${fin.finishMs}ms`);
check("el tiempo de llegada lo mide el servidor, no el cliente", fin.finishMs > 0);

// --- Beto abandona: el escenario exacto del bug 1 ---
send(beto, { t: "leave" });

const roundEnd = await ana.waitFor("roundEnd");
const [primero, segundo] = roundEnd.results;

console.log();
check("Ana (terminó) queda 1ª", primero.slot === ana.slot && primero.rank === 1);
check("Ana se lleva los 25 puntos", primero.points === 25, `${primero.points} pts`);
check("Beto (abandonó) queda 2º", segundo.slot === beto.slot && segundo.rank === 2);
check("Beto se lleva 0 puntos", segundo.points === 0);
check("BUG 1: el que abandona NO tiene tiempo", segundo.finishMs === null, `finishMs=${segundo.finishMs}`);
check("el status del que abandona es dnf", segundo.status === "dnf", segundo.status);
check("el WPM lo recalculó el servidor", primero.wpm > 0 && primero.wpm < 600, `${primero.wpm} WPM`);
check("la precisión es finita", Number.isFinite(primero.accuracy), String(primero.accuracy));
check("todos los rangos son finitos", roundEnd.results.every((r: any) => Number.isFinite(r.rank)));

const clasificacion = roundEnd.standings;
check("la clasificación la ordena el servidor", clasificacion[0].slot === ana.slot);
check("BUG 6: rankDelta es 0 en la ronda 1, no NaN", clasificacion.every((s: any) => s.rankDelta === 0));

// --- reentrada: cerrar la ronda otra vez no debe duplicar puntos ---
send(ana, { t: "leave" });
await sleep(500);
const cierres = ana.inbox.filter((m) => m.t === "roundEnd");
check("BUG 5: la ronda se puntúa UNA sola vez", cierres.length === 1, `${cierres.length} cierres`);

ana.ws.close();
beto.ws.close();

console.log(`\n${failures === 0 ? "TODO EN VERDE" : `${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
