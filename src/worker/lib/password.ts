/**
 * PBKDF2-HMAC-SHA-256 vía WebCrypto.
 *
 * bcrypt y argon2 nativos no corren en workerd, y argon2 en WASM añade ~500 KB
 * al bundle y quema CPU-ms en cada login. PBKDF2 es nativo, así que las
 * iteraciones corren a velocidad C y no en JS.
 *
 * 100.000 iteraciones NO es una elección: es el TOPE que impone el runtime de
 * Workers. Por encima, deriveBits lanza
 *   NotSupportedError: iteration counts above 100000 are not supported
 * y solo se ve en producción — `wrangler dev` en local usa otra implementación
 * de crypto y acepta cualquier número.
 *
 * Queda muy por debajo del suelo de OWASP (600k) y es materialmente más débil
 * que argon2id frente a un atacante con GPU. Lo compensan el throttle de
 * auth_throttle, el mínimo de 10 caracteres y que aquí no se guarda nada de
 * valor — pero si esta base llegara a contener algo sensible, la respuesta es
 * passkeys o argon2 en WASM, no subir este número: no se puede.
 *
 * Las iteraciones se guardan por fila, así que subir este número rehashea a
 * cada usuario en su siguiente login sin migración ni invalidar contraseñas.
 */
/** Tope duro del runtime de Workers. No se puede subir. */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export interface StoredPassword {
  hash: Uint8Array;
  salt: Uint8Array;
  iterations: number;
}

export async function hashPassword(password: string): Promise<StoredPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return { hash, salt, iterations: PBKDF2_ITERATIONS };
}

/** Comparación en tiempo constante: `===` sobre el hash filtra información por timing. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  try {
    const candidate = await derive(password, stored.salt, stored.iterations);
    return equal(candidate, stored.hash);
  } catch {
    // Una fila guardada con más iteraciones de las que el runtime admite no se
    // puede verificar. Se trata como contraseña incorrecta, no como error 500:
    // el usuario ve un mensaje normal y no se filtra el estado interno.
    return false;
  }
}

/**
 * Se ejecuta cuando el usuario no existe, para que un login contra una cuenta
 * inexistente cueste lo mismo que uno contra una real. Sin esto, el tiempo de
 * respuesta enumera qué cuentas están registradas.
 */
export async function dummyVerify(password: string): Promise<void> {
  await derive(password, new Uint8Array(SALT_BYTES), PBKDF2_ITERATIONS);
}
