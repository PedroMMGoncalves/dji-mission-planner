/**
 * Corredor partido em voos (src/mission/corridorFlights.js): o número mínimo
 * de troços para cada voo caber na bateria, troços contíguos ao longo do
 * eixo e sobreposição nos cortes.
 */
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import JSZip from 'jszip'
import {
  CORRIDOR_SPLIT_MARGIN,
  corridorFlightRoutes,
  planCorridorFlights,
  splitAxis,
} from '../../src/mission/corridorFlights.js'
import { corridorExportParams } from '../../src/mission/exportParams.js'
import { buildBlocksZip } from '../../src/utils/exporters.js'
import { describeErrors, validateWpml } from '../lib/wpml-conformidade.mjs'
import { wpmlOf } from '../lib/wpml-matriz.mjs'
import { resolveSensor } from '../../src/utils/geo.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
// 5 km com uma dobra, a ±60 m: o exemplo do relatório (31,9 min num só voo)
const eixo = [em(0, 0), em(2500, 300), em(5000, 0)]
const opcoes = {
  sensor,
  altitude: 60,
  bufferM: 60,
  sideOverlapPct: 70,
  photoIntervalM: 20,
  speed: 8,
}
const km = (a) => turf.length(turf.lineString(a), { units: 'kilometers' })

