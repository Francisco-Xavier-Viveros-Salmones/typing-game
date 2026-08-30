import { useEffect, useState } from "react";
import { alternarMusica, musicaActivada, restaurarMusica } from "../engine/music";
import { alternarSilencio, armarAudio, audioSilenciado } from "../engine/feel";

/**
 * Controles de sonido, fijos en una esquina.
 *
 * Dos interruptores separados a propósito: mucha gente quiere los golpes de
 * tecla pero no la música, o al revés.
 */
export function SoundBar() {
  const [musica, setMusica] = useState(false);
  const [mudo, setMudo] = useState(false);

  useEffect(() => {
    // Si ya la tenía encendida se reanuda sola; si el navegador lo bloquea por
    // falta de gesto, el botón queda listo para encenderla a mano.
    void restaurarMusica().then(setMusica);
    setMusica(musicaActivada());
  }, []);

  return (
    <div className="soundbar">
      <button
        className="btn btn-sm btn-ghost"
        aria-pressed={musica}
        title="Moonchild — M72"
        onClick={async () => {
          armarAudio();
          setMusica(await alternarMusica());
        }}
      >
        {musica ? "♪ Música" : "♪ Música off"}
      </button>
      <button
        className="btn btn-sm btn-ghost"
        aria-pressed={!mudo}
        onClick={() => {
          armarAudio();
          setMudo(alternarSilencio());
        }}
      >
        {mudo ? "Efectos off" : "Efectos"}
      </button>
    </div>
  );
}
