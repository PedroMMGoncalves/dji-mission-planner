/**
 * Corredor partido em voos (src/mission/corridorFlights.js), casos raros: o
 * eixo de um só ponto, a bateria tão curta que nem 60 voos chegam, a
 * primeira estimativa de troços que não chega (as viragens a mais de cada
 * troço), e as rotas dos voos sem relevo, sem bases, com o seguimento de
 * terreno pedido sem relevo ou com o relevo a falhar, e com a foto por
 * waypoint (as acções nos índices da rota junta).
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import {
  CORRIDOR_SPLIT_MARGIN,
  MAX_CORRIDOR_FLIGHTS,
  corridorFlightRoutes,
  planCorridorFlights,
  splitAxis,
} from '../../src/mission/corridorFlights.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { resolveSensor } from '../../src/utils/geo.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const eixo = [em(0, 0), em(2500, 300), em(5000, 0)]
const opcoes = {
  sensor,
  altitude: 60,
  bufferM: 60,
  sideOverlapPct: 70,
  photoIntervalM: 20,
  speed: 8,
}

describe('quantos voos', () => {
  test('eixo de um só ponto: sem plano, e o erro diz porquê', () => {
    expect(planCorridorFlights([em(0, 0)], opcoes, { usableS: 600 })).toEqual({
      error: 'no-plan',
      whole: null,
    })
  })

  test('bateria tão curta que nem o tecto de voos chega: erro, com o plano inteiro', () => {
    const r = planCorridorFlights(eixo, opcoes, { usableS: 60 })
    expect(r.error).toBe('too-many-flights')
    expect(r.flights).toBeUndefined()
    expect(r.whole.stats.flightTimeS / (60 * CORRIDOR_SPLIT_MARGIN)).toBeLessThan(
      MAX_CORRIDOR_FLIGHTS,
    )
  })

  test('a primeira estimativa não chega (viragens de cada troço): um troço a mais', () => {
    const usableS = 700
    const limit = usableS * CORRIDOR_SPLIT_MARGIN
    const r = planCorridorFlights(eixo, opcoes, { usableS })
    const estimativa = Math.ceil(r.whole.stats.flightTimeS / limit)
    expect(estimativa).toBe(3)
    // com três troços o pior voo passa o limite
    const tres = splitAxis(eixo, 3).map((a) => generateCorridorPlan(a, opcoes))
    expect(Math.max(...tres.map((p) => p.stats.flightTimeS))).toBeGreaterThan(limit)
    expect(r.flights).toHaveLength(4)
    for (const f of r.flights) expect(f.plan.stats.flightTimeS).toBeLessThanOrEqual(limit)
    // o prefixo do rótulo é o do chamador
    const outro = planCorridorFlights(eixo, opcoes, { usableS, labelPrefix: 'Norte' })
    expect(outro.flights.map((f) => f.label)).toEqual(['Norte-1', 'Norte-2', 'Norte-3', 'Norte-4'])
  })
})

describe('as rotas dos voos', () => {
  const { flights } = planCorridorFlights(eixo, opcoes, { usableS: 20 * 60 })
  const bases = [
    { id: 'b1', label: 'A', point: em(0, -100), radiusM: null },
    { id: 'b2', label: 'B', point: em(5000, -100), radiusM: null },
  ]
  // relevo a subir para leste
  const elevationAt = (lon) => 100 + 0.02 * (lon + 9.14) * mLon

  test('sem relevo: sem referência nem cota comum, alturas do plano', () => {
    const r = corridorFlightRoutes(flights, { bases, altitude: 60, speed: 8 })
    expect(r.routes.map((x) => x.base.label)).toEqual(
      flights.map((_, i) => (i < flights.length / 2 ? 'A' : 'B')),
    )
    expect(r.routes.every((x) => x.reference === null && x.terrain === null)).toBe(true)
    expect(r.combined.refElev).toBeNull()
    expect(r.combined.perWaypoint).toBeNull()
    const n = flights.reduce((s, f) => s + f.plan.waypoints.length, 0)
    expect(r.combined.waypoints).toHaveLength(n)
    // sem cota comum nada se desloca: a altura do plano, ou a de voo sem ela
    const h0 = flights[0].plan.waypoints[0][2]
    expect(r.combined.waypoints[0][2]).toBe(Number.isFinite(h0) ? h0 : 60)
  })

  test('sem bases: a referência é a mínima do relevo debaixo do troço', () => {
    const r = corridorFlightRoutes(flights, { elevationAt, altitude: 60, speed: 8 })
    for (const x of r.routes) {
      expect(x.base).toBeNull()
      expect(x.reference.source).toBe('area-min')
    }
    // a cota comum é a do troço mais a oeste (o relevo sobe para leste)
    expect(r.combined.refElev).toBeCloseTo(r.routes[0].reference.elev, 6)
    const ultimo = r.routes[r.routes.length - 1]
    const at = r.combined.breaks[r.combined.breaks.length - 1]
    const dh = ultimo.reference.elev - r.combined.refElev
    expect(dh).toBeGreaterThan(50)
    expect(r.combined.waypoints[at][2]).toBeCloseTo((ultimo.route.waypoints[0][2] ?? 60) + dh, 6)
  })

  test('seguimento de terreno pedido sem relevo carregado: cada voo diz que falta, rota plana', () => {
    const r = corridorFlightRoutes(flights, {
      bases,
      elevationAt,
      terrainFollow: { enabled: true, tolerance: 3 },
      terrainData: null,
      altitude: 60,
      speed: 8,
    })
    for (const x of r.routes) {
      expect(x.terrain).toEqual({ error: 'terrain-not-loaded' })
      expect(x.route).toBe(x.plan)
    }
  })

  test('o relevo a falhar a meio do cálculo: o erro fica no voo, sem rebentar', () => {
    const falha = (msg) => ({
      elevationAt: () => {
        throw msg ? new Error(msg) : {}
      },
    })
    const comMensagem = corridorFlightRoutes(flights.slice(0, 1), {
      bases,
      elevationAt,
      terrainFollow: { enabled: true, tolerance: 3 },
      terrainData: falha('tile corrompido'),
      altitude: 60,
      speed: 8,
    })
    expect(comMensagem.routes[0].terrain).toEqual({ error: 'tile corrompido' })
    expect(comMensagem.routes[0].route).toBe(flights[0].plan)
    const semMensagem = corridorFlightRoutes(flights.slice(0, 1), {
      bases,
      elevationAt,
      terrainFollow: { enabled: true, tolerance: 3 },
      terrainData: falha(null),
      altitude: 60,
      speed: 8,
    })
    expect(semMensagem.routes[0].terrain).toEqual({ error: 'terrain-failed' })
  })

  test('foto por waypoint: as acções de cada voo nos índices da rota junta', () => {
    const porPonto = planCorridorFlights(
      eixo,
      { ...opcoes, photoMode: 'waypoint', waypointStops: 'all' },
      { usableS: 20 * 60 },
    )
    expect(porPonto.flights.length).toBeGreaterThan(1)
    const r = corridorFlightRoutes(porPonto.flights, { bases, altitude: 60, speed: 8 })
    const pw = r.combined.perWaypoint
    expect(pw).not.toBeNull()
    let offset = 0
    for (const f of porPonto.flights) {
      f.plan.perWaypoint.forEach((a, k) => {
        if (a) expect(pw[offset + k]).toBe(a)
      })
      offset += f.plan.waypoints.length
    }
    expect(pw.length).toBeLessThanOrEqual(offset)
  })
})
