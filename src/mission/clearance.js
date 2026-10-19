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
 * Percorre a rota a passos de `stepM` (limitado a `maxSamples` no total) e
 * chama `cb(lon, lat, index, t)` em cada ponto: `index` é o waypoint de
 * chegada do segmento e `t` a fracção percorrida nele. Partilhado pela
 * folga ao solo e pela cota de referência, para amostrarem o mesmo relevo.
 * `breaks` (opcional): índices i cujo troço i−1 → i não se voa (início de
 * um bloco que descola da sua base); o waypoint i é amostrado sozinho.
 */
export function forEachRouteSample(
  waypoints,
  { stepM = 40, maxSamples = 20000, breaks = null } = {},
  cb,
) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return
  const skip = breaks ? new Set(breaks) : null
  const mLon = metersPerDegLon(waypoints[0][1])
  const segLen = (a, b) => Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * M_PER_DEG_LAT)
  let totalM = 0
  for (let i = 1; i < waypoints.length; i++)
    if (!skip?.has(i)) totalM += segLen(waypoints[i - 1], waypoints[i])
  // passo efectivo: nunca mais de maxSamples ao todo, nem menos do que stepM
  const step = Math.max(stepM, totalM / Math.max(1, maxSamples - waypoints.length))
  cb(waypoints[0][0], waypoints[0][1], 0, 0)
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]
    const b = waypoints[i]
    if (skip?.has(i)) {
      cb(b[0], b[1], i, 1)
      continue
    }
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
 * @returns {{minM: number, maxM: number, samples: number, noData: number}|null}
 */
export function terrainRangeAlong(waypoints, { elevationAt, stepM = 40, maxSamples = 20000 }) {
  if (typeof elevationAt !== 'function') return null
  let minM = Infinity
  let maxM = -Infinity
  let samples = 0
  let noData = 0
  forEachRouteSample(waypoints, { stepM, maxSamples }, (lon, lat) => {
    const g = elevationAt(lon, lat)
    if (!Number.isFinite(g)) {
      noData++
      return
    }
    samples++
    if (g < minM) minM = g
    if (g > maxM) maxM = g
  })
  return samples > 0 ? { minM, maxM, samples, noData } : null
}

/**
 * Amostras da rota SEM relevo (M2-T1 da revisão da matemática): um tile em
 * falta ou uma zona sem dados do MDT dentro da caixa carregada. A cobertura
 * media-se por caixa, o seguimento de terreno atravessava o buraco à cota
 * do último ponto válido e a folga ao solo saltava a amostra: uma colina de
 * 80 m num buraco de 250 m passava com a folga «60 m» e −10 m reais. O
 * preflight bloqueia com `noData > 0`.
 * @param {number[][]} waypoints
 * @param {{elevationAt: (lon: number, lat: number) => number|null, stepM?: number,
 *   maxSamples?: number, breaks?: number[]|null}} opts
 * @returns {{samples: number, noData: number, at: {lon: number, lat: number, index: number}|null}|null}
 */
export function terrainHolesAlong(
  waypoints,
  { elevationAt, stepM = 40, maxSamples = 20000, breaks = null },
) {
  if (typeof elevationAt !== 'function' || !Array.isArray(waypoints) || waypoints.length === 0)
    return null
  let samples = 0
  let noData = 0
  let at = null
  forEachRouteSample(waypoints, { stepM, maxSamples, breaks }, (lon, lat, i) => {
    if (Number.isFinite(elevationAt(lon, lat))) samples++
    else {
      noData++
      if (!at) at = { lon, lat, index: i }
    }
  })
  return { samples, noData, at }
}

/**
 * Folga ao solo da rota: a menor (e onde) e a maior altura acima do solo.
 * @param {number[][]} waypoints [lon, lat, alturaRelativa]
 * @param {{elevationAt: (lon: number, lat: number) => number|null, refElev: number,
 *   stepM?: number, maxSamples?: number, breaks?: number[]|null}} opts `breaks`: troços
 *   que não se voam (forEachRouteSample)
 * @returns {{minM: number, maxM: number, at: {lon: number, lat: number, index: number},
 *   samples: number, noData: number}|null} null quando não há relevo em nenhum ponto amostrado
 */
