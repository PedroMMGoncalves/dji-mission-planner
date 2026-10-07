/**
 * Blocos e bases: que base serve cada bloco, a cota de referência das
 * alturas de cada bloco, o trânsito no pior caso, a numeração dos voos e a
 * proposta de bases. Lógica pura que liga src/mission/takeoffZones.js aos
 * blocos do plano de área; o App e os hooks só lhe passam estado.
 *
 *  - Cada bloco tem uma base: a escolhida à mão (`blockBase`), senão a de
 *    menor alcance visual no pior caso (assignBlocksToBases).
 *  - As alturas do bloco referem-se à cota MÍNIMA da zona da sua base
 *    (computeTakeoffZone): descolando em qualquer ponto da zona voa-se entre
 *    0 e +ganho metros acima do planeado, nunca abaixo. Uma base fora do
 *    relevo carregado cai na mínima do relevo debaixo do próprio bloco, e o
 *    preflight bloqueia.
 *  - Trânsito: ida da zona ao primeiro waypoint e volta do último, cada
 *    perna do pior ponto da zona (blockWorstTransitM).
 *  - Voos numerados base a base (rótulos por ordem), dentro de cada base
 *    pela ordem do mosaico (ids dos blocos, em serpentina): A-1, A-2, B-3.
 *    Os ids numéricos dos blocos não mudam (são os das exportações).
 */
import { squareSideForBattery, stopCostS, turnCostS } from '../utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'
import { terrainRangeAlong } from './clearance.js'
import { addBase, baseColor, sortedBases } from './bases.js'
import {
  DEFAULT_ZONE_RADIUS_M,
  assignBlocksToBases,
  blockWorstTransitM,
  computeTakeoffZone,
  proposeBases,
} from './takeoffZones.js'

/**
 * Factor do trânsito de dimensionamento do quadrado: com a base num canto
 * do bloco, a soma das distâncias ao primeiro e ao último waypoint da
 * serpentina é no máximo (1 + √2)·L (um canto adjacente e o oposto).
 */
export const CORNER_TRANSIT_FACTOR = 1 + Math.SQRT2

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])

/**
 * Invólucro convexo (cadeia monótona) de pontos [lon, lat], num plano local
 * em metros; devolve o anel aberto em [lon, lat], sem pontos colineares.
 */
export function convexHull(points) {
  const pts = (points ?? []).filter(isPoint)
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]])
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const mLon = metersPerDegLonSafe(lat0)
  const loc = pts.map((p) => ({ x: p[0] * mLon, y: p[1] * M_PER_DEG_LAT, p }))
  loc.sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list) => {
    const h = []
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 1e-6) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  const hull = [...half(loc), ...half([...loc].reverse())]
  return hull.map((q) => [q.p[0], q.p[1]])
}

/**
 * Anel de um bloco para o alcance visual e a proposta de bases: o invólucro
 * da célula (quando o bloco vem de uma) e dos waypoints — é a rota que se
 * voa, com o buffer e os prolongamentos das faixas.
 */
export function blockRing(block) {
  const pts = [...(block?.cellRing ?? []), ...(block?.waypoints ?? [])]
  return convexHull(pts)
}

/**
 * Zonas de descolagem das bases, por id (computeTakeoffZone): raio pedido
 * da base ou o do equipamento, desnível máximo do equipamento. Sem relevo
 * devolve {}; uma base fora do relevo fica com `{ error: 'no-terrain' }`.
 * @param {Array<{id: string, point: number[], radiusM?: number|null}>} bases
 * @param {{elevationAt?: ((lon: number, lat: number) => number|null)|null,
 *   radiusM?: number, maxReliefM?: number}} opts
 * @returns {Record<string, any>}
 */
export function computeZones(bases, { elevationAt, radiusM = DEFAULT_ZONE_RADIUS_M, maxReliefM }) {
  /** @type {Record<string, any>} */
  const out = {}
  if (typeof elevationAt !== 'function') return out
  for (const b of bases ?? []) {
    out[b.id] = computeTakeoffZone(b.point, {
      elevationAt,
      radiusM: Number.isFinite(b.radiusM) ? b.radiusM : radiusM,
      maxReliefM,
    })
  }
  return out
}

