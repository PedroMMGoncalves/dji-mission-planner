/**
 * Incerteza propagada, arrastamento e verificacoes por segmento
 * (src/mission/uncertainty.js).
 */
import { describe, expect, test } from 'vitest'
import {
  motionBlur,
  routeChecks,
  terrainReliefRange,
  uncertaintyIntervals,
} from '../../src/mission/uncertainty.js'
import {
  computeFootprint,
  computeGSD,
  lineSpacing,
  photoInterval,
  resolveSensor,
} from '../../src/utils/geo.js'
import {
  AIRCRAFT,
  PAYLOADS,
  positioningError,
  migrateDroneSelection,
} from '../../src/data/drones.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, {})
const H = 80
const fp = computeFootprint(sensor, H)
const spacing = lineSpacing(fp.across, 70)
const interval = photoInterval(fp.along, 80)
const base = () => ({
  sensor,
  altitude: H,
  spacing,
  interval,
  posError: positioningError(AIRCRAFT.M3E, false),
})

describe('incerteza propagada', () => {
  test('sem erro e sem relevo os intervalos degeneram no valor nominal', () => {
    const u = uncertaintyIntervals({ ...base(), posError: { verticalM: 0, horizontalM: 0 } })
    expect(u.agl).toEqual([H, H])
    expect(u.gsd[0]).toBeCloseTo(computeGSD(sensor, H), 6)
    expect(u.front[0]).toBeCloseTo(80, 6)
    expect(u.side[1]).toBeCloseTo(70, 6)
    expect(u.belowMinimum).toBe(false)
  })

  test('GNSS abre o intervalo, RTK fecha-o; o pior caso e sempre <= ao melhor', () => {
    const g = uncertaintyIntervals(base())
    const r = uncertaintyIntervals({ ...base(), posError: positioningError(AIRCRAFT.M3E, true) })
    expect(g.agl[1] - g.agl[0]).toBeGreaterThan(r.agl[1] - r.agl[0])
    expect(g.front[0]).toBeLessThan(80)
    expect(g.front[1]).toBeGreaterThan(80)
    expect(r.front[1] - r.front[0]).toBeLessThan(g.front[1] - g.front[0])
    for (const u of [g, r]) {
      expect(u.gsd[0]).toBeLessThanOrEqual(u.gsd[1])
      expect(u.front[0]).toBeLessThanOrEqual(u.front[1])
      expect(u.side[0]).toBeLessThanOrEqual(u.side[1])
    }
    expect(positioningError(AIRCRAFT.M3E, true).mode).toBe('rtk')
  })

  test('relevo a subir 30 m sem seguimento baixa a AGL e a sobreposicao; com seguimento so conta a tolerancia', () => {
    const relief = uncertaintyIntervals({ ...base(), relief: { minM: -5, maxM: 30 } })
    expect(relief.agl[0]).toBeCloseTo(H - 30 - 0.5, 6)
    expect(relief.agl[1]).toBeCloseTo(H + 5 + 0.5, 6)
    expect(relief.front[0]).toBeLessThan(uncertaintyIntervals(base()).front[0])
    const tf = uncertaintyIntervals({
      ...base(),
      relief: { minM: -5, maxM: 30 },
      terrainFollow: true,
      toleranceM: 5,
    })
    expect(tf.agl).toEqual([H - 5.5, H + 5.5])
  })

  test('sobreposicao no pior caso abaixo do minimo marca belowMinimum', () => {
    const thin = uncertaintyIntervals({
      ...base(),
      spacing: lineSpacing(fp.across, 52),
      relief: { minM: 0, maxM: 20 },
    })
    expect(thin.side[0]).toBeLessThan(50)
    expect(thin.belowMinimum).toBe(true)
  })

  test('relevo relativo a referencia a partir de um sampler', () => {
    const elev = (lon) => 100 + (lon + 9.14) * 1e3 // rampa: 1 m por 1e-3 graus
    const wps = Array.from({ length: 1000 }, (_, i) => [-9.14 + i * 1e-5, 38.7])
    const r = terrainReliefRange(wps, elev, [-9.14, 38.7])
    expect(r.minM).toBeCloseTo(0, 6)
    expect(r.maxM).toBeCloseTo(9.99, 1)
    expect(r.samples).toBeLessThanOrEqual(400)
    expect(terrainReliefRange(wps, () => NaN, [-9.14, 38.7])).toBeNull()
  })

  test('arrastamento: 8 m/s a 1/500 s sao 1,6 cm; em pixeis do GSD', () => {
    const b = motionBlur({ speed: 8, gsdCm: 2 })
    expect(b).toHaveLength(2)
    expect(b[1].blurCm).toBeCloseTo(1.6, 6)
    expect(b[1].blurPx).toBeCloseTo(0.8, 6)
    expect(motionBlur({ speed: 0, gsdCm: 2 })).toEqual([])
  })

  test('rota segmento a segmento: repetidos, subida excessiva, troco longo', () => {
    const r = routeChecks(
      [
        [-9.14, 38.7, 80],
        [-9.14, 38.7, 80], // repetido
        [-9.139, 38.7, 80],
        [-9.1389, 38.7, 140], // +60 m em ~8,7 m a 8 m/s -> 55 m/s
        [-9.0, 38.7, 140], // ~12 km
      ],
      { speed: 8, maxClimbMS: 6 },
    )
    expect(r.duplicates).toEqual([1])
    expect(r.climb).toHaveLength(1)
    expect(r.climb[0].rateMS).toBeGreaterThan(6)
    expect(r.longSegments).toHaveLength(1)
    expect(routeChecks([[0, 0]], { speed: 8 }).duplicates).toEqual([])
  })

  test('a seleccao guarda o RTK e a migracao preserva-o', () => {
    expect(migrateDroneSelection({ aircraftId: 'M3E', payloadId: 'M3E_WIDE', rtk: true }).rtk).toBe(
      true,
    )
    expect(migrateDroneSelection({ aircraftId: 'M3E', payloadId: 'M3E_WIDE' }).rtk).toBe(false)
    expect(migrateDroneSelection('M3E').rtk).toBeUndefined()
  })
})
