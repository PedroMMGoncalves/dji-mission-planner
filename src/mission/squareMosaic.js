/**
 * MOSAICO DE QUADRADOS OPTIMIZADO: divide uma área grande (5–10 km²) em
 * blocos quadrados de lado `sideM`, um jogo de baterias cada, para o
 * operador voar e gerir no terreno mudando de base entre blocos.
 *
 * Substitui a malha de tilePolygonWithSquares (geo.js) em três pontos:
 *  1. As células são RECORTADAS pelo polígono (e pelos buracos) e a grelha
 *     não fica presa à bounding box: experimenta-se uma grelha de
 *     deslocamentos e fica a que dá menos células e menos tiras (células
 *     com fracção de enchimento < minFillFrac — voos de poucos segundos).
 *  2. A orientação dos quadrados sai da direcção das faixas
 *     (mosaicOrientationForLines): arestas paralelas às linhas de voo.
 *  3. As tiras que restam são fundidas (turf.union) na célula vizinha com
 *     que partilham mais fronteira, desde que o resultado caiba numa
 *     bateria (`fits`) e seja um polígono único.
 *
 * Um quadrado que corta o polígono em vários pedaços disjuntos (contorno
 * côncavo, buracos) dá uma célula por pedaço. Um buraco que fica inteiro
 * dentro de uma célula volta como anel interior dessa célula (`holes`).
 *
 * O lado NÃO é dimensionado aqui: vem de squareSideForBattery.
 *
 * Referencial: plano local em metros com as constantes de units.js (as
 * mesmas de tilePolygonWithSquares), rodado de modo a que as arestas dos
 * quadrados fiquem alinhadas aos eixos. A projecção é afim, pelo que o
 * recorte é exacto também em lon/lat: as células particionam o polígono.
 */
import * as turf from '@turf/turf'
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'

/**
 * @typedef {Object} MosaicCell
 * @property {number} id            1..n em ordem serpenteante
 * @property {number[][]} ring      anel exterior aberto, [[lon, lat], ...]
 * @property {number[][][]} holes   anéis interiores abertos (buracos inteiros dentro da célula)
 * @property {number[][]} square    os 4 cantos do quadrado da grelha que deu origem à célula
 * @property {number} row           linha da grelha (0 = a mais baixa no referencial rodado)
 * @property {number} col           coluna da grelha
 * @property {number} areaM2        área no referencial local (lado² para um quadrado cheio)
 * @property {number} fillFrac      areaM2 / lado² (> 1 numa célula que absorveu tiras)
 * @property {{row: number, col: number, areaM2: number}[]} mergedFrom  tiras absorvidas
 */

/**
 * @typedef {Object} MosaicResult
 * @property {MosaicCell[]} [cells]
 * @property {number} [sideM]
 * @property {number} [orientationDeg]
 * @property {number[]} [offset]    [dxM, dyM]: recuo da origem da grelha face ao canto mínimo da bbox rodada
 * @property {number} [slivers]     células que ficaram com fillFrac < minFillFrac
 * @property {number} [trials]      deslocamentos avaliados
 * @property {string} [error]       'invalid' | 'too-many-cells'
 * @property {number} [count]       com 'too-many-cells': nº de células (estimado ou contado)
 */

/**
 * @typedef {Object} MosaicOptions
 * @property {number[][][] | null} [holes]
 * @property {number} sideM
 * @property {number} [orientationDeg]  azimute das arestas (convenção de tilePolygonWithSquares)
 * @property {number} [minFillFrac]     abaixo disto a célula é uma tira
 * @property {number} [offsetSteps]     N → N×N deslocamentos (fracções do lado)
 * @property {((ring: number[][], areaM2: number) => boolean) | null} [fits]
 * @property {number} [maxCells]
 */

// Acima desta estimativa de células a pesquisa de deslocamentos baixa para
// 2×2, e acima de MANY_CELLS_1x1 para a grelha única: o custo cresce com o
// nº de células de fronteira × nº de ensaios.
const MANY_CELLS_2x2 = 150
const MANY_CELLS_1x1 = 600

/**
 * Orientação do mosaico (convenção de tilePolygonWithSquares) que deixa as
 * arestas dos quadrados PARALELAS às linhas de voo de ângulo `angleDeg`
 * (convenção de computeAlignment / generateFlightLines: azimute das faixas,
 * 0° = Norte-Sul, 90° = Este-Oeste).
 *
 * Na malha, `orientationDeg` é o azimute das arestas "verticais" do
 * quadrado (as outras ficam a +90°); nas faixas, `angleDeg` é o azimute das
 * próprias faixas. As duas convenções coincidem, a menos da periodicidade:
 * normaliza-se para 0–180°, a gama do campo da interface.
 */
