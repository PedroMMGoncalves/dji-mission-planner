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
 * centróides dos blocos, sem duplicados a menos de ~1 m (vértices e arestas
 * partilhados por blocos vizinhos aparecem uma só vez).
 */
function candidatePoints(prepared) {
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
 * @typedef {object} SiteRule
 *   Preferência pelo sítio de uma base, de fora do módulo (ex.: a cota de
 *   referência da zona contra o relevo dos blocos, baseLayout.js), para a
 *   proposta não ficar presa ao relevo.
 * @property {(point: number[]) => number|null} score custo do sítio (menor
 *   é melhor); null = sítio inutilizável (ex.: fora do relevo)
 * @property {(blockId: any, score: number) => boolean} accepts o sítio com
 *   este custo serve o bloco
 */

/**
 * Proposta de bases: cobertura gulosa dos blocos por pontos candidatos.
 *
 * Candidatos = vértices, pontos médios das arestas e centróides dos blocos.
 * Um candidato cobre um bloco quando blockWorstVlosM({point, radiusM}, ring)
 * ≤ vlosM. Em cada passo escolhe-se o candidato que cobre mais blocos ainda
 * por cobrir (no máximo `maxBlocksPerBase`, os mais próximos). Desempates,
 * por esta ordem:
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
 * Com `site` (SiteRule), um candidato só cobre um bloco se, além do VLOS, o
 * sítio o servir (`accepts(bloco, score)`; o custo de cada candidato é
 * calculado uma vez, e só para os que vêem algum bloco). A gulosa corre
 * sobre essa cobertura, e entre candidatos que serviriam os MESMOS blocos
 * fica o de menor custo (antes do desempate pela distância). Os blocos que
 * nenhum sítio aceitável cobre recebem, numa segunda volta, o candidato de
 * MENOR custo que os vê (depois mais blocos, depois mais perto), com
 * `siteOk: false`: propõe-se o melhor que há e o preflight fala. Sem `site`
 * o resultado é o de sempre.
 *
 * @param {Array<{id: any, ring: number[][]}>} blocks
 * @param {{vlosM: number, radiusM?: number, maxBlocksPerBase?: number, site?: SiteRule|null}} opts
 * @returns {Array<{id: string, point: number[], blockIds: any[], outOfVlos: boolean,
 *   siteOk: boolean, score: number|null}>}
 */
export function proposeBases(
  blocks,
  { vlosM, radiusM = DEFAULT_ZONE_RADIUS_M, maxBlocksPerBase = Infinity, site = null },
) {
  const valid = (blocks ?? []).filter((b) => Array.isArray(b?.ring) && b.ring.length >= 3)
  if (valid.length === 0 || !(vlosM > 0)) return []
  const r = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0
  const cap = maxBlocksPerBase >= 1 ? Math.floor(maxBlocksPerBase) : Infinity
  const prepared = prepareBlocks(valid)
  const nB = prepared.length

  // matriz de cobertura esparsa: para cada candidato, os blocos que vê
  // (com a distância ao centróide, para o desempate e o limite por base)
  const candidates = []
  for (const p of candidatePoints(prepared)) {
    const cov = []
    for (let bi = 0; bi < nB; bi++)
      if (covers(p, prepared[bi], r, vlosM))
        cov.push({ bi, d: distanceM(p, prepared[bi].centroid) })
    // candidatos que não cobrem nada não entram na gulosa
    if (cov.length > 0) {
      cov.sort((a, b) => a.d - b.d)
      candidates.push({ point: p, cov, all: cov, score: null })
    }
  }
  // com `site`: custo de cada candidato (uma vez) e só os blocos que aceitam o sítio
  const rule = site && typeof site.score === 'function' ? site : null
  if (rule) {
    for (const c of candidates) {
      const s = rule.score(c.point)
      c.score = Number.isFinite(s) ? s : null
      c.cov =
        c.score === null
          ? []
          : c.all.filter(({ bi }) => rule.accepts?.(prepared[bi].id, c.score) !== false)
    }
  }
  const costOf = (c) => (c.score === null ? Infinity : c.score)
  const visible = new Array(nB).fill(false)
  for (const c of candidates) for (const { bi } of c.all) visible[bi] = true
  const coverable = new Array(nB).fill(false)
  for (const c of candidates) for (const { bi } of c.cov) coverable[bi] = true

  const covered = new Array(nB).fill(false)
  let remaining = coverable.filter(Boolean).length
  const bases = []
  // os mesmos blocos, em qualquer ordem
  const samePick = (a, b) => {
    if (a.length !== b.length) return false
    const sb = new Set(b)
    return a.every((x) => sb.has(x))
  }
  while (remaining > 0) {
    // ganho de cada candidato e quantos candidatos partilháveis vêem cada bloco
    const gain = candidates.map((c) => {
      let n = 0
      for (const { bi } of c.cov) if (!covered[bi]) n++
      return Math.min(n, cap)
    })
    const options = new Array(nB).fill(0)
    candidates.forEach((c, ci) => {
      if (gain[ci] < 2) return
      for (const { bi } of c.cov) if (!covered[bi]) options[bi]++
    })
    let best = -1
    let bestGain = 0
    let bestOpt = Infinity
    let bestSum = Infinity
    let bestPick = null
    for (let ci = 0; ci < candidates.length; ci++) {
      if (gain[ci] === 0 || gain[ci] < bestGain) continue
      const pick = []
      let opt = 0
      let sum = 0
      for (const e of candidates[ci].cov) {
        if (covered[e.bi]) continue
        pick.push(e.bi)
        opt += options[e.bi]
        sum += e.d
        if (pick.length >= cap) break
      }
      let better = gain[ci] > bestGain || opt < bestOpt
      if (!better && opt === bestOpt) {
        // os mesmos blocos: o sítio de menor custo; senão o mais perto
        const a = costOf(candidates[ci])
        const b = best >= 0 ? costOf(candidates[best]) : Infinity
        better =
          rule && best >= 0 && samePick(pick, bestPick) && Math.abs(a - b) > 0.01
            ? a < b
            : sum < bestSum - 1
      }
      if (better) {
        best = ci
        bestGain = gain[ci]
        bestOpt = opt
        bestSum = sum
        bestPick = pick
      }
    }
    if (best < 0) break // não acontece: remaining > 0 implica um candidato com ganho
    for (const bi of bestPick) covered[bi] = true
    remaining -= bestPick.length
    bases.push({
      id: baseLabel(bases.length),
      point: candidates[best].point.slice(),
      blockIds: bestPick.map((bi) => prepared[bi].id),
      outOfVlos: false,
      siteOk: true,
      score: candidates[best].score,
    })
  }
  // blocos que se vêem, mas de nenhum sítio aceitável: o de menor custo
  let left = 0
  for (let bi = 0; bi < nB; bi++) if (visible[bi] && !coverable[bi]) left++
  while (left > 0) {
    let best = -1
    let bestCost = Infinity
    let bestPick = null
    let bestSum = Infinity
    for (let ci = 0; ci < candidates.length; ci++) {
      const pick = []
      let sum = 0
      for (const e of candidates[ci].all) {
        if (coverable[e.bi] || covered[e.bi]) continue
        pick.push(e.bi)
        sum += e.d
        if (pick.length >= cap) break
      }
      if (pick.length === 0) continue
      const cost = costOf(candidates[ci])
      const better =
        best < 0 ||
        cost < bestCost - 0.01 ||
        (Math.abs(cost - bestCost) <= 0.01 &&
          (pick.length > bestPick.length || (pick.length === bestPick.length && sum < bestSum - 1)))
      if (better) {
        best = ci
        bestCost = cost
        bestPick = pick
        bestSum = sum
      }
    }
    if (best < 0) break
    for (const bi of bestPick) covered[bi] = true
    left -= bestPick.length
    bases.push({
      id: baseLabel(bases.length),
      point: candidates[best].point.slice(),
      blockIds: bestPick.map((bi) => prepared[bi].id),
      outOfVlos: false,
      siteOk: false,
      score: candidates[best].score,
    })
  }
  // blocos que nenhum candidato vê inteiros: base própria, assinalada
  for (let bi = 0; bi < nB; bi++) {
    if (visible[bi]) continue
    bases.push({
      id: baseLabel(bases.length),
      point: prepared[bi].centroid.slice(),
      blockIds: [prepared[bi].id],
      outOfVlos: true,
      siteOk: true, // sítio não avaliado: o bloco já vai assinalado
      score: null,
    })
  }
  return bases
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
