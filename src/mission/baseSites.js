/**
 * Sítios das bases propostas: planos ou altos, com o rádio livre.
 *
 * A prática da equipa (LNEG, áreas mineiras, M300 RTK) é descolar de um
 * sítio PLANO ou de um dos pontos mais ALTOS da área, nunca de um baixo, por
 * causa da LIGAÇÃO RÁDIO: em Mata de Vilar (Lousada), um monte pequeno com
 * árvores altas, o sinal caiu quando o drone passou para trás dele. Uma
 * altura relativa pequena ou negativa a partir de uma base alta é aceitável
 * — o aviso do preflight (altura relativa < 20 m) e as verificações de folga
 * ao solo já falam —, e a proposta não troca o rádio nem a vista por ela.
 *
 *  - Sítio utilizável (siteInfo): com relevo, e a zona de descolagem
 *    (computeTakeoffZone, com o raio e o desnível do equipamento) não fica
 *    reduzida abaixo de SITE_MIN_ZONE_FRAC do raio pedido — há chão plano
 *    para descolar à volta do ponto.
 *  - Candidatos: os dos blocos (vértices, pontos médios das arestas,
 *    centróides) e os altos do relevo (highPointsStepper): uma grelha de
 *    SITE_HIGHPOINT_GRID_M sobre os blocos e uma margem do tamanho do VLOS,
 *    os máximos locais e os pontos de patamar plano, no máximo
 *    SITE_HIGHPOINTS_PER_BLOCK por bloco (os mais altos que o vêem inteiro).
 *  - Cada candidato utilizável vê cada bloco que cobre dentro do VLOS numa
 *    bacia de visão GROSSEIRA (viewshed.js: grelha de SITE_VIEW_GRID_M, raio
 *    lido a SITE_VIEW_STEP_M), com o rádio (60 % da 1.ª zona de Fresnel a
 *    2,4 GHz), as alturas dos olhos e do comando, a vegetação da missão e a
 *    cota do drone como nas bacias de visão (viewshedPlan.js): com seguir
 *    terreno relevo + AGL, sem ele a cota da zona do candidato + altura. As
 *    bacias finas (25 m) ficam para o painel, o mapa e o preflight, já com
 *    as bases escolhidas.
 *  - Um bloco aceita o candidato quando o rádio fica livre em pelo menos
 *    SITE_RADIO_OK_FRAC dos seus pontos. A escolha (proposeBases com a
 *    regra): mais blocos; melhor rádio; melhor vista; blocos mais difíceis;
 *    o sítio mais alto; o mais plano; o mais perto. Um bloco sem candidato
 *    aceite recebe o melhor que há (assinalado), e o preflight avisa.
 *  - createBaseProposalRun faz tudo em passos pequenos (um ponto da grelha
 *    de cada vez nas bacias), para o hook useBaseProposal o correr em
 *    fatias sem prender o browser; o resultado não depende das fatias.
 *
 * Coordenadas [lon, lat] (WGS84), cotas absolutas em metros.
 */
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'
import { applyProposal, blockRing, proposalTargets } from './baseLayout.js'
import {
  DEFAULT_MAX_RELIEF_M,
  DEFAULT_ZONE_RADIUS_M,
  candidateCover,
  computeTakeoffZone,
  greedyBases,
  proposalSetup,
} from './takeoffZones.js'
import {
  DEFAULT_ANTENNA_HEIGHT_M,
  DEFAULT_EYE_HEIGHT_M,
  blockVisibility,
  blockVisibilityStepper,
} from './viewshed.js'
import { RADIO_CHECK, droneElevation, zoneEyePoints } from './viewshedPlan.js'

