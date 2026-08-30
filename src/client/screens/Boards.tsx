import { useState } from "react";
import useSWR from "swr";
import { Credits } from "../components/Credits";
import { RankBadge, Trophy } from "../components/icons";
import { fetcher } from "../lib/api";

type Kind = "wpm" | "daily" | "wins" | "ranked";

const TABS: [Kind, string][] = [
  ["wpm", "Mejor WPM"],
  ["daily", "Hoy"],
  ["wins", "Victorias"],
  ["ranked", "Ranked"],
];

interface Row {
  username: string;
  best_wpm?: number;
  races?: number;
  wins?: number;
  matches?: number;
  rating?: number;
  peak_rating?: number;
  matches_played?: number;
}

interface BoardData {
  kind: Kind;
  rows: Row[];
  day?: string;
  season?: { id: string; name: string; endsAt: number } | null;
}

export function Boards({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<Kind>("wpm");
  const { data, isLoading } = useSWR<BoardData>(`/api/leaderboard?kind=${kind}`, fetcher);

  return (
    <div className="boards">
      <div className="card-title"><h2>Clasificaciones</h2></div>

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {kind === "ranked" && data?.season && (
        <p className="muted">
          {data.season.name} · termina el{" "}
          {new Date(data.season.endsAt).toLocaleDateString("es")}
        </p>
      )}

      <div className="table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jinete</th>
              {kind === "ranked" ? (
                <><th>Rating</th><th>Pico</th><th>Partidas</th></>
              ) : (
                <><th>WPM</th><th>Carreras</th><th>Victorias</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="muted">Cargando…</td></tr>
            )}
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {kind === "ranked"
                    ? "Nadie ha superado las 10 partidas de colocación todavía."
                    : "Aún no hay carreras registradas."}
                </td>
              </tr>
            )}
            {data?.rows.map((row, i) => (
              <tr key={row.username}>
                <td><div className="pos-cell"><RankBadge rank={i + 1} /></div></td>
                <td><span className="rider">{row.username}</span></td>
                {kind === "ranked" ? (
                  <>
                    <td className="total">{row.rating}</td>
                    <td>{row.peak_rating}</td>
                    <td>{row.matches_played}</td>
                  </>
                ) : (
                  <>
                    <td className="total">{Math.round(row.best_wpm ?? 0)}</td>
                    <td>{row.races ?? row.matches ?? 0}</td>
                    <td className="points">{row.wins ?? 0}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="results-actions">
        <button className="btn btn-ghost btn-lg" onClick={onBack}>Volver</button>
      </div>
      <Credits />
    </div>
  );
}

interface ProfileData {
  user: { id: string; username: string };
  stats: {
    races: number; matches: number; wins: number; podiums: number; dnf: number;
    best_wpm: number; sum_wpm: number; sum_accuracy: number; chars_typed: number;
  } | null;
  elo: { rating: number; peak_rating: number; matches_played: number; placements_left: number } | null;
  history: {
    id: string; mode: string; started_at: number; final_rank: number;
    total_points: number; avg_wpm: number; elo_delta: number | null; player_count: number;
  }[];
}

function Stat({ value, label, hot }: { value: string | number; label: string; hot?: boolean }) {
  return (
    <div className="stat">
      <div className={`stat-value${hot ? " hot" : ""}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Profile({ onBack }: { onBack: () => void }) {
  const { data, isLoading } = useSWR<ProfileData>("/api/profile", fetcher);

  if (isLoading) return <p className="muted center">Cargando…</p>;
  if (!data?.user) return <p className="muted center">Inicia sesión para ver tu perfil.</p>;

  const s = data.stats;
  // La media es sum/races, no un recálculo por escaneo de round_results.
  const avgWpm = s && s.races > 0 ? Math.round(s.sum_wpm / s.races) : 0;
  const avgAcc = s && s.races > 0 ? Math.round((s.sum_accuracy / s.races) * 100) : 0;

  return (
    <div className="profile">
      <div className="card-title"><h2>{data.user.username}</h2></div>

      <section className="panel">
        <div className="stat-grid">
          <Stat value={Math.round(s?.best_wpm ?? 0)} label="Mejor WPM" hot />
          <Stat value={avgWpm} label="WPM medio" />
          <Stat value={`${avgAcc}%`} label="Precisión" />
          <Stat value={s?.races ?? 0} label="Carreras" />
          <Stat value={s?.wins ?? 0} label="Victorias" />
          <Stat value={s?.podiums ?? 0} label="Podios" />
        </div>
      </section>

      {data.elo && (
        <section className="panel">
          <div className="panel-head"><h3><Trophy size={15} weight="fill" /> Ranked</h3></div>
          <div className="stat-grid">
            <Stat
              value={data.elo.placements_left > 0 ? "—" : data.elo.rating}
              label={data.elo.placements_left > 0
                ? `Colocación ${10 - data.elo.placements_left}/10`
                : "Rating"}
              hot
            />
            <Stat value={data.elo.peak_rating} label="Pico" />
            <Stat value={data.elo.matches_played} label="Partidas" />
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h3>Historial</h3></div>
        {data.history.length === 0 ? (
          <p className="muted">Todavía no has jugado ninguna partida multijugador.</p>
        ) : (
          <div className="table-scroll">
            <table className="results-table">
              <thead>
                <tr><th>Fecha</th><th>Modo</th><th>Pos.</th><th>Jugadores</th><th>WPM</th><th>Puntos</th><th>Elo</th></tr>
              </thead>
              <tbody>
                {data.history.map((m) => (
                  <tr key={m.id}>
                    <td className="muted">{new Date(m.started_at).toLocaleDateString("es")}</td>
                    <td>{m.mode}</td>
                    <td><div className="pos-cell"><RankBadge rank={m.final_rank} /></div></td>
                    <td>{m.player_count}</td>
                    <td>{Math.round(m.avg_wpm)}</td>
                    <td className="points">{m.total_points}</td>
                    <td className={m.elo_delta === null ? "muted" : m.elo_delta >= 0 ? "points" : "errors"}>
                      {m.elo_delta === null ? "—" : m.elo_delta >= 0 ? `+${m.elo_delta}` : m.elo_delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="results-actions">
        <button className="btn btn-ghost btn-lg" onClick={onBack}>Volver</button>
      </div>
      <Credits />
    </div>
  );
}
