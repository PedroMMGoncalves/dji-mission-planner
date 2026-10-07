/**
 * Zonas de descolagem: bases múltiplas para levantamentos grandes.
 *
 * Uma área de 5-10 km² é dividida em blocos quadrados (um jogo de baterias
 * cada) e voada a partir de VÁRIAS bases; uma base serve 2-4 blocos se o
 * drone ficar dentro do alcance visual (VLOS). O operador marca cada base
 * como um ponto, mas no campo descola muitas vezes a 20-100 m dali (pessoas,
 * linhas eléctricas, acessos). Por isso cada base é tratada como uma ZONA —
 * um círculo à volta do ponto — e o planeamento assume o pior caso dentro
 * dela:
 *
 *  - Cota de referência = cota MÍNIMA do relevo dentro da zona. As alturas
 *    do KMZ são relativas ao ponto de descolagem; descolar mais abaixo do
 *    que o assumido baixa o voo inteiro (menos folga entre bancadas a 40 m
 *    AGL), descolar mais acima é seguro. Com a mínima, em qualquer ponto da
 *    zona o voo fica entre 0 e +(máx − mín) metros acima do plano — a mesma
 *    regra de referenceElevation (reference.js), aplicada à zona.
 *  - Se a zona apanha o fundo de uma corta (base na crista de um poço de
 *    40 m a 60 m dali), a mínima arrastava a referência para o fundo e o
 *    voo subia 40 m sobre o plano em toda a área: o raio é REDUZIDO até o
 *    desnível dentro da zona ser ≤ maxReliefM, e fica registado porquê.
 *  - VLOS e trânsito medem-se a partir do pior ponto da zona: a distância
 *    no pior caso a um ponto p é distância(centro, p) + raio.
 *
 * Coordenadas [lon, lat] (WGS84), distâncias em metros. As distâncias
 * horizontais são de grande círculo (haversine com o raio da Terra do
 * turf), iguais às de `turf.distance`, mas sem criar objectos GeoJSON: a
 * proposta de bases faz centenas de milhares delas.
 */
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'

/** Raio por omissão da zona de descolagem (m). */
export const DEFAULT_ZONE_RADIUS_M = 100
/** Desnível máximo aceite dentro da zona antes de a reduzir (m). */
export const DEFAULT_MAX_RELIEF_M = 10
/** Alcance visual (VLOS) de referência por classe de aeronave (m). */
export const VLOS_M = Object.freeze({ large: 1000, small: 500 })

/** Raio médio da Terra usado pelo turf (m): as distâncias coincidem com turf.distance. */
const EARTH_RADIUS_M = 6371008.8
const RAD = Math.PI / 180
/** Tolerância numérica nas comparações de distância e desnível (m). */
const EPS_M = 1e-6

/**
 * @typedef {{point: number[], radiusM?: number}} ZoneLike
 *   zona (resultado de computeTakeoffZone) ou só `{ point, radiusM }`
 */

/**
 * @typedef {{point: number[], requestedRadiusM: number, radiusM: number,
 *   reduced: boolean, refElev: number, maxElev: number, reliefM: number,
 *   gainM: number, cause: {atM: number, reliefM: number}|null}} TakeoffZone
 */

