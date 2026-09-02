/**
 * Incerteza propagada nas grandezas apresentadas: a altura AGL real de cada
 * foto não é a nominal — o posicionamento (GNSS ou RTK) erra na vertical e
 * na horizontal, e sem seguimento de terreno o relevo dentro da área faz a
 * altura variar com a cota. GSD, pegada e sobreposições passam a ser
 * intervalos [pior, melhor], calculados por propagação de intervalos (sem
 * hipótese de distribuição): os extremos das entradas dão os extremos das
 * saídas, porque todas as funções são monótonas no domínio de trabalho.
 * Também o arrastamento por movimento (blur) a um tempo de exposição dado.
 * Puro; ver docs/METODOS.md, secção 2.
 */
import { computeFootprint, computeGSD } from '../utils/geo.js'

/** Sobreposições mínimas habituais em fotogrametria (aviso abaixo disto). */
export const MIN_FRONT_OVERLAP_PCT = 60
export const MIN_SIDE_OVERLAP_PCT = 50
/** Tempos de exposição de referência para o arrastamento (s). */
export const EXPOSURES_S = [1 / 1000, 1 / 500]

const clampPct = (v) => Math.max(0, Math.min(100, v))

/**
 * Intervalo da elevação do terreno ao longo do plano, relativo à referência
 * (base ou primeiro waypoint): quanto o terreno sobe/desce face ao ponto
 * de descolagem. Amostra até `maxSamples` waypoints, uniformemente.
 * @returns {{minM: number, maxM: number, samples: number}|null}
 */
export function terrainReliefRange(waypoints, elevationAt, refPt, { maxSamples = 400 } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length === 0 || typeof elevationAt !== 'function')
    return null
  const ref = refPt ? elevationAt(refPt[0], refPt[1]) : null
  if (!Number.isFinite(ref)) return null
  const step = Math.max(1, Math.ceil(waypoints.length / maxSamples))
  let minM = Infinity
  let maxM = -Infinity
  let samples = 0
  for (let i = 0; i < waypoints.length; i += step) {
    const w = waypoints[i]
    const z = elevationAt(w[0], w[1])
    if (!Number.isFinite(z)) continue
    const d = z - ref
    if (d < minM) minM = d
    if (d > maxM) maxM = d
    samples += 1
  }
  return samples > 0 ? { minM, maxM, samples } : null
}

/**
 * Intervalos de AGL, GSD, pegada e sobreposições.
 * @param {object} c
 * @param {object} c.sensor sensor resolvido (resolveSensor)
 * @param {number} c.altitude altura nominal (m)
 * @param {number} [c.gimbalPitch]
 * @param {number} c.spacing espaçamento entre faixas (m)
 * @param {number|null} c.interval intervalo entre fotos (m)
 * @param {{verticalM: number, horizontalM: number, mode?: string}} c.posError erro de posicionamento
 * @param {{minM: number, maxM: number}|null} [c.relief] relevo relativo à referência (sem seguimento)
 * @param {boolean} [c.terrainFollow] seguimento de terreno activo
 * @param {number} [c.toleranceM] tolerância vertical do seguimento
 */
export function uncertaintyIntervals(c) {
  const H = c.altitude
  const sv = Math.max(0, c.posError?.verticalM ?? 0)
  const sh = Math.max(0, c.posError?.horizontalM ?? 0)
  let aglLo
  let aglHi
  let reliefTerm = 0
  if (c.terrainFollow) {
    const tol = Math.max(0, c.toleranceM ?? 0)
    aglLo = H - tol - sv
    aglHi = H + tol + sv
  } else if (c.relief) {
    // terreno a subir face à descolagem reduz a AGL; a descer aumenta-a
    reliefTerm = Math.max(0, c.relief.maxM) + Math.max(0, -c.relief.minM)
    aglLo = H - Math.max(0, c.relief.maxM) - sv
    aglHi = H - Math.min(0, c.relief.minM) + sv
  } else {
    aglLo = H - sv
    aglHi = H + sv
  }
  aglLo = Math.max(1, aglLo)
  aglHi = Math.max(aglLo, aglHi)
  const fpLo = computeFootprint(c.sensor, aglLo)
  const fpHi = computeFootprint(c.sensor, aglHi)
  const pitch = c.gimbalPitch ?? -90
  const gsdLo = computeGSD(c.sensor, aglLo, pitch)
  const gsdHi = computeGSD(c.sensor, aglHi, pitch)
  // pior caso: pegada menor (AGL baixa) e passo maior (erro horizontal a
  // afastar duas fotos ou duas faixas consecutivas)
  const front =
    c.interval != null && fpLo.along
      ? [
          clampPct(100 * (1 - (c.interval + sh) / fpLo.along)),
          clampPct(100 * (1 - Math.max(0, c.interval - sh) / fpHi.along)),
        ]
      : null
  const side =
    c.spacing != null && fpLo.across
      ? [
          clampPct(100 * (1 - (c.spacing + sh) / fpLo.across)),
          clampPct(100 * (1 - Math.max(0, c.spacing - sh) / fpHi.across)),
        ]
      : null
  return {
    agl: [aglLo, aglHi],
    gsd: gsdLo != null && gsdHi != null ? [gsdLo, gsdHi] : null,
    footprintAcross: [fpLo.across, fpHi.across],
    footprintAlong: fpLo.along != null ? [fpLo.along, fpHi.along] : null,
    front,
    side,
    inputs: {
      verticalM: sv,
      horizontalM: sh,
      mode: c.posError?.mode ?? 'gnss',
      reliefTerm,
      terrainFollow: Boolean(c.terrainFollow),
    },
    belowMinimum: Boolean(
      (front && front[0] < MIN_FRONT_OVERLAP_PCT) || (side && side[0] < MIN_SIDE_OVERLAP_PCT),
    ),
  }
}

/**
 * Arrastamento por movimento: deslocação da imagem no solo durante a
 * exposição, em cm e em píxeis do GSD nominal.
 * @returns {Array<{exposureS: number, blurCm: number, blurPx: number|null}>}
 */
export function motionBlur({ speed, gsdCm, exposures = EXPOSURES_S }) {
  if (!(speed > 0)) return []
  return exposures.map((exposureS) => {
    const blurCm = speed * exposureS * 100
    return { exposureS, blurCm, blurPx: gsdCm > 0 ? blurCm / gsdCm : null }
  })
}

/**
 * Verificação segmento a segmento da rota exportada: waypoints repetidos,
 * troços demasiado longos e taxa de subida acima da aeronave.
 * @param {number[][]} waypoints [lon, lat, h?]
 * @param {{speed?: number, maxClimbMS?: number, maxSegmentM?: number}} [opts]
 */
export function routeChecks(waypoints, { speed = 0, maxClimbMS = 5, maxSegmentM = 5000 } = {}) {
  const out = { duplicates: [], longSegments: [], climb: [] }
  if (!Array.isArray(waypoints) || waypoints.length < 2) return out
  const mLat = 110574
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]
    const b = waypoints[i]
    const mLon = 111320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180)
    const d = Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * mLat)
    if (d < 0.05 && Math.abs((b[2] ?? 0) - (a[2] ?? 0)) < 0.05) out.duplicates.push(i)
    if (d > maxSegmentM) out.longSegments.push({ at: i, lengthM: d })
    if (a[2] != null && b[2] != null && speed > 0 && d > 0.05) {
      const dt = d / speed
      const rate = Math.abs(b[2] - a[2]) / dt
      if (rate > maxClimbMS) out.climb.push({ at: i, rateMS: rate, dh: b[2] - a[2], lengthM: d })
    }
  }
  return out
}
