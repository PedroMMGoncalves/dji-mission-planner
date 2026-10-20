/**
 * Seguir terreno com foto por waypoint (src/mission/terrainFollow.js,
 * mergePhotoWaypoints): os pontos de foto do plano entram na rota do relevo
 * com a altura do perfil voado, a acção segue o ponto, os vértices do relevo
 * ficam, e os blocos e a exportação levam as acções certas.
 */
import { describe, expect, test } from 'vitest'
import { generateFlightLines } from '../../src/utils/geo.js'
import { planTerrainFollow } from '../../src/mission/terrainFollow.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { buildTemplateKML, buildWaylinesWPML } from '../../src/utils/exporters.js'
import { validateWpml, describeErrors } from '../lib/wpml-conformidade.mjs'
import { wpmlOf } from '../lib/wpml-matriz.mjs'
import { M_PER_DEG_LAT } from '../../src/utils/units.js'

const lat0 = 40.4
const lon0 = -7.2
const mL = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [lon0 + x / mL, lat0 + y / M_PER_DEG_LAT]
const rect = [em(0, 0), em(300, 0), em(300, 200), em(0, 200)]
// rampa para Norte: 0,1 m por metro; relevo «fino» para a densificação ser curta
const relevo = {
  elevationAt: (lon, lat) => 200 + (lat - lat0) * M_PER_DEG_LAT * 0.1,
  resolutionM: 10,
}
const AGL = 90
const plano = () =>
  generateFlightLines(rect, {
    spacingM: 40,
    angleDeg: 90,
    bufferPct: 0,
    photoIntervalM: 20,
    speed: 10,
    overshootM: 15,
    photoMode: 'waypoint',
  })
const fotos = (pw) => (pw ?? []).filter((e) => e?.actions?.includes('takePhoto'))

describe('seguir terreno com foto por waypoint', () => {
  test('os pontos de foto ficam na rota do relevo, com a altura do perfil, e a acção segue o ponto', () => {
    const plan = plano()
    const nFotos = fotos(plan.perWaypoint).length
    expect(nFotos).toBeGreaterThan(20)
    const tf = planTerrainFollow(relevo, plan, { refElev: 200, agl: AGL, toleranceM: 5 })
    expect(tf.error).toBeUndefined()
    expect(fotos(tf.perWaypoint)).toHaveLength(nFotos)
    expect(tf.perLine.reduce((a, b) => a + b, 0)).toBe(tf.waypoints.length)
    // cada foto do plano está na rota do relevo, no mesmo sítio, à altura
    // AGL sobre o relevo mais a subida do corredor lateral (±30 m: na rampa
    // de 0,1 m/m o lado de cima está 3 m acima do eixo); o perfil é linear
    const planFotos = plan.waypoints.filter((_, i) => plan.perWaypoint[i])
    const tfFotos = tf.waypoints.filter((_, i) => tf.perWaypoint[i])
    expect(tfFotos).toHaveLength(planFotos.length)
    tfFotos.forEach((w, k) => {
      expect(w[0]).toBeCloseTo(planFotos[k][0], 7)
      expect(w[1]).toBeCloseTo(planFotos[k][1], 7)
      const esperado = AGL + relevo.elevationAt(w[0], w[1]) + 30 * 0.1 - 200
      expect(Math.abs(w[2] - esperado)).toBeLessThan(0.2)
    })
    // os vértices do relevo (extremos das faixas, ao menos) continuam lá
    expect(tf.waypoints.length).toBeGreaterThanOrEqual(plan.waypoints.length)
    // sem foto por waypoint não há fusão nenhuma
    const semFotos = planTerrainFollow(
      relevo,
      { ...plan, perLine: null, perWaypoint: null },
      {
        refElev: 200,
        agl: AGL,
      },
    )
    expect(semFotos.perWaypoint).toBeUndefined()
  })

  test('por blocos: cada bloco leva as suas acções, com índices locais', () => {
    const plan = plano()
    const blocks = planBlocks(plan, {
      split: { mode: 'area', maxAreaHa: 2 },
      batteryMin: 20,
      speed: 10,
      spacingM: 40,
    })
    expect(blocks.length).toBeGreaterThan(1)
    const tf = planTerrainFollow(relevo, plan, { blocks, refElev: 200, agl: AGL })
    const total = tf.blocks3.reduce((n, b) => n + fotos(b.perWaypoint).length, 0)
    expect(total).toBe(fotos(plan.perWaypoint).length)
    for (const b of tf.blocks3) {
      expect(b.perLine.reduce((a, c) => a + c, 0)).toBe(b.waypoints.length)
      const idx = Object.keys(b.perWaypoint ?? {}).map(Number)
      expect(idx.every((i) => i >= 0 && i < b.waypoints.length)).toBe(true)
    }
  })

  test('a exportação escreve uma acção de foto por ponto de foto, com alturas do relevo, e passa na especificação', () => {
    const plan = plano()
    const tf = planTerrainFollow(relevo, plan, { refElev: 200, agl: AGL })
    const { params, blocks } = buildAreaExport({
      missionName: 'tfwp',
      plan,
      terrainResult: tf,
      blocks: null,
      spacingM: 40,
      photoMode: 'waypoint',
      sensorType: 'camera',
      altitude: AGL,
      speed: 10,
      wpml: wpmlOf('M3E', 'M3E_WIDE'),
      photoIntervalM: 20,
      triggerMode: 'waypoint',
      gimbalPitch: -90,
    })
    expect(blocks).toBeNull()
    expect(params.name).toMatch(/-tf$/)
    expect(params.waypoints).toBe(tf.waypoints)
    expect(fotos(params.perWaypoint)).toHaveLength(fotos(plan.perWaypoint).length)
    const files = {
      template: buildTemplateKML({ createTimeMs: 1760000000000, ...params }),
      waylines: buildWaylinesWPML({ createTimeMs: 1760000000000, ...params }),
    }
    const { errors } = validateWpml(files)
    expect(errors, describeErrors(errors)).toEqual([])
    const tiros = (files.waylines.match(/<wpml:actionActuatorFunc>takePhoto</g) ?? []).length
    expect(tiros).toBe(fotos(plan.perWaypoint).length)
    const alturas = [...files.waylines.matchAll(/<wpml:executeHeight>([^<]+)</g)].map((m) => +m[1])
    expect(Math.max(...alturas) - Math.min(...alturas)).toBeGreaterThan(5)
  })
})
