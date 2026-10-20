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
