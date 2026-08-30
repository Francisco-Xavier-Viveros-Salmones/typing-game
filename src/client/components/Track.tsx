import { useEffect, useRef } from "react";
import type { PlayerView, TickPlayer } from "../../shared/protocol";
import { Crown, Fire, Flag, HorseIcon, Lives, Skull } from "./icons";
import { SaddleNumber, Silks } from "./Silks";

interface TrackProps {
  players: PlayerView[];
  tick: Map<number, TickPlayer>;
  textLength: number;
  mySlot: number;
  maxLives: number;
}

/**
 * La pista.
 *
 * La posición del caballo se escribe directamente sobre el `style.transform` de
 * un ref, dentro de un requestAnimationFrame — nunca por estado de React. Con
 * ticks a 15 Hz, dejar que React repinte cada carril daría un movimiento a
 * saltos; interpolando se ve fluido a 60 fps con la misma información.
 */
export function Track({ players, tick, textLength, mySlot, maxLives }: TrackProps) {
  const laneRefs = useRef(new Map<number, HTMLDivElement>());

  /**
   * La posición se escribe como `left: X%` y el navegador la suaviza con una
   * transición CSS, igual que en la versión original.
   *
   * Antes interpolaba a mano con requestAnimationFrame y suavizado exponencial:
   * técnicamente más control, pero se sentía flotante y siempre iba por detrás
   * del jugador. Una transición corta y lineal se lee como un caballo corriendo.
   * Sigue sin pasar por React: se escribe sobre el ref.
   */
  useEffect(() => {
    for (const [slot, el] of laneRefs.current) {
      const t = tick.get(slot);
      const p = t && textLength > 0 ? Math.min(1, t.index / textLength) : 0;
      // Se descuenta el ancho del sprite para que no se salga por el poste.
      el.style.left = `calc(${(p * 100).toFixed(2)}% - ${(p * 34).toFixed(1)}px)`;
    }
  }, [tick, textLength]);

  return (
    <div className="track-list">
      {players.map((p) => {
        const t = tick.get(p.slot);
        const eliminated = t?.done && (t?.index ?? 0) < textLength;
        return (
          <div key={p.slot} className={`lane${p.slot === mySlot ? " lane-mine" : ""}`}>
            {/* Dorsal, colores de cuadra y nombre: el orden del programa. */}
            <div className="lane-id">
              <SaddleNumber slot={p.slot} color={p.color} />
              <Silks slot={p.slot} color={p.color} size={22} title={`Colores de ${p.nickname}`} />
              <span className="lane-name">
                {p.nickname}
                {p.isOwner && <Crown size={12} weight="fill" className="owner-mark" />}
                {!p.connected && <span className="lane-offline">fuera</span>}
              </span>
              {maxLives > 0 && <Lives current={t?.lives ?? maxLives} max={maxLives} />}
            </div>

            <div className="lane-strip">
              <div className="lane-finish" aria-hidden="true" />
              <div
                className={`lane-horse${t?.state === "nitro" ? " nitro" : ""}${
                  t?.state === "tripped" ? " tripped" : ""
                }`}
                ref={(el) => {
                  if (el) laneRefs.current.set(p.slot, el);
                  else laneRefs.current.delete(p.slot);
                }}
              >
                {eliminated ? (
                  <Skull size={26} weight="fill" color="#5d7064" />
                ) : t?.done ? (
                  <Flag size={26} weight="fill" color={p.color} />
                ) : (
                  <HorseIcon slot={p.slot} size={26} />
                )}
                {t?.state === "nitro" && <Fire size={14} weight="fill" className="nitro-flame" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
