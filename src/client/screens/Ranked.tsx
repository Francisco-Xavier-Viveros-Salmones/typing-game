import { useEffect, useState } from "react";
import { Credits } from "../components/Credits";
import { Trophy, Warning } from "../components/icons";
import { fetcher, post } from "../lib/api";

interface QueueState {
  status?: "queued" | "matched";
  roomCode?: string;
  position?: number;
  waiting?: number;
}

/**
 * Cola de ranked. Se sondea cada 2 s en vez de abrir un WebSocket: la cola es
 * un evento cada varios segundos, no un flujo, y un socket más por jugador
 * esperando no compra nada.
 */
export function Ranked({ onMatched, onBack }: {
  onMatched: (roomCode: string) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inQueue, setInQueue] = useState(false);

  useEffect(() => {
    if (!inQueue) return;
    const id = setInterval(async () => {
      try {
        const s = await fetcher<{ matched: string | null; waiting: number }>("/api/ranked/status");
        if (s.matched) {
          setInQueue(false);
          onMatched(s.matched);
        } else {
          setState((prev) => ({ ...prev, waiting: s.waiting }));
        }
      } catch { /* se reintenta en el siguiente tick */ }
    }, 2000);
    return () => clearInterval(id);
  }, [inQueue, onMatched]);

  // Salir de la pantalla saca de la cola: nadie debe quedar emparejable a ciegas.
  useEffect(() => () => { void post("/api/ranked/leave").catch(() => {}); }, []);

  async function entrar() {
    setError(null);
    try {
      const res = await post<QueueState>("/api/ranked/queue");
      if (res.status === "matched" && res.roomCode) return onMatched(res.roomCode);
      setState(res);
      setInQueue(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="ranked">
      <div className="card-title"><h2>Ranked</h2></div>

      <section className="panel">
        {inQueue ? (
          <div className="queue-state">
            <div className="stat-value hot">{state?.waiting ?? 1}</div>
            <div className="stat-label">en cola</div>
            <p className="muted" style={{ marginTop: 16 }}>
              Buscando rivales de nivel parecido. Se arranca con 3; si tardas más de
              45 segundos, vale con 2.
            </p>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat"><div className="stat-value">3</div><div className="stat-label">Rondas</div></div>
              <div className="stat"><div className="stat-value">10</div><div className="stat-label">Colocación</div></div>
              <div className="stat"><div className="stat-value">1200</div><div className="stat-label">Rating inicial</div></div>
            </div>
            <p className="hint">
              Las reglas las fija el servidor: nadie elige categoría ni dificultad.
              Abandonar cuenta como último puesto. El ranked necesita cuenta.
            </p>
          </>
        )}
        {error && <p className="error"><Warning size={15} weight="fill" /> {error}</p>}
      </section>

      <div className="lobby-actions">
        {inQueue ? (
          <button className="btn btn-danger btn-lg" onClick={async () => {
            await post("/api/ranked/leave").catch(() => {});
            setInQueue(false);
          }}>Salir de la cola</button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={entrar}>
            <Trophy size={16} weight="fill" /> Buscar partida
          </button>
        )}
        <button className="btn btn-ghost" onClick={onBack}>Volver</button>
      </div>

      <Credits />
    </div>
  );
}
