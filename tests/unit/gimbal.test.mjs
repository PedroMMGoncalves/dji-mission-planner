// Inclinacao do gimbal contra o intervalo do payload: a exportacao recorta,
// o preflight avisa do valor pedido.
import { describe, it, expect } from 'vitest'
import { clampGimbalPitch, gimbalRangeViolation } from '../../src/mission/gimbal.js'
import { PAYLOADS, AIRCRAFT } from '../../src/data/drones.js'
import { preflightArea, preflightPlan } from '../../src/mission/preflight.js'
import { generateFlightPlan } from '../../src/utils/geo.js'

const r = { min: -90, max: 35 }

describe('gimbalRangeViolation', () => {
  it('dentro do intervalo nao ha violacao', () => {
    expect(gimbalRangeViolation([-90, -45, 0, 35], r)).toBeNull()
  })
  it('devolve a pior das inclinacoes pedidas fora do intervalo', () => {
    expect(gimbalRangeViolation([-45, 40, 60, -100], r)).toEqual({ worst: 60, min: -90, max: 35 })
    expect(gimbalRangeViolation([-100, 36], r)).toEqual({ worst: -100, min: -90, max: 35 })
  })
  it('ignora valores nao numericos e intervalos em falta', () => {
    expect(gimbalRangeViolation([null, undefined, NaN, 60], r).worst).toBe(60)
    expect(gimbalRangeViolation([60], null)).toBeNull()
  })
})

describe('clampGimbalPitch', () => {
  it('recorta ao intervalo e passa intacto sem intervalo', () => {
    expect(clampGimbalPitch(45, r)).toBe(35)
    expect(clampGimbalPitch(-120, r)).toBe(-90)
    expect(clampGimbalPitch(-60, r)).toBe(-60)
    expect(clampGimbalPitch(45, null)).toBe(45)
  })
})

describe('catalogo: intervalos do gimbal e velocidades conformes', () => {
  it('cada camara declara o intervalo do gimbal, o M3E com o da especificacao WPML', () => {
    for (const p of Object.values(PAYLOADS))
      if (p.type === 'camera') expect(p.gimbalPitch.min).toBeLessThan(p.gimbalPitch.max)
    expect(PAYLOADS.M3E_WIDE.gimbalPitch).toEqual({ min: -90, max: 35 })
    expect(PAYLOADS.P1.gimbalPitch).toEqual({ min: -120, max: 30 })
  })
  it('o par do M4T nomeia a lente; os outros nao', () => {
    expect(PAYLOADS.M4T_WIDE.imageFormat).toBe('wide')
    expect(PAYLOADS.M4T_THERMAL.imageFormat).toBe('ir')
    expect(PAYLOADS.M3E_WIDE.imageFormat).toBeUndefined()
  })
  it('nenhuma aeronave DJI oferece mais do que 15 m/s de missao', () => {
    for (const a of Object.values(AIRCRAFT))
      if (a.id !== 'CUSTOM') expect(a.speedRange.max).toBeLessThanOrEqual(15)
  })
})

describe('preflight: aviso de gimbal fora do intervalo', () => {
  const lat0 = 38.7
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
  const plan = generateFlightPlan([em(0, 0), em(600, 0), em(600, 400), em(0, 400)], {
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
  })
  const g = { worst: 45, min: -90, max: 35 }
  it('area e outros modos avisam com o valor pedido e o intervalo', () => {
    const a = preflightArea({ plan, batteryMin: 30, reservePct: 30, gimbal: g })
    const w = a.find((i) => i.code === 'gimbal-range')
    expect(w).toBeTruthy()
    expect(w.level).toBe('warn')
    expect(w.params).toEqual({ worst: 45, min: -90, max: 35 })
    expect(
      preflightPlan({ plan, batteryMin: 30, reservePct: 30, gimbal: g }).map((i) => i.code),
    ).toContain('gimbal-range')
    expect(
      preflightPlan({ plan, batteryMin: 30, reservePct: 30, gimbal: null }).map((i) => i.code),
    ).not.toContain('gimbal-range')
  })
})
