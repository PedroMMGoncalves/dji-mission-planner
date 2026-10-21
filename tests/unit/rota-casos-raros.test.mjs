/**
 * Rota e mosaico, casos raros: a fusão dos pontos de foto com os vértices do
 * relevo (src/mission/terrainFollow.js, mergePhotoWaypoints) numa faixa com a
 * foto antes do primeiro vértice, a meio e em cima de um vértice, numa faixa
 * de três vértices e numa faixa com menos de dois pontos do relevo; as
 * travas do mosaico quadrado (faixa fina na diagonal, contorno em laço,
 * células a mais depois de fundir, opções inválidas); e os auxiliares com
 * entradas em falta (gimbal, folga, operações, caixas, referência, enums
 * WPML, exportação do corredor com LiDAR e da órbita).
 */
import { describe, expect, test } from 'vitest'
import { mergePhotoWaypoints } from '../../src/mission/terrainFollow.js'
import { buildSquareMosaic } from '../../src/mission/squareMosaic.js'
import { gimbalRangeViolation, shotPitches } from '../../src/mission/gimbal.js'
import { forEachRouteSample, transitClearance } from '../../src/mission/clearance.js'
import { opsSummary } from '../../src/mission/opsSummary.js'
import { baseToRouteM, bboxOfPoints } from '../../src/mission/corridorTerrain.js'
import { referenceElevation } from '../../src/mission/reference.js'
import { missionWpml } from '../../src/mission/missionWpml.js'
import { corridorExportParams, orbitExportParams } from '../../src/mission/exportParams.js'
import { AIRCRAFT, DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { resolveSensor } from '../../src/utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lat0 = 40.4
const lon0 = -7.2
const mL = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mL, lat0 + y / M_PER_DEG_LAT]
const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]
const FOTO = { actions: ['takePhoto'] }

describe('foto por waypoint com seguimento de terreno: a fusão faixa a faixa', () => {
  // faixa 0 recta (0 → 100 m para leste), com fotos aos 0, 50 e 100 m; faixa
  // 1 com três vértices (não é uma faixa da área); o relevo deu, na faixa 0,
  // vértices aos 10, 60 e 100 m, e na faixa 1 um ponto de ligação e dois
  const plan = {
    lines: [
      [em(0, 0), em(100, 0)],
      [em(100, 40), em(50, 40), em(0, 40)],
    ],
    waypoints: [em(0, 0), em(50, 0), em(100, 0), em(100, 40), em(50, 40), em(0, 40)],
    perLine: [3, 3],
    perWaypoint: [FOTO, FOTO, FOTO, null, null, null],
  }
  const res = {
    waypoints: [
      [...em(10, 0), 50],
      [...em(60, 0), 70],
      [...em(100, 0), 80],
      [...em(100, 20), 85],
      [...em(100, 40), 90],
      [...em(0, 40), 95],
    ],
    perLine: [3, 3],
    perLink: [0, 1],
    warnings: ['aviso'],
  }

  test('a foto antes do primeiro vértice fica à altura dele; a meio, interpolada; em cima de um, funde-se', () => {
    const out = mergePhotoWaypoints(res, plan)
    const linha0 = out.waypoints.slice(0, out.perLine[0])
    expect(linha0.map((w) => Math.round((w[0] - lon0) * mL))).toEqual([0, 10, 50, 60, 100])
    expect(linha0.map((w) => w[2])).toEqual([50, 50, 66, 70, 80])
    // as acções vão com os pontos de foto: 0, 50 m e o vértice dos 100 m
    expect([0, 1, 2, 3, 4].map((i) => out.perWaypoint[i] ?? null)).toEqual([
      FOTO,
      null,
      FOTO,
      null,
      FOTO,
    ])
    expect(out.vertexIndex[0]).toEqual([0, 4])
    expect(out.warnings).toEqual(['aviso'])
  })

  test('faixa de três vértices: os pontos do relevo tal como vieram, sem fotos', () => {
    const out = mergePhotoWaypoints(res, plan)
    expect(out.perLine).toEqual([5, 3])
    expect(out.waypoints.slice(5)).toEqual(res.waypoints.slice(3))
    // o índice dos vértices da faixa começa depois da ligação
    expect(out.vertexIndex[1]).toEqual([6, 7])
    expect(out.perWaypoint.slice(5).filter(Boolean)).toEqual([])
  })

  test('faixa com um só ponto do relevo, ou nenhum: passa como está', () => {
    const um = mergePhotoWaypoints(
      { waypoints: [[...em(0, 0), 50]], perLine: [1, 0], perLink: [0, 0] },
      { ...plan, lines: [plan.lines[0], [em(0, 40), em(100, 40)]] },
    )
    expect(um.waypoints).toEqual([[...em(0, 0), 50]])
    expect(um.vertexIndex).toEqual([[0, 0], []])
    // sem foto por waypoint, ou com erro, o resultado do relevo tal qual
    expect(mergePhotoWaypoints(res, { ...plan, perWaypoint: null })).toBe(res)
    const erro = { error: 'terrain-failed' }
    expect(mergePhotoWaypoints(erro, plan)).toBe(erro)
  })
})