export function mosaicOrientationForLines(angleDeg) {
  const a = Number(angleDeg)
  if (!Number.isFinite(a)) return 0
  return ((a % 180) + 180) % 180
}

/** Área (m²) de um polígono em coordenadas planas: exterior menos buracos. */
function planarArea(coords) {
  let total = 0
  coords.forEach((r, i) => {
    let s = 0
    for (let k = 0, n = r.length; k < n; k++) {
      const p = r[k]
      const q = r[(k + 1) % n]
      s += p[0] * q[1] - q[0] * p[1]
    }
    total += i === 0 ? Math.abs(s) / 2 : -Math.abs(s) / 2
  })
  return total
}

/** Ponto dentro (regra par-ímpar sobre todos os anéis, fechados). */
function pointInRings(x, y, rings) {
  let inside = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]
      const [xj, yj] = r[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/**
 * Liang–Barsky: troço [t0, t1] do segmento a–b dentro do rectângulo
 * fechado [x0,x1]×[y0,y1], ou null se não lhe toca.
 */
function clipSegment(a, b, x0, y0, x1, y1) {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const p = [-dx, dx, -dy, dy]
  const q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) {
        if (t > t1) return null
        if (t > t0) t0 = t
      } else {
        if (t < t0) return null
        if (t < t1) t1 = t
      }
    }
  }
  return [t0, t1]
}

/** Área com sinal (positiva = anti-horária) de um anel fechado. */
function signedArea(r) {
  let s = 0
  for (let k = 0; k + 1 < r.length; k++) s += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]
  return s / 2
}

/**
 * Sutherland–Hodgman de um anel contra o rectângulo: só serve para a ÁREA
 * com sinal da intersecção (exacta; as pontes degeneradas que o método cria
 * nos côncavos têm área nula). É a verificação barata de clipRingsToBox.
 */
function clippedSignedArea(r, x0, y0, x1, y1) {
  let pts = r.slice(0, -1)
  const planes = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ]
  for (const [inside, cut] of planes) {
    if (pts.length === 0) break
    const out = []
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      const ia = inside(a)
      const ib = inside(b)
      if (ia && ib) out.push(b)
      else if (ia && !ib) out.push(cut(a, b))
      else if (!ia && ib) out.push(cut(a, b), b)
    }
    pts = out
  }
  if (pts.length < 3) return 0
  return signedArea([...pts, pts[0]])
}

/**
 * Limpa um anel fechado: tira pontos repetidos, vértices colineares e
 * espigões (ida e volta pela mesma aresta), que o encadeamento pela
 * fronteira do rectângulo pode deixar. Devolve null se degenerar.
 */
function cleanRing(r, eps) {
  let pts = r.slice(0, -1)
  let changed = true
  while (changed && pts.length >= 3) {
    changed = false
    const out = []
    for (let k = 0; k < pts.length; k++) {
      const a = out.length ? out[out.length - 1] : pts[pts.length - 1]
      const b = pts[k]
      const c = pts[(k + 1) % pts.length]
      const abx = b[0] - a[0]
      const aby = b[1] - a[1]
      const bcx = c[0] - b[0]
      const bcy = c[1] - b[1]
      const lab = Math.hypot(abx, aby)
      const lbc = Math.hypot(bcx, bcy)
      // repetido, ou desvio de b à recta a–c abaixo da tolerância (inclui espigões)
      if (lab < eps || lbc < eps || Math.abs(abx * bcy - aby * bcx) <= eps * Math.max(lab, lbc)) {
        changed = true
        continue
      }
      out.push(b)
    }
    pts = out
  }
  if (pts.length < 3) return null
  return [...pts, pts[0]]
}

/**
 * Parte um anel fechado nos estrangulamentos: um vértice que toca outra
 * parte do anel (vértice repetido, ou vértice em cima de uma aresta não
 * adjacente) — dois pedaços que se tocam num ponto. O recorte só os cria
 * sobre a fronteira do rectângulo, pelo que só se testam vértices e arestas
 * dela (`onBox`), em vez de todos contra todos. Os laços com área positiva
 * são pedaços, os negativos são buracos encostados ao contorno.
 */