/**
 * @typedef {object} BlockBaseInfo
 * @property {number} id
 * @property {string|null} baseId
 * @property {string|null} baseLabel
 * @property {number} baseIndex   posição da base na ordem dos rótulos (-1 sem base)
 * @property {string|null} color
 * @property {boolean} manual
 * @property {number|null} worstVlosM
 * @property {boolean} withinVlos
 * @property {number|null} transitM  ida e volta, do pior ponto da zona
 * @property {number} transitS
 * @property {number|null} refElev   cota de referência das alturas do bloco
 * @property {'zone'|'block-min'|null} refSource
 * @property {boolean} baseNoTerrain a base está fora do relevo carregado
 * @property {number} flight         número do voo (1..n), base a base
 * @property {string} flightLabel    "A-1" (ou "1" sem bases)
 */

/**
 * Bases, blocos e voos.
 * @param {object} args
 * @param {any[]|null} args.blocks blocos do plano (id, waypoints, cellRing?)
 * @param {Array<{id: string, label: string, point: number[], radiusM?: number|null}>} [args.bases]
 * @param {Record<string, any>} [args.zones] computeZones
 * @param {Record<string, string>} [args.manual] atribuições manuais (id do bloco → id da base)
 * @param {number} args.vlosM
 * @param {number} [args.defaultRadiusM] raio da zona do equipamento
 * @param {number} [args.speed] m/s, para o tempo de trânsito
 * @param {((lon: number, lat: number) => number|null)|null} [args.elevationAt]
 * @returns {{byBlock: Record<string, BlockBaseInfo>, bases: any[], order: number[],
 *   hasBases: boolean}|null}
 */
export function layoutBlocks({
  blocks,
  bases = [],
  zones = {},
  manual = {},
  vlosM,
  defaultRadiusM = DEFAULT_ZONE_RADIUS_M,
  speed = 10,
  elevationAt = null,
}) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  const order = sortedBases(bases)
  const v = speed > 0 ? speed : 10
  // raio usado nas distâncias no pior caso: o efectivo da zona (reduzido
  // junto a uma corta), senão o pedido
  const radiusOf = (b) => {
    const z = zones?.[b.id]
    if (z && !z.error) return z.radiusM
    return Number.isFinite(b.radiusM) ? b.radiusM : defaultRadiusM
  }
  const rings = new Map(blocks.map((b) => [b.id, blockRing(b)]))
  const assign = order.length
    ? assignBlocksToBases(
        blocks.map((b) => ({ id: b.id, ring: rings.get(b.id) })),
        order.map((b) => ({ id: b.id, point: b.point, radiusM: radiusOf(b) })),
        { vlosM, radiusM: defaultRadiusM, manual },
      )
    : {}

  /** @type {Record<string, BlockBaseInfo>} */
  const byBlock = {}
  for (const b of blocks) {
    const a = assign[b.id]
    const bi = a ? order.findIndex((x) => x.id === a.baseId) : -1
    const base = bi >= 0 ? order[bi] : null
    const info = {
      id: b.id,
      baseId: base?.id ?? null,
      baseLabel: base?.label ?? null,
      baseIndex: bi,
      color: base ? baseColor(bi) : null,
      manual: Boolean(a?.manual),
      worstVlosM: a ? a.worstVlosM : null,
      withinVlos: a ? a.withinVlos : true,
      transitM: null,
      transitS: 0,
      refElev: null,
      refSource: null,
      baseNoTerrain: false,
      flight: 0,
      flightLabel: '',
    }
    if (base) {
      const wps = b.waypoints ?? []
      if (wps.length > 0) {
        info.transitM = blockWorstTransitM(
          { point: base.point, radiusM: radiusOf(base) },
          wps[0],
          wps[wps.length - 1],
        )
        info.transitS = info.transitM / v
      }
      const z = zones?.[base.id]
      if (z && !z.error) {
        info.refElev = z.refElev
        info.refSource = 'zone'
      } else if (z?.error && typeof elevationAt === 'function') {
        // base fora do relevo: a mínima debaixo do próprio bloco (o lado
        // seguro para o bloco), e o preflight bloqueia
        info.baseNoTerrain = true
        const r = terrainRangeAlong(wps, { elevationAt })
        if (r) {
          info.refElev = r.minM
          info.refSource = 'block-min'
        }
      }
    }
    byBlock[b.id] = info
  }

  // numeração: base a base pela ordem dos rótulos, dentro de cada uma pela
  // ordem do mosaico (ids); os sem base (não acontece com bases) no fim
  const ids = blocks.map((b) => b.id).sort((x, y) => x - y)
  const flightOrder = []
  let n = 0
  const summaries = order.map((base, i) => {
    const mine = ids.filter((id) => byBlock[id].baseId === base.id)
    for (const id of mine) {
      n += 1
      byBlock[id].flight = n
      byBlock[id].flightLabel = `${base.label}-${n}`
      flightOrder.push(id)
    }
    const z = zones?.[base.id] ?? null
    return {
      id: base.id,
      label: base.label,
      index: i,
      color: baseColor(i),
      point: base.point,
      zone: z && !z.error ? z : null,
      noTerrain: Boolean(z?.error),
      requestedRadiusM: Number.isFinite(base.radiusM) ? base.radiusM : defaultRadiusM,
      radiusM: radiusOf(base),
      blockIds: mine,
      flights: mine.map((id) => byBlock[id].flightLabel),
    }
  })
  for (const id of ids) {
    if (byBlock[id].baseId != null) continue
    n += 1
    byBlock[id].flight = n
    byBlock[id].flightLabel = order.length ? `?-${n}` : String(n)
    flightOrder.push(id)
  }
  return { byBlock, bases: summaries, order: flightOrder, hasBases: order.length > 0 }
}

