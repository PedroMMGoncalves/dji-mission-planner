import * as turf from '@turf/turf'
import { computeFootprint, computeGSD } from './geo.js'

/**
 * ÓRBITAS MULTI-NÍVEL (T5.1) — círculos empilhados em torno de um POI para
 * inspeção/reconstrução 3D de estruturas isoladas (chaminés, antenas,
 * afloramentos pontuais).
 *
 * Cada nível é uma volta completa ao raio dado; os pontos por revolução
 * saem da sobreposição horizontal à distância R (corda ≈ pegada transversal
 * × (1 − sobreposição)), com mínimo de 8. Em cada waypoint o rumo aponta ao
 * POI e dispara-se uma foto; o gimbal de cada nível aponta à cota do centro
 * do alvo: pitch = −atan((h − poiHeightM)/R). A volta fecha no rumo inicial
 * e a subida para o nível seguinte é vertical, no mesmo ponto horizontal.
 * Pensado para exportar com waypointTurnMode
 * toPointAndPassWithContinuityCurvature (voo curvo contínuo).
 *
 * Alturas relativas ao ponto de descolagem (relativeToStartPoint), como o
 * resto da app; `poiHeightM` é a cota do centro do alvo no mesmo referencial.
 */
export function generateOrbitPlan(poi, options) {
  const {
    sensor,
    radiusM,
    levels,
    horizontalOverlapPct = 80,
    poiHeightM = 0,
    speed = 3,
    startBearingDeg = 0,
    clockwise = true,
  } = options ?? {}

  if (!poi || !(radiusM > 0)) return { error: 'invalid-radius' }
  const heights = Array.isArray(levels)
    ? levels.slice()
    : levels && levels.count > 0
      ? Array.from({ length: levels.count }, (_, k) => levels.startM + k * levels.stepM)
      : null
  if (!heights || heights.length === 0 || heights.some((h) => !Number.isFinite(h))) {
    return { error: 'invalid-levels' }
  }

  // pontos por revolução a partir da sobreposição horizontal à distância R
  const fp = sensor?.type === 'camera' ? computeFootprint(sensor, radiusM) : null
  const chordM = fp
    ? Math.max(1, fp.across * (1 - horizontalOverlapPct / 100))
    : (2 * Math.PI * radiusM) / 24
  const nPts = Math.min(120, Math.max(8, Math.ceil((2 * Math.PI * radiusM) / chordM)))
  const stepDeg = (clockwise ? 360 : -360) / nPts

  const poiPt = turf.point(poi)
  const waypoints = []
  const perWaypoint = []
  const perLevel = []
  heights.forEach((h, li) => {
    // gimbal do nível apontado ao centro do alvo (trigonometria simples)
    const pitch = Math.max(
      -90,
      Math.min(20, -Math.round((Math.atan2(h - poiHeightM, radiusM) * 180) / Math.PI)),
    )
    perLevel.push({ level: li + 1, heightM: h, gimbalPitch: pitch })
    for (let i = 0; i <= nPts; i++) {
      // i === nPts fecha a volta no rumo inicial
      const brg = startBearingDeg + (i % nPts) * stepDeg
      const pos = turf.destination(poiPt, radiusM, ((brg % 360) + 540) % 360 - 180, {
        units: 'meters',
      }).geometry.coordinates
      const heading = ((Math.round(turf.bearing(pos, poi)) % 360) + 360) % 360
      waypoints.push([pos[0], pos[1], Math.round(h * 10) / 10])
      perWaypoint.push({ heading, gimbalPitch: pitch, actions: ['takePhoto'] })
    }
  })

  let pathLengthM = 0
  for (let i = 1; i < waypoints.length; i++) {
    const dxy = turf.distance(waypoints[i - 1], waypoints[i], { units: 'meters' })
    const dh = Math.abs((waypoints[i][2] ?? 0) - (waypoints[i - 1][2] ?? 0))
    pathLengthM += Math.hypot(dxy, dh)
  }

  return {
    waypoints,
    perWaypoint,
    perLevel,
    turnMode: 'toPointAndPassWithContinuityCurvature',
    stats: {
      levelCount: heights.length,
      pointsPerOrbit: nPts,
      waypointCount: waypoints.length,
      photoCount: waypoints.length,
      chordM,
      radiusM,
      gsdCm: sensor?.type === 'camera' ? computeGSD(sensor, radiusM) : null,
      heights,
      pathLengthM,
      flightTimeS: speed > 0 ? pathLengthM / speed : null,
    },
  }
}
