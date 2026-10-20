/**
 * Onde as fotografias saem com disparo por distância ou por tempo: o comando
 * fotografa a cada `intervalM` ao longo da rota voada dentro de cada grupo
 * de disparo (triggerRangesForLines), a começar no primeiro waypoint do
 * grupo; nas ligações longas, fora dos grupos, não fotografa. Por tempo o
 * intervalo em metros é o mesmo (os segundos vêm de velocidade × intervalo).
 * O mapa mostra estes pontos como já mostrava as fotos por waypoint, em que
 * cada foto é um ponto da rota.
 */
import * as turf from '@turf/turf'
import { triggerMaxLinkM, triggerRangesForLines } from '../utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'

/**
 * Pontos de fotografia ao longo de `waypoints` dentro dos grupos `ranges`.
 * @param {number[][]} waypoints [lon, lat(, h)] pela ordem de voo
 * @param {number[][]} ranges grupos [i0, i1] de índices de waypoints (inclusive)
 * @param {number} intervalM distância entre fotos (m)
 * @param {{limit?: number}} [opts] tecto de pontos (o mapa não aguenta infinitos)
 * @returns {number[][]} [lon, lat]
 */
export function photoPointsAlong(waypoints, ranges, intervalM, { limit = 20000 } = {}) {
  const out = []
  if (!Array.isArray(waypoints) || !Array.isArray(ranges) || !(intervalM > 0)) return out
  for (const [i0, i1] of ranges) {
    if (!(i0 >= 0) || !(i1 < waypoints.length) || i1 < i0) continue
    // a primeira foto no arranque do grupo; depois a cada intervalo da rota
    let next = 0
    let s = 0
    for (let i = i0; i < i1; i++) {
      const a = waypoints[i]
      const b = waypoints[i + 1]
      const len = turf.distance([a[0], a[1]], [b[0], b[1]], { units: 'meters' })
      // um milímetro de tolerância: a foto no fim exacto do troço não se perde por ruído
      while (next <= s + len + 1e-3) {
        const t = len > 0 ? (next - s) / len : 0
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        if (out.length >= limit) return out
        next += intervalM
      }
      s += len
    }
    if (i0 === i1) out.push([waypoints[i0][0], waypoints[i0][1]])
  }
  return out
}

/**
 * Fotos de uma missão de área (plano simples ou blocos), com os mesmos
 * grupos de disparo que a exportação escreve (buildAreaExport).
 * @param {any} plan plano válido
 * @param {any[]|null} blocks blocos (planBlocks), ou null
 * @param {{intervalM: number, spacingM: number}} opts
 * @returns {number[][]}
 */
export function areaPhotoPoints(plan, blocks, { intervalM, spacingM }) {
  const maxLinkM = triggerMaxLinkM(spacingM)
  const sources = blocks?.length ? blocks : plan ? [plan] : []
  const out = []
  for (const b of sources) {
    const perLine = b.perLine ?? b.lines.map((l) => l.length)
    const ranges = triggerRangesForLines(b.lines, perLine, b.perLink ?? null, { maxLinkM })
    out.push(...photoPointsAlong(b.waypoints, ranges, intervalM, { limit: 20000 - out.length }))
    if (out.length >= 20000) break
  }
  return out
}

/**
 * Fotos de um corredor por distância, com os grupos de corridorExportParams.
 * @param {any} plan plano do corredor (generateCorridorPlan)
 * @param {number} intervalM
 */
export function corridorPhotoPoints(plan, intervalM) {
  if (!plan || plan.error) return []
  const perLine = plan.perLine ?? plan.lines.map((l) => l.length)
  const ranges = triggerRangesForLines(plan.lines, perLine, null, {
    maxLinkM: Math.max(2.5 * plan.stats.spacingM, 60),
  })
  return photoPointsAlong(plan.waypoints, ranges, intervalM)
}

