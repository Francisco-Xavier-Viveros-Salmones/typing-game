import { useEffect, useRef, useState } from "react";
import type { ChatLine } from "../state/useRoom";
import { HorseIcon } from "./icons";

interface ChatProps {
  lines: ChatLine[];
  onSend: (text: string) => void;
  /** El router del teclado es el dueño del foco; el chat solo lo obedece. */
  active: boolean;
  onLeave: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  hint?: string;
}

export function Chat({ lines, onSend, active, onLeave, inputRef, hint }: ChatProps) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Solo se auto-desplaza si ya estaba abajo: si el jugador subió a leer,
    // un mensaje nuevo no debe arrancarle la vista.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function submit() {
    const text = draft.trim();
    if (text) onSend(text);
    setDraft("");
  }

  return (
    <div className={`chat${active ? " chat-active" : ""}`}>
      <div className="chat-lines" ref={scroller} role="log" aria-live="polite">
        {lines.length === 0 && <p className="chat-empty">Nadie ha dicho nada todavía.</p>}
        {lines.map((line) => (
          <p key={line.id} className="chat-line">
            <span className="chat-author" style={{ color: line.color }}>
              <HorseIcon color={line.color} size={14} />
              {/* React pinta esto como nodo de texto: el HTML no se interpreta.
                  El servidor además ya lo ha saneado. Dos capas independientes. */}
              {line.nickname}
            </span>
            <span className="chat-text">{line.text}</span>
          </p>
        ))}
      </div>

      <input
        ref={inputRef}
        className="chat-input"
        value={draft}
        maxLength={200}
        placeholder={hint ?? "Escribe un mensaje…"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // El router no toca el foco en modo chat; estas teclas son cosa suya.
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
            onLeave();
          } else if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            onLeave();
          }
          e.stopPropagation();
        }}
      />
    </div>
  );
}
