/**
 * Várias inclinações (com paragem), na órbita e na face: em cada ponto a
 * aeronave pára e tira uma foto por inclinação (gimbalRotate e takePhoto
 * por ângulo, a espera depois da primeira rotação); as inclinações por
 * omissão são −45°, 0° e o limite de cima do gimbal menos 5°.
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { faceExportParams, orbitExportParams } from '../../src/mission/exportParams.js'
import { MAX_SHOTS, SHOT_TIME_S, shotPitches } from '../../src/mission/gimbal.js'
import {
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'
import { generateFacePlan, normalizeFaceConfig } from '../../src/utils/faceMode.js'
import { resolveSensor } from '../../src/utils/geo.js'
import { generateOrbitPlan, normalizeOrbitConfig } from '../../src/utils/orbit.js'
import { describeErrors, validateWpml } from '../lib/wpml-conformidade.mjs'
import { wpmlOf } from '../lib/wpml-matriz.mjs'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const ficheiros = (params) => ({
  template: buildTemplateKML({ createTimeMs: 1760000000000, ...params }),
  waylines: buildWaylinesWPML({ createTimeMs: 1760000000000, ...params }),
})
/** As acções de cada grupo por waypoint, pela ordem (só os grupos em reachPoint). */
const acoesPorPonto = (xml) =>
  [...xml.matchAll(/<wpml:actionGroup>([\s\S]*?)<\/wpml:actionGroup>/g)]
    .map((m) => m[1])
    .filter((g) => /<wpml:actionTriggerType>reachPoint</.test(g))
    .map((g) =>
      [
        ...g.matchAll(
          /<wpml:actionActuatorFunc>(\w+)<\/wpml:actionActuatorFunc>\s*<wpml:actionActuatorFuncParam>([\s\S]*?)<\/wpml:actionActuatorFuncParam>/g,
        ),
      ].map(([, f, p]) =>
        f === 'gimbalRotate'
          ? `g${/<wpml:gimbalPitchRotateAngle>([-\d.]+)</.exec(p)[1]}`
          : f === 'hover'
            ? `h${/<wpml:hoverTime>([\d.]+)</.exec(p)[1]}`
            : f,
      ),
    )

describe('inclinações por omissão e escritas', () => {
  test('por omissão −45°, 0° e o limite de cima menos 5° (M3E e M4T 30°, P1 25°)', () => {
    expect(shotPitches(null, PAYLOADS.M3E_WIDE.gimbalPitch)).toEqual([-45, 0, 30])
    expect(shotPitches(null, PAYLOADS.M4T_WIDE.gimbalPitch)).toEqual([-45, 0, 30])
    expect(shotPitches(null, PAYLOADS.P1.gimbalPitch)).toEqual([-45, 0, 25])
  })
  test('escritas: recortadas ao gimbal (cima menos 5°), ao grau, sem repetidas, no máximo 5', () => {
    const r = PAYLOADS.M3E_WIDE.gimbalPitch
    expect(shotPitches([45, -100, 0.4, 0], r)).toEqual([30, -90, 0])
    expect(shotPitches([-90, -60, -30, 0, 15, 30], r)).toHaveLength(MAX_SHOTS)
    expect(shotPitches([Number.NaN, 'x'], r)).toEqual([-45, 0, 30])
  })
  test('configuração gravada: lixo cai na omissão', () => {
    expect(
      normalizeOrbitConfig({ capture: 'multi', multiPitches: [-45, 0, 30], hoverS: 2 }),
    ).toMatchObject({ capture: 'multi', multiPitches: [-45, 0, 30], hoverS: 2 })
    expect(normalizeOrbitConfig({ multiPitches: 'x', hoverS: -3 })).toMatchObject({
      multiPitches: null,
      hoverS: 0,
    })
    expect(normalizeFaceConfig({ capture: 'multi', multiPitches: [10] })).toMatchObject({
      capture: 'multi',
      multiPitches: [10],
    })
    expect(normalizeFaceConfig({ capture: 'outra' }).capture).toBe('single')
  })
})