/**
 * Fotos sobre a rota 3D: cada ponto de foto (2D) recebe a altura da rota no
 * ponto mais próximo (interpolada no troço), para a vista 3D as desenhar
 * onde a aeronave dispara. Os saltos entre voos (`breaks`: índices onde
 * começa um voo novo) não são troços. Uma grelha de células acelera a
 * procura (milhares de fotos × milhares de troços).
 * @param {number[][]} photos [lon, lat]
 * @param {number[][]} route [lon, lat, h] pela ordem de voo
 * @param {{breaks?: number[]|null}} [opts]
 * @returns {number[][]} [lon, lat, h]
 */
export function photosOnRoute(photos, route, { breaks = null } = {}) {
  if (!Array.isArray(photos) || !Array.isArray(route) || route.length < 2) return []
  const lat0 = route[0][1]
  const mLon = metersPerDegLon(lat0)
  const xy = route.map((w) => [(w[0] - route[0][0]) * mLon, (w[1] - lat0) * M_PER_DEG_LAT])
  const breakSet = new Set(Array.isArray(breaks) ? breaks : [])
  // troços válidos e a maior extensão, para o passo da grelha
  const segs = []
  let maxLen = 0
  for (let i = 1; i < route.length; i++) {
    if (breakSet.has(i)) continue
    const len = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1])
    if (!(len > 0)) continue
    segs.push(i)
    if (len > maxLen) maxLen = len
  }
  if (segs.length === 0) return []
  const cell = Math.max(50, maxLen)
  const key = (cx, cy) => `${cx}:${cy}`
  const grid = new Map()
  for (const i of segs) {
    const [ax, ay] = xy[i - 1]
    const [bx, by] = xy[i]
    const x0 = Math.floor(Math.min(ax, bx) / cell)
    const x1 = Math.floor(Math.max(ax, bx) / cell)
    const y0 = Math.floor(Math.min(ay, by) / cell)
    const y1 = Math.floor(Math.max(ay, by) / cell)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy)
        const list = grid.get(k)
        if (list) list.push(i)
        else grid.set(k, [i])
      }
    }
  }
  const out = []
  for (const p of photos) {
    const px = (p[0] - route[0][0]) * mLon
    const py = (p[1] - lat0) * M_PER_DEG_LAT
    const cx = Math.floor(px / cell)
    const cy = Math.floor(py / cell)
    let best = Infinity
    let z = null
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of grid.get(key(cx + dx, cy + dy)) ?? []) {
          const [ax, ay] = xy[i - 1]
          const [bx, by] = xy[i]
          const vx = bx - ax
          const vy = by - ay
          const t = Math.max(
            0,
            Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)),
          )
          const d = Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
          if (d < best) {
            best = d
            const za = route[i - 1][2]
            const zb = route[i][2]
            z = Number.isFinite(za) && Number.isFinite(zb) ? za + (zb - za) * t : null
          }
        }
      }
    }
    if (z != null) out.push([p[0], p[1], Math.round(z * 10) / 10])
  }
  return out
}

/**
 * Fotos com disparo por waypoint: os waypoints da rota com uma acção de foto
 * (`perWaypoint[i].actions` com 'takePhoto'), os mesmos que a levam no WPML.
 * @param {number[][]} route [lon, lat, h]
 * @param {any[]|null|undefined} perWaypoint
 * @returns {number[][]}
 */
export function photosAtWaypoints(route, perWaypoint) {
  if (!Array.isArray(route) || !Array.isArray(perWaypoint)) return []
  const out = []
  route.forEach((w, i) => {
    const acts = perWaypoint[i]?.actions
    if (Array.isArray(acts) && acts.includes('takePhoto')) out.push(w)
  })
  return out
}

/**
 * Posições de foto no mapa (2D): [lon, lat] sem repetições — na fachada e
 * na órbita as passagens empilham-se na vertical e o mesmo ponto do mapa
 * leva várias fotos, que no mapa são uma só marca.
 * @param {number[][]} points [lon, lat, ...]
 * @returns {number[][]}
 */
export function photoPositions2d(points) {
  if (!Array.isArray(points)) return []
  const seen = new Set()
  const out = []
  for (const p of points) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    const k = `${p[0].toFixed(7)},${p[1].toFixed(7)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push([p[0], p[1]])
  }
  return out
}
