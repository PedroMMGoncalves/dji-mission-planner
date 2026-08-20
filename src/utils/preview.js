import * as turf from '@turf/turf'

/**
 * E1.1/E1.2: traços de rumo para a pré-visualização no mapa — para cada
 * waypoint com rumo fixo, um pequeno segmento [origem, destino] na direcção
 * desse rumo. `limit` corta ao primeiro bloco de waypoints (ex.: a primeira
 * passagem de uma fachada ou a primeira volta de uma órbita — em planta as
 * restantes sobrepõem-se). Puro e testável.
 */
export function headingTicks(waypoints, perWaypoint, { lengthM = 8, limit = null } = {}) {
  if (!Array.isArray(waypoints) || !Array.isArray(perWaypoint)) return []
  const n = limit != null ? Math.min(limit, waypoints.length) : waypoints.length
  const ticks = []
  for (let i = 0; i < n; i++) {
    const heading = perWaypoint[i]?.heading
    if (heading == null) continue
    const from = [waypoints[i][0], waypoints[i][1]]
    const to = turf.destination(turf.point(from), lengthM, ((heading + 540) % 360) - 180, {
      units: 'meters',
    }).geometry.coordinates
    ticks.push([from, to])
  }
  return ticks
}
