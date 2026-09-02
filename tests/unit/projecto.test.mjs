/**
 * Ficheiro de projecto e blocos de voo — lógica que vivia no App.jsx.
 */
import { describe, expect, test } from 'vitest'
import { MISSION_MODES, normalizeProject, projectFileName, serializeProject } from '../../src/mission/project.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { generateFlightPlan } from '../../src/utils/geo.js'
import { DEFAULT_CORRIDOR_CONFIG } from '../../src/utils/corridor.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]

describe('projecto: serializar e ler', () => {
  const estado = {
    missionName: 'Quinta', drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' }, custom: { focalLength: 12 },
    payloadTuning: {}, batteryByCombo: { 'M3E:M3E_WIDE': 28 }, inspectPoints: [{ id: 3, point: [-9.14, 38.7] }],
    missionMode: 'corridor', faceConfig: {}, corridorConfig: { ...DEFAULT_CORRIDOR_CONFIG, bufferM: 80 },
    orbitConfig: {}, params: { altitude: 90, triggerMode: 'distance' }, split: { mode: 'area', maxAreaHa: 10, reservePct: 30 },
    anchor: { center: null }, ring: [em(0, 0), em(100, 0), em(100, 100)], areaOrigin: 'draw', basePoint: em(5, 5),
    disabledTiles: new Set([2, 5]), terrainFollow: { enabled: true, tolerance: 5 }, gcpConfig: { enabled: false },
  }

  test('ida e volta: o que se grava lê-se igual', () => {
    const json = JSON.parse(JSON.stringify(serializeProject(estado)))
    expect(json.version).toBe(2)
    expect(json.disabledTiles).toEqual([2, 5])
    const n = normalizeProject(json)
    expect(n.missionName).toBe('Quinta')
    expect(n.drone).toEqual(estado.drone)
    expect(n.ring).toEqual(estado.ring)
    expect(n.basePoint).toEqual(estado.basePoint)
    expect([...n.disabledTiles]).toEqual([2, 5])
    expect(n.corridorConfig.bufferM).toBe(80)
    expect(n.inspectPoints).toHaveLength(1)
    expect(n.nextInspectId).toBe(4)
    expect(n.missionMode).toBe('corridor')
    expect(n.legacyBatteryMin).toBeUndefined()
  })

  test('v1: droneId migra para a selecção nova e o batteryMin do split vira override', () => {
    const n = normalizeProject({ version: 1, droneId: 'M3E', split: { mode: 'area', batteryMin: 25 }, ring: [[0, 0], [1, 0], [1, 1]] })
    expect(n.drone).toBeTruthy()
    expect(n.drone.aircraftId).toBeTruthy()
    expect(n.split).toEqual({ mode: 'area' })
    expect(n.legacyBatteryMin).toBe(25)
  })

  test('lixo: versão desconhecida é recusada; modo inválido e pontos sem coordenadas são ignorados', () => {
    expect(normalizeProject(null)).toBeNull()
    expect(normalizeProject({ version: 3 })).toBeNull()
    expect(normalizeProject('x')).toBeNull()
    const n = normalizeProject({ version: 2, missionMode: 'zz', inspectPoints: [{ id: 1 }, { id: 2, point: [0, 0] }], basePoint: 'x', disabledTiles: 'x' })
    expect(n.missionMode).toBeUndefined()
    expect(n.inspectPoints).toEqual([{ id: 2, point: [0, 0] }])
    expect(n.nextInspectId).toBe(3)
    expect(n.basePoint).toBeNull()
    expect(n.disabledTiles.size).toBe(0)
    expect(n.areaOrigin).toBeNull()
  })

  test('nome do ficheiro', () => {
    expect(projectFileName('Quinta do Lago')).toBe('Quinta-do-Lago-projeto.json')
    expect(projectFileName('   ')).toBe('missao-projeto.json')
    expect(MISSION_MODES).toContain('corridor')
  })
})