describe('mosaico quadrado: travas e opções inválidas', () => {
  test('faixa fina e comprida na diagonal: recusada pela caixa, antes de recortar', () => {
    // 10 km × 10 m a 45°: pouca área, mas uma caixa de 7 × 7 km em quadrados de 50 m
    const L = 10000
    const w = 10
    const d = Math.SQRT1_2
    const faixa = [em(0, 0), em(L * d, L * d), em(L * d - w * d, L * d + w * d), em(-w * d, w * d)]
    const r = buildSquareMosaic(faixa, { sideM: 50 })
    expect(r.error).toBe('too-many-cells')
    expect(r.count).toBeLessThan(400 * 50)
  })

  test('contorno em laço, lado abaixo de 10 m ou área sem área: inválido', () => {
    const laco = [em(0, 0), em(500, 500), em(500, 0), em(0, 500)]
    expect(buildSquareMosaic(laco, { sideM: 100 })).toEqual({ error: 'invalid' })
    expect(buildSquareMosaic(rect(0, 0, 300, 200), { sideM: 5 })).toEqual({ error: 'invalid' })
    expect(buildSquareMosaic([em(0, 0), em(100, 0), em(200, 0)], { sideM: 50 })).toEqual({
      error: 'invalid',
    })
  })

  test('células a mais só se sabem depois de recortar e fundir: contadas no fim', () => {
    // 1000 × 30 m em quadrados de 100 m: três lados² de área (o mínimo passa),
    // mas os pedaços enchem 30 % (não são tiras) e não se fundem
    const faixa = rect(0, 0, 1000, 30)
    expect(buildSquareMosaic(faixa, { sideM: 100, maxCells: 20 }).cells).toHaveLength(9)
    expect(buildSquareMosaic(faixa, { sideM: 100, maxCells: 3 })).toEqual({
      error: 'too-many-cells',
      count: 9,
    })
    // sem fusão possível, os pedaços das pontas também ficam
    const semFusao = buildSquareMosaic(faixa, { sideM: 100, maxCells: 3, fits: () => false })
    expect(semFusao).toEqual({ error: 'too-many-cells', count: 10 })
  })

  test('orientação, enchimento mínimo e deslocamentos inválidos: os de omissão', () => {
    const area = rect(0, 0, 330, 200)
    const omissao = buildSquareMosaic(area, { sideM: 100 })
    const invalidos = buildSquareMosaic(area, {
      sideM: 100,
      orientationDeg: Number.NaN,
      minFillFrac: Number.NaN,
    })
    expect(invalidos.cells.map((c) => c.ring)).toEqual(omissao.cells.map((c) => c.ring))
    expect(invalidos.orientationDeg).toBe(0)
    // sem deslocamentos válidos: a grelha centrada e mais um ensaio
    expect(buildSquareMosaic(area, { sideM: 100, offsetSteps: 'x' }).trials).toBe(2)
    // muitas células estimadas: um só deslocamento além da grelha centrada
    const grande = buildSquareMosaic(rect(0, 0, 3000, 2000), { sideM: 100, maxCells: 1000 })
    expect(grande.trials).toBe(2)
    expect(grande.cells).toHaveLength(600)
  })
})