/** Fracção mínima do raio pedido que a zona de descolagem tem de manter (sítio plano). */
export const SITE_MIN_ZONE_FRAC = 0.5
/** Fracção mínima dos pontos de um bloco com o rádio livre para o bloco aceitar a base. */
export const SITE_RADIO_OK_FRAC = 0.95
/** Passo da grelha onde se procuram os altos do relevo (m). */
export const SITE_HIGHPOINT_GRID_M = 100
/** Altos do relevo guardados por bloco (os mais altos que o vêem inteiro). */
export const SITE_HIGHPOINTS_PER_BLOCK = 3
/** Nós da grelha dos altos, no máximo: acima disto o passo cresce. */
export const SITE_HIGHPOINT_MAX_NODES = 40000
/** Passo da grelha das bacias de visão grosseiras da proposta (m). */
export const SITE_VIEW_GRID_M = 60
/** Passo de leitura do relevo nos raios das bacias grosseiras (m). */
export const SITE_VIEW_STEP_M = 20
/** Olhos na zona de cada candidato: o ponto e SITE_EYE_DIRS pontos na beira da zona. */
export const SITE_EYE_DIRS = 8

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const isPoint = (p) => Array.isArray(p) && fin(p[0]) && fin(p[1])

/** Anel aberto (sem repetir o 1.º vértice no fim), só com pontos válidos. */
function openRing(ring) {
  const r = (ring ?? []).filter(isPoint)
  if (r.length < 2) return r
  const a = r[0]
  const b = r[r.length - 1]
  return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r
}

/**
 * @typedef {import('./takeoffZones.js').SiteInfo & {refElev: number, radiusM: number}} SiteInfoFull
 */

/**
 * O sítio de um candidato: cota no ponto, e a zona de descolagem (raio e
 * desnível do equipamento). Null sem relevo no ponto ou com a zona reduzida
 * abaixo de SITE_MIN_ZONE_FRAC do raio pedido (encosta, beira de corta).
 * @param {number[]} point
 * @param {{elevationAt: (lon: number, lat: number) => number|null, radiusM?: number,
 *   maxReliefM?: number}} opts
 * @returns {SiteInfoFull|null}
 */
export function siteInfo(
  point,
  { elevationAt, radiusM = DEFAULT_ZONE_RADIUS_M, maxReliefM = DEFAULT_MAX_RELIEF_M },
) {
  if (typeof elevationAt !== 'function' || !isPoint(point)) return null
  const z = computeTakeoffZone(point, { elevationAt, radiusM, maxReliefM })
  if ('error' in z) return null
  if (z.radiusM < SITE_MIN_ZONE_FRAC * z.requestedRadiusM - 1e-6) return null
  const elev = elevationAt(point[0], point[1])
  if (!fin(elev)) return null
  return { elev, refElev: z.refElev, reliefM: z.reliefM, radiusM: z.radiusM }
}

/**
 * Rádio e vista de um blockVisibility (com `fresnel`), para a proposta.
 * @param {any} res
 * @returns {import('./takeoffZones.js').SiteView|null}
 */
export function siteViewOf(res) {
  if (!res || res.error || !(res.total > 0)) return null
  const fail = fin(res.radioFail) ? res.radioFail : 0
  return {
    radio: (res.total - fail) / res.total,
    visible: fin(res.visibleFrac) ? res.visibleFrac : 0,
    n: res.total,
  }
}

/** A melhor de duas vistas: mais à vista, depois melhor rádio (a primeira no empate). */
export const betterView = (a, b) =>
  !b ||
  (a != null &&
    (a.visible > b.visible + 1e-9 ||
      (Math.abs(a.visible - b.visible) <= 1e-9 && a.radio > b.radio + 1e-9)))

/**
 * Pontos de onde o operador pode ver os blocos a partir de um candidato: o
 * ponto e a beira da sua zona (o raio efectivo de siteInfo). O operador anda
 * até à beira do patamar; num alto convexo é dali que se vê a encosta.
 * @param {number[]} point
 * @param {any} info siteInfo do candidato (o raio efectivo da zona)
 * @param {{obstacleM?: number}} [ctx]
 */