/**
 * Lista das bases para o painel e o mapa, pela ordem dos rótulos: zona
 * (raio efectivo e pedido, reduzida e porquê, cota de referência, ganho
 * máximo "voo entre 0 e +ganho m acima do planeado") e os voos de cada uma
 * (de layoutBlocks, quando há blocos).
 */
export function summarizeBases({
  bases,
  zones = {},
  layout = null,
  defaultRadiusM = DEFAULT_ZONE_RADIUS_M,
}) {
  return sortedBases(bases).map((b, i) => {
    const z = zones?.[b.id]
    const ok = z && !z.error ? z : null
    const fromLayout = layout?.bases?.find((x) => x.id === b.id)
    const requested = Number.isFinite(b.radiusM) ? b.radiusM : defaultRadiusM
    return {
      id: b.id,
      label: b.label,
      index: i,
      color: baseColor(i),
      point: b.point,
      customRadius: Number.isFinite(b.radiusM),
      requestedRadiusM: requested,
      radiusM: ok ? ok.radiusM : requested,
      reduced: Boolean(ok?.reduced),
      cause: ok?.cause ?? null,
      refElev: ok ? ok.refElev : null,
      gainM: ok ? ok.gainM : null,
      noTerrain: Boolean(z?.error),
      blockIds: fromLayout?.blockIds ?? [],
      flights: fromLayout?.flights ?? [],
    }
  })
}

/**
 * Cotas de referência por bloco (pela ordem de `blocks`) e a comum, para o
 * seguimento de terreno, o 3D, o perfil e a folga ao solo. Sem bases, ou
 * sem relevo, devolve null (fica a referência única de sempre).
 * @returns {{refs: (number|null)[], common: number}|null}
 */
export function blockReferences(blocks, layout) {
  if (!layout?.hasBases || !Array.isArray(blocks) || blocks.length === 0) return null
  const refs = blocks.map((b) => {
    const r = layout.byBlock[b.id]?.refElev
    return Number.isFinite(r) ? r : null
  })
  const finite = refs.filter((r) => r !== null)
  if (finite.length === 0) return null
  return { refs, common: Math.min(...finite) }
}

