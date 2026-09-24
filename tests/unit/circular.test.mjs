/**
 * Modo circular (circlegrammetry): grelha de circulos sobre a area, com a
 * camara obliqua apontada ao centro (src/utils/circular.js). Os numeros de
 * referencia sao os do estudo de Bilodeau et al. (2025): campo de 93 x 131 m,
 * raio 30 m, 50 % -> 20 circulos, 25 % -> 9.
 */
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import {
  DEFAULT_CIRCULAR_CONFIG,
  MAX_CIRCLES,
  applyCircularTerrain,
  circularBlocks,
  circularGrid,
  generateCircularPlan,
  normalizeCircularConfig,
  overlapAdvice,
} from '../../src/utils/circular.js'
import { circularExportParams } from '../../src/mission/exportParams.js'
import { buildWaylinesWPML, validateExportParams } from '../../src/utils/exporters.js'
import { rectangleFromAnchor, resolveSensor } from '../../src/utils/geo.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const centre = [-8, 39.5]
// 131 m no sentido N-S, 93 m E-O: a aresta mais longa da para o rumo 0
const field = rectangleFromAnchor(centre, 131, 93, 0)
const sensor = resolveSensor(PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
const wpml = { droneEnumValue: 60, payloadEnumValue: 50, payloadPositionIndex: 0 }
const opts = (extra) => ({
  sensor,
  radiusM: 30,
  overlapPct: 50,
  altitude: 60,
  gimbalPitch: -45,
  frontOverlapPct: 80,
  speed: 8.2,
  ...extra,
})
const dist = (a, b) => turf.distance(a, b, { units: 'meters' })

describe('grelha de circulos', () => {
  test('formula (2) do artigo: 50 % -> 5 x 4 = 20 circulos, 25 % -> 3 x 3 = 9', () => {
    const g50 = circularGrid(field, { radiusM: 30, overlapPct: 50 })
    expect([g50.cols, g50.rows, g50.count]).toEqual([5, 4, 20])
    expect(g50.stepM).toBe(30)
    const g25 = circularGrid(field, { radiusM: 30, overlapPct: 25 })
    expect([g25.cols, g25.rows, g25.count]).toEqual([3, 3, 9])
    expect(g25.stepM).toBe(45)
  })

  test('grelha centrada na area, a sair da fronteira; extensao de cada lado', () => {
    const g = circularGrid(field, { radiusM: 30, overlapPct: 50 })
    // 5 colunas a 30 m cobrem 120 m + 2 x 30 m de raio = 180 m sobre 131 m
    // a caixa no referencial local mede o que o turf mede nas arestas
    const edges = [0, 1, 2, 3].map((i) => dist(field[i], field[(i + 1) % 4]))
    expect(g.lengthM).toBeCloseTo(Math.max(...edges), 0)
    expect(g.widthM).toBeCloseTo(Math.min(...edges), 0)
    expect(g.extensionAlongM).toBeCloseTo((4 * 30) / 2 + 30 - g.lengthM / 2, 6)
    expect(g.extensionAcrossM).toBeCloseTo((3 * 30) / 2 + 30 - g.widthM / 2, 6)
    const c = turf.centroid(turf.polygon([[...field, field[0]]])).geometry.coordinates
    const mean = g.centres.reduce((s, q) => [s[0] + q.lonLat[0], s[1] + q.lonLat[1]], [0, 0])
    expect(dist([mean[0] / 20, mean[1] / 20], c)).toBeLessThan(0.5)
  })

  test('ordem de voo em serpentina e rotacao alternada por fiada', () => {
    const g = circularGrid(field, { radiusM: 30, overlapPct: 50 })
    expect(g.centres.slice(0, 5).map((q) => q.col)).toEqual([0, 1, 2, 3, 4])
    expect(g.centres.slice(5, 10).map((q) => q.col)).toEqual([4, 3, 2, 1, 0])
    expect(g.centres.map((q) => q.clockwise).slice(0, 10)).toEqual([
      ...Array(5).fill(true),
      ...Array(5).fill(false),
    ])
    // centros vizinhos na fiada a um passo
    expect(dist(g.centres[0].lonLat, g.centres[1].lonLat)).toBeCloseTo(30, 0)
  })

  test('erros controlados: area, raio, demasiados circulos', () => {
    expect(circularGrid(null, { radiusM: 30, overlapPct: 50 }).error).toBe('invalid-area')
    expect(circularGrid(field, { radiusM: 0, overlapPct: 50 }).error).toBe('invalid-radius')
    const big = rectangleFromAnchor(centre, 3000, 3000, 0)
    const g = circularGrid(big, { radiusM: 30, overlapPct: 50 })
    expect(g.error).toBe('too-many-circles')
    expect(g.count).toBeGreaterThan(MAX_CIRCLES)
  })

  test('conselho: intervalo de sobreposicao que mantem o numero de circulos', () => {
    const a = overlapAdvice(field, { radiusM: 30, overlapPct: 50 })
    expect(a.count).toBe(20)
    expect(a.minPct).toBeLessThanOrEqual(50)
    expect(a.maxPct).toBeGreaterThanOrEqual(50)
    // no topo do intervalo o numero e o mesmo; um ponto acima, ha mais
    expect(circularGrid(field, { radiusM: 30, overlapPct: a.maxPct }).count).toBe(20)
    expect(circularGrid(field, { radiusM: 30, overlapPct: a.maxPct + 1 }).count).toBeGreaterThan(20)
    if (a.minPct > 0)
      expect(circularGrid(field, { radiusM: 30, overlapPct: a.minPct - 1 }).count).toBeLessThan(20)
    expect(overlapAdvice(null, { radiusM: 30, overlapPct: 50 })).toBeNull()
  })
})

describe('plano circular', () => {
  const plan = generateCircularPlan(field, opts())
  const st = plan.stats

  test('20 circulos, pontos por circulo, fecho sem foto, raio exacto', () => {
    expect(st.circleCount).toBe(20)
    expect(st.pointsPerCircle).toBeGreaterThanOrEqual(12)
    expect(st.waypointCount).toBe(20 * (st.pointsPerCircle + 1))
    expect(st.photoCount).toBe(20 * st.pointsPerCircle)
    for (const c of plan.circles) {
      const pts = plan.waypoints.slice(c.start, c.start + c.count)
      for (const w of pts) expect(dist(w, c.centre)).toBeCloseTo(30, 1)
      expect(pts[0].slice(0, 2)).toEqual(pts[pts.length - 1].slice(0, 2))
      expect(plan.perWaypoint[c.start + c.count - 1].actions).toEqual([])
      expect(plan.perWaypoint[c.start].actions).toEqual(['takePhoto'])
    }
  })

  test('rumo ao centro em todos os pontos, gimbal fixo, alturas planas', () => {
    plan.circles.forEach((c) => {
      for (let i = c.start; i < c.start + c.count; i++) {
        const brg = ((Math.round(turf.bearing(plan.waypoints[i], c.centre)) % 360) + 360) % 360
        expect(plan.perWaypoint[i].heading).toBe(brg)
        expect(plan.perWaypoint[i].gimbalPitch).toBe(-45)
        expect(plan.waypoints[i][2]).toBe(60)
      }
    })
  })

  test('cada circulo entra pelo ponto virado ao anterior: a ligacao na fiada mede um passo', () => {
    for (let k = 1; k < 5; k++) {
      const prev = plan.circles[k - 1]
      const exit = plan.waypoints[prev.start + prev.count - 1]
      const entry = plan.waypoints[plan.circles[k].start]
      expect(dist(exit, entry)).toBeCloseTo(30, 0)
    }
    // nenhum par consecutivo abaixo dos 0,5 m que a DJI exige
    for (let i = 1; i < plan.waypoints.length; i++)
      expect(dist(plan.waypoints[i - 1], plan.waypoints[i])).toBeGreaterThan(0.5)
  })

  test('estatisticas: extensao, area, GSD no eixo optico, tempo com viragens', () => {
    expect(st.extensionAlongM).toBeCloseTo(25, 0)
    expect(st.extensionAcrossM).toBeCloseTo(28, 0)
    expect(st.areaHa).toBeCloseTo(1.22, 1)
    expect(st.gsdCm).toBeGreaterThan(0)
    expect(st.rangeM).toBeCloseTo(60 / Math.sin(Math.PI / 4), 6)
    expect(st.pathLengthM).toBeGreaterThan(20 * 2 * Math.PI * 30 * 0.9)
    expect(st.flightTimeS).toBeGreaterThan(st.pathLengthM / 8.2)
  })

  test('25 %: 9 circulos e menos de metade do tempo', () => {
    const p25 = generateCircularPlan(field, opts({ overlapPct: 25 }))
    expect(p25.stats.circleCount).toBe(9)
    expect(p25.stats.flightTimeS).toBeLessThan(0.55 * st.flightTimeS)
  })

  test('sem camara: 24 pontos por circulo e sem GSD', () => {
    const p = generateCircularPlan(field, opts({ sensor: null }))
    expect(p.stats.pointsPerCircle).toBe(24)
    expect(p.stats.gsdCm).toBeNull()
  })

  test('erros: altura, raio, area, demasiados circulos', () => {
    expect(generateCircularPlan(field, opts({ altitude: 0 })).error).toBe('invalid-altitude')
    expect(generateCircularPlan(field, opts({ radiusM: -1 })).error).toBe('invalid-radius')
    expect(generateCircularPlan([[0, 0]], opts()).error).toBe('invalid-area')
    expect(generateCircularPlan(field, opts({ radiusM: 5, overlapPct: 80 })).error).toBe(
      'too-many-circles',
    )
  })

  test('um so circulo: entrada a norte e volta completa', () => {
    const one = generateCircularPlan(rectangleFromAnchor(centre, 20, 20, 0), opts({ radiusM: 30 }))
    expect(one.stats.circleCount).toBe(1)
    expect(one.perWaypoint[0].heading).toBe(180)
  })
})

describe('terreno, blocos e exportacao', () => {
  const plan = generateCircularPlan(field, opts())

  test('seguimento de terreno por ponto: AGL + (cota - referencia), indices iguais', () => {
    const elevationAt = (lon, lat) => 100 + (lat - centre[1]) * 1e4 // rampa N-S
    const r = applyCircularTerrain(plan, { elevationAt, refElev: 100, agl: 60, speed: 8.2 })
    expect(r.waypoints).toHaveLength(plan.waypoints.length)
    expect(r.missing).toBe(0)
    r.waypoints.forEach((w, i) => {
      expect(w.slice(0, 2)).toEqual(plan.waypoints[i].slice(0, 2))
      expect(w[2]).toBeCloseTo(60 + elevationAt(w[0], w[1]) - 100, 0)
    })
    expect(r.pathLengthM).toBeGreaterThan(plan.stats.pathLengthM)
    const holes = applyCircularTerrain(plan, {
      elevationAt: () => NaN,
      refElev: 100,
      agl: 60,
      speed: 8,
    })
    expect(holes.missing).toBe(plan.waypoints.length)
    expect(holes.waypoints.every((w) => w[2] === 60)).toBe(true)
    expect(applyCircularTerrain(plan, { elevationAt, refElev: NaN, agl: 60, speed: 8 })).toBeNull()
  })

  test('blocos por circulos inteiros dentro do tempo util', () => {
    const b = circularBlocks(plan, null, { usableS: 240, speed: 8.2 })
    expect(b.length).toBeGreaterThan(1)
    expect(b.reduce((s, x) => s + x.waypoints.length, 0)).toBe(plan.waypoints.length)
    expect(b.flatMap((x) => x.circles)).toEqual(plan.circles.map((c) => c.index))
    for (const x of b) {
      expect(x.perWaypoint).toHaveLength(x.waypoints.length)
      expect(x.durationS).toBeGreaterThan(0)
    }
    expect(circularBlocks(plan, null, { usableS: null, speed: 8 })).toHaveLength(1)
    expect(circularBlocks(null, null, { usableS: 100, speed: 8 })).toEqual([])
  })

  test('parametros de exportacao: nome, curva continua, pitch, validacao; WPML com foto e rumo por ponto', () => {
    const p = circularExportParams({
      missionName: 'Pedreira',
      plan,
      altitude: 60,
      speed: 8.2,
      wpml,
      sensorType: 'camera',
    })
    expect(p.name).toBe('Pedreira_circular_n20')
    expect(p.turnMode).toBe('toPointAndPassWithContinuityCurvature')
    expect(p.gimbalPitch).toBe(-45)
    expect(p.photoIntervalM).toBe(0)
    expect(validateExportParams(p)).toBe(p)
    const tf = circularExportParams({
      missionName: 'Pedreira',
      plan,
      waypoints: plan.waypoints,
      terrainOk: true,
      altitude: 60,
      speed: 8.2,
      wpml,
      sensorType: 'camera',
    })
    expect(tf.name).toBe('Pedreira_circular-tf_n20')
    const xml = buildWaylinesWPML(p)
    expect((xml.match(/<wpml:actionActuatorFunc>takePhoto</g) || []).length).toBe(
      plan.stats.photoCount,
    )
    expect((xml.match(/smoothTransition/g) || []).length).toBe(plan.stats.waypointCount)
    expect((xml.match(/toPointAndPassWithContinuityCurvature/g) || []).length).toBe(
      plan.stats.waypointCount,
    )
    expect(xml).not.toMatch(/multipleDistance|startRecord/)
  })
})

describe('configuracao guardada', () => {
  test('defaults do artigo; lixo cai nos defaults; limites', () => {
    expect(DEFAULT_CIRCULAR_CONFIG).toMatchObject({
      radiusM: 30,
      overlapPct: 50,
      gimbalPitch: -45,
      angleDeg: null,
    })
    expect(normalizeCircularConfig(null)).toEqual(DEFAULT_CIRCULAR_CONFIG)
    const n = normalizeCircularConfig({
      radiusM: 9999,
      overlapPct: -5,
      gimbalPitch: 10,
      speedMS: 'x',
      angleDeg: 270,
    })
    expect(n).toEqual({ radiusM: 500, overlapPct: 0, gimbalPitch: -20, speedMS: 8, angleDeg: 90 })
  })
})
