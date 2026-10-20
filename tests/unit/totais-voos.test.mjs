/**
 * Totais de uma missão de área dividida em voos (src/mission/blocks.js,
 * areaRouteStats): «Distância total» e «Tempo na missão» são a soma do que
 * cada voo voa — a rota do seu bloco, 3D com seguimento de terreno, com as
 * suas inversões e paragens —, o mesmo que cada KMZ leva em `wpml:distance`
 * e `wpml:duration`, sem os troços entre blocos, que não se voam, e sem
 * trânsito. Com seguimento de terreno as estatísticas vinham da rota de
 * toda a área numa só peça (troços entre blocos e uma inversão a mais por
 * bloco: +10 % em 20 blocos de 500 m); o corte da serpentina por área
 * contava-os também sem seguimento de terreno.
 */
import { describe, expect, test } from 'vitest'
import {
  areaRouteStats,
  flightsRouteStats,
  planBlocks,
  terrainWaypointCount,
} from '../../src/mission/blocks.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { planTerrainFollow } from '../../src/mission/terrainFollow.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import { planMissionFromProject } from '../../src/mission/planFromProject.js'
import { normalizeProject } from '../../src/mission/project.js'
import { routeLengthM, stripRouteStats, turnCostS } from '../../src/utils/geo.js'
import * as turf from '@turf/turf'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const xOf = (lon) => (lon + 9.14) * mLon
const yOf = (lat) => (lat - lat0) * 110574
const speed = 10
const wpml = { droneEnumValue: 77, payloadEnumValue: 66, payloadPositionIndex: 0 }
const opts = {
  spacingM: 50,
  angleDeg: 90,
  bufferPct: 0,
  photoIntervalM: 20,
  speed,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
  waypointStops: 'corners',
}
// colinas: o relevo pede vértices nas faixas e nas ligações
const terrain = {
  elevationAt: (lon, lat) =>
    100 +
    0.05 * xOf(lon) +
    60 * Math.exp(-((xOf(lon) - 500) ** 2 + (yOf(lat) - 400) ** 2) / (2 * 150 ** 2)) +
    40 * Math.sin(yOf(lat) / 90),
}

/** Mosaico 2 × 2 de 500 m sobre uma área de 1000 × 1000 m, com o plano por célula e os blocos. */
function mosaicMission(extra = {}) {
  const ring = [em(0, 0), em(1000, 0), em(1000, 1000), em(0, 1000)]
  const mosaic = buildSquareMosaic(ring, {
    holes: [],
    sideM: 500,
    orientationDeg: mosaicOrientationForLines(opts.angleDeg),
  })
  const cells = mosaic.cells.map((c) => c.ring)
  const o = { ...opts, ...extra }
  const plan = planArea(ring, cells, { ...o, holes: [], cellHoles: mosaic.cells.map(() => []) })
  expect(plan.error).toBeUndefined()
  const blocks = planBlocks(plan, {
    activeCells: cells,
    cellIds: cells.map((_, i) => i + 1),
    split: { mode: 'battery' },
    speed,
    spacingM: o.spacingM,
    waypointStops: o.waypointStops,
  })
  expect(blocks).toHaveLength(4)
  return { ring, plan, blocks, o }
}

/** O que cada KMZ escreve: `wpml:distance` (3D) e `wpml:duration` de cada voo. */
function kmzTotals({ plan, blocks, terrainResult = null, waypointStops = 'corners' }) {
  const { blocks: out } = buildAreaExport({
    missionName: 'm',
    plan,
    terrainResult,
    blocks,
    spacingM: 50,
    sensorType: 'camera',
    altitude: 100,
    speed,
    wpml,
    photoIntervalM: 20,
    triggerMode: 'distance',
    gimbalPitch: -90,
    waypointStops,
  })
  return {
    n: out.length,
    distanceM: out.reduce((s, b) => s + routeLengthM(b.waypoints), 0),
    durationS: out.reduce((s, b) => s + b.durationS, 0),
  }
}

