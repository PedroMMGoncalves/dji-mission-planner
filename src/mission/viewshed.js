/**
 * Bacias de visão: que partes de cada bloco põem o drone atrás do relevo,
 * vistas dos olhos do operador na base.
 *
 * O alcance visual por distância (VLOS, 1000 m no M300) trata-se em
 * takeoffZones.js; aqui só interessa a OCULTAÇÃO pelo terreno — a crista de
 * uma corta, uma bancada, uma escombreira entre a base e o bloco. Para cada
 * base testa-se a linha de vista do olho (relevo na base + altura dos olhos)
 * a uma grelha regular de pontos do bloco, à cota a que o drone lá passa.
 *
 *  - Amostragem: o relevo é lido ao longo do segmento olho → drone a passos
 *    de `stepM` (reduzido à resolução do MDT quando é dada), sem as
 *    células das próprias pontas: o primeiro e o último ~stepM ficam de
 *    fora (o chão debaixo dos pés do operador e debaixo do drone não o
 *    tapam).
 *  - Curvatura da Terra com a refracção normal: a linha de vista desce
 *    d²/(2R)·(1 − 0,13) face ao plano tangente no olho. À escala de um
 *    bloco (≤ 1 km) são centímetros; a 3 km já decide um caso rasante.
 *  - Saída antecipada: o primeiro obstáculo encerra o raio — é o que se
 *    mostra ("tapado a 310 m da base") e poupa o resto das amostras.
 *  - Relevo desconhecido (null) não tapa: a amostra é saltada e contada. Um
 *    ponto do bloco visível só porque o raio atravessou buracos do MDT fica
 *    como `unknown`, para o painel o poder dizer.
 *
 * Atenção ao modelo de relevo: um MDS (o último voo da equipa) inclui
 * escombreiras, edifícios e vegetação, e é ele que diz o que o operador vê;
 * um MDT (DGT) ou o MDT global de ~30 m só têm o chão, e a bacia sai
 * optimista onde houver árvores ou construções.
 *
 * Coordenadas [lon, lat] (WGS84), cotas absolutas em metros. As contas
 * fazem-se num plano local em metros centrado no olho (units.js).
 */
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'
import { blockRing as hullOfBlock } from './baseLayout.js'

/** Altura dos olhos do operador acima do relevo na base (m). */
export const DEFAULT_EYE_HEIGHT_M = 1.7
/** Passo da grelha de pontos do bloco (m). */
export const DEFAULT_GRID_STEP_M = 25
/** Passo de amostragem do relevo ao longo de cada linha de vista (m). */
export const DEFAULT_LOS_STEP_M = 10
/** Coeficiente de refracção atmosférica normal. */
export const REFRACTION_K = 0.13
/** Raio da Terra para a curvatura (m). */
const EARTH_RADIUS_M = 6371000
/** Descida da linha de vista por metro² de distância: (1 − k) / (2R). */
const CURV_PER_M2 = (1 - REFRACTION_K) / (2 * EARTH_RADIUS_M)
/** Passo mínimo de amostragem, mesmo com MDS muito finos (m). */
const MIN_STEP_M = 1
/** Tolerância nas comparações de distância (m). */
const EPS_M = 1e-6

/** @typedef {(lon: number, lat: number) => number|null} ElevationFn */

/**
 * @typedef {object} SightResult
 * @property {boolean} visible
 * @property {number|null} blockedAtM  distância horizontal ao olho do 1.º obstáculo (null se visível)
 * @property {number|null} worstMarginM menor (linha de vista − relevo) nas amostras lidas;
 *   negativa quando tapado; null sem nenhuma amostra com relevo. Com a saída antecipada é o
 *   mínimo até ao 1.º obstáculo, inclusive
 * @property {number} samples  amostras com relevo
 * @property {number} skipped  amostras sem relevo (saltadas: não tapam)
 */

/**
 * @typedef {object} BlockVisibility
 * @property {number|null} visibleFrac fracção dos pontos da grelha não tapados (os `unknown`
 *   contam como visíveis); null sem pontos
 * @property {number} total pontos da grelha dentro do bloco
 * @property {Array<{point: number[], blockedAtM: number}>} hidden pontos tapados [lon, lat]
 *   — o centro de um quadrado de `gridStepM` de lado
 * @property {number} unknown pontos não tapados mas sem veredicto completo: o raio atravessou
 *   relevo desconhecido, ou não há cota do drone nesse ponto
 * @property {number} gridStepM
 * @property {number} eyeElev cota absoluta dos olhos do operador (m)
 */

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
const positive = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback)

/**
 * Passo efectivo e margem das pontas: o passo pedido baixa até à resolução
 * do MDT (sem passar de MIN_STEP_M); as pontas saltam sempre o passo
 * pedido, não o reduzido — com um MDS de 1 m não se quer o arbusto ao
 * lado do operador a tapar meio bloco.
 */