describe('auxiliares com entradas em falta', () => {
  test('gimbal: sem intervalo do payload, −90° a 25°; inclinações inválidas saem', () => {
    expect(shotPitches(null, null)).toEqual([-45, 0, 25])
    expect(shotPitches([Number.NaN, -100, 10, 10.2, 40], null)).toEqual([-90, 10, 25])
    expect(gimbalRangeViolation(null, { min: -90, max: 35 })).toBeNull()
    expect(gimbalRangeViolation([Number.NaN, 50], { min: -90, max: 35 })).toEqual({
      worst: 50,
      min: -90,
      max: 35,
    })
  })

  test('folga: rota vazia não amostra; trânsito com waypoints sem altura sobe à de segurança', () => {
    const vistos = []
    forEachRouteSample([], {}, (...a) => vistos.push(a))
    forEachRouteSample(null, {}, (...a) => vistos.push(a))
    expect(vistos).toEqual([])
    const r = transitClearance(em(-100, 0), [em(0, 0), em(200, 0)], {
      elevationAt: () => 100,
      refElev: 100,
      takeOffSecurityHeightM: 20,
      rthHeightM: 30,
    })
    expect(r).toMatchObject({ outHeightM: 20, backHeightM: 30, minM: 20 })
    expect(transitClearance(em(-100, 0), null, { elevationAt: () => 1, refElev: 1 })).toBeNull()
  })

  test('operações: a informação do bloco pela chave em número; trânsito do bloco; sem tempo, 0', () => {
    const r = opsSummary({
      blocks: [
        { id: 1, timeS: 600, transitS: 30 },
        { id: 2, transitS: 45 },
      ],
      byBlock: { 1: { flightLabel: 'A-1', transitS: 60 } },
      usefulMin: 20,
    })
    // o trânsito da disposição por bases antes do do bloco; o bloco 2 só tem trânsito
    expect(r).toMatchObject({ flights: 2, totalS: 705, level: 'ok' })
    expect(r.longest).toEqual({ label: 'A-1', timeS: 660 })
    expect(r.longestFrac).toBeCloseTo(660 / 1200, 12)
    expect(opsSummary({ blocks: [], singleTimeS: null })).toBeNull()
  })

  test('caixas e distâncias: pontos inválidos não contam', () => {
    expect(bboxOfPoints([[Number.NaN, 1], null])).toBeNull()
    expect(bboxOfPoints([em(0, 0), 'x', em(100, 50)])).toEqual([...em(0, 0), ...em(100, 50)])
    expect(baseToRouteM(null, [em(0, 0)])).toBeNull()
    expect(baseToRouteM(em(0, 0), [])).toBeNull()
  })

  test('referência sem rota: a cota da base, sem relevo da rota', () => {
    const r = referenceElevation({ elevationAt: () => 120, basePoint: em(0, 0), waypoints: null })
    expect(r).toMatchObject({ elev: 120, source: 'base', terrainMin: null, reliefM: null })
  })

  test('enums WPML de um payload sem campos WPML nem limites do gimbal', () => {
    expect(missionWpml(null, null)).toEqual({ gimbalPitchRange: null, imageFormat: null })
    const m = missionWpml(AIRCRAFT.M3E, { type: 'lidar' })
    expect(m.droneEnumValue).toBe(AIRCRAFT.M3E.wpml.droneEnumValue)
    expect(m.gimbalPitchRange).toBeNull()
  })

  test('exportação: corredor com LiDAR sem intervalo (sem disparo); órbita sem pitch no 1.º nível', () => {
    const lidar = resolveSensor(PAYLOADS.MAPPER_PLUS, DEFAULT_CUSTOM_SENSOR)
    const plan = generateCorridorPlan([em(0, 0), em(600, 0)], {
      sensor: lidar,
      altitude: 60,
      bufferM: 40,
      sideOverlapPct: 50,
      speed: 6,
    })
    const p = corridorExportParams({
      missionName: 'l',
      plan,
      altitude: 60,
      speed: 6,
      wpml: {},
      photoMode: 'distance',
      photoIntervalM: null,
      sensorType: 'lidar',
    })
    expect(p.photoIntervalM).toBe(0)
    expect(p.triggerMode).toBe('distance')
    const orbita = orbitExportParams({
      missionName: 'o',
      plan: {
        stats: { capture: 'photo', levelCount: 1, heights: [40], flightTimeS: 120 },
        waypoints: [],
        perWaypoint: [],
        perLevel: [{}],
        turnMode: 'x',
      },
      speed: 3,
      wpml: {},
      sensorType: 'camera',
    })
    expect(orbita.gimbalPitch).toBe(-45)
  })
})
