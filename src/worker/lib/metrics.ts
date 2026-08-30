import type { Env } from "../index";

/**
 * Métricas.
 *
 * Van a Analytics Engine y no a una tabla de D1: los eventos de producto son
 * escrituras constantes de alta cardinalidad, y en D1 significarían una tabla
 * que crece sin fin, un cron de limpieza y consultas de agregación caras.
 * Analytics Engine muestrea, agrega y caduca solo, y la escritura no bloquea.
 *
 * ponytail: sin cliente de analítica en el navegador. Todo lo que importa
 * —altas, partidas, carreras, referidos— ya pasa por el servidor, así que
 * medirlo aquí evita meter un script de terceros y un banner de cookies.
 */
export type MetricEvent =
  | "user_register"
  | "user_login"
  | "room_create"
  | "room_join"
  | "race_finish"
  | "match_end"
  | "ranked_queue"
  | "solo_result"
  | "referral_signup";

export function track(
  env: Env,
  event: MetricEvent,
  opts: { labels?: (string | undefined)[]; values?: number[] } = {},
) {
  // El binding es opcional: en local puede no existir y no debe romper nada.
  const ds = env.METRICS;
  if (!ds) return;
  try {
    ds.writeDataPoint({
      // El primer blob es el índice de consulta; el resto, dimensiones.
      indexes: [event],
      blobs: [event, ...(opts.labels ?? []).map((l) => l ?? "")],
      doubles: opts.values ?? [1],
    });
  } catch {
    // Perder una métrica jamás puede afectar a una carrera.
  }
}
