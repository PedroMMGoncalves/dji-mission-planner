/**
 * Descolagem da face e da órbita numa base (src/mission/takeoffRef.js): as
 * alturas do plano (acima do chão do alvo) passam a relativas à base pela
 * diferença de cotas; sem base, como sempre; base que não se mede, bloqueio.
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { activeRoute } from '../../src/mission/activeRoute.js'
import { faceExportParams } from '../../src/mission/exportParams.js'
import { preflightPlan } from '../../src/mission/preflight.js'
import { planForTakeoff, shiftHeights, takeoffReference } from '../../src/mission/takeoffRef.js'
import { buildWaylinesWPML } from '../../src/utils/exporters.js'
import { generateFacePlan, normalizeFaceConfig } from '../../src/utils/faceMode.js'
import { resolveSensor } from '../../src/utils/geo.js'
import { normalizeOrbitConfig } from '../../src/utils/orbit.js'
import { wpmlOf } from '../lib/wpml-matriz.mjs'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
// relevo: sobe 0,1 m por metro para leste, cota 200 em x = 0
const elevationAt = (lon) => 200 + 0.1 * (lon + 9.14) * mLon
const bases = [{ id: 'b1', label: 'A', point: em(-300, 0), radiusM: null }]
const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const face = generateFacePlan([em(0, 0), em(60, 0)], {
  sensor,
  faceHeightM: 20,
  standoffM: 25,
  side: 'left',
  verticalOverlapPct: 70,
  horizontalOverlapPct: 70,
  gimbalPitch: 0,
})

describe('descolagem numa base: alturas relativas à base', () => {
  test('no chão do alvo, como sempre: sem diferença, a cota do alvo', () => {
    const r = takeoffReference({ baseId: null, bases, targetPoint: em(0, 0), elevationAt })
    expect(r).toMatchObject({ mode: 'target', dh: 0 })
    expect(r.refElev).toBeCloseTo(200, 6)
    expect(planForTakeoff(face, r)).toBe(face)
  })

  test('numa base 30 m abaixo do pé da face: as alturas sobem 30 m', () => {
    const r = takeoffReference({ baseId: 'b1', bases, targetPoint: em(0, 0), elevationAt })
    expect(r.mode).toBe('base')
    expect(r.error).toBeUndefined()
    expect(r.baseElev).toBeCloseTo(170, 6)
    expect(r.dh).toBeCloseTo(30, 6)
    const p = planForTakeoff(face, r)
    p.waypoints.forEach((w, i) => expect(w[2]).toBeCloseTo(face.waypoints[i][2] + 30, 1))
    expect(p.stats.heights[0]).toBeCloseTo(face.stats.heights[0] + 30, 1)
    // o ficheiro leva as alturas convertidas
    const xml = buildWaylinesWPML(
      faceExportParams({
        missionName: 'f',
        plan: p,
        speed: 3,
        wpml: wpmlOf('M3E', 'M3E_WIDE'),
        gimbalPitch: 0,
        sensorType: 'camera',
      }),
    )
    const h = [...xml.matchAll(/<wpml:executeHeight>([^<]+)</g)].map((m) => Number(m[1]))
    expect(Math.min(...h)).toBeCloseTo(Math.min(...face.waypoints.map((w) => w[2])) + 30, 1)
    // a vista 3D: as mesmas alturas absolutas, sobre a cota da base
    const v = activeRoute({
      missionMode: 'face',
      elevationAt,
      facePlan: face,
      faceBaseline: [em(0, 0)],
      faceTakeoff: r,
      altitude: 100,
    })
    expect(v.refElev).toBeCloseTo(170, 6)
    expect(v.waypoints[0][2] + v.refElev).toBeCloseTo(face.waypoints[0][2] + 200, 1)
  })

  test('base que não existe, sem relevo, ou fora do relevo: erro e bloqueio', () => {
    expect(
      takeoffReference({ baseId: 'zz', bases, targetPoint: em(0, 0), elevationAt }).error,
    ).toBe('base-missing')
    expect(takeoffReference({ baseId: 'b1', bases, targetPoint: em(0, 0) }).error).toBe(
      'terrain-missing',
    )
    const fora = takeoffReference({
      baseId: 'b1',
      bases,
      targetPoint: em(0, 0),
      elevationAt: (lon) => (lon < -9.141 ? null : 200),
    })
    expect(fora.error).toBe('ref-outside-terrain')
    // com erro, o plano não é convertido e o preflight bloqueia
    expect(planForTakeoff(face, fora)).toBe(face)
    const items = preflightPlan({ plan: face, takeoffRef: fora })
    expect(items.find((i) => i.code === 'takeoff-ref-outside-terrain')).toMatchObject({
      level: 'block',
      params: { base: 'A' },
    })
  })

  test('alturas: somar e arredondar ao decímetro; projectos guardam a base escolhida', () => {
    expect(shiftHeights([[0, 0, 10]], 2.34)).toEqual([[0, 0, 12.3]])
    expect(shiftHeights([[0, 0, 10]], 0)).toEqual([[0, 0, 10]])
    expect(normalizeFaceConfig({ takeoffBaseId: 'b1' }).takeoffBaseId).toBe('b1')
    expect(normalizeFaceConfig({ takeoffBaseId: 3 }).takeoffBaseId).toBeNull()
    expect(normalizeOrbitConfig({ takeoffBaseId: 'b2' }).takeoffBaseId).toBe('b2')
    expect(normalizeOrbitConfig({}).takeoffBaseId).toBeNull()
  })
})