/** Distância de grande círculo entre dois pontos [lon, lat] (m). */
export function distanceM(a, b) {
  const p1 = a[1] * RAD
  const p2 = b[1] * RAD
  const dp = p2 - p1
  const dl = (b[0] - a[0]) * RAD
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Ponto a `distM` metros do centro no azimute `bearingDeg` (aproximação local). */
function offsetPoint(center, distM, bearingDeg) {
  const b = bearingDeg * RAD
  return [
    center[0] + (distM * Math.sin(b)) / metersPerDegLonSafe(center[1]),
    center[1] + (distM * Math.cos(b)) / M_PER_DEG_LAT,
  ]
}

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
const zoneRadius = (zone, fallback = 0) => {
  const r = zone?.radiusM
  return Number.isFinite(r) && r >= 0 ? r : fallback
}

/**
 * Raios dos anéis de amostragem: de `stepM` em `stepM` até `radiusM`, e o
 * próprio `radiusM` quando não é múltiplo do passo.
 */
function ringRadii(radiusM, stepM) {
  const out = []
  if (!(radiusM > 0)) return out
  for (let r = stepM; r < radiusM - EPS_M; r += stepM) out.push(r)
  out.push(radiusM)
  return out
}

/**
 * Zona de descolagem à volta de uma base: raio efectivo, cota de referência
 * (a mínima da zona) e ganho máximo sobre o plano.
 *
 * Amostra o centro e anéis a cada `ringStepM` até `radiusM`, em `bearings`
 * azimutes igualmente espaçados (amostras sem relevo ignoradas). O raio
 * efectivo é o maior anel amostrado (0 incluído) tal que o desnível de
 * TODAS as amostras até ele é ≤ maxReliefM; `cause` dá o primeiro anel
 * onde o desnível passou o limite e o desnível acumulado até esse anel —
 * é a mensagem "zona reduzida a 35 m: 38 m de desnível a 60 m da base".
 *
 * @param {number[]} point centro da zona [lon, lat]
 * @param {{elevationAt: (lon: number, lat: number) => number|null, radiusM?: number,
 *   maxReliefM?: number, ringStepM?: number, bearings?: number}} opts
 * @returns {TakeoffZone|{error: 'no-terrain'}}
 *   `gainM` = maxElev − refElev: descolando em qualquer ponto da zona, o voo
 *   fica entre 0 e +gainM metros acima do planeado
 */
export function computeTakeoffZone(
  point,
  {
    elevationAt,
    radiusM = DEFAULT_ZONE_RADIUS_M,
    maxReliefM = DEFAULT_MAX_RELIEF_M,
    ringStepM = 10,
    bearings = 16,
  },
) {
  if (typeof elevationAt !== 'function' || !isPoint(point)) return { error: 'no-terrain' }
  const z0 = elevationAt(point[0], point[1])
  if (!Number.isFinite(z0)) return { error: 'no-terrain' }
  const requestedRadiusM = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0
  const step = Number.isFinite(ringStepM) && ringStepM > 0 ? ringStepM : 10
  const nDir = Number.isFinite(bearings) && bearings >= 1 ? Math.round(bearings) : 16
  const maxRelief = Number.isFinite(maxReliefM) && maxReliefM >= 0 ? maxReliefM : Infinity

  let minE = z0
  let maxE = z0
  let effR = 0
  let cause = null
  for (const r of ringRadii(requestedRadiusM, step)) {
    let ringMin = minE
    let ringMax = maxE
    for (let k = 0; k < nDir; k++) {
      const p = offsetPoint(point, r, (360 * k) / nDir)
      const z = elevationAt(p[0], p[1])
      if (!Number.isFinite(z)) continue
      if (z < ringMin) ringMin = z
      if (z > ringMax) ringMax = z
    }
    if (ringMax - ringMin > maxRelief + EPS_M) {
      cause = { atM: r, reliefM: ringMax - ringMin }
      break
    }
    minE = ringMin
    maxE = ringMax
    effR = r
  }
  return {
    point: [point[0], point[1]],
    requestedRadiusM,
    radiusM: effR,
    reduced: effR < requestedRadiusM - EPS_M,
    refElev: minE,
    maxElev: maxE,
    reliefM: maxE - minE,
    gainM: maxE - minE,
    cause,
  }
}

/**
 * Distância no pior caso (m) entre a zona e o ponto `p`: do centro ao ponto
 * mais o raio — descolando na orla oposta da zona.
 * @param {ZoneLike} zone
 * @param {number[]} p [lon, lat]
 * @returns {number}
 */
export function worstDistanceM(zone, p) {
  return distanceM(zone.point, p) + zoneRadius(zone)
}

/** Anel aberto (sem repetir o 1.º vértice no fim). */
function openRing(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return ring ?? []
  const a = ring[0]
  const b = ring[ring.length - 1]
  return a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring
}

/** Centróide de vértices de um anel (o mesmo que turf.centroid). */
function ringCentroid(ring) {
  const r = openRing(ring)
  let x = 0
  let y = 0
  for (const v of r) {
    x += v[0]
    y += v[1]
  }
  return [x / r.length, y / r.length]
}

/**
 * VLOS no pior caso (m) de um bloco visto da zona: o vértice mais afastado
 * do anel do bloco mais o raio. Para um polígono, o ponto mais afastado de
 * um centro é sempre um vértice.
 * @param {ZoneLike} zone
 * @param {number[][]} blockRing anel do bloco [[lon, lat], ...]
 * @returns {number}
 */
export function blockWorstVlosM(zone, blockRing) {
  let far = 0
  for (const v of openRing(blockRing)) {
    const d = distanceM(zone.point, v)
    if (d > far) far = d
  }
  return far + zoneRadius(zone)
}

/**
 * Trânsito no pior caso (m) de um bloco: ida da zona ao primeiro waypoint e
 * volta do último, cada perna com o raio da zona.
 * @param {ZoneLike} zone
 * @param {number[]} firstWaypoint [lon, lat, ...]
 * @param {number[]} lastWaypoint [lon, lat, ...]
 * @returns {number}
 */
export function blockWorstTransitM(zone, firstWaypoint, lastWaypoint) {
  return worstDistanceM(zone, firstWaypoint) + worstDistanceM(zone, lastWaypoint)
}

/** Rótulo de base pela ordem de escolha: A..Z, AA, AB, ... (como colunas de folha de cálculo). */
export function baseLabel(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Pontos candidatos a base: vértices, pontos médios das arestas e
 * centróides dos blocos, e depois os pontos dados de fora (`extra`, ex.: os
 * altos do relevo de baseSites.js), sem duplicados a menos de ~1 m
 * (vértices e arestas partilhados por blocos vizinhos aparecem uma só vez).
 */
function candidatePoints(prepared, extra = []) {
  const lat0 = prepared[0].centroid[1]
  const mLon = metersPerDegLonSafe(lat0)
  const cells = new Map()
  const out = []
  const key = (i, j) => `${i},${j}`
  const add = (p) => {
    const x = p[0] * mLon
    const y = p[1] * M_PER_DEG_LAT
    const i = Math.floor(x)
    const j = Math.floor(y)
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const list = cells.get(key(i + di, j + dj))
        if (list && list.some((q) => Math.hypot(q.x - x, q.y - y) < 1)) return
      }
    const k = key(i, j)
    if (!cells.has(k)) cells.set(k, [])
    cells.get(k).push({ x, y })
    out.push(p)
  }
  for (const b of prepared) {
    const r = b.ring
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const c = r[(i + 1) % r.length]
      add([a[0], a[1]])
      add([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2])
    }
    add(b.centroid)
  }
  for (const p of extra ?? []) if (isPoint(p)) add([p[0], p[1]])
  return out
}

