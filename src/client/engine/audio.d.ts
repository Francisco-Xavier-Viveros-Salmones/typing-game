/**
 * El motor de audio venía de la versión vanilla y nunca llegó a conectarse al
 * cliente React. Son osciladores de WebAudio, sin un solo archivo de sonido.
 */
declare const AudioEngine: {
  init(): void;
  setVolume(v: number): void;
  playBeep(): void;
  playGo(): void;
  playError(): void;
  playGunshot(): void;
  playPowerUp(): void;
  playTrip(): void;
  playTypeSound(): void;
  playFinishSound(): void;
  playMusic(): void;
  stopMusic(): void;
};
export default AudioEngine;
