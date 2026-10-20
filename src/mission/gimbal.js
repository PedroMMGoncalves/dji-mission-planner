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

/** Margem abaixo do limite de cima do gimbal para as várias inclinações (35° → 30°). */
export const SHOT_UP_MARGIN_DEG = 5
/** Máximo de inclinações por ponto nas várias inclinações. */
export const MAX_SHOTS = 5
/** Tempo por inclinação (rodar o gimbal e disparar), s. */
export const SHOT_TIME_S = 2

/**
 * As inclinações das «várias inclinações (com paragem)», por ordem: por
 * omissão −45°, 0° e o limite de cima do gimbal menos SHOT_UP_MARGIN_DEG
 * (M3E e M4T 35° → 30°, P1 30° → 25°); as escritas recortadas a [mínimo,
 * máximo − margem], ao grau, sem repetidas, 1 a MAX_SHOTS.
 * @param {number[]|null|undefined} list inclinações escritas (null = por omissão)
 * @param {{min: number, max: number}|null|undefined} range intervalo do payload
 * @returns {number[]}
 */
export function shotPitches(list, range) {
  const lo = Number.isFinite(range?.min) ? range.min : -90
  const hi = (Number.isFinite(range?.max) ? range.max : 30) - SHOT_UP_MARGIN_DEG
  const src = Array.isArray(list) && list.some(Number.isFinite) ? list : [-45, 0, hi]
  const out = []
  for (const p of src) {
    if (!Number.isFinite(p)) continue
    const v = Math.round(Math.max(lo, Math.min(hi, p)))
    if (!out.includes(v)) out.push(v)
    if (out.length >= MAX_SHOTS) break
  }
  return out.length ? out : [0]
}
