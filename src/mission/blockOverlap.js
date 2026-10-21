/**
 * A sobreposição entre blocos, para o mapa: os troços onde dois (ou mais)
 * blocos voam a mesma faixa. As faixas de blocos vizinhos são colineares —
 * todas as células usam a mesma grelha de faixas (computeAlignment) —, por
 * isso a margem e os prolongamentos de um bloco caem exactamente em cima das
 * faixas do vizinho. Esses troços desenham-se numa só linha às riscas, nas
 * cores dos blocos, e o resto de cada linha cheio (MapView, stripePolygons).
 * Em metros num plano local (equirectangular à volta do primeiro ponto),
 * que chega para agrupar faixas a 25 cm umas das outras.
 */
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'

/** Duas faixas a menos disto (m) são a mesma faixa de blocos diferentes. */
const SAME_LINE_M = 0.25
/** Direcções a menos disto (rad) são a mesma passagem (a grelha ou a cruzada). */
const SAME_ANGLE = 2e-3
/** Troços mais curtos do que isto (m) não contam. */
const MIN_LEN_M = 0.01

/**
 * Os troços de cada linha de voo: cheios, na cor do seu bloco, onde só ele
 * voa a faixa; partilhados, onde dois ou mais blocos a voam (`ids`, por
 * ordem). Uma linha que não toca outra volta inteira, num só troço cheio.
 * @param {{id: number, lines: number[][][]}[]|null} blocks
 * @returns {{solid: Map<number, number[][][]>, shared: {points: number[][], ids: number[]}[]}}
 */
export function sharedStretches(blocks) {
  /** @type {Map<number, number[][][]>} */
  const solid = new Map()
  /** @type {{points: number[][], ids: number[]}[]} */
  const shared = []
  const list = Array.isArray(blocks) ? blocks : []
  const first = list.find((b) => b?.lines?.[0]?.[0])?.lines[0][0]
  if (!first) return { solid, shared }
  const mLon = metersPerDegLonSafe(first[1])
  const toXY = (p) => [(p[0] - first[0]) * mLon, (p[1] - first[1]) * M_PER_DEG_LAT]
  const toLL = (q) => [first[0] + q[0] / mLon, first[1] + q[1] / M_PER_DEG_LAT]

  // os segmentos de cada linha, com a direcção sem sentido em [0, π)
  const segs = []
  for (const b of list) {
    solid.set(b.id, [])
    for (const line of b.lines ?? []) {
      for (let k = 1; k < line.length; k += 1) {
        const p = toXY(line[k - 1])
        const q = toXY(line[k])
        const len = Math.hypot(q[0] - p[0], q[1] - p[1])
        if (!(len > MIN_LEN_M)) continue
        let th = Math.atan2(q[1] - p[1], q[0] - p[0])
        if (th < 0) th += Math.PI
        if (th >= Math.PI) th -= Math.PI
        segs.push({ id: b.id, p, q, th })
      }
    }
  }
  // as passagens: direcções iguais (a 0 e a π são a mesma)
  const groups = []
  for (const s of segs) {
    const g = groups.find((x) => {
      const d = Math.abs(x.th - s.th)
      return Math.min(d, Math.PI - d) < SAME_ANGLE
    })
    if (g) g.segs.push(s)
    else groups.push({ th: s.th, segs: [s] })
  }
  for (const g of groups) {
    const u = [Math.cos(g.th), Math.sin(g.th)]
    const n = [-u[1], u[0]]
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
    // cada segmento como um intervalo ao longo da faixa, à distância v dela
    const items = g.segs.map((s) => {
      const a = dot(s.p, u)
      const b = dot(s.q, u)
      return { id: s.id, v: (dot(s.p, n) + dot(s.q, n)) / 2, a: Math.min(a, b), b: Math.max(a, b) }
    })
    items.sort((x, y) => x.v - y.v)
    // as faixas: segmentos a menos de SAME_LINE_M uns dos outros
    for (let i = 0; i < items.length;) {
      let j = i + 1
      while (j < items.length && items[j].v - items[j - 1].v < SAME_LINE_M) j += 1
      const faixa = items.slice(i, j)
      const v = faixa.reduce((sum, it) => sum + it.v, 0) / faixa.length
      const at = (t) => toLL([u[0] * t + n[0] * v, u[1] * t + n[1] * v])
      // os cortes: as pontas de todos os intervalos da faixa
      const cuts = [...new Set(faixa.flatMap((it) => [it.a, it.b]))].sort((x, y) => x - y)
      let run = null
      const flush = () => {
        if (!run) return
        const points = [at(run.a), at(run.b)]
        if (run.ids.length > 1) shared.push({ points, ids: run.ids })
        else solid.get(run.ids[0]).push(points)
        run = null
      }
      for (let k = 1; k < cuts.length; k += 1) {
        const [a, b] = [cuts[k - 1], cuts[k]]
        if (b - a < MIN_LEN_M) continue
        const mid = (a + b) / 2
        const ids = [
          ...new Set(faixa.filter((it) => it.a <= mid && it.b >= mid).map((it) => it.id)),
        ]
        ids.sort((x, y) => x - y)
        if (ids.length === 0) {
          flush()
          continue
        }
        const key = ids.join(',')
        if (run && run.key === key && Math.abs(run.b - a) < MIN_LEN_M) run.b = b
        else {
          flush()
          run = { key, ids, a, b }
        }
      }
      flush()
      i = j
    }
  }
  return { solid, shared }
}