/** Anel aberto, centróide e raio envolvente (centróide → vértice mais afastado) de cada bloco. */
function prepareBlocks(blocks) {
  return blocks.map((b) => {
    const ring = openRing(b.ring)
    const centroid = ringCentroid(ring)
    let spanM = 0
    for (const v of ring) spanM = Math.max(spanM, distanceM(centroid, v))
    return { id: b.id, ring, centroid, spanM }
  })
}

/**
 * O candidato `p` vê o bloco inteiro dentro do VLOS, com a zona de raio
 * `radiusM`? Poda pelo centróide antes de percorrer os vértices: o vértice
 * mais afastado está pelo menos tão longe como o centróide e, pela
 * desigualdade triangular, no máximo a centróide + spanM.
 */
function covers(p, blk, radiusM, vlosM) {
  const d = distanceM(p, blk.centroid)
  if (d + radiusM > vlosM + 1) return false
  if (d + blk.spanM + radiusM <= vlosM) return true
  return blockWorstVlosM({ point: p, radiusM }, blk.ring) <= vlosM + EPS_M
}

/**
 * @typedef {object} SiteInfo
 *   O sítio de um candidato (baseSites.js, siteInfo).
 * @property {number} elev    cota do relevo no ponto (m)
 * @property {number} reliefM desnível da zona de descolagem à volta dele (m)
 */

