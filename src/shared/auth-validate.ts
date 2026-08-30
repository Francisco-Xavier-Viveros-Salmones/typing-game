/**
 * Reglas de usuario y contraseña. Puras y sin plataforma, para que la misma
 * validación corra en el cliente (feedback inmediato) y en el servidor (la que
 * de verdad cuenta).
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200; // cota anti-DoS: PBKDF2 sobre 1 MB cuesta CPU
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 15;

/** Letras, dígitos, guion y guion bajo. Sin espacios: evita nombres casi idénticos. */
const USERNAME_RE = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_-]+$/;

/**
 * Clave de unicidad. Dos nombres que solo difieran en mayúsculas o en la forma
 * de normalización Unicode son el mismo usuario.
 *
 * ponytail: no se hace confusable-mapping (0/O, l/1, cirílico а vs latina a).
 * Un suplantador puede registrar "Pak0_FX". Si aparece el problema, la vía es
 * skeleton de UTS#39 sobre esta misma función.
 */
export function normalizeUsername(username: string): string {
  return username.normalize("NFKC").trim().toLowerCase();
}

export type Invalid = { ok: false; error: string };
export type Valid = { ok: true };
export type Check = Valid | Invalid;

export function validateUsername(username: unknown): Check {
  if (typeof username !== "string") return { ok: false, error: "El usuario es obligatorio." };
  const trimmed = username.normalize("NFKC").trim();

  if (trimmed.length < MIN_USERNAME_LENGTH)
    return { ok: false, error: `El usuario necesita al menos ${MIN_USERNAME_LENGTH} caracteres.` };
  if (trimmed.length > MAX_USERNAME_LENGTH)
    return { ok: false, error: `El usuario no puede pasar de ${MAX_USERNAME_LENGTH} caracteres.` };
  if (!USERNAME_RE.test(trimmed))
    return { ok: false, error: "Solo se permiten letras, números, guion y guion bajo." };

  return { ok: true };
}

/**
 * Las 40 contraseñas más usadas, más las obvias en español.
 *
 * ponytail: la lista de OWASP son 10k entradas (~80 KB en el bundle del Worker).
 * Con un mínimo de 10 caracteres, la mayoría de esa lista ya no valida, así que
 * esto cubre lo que queda. Si hace falta más, va a KV y se consulta, no al bundle.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234",
  "123456789", "1234567890", "12345678901", "111111111", "1234512345",
  "qwertyuiop", "qwerty12345", "1q2w3e4r5t", "asdfghjkl", "zxcvbnm123",
  "iloveyou1", "iloveyou123", "sunshine1", "princess1", "football1",
  "welcome123", "admin12345", "letmein123", "monkey12345", "dragon12345",
  "abc12345678", "passw0rd123", "trustno1234", "superman123", "michael123",
  "contrasena", "contraseña", "contrasena1", "contraseña1", "1234567891",
  "hola12345", "megustas1", "teamo12345", "elizabeth1", "estrella1",
]);

export function validatePassword(password: unknown, username?: string): Check {
  if (typeof password !== "string") return { ok: false, error: "La contraseña es obligatoria." };

  if (password.length < MIN_PASSWORD_LENGTH)
    return { ok: false, error: `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (password.length > MAX_PASSWORD_LENGTH)
    return { ok: false, error: `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres.` };

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower))
    return { ok: false, error: "Esa contraseña es demasiado común. Elige otra." };

  // Una contraseña que contiene el propio usuario es adivinable por diseño.
  if (username) {
    const u = normalizeUsername(username);
    if (u.length >= 3 && lower.includes(u))
      return { ok: false, error: "La contraseña no puede contener tu nombre de usuario." };
  }

  // Un solo carácter repetido pasa el mínimo de longitud pero no vale nada.
  if (new Set(password).size < 4)
    return { ok: false, error: "La contraseña necesita más variedad de caracteres." };

  return { ok: true };
}
