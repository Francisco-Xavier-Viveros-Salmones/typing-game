/** Cookies, comprobación de origen y utilidades de respuesta. */

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export interface CookieOptions {
  maxAge?: number;
  secure: boolean;
  path?: string;
}

export function buildCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? "/"}`,
    "HttpOnly",
    // Lax basta y mantiene la protección CSRF que SameSite=None tiraría a la basura.
    "SameSite=Lax",
  ];
  // Secure rompe la cookie en http://localhost, así que sigue al protocolo real.
  if (opts.secure) parts.push("Secure");
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return buildCookie(name, "", { maxAge: 0, secure });
}

export const isSecure = (request: Request) => new URL(request.url).protocol === "https:";

/**
 * Defensa CSRF explícita, encima de SameSite=Lax. Es más simple y más difícil de
 * estropear que el double-submit token en una SPA, y no necesita cooperación
 * del cliente. Se aplica también a login y registro: el CSRF de login es un
 * ataque real e infravalorado (te loguea en la cuenta del atacante).
 */
export function checkOrigin(request: Request): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;

  const origin = request.headers.get("origin");
  // Sin Origin no se acepta: los navegadores lo mandan siempre en estas peticiones.
  if (!origin) return false;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, { status });

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