/**
 * @typedef {object} SiteView
 *   Um bloco visto de um candidato (bacia de visão grosseira, baseSites.js).
 * @property {number} radio   fracção dos pontos do bloco com o rádio livre (0..1)
 * @property {number} visible fracção dos pontos do bloco à vista (0..1)
 * @property {number} n       pontos avaliados (o peso na média de vários blocos)
 */

/**
 * @typedef {object} SiteRule
 *   Qualidade do sítio de uma base, de fora do módulo (relevo, rádio e
 *   vista: baseSites.js), para a proposta não ficar presa à geometria.
 * @property {(point: number[]) => SiteInfo|null} info o sítio do candidato;
 *   null = inutilizável (fora do relevo, zona demasiado reduzida)
 * @property {(point: number[], blockId: any, info: SiteInfo) => SiteView|null} view
 *   o bloco visto do candidato
 * @property {(view: SiteView) => boolean} accepts o bloco aceita o candidato com esta vista
 */

/**
 * @typedef {object} ProposalEntry
 * @property {number} bi   índice do bloco em `setup.prepared`
 * @property {number} d    distância do candidato ao centróide do bloco (m)
 * @property {SiteView|null} [view]
 * @property {boolean} [ok] o bloco aceita o sítio (só com regra de sítio)
 */

/**
 * @typedef {object} ProposalCandidate
 * @property {number[]} point
 * @property {ProposalEntry[]} all blocos que vê inteiros dentro do VLOS, do mais perto ao mais longe
 * @property {SiteInfo|null} [info]
 */

/**
 * @typedef {object} ProposalSetup
 * @property {Array<{id: any, ring: number[][], centroid: number[], spanM: number}>} prepared
 * @property {number[][]} points candidatos, pela ordem (os dos blocos, depois os de fora)
 * @property {number} radiusM
 * @property {number} vlosM
 * @property {number} cap  máximo de blocos por base (Infinity sem limite)
 */

/**
 * @typedef {object} ProposedBase
 * @property {string} id   rótulo pela ordem de escolha
 * @property {number[]} point
 * @property {any[]} blockIds
 * @property {boolean} outOfVlos bloco maior do que o VLOS: base própria no centróide
 * @property {boolean} siteOk    todos os blocos aceitam o sítio (sempre true sem regra de sítio)
 * @property {{elev: number|null, reliefM: number|null, radio: number, visible: number}|null} site
 *   com regra de sítio: a cota e o desnível da zona, e o rádio e a vista médios dos seus blocos
 */

/**
 * Preparação da proposta: blocos válidos e pontos candidatos (os de fora,
 * `extraPoints`, depois dos dos blocos). Null sem blocos ou sem VLOS.
 * @param {Array<{id: any, ring: number[][]}>} blocks
 * @param {{vlosM: number, radiusM?: number, maxBlocksPerBase?: number, extraPoints?: number[][]}} opts
 * @returns {ProposalSetup|null}
 */
export function proposalSetup(
  blocks,
  { vlosM, radiusM = DEFAULT_ZONE_RADIUS_M, maxBlocksPerBase = Infinity, extraPoints = [] },
) {
  const valid = (blocks ?? []).filter((b) => Array.isArray(b?.ring) && b.ring.length >= 3)
  if (valid.length === 0 || !(vlosM > 0)) return null
  const prepared = prepareBlocks(valid)
  return {
    prepared,
    points: candidatePoints(prepared, extraPoints),
    radiusM: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0,
    vlosM,
    cap: maxBlocksPerBase >= 1 ? Math.floor(maxBlocksPerBase) : Infinity,
  }
}

/**
 * Blocos que o candidato `point` vê inteiros dentro do VLOS (pior caso, com
 * a zona), do mais perto ao mais longe (distância ao centróide).
 * @param {ProposalSetup} setup
 * @param {number[]} point
 * @returns {ProposalEntry[]}
 */
export function candidateCover(setup, point) {
  const { prepared, radiusM, vlosM } = setup
  const cov = []
  for (let bi = 0; bi < prepared.length; bi++)
    if (covers(point, prepared[bi], radiusM, vlosM))
      cov.push({ bi, d: distanceM(point, prepared[bi].centroid) })
  cov.sort((a, b) => a.d - b.d)
  return cov
}