describe('órbita com várias inclinações', () => {
  const shots = shotPitches(null, PAYLOADS.M3E_WIDE.gimbalPitch)
  const orb = (extra) =>
    generateOrbitPlan(em(0, 0), {
      sensor,
      radiusM: 40,
      levels: { count: 2, startM: 20, stepM: 10 },
      speed: 3,
      ...extra,
    })
  const multi = orb({ capture: 'multi', shots, hoverS: 2 })
  const foto = orb({})

  test('a mesma geometria dos anéis, com paragem em cada ponto', () => {
    expect(multi.waypoints).toEqual(foto.waypoints)
    expect(multi.turnMode).toBe('toPointAndStopWithDiscontinuityCurvature')
    expect(foto.turnMode).toBe('toPointAndPassWithContinuityCurvature')
  })
  test('três fotos por ponto e o tempo das paragens, da espera e de cada inclinação', () => {
    const n = multi.waypoints.length
    expect(multi.stats.photoCount).toBe(3 * n)
    expect(multi.stats.shotsPerPoint).toBe(3)
    expect(multi.stats.flightTimeS).toBeCloseTo(
      foto.stats.flightTimeS + n * (2 + 2 + SHOT_TIME_S * 3),
      6,
    )
  })
  test('no KMZ: gimbal, espera, foto; gimbal, foto; gimbal, foto, em cada ponto', () => {
    const params = orbitExportParams({
      missionName: 'm',
      plan: multi,
      speed: 3,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      sensorType: 'camera',
    })
    validateExportParams(params)
    const f = ficheiros(params)
    const { errors } = validateWpml(f)
    expect(errors, describeErrors(errors)).toEqual([])
    // o grupo global do waypoint 0 põe o gimbal na primeira inclinação; o
    // primeiro ponto já não roda para ela
    const [global, ...grupos] = acoesPorPonto(f.waylines)
    expect(global).toEqual(['g-45'])
    expect(grupos).toHaveLength(multi.waypoints.length)
    expect(grupos[0]).toEqual(['h2', 'takePhoto', 'g0', 'takePhoto', 'g30', 'takePhoto'])
    for (const g of grupos.slice(1))
      expect(g).toEqual(['g-45', 'h2', 'takePhoto', 'g0', 'takePhoto', 'g30', 'takePhoto'])
    expect(f.waylines).toMatch(/toPointAndStopWithDiscontinuityCurvature/)
  })
  test('sem câmara: nem fotos nem inclinações', () => {
    const sem = orb({ capture: 'multi', shots, sensor: null })
    expect(sem.stats.photoCount).toBe(0)
    expect(sem.perWaypoint.some((w) => w.shots || w.actions.length)).toBe(false)
  })
})

describe('face com várias inclinações', () => {
  const shots = shotPitches([-30, 0, 30], PAYLOADS.M3E_WIDE.gimbalPitch)
  const face = (extra) =>
    generateFacePlan([em(0, 0), em(80, 0)], {
      sensor,
      faceHeightM: 20,
      standoffM: 25,
      side: 'left',
      gimbalPitch: 0,
      speed: 3,
      ...extra,
    })
  const um = face({ hoverS: 1 })
  const tres = face({ hoverS: 1, shots })

  test('as mesmas posições, três fotos por ponto e o tempo de cada inclinação', () => {
    expect(tres.waypoints).toEqual(um.waypoints)
    const n = tres.waypoints.length
    expect(tres.stats.photoCount).toBe(3 * n)
    expect(tres.stats.flightTimeS).toBeCloseTo(um.stats.flightTimeS + n * SHOT_TIME_S * 3, 6)
  })
  test('no KMZ: a sequência de cada ponto, e o ficheiro na especificação', () => {
    const params = faceExportParams({
      missionName: 'm',
      plan: tres,
      speed: 3,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      gimbalPitch: 0,
      sensorType: 'camera',
    })
    const f = ficheiros(params)
    const { errors } = validateWpml(f)
    expect(errors, describeErrors(errors)).toEqual([])
    const [, ...grupos] = acoesPorPonto(f.waylines)
    expect(grupos).toHaveLength(tres.waypoints.length)
    for (const g of grupos.slice(1))
      expect(g).toEqual(['g-30', 'h1', 'takePhoto', 'g0', 'takePhoto', 'g30', 'takePhoto'])
  })
  test('ângulos fora do intervalo do exportador são recusados', () => {
    const params = faceExportParams({
      missionName: 'm',
      plan: { ...tres, perWaypoint: tres.perWaypoint.map((p) => ({ ...p, shots: [0, 200] })) },
      speed: 3,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      gimbalPitch: 0,
      sensorType: 'camera',
    })
    expect(() => validateExportParams(params)).toThrow(/shots/)
  })
})