function sampling(stepM, resolutionM) {
  const asked = positive(stepM, DEFAULT_LOS_STEP_M)
  const res = positive(resolutionM, Infinity)
  return { step: Math.max(MIN_STEP_M, Math.min(asked, res)), skip: asked }
}

/**
 * Núcleo da linha de vista, no plano local do olho: o alvo está a (x, y)
 * metros do olho, à cota zT; o olho em (lon0, lat0) à cota zEye.
 * @returns {SightResult}
 */
function traceRay(lon0, lat0, mLon, zEye, x, y, zT, elevationAt, step, skip, curv) {
  const D = Math.hypot(x, y)
  let worst = null
  let samples = 0
  let skipped = 0
  const dz = zT - zEye
  for (let d = skip; d <= D - skip + EPS_M; d += step) {
    const t = d / D
    const g = elevationAt(lon0 + (x * t) / mLon, lat0 + (y * t) / M_PER_DEG_LAT)
    if (!Number.isFinite(g)) {
      skipped++
      continue
    }
    samples++
    // linha recta olho → alvo com ambas as pontas descidas pela curvatura:
    // face ao relevo descido em d, a linha fica curv·d·(D − d) mais baixa
    const margin = zEye + dz * t - g - curv * d * (D - d)
    if (worst === null || margin < worst) worst = margin
    if (margin < 0) return { visible: false, blockedAtM: d, worstMarginM: margin, samples, skipped }
  }
  return { visible: true, blockedAtM: null, worstMarginM: worst, samples, skipped }
}

/**
 * Linha de vista entre dois pontos com cota absoluta.
 *
 * Lê o relevo de `stepM` em `stepM` ao longo do segmento, sem o primeiro e
 * o último ~stepM (as células das pontas), e pára no primeiro obstáculo.
 * Com `curvature` aplica a curvatura da Terra com refracção normal.
 *
 * @param {{lon: number, lat: number, elev: number}} eye olho (cota absoluta, m)
 * @param {{lon: number, lat: number, elev: number}} target alvo (cota absoluta, m)
 * @param {{elevationAt: ElevationFn, stepM?: number, resolutionM?: number,
 *   curvature?: boolean}} opts `resolutionM`: resolução do MDT (m); o passo desce até ela
 * @returns {SightResult}
 */
export function lineOfSight(
  eye,
  target,
  { elevationAt, stepM = DEFAULT_LOS_STEP_M, resolutionM, curvature = true },
) {
  const { step, skip } = sampling(stepM, resolutionM)
  const mLon = metersPerDegLonSafe(eye.lat)
  const x = (target.lon - eye.lon) * mLon
  const y = (target.lat - eye.lat) * M_PER_DEG_LAT
  return traceRay(
    eye.lon,
    eye.lat,
    mLon,
    eye.elev,
    x,
    y,
    target.elev,
    elevationAt,
    step,
    skip,
    curvature ? CURV_PER_M2 : 0,
  )
}

/** Anel aberto (sem repetir o 1.º vértice no fim). */
function openRing(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return ring ?? []
  const a = ring[0]
  const b = ring[ring.length - 1]
  return a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring
}

