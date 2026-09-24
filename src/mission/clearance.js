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
/**
 * Percorre a rota a passos de `stepM` (limitado a `maxSamples` no total) e
 * chama `cb(lon, lat, index, t)` em cada ponto: `index` é o waypoint de
 * chegada do segmento e `t` a fracção percorrida nele. Partilhado pela
 * folga ao solo e pela cota de referência, para amostrarem o mesmo relevo.
 */
export function forEachRouteSample(waypoints, { stepM = 40, maxSamples = 20000 } = {}, cb) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return
  const mLon = metersPerDegLon(waypoints[0][1])
  const segLen = (a, b) => Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * M_PER_DEG_LAT)
  let totalM = 0
  for (let i = 1; i < waypoints.length; i++) totalM += segLen(waypoints[i - 1], waypoints[i])
  // passo efectivo: nunca mais de maxSamples ao todo, nem menos do que stepM
  const step = Math.max(stepM, totalM / Math.max(1, maxSamples - waypoints.length))
  cb(waypoints[0][0], waypoints[0][1], 0, 0)
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]
    const b = waypoints[i]
    const n = Math.max(1, Math.ceil(segLen(a, b) / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      cb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, i, t)
    }
  }
}

/**
 * Cota mínima e máxima do relevo debaixo da rota. É daqui que sai a cota
 * de referência conservadora quando não há base (referenceElevation).
 * @returns {{minM: number, maxM: number, samples: number}|null}
 */
export function terrainRangeAlong(waypoints, { elevationAt, stepM = 40, maxSamples = 20000 }) {
  if (typeof elevationAt !== 'function') return null
  let minM = Infinity
  let maxM = -Infinity
  let samples = 0
  forEachRouteSample(waypoints, { stepM, maxSamples }, (lon, lat) => {
    const g = elevationAt(lon, lat)
    if (!Number.isFinite(g)) return
    samples++
    if (g < minM) minM = g
    if (g > maxM) maxM = g
  })
  return samples > 0 ? { minM, maxM, samples } : null
}

export function routeClearance(
  waypoints,
  { elevationAt, refElev, stepM = 40, maxSamples = 20000 },
) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return null
  if (typeof elevationAt !== 'function' || !Number.isFinite(refElev)) return null
  const altOf = (w) => refElev + (Number.isFinite(w[2]) ? w[2] : 0)
  let minM = Infinity
  let at = null
  let samples = 0
  forEachRouteSample(waypoints, { stepM, maxSamples }, (lon, lat, i, t) => {
    const g = elevationAt(lon, lat)
    if (!Number.isFinite(g)) return
    samples++
    const za = altOf(waypoints[Math.max(0, i - 1)])
    const zb = altOf(waypoints[i])
    const agl = za + (zb - za) * t - g
    if (agl < minM) {
      minM = agl
      at = { lon, lat, index: i }
    }
  })
  return at ? { minM, at, samples } : null
}