describe('totais de uma missão dividida: a soma dos voos', () => {
  test('mosaico sem seguimento de terreno: os totais já eram a soma dos voos e não mudam', () => {
    const { plan, blocks } = mosaicMission()
    const r = areaRouteStats(plan, { blocks, speed })
    expect(r.stats.pathLengthM).toBeCloseTo(plan.stats.pathLengthM, 6)
    expect(r.stats.flightTimeS).toBeCloseTo(plan.stats.flightTimeS, 6)
    expect(r.stats.path3D).toBeUndefined()
    const kmz = kmzTotals({ plan, blocks })
    expect(kmz.n).toBe(4)
    expect(r.stats.pathLengthM).toBeCloseTo(kmz.distanceM, 6)
    expect(r.stats.flightTimeS).toBeCloseTo(kmz.durationS, 6)
  })

  test('mosaico com seguimento de terreno: a soma dos KMZ, sem os troços entre blocos', () => {
    const { plan, blocks } = mosaicMission()
    const tf = planTerrainFollow(terrain, plan, { blocks, refElev: 100, agl: 100, toleranceM: 2 })
    expect(tf.error).toBeUndefined()
    const r = areaRouteStats(plan, { blocks, terrainResult: tf, speed })
    expect(r.stats.path3D).toBe(true)
    const kmz = kmzTotals({ plan, blocks, terrainResult: tf })
    expect(r.stats.pathLengthM).toBeCloseTo(kmz.distanceM, 6)
    expect(r.stats.flightTimeS).toBeCloseTo(kmz.durationS, 6)
    // a rota 3D é mais comprida do que a horizontal, nunca mais curta
    expect(r.stats.pathLengthM).toBeGreaterThan(plan.stats.pathLengthM)
    // o que a rota inteira contava a mais: cada troço do fim de um bloco ao
    // início do seguinte (3D, com os vértices que o relevo lá pôs) e uma
    // inversão por troço
    const whole = stripRouteStats(tf.waypoints, {
      speed,
      lineCount: plan.lines.length,
      perLine: tf.perLine,
    })
    let linksM = 0
    let from = 0
    tf.perLine.forEach((n, i) => {
      const line = tf.waypoints.slice(from, from + n)
      const link = tf.perLink[i] ?? 0
      const starts = blocks.findIndex((b, k) => k > 0 && b.lines[0] === plan.lines[i]) >= 0
      if (starts) linksM += routeLengthM([tf.waypoints[from - 1], ...line.slice(0, link + 1)])
      from += n
    })
    expect(linksM).toBeGreaterThan(0)
    expect(whole.pathLengthM - r.stats.pathLengthM).toBeCloseTo(linksM, 6)
    expect(whole.flightTimeS - r.stats.flightTimeS).toBeCloseTo(
      linksM / speed + (blocks.length - 1) * turnCostS(speed),
      6,
    )
  })

  test('paragem em todos: cada voo conta as paragens nos vértices do seu relevo', () => {
    const { plan, blocks } = mosaicMission({ waypointStops: 'all' })
    const tf = planTerrainFollow(terrain, plan, { blocks, refElev: 100, agl: 100, toleranceM: 2 })
    const r = areaRouteStats(plan, { blocks, terrainResult: tf, speed, waypointStops: 'all' })
    const kmz = kmzTotals({ plan, blocks, terrainResult: tf, waypointStops: 'all' })
    expect(r.stats.flightTimeS).toBeCloseTo(kmz.durationS, 6)
    const corners = areaRouteStats(plan, { blocks, terrainResult: tf, speed })
    expect(r.stats.flightTimeS).toBeGreaterThan(corners.stats.flightTimeS)
  })

  test('corte da serpentina por área: sem os troços entre blocos, também sem terreno', () => {
    const ring = [em(0, 0), em(1000, 0), em(1000, 600), em(0, 600)]
    const plan = planArea(ring, null, opts)
    expect(plan.error).toBeUndefined()
    const blocks = planBlocks(plan, {
      split: { mode: 'area', maxAreaHa: 15 },
      speed,
      spacingM: opts.spacingM,
    })
    expect(blocks.length).toBeGreaterThan(1)
    const r = areaRouteStats(plan, { blocks, speed })
    const kmz = kmzTotals({ plan, blocks })
    expect(r.stats.pathLengthM).toBeCloseTo(kmz.distanceM, 6)
    expect(r.stats.flightTimeS).toBeCloseTo(kmz.durationS, 6)
    // os blocos trazem o seu tempo (sem trânsito, que aqui é 0)
    expect(r.stats.flightTimeS).toBeCloseTo(
      blocks.reduce((s, b) => s + b.timeS - b.transitS, 0),
      6,
    )
    // a serpentina inteira contava a ligação entre cada par de blocos e uma inversão
    let linksM = 0
    for (let k = 1; k < blocks.length; k++) {
      const prev = blocks[k - 1].waypoints
      linksM += turf.distance(prev[prev.length - 1], blocks[k].waypoints[0], { units: 'meters' })
    }
    expect(plan.stats.pathLengthM - r.stats.pathLengthM).toBeCloseTo(linksM, 6)
    expect(plan.stats.flightTimeS - r.stats.flightTimeS).toBeCloseTo(
      linksM / speed + (blocks.length - 1) * turnCostS(speed),
      6,
    )
    // as outras estatísticas ficam
    expect(r.stats.lineCount).toBe(plan.stats.lineCount)
    expect(r.stats.waypointCount).toBe(plan.stats.waypointCount)
    expect(r.stats.areaHa).toBe(plan.stats.areaHa)
  })

  test('sem blocos: a rota inteira, 3D com seguimento de terreno; sem nada a corrigir, o plano', () => {
    const ring = [em(0, 0), em(600, 0), em(600, 300), em(0, 300)]
    const plan = planArea(ring, null, opts)
    expect(areaRouteStats(plan, { speed })).toBe(plan)
    expect(areaRouteStats(plan, { blocks: [], speed })).toBe(plan)
    expect(areaRouteStats(null, { speed })).toBeNull()
    const erro = { error: 'too-many-lines' }
    expect(areaRouteStats(erro, { speed })).toBe(erro)
    const tf = planTerrainFollow(terrain, plan, { refElev: 100, agl: 100, toleranceM: 2 })
    const r = areaRouteStats(plan, { terrainResult: tf, speed })
    const whole = stripRouteStats(tf.waypoints, {
      speed,
      lineCount: plan.lines.length,
      perLine: tf.perLine,
    })
    expect(r.stats.pathLengthM).toBeCloseTo(whole.pathLengthM, 6)
    expect(r.stats.flightTimeS).toBeCloseTo(whole.flightTimeS, 6)
    expect(r.stats.path3D).toBe(true)
    // um resultado do terreno com erro não conta
    expect(areaRouteStats(plan, { terrainResult: { error: 'terrain-failed' }, speed })).toBe(plan)
  })

  test('flightsRouteStats: soma por voo, n − 1 inversões em cada um', () => {
    const a = [em(0, 0), em(100, 0)]
    const b = [em(100, 50), em(0, 50)]
    const c = [em(0, 300), em(100, 300)]
    const flights = [
      { lines: [a, b], waypoints: [...a, ...b] },
      { lines: [c], waypoints: c },
    ]
    const r = flightsRouteStats(flights, { speed })
    const lenAB = routeLengthM([...a, ...b])
    const lenC = routeLengthM(c)
    expect(r.pathLengthM).toBeCloseTo(lenAB + lenC, 6)
    expect(r.flightTimeS).toBeCloseTo((lenAB + lenC) / speed + turnCostS(speed), 6)
    expect(flightsRouteStats([], { speed })).toEqual({ pathLengthM: 0, flightTimeS: 0 })
    expect(flightsRouteStats(flights, { speed: 0 }).flightTimeS).toBeNull()
  })

  test('o motor do projecto (planMissionFromProject) dá os mesmos totais que o App', () => {
    const ring = [em(0, 0), em(1000, 0), em(1000, 600), em(0, 600)]
    const n = normalizeProject({
      version: 2,
      ring,
      drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' },
      params: { altitude: 100, speed, frontOverlap: 80, sideOverlap: 70, angle: 90 },
      split: { mode: 'area', maxAreaHa: 15 },
      battery: { usefulMin: 30 },
    })
    const p = planMissionFromProject(n)
    expect(p.planError).toBeNull()
    expect(p.blocks.length).toBeGreaterThan(1)
    const kmz = kmzTotals({ plan: p.planOk, blocks: p.blocks })
    expect(p.planOk.stats.pathLengthM).toBeCloseTo(kmz.distanceM, 6)
    expect(p.planOk.stats.flightTimeS).toBeCloseTo(kmz.durationS, 6)
    expect(p.plan).toBe(p.planOk)
    // sem divisão, o plano tal qual
    const uno = planMissionFromProject({ ...n, split: { ...n.split, mode: 'none' } })
    expect(uno.blocks).toBeNull()
    expect(uno.planOk.stats.pathLengthM).toBeGreaterThan(p.planOk.stats.pathLengthM)
  })
})

describe('waypoints com altura própria: os dos voos', () => {
  test('com blocos, a soma dos waypoints de cada voo, sem os pontos dos troços entre blocos', () => {
    const { plan, blocks } = mosaicMission()
    const tf = planTerrainFollow(terrain, plan, { blocks, refElev: 100, agl: 100, toleranceM: 2 })
    expect(tf.error).toBeUndefined()
    const voados = tf.blocks3.reduce((n, b) => n + b.waypoints.length, 0)
    expect(terrainWaypointCount(tf)).toBe(voados)
    // a rota inteira leva também os troços entre blocos: nunca menos pontos
    expect(terrainWaypointCount(tf)).toBeLessThanOrEqual(tf.waypoints.length)
  })

  test('sem blocos, a rota inteira; sem resultado ou com erro, zero', () => {
    const { plan } = mosaicMission()
    const tf = planTerrainFollow(terrain, plan, { refElev: 100, agl: 100, toleranceM: 2 })
    expect(tf.blocks3).toBeNull()
    expect(terrainWaypointCount(tf)).toBe(tf.waypoints.length)
    expect(terrainWaypointCount(null)).toBe(0)
    expect(terrainWaypointCount({ error: 'terrain-failed' })).toBe(0)
  })
})
