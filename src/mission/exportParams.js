/**
 * Parâmetros de exportação WPML dos modos fachada, órbita, corredor e
 * pontos de inspecção: funções puras que devolvem o objecto que
 * exportWPMLKmz / exportBlocksZip recebem. Viviam nos handlers do App.jsx;
 * aqui são testáveis sem browser. A área tem o seu módulo (areaExport.js),
 * porque junta terrain follow, blocos e grelha nadir.
 */
import { buildExportName } from '../utils/exporters.js'
import { triggerRangesForLines } from '../utils/geo.js'
import { inspectionToWaypoints } from '../utils/inspect.js'

/** Fachada: uma foto por waypoint, rumo fixo; a altitude global é a passagem mais alta. */
export function faceExportParams({ missionName, plan, speed, wpml, gimbalPitch, sensorType }) {
  return {
    name: buildExportName(missionName, 'face', { part: `p1-${plan.stats.passCount}` }),
    waypoints: plan.waypoints,
    perWaypoint: plan.perWaypoint,
    altitude: Math.round(plan.stats.heights[plan.stats.heights.length - 1]),
    speed,
    wpml,
    photoIntervalM: 0,
    triggerMode: 'distance',
    gimbalPitch,
    sensorType,
  }
}

/** Órbita: voo curvo contínuo (turnMode do plano), pitch do primeiro nível. */
export function orbitExportParams({ missionName, plan, speed, wpml, sensorType }) {
  return {
    name: buildExportName(missionName, 'orbit', { part: `n${plan.stats.levelCount}` }),
    waypoints: plan.waypoints,
    perWaypoint: plan.perWaypoint,
    turnMode: plan.turnMode,
    altitude: Math.round(plan.stats.heights[plan.stats.heights.length - 1]),
    speed,
    wpml,
    photoIntervalM: 0,
    triggerMode: 'distance',
    gimbalPitch: plan.perLevel[0]?.gimbalPitch ?? -45,
    sensorType,
  }
}

/**
 * Corredor: nadir. No modo por waypoint cada ponto dispara a sua foto e não
 * há gatilho por distância; no modo distância é o inverso, e a ligação entre
 * troços de uma passagem partida por uma dobra não dispara (ver
 * triggerRangesForLines).
 */
export function corridorExportParams({ missionName, plan, photoMode, altitude, speed, wpml, photoIntervalM, sensorType }) {
  const perWaypointPhotos = photoMode === 'waypoint'
  return {
    name: buildExportName(missionName, 'corridor', { part: `n${plan.stats.passCount}` }),
    waypoints: plan.waypoints,
    ...(plan.perWaypoint ? { perWaypoint: plan.perWaypoint } : {}),
    altitude,
    speed,
    wpml,
    photoIntervalM: perWaypointPhotos ? 0 : (photoIntervalM ?? 0),
    triggerMode: perWaypointPhotos ? 'waypoint' : 'distance',
    triggerRanges: perWaypointPhotos
      ? null
      : triggerRangesForLines(plan.lines, plan.lines.map((l) => l.length), null, {
          maxLinkM: Math.max(2.5 * plan.stats.spacingM, 60),
        }),
    gimbalPitch: -90,
    sensorType,
  }
}

/** Pontos de inspecção (R2.9): rumo e pitch por ponto, sem disparo por distância. */
export function inspectionExportParams({ missionName, points, altitude, speed, wpml, gimbalPitch, sensorType }) {
  const { waypoints, perWaypoint } = inspectionToWaypoints(points)
  return {
    name: buildExportName(missionName, 'inspect', { part: `n${points.length}` }),
    waypoints,
    perWaypoint,
    altitude,
    speed,
    wpml,
    photoIntervalM: 0,
    triggerMode: 'distance',
    gimbalPitch,
    sensorType,
  }
}
