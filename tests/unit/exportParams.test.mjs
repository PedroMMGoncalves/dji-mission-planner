/**
 * Parâmetros de exportação dos modos fachada, órbita, corredor e inspecção,
 * a partir de planos REAIS dos geradores: o que sai daqui é o que
 * exportWPMLKmz recebe, e tem de passar a fronteira de validação.
 */
import { describe, expect, test } from 'vitest'
import { corridorExportParams, faceExportParams, inspectionExportParams, orbitExportParams } from '../../src/mission/exportParams.js'
import { validateExportParams } from '../../src/utils/exporters.js'
import { generateFacePlan } from '../../src/utils/faceMode.js'
import { generateOrbitPlan } from '../../src/utils/orbit.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { resolveSensor } from '../../src/utils/geo.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const wpml = { droneEnumValue: 77, payloadEnumValue: 66, payloadPositionIndex: 0 }
const comum = { missionName: 'Quinta do Lago', wpml, sensorType: 'camera' }

describe('faceExportParams', () => {
  const plan = generateFacePlan([[-9.14, 38.7], [-9.139, 38.7]], {
    sensor, faceHeightM: 30, standoffM: 12, side: 'left', verticalOverlapPct: 70, horizontalOverlapPct: 70, gimbalPitch: 0, speed: 3,
  })
  test('uma foto por waypoint, altitude = passagem mais alta, passa a validação', () => {
    const p = faceExportParams({ ...comum, plan, speed: 3, gimbalPitch: 0 })
    expect(p.name).toBe(`Quinta-do-Lago_face_p1-${plan.stats.passCount}`)
    expect(p.altitude).toBe(Math.round(plan.stats.heights.at(-1)))
    expect(p.photoIntervalM).toBe(0)
    expect(p.perWaypoint).toBe(plan.perWaypoint)
    expect(validateExportParams(p)).toBe(p)
  })
})

describe('orbitExportParams', () => {
  const plan = generateOrbitPlan([-9.14, 38.7], {
    sensor, radiusM: 40, levels: { count: 2, startM: 20, stepM: 15 }, horizontalOverlapPct: 70, poiHeightM: 10, clockwise: true, speed: 3,
  })
  test('voo curvo do plano, pitch do primeiro nível, passa a validação', () => {
    const p = orbitExportParams({ ...comum, plan, speed: 3 })
    expect(p.name).toBe('Quinta-do-Lago_orbit_n2')
    expect(p.turnMode).toBe(plan.turnMode)
    expect(p.gimbalPitch).toBe(plan.perLevel[0].gimbalPitch)
    expect(validateExportParams(p)).toBe(p)
  })
})

describe('corridorExportParams', () => {
  const axis = [[-9.14, 38.7], [-9.13, 38.7], [-9.125, 38.7035]]
  const opts = { sensor, altitude: 100, bufferM: 150, sideOverlapPct: 70, photoIntervalM: 20, speed: 8 }

  test('modo distância: gatilho por distância, intervalos por troço, sem perWaypoint', () => {
    const plan = generateCorridorPlan(axis, opts)
    const p = corridorExportParams({ ...comum, plan, photoMode: 'distance', altitude: 100, speed: 8, photoIntervalM: 20 })
    expect(p.name).toBe(`Quinta-do-Lago_corridor_n${plan.stats.passCount}`)
    expect(p.photoIntervalM).toBe(20)
    expect(p.triggerMode).toBe('distance')
    expect(p.perWaypoint).toBeUndefined()
    expect(p.triggerRanges.length).toBeGreaterThanOrEqual(1)
    expect(p.triggerRanges.at(-1)[1]).toBe(plan.waypoints.length - 1)
    expect(validateExportParams(p)).toBe(p)
  })

  test('modo waypoint: sem gatilho por distância, fotos nas acções, sem intervalos', () => {
    const plan = generateCorridorPlan(axis, { ...opts, photoMode: 'waypoint' })
    const p = corridorExportParams({ ...comum, plan, photoMode: 'waypoint', altitude: 100, speed: 8, photoIntervalM: 20 })
    expect(p.photoIntervalM).toBe(0)
    expect(p.triggerMode).toBe('waypoint')
    expect(p.triggerRanges).toBeNull()
    expect(p.perWaypoint).toBe(plan.perWaypoint)
    expect(validateExportParams(p)).toBe(p)
  })
})

describe('inspectionExportParams', () => {
  test('um waypoint por ponto, rumo e pitch por ponto, passa a validação', () => {
    const points = [
      { id: 'a', point: [-9.14, 38.7], heading: 45, gimbalPitch: -30, heightM: 40 },
      { id: 'b', point: [-9.139, 38.7], heading: 270, gimbalPitch: -60, heightM: 50 },
    ]
    const p = inspectionExportParams({ ...comum, points, altitude: 60, speed: 5, gimbalPitch: -45 })
    expect(p.name).toBe('Quinta-do-Lago_inspect_n2')
    expect(p.waypoints).toHaveLength(2)
    expect(p.perWaypoint).toHaveLength(2)
    expect(p.waypoints[1][2]).toBe(50)
    expect(p.perWaypoint[0]).toEqual({ heading: 45, gimbalPitch: -30, actions: ['takePhoto'] })
    expect(p.photoIntervalM).toBe(0)
    expect(validateExportParams(p)).toBe(p)
  })
})
