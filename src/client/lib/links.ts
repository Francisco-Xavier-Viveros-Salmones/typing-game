/**
 * Enlaces de invitación y de referido.
 *
 * Dos cosas distintas que se confunden a menudo:
 *  - invitación: lleva a UNA sala concreta y caduca con ella (?sala=ABC123).
 *  - referido: lleva a la portada y atribuye el alta a quien invitó (?de=Pako).
 *
 * Un mismo enlace puede llevar las dos: si te invitan a una sala y además te
 * registras, la cuenta queda atribuida a quien te pasó el enlace.
 */

export interface EntryParams {
  roomCode: string | null;
  referrer: string | null;
}

export function readEntryParams(search = location.search): EntryParams {
  const p = new URLSearchParams(search);
  const sala = (p.get("sala") ?? "").toUpperCase();
  const de = (p.get("de") ?? "").trim();

  return {
    roomCode: /^[A-Z0-9]{6}$/.test(sala) ? sala : null,
    referrer: de.length > 0 && de.length <= 15 ? de : null,
  };
}

export function inviteUrl(roomCode: string, referrer?: string | null): string {
  const url = new URL(location.origin);
  url.searchParams.set("sala", roomCode);
  if (referrer) url.searchParams.set("de", referrer);
  return url.toString();
}

export function referralUrl(username: string): string {
  const url = new URL(location.origin);
  url.searchParams.set("de", username);
  return url.toString();
}

/**
 * Quita los parámetros de la barra de direcciones una vez usados, para que
 * recargar no vuelva a meterte en una sala que ya abandonaste.
 */
export function clearEntryParams() {
  history.replaceState(null, "", location.pathname);
}

/** El referido se guarda hasta que la persona decida registrarse, que puede ser después. */
const REF_KEY = "caballos:ref";

export function rememberReferrer(username: string) {
  try { sessionStorage.setItem(REF_KEY, username); } catch { /* modo privado */ }
}

export function storedReferrer(): string | null {
  try { return sessionStorage.getItem(REF_KEY); } catch { return null; }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // el portapapeles puede estar bloqueado; el enlace está a la vista
  }
}