export function siteEyes(point, info, ctx) {
  // com vegetação somada ao relevo o olho fica no ponto (ver viewshedPlan.js)
  if (fin(ctx?.obstacleM) && ctx.obstacleM > 0) return [point]
  return zoneEyePoints(point, fin(info?.radiusM) ? info.radiusM : 0, {
    rings: 1,
    dirs: SITE_EYE_DIRS,
  })
}

/** O bloco aceita o sítio: rádio livre em pelo menos SITE_RADIO_OK_FRAC dos pontos. */
export const siteAccepts = (view) => Boolean(view) && view.radio >= SITE_RADIO_OK_FRAC - 1e-9

/**
 * @typedef {object} HighPointsStepper
 * @property {number} total  passos (linhas da grelha mais blocos)
 * @property {() => boolean} next um passo; true quando acabou
 * @property {() => number[][]} result os altos escolhidos [lon, lat], pela ordem da grelha
 * @property {number} gridM  passo da grelha usado (m)
 */

/**
 * Altos do relevo à volta dos blocos, em passos: primeiro a grelha, linha a
 * linha (nós alinhados a múltiplos de `gridM`, independentes da caixa), sobre
 * os blocos e `marginM` à volta (por omissão o VLOS); depois, bloco a bloco,
 * a escolha.
 *
 * Um nó com relevo entra se for um máximo local (nenhum dos 8 vizinhos com
 * relevo mais alto) ou um patamar plano (desnível dele e dos vizinhos ≤
 * `flatReliefM`). Por bloco, os `perBlock` mais altos (depois os mais planos)
 * que o vêem inteiro dentro do VLOS com a zona (plano local, pior vértice +
 * raio), a pelo menos 2 nós uns dos outros e, com `usable`, só sítios
 * utilizáveis (avaliado à medida, uma vez por nó: a crista íngreme de uma
 * cumeada é um máximo local, mas não tem onde descolar, e não pode tirar o
 * lugar a um alto plano mais baixo). A união vai, pela ordem da grelha, para
 * os candidatos da proposta.
 * @param {object} args
 * @param {number[][][]} args.rings anéis dos blocos [[lon, lat], ...]
 * @param {(lon: number, lat: number) => number|null} args.elevationAt
 * @param {number} args.vlosM
 * @param {number} [args.radiusM] raio da zona
 * @param {number} [args.marginM] margem à volta dos blocos (m), por omissão o VLOS
 * @param {number} [args.gridM]
 * @param {number} [args.perBlock]
 * @param {number} [args.flatReliefM] desnível de um patamar plano (m)
 * @param {number} [args.maxNodes]
 * @param {((point: number[]) => boolean)|null} [args.usable] o sítio serve (ex.: siteInfo)
 * @returns {HighPointsStepper}
 */
