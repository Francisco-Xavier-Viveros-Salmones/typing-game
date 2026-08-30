import { useEffect, useMemo, useRef, useState } from "react";
import type { TypingState } from "../../shared/typing-rules";
import { computeWpm } from "../../shared/wpm";
import { Chat } from "../components/Chat";
import { Track } from "../components/Track";
import { Skull } from "../components/icons";
import { InputRouter, type InputMode } from "../engine/InputRouter";
import { TypingEngine } from "../engine/TypingEngine";
import { armarAudio, feel, sacudir } from "../engine/feel";
import type { RoomModel } from "../state/useRoom";

interface Marker {
  slot: number;
  index: number;
  color: string;
}

/**
 * El texto a teclear.
 *
 * Cada carácter recién acertado da un respingo, y el fallado tiembla — solo él,
 * no el panel entero: sacudir toda la pantalla por una errata cansa a los diez
 * segundos. Bajo la letra van los colores de cuadra de los rivales que van ahí.
 */
function Phrase({ text, index, state, markers, lastEvent }: {
  text: string;
  index: number;
  state: TypingState;
  markers: Marker[];
  lastEvent: { at: number; ok: boolean } | null;
}) {
  const chars = useMemo(() => [...text], [text]);

  const byIndex = useMemo(() => {
    const map = new Map<number, Marker[]>();
    for (const m of markers) {
      const list = map.get(m.index);
      if (list) list.push(m);
      else map.set(m.index, [m]);
    }
    return map;
  }, [markers]);

  const cls =
    state.state === "tripped" ? "phrase phrase-tripped"
    : state.state === "nitro" ? "phrase phrase-nitro"
    : "phrase";

  /**
   * Los caracteres se agrupan por palabra.
   *
   * Cada letra es su propio span, así que sin agrupar el navegador parte donde
   * le conviene y salen cortes como "Euro / pa". Un envoltorio por palabra con
   * `white-space: nowrap` mantiene la palabra entera, que es justo lo que el
   * ojo necesita para anticipar lo que va a teclear.
   */
  const words = useMemo(() => {
    const out: { start: number; chars: string[] }[] = [];
    let current: string[] = [];
    let start = 0;
    chars.forEach((ch, i) => {
      current.push(ch);
      if (ch === " ") {
        out.push({ start, chars: current });
        current = [];
        start = i + 1;
      }
    });
    if (current.length) out.push({ start, chars: current });
    return out;
  }, [chars]);

  return (
    <div className={cls}>
      {words.map((word) => (
        <span className="word" key={word.start}>
          {word.chars.map((ch, j) => {
            const i = word.start + j;
            const here = byIndex.get(i);
            const hit = lastEvent?.ok === true && i === index - 1;
            const miss = lastEvent?.ok === false && i === index;
            return (
              <span
                key={i}
                className={[
                  "ch",
                  i < index ? "ch-done" : i === index ? "ch-current" : "",
                  hit ? "ch-hit" : "",
                  miss ? "ch-miss" : "",
                ].filter(Boolean).join(" ")}
              >
                {ch}
                {here && (
                  <span className="ch-marks" aria-hidden="true">
                    {here.map((m) => (
                      <i key={m.slot} className="ch-dot" style={{ background: m.color }} />
                    ))}
                  </span>
                )}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

export function Race({ room, onAbandon }: { room: RoomModel; onAbandon: () => void }) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<TypingEngine | null>(null);
  const routerRef = useRef<InputRouter | null>(null);

  const [mode, setMode] = useState<InputMode>("typing");
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ at: number; ok: boolean } | null>(null);

  const round = room.round;

  /**
   * Que la carrera haya empezado lo decide el RELOJ, no un mensaje. Esperar a
   * un `tick` no funcionaba: los tick solo se emiten cuando alguien teclea, y
   * no se podía teclear hasta estar en marcha.
   */
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  startedRef.current = started;
  const running = started;

  /** El router y el motor duran más que una renderización: leen `room` por ref. */
  const roomRef = useRef(room);
  roomRef.current = room;

  const ultimoNitro = useRef(false);
  const ultimoTropiezo = useRef(false);
  const ultimoCajon = useRef<number | null>(null);

  useEffect(() => {
    const router = new InputRouter({
      getHiddenInput: () => hiddenRef.current,
      getChatInput: () => chatRef.current,
      onModeChange: setMode,
      isRaceRunning: () => startedRef.current,
      useTabForChat: () => true,
    });
    router.attach();
    routerRef.current = router;
    router.setMode("typing");
    return () => router.detach();
  }, []);

  useEffect(() => { if (running) routerRef.current?.setMode("typing"); }, [running]);
  useEffect(() => { setStarted(false); }, [round?.phraseId, round?.startAt]);

  // --- cajones de salida, contra el reloj del servidor ---
  useEffect(() => {
    if (!round) return;
    const id = setInterval(() => {
      const left = round.startAt - room.serverNow();
      const n = left > 0 ? Math.ceil(left / 1000) : null;
      setCountdown(n);

      // Un pitido por cajón; el disparo cuando se abren.
      if (n !== null && n !== ultimoCajon.current && n <= 3) feel.cajon();
      if (n === null && ultimoCajon.current !== null) feel.salida();
      ultimoCajon.current = n;

      if (left <= 0) setStarted(true);
      if (left <= 0 && room.settings.timeLimitSeconds > 0) {
        setRemaining(Math.max(0, room.settings.timeLimitSeconds + left / 1000));
      }
    }, 100);
    return () => clearInterval(id);
  }, [round?.startAt, room.settings.timeLimitSeconds]);

  // --- motor de tecleo ---
  useEffect(() => {
    if (!round || !hiddenRef.current) return;

    const engine = new TypingEngine({
      config: { text: round.text, mode: room.settings.mode, lives: round.lives },
      now: () => Math.max(0, roomRef.current.serverNow() - round.startAt),
      onFrame: (frame) => roomRef.current.send({ t: "keys", n: 0, ev: frame.ev }),
      // Filtra por MODO, no solo por foco: un evento suelto mientras se chatea
      // grabaría pulsaciones fantasma.
      canType: () => routerRef.current?.getMode() === "typing" && startedRef.current,
      onState: (state) => {
        setTyping((prev) => {
          const acerto = state.index > (prev?.index ?? 0);
          const fallo = state.errors > (prev?.errors ?? 0);
          if (acerto) feel.tecla();
          if (fallo) feel.fallo();
          if (acerto || fallo) setLastEvent({ at: performance.now(), ok: acerto });
          return state;
        });

        if (state.state === "nitro" && !ultimoNitro.current) feel.nitro();
        ultimoNitro.current = state.state === "nitro";

        if (state.state === "tripped" && !ultimoTropiezo.current) feel.tropiezo();
        ultimoTropiezo.current = state.state === "tripped";

        if (state.done && state.outcome === "finished") {
          // El fogonazo de la cámara de llegada. Es el único momento en que la
          // pantalla se sacude: si sacudiera por cualquier cosa, no diría nada.
          feel.meta();
          sacudir();
          setFlash(true);
          setTimeout(() => setFlash(false), 450);
        }
      },
    });

    engine.attach(hiddenRef.current);
    engineRef.current = engine;
    setTyping(engine.getState());
    return () => { engine.detach(); engineRef.current = null; };
  }, [round?.phraseId, round?.startAt]);

  if (!round) return <div className="panel">Preparando la carrera…</div>;

  const maxLives = room.settings.mode === "vidas" ? round.lives : 0;
  const colorBySlot = new Map(room.players.map((p) => [p.slot, p.color]));
  const markers: Marker[] = [...room.tick.values()]
    .filter((t) => t.slot !== room.mySlot && !t.done)
    .map((t) => ({ slot: t.slot, index: t.index, color: colorBySlot.get(t.slot) ?? "#91a396" }));

  const elapsed = Math.max(1, roomRef.current.serverNow() - round.startAt);
  const liveWpm = running && typing ? computeWpm(typing.index, elapsed) : 0;

  return (
    <div className="race" onPointerDown={armarAudio}>
      {flash && <div className="flash" aria-hidden="true" />}

      <header className="race-head">
        <div>
          <p className="eyebrow">Carrera {round.round} de {round.totalRounds}</p>
          <h2>{room.settings.category}</h2>
        </div>
        <div className="race-tools">
          <div className="live-wpm">
            {liveWpm}
            <small>ppm</small>
          </div>
          {remaining !== null && running && (
            <div className="live-wpm">
              <span className="timer">{Math.ceil(remaining)}</span>
              <small>seg</small>
            </div>
          )}
          <button className="btn btn-danger btn-sm" onClick={onAbandon} disabled={!running}>
            <Skull size={14} weight="fill" /> Retirarse
          </button>
        </div>
      </header>

      {countdown !== null && (
        <div className="countdown" role="status" aria-live="assertive">
          <div className="countdown-num" key={countdown}>{countdown}</div>
          <div className="countdown-label">En los cajones</div>
        </div>
      )}

      <Track
        players={room.players}
        tick={room.tick}
        textLength={[...round.text].length}
        mySlot={room.mySlot}
        maxLives={maxLives}
      />

      <section className="typing-area">
        <Phrase
          text={round.text}
          index={typing?.index ?? 0}
          state={typing ?? ({ state: "normal" } as TypingState)}
          markers={markers}
          lastEvent={lastEvent}
        />
        {/* Campo real fuera de pantalla: es lo que hace funcionar los teclados
            móviles y la composición de acentos. */}
        <input
          ref={hiddenRef} className="hidden-input"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          aria-label="Escribe la frase"
        />
        <p className="typing-hint">
          {mode === "chat"
            ? <>Hablando por el chat · <kbd>Esc</kbd> vuelve a la carrera</>
            : <><kbd>Tab</kbd> para hablar</>}
        </p>
      </section>

      <Chat
        lines={room.chat}
        active={mode === "chat"}
        inputRef={chatRef}
        onSend={(text) => room.send({ t: "chat", text })}
        onLeave={() => routerRef.current?.setMode("typing")}
        hint="Escribe y pulsa Enter"
      />
    </div>
  );
}
