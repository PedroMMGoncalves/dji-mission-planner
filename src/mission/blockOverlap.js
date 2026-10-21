/**
 * A sobreposição entre blocos, para o mapa: os troços das linhas de voo de um
 * bloco que passam por cima da célula de outro bloco — o buffer e os
 * prolongamentos das faixas entram no vizinho —, desenhados a tracejado e um
 * pouco mais grossos (MapView). Em graus [lng, lat], como o desenho: a
 * classificação de um troço não depende da projecção, só a posição dos
 * cortes, e essa diferença não se vê no mapa.
 */

/**
 * A caixa de um anel: [minX, minY, maxX, maxY].
 * @param {number[][]} ring
 * @returns {number[]}
 */
export function ringBox(ring) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

/** Na aresta: a menos de ~0,1 mm (em graus), uma linha rente à célula não entra nela. */
const EDGE_EPS = 1e-9

/** O ponto está a menos de EDGE_EPS do segmento a→b. */
function nearSegment([x, y], a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) < EDGE_EPS
}

/**
 * O ponto está dentro do anel (par-ímpar; o anel pode vir fechado ou não);
 * em cima de uma aresta conta como fora.
 */
function inRing(pt, ring) {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (nearSegment(pt, ring[j], ring[i])) return false
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Os parâmetros t em ]0, 1[ onde o segmento p→q corta as arestas do anel. */
function crossings(p, q, ring, out) {
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]
    const ex = ring[i][0] - a[0]
    const ey = ring[i][1] - a[1]
    const den = dx * ey - dy * ex
    // paralelos (ou colineares): o ponto do meio de cada troço decide
    if (den === 0) continue
    const ax = a[0] - p[0]
    const ay = a[1] - p[1]
    const t = (ax * ey - ay * ex) / den
    const u = (ax * dy - ay * dx) / den
    if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t)
  }
}

/**
 * Parte uma linha de voo (dois ou mais pontos) nos troços que passam por
 * cima de uma das células `others` (overlap: true) e nos outros, pela ordem
 * da linha; troços seguidos do mesmo tipo juntam-se numa só polilinha. Uma
 * linha que não toca nenhuma célula volta inteira, num só troço.
 * @param {number[][]} line
 * @param {{ring: number[][], box?: number[]}[]} others
 * @returns {{points: number[][], overlap: boolean}[]}
 */
export function splitByCells(line, others) {
  /** @type {{points: number[][], overlap: boolean}[]} */
  const out = []
  const push = (a, b, overlap) => {
    const last = out[out.length - 1]
    if (last && last.overlap === overlap) last.points.push(b)
    else out.push({ points: [a, b], overlap })
  }
  for (let k = 1; k < line.length; k += 1) {
    const p = line[k - 1]
    const q = line[k]
    const minX = Math.min(p[0], q[0])
    const maxX = Math.max(p[0], q[0])
    const minY = Math.min(p[1], q[1])
    const maxY = Math.max(p[1], q[1])
    // só as células cuja caixa toca a do segmento
    const near = others.filter(({ ring, box }) => {
      const [x0, y0, x1, y1] = box ?? ringBox(ring)
      return x0 <= maxX && x1 >= minX && y0 <= maxY && y1 >= minY
    })
    const ts = [0, 1]
    for (const { ring } of near) crossings(p, q, ring, ts)
    ts.sort((a, b) => a - b)
    const at = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    for (let i = 1; i < ts.length; i += 1) {
      if (ts[i] - ts[i - 1] <= 1e-12) continue
      const mid = at((ts[i - 1] + ts[i]) / 2)
      const overlap = near.some(({ ring }) => inRing(mid, ring))
      push(at(ts[i - 1]), at(ts[i]), overlap)
    }
  }
  return out
}

/**
 * As linhas de cada bloco partidas pela sobreposição com as células dos
 * outros (`cellRing`, os blocos do mosaico e da quadrícula). Sem células (a
 * divisão por faixas, que não sobrepõe) ou com um só bloco, cada linha volta
 * inteira.
 * @param {{id: number, lines: number[][][], cellRing?: number[][]}[]} blocks
 * @returns {Map<number, {points: number[][], overlap: boolean}[][]>} por id de bloco, por linha
 */
export function blockLinePieces(blocks) {
  const cells = (blocks ?? [])
    .filter((b) => (b.cellRing?.length ?? 0) >= 3)
    .map((b) => ({ id: b.id, ring: b.cellRing, box: ringBox(b.cellRing) }))
  const out = new Map()
  for (const block of blocks ?? []) {
    const others = cells.filter((c) => c.id !== block.id)
    out.set(
      block.id,
      block.lines.map((line) =>
        others.length ? splitByCells(line, others) : [{ points: line, overlap: false }],
      ),
    )
  }
  return out
}
