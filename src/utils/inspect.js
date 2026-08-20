import * as turf from '@turf/turf'

/**
 * PONTOS DE INSPEÇÃO (T4.3/R2.9) — waypoints colocados individualmente com
 * rumo/pitch/foto próprios e uma etiqueta do utilizador; a ordem é manual
 * (setas na lista) com sugestão opcional por vizinho-mais-próximo.
 */

/**
 * Sugestão gulosa de ordem de visita: começa no ponto mais próximo de
 * `start` (base do operador quando existe, senão o primeiro ponto) e segue
 * sempre para o mais próximo ainda não visitado. Devolve uma NOVA lista —
 * não altera a original.
 */
export function nearestNeighbourOrder(points, start = null) {
  if (!Array.isArray(points)) return []
  if (points.length <= 2 && !start) return points.slice()
  const remaining = points.map((_, i) => i)
  const ordered = []
  let cursor = start ?? points[0]?.point
  while (remaining.length > 0) {
    let bestJ = 0
    let bestD = Infinity
    remaining.forEach((idx, j) => {
      const d = turf.distance(cursor, points[idx].point, { units: 'meters' })
      if (d < bestD) {
        bestD = d
        bestJ = j
      }
    })
    const idx = remaining.splice(bestJ, 1)[0]
    ordered.push(points[idx])
    cursor = points[idx].point
  }
  return ordered
}

/**
 * Converte a lista de pontos de inspeção nos inputs do exportador (T4.1):
 * waypoints [lon, lat, h] + perWaypoint { heading?, gimbalPitch?, actions }.
 * heading null/indefinido deixa o rumo seguir a rota (followWayline);
 * photo === false não dispara nesse ponto.
 */
export function inspectionToWaypoints(points) {
  const waypoints = []
  const perWaypoint = []
  for (const p of points ?? []) {
    if (!Array.isArray(p.point)) continue
    waypoints.push([p.point[0], p.point[1], Math.round((p.heightM ?? 30) * 10) / 10])
    perWaypoint.push({
      ...(p.heading != null ? { heading: p.heading } : {}),
      ...(p.gimbalPitch != null ? { gimbalPitch: p.gimbalPitch } : {}),
      actions: p.photo === false ? [] : ['takePhoto'],
    })
  }
  return { waypoints, perWaypoint }
}
