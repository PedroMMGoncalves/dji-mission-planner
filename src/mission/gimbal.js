/**
 * Inclinação do gimbal contra o intervalo que o payload alcança.
 *
 * A especificação WPML dá o intervalo por gimbal (M3E/M3T: [−90, 35]);
 * escrever um pitch fora dele é um ficheiro que o comando recusa ou executa
 * ao limite. A exportação recorta ao intervalo; este helper diz ao preflight
 * o que foi pedido fora dele.
 *
 * @param {Array<number|null|undefined>} pitches inclinações pedidas (graus)
 * @param {{min: number, max: number}|null|undefined} range intervalo do payload
 * @returns {{worst: number, min: number, max: number}|null} a pior fora do intervalo, ou null
 */
export function gimbalRangeViolation(pitches, range) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null
  let worst = null
  let excess = 0
  for (const p of pitches ?? []) {
    if (!Number.isFinite(p)) continue
    const over = p > range.max ? p - range.max : p < range.min ? range.min - p : 0
    if (over > excess) {
      excess = over
      worst = p
    }
  }
  return worst == null ? null : { worst, min: range.min, max: range.max }
}

/** Recorta uma inclinação ao intervalo do payload (sem intervalo, devolve-a). */
export function clampGimbalPitch(pitch, range) {
  if (!range || !Number.isFinite(pitch)) return pitch
  return Math.max(range.min, Math.min(range.max, pitch))
}
