import AudioEngine from "./audio.js";

/**
 * Game feel: sonido y respuesta física.
 *
 * Se centraliza aquí para que las pantallas pidan "esto ha pasado" en vez de
 * decidir cómo suena. El audio de WebAudio necesita un gesto del usuario para
 * arrancar, así que el primer clic o tecla lo desbloquea.
 */

let armado = false;
let silencio = false;

export function armarAudio() {
  if (armado) return;
  armado = true;
  try {
    AudioEngine.init();
  } catch {
    silencio = true; // sin audio el juego sigue: nunca es un error visible
  }
}

export const audioSilenciado = () => silencio;

export function alternarSilencio(): boolean {
  silencio = !silencio;
  AudioEngine.setVolume(silencio ? 0 : 1);
  return silencio;
}

function seguro(fn: () => void) {
  if (silencio || !armado) return;
  try { fn(); } catch { /* un fallo de audio nunca interrumpe la carrera */ }
}

export const feel = {
  tecla: () => seguro(() => AudioEngine.playTypeSound()),
  fallo: () => seguro(() => AudioEngine.playError()),
  nitro: () => seguro(() => AudioEngine.playPowerUp()),
  tropiezo: () => seguro(() => AudioEngine.playTrip()),
  /** Los tres pitidos de los cajones. */
  cajon: () => seguro(() => AudioEngine.playBeep()),
  /** El disparo de salida. */
  salida: () => seguro(() => AudioEngine.playGunshot()),
  meta: () => seguro(() => AudioEngine.playFinishSound()),
  mensaje: () => seguro(() => AudioEngine.playBeep()),
};

/**
 * Sacudida corta de la pantalla. Se usa solo en la llegada: si sacude por
 * cualquier cosa deja de significar nada.
 */
export function sacudir(ms = 220) {
  const el = document.body;
  el.style.animation = `none`;
  // Forzar reflow para poder relanzar la misma animación.
  void el.offsetHeight;
  el.style.animation = `shake-screen ${ms}ms ease-out`;
  setTimeout(() => { el.style.animation = ""; }, ms);
}
