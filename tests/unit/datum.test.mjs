/**
 * Datum vertical (src/utils/verticalDatum.js): o que as GeoKeys de um
 * GeoTIFF declaram, o que se assume quando nao declaram, e as unidades.
 */
import { describe, expect, test } from 'vitest'
import {
  TERRARIUM_DATUM,
  describeVerticalDatum,
  needsUnitConversion,
} from '../../src/utils/verticalDatum.js'

describe('datum vertical', () => {
  test('sistemas verticais conhecidos: EGM96, EGM2008, Cascais; unidade em metros por omissao', () => {
    expect(describeVerticalDatum({ VerticalCSTypeGeoKey: 5773 })).toMatchObject({
      kind: 'orthometric',
      model: 'EGM96',
      code: 5773,
      assumed: false,
      unitFactor: 1,
    })
    expect(describeVerticalDatum({ VerticalCSTypeGeoKey: 3855 }).model).toBe('EGM2008')
    expect(describeVerticalDatum({ VerticalCSTypeGeoKey: 5782 }).model).toContain('Cascais')
  })

  test('pes convertem para metros; unidade desconhecida fica em 1 com etiqueta', () => {
    const ft = describeVerticalDatum({ VerticalCSTypeGeoKey: 5773, VerticalUnitsGeoKey: 9002 })
    expect(ft.unitFactor).toBeCloseTo(0.3048, 6)
    expect(ft.unitLabel).toBe('ft')
    expect(needsUnitConversion(ft)).toBe(true)
    expect(needsUnitConversion(describeVerticalDatum({ VerticalUnitsGeoKey: 9001 }))).toBe(false)
    expect(describeVerticalDatum({ VerticalUnitsGeoKey: 9999 }).unitLabel).toContain('9999')
  })

  test('geografico 3D (4979/4937) e altura elipsoidal; sistema vertical fora da tabela assume-se ortometrico', () => {
    expect(describeVerticalDatum({ GeographicTypeGeoKey: 4979 })).toMatchObject({
      kind: 'ellipsoidal',
      model: 'WGS84',
      assumed: false,
    })
    expect(describeVerticalDatum({ GeographicTypeGeoKey: 4937 }).kind).toBe('ellipsoidal')
    expect(describeVerticalDatum({ VerticalCSTypeGeoKey: 5555 })).toMatchObject({
      kind: 'orthometric',
      assumed: true,
      code: 5555,
    })
    expect(describeVerticalDatum({ VerticalDatumGeoKey: 5171 })).toMatchObject({
      kind: 'orthometric',
      assumed: true,
    })
  })

  test('sem GeoKeys verticais: desconhecido (assumido); Terrarium: EGM96 assumido', () => {
    expect(describeVerticalDatum({ ProjectedCSTypeGeoKey: 3763 })).toMatchObject({
      kind: 'unknown',
      assumed: true,
      unitFactor: 1,
    })
    expect(describeVerticalDatum(null).kind).toBe('unknown')
    expect(TERRARIUM_DATUM).toMatchObject({ kind: 'orthometric', model: 'EGM96', assumed: true })
  })
})