export function routeClearance(
  waypoints,
  { elevationAt, refElev, stepM = 40, maxSamples = 20000, breaks = null },
) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return null
  if (typeof elevationAt !== 'function' || !Number.isFinite(refElev)) return null
  const altOf = (w) => refElev + (Number.isFinite(w[2]) ? w[2] : 0)
  let minM = Infinity
  let maxM = -Infinity
  let at = null
  let samples = 0
  let noData = 0
  forEachRouteSample(waypoints, { stepM, maxSamples, breaks }, (lon, lat, i, t) => {
    const g = elevationAt(lon, lat)
    if (!Number.isFinite(g)) {
      noData++
      return
    }
    samples++
    const za = altOf(waypoints[Math.max(0, i - 1)])
    const zb = altOf(waypoints[i])
    const agl = za + (zb - za) * t - g
    if (agl > maxM) maxM = agl
    if (agl < minM) {
      minM = agl
      at = { lon, lat, index: i }
    }
  })
  // maxM: a maior altura acima do solo da rota (nota da categoria aberta)
  return at ? { minM, maxM, at, samples, noData } : null
}

/**
 * Folga ao solo dos trânsitos entre a base e a rota (M2-T3 da revisão da
 * matemática), que o KMZ voa com `flyToWaylineMode` «safely»: a aeronave
 * sobe no ponto de descolagem à altura relativa do 1.º waypoint — ou à de
 * segurança da descolagem, se for maior — e voa na horizontal até ele; no
 * fim regressa em linha recta à maior entre a altura do último waypoint e
 * a de regresso (RTH). Nenhum destes troços estava no relevo: uma lomba
 * entre a base e a área era atravessada 20 m abaixo do topo sem nenhum
 * número o mostrar. As alturas são relativas a `refElev` (a cota da base).
 * @param {number[]} basePoint [lon, lat]
 * @param {number[][]} waypoints [lon, lat, alturaRelativa] da rota desse voo
 * @param {{elevationAt: (lon: number, lat: number) => number|null, refElev: number,
 *   takeOffSecurityHeightM?: number, rthHeightM?: number, stepM?: number}} opts
 * @returns {{minM: number, at: {lon: number, lat: number, leg: 'out'|'back'}, samples: number,
 *   noData: number, outHeightM: number, backHeightM: number}|null}
 */
export function transitClearance(
  basePoint,
  waypoints,
  { elevationAt, refElev, takeOffSecurityHeightM = 0, rthHeightM = 0, stepM = 20 },
) {
  if (typeof elevationAt !== 'function' || !Number.isFinite(refElev)) return null
  if (!Array.isArray(basePoint) || !Number.isFinite(basePoint[0]) || !Number.isFinite(basePoint[1]))
    return null
  const wps = (waypoints ?? []).filter(
    (w) => Array.isArray(w) && Number.isFinite(w[0]) && Number.isFinite(w[1]),
  )
  if (wps.length === 0) return null
  const first = wps[0]
  const last = wps[wps.length - 1]
  const hOf = (w) => (Number.isFinite(w[2]) ? w[2] : 0)
  const outH = Math.max(hOf(first), takeOffSecurityHeightM)
  const backH = Math.max(hOf(last), rthHeightM)
  /** @type {Array<['out'|'back', number[][]]>} */
  const legs = [
    [
      'out',
      [
        [basePoint[0], basePoint[1], outH],
        [first[0], first[1], outH],
      ],
    ],
    [
      'back',
      [
        [last[0], last[1], backH],
        [basePoint[0], basePoint[1], backH],
      ],
    ],
  ]
  let worst = null
  let samples = 0
  let noData = 0
  for (const [leg, route] of legs) {
    const r = routeClearance(route, { elevationAt, refElev, stepM })
    if (!r) continue
    samples += r.samples
    noData += r.noData
    if (!worst || r.minM < worst.minM)
      worst = { minM: r.minM, at: { lon: r.at.lon, lat: r.at.lat, leg } }
  }
  return worst ? { ...worst, samples, noData, outHeightM: outH, backHeightM: backH } : null
}
