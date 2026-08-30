import { useEffect, useState } from "react";
import useSWR from "swr";
import type { View } from "../App";
import { Credits } from "../components/Credits";
import { Silks } from "../components/Silks";
import { HorseIcon, Trophy, Warning } from "../components/icons";
import { fetcher, post } from "../lib/api";
import {
  copyToClipboard, readEntryParams, referralUrl, rememberReferrer, storedReferrer,
} from "../lib/links";

export interface Me {
  user: { id: string; username: string; role: string } | null;
  guest: boolean;
  guestId?: string;
}

export function Home({ onEnter, onNavigate }: {
  onEnter: (roomCode: string, name: string, create: boolean) => void;
  onNavigate: (view: View) => void;
}) {
  const { data: me, mutate } = useSWR<Me>("/api/auth/me", fetcher<Me>);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Un enlace de invitación rellena el código; uno de referido se guarda para
  // atribuir el alta aunque la persona tarde en registrarse.
  useEffect(() => {
    const { roomCode, referrer } = readEntryParams();
    if (roomCode) setJoinCode(roomCode);
    if (referrer) rememberReferrer(referrer);
  }, []);

  const displayName = nickname.trim() || me?.user?.username || "";

  async function auth(route: "login" | "register") {
    setAuthError(null);
    setBusy(true);
    try {
      await post(`/api/auth/${route}`, {
        username, password,
        ...(route === "register" ? { ref: storedReferrer() } : {}),
      });
      setPassword("");
      await mutate();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    setRoomError(null);
    if (!displayName) return setRoomError("Ponte un nombre antes de salir a la pista.");
    try {
      const { roomCode } = await post<{ roomCode: string }>("/api/rooms", {});
      onEnter(roomCode, displayName, true);
    } catch (err) {
      setRoomError((err as Error).message);
    }
  }

  function joinRoom() {
    setRoomError(null);
    if (!displayName) return setRoomError("Ponte un nombre antes de salir a la pista.");
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return setRoomError("El código de sala son 6 caracteres.");
    onEnter(code, displayName, false);
  }

  return (
    <div className="home">
      <header className="brand">
        <HorseIcon size={46} color="#ffb43c" />
        <h1>TypeRacer<br /><span>Caballos</span></h1>
        <p className="tagline">Programa de la jornada</p>
      </header>

      {/* Salir a la pista va primero, y funciona sin cuenta. */}
      <section className="panel">
        <div className="card-title">
          <h2>Tu montura</h2>
          <span className="of">{me?.user ? me.user.username : "invitado"}</span>
        </div>

        <label className="field">
          <span>Nombre en el programa</span>
          <input className="input" placeholder={me?.user?.username ?? "Ej. Relámpago"}
                 maxLength={15} value={nickname}
                 onChange={(e) => setNickname(e.target.value)} />
        </label>

        <button className="btn btn-primary btn-lg" onClick={createRoom}>Abrir una sala</button>

        <div className="divider"><span>o entra con un código</span></div>

        <div className="row">
          <input className="input code-input" placeholder="ABC123" maxLength={6}
                 value={joinCode}
                 onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                 onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
          <button className="btn" onClick={joinRoom}>Entrar</button>
        </div>

        {roomError && <p className="error"><Warning size={15} weight="fill" /> {roomError}</p>}

        {!me?.user && (
          <p className="hint">
            Puedes correr como invitado sin registrarte. Para guardar récords,
            salir en las clasificaciones y jugar rankeds hace falta cuenta.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="card-title"><h2>Otras pruebas</h2></div>
        <div className="row" style={{ marginTop: 0 }}>
          <button className="btn btn-ghost" onClick={() => onNavigate("solo")}>Contrarreloj</button>
          <button className="btn btn-ghost" onClick={() => onNavigate("ranked")}>
            <Trophy size={15} weight="fill" /> Ranked
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate("boards")}>Clasificaciones</button>
          {me?.user && (
            <button className="btn btn-ghost" onClick={() => onNavigate("profile")}>Mi ficha</button>
          )}
        </div>
      </section>

      <section className="panel">
        {me?.user ? (
          <>
            <div className="auth-in">
              <span className="row-label">
                <Silks slot={0} color="#ffb43c" size={20} />
                Corres como <strong>{me.user.username}</strong>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                await post("/api/auth/logout", {});
                await mutate();
              }}>Cerrar sesión</button>
            </div>

            {/* Referidos: un enlace por persona, no un programa de puntos. */}
            <div className="invite">
              <input className="input" readOnly value={referralUrl(me.user.username)}
                     onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn-sm" onClick={async () => {
                setCopied(await copyToClipboard(referralUrl(me.user!.username)));
                setTimeout(() => setCopied(false), 1600);
              }}>{copied ? "Copiado" : "Copiar"}</button>
            </div>
            <p className="hint">Quien se registre con tu enlace queda apuntado como invitado tuyo.</p>
          </>
        ) : showAuth ? (
          <>
            <div className="card-title"><h2>Cuenta</h2></div>
            <div className="row" style={{ marginTop: 0 }}>
              <input className="input" placeholder="Usuario" autoComplete="username"
                     maxLength={15} value={username}
                     onChange={(e) => setUsername(e.target.value)} />
              <input className="input" type="password" placeholder="Contraseña"
                     autoComplete="current-password" maxLength={200} value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && auth("login")} />
            </div>
            <div className="row">
              <button className="btn btn-primary" disabled={busy} onClick={() => auth("login")}>Entrar</button>
              <button className="btn" disabled={busy} onClick={() => auth("register")}>Crear cuenta</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAuth(false)}>Ahora no</button>
            </div>
            {storedReferrer() && <p className="hint">Te invitó <strong>{storedReferrer()}</strong>.</p>}
            {authError && <p className="error"><Warning size={15} weight="fill" /> {authError}</p>}
          </>
        ) : (
          <div className="auth-in">
            <span className="muted">Sin cuenta tus tiempos no se guardan.</span>
            <button className="btn btn-sm" onClick={() => setShowAuth(true)}>Entrar o registrarse</button>
          </div>
        )}
      </section>

      <Credits />
    </div>
  );
}
