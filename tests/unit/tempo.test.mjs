// Modelo de tempo: custo de viragem proporcional a velocidade e
// comprimento de rota 3D quando os waypoints levam altura.
import { describe, it, expect } from 'vitest'
import {
  TURN_ACCEL_MS2,
  generateFlightLines,
  resolveSensor,
  routeLengthM,
  routeStats,
  splitIntoBlocks,
  squareSideForBattery,
  stopCostS,
  stripRouteStats,
  turnCostS,
} from '../../src/utils/geo.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-9.14 + x / mLon, lat0 + y / 110574] : [-9.14 + x / mLon, lat0 + y / 110574, z]

describe('custo de viragem', () => {
  it('cresce com a velocidade, como travar e voltar a acelerar', () => {
    expect(turnCostS(10)).toBeCloseTo(10 / TURN_ACCEL_MS2, 6)
    expect(turnCostS(15)).toBeCloseTo(1.5 * turnCostS(10), 6)
  })
  it('coincide com os 3 s antigos perto dos 5 m/s e e maior acima disso', () => {
    expect(turnCostS(5)).toBeGreaterThan(2.5)
    expect(turnCostS(5)).toBeLessThan(3.5)
    expect(turnCostS(15)).toBeGreaterThan(3)
  })
  it('e nulo sem velocidade', () => {
    expect(turnCostS(0)).toBe(0)
    expect(turnCostS(-4)).toBe(0)
  })
})

describe('comprimento da rota', () => {
  it('e o horizontal quando os waypoints nao tem altura', () => {
    expect(routeLengthM([em(0, 0), em(300, 0)])).toBeCloseTo(300, 0)
  })
  it('inclui a componente vertical quando os waypoints a tem', () => {
    // 300 m na horizontal com 400 m de subida = 500 m (3-4-5)
    expect(routeLengthM([em(0, 0, 0), em(300, 0, 400)])).toBeCloseTo(500, 0)
  })
  it('ignora a altura quando so um dos extremos a tem', () => {
    expect(routeLengthM([em(0, 0), em(300, 0, 400)])).toBeCloseTo(300, 0)
  })
  it('uma rota plana com alturas iguais mede o mesmo que sem alturas', () => {
    const com = routeLengthM([em(0, 0, 80), em(300, 0, 80), em(300, 200, 80)])
    const sem = routeLengthM([em(0, 0), em(300, 0), em(300, 200)])
    expect(com).toBeCloseTo(sem, 6)
  })
  it('rota com menos de dois pontos mede zero', () => {
    expect(routeLengthM([])).toBe(0)
    expect(routeLengthM([em(0, 0)])).toBe(0)
  })
})

describe('routeStats', () => {
  it('soma o percurso e uma viragem por par de faixas consecutivas', () => {
    const r = routeStats([em(0, 0), em(400, 0), em(400, 50), em(0, 50)], { speed: 10, turns: 2 })
    // a conversao local metros/grau nao e exacta: tolerancia de 1 m em 850
    expect(r.pathLengthM).toBeGreaterThan(845)
    expect(r.pathLengthM).toBeLessThan(855)
    expect(r.flightTimeS).toBeCloseTo(r.pathLengthM / 10 + 2 * turnCostS(10), 6)
  })
  it('sem velocidade nao ha tempo, mas ha comprimento', () => {
    const r = routeStats([em(0, 0), em(400, 0)], { speed: 0 })
    expect(r.flightTimeS).toBeNull()
    expect(r.pathLengthM).toBeCloseTo(400, 0)
  })
  it('viragens negativas nao descontam tempo', () => {
    const r = routeStats([em(0, 0), em(400, 0)], { speed: 10, turns: -3 })
    expect(r.flightTimeS).toBeCloseTo(r.pathLengthM / 10, 6)
  })
})