export function highPointsStepper({
  rings,
  elevationAt,
  vlosM,
  radiusM = DEFAULT_ZONE_RADIUS_M,
  marginM,
  gridM = SITE_HIGHPOINT_GRID_M,
  perBlock = SITE_HIGHPOINTS_PER_BLOCK,
  flatReliefM = DEFAULT_MAX_RELIEF_M,
  maxNodes = SITE_HIGHPOINT_MAX_NODES,
  usable = null,
}) {
  const ok = (rings ?? []).map(openRing).filter((r) => r.length >= 3)
  if (typeof elevationAt !== 'function' || ok.length === 0 || !(vlosM > 0))
    return { total: 0, gridM, next: () => true, result: () => [] }
  const all = ok.flat()
  const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length
  const mLon = metersPerDegLonSafe(lat0)
  const r = fin(radiusM) && radiusM > 0 ? radiusM : 0
  const margin = fin(marginM) && marginM >= 0 ? marginM : vlosM
  // blocos no plano local (absoluto: x = lon·mLon, y = lat·m/grau)
  const blocks = ok.map((ring) => {
    const v = ring.map((p) => [p[0] * mLon, p[1] * M_PER_DEG_LAT])
    const cx = v.reduce((s, p) => s + p[0], 0) / v.length
    const cy = v.reduce((s, p) => s + p[1], 0) / v.length
    return { v, cx, cy }
  })
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const b of blocks)
    for (const [x, y] of b.v) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  x0 -= margin
  y0 -= margin
  x1 += margin
  y1 += margin
  let g = fin(gridM) && gridM > 0 ? gridM : SITE_HIGHPOINT_GRID_M
  const cells = ((x1 - x0) * (y1 - y0)) / (g * g)
  if (cells > maxNodes) g = Math.ceil(Math.sqrt(((x1 - x0) * (y1 - y0)) / maxNodes) / 10) * 10
  const i0 = Math.floor(x0 / g)
  const j0 = Math.floor(y0 / g)
  const nx = Math.ceil(x1 / g) - i0 + 1
  const ny = Math.ceil(y1 / g) - j0 + 1
  const z = new Float64Array(nx * ny).fill(NaN)
  const keep = new Set()
  /** @type {Array<{k: number, x: number, y: number, z: number, relief: number}>|null} */
  let nodes = null
  let row = 0
  let bi = 0
  const total = ny + blocks.length

  // nós candidatos (máximos locais e patamares), do mais alto ao mais plano
  const classify = () => {
    const out = []
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const zc = z[j * nx + i]
        if (!Number.isFinite(zc)) continue
        let lo = zc
        let hi = zc
        let n = 0
        let isMax = true
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue
            const ii = i + di
            const jj = j + dj
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue
            const zn = z[jj * nx + ii]
            if (!Number.isFinite(zn)) continue
            n++
            if (zn > zc + 1e-9) isMax = false
            if (zn < lo) lo = zn
            if (zn > hi) hi = zn
          }
        if (n === 0) continue
        const relief = hi - lo
        if (isMax || relief <= flatReliefM + 1e-9)
          out.push({ k: j * nx + i, x: (i0 + i) * g, y: (j0 + j) * g, z: zc, relief })
      }
    out.sort((a, b) => b.z - a.z || a.relief - b.relief || a.k - b.k)
    return out
  }
  const toLonLat = (n) => [n.x / mLon, n.y / M_PER_DEG_LAT]
  // sítio utilizável, por nó (uma vez)
  const usableAt = new Map()
  const serves = (n) => {
    if (typeof usable !== 'function') return true
    if (!usableAt.has(n.k)) usableAt.set(n.k, Boolean(usable(toLonLat(n))))
    return usableAt.get(n.k)
  }
  const choose = (b) => {
    const chosen = []
    for (const n of nodes ?? []) {
      if (Math.hypot(n.x - b.cx, n.y - b.cy) + r > vlosM + 1) continue
      let far = 0
      for (const [x, y] of b.v) far = Math.max(far, Math.hypot(n.x - x, n.y - y))
      if (far + r > vlosM) continue
      if (chosen.some((c) => Math.hypot(c.x - n.x, c.y - n.y) < 2 * g - 1e-6)) continue
      if (!serves(n)) continue
      chosen.push(n)
      if (chosen.length >= perBlock) break
    }
    for (const c of chosen) keep.add(c.k)
  }
  return {
    total,
    gridM: g,
    next() {
      if (row < ny) {
        const lat = ((j0 + row) * g) / M_PER_DEG_LAT
        for (let i = 0; i < nx; i++) {
          const v = elevationAt(((i0 + i) * g) / mLon, lat)
          if (fin(v)) z[row * nx + i] = v
        }
        row++
        return false
      }
      if (!nodes) nodes = classify()
      if (bi < blocks.length) choose(blocks[bi++])
      return bi >= blocks.length
    },
    result() {
      return [...keep]
        .sort((a, b) => a - b)
        .map((k) => {
          const i = k % nx
          const j = (k - i) / nx
          return [((i0 + i) * g) / mLon, ((j0 + j) * g) / M_PER_DEG_LAT]
        })
    },
  }
}