function splitPinches(r, eps, onBox) {
  const pts = r.slice(0, -1)
  const n = pts.length
  if (n <= 3) return [r]
  const on = pts.map(onBox)
  for (let i = 0; i < n; i++) {
    if (!on[i]) continue
    const p = pts[i]
    for (let k = 1; k <= n - 2; k++) {
      // aresta q[k] → q[k+1] do anel rodado para começar em i
      const ia = (i + k) % n
      const ib = (i + k + 1) % n
      if (!on[ia] || !on[ib]) continue
      const a = pts[ia]
      const b = pts[ib]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const l2 = dx * dx + dy * dy
      const t =
        l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
      if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) >= eps) continue
      const q = [...pts.slice(i), ...pts.slice(0, i)]
      const loopA = q.slice(0, k + 1)
      const loopB = [q[0], ...q.slice(k + 1)]
      return [loopA, loopB]
        .filter((l) => l.length >= 3)
        .flatMap((l) => splitPinches([...l, l[0]], eps, onBox))
    }
  }
  return [r]
}

/**
 * Recorte EXACTO de um polígono com buracos por um rectângulo alinhado aos
 * eixos, em pedaços separados (Weiler–Atherton com janela convexa). Os
 * anéis vêm orientados (exterior anti-horário, buracos horário), pelo que o
 * interior fica sempre à esquerda: cada anel parte-se em cadeias que entram
 * e saem do rectângulo, e as cadeias ligam-se andando pela fronteira do
 * rectângulo no sentido anti-horário até à entrada seguinte.
 *
 * O turf.intersect (polyclip) faz o mesmo, mas a ~1,7 ms por quadrado num
 * contorno de 120 vértices — demasiado para dezenas de ensaios. Devolve a
 * lista de polígonos (anéis fechados, exterior primeiro), ou null quando o
 * caso é degenerado ou a área não confere com Sutherland–Hodgman: aí quem
 * chama recorre ao turf.intersect.
 */
