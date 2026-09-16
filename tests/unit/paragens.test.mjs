/**
 * Paragem nos waypoints: que pontos são cantos, e quanto custa parar nos
 * outros. O modo das grelhas pára em cada waypoint; com a política
 * 'corners' só os cantos das faixas param (docs/METODOS.md, §6 e §11).
 */
import { describe, expect, test } from 'vitest'
import {
  intermediateStops,
  normalizeWaypointStops,
  passThroughFor,
  routeStats,
  stopCostS,
  stripRouteStats,
  turnCostS,
} from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]

describe('normalizeWaypointStops', () => {
  test("so 'all' fica 'all'; o resto, projectos antigos incluidos, e 'corners'", () => {
    expect(normalizeWaypointStops('all')).toBe('all')
    for (const v of ['corners', undefined, null, 'x', 1]) {
      expect(normalizeWaypointStops(v)).toBe('corners')
    }
  })
})

describe('passThroughFor', () => {
  test('duas por faixa: so cantos, sem lista', () => {
    expect(passThroughFor([2, 2, 2])).toBeNull()
  })

  test("'all' nunca passa", () => {
    expect(passThroughFor([5, 5], null, 'all')).toBeNull()
  })

  test('foto por waypoint: passam os do meio de cada faixa', () => {
    expect(passThroughFor([4, 3])).toEqual([false, true, true, false, false, true, false])
  })

  test('terreno: os pontos da ligacao passam, o inicio da faixa e canto', () => {
    // faixa 0: 3 pontos; faixa 1: 2 da ligacao + 3 da faixa
    const esperado = [false, true, false, true, true, false, true, false]
    expect(passThroughFor([3, 5], [0, 2])).toEqual(esperado)
  })

  test('sem perLine: null', () => {
    expect(passThroughFor(null)).toBeNull()
  })
})

describe('custo das paragens', () => {
  test('cada paragem e meia inversao', () => {
    expect(stopCostS(4, 8)).toBeCloseTo(2 * turnCostS(8), 9)
    expect(stopCostS(0, 8)).toBe(0)
    expect(stopCostS(3, 0)).toBe(0)
  })

  test('intermedios: tudo menos os dois cantos de cada grupo', () => {
    expect(intermediateStops([2, 5, 3, 1])).toBe(0 + 3 + 1 + 0)
  })
})

describe('stripRouteStats', () => {
  const wps = [em(0, 0), em(100, 0), em(200, 0), em(200, 40), em(100, 40), em(0, 40)]

  test("'corners' e exactamente o routeStats com n-1 inversoes", () => {
    expect(stripRouteStats(wps, { speed: 8, lineCount: 2, perLine: [3, 3] })).toEqual(
      routeStats(wps, { speed: 8, turns: 1 }),
    )
  })

  test("'all' soma as paragens intermedias", () => {
    const base = routeStats(wps, { speed: 8, turns: 1 })
    const all = stripRouteStats(wps, {
      speed: 8,
      lineCount: 2,
      perLine: [3, 3],
      waypointStops: 'all',
    })
    expect(all.pathLengthM).toBe(base.pathLengthM)
    expect(all.flightTimeS).toBeCloseTo(base.flightTimeS + stopCostS(2, 8), 9)
  })

  test('sem perLine: duas por faixa, nada a somar', () => {
    const wps2 = [em(0, 0), em(200, 0), em(200, 40), em(0, 40)]
    expect(
      stripRouteStats(wps2, { speed: 8, lineCount: 2, waypointStops: 'all' }).flightTimeS,
    ).toBe(routeStats(wps2, { speed: 8, turns: 1 }).flightTimeS)
  })

  test('sem velocidade: tempo null', () => {
    const r = stripRouteStats(wps, { speed: 0, lineCount: 2, waypointStops: 'all' })
    expect(r.flightTimeS).toBeNull()
  })
})
