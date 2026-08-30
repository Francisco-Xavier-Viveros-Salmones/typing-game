/**
 * WPM estándar: una "palabra" son 5 caracteres.
 * Siempre devuelve un número finito — nunca Infinity ni NaN, aunque la
 * duración sea 0. Los valores no finitos son lo que envenenaba el orden (bug 2).
 */
export function computeWpm(chars: number, ms: number): number {
  if (!Number.isFinite(chars) || !Number.isFinite(ms) || ms <= 0 || chars <= 0) return 0;
  return Math.round(chars / 5 / (ms / 60000));
}

/** Precisión en [0,1]. Sin pulsaciones => 1 (aún no hay nada que fallar). */
export function computeAccuracy(chars: number, errors: number): number {
  // Math.min/max propagan NaN, así que se filtra antes de comparar.
  if (!Number.isFinite(chars) || !Number.isFinite(errors)) return 1;
  const total = chars + errors;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, chars / total));
}