function clipRingsToBox(rings, ringBoxes, x0, y0, x1, y1, eps, insideAt) {
  const W = x1 - x0
  const H = y1 - y0
  const P = 2 * W + 2 * H
  const inBox = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1
  // lados do rectângulo (bits) em que o ponto assenta
  const sides = (p) =>
    (Math.abs(p[1] - y0) < eps ? 1 : 0) |
    (Math.abs(p[0] - x1) < eps ? 2 : 0) |
    (Math.abs(p[1] - y1) < eps ? 4 : 0) |
    (Math.abs(p[0] - x0) < eps ? 8 : 0)
  // cadeia que corre toda sobre a fronteira (cada troço num mesmo lado)
  const alongBoundary = (c) => {
    for (let k = 0; k + 1 < c.length; k++) if (!(sides(c[k]) & sides(c[k + 1]))) return false
    return true
  }
  const clampX = (x) => Math.min(x1, Math.max(x0, x))
  const clampY = (y) => Math.min(y1, Math.max(y0, y))
  // ponto na fronteira e posição ao longo dela (anti-horário desde (x0, y0))
  const snap = (p) => {
    const d = [Math.abs(p[1] - y0), Math.abs(x1 - p[0]), Math.abs(y1 - p[1]), Math.abs(p[0] - x0)]
    let side = 0
    for (let i = 1; i < 4; i++) if (d[i] < d[side]) side = i
    if (side === 0) return { pt: [clampX(p[0]), y0], pos: clampX(p[0]) - x0 }
    if (side === 1) return { pt: [x1, clampY(p[1])], pos: W + clampY(p[1]) - y0 }
    if (side === 2) return { pt: [clampX(p[0]), y1], pos: W + H + x1 - clampX(p[0]) }
    return { pt: [x0, clampY(p[1])], pos: (2 * W + H + y1 - clampY(p[1])) % P }
  }
  const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

  const chains = []
  const closed = []
  let expectedArea = 0
  for (let ri = 0; ri < rings.length; ri++) {
    const bb = ringBoxes[ri]
    if (bb[0] > x1 || bb[2] < x0 || bb[1] > y1 || bb[3] < y0) continue
    const r = rings[ri]
    expectedArea += clippedSignedArea(r, x0, y0, x1, y1)
    const pts = r.slice(0, -1)
    const n = pts.length
    const ins = pts.map(inBox)
    const start = ins.indexOf(false)
    if (start < 0) {
      closed.push(r)
      continue
    }
    let cur = null
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n
      const j = (i + 1) % n
      const a = pts[i]
      const b = pts[j]
      if (ins[i] && ins[j]) {
        if (!cur) return null
        cur.push(b)
      } else if (ins[i]) {
        if (!cur) return null
        const t = clipSegment(a, b, x0, y0, x1, y1)
        cur.push(t ? at(a, b, t[1]) : a)
        chains.push(cur)
        cur = null
      } else if (ins[j]) {
        const t = clipSegment(a, b, x0, y0, x1, y1)
        cur = [t ? at(a, b, t[0]) : b, b]
      } else {
        const t = clipSegment(a, b, x0, y0, x1, y1)
        if (t && t[1] - t[0] > 1e-12) chains.push([at(a, b, t[0]), at(a, b, t[1])])
      }
    }
    if (cur) return null
  }

  // cadeias só sobre a fronteira não delimitam nada: a ligação pela
  // fronteira já percorre esse caminho (ou o polígono está do lado de fora)
  const live = []
  for (const c of chains) {
    if (alongBoundary(c)) continue
    const e = snap(c[0])
    const x = snap(c[c.length - 1])
    c[0] = e.pt
    c[c.length - 1] = x.pt
    live.push({ pts: c, entry: e.pos, exit: x.pos })
  }

  // cantos: posição ao longo da fronteira e ponto
  /** @type {{pos: number, pt: number[]}[]} */
  const corners = [
    { pos: 0, pt: [x0, y0] },
    { pos: W, pt: [x1, y0] },
    { pos: W + H, pt: [x1, y1] },
    { pos: 2 * W + H, pt: [x0, y1] },
  ]
  const outers = []
  const holes = []
  const used = new Array(live.length).fill(false)
  for (let i = 0; i < live.length; i++) {
    if (used[i]) continue
    const ringPts = []
    let cur = i
    for (let guard = 0; ; guard++) {
      if (guard > live.length) return null
      used[cur] = true
      ringPts.push(...live[cur].pts)
      const p = live[cur].exit
      let next = -1
      let bestD = Infinity
      for (let j = 0; j < live.length; j++) {
        const d = (((live[j].entry - p) % P) + P) % P
        if (d < bestD) {
          bestD = d
          next = j
        }
      }
      const via = corners
        .map(({ pos, pt }) => ({ d: (((pos - p) % P) + P) % P, pt }))
        .filter(({ d }) => d > eps && d < bestD - eps)
        .sort((a, b) => a.d - b.d)
      for (const { pt } of via) ringPts.push(pt)
      if (next === i) break
      if (used[next]) return null
      cur = next
    }
    closed.push([...ringPts, ringPts[0]])
  }
  for (const r of closed) {
    const cleaned = cleanRing(r, eps)
    if (!cleaned) continue
    for (const loop of splitPinches(cleaned, eps, (q) => sides(q) !== 0)) {
      const l = cleanRing(loop, eps)
      if (!l) continue
      if (signedArea(l) > 0) outers.push(l)
      else holes.push(l)
    }
  }
  // sem cadeias, a fronteira do rectângulo não corta o polígono: ou está
  // toda dentro (o quadrado inteiro é um pedaço) ou toda fora
  if (live.length === 0 && outers.length === 0 && insideAt(x0, y0, x1, y1)) {
    outers.push([
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ])
  }
  const polys = outers.map((o) => [o])
  for (const h of holes) {
    const host = polys.find((pg) => pointInRings(h[0][0], h[0][1], [pg[0]]))
    if (!host) return null
    host.push(h)
  }
  const got = polys.reduce((t, pg) => t + planarArea(pg), 0)
  if (Math.abs(got - expectedArea) > Math.max(1e-6 * W * H, 1e-9)) return null
  return polys
}

function bboxOf(coords) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of coords[0]) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/** Arestas alinhadas aos eixos de um polígono: { vert: [u, vMin, vMax], horiz: [v, uMin, uMax] }. */
function axisEdges(coords, eps) {
  const vert = []
  const horiz = []
  for (const r of coords) {
    for (let k = 0; k + 1 < r.length; k++) {
      const p = r[k]
      const q = r[k + 1]
      if (Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) >= eps)
        vert.push([p[0], Math.min(p[1], q[1]), Math.max(p[1], q[1])])
      else if (Math.abs(p[1] - q[1]) < eps && Math.abs(p[0] - q[0]) >= eps)
        horiz.push([p[1], Math.min(p[0], q[0]), Math.max(p[0], q[0])])
    }
  }
  return { vert, horiz }
}