describe('planBlocks', () => {
  const ring = [em(0, 0), em(600, 0), em(600, 400), em(0, 400)]
  const opts = { spacingM: 40, angleDeg: 90, bufferPct: 0, photoIntervalM: 20, speed: 8, overshootM: 0, tieLine: false, photoMode: 'distance' }
  const split = { mode: 'area', maxAreaHa: 4, reservePct: 30 }

  test('células: um bloco por célula, com a grelha nadir local da célula', () => {
    const cells = [
      { lines: [[em(0, 0), em(1, 0)]], waypoints: [em(0, 0), em(1, 0)], stats: { areaHa: 1, totalLineLengthM: 10, flightTimeS: 5 }, nadirStartLine: 1 },
      { lines: [[em(0, 1), em(1, 1)]], waypoints: [em(0, 1), em(1, 1)], stats: { areaHa: 2, totalLineLengthM: 20 } },
    ]
    const b = planBlocks({ cellPlans: cells }, { activeCells: [1, 2], split, batteryMin: 30, speed: 8, spacingM: 40 })
    expect(b.map((x) => x.id)).toEqual([1, 2])
    expect(b[0].nadirLineLocal).toBe(1)
    expect(b[1].nadirLineLocal).toBeNull()
    expect(b[1].timeS).toBe(0)
  })

  test('faixas: a serpentina é cortada por área e cada bloco sabe onde começa a grelha nadir', () => {
    const plan = generateFlightPlan(ring, { ...opts, crosshatch: true, includeNadir: true })
    expect(plan.error).toBeUndefined()
    const b = planBlocks(plan, { split, batteryMin: 30, speed: 8, spacingM: 40 })
    expect(b.length).toBeGreaterThan(1)
    expect(b.reduce((s, x) => s + x.lines.length, 0)).toBe(plan.lines.length)
    const locals = b.map((x) => x.nadirLineLocal)
    expect(locals.some((v) => v != null)).toBe(true)
    // antes da grelha nadir: null; a partir dela: 0 (bloco inteiramente nadir)
    const primeiro = locals.findIndex((v) => v != null)
    expect(locals.slice(primeiro + 1).every((v) => v === 0)).toBe(true)
  })

  test('sem divisão ou em modo bateria/mosaico sem células: null', () => {
    const plan = generateFlightPlan(ring, opts)
    expect(planBlocks(null, { split, batteryMin: 30, speed: 8, spacingM: 40 })).toBeNull()
    expect(planBlocks(plan, { split: { ...split, mode: 'none' }, batteryMin: 30, speed: 8, spacingM: 40 })).toBeNull()
    expect(planBlocks(plan, { split: { ...split, mode: 'battery' }, batteryMin: 30, speed: 8, spacingM: 40 })).toBeNull()
  })
})

describe('planArea', () => {
  const ring = [em(0, 0), em(800, 0), em(800, 400), em(0, 400)]
  const opts = { spacingM: 40, angleDeg: 90, bufferPct: 0, photoIntervalM: 20, speed: 8, overshootM: 0, tieLine: false, photoMode: 'distance', crosshatch: false, includeNadir: false }

  test('sem células é o plano simples; com células compõe um plano por célula com faixas colineares', async () => {
    const { planArea } = await import('../../src/mission/areaPlan.js')
    const simples = planArea(ring, null, opts)
    expect(simples.error).toBeUndefined()
    expect(simples.cellPlans).toBeUndefined()
    const cells = [[em(0, 0), em(400, 0), em(400, 400), em(0, 400)], [em(400, 0), em(800, 0), em(800, 400), em(400, 400)]]
    const composto = planArea(ring, cells, opts)
    expect(composto.error).toBeUndefined()
    expect(composto.cellPlans).toHaveLength(2)
    expect(composto.lines.length).toBe(composto.cellPlans[0].lines.length + composto.cellPlans[1].lines.length)
    // alinhamento global: as faixas E-O das duas células partilham as latitudes
    const lats = (p) => new Set(p.lines.map(([a]) => a[1].toFixed(7)))
    const l0 = lats(composto.cellPlans[0])
    expect([...lats(composto.cellPlans[1])].every((y) => l0.has(y))).toBe(true)
    expect(planArea(null, null, opts)).toBeNull()
  })
})