/**
 * Os altos do relevo de uma vez (highPointsStepper até ao fim).
 * @param {Parameters<typeof highPointsStepper>[0]} args
 * @returns {number[][]}
 */
export function terrainHighPoints(args) {
  const s = highPointsStepper(args)
  while (!s.next());
  return s.result()
}

/**
 * @typedef {object} SiteContext
 *   O que decide o rádio e a vista de um candidato: relevo, alturas, voo.
 * @property {(lon: number, lat: number) => number|null} elevationAt
 * @property {number} altitudeM   altura do voo (relativa à base, ou AGL com seguir terreno)
 * @property {boolean} [terrainFollow]
 * @property {number} [radiusM]   raio da zona do equipamento
 * @property {number} [maxReliefM] desnível máximo da zona
 * @property {number} [eyeHeightM]
 * @property {number} [antennaHeightM]
 * @property {number} [obstacleM] vegetação e obstáculos somados ao relevo (já 0 com um MDS)
 * @property {number} [gridStepM] grelha das bacias grosseiras
 * @property {number} [stepM]     passo dos raios
 */

/**
 * Argumentos de blockVisibility(Stepper) para o bloco `ring` visto de
 * `point` (o candidato ou um ponto da sua zona).
 */
function viewArgs(point, info, ring, ctx) {
  return {
    eye: {
      point,
      heightM: fin(ctx.eyeHeightM) ? ctx.eyeHeightM : DEFAULT_EYE_HEIGHT_M,
      antennaHeightM: fin(ctx.antennaHeightM) ? ctx.antennaHeightM : DEFAULT_ANTENNA_HEIGHT_M,
    },
    blockRing: ring,
    droneElevAt: droneElevation(
      ctx.terrainFollow
        ? { mode: 'agl', agl: ctx.altitudeM }
        : { mode: 'flat', elev: info.refElev + ctx.altitudeM },
      ctx.elevationAt,
    ),
    elevationAt: ctx.elevationAt,
    gridStepM: fin(ctx.gridStepM) && ctx.gridStepM > 0 ? ctx.gridStepM : SITE_VIEW_GRID_M,
    stepM: fin(ctx.stepM) && ctx.stepM > 0 ? ctx.stepM : SITE_VIEW_STEP_M,
    fresnel: RADIO_CHECK,
    obstacleM: fin(ctx.obstacleM) && ctx.obstacleM > 0 ? ctx.obstacleM : 0,
  }
}

/**
 * A regra dos bons sítios para proposeBases, de uma vez (sem fatias): o
 * mesmo cálculo de createBaseProposalRun, para os testes e para quem não
 * precisa de largar o browser. `rings` dá o anel de cada bloco pelo id.
 * @param {SiteContext & {rings: Map<any, number[][]>}} ctx
 * @returns {import('./takeoffZones.js').SiteRule}
 */
export function goodSiteRule(ctx) {
  return {
    info: (point) =>
      siteInfo(point, {
        elevationAt: ctx.elevationAt,
        radiusM: ctx.radiusM,
        maxReliefM: ctx.maxReliefM,
      }),
    view: (point, blockId, info) => {
      const ring = ctx.rings.get(blockId)
      if (!ring) return null
      let best = null
      for (const eye of siteEyes(point, info, ctx)) {
        const v = siteViewOf(blockVisibility(viewArgs(eye, info, ring, ctx)))
        if (betterView(v, best)) best = v
      }
      return best
    },
    accepts: siteAccepts,
  }
}

/**
 * @typedef {object} BaseProposalRun
 * @property {(shouldYield: () => boolean) => boolean} step avança até `shouldYield()` dar true
 *   (testado a cada passo pequeno); devolve true quando acabou
 * @property {() => boolean} done
 * @property {() => number} progress 0..1, para o painel
 * @property {() => import('./baseLayout.js').ProposalOutcome|null} result null até acabar
 */