/**
 * Rota de visualização e verificação dos blocos com cotas de referência
 * próprias: os waypoints de todos os blocos com a altura exprimida na cota
 * comum (`h + refBloco − comum`, a mesma altitude absoluta), e `breaks`, os
 * índices onde começa um bloco — o troço que lá chega não se voa (cada bloco
 * descola da sua base), e a folga, a subida e os segmentos não o contam.
 * @param {any[]} blocks blocos (ou blocks3 do seguimento de terreno)
 * @param {{refs: (number|null)[], common: number}} refs blockReferences
 * @param {number} altitude altura dos waypoints sem altura própria
 */
export function blocksViewRoute(blocks, refs, altitude) {
  const waypoints = []
  const breaks = []
  blocks.forEach((b, i) => {
    const r = refs.refs[i]
    const dh = Number.isFinite(r) ? r - refs.common : 0
    if (waypoints.length > 0) breaks.push(waypoints.length)
    for (const w of b.waypoints ?? []) {
      const h = Number.isFinite(w[2]) ? w[2] : altitude
      waypoints.push([w[0], w[1], h + dh])
    }
  })
  return { waypoints, breaks }
}

/**
 * Proposta de bases para os blocos que ainda não têm uma base que os veja
 * inteiros (as bases do operador não se mexem, e um bloco atribuído à mão
 * fica com a sua). As bases novas recebem os primeiros rótulos livres pela
 * ordem do mosaico (a do primeiro bloco que servem), e os seus blocos ficam
 * atribuídos a elas — o limite de voos por base vale assim também depois.
 * @returns {{bases: any[], blockBase: Record<string, string>, added: number,
 *   outOfVlos: number}}
 */
export function proposeMoreBases({
  blocks,
  bases = [],
  zones = {},
  manual = {},
  vlosM,
  defaultRadiusM = DEFAULT_ZONE_RADIUS_M,
  maxBlocksPerBase = 0,
}) {
  const same = { bases, blockBase: manual ?? {}, added: 0, outOfVlos: 0 }
  if (!Array.isArray(blocks) || blocks.length === 0 || !(vlosM > 0)) return same
  const current = layoutBlocks({ blocks, bases, zones, manual, vlosM, defaultRadiusM })
  const uncovered = blocks.filter((b) => {
    const e = current?.byBlock[b.id]
    return !(e?.baseId && (e.manual || e.withinVlos))
  })
  if (uncovered.length === 0) return same
  const proposal = proposeBases(
    uncovered.map((b) => ({ id: b.id, ring: blockRing(b) })),
    {
      vlosM,
      radiusM: defaultRadiusM,
      maxBlocksPerBase: maxBlocksPerBase > 0 ? maxBlocksPerBase : Infinity,
    },
  )
  proposal.sort((a, b) => Math.min(...a.blockIds) - Math.min(...b.blockIds))
  let next = bases ?? []
  const map = { ...(manual ?? {}) }
  for (const p of proposal) {
    const res = addBase(next, p.point)
    if (!res.base) continue
    next = res.bases
    for (const id of p.blockIds) map[String(id)] = res.base.id
  }
  return {
    bases: next,
    blockBase: map,
    added: proposal.length,
    outOfVlos: proposal.filter((p) => p.outOfVlos).length,
  }
}

/**
 * Lado do quadrado por bateria com bases por bloco. O lado não pode depender
 * de onde estão as bases (mover uma base refazia o mosaico e perdia as
 * células desactivadas e as atribuições): dimensiona-se para uma base num
 * CANTO do bloco, com a zona: trânsito (2·raio + (1+√2)·L)/v, a soma das
 * distâncias do pior canto ao primeiro e ao último waypoint. Uma base no
 * bordo ou dentro do bloco cabe sempre; as mais longe vão ao preflight, bloco
 * a bloco, com o trânsito real (blockWorstTransitM).
 *
 * É o maior L, à dezena, com L ≤ squareSideForBattery(trânsito(L)).
 * @param {Parameters<typeof squareSideForBattery>[0]} opts os de squareSideForBattery, sem transitS
 * @param {{zoneRadiusM?: number}} [zone]
 * @returns {{side: number, transitS: number}}
 */