/** Tolerâncias dos desempates pelo sítio: fracções de rádio e vista, cota, desnível. */
const SITE_FRAC_TOL = 0.005
const SITE_ELEV_TOL_M = 0.5
const SITE_RELIEF_TOL_M = 0.5
/** 1 quando x é maior do que y para lá da tolerância, −1 quando menor, 0 iguais. */
const cmpTol = (x, y, tol) => (x > y + tol ? 1 : y > x + tol ? -1 : 0)

/** Rádio e vista médios de vários blocos, pesados pelos pontos de cada um. */
function pooledView(entries) {
  let n = 0
  let radio = 0
  let visible = 0
  for (const e of entries) {
    const w = e.view && e.view.n > 0 ? e.view.n : 1
    n += w
    radio += (e.view?.radio ?? 0) * w
    visible += (e.view?.visible ?? 0) * w
  }
  return n > 0 ? { radio: radio / n, visible: visible / n } : { radio: 0, visible: 0 }
}

/** Cota e desnível (desempates finais pelo sítio): a mais alta, depois a mais plana. */
function cmpTerrain(a, b) {
  return (
    cmpTol(a?.elev ?? -Infinity, b?.elev ?? -Infinity, SITE_ELEV_TOL_M) ||
    cmpTol(b?.reliefM ?? Infinity, a?.reliefM ?? Infinity, SITE_RELIEF_TOL_M)
  )
}

/**
 * Cobertura gulosa dos blocos pelos candidatos (de candidateCover e, com
 * regra de sítio, com `info` e `view`/`ok` em cada bloco). Ver proposeBases.
 * @param {ProposalSetup} setup
 * @param {ProposalCandidate[]} candidates
 * @param {{withSite?: boolean}} [opts]
 * @returns {ProposedBase[]}
 */