/**
 * «Propor bases» em passos pequenos. Fases: os blocos sem base que os veja
 * (proposalTargets); com relevo, os altos à volta deles (uma linha da grelha
 * ou um bloco por passo); os candidatos (proposalSetup) e o que cada um vê
 * dentro do VLOS (um candidato por passo); com relevo, o sítio de cada um
 * (uma zona por passo) e as bacias grosseiras de cada par candidato/bloco
 * (um ponto da grelha por passo); por fim a gulosa (greedyBases) e as bases
 * juntas às do operador (applyProposal). Sem relevo é a proposta de sempre.
 *
 * @param {object} args
 * @param {any[]|null} args.blocks blocos do plano (id, waypoints, cellRing?)
 * @param {any[]} [args.bases] as do operador (não se mexem)
 * @param {Record<string, any>} [args.zones] computeZones das bases do operador
 * @param {Record<string, string>} [args.manual] atribuições manuais
 * @param {number} args.vlosM
 * @param {number} [args.defaultRadiusM] raio da zona do equipamento
 * @param {number} [args.maxBlocksPerBase] 0 = sem limite
 * @param {number} [args.maxReliefM] desnível máximo da zona
 * @param {{elevationAt: (lon: number, lat: number) => number|null, obstacleM?: number}|null}
 *   [args.terrain] relevo (null: sem regra de sítio)
 * @param {number} [args.altitudeM]
 * @param {boolean} [args.terrainFollow]
 * @param {number} [args.eyeHeightM]
 * @param {number} [args.antennaHeightM]
 * @param {number} [args.gridStepM]
 * @param {number} [args.stepM]
 * @returns {BaseProposalRun}
 */
