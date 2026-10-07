/**
 * Ficheiro de projecto e blocos de voo — lógica que vivia no App.jsx.
 */
import { describe, expect, test } from 'vitest'
import {
  MISSION_MODES,
  normalizeProject,
  projectFileName,
  serializeProject,
} from '../../src/mission/project.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { generateFlightPlan, splitIntoBlocks, squareSideForBattery } from '../../src/utils/geo.js'
import { followBatteryIfEqual, defaultEquipment } from '../../src/mission/equipment.js'
import { DEFAULT_CORRIDOR_CONFIG, normalizeCorridorConfig } from '../../src/utils/corridor.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]

describe('projecto: serializar e ler', () => {
  const estado = {
    missionName: 'Quinta',
    drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' },
    custom: { focalLength: 12 },
    payloadTuning: {},
    battery: { batteryId: 'padrao', usefulMin: 28 },
    inspectPoints: [{ id: 3, point: [-9.14, 38.7] }],
    missionMode: 'corridor',
    faceConfig: {},
    corridorConfig: { ...DEFAULT_CORRIDOR_CONFIG, bufferM: 80 },
    orbitConfig: {},
    params: { altitude: 90, triggerMode: 'distance' },
    split: { mode: 'area', maxAreaHa: 10, reservePct: 0 },
    anchor: { center: null },
    ring: [em(0, 0), em(100, 0), em(100, 100)],
    areaOrigin: 'draw',
    bases: [
      { id: 'b1', label: 'A', point: em(5, 5), radiusM: null },
      { id: 'b2', label: 'B', point: em(900, 5), radiusM: 60 },
    ],
    blockBase: { 3: 'b2' },
    disabledTiles: new Set([2, 5]),
    terrainFollow: { enabled: true, tolerance: 5 },
    gcpConfig: { enabled: false },
  }

  test('ida e volta: o que se grava lê-se igual', () => {
    const json = JSON.parse(JSON.stringify(serializeProject(estado)))
    expect(json.version).toBe(2)
    expect(json.disabledTiles).toEqual([2, 5])
    const n = normalizeProject(json)
    expect(n.missionName).toBe('Quinta')
    expect(n.drone).toEqual({ ...estado.drone, rtk: false })
    expect(n.ring).toEqual(estado.ring)
    // bases e atribuições manuais voltam iguais; a base única antiga já não se escreve
    expect(json.basePoint).toBeUndefined()
    expect(n.bases).toEqual(estado.bases)
    expect(n.blockBase).toEqual({ 3: 'b2' })
    expect(n.legacyMosaic).toBeUndefined()
    expect([...n.disabledTiles]).toEqual([2, 5])
    expect(n.corridorConfig.bufferM).toBe(80)
    expect(n.inspectPoints).toHaveLength(1)
    expect(n.nextInspectId).toBe(4)
    expect(n.missionMode).toBe('corridor')
    expect(n.legacyBatteryMin).toBeUndefined()
    // a bateria da missão volta tal como foi gravada, sem reserva por cima
    expect(json.battery).toEqual({ batteryId: 'padrao', usefulMin: 28 })
    expect(json.batteryByCombo).toBeUndefined()
    expect(n.battery).toEqual({ aircraftId: 'M3E', batteryId: 'padrao', usefulMin: 28 })
    // a geração do mosaico vai no ficheiro; a orientação dos quadrados segue as faixas
    expect(json.split.mosaic).toBe(2)
    expect(n.split).toEqual({
      mode: 'area',
      maxAreaHa: 10,
      reservePct: 0,
      mosaic: 2,
      tileOrientationAuto: true,
    })
  })

  test('v1: droneId migra para a selecção nova e o batteryMin do split vira tempo útil', () => {
    const n = normalizeProject({
      version: 1,
      droneId: 'M3E',
      split: { mode: 'area', batteryMin: 25 },
      ring: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    })
    expect(n.drone).toBeTruthy()
    expect(n.drone.aircraftId).toBeTruthy()
    // a duração nominal do v1 (25 min) com a reserva por omissão de então
    // (30 %) dá o mesmo tempo útil de antes: 17.5 min, sem reserva por cima
    expect(n.split).toEqual({ mode: 'area', reservePct: 0, mosaic: 2, tileOrientationAuto: true })
    expect(n.battery).toEqual({ aircraftId: n.drone.aircraftId, batteryId: null, usefulMin: 17.5 })
  })

  test('lixo: versão desconhecida é recusada; modo inválido e pontos sem coordenadas são ignorados', () => {
    expect(normalizeProject(null)).toBeNull()
    expect(normalizeProject({ version: 3 })).toBeNull()
    expect(normalizeProject('x')).toBeNull()
    const n = normalizeProject({
      version: 2,
      missionMode: 'zz',
      inspectPoints: [{ id: 1 }, { id: 2, point: [0, 0] }],
      basePoint: 'x',
      disabledTiles: 'x',
    })
    expect(n.missionMode).toBeUndefined()
    expect(n.inspectPoints).toEqual([{ id: 2, point: [0, 0] }])
    expect(n.nextInspectId).toBe(3)
    expect(n.bases).toEqual([])
    expect(n.blockBase).toEqual({})
    expect(n.disabledTiles.size).toBe(0)
    expect(n.areaOrigin).toBeNull()
  })

  test('paragem nos waypoints: omissao nos cantos, corredor antigo abre nos cantos', () => {
    expect(DEFAULT_CORRIDOR_CONFIG.waypointStops).toBe('corners')
    const n = normalizeProject({ version: 2, corridorConfig: { centreline: null, bufferM: 50 } })
    expect(n.corridorConfig.waypointStops).toBe('corners')
    const c = normalizeProject({
      version: 2,
      missionMode: 'circular',
      circularConfig: { radiusM: 45, overlapPct: 40 },
    })
    expect(c.missionMode).toBe('circular')
    expect(c.circularConfig).toMatchObject({ radiusM: 45, overlapPct: 40, gimbalPitch: -45 })
    // guardado no separador circular antes do marcador `enabled`: existia
    expect(c.circularConfig.enabled).toBe(true)
    // guardado noutro separador: nunca foi criada
    const d = normalizeProject({ version: 2, missionMode: 'area', circularConfig: { radiusM: 45 } })
    expect(d.circularConfig.enabled).toBe(false)
    // marcador explicito manda
    const e = normalizeProject({
      version: 2,
      missionMode: 'circular',
      circularConfig: { enabled: false },
    })
    expect(e.circularConfig.enabled).toBe(false)
    expect(normalizeCorridorConfig({ waypointStops: 'all' }).waypointStops).toBe('all')
    expect(normalizeCorridorConfig({ waypointStops: 'x' }).waypointStops).toBe('corners')
  })

  test('nome do ficheiro', () => {
    expect(projectFileName('Quinta do Lago')).toBe('Quinta-do-Lago-projeto.json')
    expect(projectFileName('   ')).toBe('missao-projeto.json')
    expect(MISSION_MODES).toContain('corridor')
  })
})

