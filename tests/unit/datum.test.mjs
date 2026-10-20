/**
 * Datum vertical (src/utils/verticalDatum.js): o que as GeoKeys de um
 * GeoTIFF declaram, o que se assume quando nao declaram, e as unidades.
 */
import { describe, expect, test } from 'vitest'
import { translate } from '../../src/i18n.jsx'
import {
  TERRARIUM_DATUM,
  describeVerticalDatum,
  needsUnitConversion,
  verticalDatumLabel,
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
    // EPSG:5780 = Cascais height; 5782 = Alicante height (M2-T10)
    expect(describeVerticalDatum({ VerticalCSTypeGeoKey: 5780 }).model).toContain('Cascais')
    expect(describeVerticalDatum({ VerticalCSTypeGeoKey: 5782 }).model).toContain('Alicante')
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

describe('datum vertical em texto (painel da área e relatório)', () => {
  const pt = (key, v) => translate('pt', key, v)
  const en = (key, v) => translate('en', key, v)

  test('declarado, assumido e por declarar, na língua da interface', () => {
    expect(verticalDatumLabel(describeVerticalDatum({ VerticalCSTypeGeoKey: 5773 }), pt)).toBe(
      'ortométrico, EGM96',
    )
    expect(verticalDatumLabel(TERRARIUM_DATUM, pt)).toBe('ortométrico, EGM96 (assumido)')
    expect(verticalDatumLabel({ kind: 'ellipsoidal', model: 'WGS84', unitFactor: 1 }, pt)).toBe(
      'ELIPSOIDAL, WGS84',
    )
    // sem GeoKeys verticais: o texto, não o código («unknown», que o
    // relatório mostrava), e sem um segundo «(assumido)»
    const desconhecido = describeVerticalDatum(null)
    expect(verticalDatumLabel(desconhecido, pt)).toBe('não declarado (assumido ortométrico)')
    expect(verticalDatumLabel(desconhecido, en)).toBe('not declared (assumed orthometric)')
  })

  test('com unidade que não é o metro, diz a conversão', () => {
    const ft = describeVerticalDatum({ VerticalCSTypeGeoKey: 5773, VerticalUnitsGeoKey: 9002 })
    expect(verticalDatumLabel(ft, pt)).toBe(
      'ortométrico, EGM96, valores em ft convertidos para metros',
    )
  })
})
