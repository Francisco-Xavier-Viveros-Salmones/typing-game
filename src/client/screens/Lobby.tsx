import { useRef, useState } from "react";
import { Chat } from "../components/Chat";
import { Credits } from "../components/Credits";
import {
  CheckCircle, ClipboardText, Crown, Gear, HorseIcon, Hourglass, PaintBrush,
} from "../components/icons";
import { SaddleNumber, Silks } from "../components/Silks";
import { copyToClipboard, inviteUrl } from "../lib/links";
import type { RoomModel } from "../state/useRoom";

const COLORS = ["#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#9d4edd", "#f4a261"];

const CATEGORIES = [
  ["historia", "Historia y Cultura"],
  ["ciencia", "Ciencia y Naturaleza"],
  ["tecnologia", "Tecnología y Computación"],
  ["geografia", "Geografía y Universo"],
] as const;

export function Lobby({ room, onLeave }: { room: RoomModel; onLeave: () => void }) {
  const chatRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");

  const me = room.players.find((p) => p.slot === room.mySlot);
  const isOwner = me?.isOwner ?? false;
  const ready = room.players.filter((p) => p.isReady).length;
  const usedColors = new Set(room.players.filter((p) => p.slot !== room.mySlot).map((p) => p.color));

  const patch = (partial: Record<string, unknown>) =>
    room.send({ t: "settings", settings: partial as never });

  // Se copia el enlace completo, no el código: pegar una URL en un chat es un
  // paso, dictar seis letras son tres.
  async function copiarInvitacion() {
    setCopied(await copyToClipboard(inviteUrl(room.roomCode)));
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="lobby">
      <header className="lobby-head">
        <div>
          <p className="eyebrow">Sala</p>
          <h2 className="room-code">{room.roomCode}</h2>
        </div>
        <button className="btn" onClick={copiarInvitacion}>
          {copied ? <CheckCircle size={15} weight="fill" /> : <ClipboardText size={15} />}
          {copied ? "Copiado" : "Copiar invitación"}
        </button>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h3>Participantes <span className="muted">{room.players.length}/6</span></h3>
        </div>

        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.slot} className={p.slot === room.mySlot ? "me" : ""}>
              <SaddleNumber slot={p.slot} color={p.color} />
              <Silks slot={p.slot} color={p.color} size={24} title={`Colores de ${p.nickname}`} />
              <span className="player-name">{p.nickname}</span>
              {p.isOwner && <Crown size={14} weight="fill" className="owner-mark" />}
              {p.isGuest && <span className="tag">invitado</span>}
              <span className={`status ${p.isReady ? "ok" : "wait"}`}>
                {p.isReady ? <CheckCircle size={15} weight="fill" /> : <Hourglass size={15} />}
                {p.isReady ? "Listo" : "Esperando"}
              </span>
            </li>
          ))}
        </ul>

        <div className="row">
          <input
            className="input"
            placeholder="Cambiar apodo"
            maxLength={15}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn btn-ghost"
            disabled={!name.trim()}
            onClick={() => {
              room.send({ t: "setName", name });
              setName("");
            }}
          >
            Renombrar
          </button>
        </div>

        <div className="row colors">
          <span className="row-label"><PaintBrush size={15} /> Tus colores</span>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch${me?.color === c ? " on" : ""}`}
              style={{ ["--c" as string]: c }}
              disabled={usedColors.has(c)}
              title={usedColors.has(c) ? "Ya lo tiene otro jinete" : "Elegir este color"}
              onClick={() => room.send({ t: "setColor", color: c })}
            >
              <Silks slot={room.mySlot < 0 ? 0 : room.mySlot} color={c} size={26} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3><Gear size={17} weight="fill" /> Reglas</h3>
          {!isOwner && <span className="muted">las decide el anfitrión</span>}
        </div>

        <div className="settings-grid">
          <label>
            Rondas
            <select value={room.settings.totalRounds} disabled={!isOwner}
                    onChange={(e) => patch({ totalRounds: Number(e.target.value) })}>
              <option value={1}>1</option><option value={3}>3</option><option value={5}>5</option>
            </select>
          </label>

          <label>
            Idioma
            <select value={room.settings.lang} disabled={!isOwner}
                    onChange={(e) => patch({ lang: e.target.value })}>
              <option value="es">Español</option><option value="en">English</option>
            </select>
          </label>

          <label>
            Categoría
            <select value={room.settings.category} disabled={!isOwner}
                    onChange={(e) => patch({ category: e.target.value })}>
              {CATEGORIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>

          <label>
            Dificultad
            <select value={room.settings.difficulty} disabled={!isOwner}
                    onChange={(e) => patch({ difficulty: e.target.value })}>
              <option value="facil">Fácil</option>
              <option value="normal">Normal</option>
              <option value="dificil">Difícil</option>
            </select>
          </label>

          <label>
            Modo
            <select value={room.settings.mode} disabled={!isOwner}
                    onChange={(e) => patch({ mode: e.target.value })}>
              <option value="normal">Normal</option>
              <option value="sudden_death">Muerte súbita</option>
              <option value="vidas">Por vidas</option>
            </select>
          </label>

          <label>
            Límite de tiempo
            <select value={room.settings.timeLimitSeconds} disabled={!isOwner}
                    onChange={(e) => patch({ timeLimitSeconds: Number(e.target.value) })}>
              <option value={0}>Sin límite</option>
              <option value={30}>30 s</option>
              <option value={60}>60 s</option>
              <option value={120}>120 s</option>
            </select>
          </label>
        </div>
      </section>

      <Chat
        lines={room.chat}
        active
        inputRef={chatRef}
        onSend={(text) => room.send({ t: "chat", text })}
        onLeave={() => {}}
      />

      <div className="lobby-actions">
        {isOwner ? (
          <button className="btn btn-primary btn-lg" onClick={() => room.send({ t: "start" })}>
            Iniciar carrera
            {ready < room.players.length && (
              <span className="muted"> ({ready}/{room.players.length} listos)</span>
            )}
          </button>
        ) : (
          <button
            className={`btn btn-lg ${me?.isReady ? "btn-ghost" : "btn-primary"}`}
            onClick={() => room.send({ t: "ready", ready: !me?.isReady })}
          >
            {me?.isReady ? "Ya no estoy listo" : "Estoy listo"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={onLeave}>Salir de la sala</button>
      </div>

      <Credits />
    </div>
  );
}