export function greedyBases(setup, candidates, { withSite = false } = {}) {
  const { prepared, cap } = setup
  const nB = prepared.length
  const cands = candidates
    .filter((c) => c.all.length > 0)
    .map((c) => ({
      point: c.point,
      all: c.all,
      info: withSite ? (c.info ?? null) : null,
      cov: withSite ? c.all.filter((e) => e.ok) : c.all,
    }))
  const visible = new Array(nB).fill(false)
  for (const c of cands) for (const { bi } of c.all) visible[bi] = true
  const coverable = new Array(nB).fill(false)
  for (const c of cands) for (const { bi } of c.cov) coverable[bi] = true
  const covered = new Array(nB).fill(false)
  let remaining = coverable.filter(Boolean).length
  /** @type {ProposedBase[]} */
  const bases = []
  // por base: o candidato e as entradas (bloco, vista) que serve — para
  // juntar a uma base os blocos que outro passo lhe dê, e para a consolidação
  /** @type {Array<{c: any, picks: any[]}>} */
  const own = []
  const siteOf = (c, picks) => {
    const q = withSite ? pooledView(picks) : null
    return q
      ? {
          elev: c.info ? c.info.elev : null,
          reliefM: c.info ? c.info.reliefM : null,
          radio: q.radio,
          visible: q.visible,
        }
      : null
  }
  const push = (c, pick, siteOk) => {
    for (const e of pick) covered[e.bi] = true
    // o mesmo sítio já é base: os blocos juntam-se a ela (antes saía uma
    // segunda base no mesmo ponto, e o operador mudava de base sem sair do sítio)
    const k = own.findIndex((o) => o.c === c)
    if (k >= 0 && bases[k].blockIds.length + pick.length <= cap) {
      own[k].picks.push(...pick)
      bases[k].blockIds.push(...pick.map((e) => prepared[e.bi].id))
      bases[k].siteOk = bases[k].siteOk && siteOk
      bases[k].site = siteOf(c, own[k].picks)
      return
    }
    own.push({ c, picks: [...pick] })
    bases.push({
      id: baseLabel(bases.length),
      point: c.point.slice(),
      blockIds: pick.map((e) => prepared[e.bi].id),
      outOfVlos: false,
      siteOk,
      site: siteOf(c, pick),
    })
  }
  // a melhor do que b? Mais blocos; com sítio, melhor rádio e
  // melhor vista; blocos mais difíceis; com sítio, mais alto e mais plano;
  // mais perto
  const better = (a, b) => {
    if (a.gain !== b.gain) return a.gain > b.gain
    if (withSite) {
      const s =
        cmpTol(a.q.radio, b.q.radio, SITE_FRAC_TOL) ||
        cmpTol(a.q.visible, b.q.visible, SITE_FRAC_TOL)
      if (s !== 0) return s > 0
    }
    if (a.opt !== b.opt) return a.opt < b.opt
    if (withSite) {
      const s = cmpTerrain(a.c.info, b.c.info)
      if (s !== 0) return s > 0
    }
    return a.sum < b.sum - 1
  }
  while (remaining > 0) {
    // ganho de cada candidato e quantos candidatos partilháveis vêem cada bloco
    const gain = cands.map((c) => {
      let n = 0
      for (const { bi } of c.cov) if (!covered[bi]) n++
      return Math.min(n, cap)
    })
    const options = new Array(nB).fill(0)
    cands.forEach((c, ci) => {
      if (gain[ci] < 2) return
      for (const { bi } of c.cov) if (!covered[bi]) options[bi]++
    })
    let best = null
    for (let ci = 0; ci < cands.length; ci++) {
      if (gain[ci] === 0 || (best && gain[ci] < best.gain)) continue
      const pick = []
      let opt = 0
      let sum = 0
      for (const e of cands[ci].cov) {
        if (covered[e.bi]) continue
        pick.push(e)
        opt += options[e.bi]
        sum += e.d
        if (pick.length >= cap) break
      }
      const cur = {
        c: cands[ci],
        gain: gain[ci],
        opt,
        sum,
        pick,
        q: withSite ? pooledView(pick) : null,
      }
      if (!best || better(cur, best)) best = cur
    }
    if (!best) break // não acontece: remaining > 0 implica um candidato com ganho
    push(best.c, best.pick, true)
    remaining -= best.pick.length
  }
  // blocos que se vêem, mas de nenhum sítio aceite: o melhor sítio que os vê
  // (utilizável primeiro, depois rádio, vista, mais blocos, cota, desnível,
  // distância), assinalado
  let left = 0
  for (let bi = 0; bi < nB; bi++) if (visible[bi] && !coverable[bi]) left++
  const fallbackBetter = (a, b) => {
    const s =
      cmpTol(a.c.info ? 1 : 0, b.c.info ? 1 : 0, 0) ||
      cmpTol(a.q.radio, b.q.radio, SITE_FRAC_TOL) ||
      cmpTol(a.q.visible, b.q.visible, SITE_FRAC_TOL) ||
      cmpTol(a.pick.length, b.pick.length, 0) ||
      cmpTerrain(a.c.info, b.c.info)
    return s !== 0 ? s > 0 : a.sum < b.sum - 1
  }
  while (left > 0) {
    let best = null
    for (const c of cands) {
      const pick = []
      let sum = 0
      for (const e of c.all) {
        if (coverable[e.bi] || covered[e.bi]) continue
        pick.push(e)
        sum += e.d
        if (pick.length >= cap) break
      }
      if (pick.length === 0) continue
      const cur = { c, pick, sum, q: pooledView(pick) }
      if (!best || fallbackBetter(cur, best)) best = cur
    }
    if (!best) break
    push(best.c, best.pick, false)
    left -= best.pick.length
  }
  // Consolidação: menos bases é menos deslocações. Uma base cujos blocos
  // TODOS passem para outras bases já escolhidas (que os vejam dentro do
  // VLOS, com sítio aceite — ou, para um bloco sem sítio aceite, com o rádio
  // pelo menos tão bom — e sem passar o limite de voos) desaparece. As mais
  // pequenas primeiro, até não haver mudanças.
  const entryOf = (o, bi) => o.c.all.find((e) => e.bi === bi) ?? null
  const radioOf = (e) => (e && e.view ? e.view.radio : 0)
  for (let changed = true; changed;) {
    changed = false
    const order = own.map((o, k) => k).sort((a, b) => own[a].picks.length - own[b].picks.length)
    for (const k of order) {
      if (own[k].picks.length === 0) continue
      const moves = []
      const load = own.map((o) => o.picks.length)
      for (const e of own[k].picks) {
        let to = -1
        for (let j = 0; j < own.length; j++) {
          if (j === k || own[j].picks.length === 0 || load[j] + 1 > cap) continue
          const t = entryOf(own[j], e.bi)
          if (!t) continue
          const fine = withSite ? t.ok || (!e.ok && radioOf(t) >= radioOf(e)) : true
          if (!fine) continue
          if (to < 0 || load[j] > load[to]) to = j // a maior: concentra
        }
        if (to < 0) break
        moves.push([e, to])
        load[to]++
      }
      if (moves.length !== own[k].picks.length) continue
      for (const [e, to] of moves) {
        const t = entryOf(own[to], e.bi)
        own[to].picks.push(t)
        bases[to].blockIds.push(prepared[e.bi].id)
        if (withSite && !t.ok) bases[to].siteOk = false
      }
      own[k].picks = []
      bases[k].blockIds = []
      changed = true
    }
  }
  for (let k = bases.length - 1; k >= 0; k--) {
    if (bases[k].blockIds.length === 0) {
      bases.splice(k, 1)
      own.splice(k, 1)
    } else bases[k].site = siteOf(own[k].c, own[k].picks)
  }
  bases.forEach((b, i) => (b.id = baseLabel(i)))

  // blocos que nenhum candidato vê inteiros: base própria, assinalada
  for (let bi = 0; bi < nB; bi++) {
    if (visible[bi]) continue
    bases.push({
      id: baseLabel(bases.length),
      point: prepared[bi].centroid.slice(),
      blockIds: [prepared[bi].id],
      outOfVlos: true,
      siteOk: true, // sítio não avaliado: o bloco já vai assinalado
      site: null,
    })
  }
  return bases
}

