/**
 * O grupo «Qualidade» do painel de métricas por separador
 * (src/mission/qualityStats.js): cada separador mostra os seus valores, e
 * nenhum mosaico mostra o número de outro separador — o corredor e o
 * circular mostravam o GSD, a pegada, o espaçamento e o intervalo da
 * grelha da área, com o intervalo da incerteza dela.
 */
import { describe, expect, test } from 'vitest'
import { PAYLOADS } from '../../src/data/drones.js'
import { qualityStatsFor } from '../../src/mission/qualityStats.js'
import { computeFootprint, computeGSD, lineSpacing, resolveSensor } from '../../src/utils/geo.js'

const camera = resolveSensor(PAYLOADS.M3E_WIDE, {})
const lidarPayload = Object.values(PAYLOADS).find((p) => p.type === 'lidar' && p.maxPrr > 0)
const lidar = resolveSensor(lidarPayload, {})

/** As métricas da grelha da área a 100 m, como useAreaParams as dá. */
const area = {
  gsd: computeGSD(camera, 100, -90),
  gsdPitch: -90,
  uncertainty: { gsd: [2.67, 2.7], front: [78, 82], side: [69, 71] },
  footprint: computeFootprint(camera, 100),
  spacing: 42.5,
  interval: 21.3,
  intervalS: null,
  intervalManual: false,
  triggerMode: 'distance',
  speed: 10,
  pointDensity: null,
}
const base = { area, sensor: camera, payload: PAYLOADS.M3E_WIDE }

describe('métricas de qualidade por separador', () => {
  test('área: os valores da grelha tal como estavam, com o intervalo da incerteza', () => {
    const q = qualityStatsFor('area', base)
    expect(q).toEqual({
      gsd: area.gsd,
      gimbalPitch: -90,
      uncertainty: area.uncertainty,
      footprint: area.footprint,
      spacing: 42.5,
      interval: 21.3,
      intervalS: null,
      intervalManual: false,
      triggerMode: 'distance',
      speed: 10,
      pointDensity: null,
    })
  })

  test('corredor: GSD nadir, pegada e espaçamento à altura dele, o seu intervalo e a sua velocidade', () => {
    const corridorFlight = {
      own: true,
      altitude: 60,
      frontOverlap: 80,
      sideOverlap: 60,
      interval: 12.8,
    }
    const q = qualityStatsFor('corridor', { ...base, corridorFlight, corridorSpeed: 8 })
    const fp = computeFootprint(camera, 60)
    expect(q.gsd).toBeCloseTo(computeGSD(camera, 60, -90), 10)
    expect(q.gsd).not.toBe(area.gsd)
    expect(q.gimbalPitch).toBe(-90)
    expect(q.footprint).toEqual(fp)
    expect(q.spacing).toBeCloseTo(lineSpacing(fp.across, 60), 10)
    expect(q.interval).toBe(12.8)
    expect(q.speed).toBe(8)
    expect(q.triggerMode).toBe('distance')
    // nunca os da área
    expect(q.uncertainty).toBeNull()
    expect(q.intervalS).toBeNull()
    expect(q.intervalManual).toBe(false)
    expect(q.pointDensity).toBeNull()
  })

  test('corredor com LiDAR: sem GSD nem disparo, com a densidade à velocidade do corredor', () => {
    const corridorFlight = {
      own: false,
      altitude: 100,
      frontOverlap: 80,
      sideOverlap: 70,
      interval: null,
    }
    const q = qualityStatsFor('corridor', {
      area: { ...area, pointDensity: { single: 1, overlap: 2, mean: 3 } },
      sensor: lidar,
      payload: lidarPayload,
      corridorFlight,
      corridorSpeed: 5,
    })
    expect(q.gsd).toBeNull()
    expect(q.interval).toBeNull()
    expect(q.footprint.along).toBeNull()
    expect(q.footprint.across).toBeCloseTo(computeFootprint(lidar, 100).across, 10)
    const swath = computeFootprint(lidar, 100).across
    expect(q.pointDensity.single).toBeCloseTo(lidarPayload.maxPrr / (5 * swath), 6)
    expect(q.pointDensity.mean).toBeCloseTo(lidarPayload.maxPrr / (5 * q.spacing), 6)
  })

  test('circular: o GSD do plano à inclinação do gimbal e a corda entre fotos; sem pegada nem espaçamento', () => {
    const circularStats = { gsdCm: computeGSD(camera, 100, -45), gimbalPitch: -45, chordM: 9.4 }
    const q = qualityStatsFor('circular', {
      ...base,
      circularFlight: { altitude: 100 },
      circularPitch: -45,
      circularStats,
      circularSpeed: 8,
    })
    expect(q.gsd).toBeCloseTo(computeGSD(camera, 100, -45), 10)
    expect(q.gsd).toBeGreaterThan(area.gsd)
    expect(q.gimbalPitch).toBe(-45)
    expect(q.interval).toBe(9.4)
    expect(q.speed).toBe(8)
    expect(q.uncertainty).toBeNull()
    expect(q.footprint).toBeNull()
    expect(q.spacing).toBeNull()
    expect(q.pointDensity).toBeNull()
  })

  test('circular sem plano ainda: o GSD à altura e à inclinação pedidas, sem intervalo', () => {
    const q = qualityStatsFor('circular', {
      ...base,
      circularFlight: { altitude: 80 },
      circularPitch: -60,
      circularStats: null,
      circularSpeed: 8,
    })
    expect(q.gsd).toBeCloseTo(computeGSD(camera, 80, -60), 10)
    expect(q.gimbalPitch).toBe(-60)
    expect(q.interval).toBeNull()
  })

  test('circular sem câmara: sem GSD nem corda', () => {
    const q = qualityStatsFor('circular', {
      area,
      sensor: lidar,
      payload: lidarPayload,
      circularFlight: { altitude: 100 },
      circularStats: { gsdCm: null, gimbalPitch: -45, chordM: 7.8 },
      circularSpeed: 8,
    })
    expect(q.gsd).toBeNull()
    expect(q.interval).toBeNull()
  })

  test('face e órbita: nada da área, nem a densidade LiDAR', () => {
    const withDensity = { ...area, pointDensity: { single: 1, overlap: 2, mean: 3 } }
    for (const mode of ['face', 'orbit']) {
      const q = qualityStatsFor(mode, { ...base, area: withDensity })
      expect(q.gsd).toBeNull()
      expect(q.uncertainty).toBeNull()
      expect(q.footprint).toBeNull()
      expect(q.spacing).toBeNull()
      expect(q.interval).toBeNull()
      expect(q.pointDensity).toBeNull()
      expect(q.speed).toBeNull()
    }
  })
})