export function createBaseProposalRun({
  blocks,
  bases = [],
  zones = {},
  manual = {},
  vlosM,
  defaultRadiusM = DEFAULT_ZONE_RADIUS_M,
  maxBlocksPerBase = 0,
  maxReliefM = DEFAULT_MAX_RELIEF_M,
  terrain = null,
  altitudeM = 0,
  terrainFollow = false,
  eyeHeightM = DEFAULT_EYE_HEIGHT_M,
  antennaHeightM = DEFAULT_ANTENNA_HEIGHT_M,
  gridStepM = SITE_VIEW_GRID_M,
  stepM = SITE_VIEW_STEP_M,
}) {
  const elevationAt = typeof terrain?.elevationAt === 'function' ? terrain.elevationAt : null
  const useSite = Boolean(elevationAt) && fin(altitudeM)
  /** @type {SiteContext} */
  const ctx = {
    elevationAt,
    altitudeM,
    terrainFollow,
    radiusM: defaultRadiusM,
    maxReliefM,
    eyeHeightM,
    antennaHeightM,
    obstacleM: fin(terrain?.obstacleM) ? terrain.obstacleM : 0,
    gridStepM,
    stepM,
  }
  const same = { bases, blockBase: manual ?? {}, added: 0, outOfVlos: 0, poorSites: 0 }
  /** @type {'targets'|'high'|'setup'|'cover'|'zones'|'views'|'greedy'|'done'} */
  let phase = 'targets'
  /** @type {import('./baseLayout.js').ProposalOutcome|null} */
  let outcome = null
  let rings = []
  /** @type {HighPointsStepper|null} */
  let high = null
  /** @type {import('./takeoffZones.js').ProposalSetup|null} */
  let setup = null
  /** @type {Array<import('./takeoffZones.js').ProposalCandidate & {info: SiteInfoFull|null}>} */
  const cands = []
  let pi = 0
  let ci = 0
  let ei = 0
  /** @type {any} */
  let viewer = null
  // olho de agora (índice em c.eyes) e a melhor vista do par até aqui
  let eyeIdx = 0
  /** @type {any} */
  let eyeBest = null
  let pairs = 0
  let pairsDone = 0

  const finish = (res) => {
    outcome = res
    phase = 'done'
  }
  // um passo pequeno da fase em curso
  const work = () => {
    switch (phase) {
      case 'targets': {
        const targets = proposalTargets({ blocks, bases, zones, manual, vlosM, defaultRadiusM })
        if (targets.length === 0) return finish(same)
        rings = targets.map((b) => ({ id: b.id, ring: blockRing(b) }))
        if (useSite) {
          high = highPointsStepper({
            rings: rings.map((r) => r.ring),
            elevationAt,
            vlosM,
            radiusM: defaultRadiusM,
            flatReliefM: maxReliefM,
            usable: (p) =>
              siteInfo(p, { elevationAt, radiusM: defaultRadiusM, maxReliefM }) !== null,
          })
          phase = 'high'
        } else phase = 'setup'
        return
      }
      case 'high':
        if (high?.next()) phase = 'setup'
        return
      case 'setup':
        setup = proposalSetup(rings, {
          vlosM,
          radiusM: defaultRadiusM,
          maxBlocksPerBase: maxBlocksPerBase > 0 ? maxBlocksPerBase : Infinity,
          extraPoints: high ? high.result() : [],
        })
        if (!setup) return finish(same)
        phase = 'cover'
        return
      case 'cover': {
        if (!setup) return finish(same)
        if (pi < setup.points.length) {
          const point = setup.points[pi++]
          const all = candidateCover(setup, point)
          // candidatos que não cobrem nada não entram na gulosa
          if (all.length > 0) cands.push({ point, all, info: null })
        }
        if (pi >= setup.points.length) phase = useSite && cands.length > 0 ? 'zones' : 'greedy'
        return
      }
      case 'zones': {
        const c = cands[ci++]
        c.info = siteInfo(c.point, { elevationAt, radiusM: defaultRadiusM, maxReliefM })
        for (const e of c.all) {
          e.view = null
          e.ok = false
        }
        if (c.info) pairs += c.all.length
        if (ci >= cands.length) {
          ci = 0
          ei = 0
          phase = 'views'
        }
        return
      }
      case 'views': {
        while (ci < cands.length && (!cands[ci].info || ei >= cands[ci].all.length)) {
          ci++
          ei = 0
        }
        if (ci >= cands.length || !setup) {
          phase = 'greedy'
          return
        }
        const c = cands[ci]
        const e = c.all[ei]
        // o olho percorre o ponto e a beira da zona; fica a melhor vista
        if (!c.eyes) c.eyes = siteEyes(c.point, c.info, ctx)
        if (!viewer) {
          viewer = blockVisibilityStepper(
            viewArgs(c.eyes[eyeIdx], c.info, setup.prepared[e.bi].ring, ctx),
          )
          if ('error' in viewer) viewer = null
        }
        if (!viewer || viewer.next()) {
          const v = viewer ? siteViewOf(viewer.result()) : null
          if (betterView(v, eyeBest)) eyeBest = v
          viewer = null
          eyeIdx++
          if (eyeIdx >= c.eyes.length) {
            e.view = eyeBest
            e.ok = siteAccepts(e.view)
            eyeBest = null
            eyeIdx = 0
            ei++
            pairsDone++
          }
        }
        return
      }
      case 'greedy':
        if (!setup) return finish(same)
        return finish(
          applyProposal({
            bases,
            manual,
            proposal: greedyBases(setup, cands, { withSite: useSite }),
          }),
        )
      default:
        return
    }
  }
  const isDone = () => phase === 'done'
  return {
    done: isDone,
    step(shouldYield) {
      while (!isDone()) {
        work()
        if (!isDone() && shouldYield()) return false
      }
      return true
    },
    progress() {
      switch (phase) {
        case 'done':
          return 1
        case 'greedy':
          return 0.98
        case 'views':
          return 0.1 + 0.88 * (pairs > 0 ? pairsDone / pairs : 1)
        case 'zones':
          return 0.05 + (0.05 * ci) / Math.max(1, cands.length)
        default:
          return 0.02
      }
    },
    result: () => outcome,
  }
}