/**
 * Comprimento da fronteira partilhada entre duas células. Numa partição
 * por quadrados alinhados aos eixos a fronteira comum assenta sempre em
 * linhas da grelha: basta somar a sobreposição das arestas verticais (e
 * horizontais) colineares. Numa célula fundida as arestas são as de todos
 * os pedaços: as fronteiras internas entre eles não tocam outra célula.
 */
function sharedBorder(a, b, eps) {
  let len = 0
  for (const [ea, eb] of [
    [a.vert, b.vert],
    [a.horiz, b.horiz],
  ]) {
    for (const [c, lo, hi] of ea) {
      for (const [c2, lo2, hi2] of eb) {
        if (Math.abs(c - c2) >= eps) continue
        const o = Math.min(hi, hi2) - Math.max(lo, lo2)
        if (o > 0) len += o
      }
    }
  }
  return len
}

/** União de pedaços contíguos num polígono único (coordenadas), ou null. */
function unionPieces(members) {
  if (members.length === 1) return members[0]
  let u = null
  try {
    u = turf.union(turf.featureCollection(members.map((m) => turf.polygon(m))))
  } catch {
    u = null
  }
  if (!u || u.geometry.type !== 'Polygon') return null
  return /** @type {number[][][]} */ (u.geometry.coordinates)
}

/** Ordem lexicográfica do resultado: células, tiras, área em tiras. */
function better(a, b, areaTol) {
  if (!b) return true
  if (a.cells.length !== b.cells.length) return a.cells.length < b.cells.length
  if (a.slivers !== b.slivers) return a.slivers < b.slivers
  return a.sliverArea < b.sliverArea - areaTol
}

/**
 * Cobre o polígono `ring` (com `holes` opcionais) com quadrados de lado
 * `sideM` na orientação `orientationDeg` (azimute das arestas, a mesma
 * convenção de tilePolygonWithSquares; para arestas paralelas às faixas use
 * mosaicOrientationForLines(ângulo das faixas)).
 *
 * Pesquisa: offsetSteps × offsetSteps deslocamentos da origem (fracções do
 * lado, no referencial rodado), mais a grelha centrada na bbox de
 * tilePolygonWithSquares, que entra sempre como candidata — o resultado
 * nunca é pior do que o antigo. Cada ensaio recorta, funde as tiras e é
 * avaliado DEPOIS da fusão por ordem lexicográfica: menos células, depois
 * menos tiras (fillFrac < minFillFrac), depois menos área em tiras. Um
 * ensaio cujo mínimo possível (células − tiras) já perde para o melhor
 * actual nem chega a fundir. Áreas grandes reduzem a pesquisa (2×2 acima
 * de ~150 células, 1×1 acima de ~600).
 *
 * Fusão: cada tira, da mais pequena para a maior, junta-se à vizinha com
 * que partilha MAIS fronteira; se essa não couber (`fits`) ou a união não
 * for um polígono único, tenta-se a vizinha seguinte por comprimento de
 * fronteira; sem nenhuma, a tira fica como célula própria (voo curto).
 * `fits(anelLonLat, áreaM2)` por omissão aceita áreaM2 ≤ (1 + minFillFrac)·lado².
 * NOTA: `fits` pode ser chamada várias vezes por ensaio; deve ser barata.
 *
 * Devolve MosaicResult; { error: 'invalid' } para entrada degenerada e
 * { error: 'too-many-cells', count } acima de `maxCells`.
 *
 * @param {number[][]} ring
 * @param {MosaicOptions} options
 * @returns {MosaicResult}
 */
