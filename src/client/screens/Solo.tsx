import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeGhost, encodeGhost, ghostCharAt } from "../../shared/ghost";
import type { TypingState } from "../../shared/typing-rules";
import { Credits } from "../components/Credits";
import { Flag, HorseIcon, Hourglass } from "../components/icons";
import { InputRouter } from "../engine/InputRouter";
import { TypingEngine } from "../engine/TypingEngine";
import { decodeBase64, encodeBase64, fetcher, post } from "../lib/api";

/**
 * Modo solo contra tu propio récord.
 *
 * No usa Durable Object: una carrera de una persona no necesita servidor
 * autoritativo. Es una frase, un fantasma y un resultado, así que también es la
 * vía más barata para validar el códec.
 */

interface Phrase {
  id: string;
  text: string;
  lang: string;
  category: string;
  difficulty: string;
}

interface GhostData {
  wpm: number;
  accuracy: number;
  durationMs: number;
  data: string;
}

const DIFICULTADES = [
  ["facil", "Fácil"],
  ["normal", "Normal"],
  ["dificil", "Difícil"],
] as const;

export function Solo({ onBack }: { onBack: () => void }) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<TypingEngine | null>(null);
  const routerRef = useRef<InputRouter | null>(null);
  const startedAt = useRef(0);

  const [difficulty, setDifficulty] = useState<"facil" | "normal" | "dificil">("normal");
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [ghost, setGhost] = useState<GhostData | null>(null);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ wpm: number; accuracy: number; ghostSaved: boolean } | null>(null);

  const chars = useMemo(() => (phrase ? [...phrase.text] : []), [phrase]);

  // Tiempos del fantasma, decodificados una sola vez por carrera.
  const ghostTimes = useMemo(() => {
    if (!ghost) return null;
    try {
      return decodeGhost(decodeBase64(ghost.data)).charTimes;
    } catch {
      return null; // grabación corrupta: se corre sin fantasma
    }
  }, [ghost]);

  const cargar = useCallback(async () => {
    setResult(null);
    setTyping(null);
    setRunning(false);
    const p = await fetcher<Phrase>(`/api/phrases/random?difficulty=${difficulty}`);
    setPhrase(p);
    const g = await fetcher<{ ghost: GhostData | null }>(`/api/ghosts/pb?phrase=${p.id}`);
    setGhost(g.ghost);
  }, [difficulty]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Router de teclado: mismo árbitro que en multijugador.
  useEffect(() => {
    const router = new InputRouter({
      getHiddenInput: () => hiddenRef.current,
      getChatInput: () => null,        // en solo no hay chat
      isRaceRunning: () => true,
      useTabForChat: () => false,
    });
    router.attach();
    routerRef.current = router;
    router.setMode("typing");
    return () => router.detach();
  }, []);

  // Movimiento de los dos caballos, fuera de React.
  useEffect(() => {
    let raf = 0;
    const step = () => {
      if (running && chars.length > 0) {
        const t = performance.now() - startedAt.current;
        if (meRef.current) {
          const p = Math.min(1, (engineRef.current?.getState().index ?? 0) / chars.length);
          meRef.current.style.left = `calc(${(p * 100).toFixed(2)}% - ${(p * 34).toFixed(1)}px)`;
        }
        if (ghostRef.current && ghostTimes) {
          // El fantasma sí se interpola en cada cuadro: su posición viene de una
          // grabación continua, no de saltos de un carácter.
          const p = Math.min(1, ghostCharAt(ghostTimes, t) / chars.length);
          ghostRef.current.style.left = `calc(${(p * 100).toFixed(2)}% - ${(p * 34).toFixed(1)}px)`;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, chars.length, ghostTimes]);

  function empezar() {
    if (!phrase) return;
    startedAt.current = performance.now();
    setRunning(true);

    const charTimes: number[] = [];
    const errorLog: [number, number][] = [];

    const engine = new TypingEngine({
      config: { text: phrase.text, mode: "normal", lives: 0 },
      now: () => performance.now() - startedAt.current,
      canType: () => routerRef.current?.getMode() === "typing",
      onFrame: () => {},   // en solo no hay a quién mandar nada
      onState: (state) => {
        setTyping(state);
        // El log se construye aquí porque es también la grabación del fantasma.
        if (state.index > charTimes.length) charTimes.push(performance.now() - startedAt.current);
        if (state.done) void terminar(state, charTimes, errorLog);
      },
    });
    engine.attach(hiddenRef.current!);
    engineRef.current = engine;
    hiddenRef.current?.focus();
  }

  async function terminar(state: TypingState, charTimes: number[], errorLog: [number, number][]) {
    const durationMs = performance.now() - startedAt.current;
    setRunning(false);
    engineRef.current?.detach();

    const bytes = encodeGhost({ charTimes, errors: errorLog, durationMs });
    const res = await post<{ wpm: number; accuracy: number; ghostSaved: boolean }>("/api/solo/result", {
      phraseId: phrase!.id,
      charsTyped: state.index,
      charsTotal: chars.length,
      errors: state.errors,
      durationMs: Math.round(durationMs),
      ghost: encodeBase64(bytes),
    });
    setResult(res);
  }

  return (
    <div className="solo">
      <div className="card-title"><h2>Contrarreloj</h2></div>

      <section className="panel">
        <div className="panel-head">
          <h3>Tu récord</h3>
          <div className="row" style={{ marginTop: 0 }}>
            {DIFICULTADES.map(([v, label]) => (
              <button
                key={v}
                className={`btn btn-sm${difficulty === v ? " btn-primary" : " btn-ghost"}`}
                disabled={running}
                onClick={() => setDifficulty(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="track-list">
          <div className="lane lane-mine">
            <div className="lane-head"><span className="lane-name">Tú</span></div>
            <div className="lane-strip">
              <div className="lane-finish" aria-hidden="true" />
              <div className="lane-horse" ref={meRef}>
                {typing?.done ? <Flag size={26} weight="fill" color="#ffb43c" />
                              : <HorseIcon slot={0} size={28} />}
              </div>
            </div>
          </div>

          <div className="lane">
            <div className="lane-head">
              <span className="lane-name" style={{ color: "#8f93a3" }}>
                {ghost ? `Tu récord · ${Math.round(ghost.wpm)} WPM` : "Sin récord todavía"}
              </span>
            </div>
            <div className="lane-strip">
              <div className="lane-finish" aria-hidden="true" />
              <div className="lane-horse lane-ghost" ref={ghostRef} style={{ opacity: ghost ? 0.45 : 0.12 }}>
                <HorseIcon slot={1} size={28} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="typing-area">
        <div className="phrase">
          {chars.map((ch, i) => (
            <span key={i} className={i < (typing?.index ?? 0) ? "ch ch-done" : i === (typing?.index ?? 0) && running ? "ch ch-current" : "ch"}>
              {ch}
            </span>
          ))}
        </div>
        <input ref={hiddenRef} className="hidden-input" autoComplete="off" autoCorrect="off"
               autoCapitalize="off" spellCheck={false} aria-label="Escribe la frase" />
      </section>

      {result && (
        <section className="panel">
          <div className="stat-grid">
            <div className="stat"><div className="stat-value hot">{result.wpm}</div><div className="stat-label">WPM</div></div>
            <div className="stat"><div className="stat-value">{Math.round(result.accuracy * 100)}%</div><div className="stat-label">Precisión</div></div>
            <div className="stat">
              <div className="stat-value">{result.ghostSaved ? "SÍ" : "NO"}</div>
              <div className="stat-label">{result.ghostSaved ? "Nuevo récord" : "Sin récord"}</div>
            </div>
          </div>
        </section>
      )}

      <div className="lobby-actions">
        {!running && !result && (
          <button className="btn btn-primary btn-lg" onClick={empezar} disabled={!phrase}>
            <Hourglass size={16} weight="fill" /> Empezar
          </button>
        )}
        {(result || running) && (
          <button className="btn btn-ghost btn-lg" onClick={() => void cargar()}>Otra frase</button>
        )}
        <button className="btn btn-ghost" onClick={onBack}>Volver</button>
      </div>

      <Credits />
    </div>
  );
}
