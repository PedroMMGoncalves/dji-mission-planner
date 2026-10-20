/**
 * Rumo fixo na grelha (buildAreaExport com fixedHeadingDeg): todos os
 * waypoints, da rota e de cada bloco, com o mesmo rumo em smoothTransition;
 * as acções de foto ficam; sem rumo fixo, nada muda (followWayline).
 */
import { describe, expect, test } from 'vitest'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { buildTemplateKML, buildWaylinesWPML } from '../../src/utils/exporters.js'
import { generateFlightLines } from '../../src/utils/geo.js'
import { M_PER_DEG_LAT } from '../../src/utils/units.js'
import { describeErrors, validateWpml } from '../lib/wpml-conformidade.mjs'
import { wpmlOf } from '../lib/wpml-matriz.mjs'

const lat0 = 40.4
const lon0 = -7.2
const mL = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [lon0 + x / mL, lat0 + y / M_PER_DEG_LAT]
const rect = [em(0, 0), em(300, 0), em(300, 200), em(0, 200)]
const plano = (photoMode) =>
  generateFlightLines(rect, {
    spacingM: 40,
    angleDeg: 90,
    bufferPct: 0,
    photoIntervalM: 20,
    speed: 10,
    photoMode,
  })
const exportar = (plan, extra = {}) =>
  buildAreaExport({
    missionName: 'rumo',
    plan,
    terrainResult: null,
    blocks: null,
    spacingM: 40,
    photoMode: 'distance',
    sensorType: 'camera',
    altitude: 90,
    speed: 10,
    wpml: wpmlOf('M3E', 'M3E_WIDE'),
    photoIntervalM: 20,
    triggerMode: 'distance',
    gimbalPitch: -45,
    ...extra,
  })
const ficheiros = (params) => ({
  template: buildTemplateKML({ createTimeMs: 1760000000000, ...params }),
  waylines: buildWaylinesWPML({ createTimeMs: 1760000000000, ...params }),
})
const rumos = (xml) =>
  [
    ...xml.matchAll(
      /<wpml:waypointHeadingParam>\s*<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>\s*<wpml:waypointHeadingAngle>([^<]+)</g,
    ),
  ].map((m) => `${m[1]}:${m[2]}`)

describe('rumo fixo na grelha', () => {
  test('todos os waypoints com o mesmo rumo, nos dois ficheiros, e passa na especificação', () => {
    const plan = plano('distance')
    const { params } = exportar(plan, { fixedHeadingDeg: 270 })
    const f = ficheiros(params)
    const r = rumos(f.waylines)
    expect(r).toHaveLength(plan.waypoints.length)
    // 270° escreve-se −90 (o WPML pede [−180, 180])
    expect(new Set(r)).toEqual(new Set(['smoothTransition:-90']))
    expect(new Set(rumos(f.template))).toEqual(new Set(['smoothTransition:-90']))
    const { errors } = validateWpml(f)
    expect(errors, describeErrors(errors)).toEqual([])
    // o disparo por distância continua o mesmo
    expect(f.waylines).toContain('multipleDistance')
  })

  test('sem rumo fixo, o de sempre: segue a rota', () => {
    const { params } = exportar(plano('distance'))
    expect(params.perWaypoint ?? null).toBeNull()
    expect(rumos(ficheiros(params).waylines).every((x) => x.startsWith('followWayline'))).toBe(true)
  })

  test('com foto por waypoint, as fotos ficam; por blocos, cada bloco leva o rumo', () => {
    const plan = plano('waypoint')
    const { params } = exportar(plan, {
      photoMode: 'waypoint',
      triggerMode: 'waypoint',
      fixedHeadingDeg: 45,
    })
    const fotos = params.perWaypoint.filter((pw) => pw.actions?.includes('takePhoto'))
    expect(fotos.length).toBe(plan.perWaypoint.filter(Boolean).length)
    expect(params.perWaypoint.every((pw) => pw.heading === 45)).toBe(true)
    const blocks = planBlocks(plan, {
      split: { mode: 'area', maxAreaHa: 2 },
      batteryMin: 20,
      speed: 10,
      spacingM: 40,
    })
    expect(blocks.length).toBeGreaterThan(1)
    const out = exportar(plan, {
      blocks,
      photoMode: 'waypoint',
      triggerMode: 'waypoint',
      fixedHeadingDeg: 45,
    })
    for (const b of out.blocks) {
      expect(b.perWaypoint).toHaveLength(b.waypoints.length)
      expect(b.perWaypoint.every((pw) => pw.heading === 45)).toBe(true)
    }
  })
})
