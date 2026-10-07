/**
 * Bacias de visão na missão de área: que blocos ficam, em parte, atrás do
 * relevo vistos dos olhos do operador na sua base. Liga src/mission/viewshed.js
 * (a linha de vista e a grelha de cada bloco) aos blocos, às bases e às
 * alturas do plano; o hook useViewsheds só agenda o trabalho.
 *
 *  - Um trabalho por bloco com base: o olho no MELHOR ponto da zona de
 *    descolagem para esse bloco (o operador anda até à beira do patamar
 *    para ver a encosta: num alto convexo, o ombro esconde do ponto da base
 *    a parte baixa da encosta). Procura-se num leque de pontos da zona
 *    (zoneEyePoints: o ponto da base e anéis até ao raio efectivo) com
 *    bacias GROSSEIRAS (EYE_SEARCH_GRID_M, EYE_SEARCH_STEP_M); fica o que vê
 *    mais do bloco, depois o de melhor rádio, depois o mais perto do ponto
 *    da base, e a bacia fina sai dele. Sem zona (sem relevo na base), o
 *    ponto da base. Com vegetação somada ao relevo, também o ponto da base:
 *    não se sabe onde há clareiras, e a beira de um cabeço arborizado não é
 *    uma (Mata de Vilar). O resultado diz onde ficou o olho (`eye`), para o
 *    painel e a ficha de campo. O anel do bloco (o invólucro da
 *    célula e dos waypoints, o mesmo do alcance visual) e a cota absoluta do
 *    drone: sem seguimento de terreno `cota de referência do bloco + altura`
 *    (a mínima da zona: o drone mais baixo possível, o lado pessimista),
 *    com ele `relevo + AGL`.
 *  - Cada trabalho tem uma chave com tudo o que muda o resultado (ponto da
 *    base, altura dos olhos, anel, cota do drone, relevo, resolução,
 *    grelha): mover a base A só refaz os blocos de A, e um Ctrl+Z
 *    reaproveita o que já foi calculado.
 *  - Rádio: cada ponto também com a ligação do comando (60 % da 1.ª zona
 *    de Fresnel a 2,4 GHz, da antena do comando): um ponto à vista pode ter
 *    o rádio em risco (a cumeada passa rente à linha de vista).
 *  - Vegetação e obstáculos: os metros que o operador soma ao relevo (por
 *    missão) só entram com um MDT ou o relevo global; um MDS importado já
 *    os tem.
 *  - createViewshedRun avança ponto a ponto da grelha e pára quando quem o
 *    chama diz (fatias de ~12 ms no browser): 150 blocos nunca prendem o
 *    browser mais do que uma fatia.
 */
import { blockRing } from './baseLayout.js'
import {
  DEFAULT_ANTENNA_HEIGHT_M,
  DEFAULT_EYE_HEIGHT_M,
  DEFAULT_GRID_STEP_M,
  DEFAULT_LOS_STEP_M,
  FRESNEL_FRACTION,
  RADIO_FREQ_GHZ,
  blockVisibility,
  blockVisibilityStepper,
} from './viewshed.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'

/** Resolução assumida do relevo global (Terrarium, SRTM ~1"). */
export const GLOBAL_TERRAIN_RESOLUTION_M = 30
/** Vegetação e obstáculos a somar ao relevo: limites (m). */
export const OBSTACLE_LIMITS_M = { min: 0, max: 60 }
/** O rádio das bacias de visão: 60 % da 1.ª zona de Fresnel a 2,4 GHz. */
export const RADIO_CHECK = Object.freeze({ freqGHz: RADIO_FREQ_GHZ, fraction: FRESNEL_FRACTION })

/** Olho no melhor ponto da zona: anéis e direcções do leque de pontos. */
export const EYE_ZONE_RINGS = 3
export const EYE_ZONE_DIRS = 12
/** Bacias grosseiras da procura do olho: grelha e passo ao longo da linha (m). */
export const EYE_SEARCH_GRID_M = 60
export const EYE_SEARCH_STEP_M = 20
/** Abaixo disto, o olho conta como no ponto da base (m). */
export const EYE_SHIFT_MIN_M = 5

/**
 * Pontos onde o operador pode ficar dentro da zona de descolagem: o ponto
 * da base e EYE_ZONE_RINGS anéis (raio/3, 2·raio/3, raio) de EYE_ZONE_DIRS
 * pontos cada. A zona já tem o raio efectivo (reduzido onde o desnível
 * passa o do equipamento), por isso todos estão em chão de descolagem. A
 * proposta de bases usa um leque mais leve (`rings`, `dirs`).
 * @param {number[]} point [lon, lat]
 * @param {number} radiusM
 * @param {{rings?: number, dirs?: number}} [opts]
 * @returns {number[][]}
 */
