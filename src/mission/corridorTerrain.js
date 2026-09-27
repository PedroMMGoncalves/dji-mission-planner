/**
 * Seguimento de terreno do CORREDOR. As passagens do corredor são
 * polilinhas com dobras; o motor da área (terrainFollowLines) perfila cada
 * troço entre vértices, mantém todos os vértices e acrescenta os pontos que
 * o relevo exige, dentro das passagens e nas ligações entre elas. Lógica
 * pura, sem React.
 *
 * Diferença para a área: na foto por waypoint a área recusa o seguimento de
 * terreno, porque a densificação mudaria os índices das acções. Aqui os
 * vértices das passagens SÃO as posições de foto e o motor diz onde ficou
 * cada um (`vertexIndex`), pelo que as acções são reindexadas e os pontos
 * novos seguem sem foto.
 */
import * as turf from '@turf/turf'
import { terrainFollowLines } from '../utils/terrain.js'
import { stripRouteStats } from '../utils/geo.js'

/**
 * @param {any} terrain relevo carregado (terrain.data: elevationAt, verticalDatum)
 * @param {any} plan plano de generateCorridorPlan (sem erro)
 * @param {{refElev: number|null, agl: number, toleranceM?: number, speed: number,
 *   waypointStops?: 'corners'|'all'}} opts
 * @returns {any} `{ waypoints, perLine, perLink, perWaypoint, pathLengthM,
 *   flightTimeS, refElev, elevMin, elevMax, warnings, ... }` ou `{ error }`
 */
export function planCorridorTerrain(
  terrain,
  plan,
  { refElev, agl, toleranceM = 5, speed, waypointStops = 'corners' },
) {
  if (!Number.isFinite(refElev)) return { error: 'ref-outside-terrain' }
  if (!plan?.lines?.length) return { error: 'no-plan' }
  const res = terrainFollowLines(terrain, plan.lines, {
    agl,
    refElev,
    toleranceM: Math.max(1, toleranceM),
  })

  // foto por waypoint: cada vértice leva a sua acção para o novo índice
  let perWaypoint = null
  if (Array.isArray(plan.perWaypoint)) {
    perWaypoint = []
    let orig = 0
    res.vertexIndex.forEach((idx) => {
      for (const out of idx) {
        const pw = plan.perWaypoint[orig]
        if (pw) perWaypoint[out] = pw
        orig += 1
      }
    })
  }

  const { pathLengthM, flightTimeS } = stripRouteStats(res.waypoints, {
    speed,
    lineCount: plan.lines.length,
    perLine: res.perLine,
    waypointStops,
  })
  return { ...res, refElev, perWaypoint, pathLengthM, flightTimeS }
}

/** Caixa [oeste, sul, este, norte] de um anel ou de uma lista de pontos. */
export function bboxOfPoints(pts) {
  if (!Array.isArray(pts) || pts.length === 0) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const p of pts) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    w = Math.min(w, p[0])
    e = Math.max(e, p[0])
    s = Math.min(s, p[1])
    n = Math.max(n, p[1])
  }
  return Number.isFinite(w) ? [w, s, e, n] : null
}

/** A caixa `outer` contém a caixa `inner`? */
export function bboxCovers(outer, inner) {
  if (!outer || !inner) return false
  return (
    inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
  )
}

/** Maior lado de uma caixa, em km (aproximação local). */
function bboxSpanKm(b) {
  const lat = (b[1] + b[3]) / 2
  const dx = (b[2] - b[0]) * 111.32 * Math.cos((lat * Math.PI) / 180)
  const dy = (b[3] - b[1]) * 110.574
  return Math.max(dx, dy)
}

/** Acima disto a área e o corredor não partilham o relevo: carrega-se o do separador aberto. */
export const TERRAIN_UNION_MAX_KM = 20

/**
 * Caixa a cobrir com relevo quando o projecto tem um corredor. A área e o
 * corredor de uma mina ficam lado a lado: uma só caixa para os dois deixa um
 * único MDT da DGT (ou o último levantamento) servir ambos, sem trocar de
 * relevo ao mudar de separador. Se a união passar dos 20 km, fica a caixa do
 * modo activo. Sem corredor devolve null, e o relevo segue a área como
 * sempre.
 */
export function terrainTargetBbox({ areaBbox = null, corridorBbox = null, missionMode }) {
  if (!corridorBbox) return null
  if (!areaBbox) return corridorBbox
  const union = [
    Math.min(areaBbox[0], corridorBbox[0]),
    Math.min(areaBbox[1], corridorBbox[1]),
    Math.max(areaBbox[2], corridorBbox[2]),
    Math.max(areaBbox[3], corridorBbox[3]),
  ]
  if (bboxSpanKm(union) <= TERRAIN_UNION_MAX_KM) return union
  return missionMode === 'corridor' ? corridorBbox : areaBbox
}

/** Distância (m) da base ao ponto mais próximo da rota. */
export function baseToRouteM(basePoint, waypoints) {
  if (!Array.isArray(basePoint) || !Array.isArray(waypoints) || waypoints.length === 0) return null
  let best = Infinity
  for (const w of waypoints) {
    const d = turf.distance(basePoint, [w[0], w[1]], { units: 'meters' })
    if (d < best) best = d
  }
  return Number.isFinite(best) ? best : null
}