/**
 * Proposta de bases: cobertura gulosa dos blocos por pontos candidatos.
 *
 * Candidatos = vértices, pontos médios das arestas e centróides dos blocos,
 * mais `extraPoints` (ex.: os altos do relevo, baseSites.js). Um candidato
 * cobre um bloco quando blockWorstVlosM({point, radiusM}, ring) ≤ vlosM. Em
 * cada passo escolhe-se o candidato que cobre mais blocos ainda por cobrir
 * (no máximo `maxBlocksPerBase`, os mais próximos). Desempates, por esta
 * ordem:
 *  1. blocos mais "difíceis" primeiro: menor soma, sobre os blocos que o
 *     candidato cobriria, do número de candidatos que ainda partilham cada
 *     um com outro bloco. Sem isto, numa grelha regular (todos os pontos
 *     médios à mesma distância) o desempate caía no ruído numérico e a
 *     gulosa podia emparelhar o bloco central primeiro e deixar três
 *     cantos isolados — 6 bases onde 5 chegam;
 *  2. menor soma das distâncias aos centróides desses blocos (tolerância 1 m);
 *  3. ordem do candidato (determinístico).
 * Um bloco que nenhum candidato cobre fica com base própria no centróide e
 * `outOfVlos: true` (o bloco é grande de mais para o VLOS dado, mesmo
 * descolando dentro dele). Rótulos A..Z, AA, AB, ... pela ordem de escolha.
 *
 * Com `site` (SiteRule): cada candidato tem o seu sítio (`info`, null =
 * inutilizável) e cada bloco que vê a sua vista (`view`: rádio e vista); um
 * candidato só cobre um bloco se, além do VLOS, o sítio for utilizável e o
 * bloco o aceitar (`accepts(view)`). A gulosa corre sobre essa cobertura e
 * os desempates passam a ser: mais blocos; melhor rádio médio dos blocos
 * que serviria; melhor vista média; os blocos mais difíceis; o sítio mais
 * alto; o mais plano (menor desnível da zona); o mais perto. Os blocos que
 * nenhum sítio aceite cobre recebem, numa segunda volta, o melhor sítio que
 * os vê (utilizável, rádio, vista, mais blocos, cota, desnível), com
 * `siteOk: false`: propõe-se o melhor que há e o preflight fala. Sem `site`
 * o resultado é o de sempre.
 *
 * @param {Array<{id: any, ring: number[][]}>} blocks
 * @param {{vlosM: number, radiusM?: number, maxBlocksPerBase?: number, site?: SiteRule|null,
 *   extraPoints?: number[][]}} opts
 * @returns {ProposedBase[]}
 */
