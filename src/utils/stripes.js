/**
 * As riscas de uma linha partilhada por dois (ou mais) blocos, no ecrã: uma
 * barra da espessura da linha, de `p0` a `p1`, cortada em riscas de
 * `stripe` píxeis com cortes a 45°, cada uma na cor de um dos blocos, à vez
 * — encaixadas, sem falhas nem sobreposições, e com os topos da barra
 * direitos (MapView, StripedLine).
 */

/**
 * Corta um polígono (em coordenadas locais [s, t]) por s ≥ lo e s ≤ hi
 * (Sutherland–Hodgman nos dois lados).
 * @param {number[][]} poly
 * @param {number} lo
 * @param {number} hi
 * @returns {number[][]}
 */
function clipAlong(poly, lo, hi) {
  const cut = (pts, inside, edgeS) => {
    const out = []
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const ia = inside(a)
      const ib = inside(b)
      if (ia) out.push(a)
      if (ia !== ib) {
        const r = (edgeS - a[0]) / (b[0] - a[0])
        out.push([edgeS, a[1] + r * (b[1] - a[1])])
      }
    }
    return out
  }
  const left = cut(poly, (p) => p[0] >= lo, lo)
  return left.length ? cut(left, (p) => p[0] <= hi, hi) : left
}

/**
 * As riscas da barra de `p0` a `p1` (píxeis do ecrã): polígonos e o índice
 * de cada risca (0 começa em `p0`; a cor é a de `index` módulo o número de
 * blocos). Cada risca vai de k·stripe a (k+1)·stripe ao longo da barra, com
 * as fronteiras a 45°: em cima avançadas meia espessura, em baixo
 * recuadas outra meia.
 * @param {number[]} p0
 * @param {number[]} p1
 * @param {{width: number, stripe: number}} opts
 * @returns {{points: number[][], index: number}[]}
 */
export function stripePolygons(p0, p1, { width, stripe }) {
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const len = Math.hypot(dx, dy)
  if (!(len > 0) || !(width > 0) || !(stripe > 0)) return []
  const u = [dx / len, dy / len]
  const n = [-u[1], u[0]]
  const h = width / 2
  const toScreen = ([s, t]) => [p0[0] + s * u[0] + t * n[0], p0[1] + s * u[1] + t * n[1]]
  const out = []
  const k0 = Math.floor(-h / stripe) - 1
  const k1 = Math.ceil((len + h) / stripe)
  for (let k = k0; k <= k1; k += 1) {
    const a = k * stripe
    const b = (k + 1) * stripe
    const local = clipAlong(
      [
        [a + h, h],
        [b + h, h],
        [b - h, -h],
        [a - h, -h],
      ],
      0,
      len,
    )
    if (local.length >= 3) out.push({ points: local.map(toScreen), index: k })
  }
  return out
}
