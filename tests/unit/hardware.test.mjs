// Perfis de hardware: opticas do M4T (grande-angular e termica) coerentes
// com a ficha tecnica da DJI, e migracao das seleccoes guardadas.
import { describe, it, expect } from 'vitest'
import {
  AIRCRAFT,
  PAYLOADS,
  aircraftLabel,
  aircraftShortLabel,
  migrateDroneSelection,
  payloadDesc,
  payloadLabel,
} from '../../src/data/drones.js'
import { translate } from '../../src/i18n.jsx'
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
    expect(p.imageSource).toBe('WideCamera')
  })
  it('tem a razao de aspecto 4:3 e um FOV diagonal proximo dos 82 graus publicados', () => {
    expect(p.sensorWidth / p.sensorHeight).toBeCloseTo(4 / 3, 1)
    expect(dfovDeg(p)).toBeGreaterThan(80)
    expect(dfovDeg(p)).toBeLessThan(86)
  })
  it('tem a focal e o tamanho de imagem do EXIF (6,72 mm, 4032x3024, 24 mm eq.)', () => {
    expect(p.focalLength).toBe(6.72)
    expect(p.imageWidth).toBe(4032)
    expect(p.imageHeight).toBe(3024)
    const crop = 43.27 / Math.hypot(p.sensorWidth, p.sensorHeight)
    expect(p.focalLength * crop).toBeCloseTo(24, 0)
  })
  it('da 3,6 cm/px a 100 m em 12 MP e metade em 48 MP', () => {
    expect(gsdAt100(p)).toBeCloseTo(3.6, 1)
    expect(gsdAt100({ ...p, imageWidth: 8064 })).toBeCloseTo(1.8, 1)
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
  it('tem a focal do EXIF (12 mm, 52 mm eq.), DFOV de 45 graus e cerca de 10 cm/px a 100 m', () => {
    expect(p.focalLength).toBe(12)
    expect(p.imageSource).toBe('InfraredCamera')
    expect(dfovDeg(p)).toBeGreaterThan(44)
    expect(dfovDeg(p)).toBeLessThan(46)
    expect(gsdAt100(p)).toBeGreaterThan(9.5)
    expect(gsdAt100(p)).toBeLessThan(10.5)
  })
  it('cobre no solo uma faixa mais estreita do que a grande-angular', () => {
    const ir = computeFootprint(resolveSensor(p, {}), 100)
    const rgb = computeFootprint(resolveSensor(PAYLOADS.M4T_WIDE, {}), 100)
    expect(ir.across).toBeLessThan(rgb.across / 2)
    expect(ir.across).toBeCloseTo(64, 0)
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

describe('nomes no ecra: a aeronave e o payload personalizados traduzem-se', () => {
  const pt = (k) => translate('pt', k)
  const en = (k) => translate('en', k)
  it('a aeronave personalizada e Personalizada em PT e Custom em EN', () => {
    expect(aircraftLabel(AIRCRAFT.CUSTOM, pt)).toBe('Personalizada')
    expect(aircraftLabel(AIRCRAFT.CUSTOM, en)).toBe('Custom')
    expect(aircraftShortLabel(AIRCRAFT.CUSTOM, pt)).toBe('Personalizada')
  })
  it('as do catalogo ficam com o nome do fabricante, nas duas linguas', () => {
    for (const t of [pt, en]) {
      expect(aircraftLabel(AIRCRAFT.M3E, t)).toBe('DJI Mavic 3 Enterprise (M3E)')
      expect(aircraftShortLabel(AIRCRAFT.M3E, t)).toBe('M3E')
      expect(aircraftShortLabel(AIRCRAFT.M300RTK, t)).toBe('Matrice 300 RTK')
      expect(payloadLabel(PAYLOADS.P1, t)).toBe(PAYLOADS.P1.label)
      expect(payloadDesc(PAYLOADS.P1, t)).toBe(PAYLOADS.P1.desc)
    }
  })
  it('o payload personalizado e a sua descricao traduzem-se', () => {
    expect(payloadLabel(PAYLOADS.CUSTOM, pt)).toBe('Personalizado / LiDAR')
    expect(payloadLabel(PAYLOADS.CUSTOM, en)).toBe('Custom / LiDAR')
    expect(payloadDesc(PAYLOADS.CUSTOM, pt)).toBe('Definido manualmente')
    expect(payloadDesc(PAYLOADS.CUSTOM, en)).toBe('Defined manually')
  })
  it('sem aeronave ou payload, texto vazio', () => {
    expect(aircraftLabel(null, pt)).toBe('')
    expect(aircraftShortLabel(undefined, pt)).toBe('')
    expect(payloadLabel(undefined, pt)).toBe('')
    expect(payloadDesc(null, pt)).toBe('')
    expect(payloadDesc({ id: 'X' }, pt)).toBe('')
  })
})