export function proposeBases(
  blocks,
  {
    vlosM,
    radiusM = DEFAULT_ZONE_RADIUS_M,
    maxBlocksPerBase = Infinity,
    site = null,
    extraPoints = [],
  },
) {
  const setup = proposalSetup(blocks, { vlosM, radiusM, maxBlocksPerBase, extraPoints })
  if (!setup) return []
  const rule = site && typeof site.info === 'function' ? site : null
  /** @type {ProposalCandidate[]} */
  const candidates = []
  for (const point of setup.points) {
    const all = candidateCover(setup, point)
    // candidatos que não cobrem nada não entram na gulosa
    if (all.length === 0) continue
    const c = { point, all, info: null }
    if (rule) {
      c.info = rule.info(point) ?? null
      for (const e of all) {
        const id = setup.prepared[e.bi].id
        e.view = c.info ? (rule.view?.(point, id, c.info) ?? null) : null
        e.ok = Boolean(c.info && e.view && (rule.accepts ? rule.accepts(e.view) : true))
      }
    }
    candidates.push(c)
  }
  return greedyBases(setup, candidates, { withSite: Boolean(rule) })
}

/**
 * Atribuição de blocos a bases. As escolhas manuais (`manual[blockId] =
 * baseId`) ficam como estão — com o VLOS na mesma reportado — desde que a
 * base exista; os restantes blocos vão para a base de menor VLOS no pior
 * caso que os veja inteiros, e se nenhuma os vê, para a de menor VLOS no
 * pior caso, com `withinVlos: false`. Cada base pode trazer o seu `radiusM`
 * (zona reduzida); sem ele usa-se `radiusM`.
 *
 * @param {Array<{id: any, ring: number[][]}>} blocks
 * @param {Array<{id: any, point: number[], radiusM?: number}>} bases
 * @param {{vlosM: number, radiusM?: number, manual?: Record<string, any>}} opts
 * @returns {Record<string, {baseId: any, worstVlosM: number, withinVlos: boolean,
 *   manual: boolean}>} por id de bloco; blocos sem bases (lista vazia) ficam de fora
 */
export function assignBlocksToBases(
  blocks,
  bases,
  { vlosM, radiusM = DEFAULT_ZONE_RADIUS_M, manual = {} },
) {
  /** @type {Record<string, {baseId: any, worstVlosM: number, withinVlos: boolean, manual: boolean}>} */
  const out = {}
  const usable = (bases ?? []).filter((b) => b && isPoint(b.point))
  if (usable.length === 0) return out
  const zones = usable.map((b) => ({ id: b.id, point: b.point, radiusM: zoneRadius(b, radiusM) }))
  const within = (d) => d <= vlosM + EPS_M
  for (const blk of blocks ?? []) {
    if (!Array.isArray(blk?.ring) || blk.ring.length < 3) continue
    const worst = zones.map((z) => blockWorstVlosM(z, blk.ring))
    const wanted = manual?.[blk.id]
    const mi = wanted == null ? -1 : zones.findIndex((z) => z.id === wanted)
    if (mi >= 0) {
      out[blk.id] = {
        baseId: zones[mi].id,
        worstVlosM: worst[mi],
        withinVlos: within(worst[mi]),
        manual: true,
      }
      continue
    }
    let bi = 0
    for (let i = 1; i < zones.length; i++) if (worst[i] < worst[bi]) bi = i
    // a de menor VLOS no pior caso: se alguma base vê o bloco inteiro, esta vê
    out[blk.id] = {
      baseId: zones[bi].id,
      worstVlosM: worst[bi],
      withinVlos: within(worst[bi]),
      manual: false,
    }
  }
  return out
}