describe('corredor partido em voos', () => {
  test('troços de igual comprimento, contíguos, que somam o eixo', () => {
    const partes = splitAxis(eixo, 4)
    expect(partes).toHaveLength(4)
    const total = km(eixo)
    for (const p of partes) expect(km(p)).toBeCloseTo(total / 4, 3)
    for (let i = 1; i < partes.length; i++) {
      const fim = partes[i - 1][partes[i - 1].length - 1]
      expect(turf.distance(fim, partes[i][0], { units: 'meters' })).toBeLessThan(0.01)
    }
    expect(splitAxis(eixo, 1)).toEqual([eixo])
  })

  test('o mínimo de voos para cada um caber no tempo útil, com margem', () => {
    const usableS = 20 * 60
    const r = planCorridorFlights(eixo, opcoes, { usableS })
    expect(r.error).toBeUndefined()
    expect(r.whole.stats.flightTimeS).toBeGreaterThan(usableS)
    expect(r.flights.length).toBeGreaterThan(1)
    for (const f of r.flights)
      expect(f.plan.stats.flightTimeS).toBeLessThanOrEqual(usableS * CORRIDOR_SPLIT_MARGIN)
    // com um voo a menos, pelo menos um não caberia
    const menos = planCorridorFlights(eixo, opcoes, { usableS: 10 * 3600 })
    expect(menos.flights).toHaveLength(1)
    expect(r.flights.map((f) => f.label)).toEqual(r.flights.map((_, i) => `C-${i + 1}`))
  })

  test('troços vizinhos sobrepõem-se no corte (meia pegada de cada lado)', () => {
    const r = planCorridorFlights(eixo, opcoes, { usableS: 20 * 60 })
    const [a, b] = r.flights
    const corte = a.axis[a.axis.length - 1]
    // o primeiro troço vai além do corte, e o segundo começa antes dele
    const alem = Math.min(
      ...a.plan.waypoints.map((w) => turf.distance(w, corte, { units: 'meters' })),
    )
    expect(alem).toBeLessThan(60 + 1)
    expect(a.plan.stats.endExtendM).toBeGreaterThan(0)
    expect(b.plan.stats.endExtendM).toBeCloseTo(a.plan.stats.endExtendM, 6)
  })

  test('sem tempo útil, ou com um corredor curto, um só voo; erros do plano passam', () => {
    expect(planCorridorFlights(eixo, opcoes, { usableS: null }).flights).toHaveLength(1)
    expect(planCorridorFlights(eixo, { ...opcoes, altitude: 0 }, { usableS: 600 }).error).toBe(
      'invalid-altitude',
    )
  })

  test('cada voo com a sua base e referência; a rota junta na cota comum, com cortes', () => {
    const { flights } = planCorridorFlights(eixo, opcoes, { usableS: 20 * 60 })
    // relevo a subir para leste; uma base em cada ponta do eixo
    const elevationAt = (lon) => 100 + 0.02 * (lon + 9.14) * mLon
    const bases = [
      { id: 'b1', label: 'A', point: em(0, -100), radiusM: null },
      { id: 'b2', label: 'B', point: em(5000, -100), radiusM: null },
    ]
    const r = corridorFlightRoutes(flights, {
      bases,
      elevationAt,
      terrainFollow: { enabled: true, tolerance: 3 },
      terrainData: { elevationAt },
      altitude: 60,
      speed: 8,
    })
    expect(r.routes).toHaveLength(flights.length)
    expect(r.routes[0].base.label).toBe('A')
    expect(r.routes[r.routes.length - 1].base.label).toBe('B')
    // referência comum: a menor (base A, a oeste)
    expect(r.combined.refElev).toBeCloseTo(r.routes[0].reference.elev, 6)
    expect(r.combined.breaks).toHaveLength(flights.length - 1)
    // cada voo na sua cota: a altura absoluta do 1.º ponto de cada voo é a do
    // seu próprio plano sobre a sua referência
    r.routes.forEach((f, i) => {
      const at = i === 0 ? 0 : r.combined.breaks[i - 1]
      const abs = r.combined.waypoints[at][2] + r.combined.refElev
      expect(abs).toBeCloseTo(f.route.waypoints[0][2] + f.reference.elev, 1)
      expect(f.terrain.error).toBeUndefined()
    })
  })

  test('a exportação: um KMZ por voo num ZIP, todos dentro da especificação', async () => {
    const { flights } = planCorridorFlights(eixo, opcoes, { usableS: 20 * 60 })
    const perFlight = flights.map((f) =>
      corridorExportParams({
        missionName: `corredor_${f.label}`,
        plan: f.plan,
        photoMode: 'distance',
        altitude: 60,
        speed: 8,
        wpml: wpmlOf('M3E', 'M3E_WIDE'),
        photoIntervalM: 20,
        sensorType: 'camera',
      }),
    )
    const blocks = perFlight.map((p, i) => ({
      id: i + 1,
      name: p.name,
      waypoints: p.waypoints,
      perWaypoint: p.perWaypoint ?? null,
      triggerRanges: p.triggerRanges ?? null,
      passThrough: p.passThrough ?? null,
      durationS: p.durationS ?? null,
    }))
    const zip = await JSZip.loadAsync(
      await (await buildBlocksZip(perFlight[0], blocks)).arrayBuffer(),
    )
    const kmzs = Object.keys(zip.files).filter((n) => n.endsWith('.kmz'))
    expect(kmzs).toHaveLength(flights.length)
    for (const name of kmzs) {
      const kmz = await JSZip.loadAsync(await zip.file(name).async('uint8array'))
      const files = {
        template: await kmz.file('wpmz/template.kml').async('string'),
        waylines: await kmz.file('wpmz/waylines.wpml').async('string'),
      }
      const { errors } = validateWpml(files)
      expect(errors, `${name}: ${describeErrors(errors)}`).toEqual([])
    }
  })

  test('o preflight conta a bateria pelo voo mais longo, não pela soma', async () => {
    const { preflightPlan } = await import('../../src/mission/preflight.js')
    const { whole } = planCorridorFlights(eixo, opcoes, { usableS: 20 * 60 })
    const somado = {
      ...whole,
      stats: { ...whole.stats, flightTimeS: 3600, longestFlightS: 18 * 60 },
    }
    const codes = (p) =>
      preflightPlan({ plan: p, batteryMin: 20, reservePct: 0 }).map((i) => i.code)
    expect(codes(somado)).not.toContain('battery')
    expect(codes({ ...whole, stats: { ...whole.stats, flightTimeS: 3600 } })).toContain('battery')
  })

  test('com bases, o preflight conta o pior voo com o trânsito da sua base', async () => {
    const { preflightPlan } = await import('../../src/mission/preflight.js')
    const { whole } = planCorridorFlights(eixo, opcoes, { usableS: 20 * 60 })
    const plan = { ...whole, stats: { ...whole.stats, flightTimeS: 3600, longestFlightS: 18 * 60 } }
    const bat = (c) =>
      preflightPlan({ plan, batteryMin: 20, reservePct: 0, ...c }).find((i) => i.code === 'battery')
    // o voo mais longo (18 min) e o maior trânsito (4 min) são de voos
    // diferentes: o pior voo com o seu trânsito são 19 min, e cabe
    expect(bat({ baseTransitS: 240, worstFlightS: 19 * 60 })).toBeUndefined()
    // um voo que, com o trânsito da sua base, passa o tempo útil
    expect(bat({ baseTransitS: 240, worstFlightS: 21 * 60 })?.params.min).toBeCloseTo(21, 5)
    // sem `worstFlightS` (um só voo), o trânsito soma-se ao voo, como antes
    expect(bat({ baseTransitS: 240 })?.params.min).toBeCloseTo(22, 5)
  })
})
