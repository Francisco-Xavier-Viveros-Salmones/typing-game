/**
 * Música de fondo: *Moonchild*, de M72.
 *
 * El original es un módulo Impulse Tracker de 452 KB que bucla perfecto, pero
 * ningún navegador reproduce .it de forma nativa. Convertirlo a Opus cuesta
 * 2,1 MB, así que el archivo NO se descarga hasta que alguien enciende la
 * música: quien no la quiere no paga un solo byte.
 *
 * ponytail: reproducir el módulo tal cual daría 452 KB y un bucle exacto, pero
 * exige vendorizar libopenmpt.js (wasm). Si el bucle audible molesta o el peso
 * importa, ese es el cambio; mientras tanto, un <audio loop> son dos líneas.
 */

const PREF_KEY = "caballos:musica";

let element: HTMLAudioElement | null = null;

function crear(): HTMLAudioElement {
  const audio = new Audio();
  audio.loop = true;
  audio.volume = 0.35;   // es fondo: nunca debe tapar el sonido de las teclas
  audio.preload = "none";

  // Opus donde se pueda; el mp3 es el respaldo para quien no lo soporte.
  const puedeOpus = audio.canPlayType('audio/ogg; codecs="opus"') !== "";
  audio.src = puedeOpus ? "/audio/moonchild.opus.ogg" : "/audio/moonchild.mp3";
  return audio;
}

export function musicaActivada(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false; // modo privado o almacenamiento bloqueado
  }
}

function guardarPreferencia(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch { /* la preferencia se pierde, la música no */ }
}

/**
 * Enciende o apaga. Devuelve el estado resultante.
 * La reproducción necesita un gesto del usuario, así que solo se llama desde
 * un clic.
 */
export async function alternarMusica(): Promise<boolean> {
  if (!element) element = crear();

  if (!element.paused) {
    element.pause();
    guardarPreferencia(false);
    return false;
  }

  try {
    await element.play();
    guardarPreferencia(true);
    return true;
  } catch {
    // El navegador puede rechazarlo si no hubo gesto; no es un error visible.
    guardarPreferencia(false);
    return false;
  }
}

/** Reanuda si el jugador ya la tenía encendida en una visita anterior. */
export async function restaurarMusica(): Promise<boolean> {
  if (!musicaActivada()) return false;
  if (!element) element = crear();
  try {
    await element.play();
    return true;
  } catch {
    return false; // sin gesto previo el navegador lo bloquea; se enciende a mano
  }
}

export function volumenMusica(v: number) {
  if (element) element.volume = Math.max(0, Math.min(1, v));
}