export function buildSquareMosaic(
  ring,
  {
    holes = null,
    sideM,
    orientationDeg = 0,
    minFillFrac = 0.25,
    offsetSteps = 4,
    fits = null,
    maxCells = 400,
  } = /** @type {MosaicOptions} */ ({ sideM: NaN }),
) {
  const finitePt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
  if (!Array.isArray(ring) || ring.length < 3 || !ring.every(finitePt)) return { error: 'invalid' }
  if (!(Number.isFinite(sideM) && sideM >= 10)) return { error: 'invalid' }
  const orient = Number.isFinite(orientationDeg) ? orientationDeg : 0
  const minFill = Number.isFinite(minFillFrac) ? Math.min(Math.max(minFillFrac, 0), 0.99) : 0.25
  const side = sideM
  const side2 = side * side
  const eps = side * 1e-7 // tolerância geométrica (60 µm num lado de 600 m)
  const minPieceArea = side2 * 1e-8 // pedaços degenerados do recorte
  const fitsFn = typeof fits === 'function' ? fits : (_r, a) => a <= (1 + minFill) * side2 + 1e-6

  // --- referencial local rodado: u ao longo de az+90°, v ao longo de az
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  const lon0 = (minLon + maxLon) / 2
  const lat0 = (minLat + maxLat) / 2
  const mLon = metersPerDegLon(lat0)
  const th = (orient * Math.PI) / 180
  const c = Math.cos(th)
  const s = Math.sin(th)
  const fwd = ([lon, lat]) => {
    const x = (lon - lon0) * mLon
    const y = (lat - lat0) * M_PER_DEG_LAT
    return [x * c - y * s, x * s + y * c]
  }
  const inv = ([u, v]) => [lon0 + (u * c + v * s) / mLon, lat0 + (-u * s + v * c) / M_PER_DEG_LAT]
  const closeRing = (r) => {
    const out = r.map(fwd)
    out.push(out[0])
    return out
  }
  const openLonLat = (r) => {
    const out = r.map(inv)
    const a = out[0]
    const b = out[out.length - 1]
    if (out.length > 1 && a[0] === b[0] && a[1] === b[1]) out.pop()
    return out
  }

  const rings = [closeRing(ring)]
  for (const h of holes ?? []) {
    if (Array.isArray(h) && h.length >= 3 && h.every(finitePt)) rings.push(closeRing(h))
  }
  // exterior anti-horário, buracos horário: o interior fica à esquerda
  rings.forEach((r, i) => {
    if (i === 0 ? signedArea(r) < 0 : signedArea(r) > 0) r.reverse()
  })
  const totalArea = planarArea(rings)
  if (!(totalArea > minPieceArea)) return { error: 'invalid' }
  const polyFeat = turf.polygon(rings)
  const ringBoxes = rings.map((r) => bboxOf([r]))
  // fronteira de um quadrado que não corta o polígono: toda dentro ou toda
  // fora. Testa-se o ponto da fronteira mais afastado do contorno, para um
  // vértice ou aresta tangente não decidir o teste
  const edgeDist = (x, y) => {
    let d = Infinity
    for (const r of rings) {
      for (let k = 0; k + 1 < r.length; k++) {
        const [ax, ay] = r[k]
        const bx = r[k + 1][0] - ax
        const by = r[k + 1][1] - ay
        const l2 = bx * bx + by * by
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * bx + (y - ay) * by) / l2)) : 0
        d = Math.min(d, Math.hypot(x - ax - t * bx, y - ay - t * by))
      }
    }
    return d
  }
  const insideAt = (x0, y0, x1, y1) => {
    const xm = (x0 + x1) / 2
    const ym = (y0 + y1) / 2
    const samples = [
      [xm, y0],
      [x1, ym],
      [xm, y1],
      [x0, ym],
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]
    let best = samples[0]
    let bestD = -1
    for (const [x, y] of samples) {
      const d = edgeDist(x, y)
      if (d > bestD) {
        bestD = d
        best = [x, y]
      }
    }
    return pointInRings(best[0], best[1], rings)
  }

  // --- estimativas e limites
  const [minU, minV, maxU, maxV] = bboxOf(rings)
  let perim = 0
  for (const r of rings)
    for (let k = 0; k + 1 < r.length; k++)
      perim += Math.hypot(r[k + 1][0] - r[k][0], r[k + 1][1] - r[k][1])
  const lowerBound = Math.ceil(totalArea / side2 - 1e-9)
  if (lowerBound > maxCells) return { error: 'too-many-cells', count: lowerBound }
  const estimate = totalArea / side2 + perim / side
  const bboxCount = (Math.ceil((maxU - minU) / side) + 1) * (Math.ceil((maxV - minV) / side) + 1)
  // trava de cálculo: uma grelha gigante de quadrados minúsculos à volta de
  // uma área fina e comprida (a contagem real é verificada no fim)
  if (bboxCount > maxCells * 50) return { error: 'too-many-cells', count: Math.ceil(estimate) }
  let steps = Math.max(1, Math.min(8, Math.floor(Number(offsetSteps) || 1)))
  if (estimate > MANY_CELLS_1x1) steps = 1
  else if (estimate > MANY_CELLS_2x2) steps = Math.min(steps, 2)

  const customFits = typeof fits === 'function'
  const newCell = (row, col, coords, area) => ({
    row,
    col,
    members: [coords],
    coords,
    area,
    mergedFrom: [],
    edges: axisEdges(coords, eps * 10),
    bbox: bboxOf(coords),
  })

  /** Um ensaio: recorte da grelha com origem em (u0, v0) e fusão das tiras. */
  const runTrial = (dx, dy, best) => {
    const u0 = minU - dx
    const v0 = minV - dy
    const cols = Math.max(1, Math.ceil((maxU - u0) / side - 1e-9))
    const rows = Math.max(1, Math.ceil((maxV - v0) / side - 1e-9))
    // 1) quadrados de fronteira: os que alguma aresta do polígono toca
    const boundary = new Uint8Array(cols * rows)
    for (const r of rings) {
      for (let k = 0; k + 1 < r.length; k++) {
        const a = r[k]
        const b = r[k + 1]
        const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - u0 - eps) / side))
        const c1 = Math.min(cols - 1, Math.floor((Math.max(a[0], b[0]) - u0 + eps) / side))
        const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - v0 - eps) / side))
        const r1 = Math.min(rows - 1, Math.floor((Math.max(a[1], b[1]) - v0 + eps) / side))
        for (let rr = r0; rr <= r1; rr++) {
          for (let cc = c0; cc <= c1; cc++) {
            const idx = rr * cols + cc
            if (boundary[idx]) continue
            const x0 = u0 + cc * side
            const y0 = v0 + rr * side
            if (clipSegment(a, b, x0 - eps, y0 - eps, x0 + side + eps, y0 + side + eps))
              boundary[idx] = 1
          }
        }
      }
    }
    // 2) recorte: quadrados interiores inteiros, os de fronteira por clipRingsToBox
    const cells = []
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        const x0 = u0 + cc * side
        const y0 = v0 + rr * side
        const sq = [
          [x0, y0],
          [x0 + side, y0],
          [x0 + side, y0 + side],
          [x0, y0 + side],
          [x0, y0],
        ]
        if (!boundary[rr * cols + cc]) {
          if (pointInRings(x0 + side / 2, y0 + side / 2, rings))
            cells.push(newCell(rr, cc, [sq], side2))
          continue
        }
        let parts = clipRingsToBox(rings, ringBoxes, x0, y0, x0 + side, y0 + side, eps, insideAt)
        if (!parts) {
          // caso degenerado para o recorte rápido: o polyclip do turf decide
          const res = turf.intersect(turf.featureCollection([turf.polygon([sq]), polyFeat]))
          if (!res) continue
          const g = res.geometry
          parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
        }
        for (const coords of parts) {
          const area = planarArea(coords)
          if (area > minPieceArea) cells.push(newCell(rr, cc, coords, area))
        }
      }
    }
    const sliverLimit = minFill * side2
    const countSlivers = () => cells.filter((x) => x.area < sliverLimit).length
    // poda: a fusão tira no máximo uma célula por tira
    if (best && cells.length - countSlivers() > best.cells.length) return null

    // 3) fusão das tiras. A união geométrica (polyclip, cara) só se calcula
    // quando um `fits` próprio precisa do anel; com o critério por omissão
    // basta a área, e a união faz-se no fim, só para o ensaio vencedor. Dois
    // pedaços com fronteira comum de comprimento positivo unem-se sempre num
    // polígono único.
    const tol = eps * 10
    const tried = new Set()
    for (;;) {
      let sl = null
      for (const x of cells)
        if (x.area < sliverLimit && !tried.has(x) && (!sl || x.area < sl.area)) sl = x
      if (!sl) break
      tried.add(sl)
      const cands = []
      for (const x of cells) {
        if (x === sl) continue
        const [a0, b0, a1, b1] = x.bbox
        if (a0 > sl.bbox[2] + tol || a1 < sl.bbox[0] - tol) continue
        if (b0 > sl.bbox[3] + tol || b1 < sl.bbox[1] - tol) continue
        const len = sharedBorder(sl.edges, x.edges, tol)
        if (len > tol) cands.push({ x, len })
      }
      cands.sort((p, q) => q.len - p.len)
      for (const { x } of cands) {
        const members = [...x.members, ...sl.members]
        const area = x.area + sl.area
        let coords = null
        if (customFits) {
          coords = unionPieces(members)
          if (!coords || !fitsFn(openLonLat(coords[0]), area)) continue
        } else if (!fitsFn(null, area)) continue
        const merged = {
          row: x.row,
          col: x.col,
          members,
          coords,
          area,
          mergedFrom: [
            ...x.mergedFrom,
            { row: sl.row, col: sl.col, areaM2: sl.area },
            ...sl.mergedFrom,
          ],
          edges: {
            vert: [...x.edges.vert, ...sl.edges.vert],
            horiz: [...x.edges.horiz, ...sl.edges.horiz],
          },
          bbox: [
            Math.min(x.bbox[0], sl.bbox[0]),
            Math.min(x.bbox[1], sl.bbox[1]),
            Math.max(x.bbox[2], sl.bbox[2]),
            Math.max(x.bbox[3], sl.bbox[3]),
          ],
        }
        cells.splice(cells.indexOf(x), 1, merged)
        cells.splice(cells.indexOf(sl), 1)
        break
      }
    }
    const slv = cells.filter((x) => x.area < sliverLimit)
    return {
      cells,
      slivers: slv.length,
      sliverArea: slv.reduce((t, x) => t + x.area, 0),
      offset: [dx, dy],
      u0,
      v0,
    }
  }

  // --- pesquisa de deslocamentos (a grelha centrada de tilePolygonWithSquares primeiro)
  const offsets = []
  const colsC = Math.max(1, Math.ceil((maxU - minU) / side))
  const rowsC = Math.max(1, Math.ceil((maxV - minV) / side))
  offsets.push([(colsC * side - (maxU - minU)) / 2, (rowsC * side - (maxV - minV)) / 2])
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < steps; j++) offsets.push([(i / steps) * side, (j / steps) * side])

  let best = null
  let trials = 0
  try {
    for (const [dx, dy] of offsets) {
      trials++
      const t = runTrial(dx, dy, best)
      if (t && better(t, best, side2 * 1e-6)) best = t
    }
  } catch {
    // contorno auto-intersectado ou degenerado ao ponto de o recorte falhar
    return { error: 'invalid' }
  }
  if (!best || best.cells.length === 0) return { error: 'invalid' }

  // geometria das células fundidas do ensaio vencedor; se a união falhar
  // (numérico), a fusão desfaz-se e os pedaços voltam a células próprias
  const finalCells = []
  for (const x of best.cells) {
    const coords = x.coords ?? unionPieces(x.members)
    if (coords) finalCells.push({ ...x, coords })
    else {
      for (const m of x.members) {
        const area = planarArea(m)
        finalCells.push({ ...x, coords: m, area, mergedFrom: [] })
      }
    }
  }
  if (finalCells.length > maxCells) return { error: 'too-many-cells', count: finalCells.length }
  const sliverCount = finalCells.filter((x) => x.area < minFill * side2).length

  // --- numeração serpenteante: linha a linha, sentido alternado entre as
  // linhas ocupadas; pedaços do mesmo quadrado pela posição ao longo da linha
  const rowIds = [...new Set(finalCells.map((x) => x.row))].sort((a, b) => a - b)
  const rank = new Map(rowIds.map((r, i) => [r, i]))
  const cu = (x) => {
    const o = x.coords[0]
    let t = 0
    for (let k = 0; k + 1 < o.length; k++) t += o[k][0]
    return t / Math.max(1, o.length - 1)
  }
  const ordered = finalCells
    .map((x) => ({ x, cu: cu(x) }))
    .sort((a, b) => {
      if (a.x.row !== b.x.row) return a.x.row - b.x.row
      const dir = rank.get(a.x.row) % 2 === 0 ? 1 : -1
      if (a.x.col !== b.x.col) return dir * (a.x.col - b.x.col)
      return dir * (a.cu - b.cu)
    })

  const cells = ordered.map(({ x }, i) => {
    const x0 = best.u0 + x.col * side
    const y0 = best.v0 + x.row * side
    return {
      id: i + 1,
      ring: openLonLat(x.coords[0]),
      holes: x.coords.slice(1).map(openLonLat),
      square: [
        [x0, y0],
        [x0 + side, y0],
        [x0 + side, y0 + side],
        [x0, y0 + side],
      ].map(inv),
      row: x.row,
      col: x.col,
      areaM2: x.area,
      fillFrac: x.area / side2,
      mergedFrom: x.mergedFrom,
    }
  })

  return {
    cells,
    sideM: side,
    orientationDeg: orient,
    offset: best.offset,
    slivers: sliverCount,
    trials,
  }
}
