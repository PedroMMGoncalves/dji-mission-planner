/**
 * Datum vertical das fontes de elevação, tal como se consegue saber:
 * declarado nas GeoKeys de um GeoTIFF (sistema vertical, datum e unidade)
 * ou assumido para o relevo global. As alturas exportadas são diferenças
 * de duas cotas da mesma fonte, pelo que um desvio constante do datum
 * cancela; o que interessa é não misturar alturas elipsoidais com
 * ortométricas sem o saber, e não ler pés como metros.
 */

/** Sistemas verticais (VerticalCSTypeGeoKey) reconhecidos. */
const VERTICAL_CS = {
  5773: { kind: 'orthometric', model: 'EGM96' },
  3855: { kind: 'orthometric', model: 'EGM2008' },
  5714: { kind: 'orthometric', model: 'MSL' },
  5782: { kind: 'orthometric', model: 'Cascais (Portugal continental)' },
  5730: { kind: 'orthometric', model: 'EVRF2000' },
  5621: { kind: 'orthometric', model: 'EVRF2007' },
  4979: { kind: 'ellipsoidal', model: 'WGS84' },
  4937: { kind: 'ellipsoidal', model: 'ETRS89' },
}

/** Códigos geográficos 3D: a terceira coordenada é uma altura elipsoidal. */
const GEOGRAPHIC_3D = new Set([4979, 4937])

/** Unidades verticais (VerticalUnitsGeoKey) → factor para metros. */
const VERTICAL_UNITS = {
  9001: { factor: 1, label: 'm' },
  9002: { factor: 0.3048, label: 'ft' },
  9003: { factor: 1200 / 3937, label: 'ft US' },
}

const GEOKEY_UNDEFINED = 32767
const usable = (c) => Number.isFinite(c) && c > 0 && c !== GEOKEY_UNDEFINED

/** Relevo global Terrarium: sem datum declarado pela fonte; a montante são, na maior parte, alturas ortométricas (EGM96). */
export const TERRARIUM_DATUM = Object.freeze({
  kind: 'orthometric',
  model: 'EGM96',
  assumed: true,
  code: null,
  unitFactor: 1,
  unitLabel: 'm',
})

/**
 * Interpreta as GeoKeys verticais de um GeoTIFF.
 * @param {any} geoKeys `image.geoKeys`
 * @returns {{kind: 'orthometric'|'ellipsoidal'|'unknown', model: string|null, code: number|null,
 *   assumed: boolean, unitFactor: number, unitLabel: string}}
 */
export function describeVerticalDatum(geoKeys) {
  const vcs = Number(geoKeys?.VerticalCSTypeGeoKey)
  const vdatum = Number(geoKeys?.VerticalDatumGeoKey)
  const vunits = Number(geoKeys?.VerticalUnitsGeoKey)
  const geog = Number(geoKeys?.GeographicTypeGeoKey)
  const unit = usable(vunits) ? (VERTICAL_UNITS[vunits] ?? null) : VERTICAL_UNITS[9001]
  const unitFactor = unit?.factor ?? 1
  const unitLabel = unit?.label ?? `unidade ${vunits}`
  if (usable(vcs) && VERTICAL_CS[vcs]) {
    return { ...VERTICAL_CS[vcs], code: vcs, assumed: false, unitFactor, unitLabel }
  }
  if (usable(vcs)) {
    // sistema vertical declarado mas fora da tabela: quase de certeza ortométrico
    return {
      kind: 'orthometric',
      model: `EPSG:${vcs}`,
      code: vcs,
      assumed: true,
      unitFactor,
      unitLabel,
    }
  }
  if (usable(vdatum)) {
    return {
      kind: 'orthometric',
      model: `datum ${vdatum}`,
      code: vdatum,
      assumed: true,
      unitFactor,
      unitLabel,
    }
  }
  if (GEOGRAPHIC_3D.has(geog)) {
    return {
      kind: 'ellipsoidal',
      model: VERTICAL_CS[geog].model,
      code: geog,
      assumed: false,
      unitFactor,
      unitLabel,
    }
  }
  return { kind: 'unknown', model: null, code: null, assumed: true, unitFactor, unitLabel }
}

/** A conversão de unidade altera os valores? */
export const needsUnitConversion = (datum) => Math.abs((datum?.unitFactor ?? 1) - 1) > 1e-12