describe('projecto: migração da bateria (duração nominal + reserva → tempo útil)', () => {
  const ring = [em(0, 0), em(900, 0), em(900, 600), em(0, 600)]
  const plan = generateFlightPlan(ring, {
    spacingM: 40,
    angleDeg: 90,
    bufferPct: 0,
    photoIntervalM: 20,
    speed: 8,
    overshootM: 0,
    tieLine: false,
    photoMode: 'distance',
  })

  test('override da combinação e reserva guardada: tempo útil equivalente e reserva 0', () => {
    const n = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      batteryByCombo: { 'M300RTK:P1': 50, 'M3E:M3E_WIDE': 20 },
      split: { mode: 'battery', reservePct: 20, maxSide: 500 },
    })
    expect(n.battery).toEqual({ aircraftId: 'M300RTK', batteryId: null, usefulMin: 40 })
    expect(n.split).toEqual({
      mode: 'battery',
      reservePct: 0,
      maxSide: 500,
      mosaic: 2,
      tileOrientationAuto: true,
    })
  })

  test('sem override nem reserva: duração do catálogo com os 30 % de então', () => {
    const m300 = normalizeProject({ version: 2, drone: { aircraftId: 'M300RTK', payloadId: 'P1' } })
    expect(m300.battery.usefulMin).toBe(38.5) // 55 × 0.7
    expect(m300.split.reservePct).toBe(0)
    const m4t = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M4T', payloadId: 'M4T_WIDE' },
      split: { mode: 'area' },
    })
    expect(m4t.battery.usefulMin).toBe(34.5) // 49 × 0.7 = 34.3, ao meio minuto
  })

  test('os blocos de um projecto antigo não mudam', () => {
    const old = {
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      batteryByCombo: { 'M300RTK:P1': 30 },
      split: { mode: 'battery', reservePct: 30 },
    }
    const n = normalizeProject(old)
    const base = { speed: 8, spacingM: 40, transitS: 0, maxSideM: 2000 }
    // lado do quadrado por bateria: antes nominal + reserva, agora útil + 0
    expect(squareSideForBattery({ ...base, batteryMin: n.battery.usefulMin, ...n.split })).toBe(
      squareSideForBattery({ ...base, batteryMin: 30, reservePct: 30 }),
    )
    // corte da serpentina por tempo: os mesmos blocos, com os mesmos tempos
    const cut = (batteryMin, reservePct) =>
      splitIntoBlocks(plan, { mode: 'battery', batteryMin, reservePct, speed: 8, spacingM: 40 })
    const antes = cut(30, 30)
    const depois = cut(n.battery.usefulMin, n.split.reservePct)
    expect(antes.length).toBeGreaterThan(1)
    expect(depois.map((b) => b.lines.length)).toEqual(antes.map((b) => b.lines.length))
  })

  test('projecto de hoje: o tempo útil guardado manda; reserva editada à mão entra nele', () => {
    const hoje = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      battery: { batteryId: 'TB65', usefulMin: 28 },
      split: { mode: 'battery', reservePct: 0 },
    })
    expect(hoje.battery).toEqual({ aircraftId: 'M300RTK', batteryId: 'TB65', usefulMin: 28 })
    expect(hoje.split.reservePct).toBe(0)
    const mao = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      battery: { batteryId: 'TB65', usefulMin: 30 },
      split: { reservePct: 20 },
    })
    expect(mao.battery.usefulMin).toBe(24)
    expect(mao.split.reservePct).toBe(0)
    const lixo = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      battery: { batteryId: 5, usefulMin: 'x' },
    })
    expect(lixo.battery).toEqual({ aircraftId: 'M300RTK', batteryId: null, usefulMin: null })
    expect(
      normalizeProject({ version: 2, drone: { aircraftId: 'M3E' }, battery: { usefulMin: 500 } })
        .battery.usefulMin,
    ).toBe(120)
  })

  test('ao abrir: tempo igual ao do equipamento passa a seguir a bateria', () => {
    const eq = defaultEquipment()
    const n = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1' },
      battery: { batteryId: 'TB65', usefulMin: 28 },
    })
    expect(followBatteryIfEqual(eq, n.battery)).toEqual({
      aircraftId: 'M300RTK',
      batteryId: 'TB65',
      usefulMin: null,
    })
    // projecto antigo: 38.5 min não é o tempo de nenhuma bateria, fica como acerto
    const old = normalizeProject({ version: 2, drone: { aircraftId: 'M300RTK', payloadId: 'P1' } })
    expect(followBatteryIfEqual(eq, old.battery).usefulMin).toBe(38.5)
  })
})

