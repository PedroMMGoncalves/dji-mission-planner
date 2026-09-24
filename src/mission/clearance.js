/**
 * Folga ao solo de uma rota exportável.
 *
 * Amostra o relevo ao longo de cada segmento (passo `stepM`, como o
 * seguimento de terreno) e devolve a pior folga: altura absoluta menos
 * terreno. As alturas dos waypoints são relativas e a absoluta é
 * `refElev + h` — a mesma convenção do perfil e do 3D. Uma folga negativa
 * significa que a rota entra no relevo: é um bloqueio do preflight, não um
 * número vermelho num painel que ninguém abriu.
 */
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'

/**
 * @param {number[][]} waypoints [lon, lat, alturaRelativa]
 * @param {{elevationAt: (lon: number, lat: number) => number|null, refElev: number,
 *   stepM?: number, maxSamples?: number}} opts
 * @returns {{minM: number, at: {lon: number, lat: number, index: number}, samples: number}|null}
 *   null quando não há relevo em nenhum ponto amostrado
 */
export function routeClearance(
  waypoints,
  { elevationAt, refElev, stepM = 40, maxSamples = 20000 },
) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return null
  if (typeof elevationAt !== 'function' || !Number.isFinite(refElev)) return null
  const lat0 = waypoints[0][1]
  const mLon = metersPerDegLon(lat0)
  const segLen = (a, b) => Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * M_PER_DEG_LAT)
  let totalM = 0
  for (let i = 1; i < waypoints.length; i++) totalM += segLen(waypoints[i - 1], waypoints[i])
  // passo efectivo: nunca mais de maxSamples ao todo, nem menos do que stepM
  const step = Math.max(stepM, totalM / Math.max(1, maxSamples - waypoints.length))

  let minM = Infinity
  let at = null
  let samples = 0
  const probe = (lon, lat, alt, index) => {
    const g = elevationAt(lon, lat)
    if (!Number.isFinite(g)) return
    samples++
    const agl = alt - g
    if (agl < minM) {
      minM = agl
      at = { lon, lat, index }
    }
  }
  const altOf = (w) => refElev + (Number.isFinite(w[2]) ? w[2] : 0)
  probe(waypoints[0][0], waypoints[0][1], altOf(waypoints[0]), 0)
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]
    const b = waypoints[i]
    const len = segLen(a, b)
    const n = Math.max(1, Math.ceil(len / step))
    const za = altOf(a)
    const zb = altOf(b)
    for (let k = 1; k <= n; k++) {
      const t = k / n
      probe(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, za + (zb - za) * t, i)
    }
  }
  return at ? { minM, at, samples } : null
}