export function zoneEyePoints(
  point,
  radiusM,
  { rings = EYE_ZONE_RINGS, dirs = EYE_ZONE_DIRS } = {},
) {
  if (!isPoint(point)) return []
  const out = [[point[0], point[1]]]
  if (!(radiusM > 0)) return out
  const mLon = metersPerDegLonSafe(point[1])
  for (let k = 1; k <= rings; k++) {
    const r = (radiusM * k) / rings
    for (let d = 0; d < dirs; d++) {
      const a = (2 * Math.PI * d) / dirs
      out.push([point[0] + (r * Math.sin(a)) / mLon, point[1] + (r * Math.cos(a)) / M_PER_DEG_LAT])
    }
  }
  return out
}

/** Distância (m) e rumo (graus, 0 = norte) de `a` para `b`. */
function offsetOf(a, b) {
  const mLon = metersPerDegLonSafe(a[1])
  const dx = (b[0] - a[0]) * mLon
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT
  return {
    shiftM: Math.hypot(dx, dy),
    bearingDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
  }
}

/** Vegetação e obstáculos de um projecto: número limitado a 0-60 m (meio metro), senão 0. */
export function normalizeObstacleM(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return 0
  const c = Math.min(OBSTACLE_LIMITS_M.max, Math.max(OBSTACLE_LIMITS_M.min, n))
  return Math.round(c * 2) / 2
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const isPoint = (p) => Array.isArray(p) && fin(p[0]) && fin(p[1])

/**
 * @typedef {object} TerrainModel
 * @property {'global'|'file'} kind
 * @property {string|null} label     nome do ficheiro importado
 * @property {number} resolutionM   resolução (m): a do ficheiro, ou ~30 m no global
 * @property {'dtm'|'dsm'} surface  MDT (só o chão; o global também) ou MDS (com o que lá está)
 * @property {number} obstacleM     vegetação e obstáculos somados ao relevo (m): 0 com um MDS
 */

/**
 * Modelo de relevo usado nas bacias de visão, para o dizer no painel e na
 * ficha (e passar a resolução às linhas de vista). `surface` é a escolha do
 * operador para um ficheiro importado (MDT por omissão; o global é sempre
 * MDT); a vegetação pedida só se soma a um MDT.
 * @param {any} data terrain.data (useTerrain)
 * @param {{surface?: 'dtm'|'dsm', obstacleM?: number}} [opts]
 * @returns {TerrainModel|null}
 */
export function viewshedTerrainModel(data, { surface = 'dtm', obstacleM = 0 } = {}) {
  if (!data || typeof data.elevationAt !== 'function') return null
  const file = data.source === 'file'
  const kind = file && surface === 'dsm' ? 'dsm' : 'dtm'
  const extra = kind === 'dtm' ? normalizeObstacleM(obstacleM) : 0
  if (file)
    return {
      kind: 'file',
      label: typeof data.label === 'string' && data.label ? data.label : null,
      resolutionM: fin(data.resolutionM) && data.resolutionM > 0 ? data.resolutionM : 0,
      surface: kind,
      obstacleM: extra,
    }
  return {
    kind: 'global',
    label: null,
    resolutionM: GLOBAL_TERRAIN_RESOLUTION_M,
    surface: 'dtm',
    obstacleM: extra,
  }
}

/** Hash curto (FNV-1a de 32 bits) de um texto, para as chaves. */
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
const ptKey = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`

/**
 * @typedef {{mode: 'flat', elev: number}|{mode: 'agl', agl: number}} DroneHeight
 *   sem seguimento de terreno, a cota absoluta (constante) do drone no bloco;
 *   com ele, a altura acima do relevo
 */

/**
 * @typedef {object} ViewshedJob
 * @property {string} key       tudo o que muda o resultado
 * @property {number} blockId
 * @property {string} baseId
 * @property {string} baseLabel
 * @property {string} flightLabel
 * @property {number[]} eye     ponto da base [lon, lat]
 * @property {number} eyeRadiusM raio efectivo da zona onde se procura o olho (0: no ponto)
 * @property {number[][]} ring  anel do bloco
 * @property {DroneHeight} drone
 */

/**
 * Trabalhos das bacias de visão: um por bloco com base, pela ordem de voo.
 * Sem cota do drone (sem seguimento de terreno e sem cota de referência do
 * bloco) o bloco fica de fora.
 * @param {object} args
 * @param {any[]|null} args.blocks blocos do plano (id, waypoints, cellRing?)
 * @param {any} args.layout layoutBlocks (byBlock com baseId, refElev, flightLabel; order)
 * @param {Array<{id: string, label?: string, point: number[]}>} args.bases
 * @param {number} args.altitudeM altura do voo (relativa à base, ou AGL com seguimento)
 * @param {boolean} args.terrainFollow seguimento de terreno activo
 * @param {string|number} [args.terrainKey] identidade do relevo carregado
 * @param {number} [args.eyeHeightM]
 * @param {number} [args.antennaHeightM]
 * @param {number} [args.obstacleM] vegetação e obstáculos somados ao relevo (m)
 * @param {number} [args.resolutionM]
 * @param {number} [args.gridStepM]
 * @param {Record<string, any>} [args.zones] computeZones: o raio efectivo de cada base
 * @returns {ViewshedJob[]}
 */
export function viewshedJobs({
  blocks,
  layout,
  bases,
  zones = {},
  altitudeM,
  terrainFollow,
  terrainKey = '',
  eyeHeightM = DEFAULT_EYE_HEIGHT_M,
  antennaHeightM = DEFAULT_ANTENNA_HEIGHT_M,
  obstacleM = 0,
  resolutionM = 0,
  gridStepM = DEFAULT_GRID_STEP_M,
}) {
  if (!layout?.hasBases || !Array.isArray(blocks) || blocks.length === 0 || !fin(altitudeM))
    return []
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const baseById = new Map((bases ?? []).filter((b) => isPoint(b?.point)).map((b) => [b.id, b]))
  const common = [
    fin(eyeHeightM) ? eyeHeightM : DEFAULT_EYE_HEIGHT_M,
    fin(antennaHeightM) ? antennaHeightM : DEFAULT_ANTENNA_HEIGHT_M,
    fin(obstacleM) ? obstacleM : 0,
    terrainKey,
    fin(resolutionM) ? resolutionM : 0,
    gridStepM,
    `${RADIO_CHECK.freqGHz}/${RADIO_CHECK.fraction}`,
  ].join('|')
  const order = Array.isArray(layout.order) ? layout.order : blocks.map((b) => b.id)
  /** @type {ViewshedJob[]} */
  const out = []
  for (const id of order) {
    const block = byId.get(id)
    const info = layout.byBlock?.[id]
    const base = info?.baseId != null ? baseById.get(info.baseId) : null
    if (!block || !base) continue
    /** @type {DroneHeight|null} */
    let drone = null
    if (terrainFollow) drone = { mode: 'agl', agl: altitudeM }
    else if (fin(info.refElev)) drone = { mode: 'flat', elev: info.refElev + altitudeM }
    if (!drone) continue
    const ring = Array.isArray(block.ring) ? block.ring : blockRing(block)
    if (!Array.isArray(ring) || ring.length < 3) continue
    const droneKey = drone.mode === 'agl' ? `agl${drone.agl}` : `abs${drone.elev.toFixed(2)}`
    const z = zones?.[base.id]
    // com vegetação somada ao relevo o olho fica no ponto de descolagem: não
    // se sabe onde há clareiras, e a beira de um cabeço arborizado não é
    // uma (Mata de Vilar)
    const zoneR = z && !z.error && fin(z.radiusM) && z.radiusM > 0 ? z.radiusM : 0
    const eyeRadiusM = obstacleM > 0 ? 0 : zoneR
    out.push({
      key: `${id}|${ptKey(base.point)}|eye${eyeRadiusM.toFixed(1)}|${hash(ring.map(ptKey).join(';'))}|${droneKey}|${common}`,
      blockId: id,
      baseId: base.id,
      baseLabel: info.baseLabel ?? base.label ?? '',
      flightLabel: info.flightLabel || String(id),
      eye: base.point,
      eyeRadiusM,
      ring,
      drone,
    })
  }
  return out
}

/**
 * Cota absoluta do drone nos pontos de um bloco (droneElevAt de
 * blockVisibility): constante sem seguimento de terreno, relevo + AGL com ele
 * (null onde o relevo falta).
 * @param {DroneHeight} drone
 * @param {(lon: number, lat: number) => number|null} elevationAt
 * @returns {(lon: number, lat: number) => number|null}
 */
export function droneElevation(drone, elevationAt) {
  if (drone.mode === 'flat') {
    const z = drone.elev
    return () => z
  }
  const agl = drone.agl
  return (lon, lat) => {
    const g = elevationAt(lon, lat)
    return fin(g) ? g + agl : null
  }
}

/**
 * @typedef {object} ViewshedRun
 * @property {() => boolean} done
 * @property {(shouldYield: () => boolean) => boolean} step avança até `shouldYield()` dar
 *   true (testado a cada ponto da grelha); devolve true quando acabou
 * @property {Map<string, any>} results resultado de cada trabalho acabado, pela chave
 */

/**
 * Corrida das bacias de visão de uma lista de trabalhos, em fatias: cada
 * `step` avalia pontos da grelha (um raio por ponto, ~1-10 µs) até quem a
 * chama mandar parar, e retoma no mesmo ponto do mesmo bloco. Os
 * resultados são os de blockVisibility, por chave.
 * @param {ViewshedJob[]} jobs
 * @param {object} opts
 * @param {(lon: number, lat: number) => number|null} opts.elevationAt
 * @param {number} [opts.eyeHeightM]
 * @param {number} [opts.antennaHeightM]
 * @param {number} [opts.obstacleM] vegetação e obstáculos somados ao relevo (m)
 * @param {number} [opts.gridStepM]
 * @param {number} [opts.stepM]
 * @param {number} [opts.resolutionM]
 * @returns {ViewshedRun}
 */
export function createViewshedRun(
  jobs,
  {
    elevationAt,
    eyeHeightM = DEFAULT_EYE_HEIGHT_M,
    antennaHeightM = DEFAULT_ANTENNA_HEIGHT_M,
    obstacleM = 0,
    gridStepM = DEFAULT_GRID_STEP_M,
    stepM = DEFAULT_LOS_STEP_M,
    resolutionM,
  },
) {
  const results = new Map()
  let i = 0
  /** @type {import('./viewshed.js').BlockVisibilityStepper|null} */
  let cur = null
  // onde ficou o olho do trabalho de agora
  /** @type {{point: number[], shiftM: number, bearingDeg: number}|null} */
  let curEye = null
  // procura do olho do trabalho de agora: pontos da zona, o seguinte a
  // avaliar e o melhor até aqui
  /** @type {{pts: number[][], k: number, best: any}|null} */
  let search = null
  const done = () => i >= jobs.length
  const coarse = (job, point) =>
    blockVisibility({
      eye: { point, heightM: eyeHeightM, antennaHeightM },
      blockRing: job.ring,
      droneElevAt: droneElevation(job.drone, elevationAt),
      elevationAt,
      gridStepM: Math.max(EYE_SEARCH_GRID_M, gridStepM),
      stepM: Math.max(EYE_SEARCH_STEP_M, stepM),
      resolutionM: resolutionM > 0 ? resolutionM : undefined,
      fresnel: RADIO_CHECK,
      obstacleM,
    })
  // melhor olho: mais à vista, depois melhor rádio, depois mais perto da base
  const better = (a, b) =>
    !b ||
    a.vis > b.vis + 1e-9 ||
    (Math.abs(a.vis - b.vis) <= 1e-9 &&
      (a.radio > b.radio + 1e-9 || (Math.abs(a.radio - b.radio) <= 1e-9 && a.shiftM < b.shiftM)))
  const step = (shouldYield) => {
    while (i < jobs.length) {
      const job = jobs[i]
      if (!cur) {
        let eyePoint = job.eye
        if (job.eyeRadiusM > 0) {
          if (!search) search = { pts: zoneEyePoints(job.eye, job.eyeRadiusM), k: 0, best: null }
          while (search.k < search.pts.length) {
            const point = search.pts[search.k++]
            const r = /** @type {any} */ (coarse(job, point))
            if (!r.error && r.total > 0) {
              const cand = {
                point,
                vis: r.visibleFrac ?? 0,
                radio: (r.total - (r.radioFail ?? 0)) / r.total,
                shiftM: offsetOf(job.eye, point).shiftM,
              }
              if (better(cand, search.best)) search.best = cand
            }
            // tudo à vista com o rádio livre: nenhum outro ponto faz melhor
            if (search.best && search.best.vis >= 1 - 1e-9 && search.best.radio >= 1 - 1e-9) break
            if (search.k < search.pts.length && shouldYield()) return false
          }
          if (search.best) eyePoint = search.best.point
          search = null
        }
        const s = blockVisibilityStepper({
          eye: { point: eyePoint, heightM: eyeHeightM, antennaHeightM },
          blockRing: job.ring,
          droneElevAt: droneElevation(job.drone, elevationAt),
          elevationAt,
          gridStepM,
          stepM,
          resolutionM: resolutionM > 0 ? resolutionM : undefined,
          fresnel: RADIO_CHECK,
          obstacleM,
        })
        if ('error' in s) {
          results.set(job.key, s)
          i++
          if (shouldYield()) return done()
          continue
        }
        cur = s
        curEye = { point: eyePoint, ...offsetOf(job.eye, eyePoint) }
      }
      let finished = cur.next()
      while (!finished && !shouldYield()) finished = cur.next()
      if (!finished) return false
      results.set(job.key, { ...cur.result(), eye: curEye })
      cur = null
      i++
      if (shouldYield()) return done()
    }
    return true
  }
  return { done, step, results }
}

/**
 * @typedef {object} ViewSummary
 * @property {'ok'|'no-terrain'} status
 * @property {number} total        pontos da grelha
 * @property {number} hidden       pontos tapados (atrás do relevo)
 * @property {number} unknown
 * @property {number} hiddenFrac   0..1
 * @property {number} hiddenPct    % inteira; 1 % no mínimo quando há algum ponto tapado
 * @property {number} visiblePct   100 − hiddenPct
 * @property {number|null} blockedAtM distância típica (mediana, à dezena) do olho ao relevo que
 *   tapa; null sem pontos tapados
 * @property {number} radioFail    pontos com o rádio em risco (também os tapados)
 * @property {number} radioOkPct   % dos pontos com o rádio livre (100 − a % em risco, arredondada
 *   como a dos tapados)
 * @property {number} radioOnly    pontos À VISTA mas com o rádio em risco
 * @property {number} radioOnlyFrac 0..1
 * @property {number} radioOnlyPct % inteira, 1 % no mínimo quando há algum
 * @property {number|null} radioAtM distância típica (mediana, à dezena) da pior intrusão na zona
 *   de Fresnel nesses pontos; null sem eles
 * @property {{point: number[], shiftM: number, bearingDeg: number}|null} eye onde ficaram os
 *   olhos, quando saem do ponto da base (EYE_SHIFT_MIN_M ou mais); null no ponto
 */

/** Percentagem inteira de n em total, 1 % no mínimo quando n > 0. */
const pctOf = (n, total) =>
  n > 0 && total > 0 ? Math.min(100, Math.max(1, Math.round((n / total) * 100))) : 0

/** Mediana de distâncias, à dezena; null sem nenhuma. */
function medianTen(list) {
  const d = list.filter(fin).sort((a, b) => a - b)
  if (d.length === 0) return null
  const mid = d.length >> 1
  const median = d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2
  return Math.round(median / 10) * 10
}

/**
 * Resumo de uma bacia de visão para o painel, a ficha e o preflight. As
 * percentagens nunca arredondam para 0 com algum ponto (nem a visível para
 * 100 %). Sem o rádio no resultado (blockVisibility sem `fresnel`), os
 * campos do rádio ficam a zero.
 * @param {any} res blockVisibility ou {error}
 * @returns {ViewSummary|null}
 */
export function viewSummary(res) {
  if (!res) return null
  if (res.error)
    return {
      status: 'no-terrain',
      total: 0,
      hidden: 0,
      unknown: 0,
      hiddenFrac: 0,
      hiddenPct: 0,
      visiblePct: 100,
      blockedAtM: null,
      radioFail: 0,
      radioOkPct: 100,
      radioOnly: 0,
      radioOnlyFrac: 0,
      radioOnlyPct: 0,
      radioAtM: null,
      eye: null,
    }
  const total = res.total ?? 0
  const hidden = Array.isArray(res.hidden) ? res.hidden.length : 0
  const radioOnlyList = Array.isArray(res.radioRisk) ? res.radioRisk : []
  const radioFail = fin(res.radioFail) ? res.radioFail : 0
  const hiddenPct = pctOf(hidden, total)
  return {
    status: 'ok',
    total,
    hidden,
    unknown: res.unknown ?? 0,
    hiddenFrac: total > 0 ? hidden / total : 0,
    hiddenPct,
    visiblePct: 100 - hiddenPct,
    blockedAtM: hidden > 0 ? medianTen(res.hidden.map((h) => h.blockedAtM)) : null,
    radioFail,
    radioOkPct: 100 - pctOf(radioFail, total),
    radioOnly: radioOnlyList.length,
    radioOnlyFrac: total > 0 ? radioOnlyList.length / total : 0,
    radioOnlyPct: pctOf(radioOnlyList.length, total),
    radioAtM: radioOnlyList.length ? medianTen(radioOnlyList.map((h) => h.atM)) : null,
    eye: res.eye && res.eye.shiftM >= EYE_SHIFT_MIN_M ? res.eye : null,
  }
}

/**
 * @typedef {object} BlockView
 * @property {number} blockId
 * @property {string} baseId
 * @property {string} baseLabel
 * @property {string} flightLabel
 * @property {number[][]} ring
 * @property {any} result blockVisibility (ou {error}); null enquanto se calcula
 * @property {ViewSummary|null} summary null enquanto se calcula
 */

/**
 * Bacias de visão por bloco a partir dos trabalhos de agora e dos
 * resultados já calculados (pela chave): um bloco cujo trabalho mudou fica
 * sem resultado até ser recalculado — nunca se mostra a bacia de uma base
 * que já saiu dali.
 * @param {ViewshedJob[]} jobs
 * @param {Map<string, any>} results
 * @returns {{byBlock: Record<string, BlockView>, pending: number, ready: boolean}}
 */
export function viewshedsByBlock(jobs, results) {
  /** @type {Record<string, BlockView>} */
  const byBlock = {}
  let pending = 0
  for (const j of jobs ?? []) {
    const result = results?.get(j.key) ?? null
    if (!result) pending++
    byBlock[j.blockId] = {
      blockId: j.blockId,
      baseId: j.baseId,
      baseLabel: j.baseLabel,
      flightLabel: j.flightLabel,
      ring: j.ring,
      result,
      summary: viewSummary(result),
    }
  }
  return { byBlock, pending, ready: (jobs ?? []).length > 0 && pending === 0 }
}

/**
 * Quadrados de uma grelha para o mapa, juntos em faixas: os pontos da
 * grelha de um bloco estão em linhas de latitude constante, a `g` metros
 * uns dos outros; cada série de pontos seguidos numa linha dá um só
 * rectângulo [[sul, oeste], [norte, este]] (em graus, [lat, lon] como o
 * Leaflet). Um bloco de 660 m todo tapado são ~27 rectângulos em vez de
 * ~700.
 * @param {number[][]} points [lon, lat]
 * @param {number} g lado do quadrado (m)
 * @returns {Array<[[number, number], [number, number]]>}
 */
export function gridStrips(points, g) {
  const pts = (points ?? []).filter(isPoint)
  if (pts.length === 0) return []
  const step = fin(g) && g > 0 ? g : DEFAULT_GRID_STEP_M
  const rows = new Map()
  for (const p of pts) {
    const k = p[1].toFixed(7)
    if (!rows.has(k)) rows.set(k, [])
    rows.get(k).push(p[0])
  }
  /** @type {Array<[[number, number], [number, number]]>} */
  const out = []
  for (const [k, lons] of rows) {
    const lat = Number(k)
    const dLat = step / 2 / M_PER_DEG_LAT
    const mLon = metersPerDegLonSafe(lat)
    const dLon = step / 2 / mLon
    lons.sort((a, b) => a - b)
    let start = lons[0]
    let prev = lons[0]
    const flush = () =>
      out.push([
        [lat - dLat, start - dLon],
        [lat + dLat, prev + dLon],
      ])
    for (let i = 1; i < lons.length; i++) {
      // vizinhos na grelha: a g metros (com folga para o arredondamento)
      if ((lons[i] - prev) * mLon > step * 1.5) {
        flush()
        start = lons[i]
      }
      prev = lons[i]
    }
    flush()
  }
  return out
}

/** Faixas dos pontos tapados (atrás do relevo) de um blockVisibility. */
export const hiddenStrips = (res) =>
  gridStrips(Array.isArray(res?.hidden) ? res.hidden.map((h) => h.point) : [], res?.gridStepM)

/** Faixas dos pontos à vista com o rádio em risco de um blockVisibility. */
export const radioStrips = (res) =>
  gridStrips(Array.isArray(res?.radioRisk) ? res.radioRisk.map((h) => h.point) : [], res?.gridStepM)

/** Ponto para o rótulo da percentagem: o centróide dos vértices do anel. */
export function ringLabelPoint(ring) {
  const pts = (ring ?? []).filter(isPoint)
  if (pts.length === 0) return null
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ]
}
