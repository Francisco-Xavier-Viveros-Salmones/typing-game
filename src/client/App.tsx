import { useCallback, useState } from "react";
import { Watermark } from "./components/Credits";
import { SoundBar } from "./components/SoundBar";
import { Warning } from "./components/icons";
import { Boards, Profile } from "./screens/Boards";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Race } from "./screens/Race";
import { Ranked } from "./screens/Ranked";
import { Results } from "./screens/Results";
import { Solo } from "./screens/Solo";
import { useRoom } from "./state/useRoom";

interface Entry {
  roomCode: string;
  name: string;
  create: boolean;
  ranked?: boolean;
}

export type View = "home" | "boards" | "profile" | "solo" | "ranked";

export function App() {
  const [view, setView] = useState<View>("home");
  const [entry, setEntry] = useState<Entry | null>(null);
  const room = useRoom(entry);

  const leave = useCallback(() => {
    room.send({ t: "leave" });
    setEntry(null);
    setView("home");
  }, [room]);

  const home = useCallback(() => setView("home"), []);

  // Fuera de una sala, la vista la elige el jugador.
  if (!entry) {
    const screen =
      view === "boards" ? <Boards onBack={home} /> :
      view === "profile" ? <Profile onBack={home} /> :
      view === "solo" ? <Solo onBack={home} /> :
      view === "ranked" ? (
        <Ranked
          onBack={home}
          onMatched={(roomCode) => setEntry({ roomCode, name: "", create: false, ranked: true })}
        />
      ) : (
        <Home
          onEnter={(roomCode, name, create) => setEntry({ roomCode, name, create })}
          onNavigate={setView}
        />
      );

    return <main className="app">{screen}<SoundBar /><Watermark /></main>;
  }

  // Dentro de una sala manda el servidor: la fase decide la pantalla.
  const screen =
    room.phase === "countdown" || room.phase === "running" ? (
      <Race room={room} onAbandon={leave} />
    ) : room.phase === "scoring" || room.phase === "intermission" || room.phase === "ended" ? (
      <Results room={room} onNext={() => room.send({ t: "start" })} onLobby={leave} />
    ) : (
      <Lobby room={room} onLeave={leave} />
    );

  return (
    <main className="app">
      {room.error && (
        <div className="banner">
          <Warning size={16} weight="fill" /> {room.error}
          <button className="btn btn-ghost btn-sm" onClick={() => { setEntry(null); setView("home"); }}>
            Volver
          </button>
        </div>
      )}
      {room.status === "connecting" && <p className="muted center">Conectando…</p>}
      {screen}
      <SoundBar />
      <Watermark />
    </main>
  );
}
