// Perfis de hardware: opticas do M4T (grande-angular e termica) coerentes
// com a ficha tecnica da DJI, e migracao das seleccoes guardadas.
import { describe, it, expect } from 'vitest'
import { AIRCRAFT, PAYLOADS, migrateDroneSelection } from '../../src/data/drones.js'
import { resolveSensor, computeFootprint, computeGSD } from '../../src/utils/geo.js'

const dfovDeg = (p) => {
  const diag = Math.hypot(p.sensorWidth, p.sensorHeight)
  return (2 * Math.atan(diag / 2 / p.focalLength) * 180) / Math.PI
}
const gsdAt100 = (p) => computeGSD(resolveSensor(p, {}), 100)

describe('M4T: grande-angular', () => {
  const p = PAYLOADS.M4T_WIDE
  it('ja nao usa os valores provisorios da classe M3E', () => {
    expect(p.sensorWidth).not.toBe(PAYLOADS.M3E_WIDE.sensorWidth)
    expect(p.imageWidth).toBe(8064)
    expect(p.imageHeight).toBe(6048)
  })
  it('tem a razao de aspecto 4:3 e um FOV diagonal proximo dos 82 graus publicados', () => {
    expect(p.sensorWidth / p.sensorHeight).toBeCloseTo(4 / 3, 1)
    expect(dfovDeg(p)).toBeGreaterThan(80)
    expect(dfovDeg(p)).toBeLessThan(86)
  })
  it('equivale a 24 mm em full frame e da 1,8 cm/px a 100 m', () => {
    const crop = 43.27 / Math.hypot(p.sensorWidth, p.sensorHeight)
    expect(p.focalLength * crop).toBeCloseTo(24, 0)
    expect(gsdAt100(p)).toBeCloseTo(1.8, 1)
  })
})

describe('M4T: termica', () => {
  const p = PAYLOADS.M4T_THERMAL
  it('e o detector fisico de 640x512 a 12 um', () => {
    expect(p.imageWidth).toBe(640)
    expect(p.imageHeight).toBe(512)
    expect((p.sensorWidth / p.imageWidth) * 1000).toBeCloseTo(12, 1)
    expect((p.sensorHeight / p.imageHeight) * 1000).toBeCloseTo(12, 1)
  })
  it('tem DFOV de 45 graus e da cerca de 10 cm/px a 100 m', () => {
    expect(dfovDeg(p)).toBeCloseTo(45, 0)
    expect(gsdAt100(p)).toBeGreaterThan(9.5)
    expect(gsdAt100(p)).toBeLessThan(10.5)
  })
  it('cobre no solo uma faixa mais estreita do que a grande-angular', () => {
    const ir = computeFootprint(resolveSensor(p, {}), 100)
    const rgb = computeFootprint(resolveSensor(PAYLOADS.M4T_WIDE, {}), 100)
    expect(ir.across).toBeLessThan(rgb.across / 2)
    expect(ir.across).toBeCloseTo(64.5, 0)
  })
  it('partilha o gimbal (enum WPML) com a grande-angular', () => {
    expect(p.wpml.payloadEnumValue).toBe(PAYLOADS.M4T_WIDE.wpml.payloadEnumValue)
    expect(AIRCRAFT.M4T.payloads).toEqual(['M4T_WIDE', 'M4T_THERMAL'])
  })
})

describe('migracao da seleccao de hardware', () => {
  it('o id legado "M4T" continua a dar a grande-angular', () => {
    expect(migrateDroneSelection('M4T')).toEqual({ aircraftId: 'M4T', payloadId: 'M4T_WIDE' })
  })
  it('a termica e aceite no M4T e recusada noutra aeronave', () => {
    expect(migrateDroneSelection({ aircraftId: 'M4T', payloadId: 'M4T_THERMAL' })).toEqual({
      aircraftId: 'M4T',
      payloadId: 'M4T_THERMAL',
      rtk: false,
    })
    expect(migrateDroneSelection({ aircraftId: 'M3E', payloadId: 'M4T_THERMAL' }).payloadId).toBe(
      'M3E_WIDE',
    )
  })
})
