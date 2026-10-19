/*
 * Pacote M-B da revisao da matematica (docs/REVISAO-MATEMATICA-2026-10.md):
 * os numeros que mentiam — transito e VLOS da rota unica, baterias com
 * blocos e transito, tecto AGL, zona em encosta, margem das faixas com
 * celulas, ligacoes nos concavos, vertice reentrante, folga a resolucao do
 * relevo, bloco de uma faixa, folga vertical da fachada.
 */
import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS, aglCapWarning } from '../../src/data/drones.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { blockRing } from '../../src/mission/baseLayout.js'
import { preflightArea, preflightPlan } from '../../src/mission/preflight.js'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import { assignBlocksToBases, computeTakeoffZone } from '../../src/mission/takeoffZones.js'
import { checkFaceClearance, generateFacePlan } from '../../src/utils/faceMode.js'
import {
  aggregatePlans,
  generateFlightPlan,
  resolveSensor,
  splitIntoBlocks,
} from '../../src/utils/geo.js'
import { terrainFollowLines } from '../../src/utils/terrain.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lat0 = 38.7
const lon0 = -9.14
const mLon = metersPerDegLon(lat0)
const em = (x, y, z) =>
  z == null
    ? [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
    : [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT, z]
const xOf = (p) => (p[0] - lon0) * mLon
const yOf = (p) => (p[1] - lat0) * M_PER_DEG_LAT
const opts = {
  spacingM: 40,
  angleDeg: 90,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 8,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
}

describe('M2-G2: com celulas as faixas sao as do plano unico', () => {
  test('cada faixa de cada celula coincide com uma faixa do plano unico (margem <= s/2)', () => {
    const ring = [em(0, 0), em(1730, 0), em(1730, 1350), em(0, 1350)]
    const o = { ...opts, spacingM: 42.5 }
    const unico = generateFlightPlan(ring, o)
    const mosaic = buildSquareMosaic(ring, {
      sideM: 500,
      orientationDeg: mosaicOrientationForLines(90),
    })
    const cells = mosaic.cells.map((c) => c.ring)
    const porCelulas = planArea(ring, cells, o)
    const latsUnico = unico.lines.map((l) => l[0][1])
    for (const l of porCelulas.lines) {
      const lat = l[0][1]
      const dM = Math.min(...latsUnico.map((u) => Math.abs(u - lat) * M_PER_DEG_LAT))
      expect(dM).toBeLessThan(0.5)
    }
    // a faixa exterior fica a menos de s/2 (+ recuo) do contorno
    const yMin = Math.min(...porCelulas.lines.map((l) => yOf(l[0])))
    const yMax = Math.max(...porCelulas.lines.map((l) => yOf(l[0])))
    expect(yMin).toBeLessThanOrEqual(42.5 / 2 + 0.5)
    expect(1350 - yMax).toBeLessThanOrEqual(42.5 / 2 + 0.5)
  })
})

describe('M2-G3: num concavo as ligacoes entre celulas ficam dentro da area', () => {
  // U de 600 x 600 com um vao de 200 x 400 aberto para norte
  const U = [
    em(0, 0),
    em(600, 0),
    em(600, 600),
    em(400, 600),
    em(400, 200),
    em(200, 200),
    em(200, 600),
    em(0, 600),
  ]
  const poly = turf.buffer(turf.polygon([[...U, U[0]]]), 1, { units: 'meters' })
  const foraDaArea = (plan) => {
    let fora = 0
    const w = plan.waypoints
    // as ligacoes sao os trocos entre o fim de uma faixa e o inicio da seguinte
    for (let i = 1; i + 1 < w.length; i += 2) {
      const a = w[i]
      const b = w[i + 1]
      for (let k = 1; k <= 5; k++) {
        const t = k / 6
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        if (!turf.booleanPointInPolygon(turf.point(p), poly)) fora += 1
      }
    }
    return fora
  }
  for (const s of [40, 50])
    for (const angle of [0, 90, 180, 270])
      test(`s = ${s} m, faixas a ${angle} graus: nenhuma amostra de ligacao fora do U`, () => {
        const plan = generateFlightPlan(U, { ...opts, spacingM: s, angleDeg: angle })
        expect(plan.error).toBeUndefined()
        expect(foraDaArea(plan)).toBe(0)
      })
})

describe('M2-G4: uma linha que passe num vertice reentrante nao perde a fila', () => {
  test('rectangulo com entalhe em V ate meia altura: a fila do vertice cobre os dois lados', () => {
    const ring = [
      em(0, 0),
      em(600, 0),
      em(600, 400),
      em(350, 400),
      em(300, 200),
      em(250, 400),
      em(0, 400),
    ]
    const plan = generateFlightPlan(ring, { ...opts, spacingM: 50 })
    // 9 linhas de 0 a 400: a de y = 200 passa exactamente no vertice (300, 200)
    const fila = plan.lines.filter((l) => Math.abs(yOf(l[0]) - 200) < 0.01)
    expect(fila.length).toBe(2)
    const total = fila.reduce((s, l) => s + Math.abs(xOf(l[1]) - xOf(l[0])), 0)
    expect(total).toBeGreaterThan(599)
  })
})

describe('M2-T5: um bloco de uma so faixa tem base', () => {
  test('a cauda do corte por area (uma faixa) e atribuida a uma base', () => {
    // 5 faixas de 1000 m (5 ha cada) com 12 ha por bloco: 2 + 2 + 1 (210 m
    // de altura, para nenhuma faixa cair exactamente sobre o contorno)
    const ring = [em(0, 0), em(1000, 0), em(1000, 210), em(0, 210)]
    const plan = generateFlightPlan(ring, { ...opts, spacingM: 50 })
    const blocks = splitIntoBlocks(plan, { mode: 'area', maxAreaHa: 12, speed: 8, spacingM: 50 })
    expect(blocks.map((b) => b.lines.length)).toEqual([2, 2, 1])
    const cauda = blocks[2]
    expect(blockRing(cauda).length).toBe(2)
    const bases = [{ id: 'b1', label: 'A', point: em(-50, 100), radiusM: null }]
    const out = assignBlocksToBases(
      blocks.map((b, i) => ({ id: i + 1, ring: blockRing(b) })),
      bases,
      { vlosM: 2000 },
    )
    expect(out[3]?.baseId).toBe('b1')
    expect(out[3].worstVlosM).toBeGreaterThan(1000)
  })
})

describe('M2-E4: a folga vertical da fachada em solo plano nao e alarme', () => {
  test('plano por omissao (M3E, 25 m) sobre um DSM plano: ok', () => {
    const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
    const plan = generateFacePlan([em(0, 0), em(60, 0)], { sensor, faceHeightM: 30, standoffM: 25 })
    const r = checkFaceClearance(plan, () => 0, { footElevM: 0, minClearanceM: 15 })
    expect(r.ok).toBe(true)
    expect(r.passes).toEqual([])
    expect(plan.stats.heights[0]).toBeLessThan(15)
    // solo a subir 2 m acima do pe debaixo da primeira passagem: marcada
    const sobe = checkFaceClearance(plan, () => plan.stats.heights[0] - 0.2, {
      footElevM: 0,
      minClearanceM: 15,
    })
    expect(sobe.passes).toContain(1)
  })
})

describe('M2-T7: zona em encosta diz quanto baixa o voo', () => {
  const base = em(0, 0)
  const encosta = (deg) => (lon) => xOf([lon, lat0]) * Math.tan((deg * Math.PI) / 180)
  test('10 graus: raio reduzido e descolar ate 100 m baixa o voo ~14 m', () => {
    const z = computeTakeoffZone(base, { elevationAt: encosta(10), radiusM: 100, maxReliefM: 10 })
    expect(z.reduced).toBe(true)
    expect(z.radiusM).toBeLessThanOrEqual(30)
    expect(z.cause.belowM).toBeGreaterThan(12)
    expect(z.cause.belowM).toBeLessThan(18)
    const items = preflightArea({
      plan: { waypoints: [[0, 0]], stats: {} },
      refZone: { label: 'A', zone: z },
    })
    const it = items.find((i) => i.code === 'base-zone-drop')
    expect(it?.level).toBe('warn')
    expect(it.params.drop).toBeGreaterThan(12)
  })
  test('corta a subir: o chao dentro do raio pedido nao baixa o voo — nota', () => {
    const sobe = (lon) => (xOf([lon, lat0]) > 50 ? 40 : 0)
    const z = computeTakeoffZone(base, { elevationAt: sobe, radiusM: 100, maxReliefM: 10 })
    expect(z.reduced).toBe(true)
    expect(z.cause.belowM).toBe(0)
    const items = preflightArea({
      plan: { waypoints: [[0, 0]], stats: {} },
      refZone: { label: 'A', zone: z },
    })
    expect(items.find((i) => i.code === 'base-zone-reduced')?.level).toBe('info')
  })
  test('encosta de 30 graus: zona sem raio, aviso proprio', () => {
    const z = computeTakeoffZone(base, { elevationAt: encosta(30), radiusM: 100, maxReliefM: 10 })
    expect(z.radiusM).toBe(0)
    const items = preflightArea({
      plan: { waypoints: [[0, 0]], stats: {} },
      refZone: { label: 'A', zone: z },
    })
    expect(items.find((i) => i.code === 'base-zone-zero')?.level).toBe('warn')
  })
})

describe('M2-T8: tecto AGL com a subida do corredor e o ganho da zona', () => {
  const payload = { maxAglM: 100 }
  test('80 m com tolerancia 5 passa; com 97 m na rota e 10 m de ganho ja nao', () => {
    expect(aglCapWarning(payload, 80, { terrainFollowActive: true, toleranceM: 5 })).toBeNull()
    const w = aglCapWarning(payload, 80, {
      terrainFollowActive: true,
      toleranceM: 5,
      routeMaxAglM: 97.3,
      gainM: 10,
    })
    expect(w).toEqual({ cap: 100, worstAgl: 107.3 })
    expect(aglCapWarning(payload, 80, { routeMaxAglM: 90, gainM: 5 })).toBeNull()
  })
})

describe('M2-G6: baterias por voo, com o transito', () => {
  test('6 blocos de 20,4 min + 3 min de transito com 25 min uteis sao 6 baterias, nao 5', () => {
    const blocks = Array.from({ length: 6 }, () => ({ timeS: 20.4 * 60, transitS: 180 }))
    const r = aggregatePlans([{ flightTimeS: 6 * 20.4 * 60, photoCount: 0, blocks }], {
      batteryMin: 25,
    })
    expect(r.batteries).toBe(6)
    const antes = aggregatePlans([{ flightTimeS: 6 * 20.4 * 60, photoCount: 0 }], {
      batteryMin: 25,
    })
    expect(antes.batteries).toBe(5)
  })
  test('rota unica de 43,8 min com 30 uteis sao 2 voos; o transito conta', () => {
    expect(
      aggregatePlans([{ flightTimeS: 43.8 * 60, photoCount: 1 }], { batteryMin: 30 }).batteries,
    ).toBe(2)
    expect(
      aggregatePlans([{ flightTimeS: 28 * 60, photoCount: 1, transitS: 3 * 60 }], {
        batteryMin: 30,
      }).batteries,
    ).toBe(2)
  })
})

describe('M2-T2: o perfil ve a crista entre duas amostras', () => {
  test('cumeada de 45 graus a meio de um troco de 420 m: a altura sobe quase ao topo', () => {
    // crista de 50 m em x = 210, flancos a 45 graus
    const elevationAt = (lon) => Math.max(0, 50 - Math.abs(xOf([lon, lat0]) - 210))
    const lines = [[em(0, 0), em(420, 0)]]
    const fino = terrainFollowLines({ elevationAt, resolutionM: 2 }, lines, {
      refElev: 0,
      agl: 60,
      toleranceM: 1,
      stepM: 40,
    })
    const topo = Math.max(...fino.waypoints.map((w) => w[2]))
    expect(topo).toBeGreaterThanOrEqual(60 + 48)
    // com a resolucao do Terrarium (30 m) ainda chega perto; antes (amostra pontual) ficava ~31
    const grosso = terrainFollowLines({ elevationAt, resolutionM: 30 }, lines, {
      refElev: 0,
      agl: 60,
      toleranceM: 1,
      stepM: 40,
    })
    expect(Math.max(...grosso.waypoints.map((w) => w[2]))).toBeGreaterThan(60 + 40)
  })
})

describe('M2-T4/G5: transito e VLOS da rota unica no preflight', () => {
  const plan = { waypoints: [[0, 0]], stats: { flightTimeS: 20 * 60 } }
  const base = () => ({
    plan,
    basePoint: [0, 0],
    baseDistance: 0,
    speed: 8,
    batteryMin: 30,
    reservePct: 0,
  })
  test('o transito do pior ponto da zona conta para a bateria e para a base inalcancavel', () => {
    const codes = (c) => preflightArea(c).map((i) => i.code)
    expect(codes(base())).not.toContain('battery')
    const comTransito = preflightArea({ ...base(), baseTransitS: 11 * 60 })
    expect(comTransito.find((i) => i.code === 'battery')?.params.min).toBeCloseTo(31, 1)
    expect(codes({ ...base(), baseTransitS: 31 * 60 })).toContain('base-unreachable')
    // nos outros modos tambem
    expect(
      preflightPlan({
        plan,
        basePoint: [0, 0],
        baseDistance: 0,
        speed: 8,
        batteryMin: 30,
        baseTransitS: 11 * 60,
      }).map((i) => i.code),
    ).toContain('battery')
  })
  test('rota alem do alcance visual: aviso', () => {
    const it = preflightArea({ ...base(), routeVlosM: 880, vlosM: 500 }).find(
      (i) => i.code === 'route-vlos',
    )
    expect(it?.level).toBe('warn')
    expect(it.params).toEqual({ m: 880, vlos: 500 })
    expect(
      preflightArea({ ...base(), routeVlosM: 400, vlosM: 500 }).map((i) => i.code),
    ).not.toContain('route-vlos')
  })
})
