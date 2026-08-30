import { MAX_CHAT_LENGTH, MAX_NICKNAME_LENGTH } from "./constants";

/**
 * Controles C0/C1, zero-width y overrides bidi.
 * Los overrides bidi (U+202A-202E, U+2066-2069) son el vector clásico para
 * falsear un nombre visualmente sin que el texto cambie.
 */
const DANGEROUS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function base(input: unknown): string {
  if (typeof input !== "string") return "";
  // Colapsar espacios ANTES de borrar controles: \n y \t están en el rango C0,
  // así que borrarlos primero pegaría palabras entre sí ("a\nb" -> "ab").
  return input.normalize("NFKC").replace(/\s+/g, " ").replace(DANGEROUS, "").trim();
}

/** Devuelve "" si el mensaje queda vacío tras normalizar; el llamador lo descarta. */
export function sanitizeChat(input: unknown): string {
  return base(input).slice(0, MAX_CHAT_LENGTH);
}

export function sanitizeNickname(input: unknown, fallback = "Jinete"): string {
  const clean = base(input).slice(0, MAX_NICKNAME_LENGTH);
  return clean.length > 0 ? clean : fallback;
}

/**
 * Segunda capa de defensa para el cliente vanilla, que todavía construye HTML
 * con plantillas. El cliente React de la fase 4 pinta nodos de texto y no la necesita,
 * pero sanitizeChat/sanitizeNickname siguen aplicando en el servidor.
 */
export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