describe('lado por bateria', () => {
  it('com paragem em cada foto o lado encolhe, e o quadrado continua a caber', () => {
    const base = { batteryMin: 12, reservePct: 30, spacingM: 40, speed: 8, maxSideM: 2000 }
    const sem = squareSideForBattery(base)
    expect(squareSideForBattery({ ...base, stopEveryM: 0 })).toBe(sem)
    const com = squareSideForBattery({ ...base, stopEveryM: 20 })
    expect(com).toBeLessThan(sem)
    // o mesmo modelo do dimensionamento, com as paragens: cabe no tempo util
    const L = com
    const s = 40
    const v = 8
    const turn = turnCostS(v)
    const paragens = (L * L * stopCostS(1, v)) / (s * 20)
    const t = (L * L) / (s * v) + L * (2 / v + turn / s) + turn + paragens
    expect(t).toBeLessThanOrEqual(12 * 60 * 0.7)
  })

  it('encolhe quando a viragem fica mais cara, ou seja com mais velocidade', () => {
    // bateria curta para o resultado nao bater no tecto de 500 m
    const base = { batteryMin: 8, reservePct: 30, spacingM: 50 }
    const lento = squareSideForBattery({ ...base, speed: 5 })
    const rapido = squareSideForBattery({ ...base, speed: 15 })
    // mais velocidade cobre mais terreno, mesmo com viragens mais caras
    expect(rapido).toBeGreaterThan(lento)
    // e continua limitado pelo tecto de conforto VLOS
    expect(rapido).toBeLessThan(500)
    expect(squareSideForBattery({ ...base, batteryMin: 120, speed: 15 })).toBe(500)
  })
})

// Paragem nos waypoints: com 'all' o tempo conta as paragens intermedias;
// com 'corners' (omissao) fica exactamente o de antes.
describe('paragens no tempo previsto', () => {
  const ring = [em(0, 0), em(300, 0), em(300, 200), em(0, 200)]
  const opts = { spacingM: 40, angleDeg: 90, bufferPct: 0, photoIntervalM: 20, speed: 8 }
  const wp = { ...opts, photoMode: 'waypoint' }
  const split = { mode: 'battery', batteryMin: 3, reservePct: 30, speed: 8, spacingM: 40 }

  it("distancia: 'all' nao muda nada, so ha cantos", () => {
    const a = generateFlightLines(ring, opts)
    const b = generateFlightLines(ring, { ...opts, waypointStops: 'all' })
    expect(b.stats.flightTimeS).toBe(a.stats.flightTimeS)
  })

  it("foto por waypoint: 'all' soma uma paragem por foto intermedia", () => {
    const a = generateFlightLines(ring, wp)
    const b = generateFlightLines(ring, { ...wp, waypointStops: 'all' })
    const n = a.waypoints.length - 2 * a.lines.length
    expect(n).toBeGreaterThan(0)
    expect(b.stats.flightTimeS - a.stats.flightTimeS).toBeCloseTo(stopCostS(n, 8), 6)
  })

  it('blocos por bateria contam as paragens e cortam mais cedo', () => {
    const plan = generateFlightLines(ring, wp)
    const c = splitIntoBlocks(plan, split)
    const t = splitIntoBlocks(plan, { ...split, waypointStops: 'all' })
    expect(t.length).toBeGreaterThan(c.length)
    for (const b of t) {
      const r = stripRouteStats(b.waypoints, {
        speed: 8,
        lineCount: b.lines.length,
        perLine: b.perLine,
        waypointStops: 'all',
      })
      expect(b.timeS).toBeCloseTo(r.flightTimeS + b.transitS, 6)
    }
  })

  it("'corners' deixa os blocos exactamente como estavam", () => {
    const plan = generateFlightLines(ring, wp)
    expect(splitIntoBlocks(plan, { ...split, waypointStops: 'corners' })).toEqual(
      splitIntoBlocks(plan, split),
    )
  })

  it("corredor: 'all' soma as fotos intermedias", () => {
    const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
    const axis = [
      [-9.14, 38.7],
      [-9.13, 38.7],
      [-9.125, 38.7035],
    ]
    const o = {
      sensor,
      altitude: 100,
      bufferM: 150,
      sideOverlapPct: 70,
      photoIntervalM: 20,
      speed: 8,
      photoMode: 'waypoint',
    }
    const a = generateCorridorPlan(axis, o)
    const b = generateCorridorPlan(axis, { ...o, waypointStops: 'all' })
    const n = a.waypoints.length - 2 * a.lines.length
    expect(n).toBeGreaterThan(0)
    expect(b.stats.flightTimeS - a.stats.flightTimeS).toBeCloseTo(stopCostS(n, 8), 6)
  })
})