/** Ponto dentro do anel (regra par-ímpar), em coordenadas locais. */
function inRing(x, y, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Centros das células de passo `g` que cobrem o intervalo [a, b], centradas
 * nele: os quadrados da grelha ladrilham o bloco e nenhum ponto cai em
 * cima da orla de um bloco alinhado com a grelha.
 */
function gridAxis(a, b, g) {
  const n = Math.max(1, Math.ceil((b - a) / g - EPS_M))
  const start = a + (b - a - (n - 1) * g) / 2
  return Array.from({ length: n }, (_, i) => start + i * g)
}

/**
 * Bacia de visão de um bloco a partir de uma base.
 *
 * Os olhos ficam à cota do relevo no ponto da base + `heightM`. O bloco é
 * amostrado numa grelha regular de `gridStepM` (centros das células que
 * cobrem o rectângulo envolvente, centrada nele; só os pontos dentro do
 * anel; se nenhum cai dentro, o centróide dos vértices). Em cada ponto o drone está a
 * `droneElevAt(lon, lat)` — o chamador decide: com seguimento de terreno é
 * relevo + AGL, sem ele refElev + altura relativa.
 *
 * @param {object} args
 * @param {{point: number[], heightM?: number}} args.eye base [lon, lat] e altura dos olhos
 * @param {number[][]} args.blockRing anel do bloco [[lon, lat], ...] (sem buracos)
 * @param {ElevationFn} args.droneElevAt cota absoluta do drone em cada ponto (null: desconhecida)
 * @param {ElevationFn} args.elevationAt relevo
 * @param {number} [args.gridStepM]
 * @param {number} [args.stepM] passo ao longo das linhas de vista
 * @param {number} [args.resolutionM] resolução do MDT (m), opcional
 * @param {boolean} [args.curvature]
 * @returns {BlockVisibility|{error: 'no-terrain'}}
 */
export function blockVisibility({
  eye,
  blockRing,
  droneElevAt,
  elevationAt,
  gridStepM = DEFAULT_GRID_STEP_M,
  stepM = DEFAULT_LOS_STEP_M,
  resolutionM,
  curvature = true,
}) {
  if (typeof elevationAt !== 'function' || !isPoint(eye?.point)) return { error: 'no-terrain' }
  const [lon0, lat0] = eye.point
  const z0 = elevationAt(lon0, lat0)
  if (!Number.isFinite(z0)) return { error: 'no-terrain' }
  const eyeElev = z0 + (Number.isFinite(eye.heightM) ? eye.heightM : DEFAULT_EYE_HEIGHT_M)
  const g = positive(gridStepM, DEFAULT_GRID_STEP_M)
  const { step, skip } = sampling(stepM, resolutionM)
  const curv = curvature ? CURV_PER_M2 : 0
  const mLon = metersPerDegLonSafe(lat0)

  // anel no plano local do olho
  const ring = openRing(blockRing)
    .filter(isPoint)
    .map((p) => [(p[0] - lon0) * mLon, (p[1] - lat0) * M_PER_DEG_LAT])
  /** @type {number[][]} */
  const pts = []
  if (ring.length >= 3) {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [x, y] of ring) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    const ys = gridAxis(y0, y1, g)
    for (const x of gridAxis(x0, x1, g))
      for (const y of ys) if (inRing(x, y, ring)) pts.push([x, y])
    if (pts.length === 0) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length
      pts.push([cx, cy])
    }
  }

  const hidden = []
  let unknown = 0
  for (const [x, y] of pts) {
    const lon = lon0 + x / mLon
    const lat = lat0 + y / M_PER_DEG_LAT
    const zT = droneElevAt(lon, lat)
    if (!Number.isFinite(zT)) {
      unknown++
      continue
    }
    const r = traceRay(lon0, lat0, mLon, eyeElev, x, y, zT, elevationAt, step, skip, curv)
    if (!r.visible) hidden.push({ point: [lon, lat], blockedAtM: r.blockedAtM })
    else if (r.skipped > 0) unknown++
  }
  const total = pts.length
  return {
    visibleFrac: total > 0 ? (total - hidden.length) / total : null,
    total,
    hidden,
    unknown,
    gridStepM: g,
    eyeElev,
  }
}

/**
 * Bacias de visão de todos os blocos, cada um visto da base que o serve.
 *
 * `assignment[blockId]` é o id da base ou um objecto com `baseId` (serve o
 * resultado de assignBlocksToBases e `layoutBlocks().byBlock`). Um bloco
 * sem `ring` usa o invólucro da célula e dos waypoints (blockRing de
 * baseLayout.js). Blocos sem base, ou cuja base não existe, ou sem função
 * de cota do drone, ficam de fora; uma base fora do relevo dá
 * `{ error: 'no-terrain' }` em cada um dos seus blocos.
 *
 * @param {object} args
 * @param {Array<{id: any, point: number[]}>} args.bases
 * @param {any[]} args.blocks blocos `{ id, ring }` ou do plano (`{ id, waypoints, cellRing? }`)
 * @param {Record<string, any>} args.assignment id do bloco → id da base, ou `{ baseId }`
 * @param {ElevationFn} args.elevationAt
 * @param {(block: any, base: any) => ElevationFn|null} args.droneElevAtFor cota absoluta do
 *   drone para os pontos deste bloco voado desta base
 * @param {number} [args.gridStepM]
 * @param {number} [args.eyeHeightM]
 * @param {number} [args.stepM]
 * @param {number} [args.resolutionM]
 * @returns {Record<string, BlockVisibility|{error: 'no-terrain'}>}
 */
export function baseViewsheds({
  bases,
  blocks,
  assignment,
  elevationAt,
  droneElevAtFor,
  gridStepM = DEFAULT_GRID_STEP_M,
  eyeHeightM = DEFAULT_EYE_HEIGHT_M,
  stepM = DEFAULT_LOS_STEP_M,
  resolutionM,
}) {
  /** @type {Record<string, BlockVisibility|{error: 'no-terrain'}>} */
  const out = {}
  if (typeof droneElevAtFor !== 'function') return out
  const byId = new Map((bases ?? []).filter((b) => isPoint(b?.point)).map((b) => [b.id, b]))
  for (const block of blocks ?? []) {
    const a = assignment?.[block?.id]
    const base = byId.get(a != null && typeof a === 'object' ? a.baseId : a)
    if (!base) continue
    const droneElevAt = droneElevAtFor(block, base)
    if (typeof droneElevAt !== 'function') continue
    out[block.id] = blockVisibility({
      eye: { point: base.point, heightM: eyeHeightM },
      blockRing: Array.isArray(block.ring) ? block.ring : hullOfBlock(block),
      droneElevAt,
      elevationAt,
      gridStepM,
      stepM,
      resolutionM,
    })
  }
  return out
}
