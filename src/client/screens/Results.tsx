import type { FinishStatus } from "../../shared/scoring";
import { Credits } from "../components/Credits";
import { HorseIcon, RankBadge, RankDelta } from "../components/icons";
import { SaddleNumber, Silks } from "../components/Silks";
import type { RoomModel } from "../state/useRoom";

/**
 * Etiquetas de los estados sin tiempo. Nunca se muestra un 0.0s para quien no
 * terminó: ese centinela era exactamente el bug que ponía al que abandonaba en
 * primer puesto.
 */
const STATUS_LABEL: Record<FinishStatus, string> = {
  finished: "",
  timeout: "Sin tiempo",
  eliminated: "Eliminado",
  disconnected: "Desconectado",
  dnf: "Abandonó",
};

export function Results({ room, onNext, onLobby }: {
  room: RoomModel;
  onNext: () => void;
  onLobby: () => void;
}) {
  const byColor = new Map(room.players.map((p) => [p.slot, p.color]));
  const totals = new Map(room.standings.map((s) => [s.slot, s]));
  const isOwner = room.players.find((p) => p.slot === room.mySlot)?.isOwner ?? false;

  return (
    <div className="results">
      <header className="results-head">
        <p className="eyebrow">{room.hasNextRound ? "Fin de carrera" : "Fin de la jornada"}</p>
        <h2>{room.hasNextRound ? "Llegada" : "Clasificación final"}</h2>
      </header>

      {/* Photo finish: los tres primeros congelados en el poste, en orden y a
          la distancia real a la que cruzaron. Es la imagen que la gente busca
          después de una carrera. */}
      <div className="photo-finish">
        {room.results.slice(0, 4).map((r, i) => {
          const finished = r.status === "finished" && r.finishMs !== null;
          const lider = room.results.find((x) => x.finishMs !== null)?.finishMs ?? 1;
          // Cuanto más tarde llegó, más atrás queda en la foto.
          const atras = finished ? Math.min(58, ((r.finishMs! - lider) / lider) * 110) : 62;
          return (
            <div className="pf-row" key={r.slot} style={{ paddingLeft: `calc(74% - ${atras}%)` }}>
              <SaddleNumber slot={r.slot} color={byColor.get(r.slot) ?? "#91a396"} />
              <HorseIcon slot={r.slot} size={26} />
              <span className="pf-name">{r.nickname}</span>
            </div>
          );
        })}
      </div>

      <div className="table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>Pos.</th><th>Jinete</th><th>WPM</th><th>Tiempo</th>
              <th>Prec.</th><th>Errores</th><th>Ronda</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {room.results.map((r) => {
              const standing = totals.get(r.slot);
              const finished = r.status === "finished" && r.finishMs !== null;
              return (
                <tr key={r.slot} className={r.slot === room.mySlot ? "me" : ""}>
                  <td>
                    <div className="pos-cell">
                      <RankBadge rank={r.rank} />
                      {room.results.length > 1 && standing && (
                        <RankDelta delta={standing.rankDelta} />
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="rider">
                      <Silks slot={r.slot} color={byColor.get(r.slot) ?? "#91a396"} size={20} />
                      {r.nickname}
                    </span>
                  </td>
                  <td>{finished ? r.wpm : "—"}</td>
                  <td className={finished ? "" : "dnf"}>
                    {finished ? `${(r.finishMs! / 1000).toFixed(1)}s` : STATUS_LABEL[r.status]}
                  </td>
                  <td>{finished ? `${Math.round(r.accuracy * 100)}%` : "—"}</td>
                  <td className="errors">{r.errors}</td>
                  <td className="points">+{r.points}</td>
                  <td className="total">{standing?.totalPoints ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="results-actions">
        {room.hasNextRound ? (
          isOwner ? (
            <button className="btn btn-primary btn-lg" onClick={onNext}>Siguiente carrera</button>
          ) : (
            <p className="muted">Esperando a que el anfitrión dé salida a la siguiente…</p>
          )
        ) : (
          <button className="btn btn-primary btn-lg" onClick={onLobby}>Volver al lobby</button>
        )}
      </div>

      <Credits />
    </div>
  );
}
