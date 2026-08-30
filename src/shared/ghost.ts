/**
 * Códec de fantasmas.
 *
 * Se graban PULSACIONES, no muestras de progreso. Muestrear a 20 Hz durante
 * 60 s son 1200 muestras; el stream de una frase difícil de 260 caracteres son
 * ~300 eventos. Es más pequeño, reconstruye la carrera exacta —incluida la
 * pausa antes de una palabra difícil, que es lo que hace que un fantasma se
 * sienta humano— y, sobre todo, es el MISMO dato que el servidor ya guarda
 * para anti-cheat. Grabar el fantasma sale gratis.
 *
 * Formato v1 (little-endian):
 *   cabecera 12 B: u8 version | u8 flags | u16 charCount | u32 durationMs
 *                  u16 errorCount | u16 reservado
 *   cuerpo: charCount × varint(dt desde el carácter correcto anterior)
 *           errorCount × [varint(índice), varint(ms desde la salida)]
 *
 * Sin gzip: a 500 bytes la cabecera de gzip cuesta más de lo que ahorra, y
 * obligaría a una API async de streaming en ambos extremos para nada.
 */

export const GHOST_FORMAT_VERSION = 1;
export const MAX_GHOST_BYTES = 4096;
const HEADER_BYTES = 12;
const FLAG_HAS_ERRORS = 1;

export interface GhostRun {
  /** Milisegundos desde la salida de cada carácter correcto, en orden. */
  charTimes: number[];
  /** Errores como [índiceEnLaFrase, msDesdeLaSalida]. */
  errors: [number, number][];
  durationMs: number;
}

// --- LEB128 sin signo -------------------------------------------------------

function writeVarint(out: number[], value: number) {
  let v = Math.max(0, Math.trunc(value));
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

function readVarint(bytes: Uint8Array, pos: { i: number }): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (pos.i >= bytes.length) throw new Error("fantasma truncado");
    const byte = bytes[pos.i++]!;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result >>> 0;
    shift += 7;
    if (shift > 35) throw new Error("varint corrupto");
  }
}

// --- codificar / decodificar ------------------------------------------------

export function encodeGhost(run: GhostRun): Uint8Array {
  const body: number[] = [];

  // Los tiempos son acumulativos; se guardan las diferencias, que caben en
  // 1 byte para cualquier intervalo humano por debajo de 128 ms.
  let prev = 0;
  for (const t of run.charTimes) {
    writeVarint(body, Math.max(0, Math.round(t - prev)));
    prev = Math.max(prev, t);
  }
  for (const [index, at] of run.errors) {
    writeVarint(body, index);
    writeVarint(body, at);
  }

  const out = new Uint8Array(HEADER_BYTES + body.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, GHOST_FORMAT_VERSION);
  view.setUint8(1, run.errors.length > 0 ? FLAG_HAS_ERRORS : 0);
  view.setUint16(2, run.charTimes.length, true);
  view.setUint32(4, Math.max(0, Math.round(run.durationMs)), true);
  view.setUint16(8, run.errors.length, true);
  view.setUint16(10, 0, true);
  out.set(body, HEADER_BYTES);

  return out;
}

export function decodeGhost(bytes: Uint8Array): GhostRun {
  if (bytes.length < HEADER_BYTES) throw new Error("fantasma demasiado corto");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== GHOST_FORMAT_VERSION) throw new Error(`versión de fantasma no soportada: ${version}`);

  const charCount = view.getUint16(2, true);
  const durationMs = view.getUint32(4, true);
  const errorCount = view.getUint16(8, true);

  const pos = { i: HEADER_BYTES };
  const charTimes: number[] = [];
  let acc = 0;
  for (let i = 0; i < charCount; i++) {
    acc += readVarint(bytes, pos);
    charTimes.push(acc);
  }

  const errors: [number, number][] = [];
  for (let i = 0; i < errorCount; i++) {
    errors.push([readVarint(bytes, pos), readVarint(bytes, pos)]);
  }

  return { charTimes, errors, durationMs };
}

// --- reproducción -----------------------------------------------------------

/**
 * Índice fraccionario del fantasma en el instante t.
 *
 * Interpola linealmente entre los dos caracteres que rodean a t, para que el
 * caballo fantasma se mueva a 60 fps en vez de teletransportarse carácter a
 * carácter. Búsqueda binaria: charTimes está ordenado por construcción.
 */
export function ghostCharAt(charTimes: readonly number[], tMs: number): number {
  const n = charTimes.length;
  if (n === 0) return 0;
  if (tMs <= 0) return 0;
  if (tMs >= charTimes[n - 1]!) return n;

  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (charTimes[mid]! < tMs) lo = mid + 1;
    else hi = mid;
  }

  // `lo` es el primer índice con charTimes[lo] >= tMs. La posición vale `lo` en
  // `before` y `lo + 1` en `after`, así que se interpola desde `before`.
  // (Restar desde `after` daba fracciones negativas.)
  const after = charTimes[lo]!;
  const before = lo === 0 ? 0 : charTimes[lo - 1]!;
  const span = after - before;
  if (span <= 0) return lo;
  return lo + (tMs - before) / span;
}

/** Convierte el estado que lleva el motor de tecleo en una grabación. */
export function runFromKeystrokes(
  charTimes: readonly number[],
  errors: readonly [number, number][],
): GhostRun {
  const duration = charTimes.length > 0 ? charTimes[charTimes.length - 1]! : 0;
  return { charTimes: [...charTimes], errors: [...errors], durationMs: duration };
}
