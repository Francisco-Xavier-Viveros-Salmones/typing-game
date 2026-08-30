const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * ULID: 10 caracteres de timestamp + 16 de aleatoriedad.
 * Ordenable por tiempo, así que sirve de PK y de cursor de paginación a la vez,
 * y se acuña sin ida y vuelta a la base (a diferencia de un AUTOINCREMENT).
 */
export function ulid(now: number = Date.now(), random: () => number = Math.random): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += CROCKFORD[Math.floor(random() * 32)];
  }
  return time + rand;
}

/** Sin O/0/I/1/L: son las que la gente dicta mal por teléfono. */
const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function roomCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return out;
}
