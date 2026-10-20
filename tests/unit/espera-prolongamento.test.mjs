/**
 * Espera em cada foto (acção hover do WPML) na face e nos pontos de
 * inspecção, e prolongamento nas pontas da face (meia largura de imagem,
 * como o M2-E12 no corredor).
 */
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { faceExportParams, inspectionExportParams } from '../../src/mission/exportParams.js'
import {
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'
import {
  DEFAULT_FACE_CONFIG,
  generateFacePlan,
  normalizeFaceConfig,
} from '../../src/utils/faceMode.js'
import { computeFootprint, resolveSensor } from '../../src/utils/geo.js'
import { inspectionToWaypoints } from '../../src/utils/inspect.js'
import { describeErrors, validateWpml } from '../lib/wpml-conformidade.mjs'
import { wpmlOf } from '../lib/wpml-matriz.mjs'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const face = (extra) =>
  generateFacePlan([em(0, 0), em(80, 0)], {
    sensor,
    faceHeightM: 20,
    standoffM: 25,
    side: 'left',
    verticalOverlapPct: 70,
    horizontalOverlapPct: 70,
    gimbalPitch: 0,
    speed: 3,
    ...extra,
  })
const ficheiros = (params) => ({
  template: buildTemplateKML({ createTimeMs: 1760000000000, ...params }),
  waylines: buildWaylinesWPML({ createTimeMs: 1760000000000, ...params }),
})

describe('prolongamento nas pontas da face', () => {
  test('meia largura de imagem para lá de cada ponta, na direcção da face', () => {
    const sem = face({ extendEnds: false })
    const com = face({ extendEnds: true })
    const meia = computeFootprint(sensor, 25).across / 2
    expect(com.stats.endExtensionM).toBeCloseTo(meia, 6)
    expect(sem.stats.endExtensionM).toBe(0)
    const comp = (p) => turf.length(turf.lineString(p.offsetLine), { units: 'meters' })
    expect(comp(com) - comp(sem)).toBeCloseTo(2 * meia, 0)
    // a primeira foto fica meia imagem antes da ponta da face (x = 0)
    const x0 = (com.waypoints[0][0] + 9.14) * mLon
    expect(x0).toBeCloseTo(-meia, 0)
    // e todas continuam a olhar para a face, ao mesmo afastamento
    for (const w of com.waypoints) expect(Math.abs((w[1] - lat0) * 110574 - 25)).toBeLessThan(0.5)
  })

  test('ligado por omissão nos projectos, e o projecto pode desligá-lo', () => {
    expect(DEFAULT_FACE_CONFIG.extendEnds).toBe(true)
    expect(normalizeFaceConfig({}).extendEnds).toBe(true)
    expect(normalizeFaceConfig({ extendEnds: false }).extendEnds).toBe(false)
    expect(normalizeFaceConfig({ hoverS: 99 }).hoverS).toBe(60)
    expect(normalizeFaceConfig({ hoverS: -1 }).hoverS).toBe(0)
  })
})

describe('espera em cada foto (hover)', () => {
  test('na face: hover antes do disparo, o tempo conta a espera, e passa na especificação', () => {
    const sem = face({})
    const com = face({ hoverS: 2 })
    expect(com.waypoints).toEqual(sem.waypoints)
    expect(com.perWaypoint.every((pw) => pw.hoverS === 2)).toBe(true)
    expect(com.stats.flightTimeS - sem.stats.flightTimeS).toBeCloseTo(2 * com.waypoints.length, 6)
    const params = faceExportParams({
      missionName: 'face',
      plan: com,
      speed: 3,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      gimbalPitch: 0,
      sensorType: 'camera',
    })
    expect(() => validateExportParams(params)).not.toThrow()
    const f = ficheiros(params)
    const { errors } = validateWpml(f)
    expect(errors, describeErrors(errors)).toEqual([])
    const esperas = f.waylines.match(/<wpml:hoverTime>2<\/wpml:hoverTime>/g) ?? []
    expect(esperas).toHaveLength(com.waypoints.length)
    // a espera vem antes da foto no mesmo grupo
    const grupos = f.waylines.match(/<wpml:actionGroup>[\s\S]*?<\/wpml:actionGroup>/g) ?? []
    const grupo = grupos.find((g) => g.includes('>hover<'))
    expect(grupo).toBeDefined()
    expect(grupo.indexOf('>hover<')).toBeGreaterThan(-1)
    expect(grupo.indexOf('>hover<')).toBeLessThan(grupo.indexOf('>takePhoto<'))
    // sem espera, nenhuma acção hover
    const semF = ficheiros({ ...params, perWaypoint: sem.perWaypoint })
    expect(semF.waylines).not.toContain('hover')
  })

  test('nos pontos de inspecção: por ponto, só onde foi pedida', () => {
    const pts = [
      { id: 1, point: em(0, 0), heightM: 30, hoverS: 3 },
      { id: 2, point: em(50, 0), heightM: 30 },
      { id: 3, point: em(100, 0), heightM: 30, hoverS: null },
    ]
    const { perWaypoint } = inspectionToWaypoints(pts)
    expect(perWaypoint.map((pw) => pw.hoverS ?? 0)).toEqual([3, 0, 0])
    const params = inspectionExportParams({
      missionName: 'insp',
      points: pts,
      altitude: 30,
      speed: 5,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      gimbalPitch: -30,
      sensorType: 'camera',
    })
    const f = ficheiros(params)
    const { errors } = validateWpml(f)
    expect(errors, describeErrors(errors)).toEqual([])
    expect(f.waylines.match(/<wpml:hoverTime>3<\/wpml:hoverTime>/g)).toHaveLength(1)
  })

  test('uma espera negativa ou não numérica é recusada na exportação', () => {
    const base = inspectionExportParams({
      missionName: 'insp',
      points: [
        { id: 1, point: em(0, 0), heightM: 30 },
        { id: 2, point: em(50, 0), heightM: 30 },
      ],
      altitude: 30,
      speed: 5,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      gimbalPitch: -30,
      sensorType: 'camera',
    })
    const pw = (h) => [{ hoverS: h, actions: ['takePhoto'] }, null]
    expect(() => validateExportParams({ ...base, perWaypoint: pw(-1) })).toThrow()
    expect(() => validateExportParams({ ...base, perWaypoint: pw('2') })).toThrow()
    expect(() => validateExportParams({ ...base, perWaypoint: pw(2) })).not.toThrow()
  })
})
