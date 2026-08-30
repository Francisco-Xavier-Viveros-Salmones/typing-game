/**
 * Se une a una sala como un jugador aparte y teclea a ritmo constante.
 *
 * Existe porque desde el mismo navegador no se puede simular un segundo
 * jugador: comparte la cookie de sesión y reclama el mismo slot. Este proceso
 * no lleva cookies, así que entra como invitado nuevo.
 *
 * Uso: bun run scripts/join-as.ts <SALA> [nombre] [caracteres] [ms/char]
 */
const BASE = "http://127.0.0.1:8787";
const [room, name = "Rival", chars = "40", pace = "70"] = process.argv.slice(2);
if (!room) throw new Error("Falta el código de sala");

const ws = new WebSocket(
  `${BASE.replace(/^http/, "ws")}/ws/room?room=${room}&name=${encodeURIComponent(name)}`,
  { headers: { Origin: BASE } } as any,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

ws.addEventListener("open", () => console.log(`${name}: conectado a ${room}`));

ws.addEventListener("message", async (e) => {
  const msg = JSON.parse(String((e as MessageEvent).data));

  if (msg.t === "welcome") console.log(`${name}: slot ${msg.you.slot}`);

  if (msg.t === "countdown") {
    const texto: string = msg.text;
    const limite = Math.min(Number(chars), [...texto].length);
    await sleep(msg.startAt - msg.serverTime + 300);
    console.log(`${name}: tecleando ${limite} caracteres`);

    for (let i = 0; i < limite; i++) {
      ws.send(JSON.stringify({ t: "keys", n: i, ev: [Number(pace), texto.codePointAt(i)] }));
      await sleep(Number(pace));
    }
    console.log(`${name}: parado en ${limite}`);
  }

  if (msg.t === "roundEnd") {
    console.log(`${name}: fin de ronda`);
    for (const r of msg.results) {
      console.log(`   ${r.rank}º ${r.nickname.padEnd(10)} ${r.status.padEnd(12)} ${r.points} pts`);
    }
  }
});

// Se mantiene vivo hasta que lo maten.
await new Promise(() => {});