describe('planBlocks', () => {
  const ring = [em(0, 0), em(600, 0), em(600, 400), em(0, 400)]
  const opts = {
    spacingM: 40,
    angleDeg: 90,
    bufferPct: 0,
    photoIntervalM: 20,
    speed: 8,
    overshootM: 0,
    tieLine: false,
    photoMode: 'distance',
  }
  const split = { mode: 'area', maxAreaHa: 4, reservePct: 30 }

  test('células: um bloco por célula, com a grelha nadir local da célula', () => {
    const cells = [
      {
        lines: [[em(0, 0), em(1, 0)]],
        waypoints: [em(0, 0), em(1, 0)],
        stats: { areaHa: 1, totalLineLengthM: 10, flightTimeS: 5 },
        nadirStartLine: 1,
      },
      {
        lines: [[em(0, 1), em(1, 1)]],
        waypoints: [em(0, 1), em(1, 1)],
        stats: { areaHa: 2, totalLineLengthM: 20 },
      },
    ]
    const b = planBlocks(
      { cellPlans: cells },
      { activeCells: [1, 2], split, batteryMin: 30, speed: 8, spacingM: 40 },
    )
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

  test('faixas: a política de paragem chega ao corte da serpentina', () => {
    const plan = generateFlightPlan(ring, { ...opts, photoMode: 'waypoint' })
    const args = { split, batteryMin: 30, speed: 8, spacingM: 40 }
    const cantos = planBlocks(plan, args)
    const todos = planBlocks(plan, { ...args, waypointStops: 'all' })
    const soma = (b) => b.reduce((s, x) => s + x.timeS, 0)
    expect(soma(todos)).toBeGreaterThan(soma(cantos))
  })

  test('sem divisão ou em modo bateria/mosaico sem células: null', () => {
    const plan = generateFlightPlan(ring, opts)
    expect(planBlocks(null, { split, batteryMin: 30, speed: 8, spacingM: 40 })).toBeNull()
    expect(
      planBlocks(plan, {
        split: { ...split, mode: 'none' },
        batteryMin: 30,
        speed: 8,
        spacingM: 40,
      }),
    ).toBeNull()
    expect(
      planBlocks(plan, {
        split: { ...split, mode: 'battery' },
        batteryMin: 30,
        speed: 8,
        spacingM: 40,
      }),
    ).toBeNull()
  })
})

describe('planArea', () => {
  const ring = [em(0, 0), em(800, 0), em(800, 400), em(0, 400)]
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

  test('sem células é o plano simples; com células compõe um plano por célula com faixas colineares', async () => {
    const { planArea } = await import('../../src/mission/areaPlan.js')
    const simples = planArea(ring, null, opts)
    expect(simples.error).toBeUndefined()
    expect(simples.cellPlans).toBeUndefined()
    const cells = [
      [em(0, 0), em(400, 0), em(400, 400), em(0, 400)],
      [em(400, 0), em(800, 0), em(800, 400), em(400, 400)],
    ]
    const composto = planArea(ring, cells, opts)
    expect(composto.error).toBeUndefined()
    expect(composto.cellPlans).toHaveLength(2)
    expect(composto.lines.length).toBe(
      composto.cellPlans[0].lines.length + composto.cellPlans[1].lines.length,
    )
    // alinhamento global: as faixas E-O das duas células partilham as latitudes
    const lats = (p) => new Set(p.lines.map(([a]) => a[1].toFixed(7)))
    const l0 = lats(composto.cellPlans[0])
    expect([...lats(composto.cellPlans[1])].every((y) => l0.has(y))).toBe(true)
    expect(planArea(null, null, opts)).toBeNull()
  })
})