export function squareSideWithBaseTransit(opts, { zoneRadiusM = DEFAULT_ZONE_RADIUS_M } = {}) {
  const v = opts.speed > 0 ? opts.speed : 10
  const r = Number.isFinite(zoneRadiusM) && zoneRadiusM > 0 ? zoneRadiusM : 0
  const allowance = (L) => (2 * r + CORNER_TRANSIT_FACTOR * L) / v
  let L = squareSideForBattery({ ...opts, transitS: 0 })
  while (L > 50 && squareSideForBattery({ ...opts, transitS: allowance(L) }) < L) L -= 10
  return { side: L, transitS: allowance(L) }
}

/**
 * Teste "cabe numa bateria" para as tiras que o mosaico funde num vizinho
 * (buildSquareMosaic, `fits`): o mesmo modelo de squareSideForBattery, para
 * uma célula de área A e extensão W (a maior das duas, ao longo e através
 * das faixas): passagens·(A·a + W·b + viragem) + trânsito(W) ≤ útil.
 * @returns {(ring: number[][], areaM2: number) => boolean}
 */
export function cellFitsBattery({
  usableS,
  spacingM,
  speed,
  passes = 1,
  stopEveryM = 0,
  lineAngleDeg = 0,
  zoneRadiusM = DEFAULT_ZONE_RADIUS_M,
}) {
  const v = speed > 0 ? speed : 10
  const s = Math.max(1, spacingM)
  const turnS = turnCostS(v)
  const a = 1 / (s * v) + (stopEveryM > 0 ? stopCostS(1, v) / (s * stopEveryM) : 0)
  const b = 2 / v + turnS / s
  const th = (lineAngleDeg * Math.PI) / 180
  const r = Number.isFinite(zoneRadiusM) && zoneRadiusM > 0 ? zoneRadiusM : 0
  const k = Math.max(1, passes)
  return (ring, areaM2) => {
    if (!(usableS > 0)) return true
    if (!Array.isArray(ring) || ring.length < 3) return false
    const lat0 = ring[0][1]
    const mLon = metersPerDegLonSafe(lat0)
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const p of ring) {
      const x = p[0] * mLon
      const y = p[1] * M_PER_DEG_LAT
      // u ao longo das faixas (azimute th), w através delas
      const u = x * Math.sin(th) + y * Math.cos(th)
      const w = x * Math.cos(th) - y * Math.sin(th)
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, w)
      maxV = Math.max(maxV, w)
    }
    const W = Math.max(maxU - minU, maxV - minV)
    const flight = k * (areaM2 * a + W * b + turnS)
    const transit = (2 * r + CORNER_TRANSIT_FACTOR * W) / v
    return flight + transit <= usableS
  }
}

/**
 * Chave da disposição dos blocos: muda quando o mosaico, a grelha ou o corte
 * mudam (as atribuições manuais deixam de valer), e não muda ao desactivar
 * uma célula nem ao mover uma base.
 * @param {{tiles?: number[][][]|null, gridCells?: number[][][]|null, blocks?: any[]|null}} src
 */
export function blockLayoutKey({ tiles = null, gridCells = null, blocks = null }) {
  const pt = (p) => (isPoint(p) ? `${p[0].toFixed(5)},${p[1].toFixed(5)}` : '-')
  if (Array.isArray(tiles) && tiles.length)
    return `t${tiles.length}:${tiles.map((r) => pt(r[0])).join(';')}`
  if (Array.isArray(gridCells) && gridCells.length)
    return `g${gridCells.length}:${gridCells.map((r) => pt(r[0])).join(';')}`
  if (Array.isArray(blocks) && blocks.length)
    return `s${blocks.length}:${blocks.map((b) => pt(b.lines?.[0]?.[0])).join(';')}`
  return ''
}
