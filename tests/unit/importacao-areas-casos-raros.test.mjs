/**
 * Importação de áreas, casos raros (src/utils/importArea.js): as recusas com
 * o código e o que a mensagem leva (formato, JSON partido, ficheiros só com
 * linhas ou sem nada); no GeoJSON, geometrias nulas, pontos, colecções de
 * geometrias, anéis abertos, um buraco com uma coordenada nula e um membro
 * `crs` sem código EPSG; no KML, um polígono sem outerBoundaryIs e
 * coordenadas com lixo; e um ZIP com duas camadas de shapefile.
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { crsCodeFromGeojson, looksProjected, parseAreaFile } from '../../src/utils/importArea.js'

// o leitor de KML usa o DOMParser do browser
beforeAll(() => {
  vi.stubGlobal(
    'DOMParser',
    class extends XmlDomParser {
      constructor() {
        super({ onError: () => {} })
      }
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

/** Ficheiro com nome e conteúdo (texto, objecto em JSON ou bytes). */
const ficheiro = (name, conteudo) => ({
  name,
  text: async () => (typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo)),
  arrayBuffer: async () =>
    conteudo.buffer.slice(conteudo.byteOffset, conteudo.byteOffset + conteudo.byteLength),
})
const recusa = async (p) => {
  try {
    await p
  } catch (err) {
    return { code: err.code, params: err.params }
  }
  return null
}
/** Quadrado de lado `s` graus, fechado. */
const sq = (x0, y0, s) => [
  [x0, y0],
  [x0 + s, y0],
  [x0 + s, y0 + s],
  [x0, y0 + s],
  [x0, y0],
]
const linha = {
  type: 'LineString',
  coordinates: [
    [-9.14, 38.7],
    [-9.13, 38.71],
  ],
}
const kml = (corpo) =>
  `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${corpo}</Document></kml>`

describe('recusas: o código e o que a mensagem leva', () => {
  test('formato desconhecido e JSON partido', async () => {
    expect(await recusa(parseAreaFile(ficheiro('trilho.gpx', '<gpx/>')))).toMatchObject({
      code: 'import.unsupported-format',
    })
    expect(await recusa(parseAreaFile(ficheiro('area.json', '{ "type": ')))).toMatchObject({
      code: 'import.geojson-invalid',
    })
  })

  test('GeoJSON só com linhas: diz quantas; sem nada: sem polígonos', async () => {
    const soLinhas = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: null, properties: {} },
        { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [linha] } },
        {
          type: 'Feature',
          geometry: { type: 'MultiLineString', coordinates: [linha.coordinates] },
        },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-9.14, 38.7] } },
      ],
    }
    expect(await recusa(parseAreaFile(ficheiro('eixo.geojson', soLinhas)))).toEqual({
      code: 'import.no-polygon-lines',
      params: { what: 'GeoJSON', n: 2 },
    })
    // colecções sem o membro das partes
    for (const vazio of [{ type: 'FeatureCollection' }, { type: 'GeometryCollection' }, null])
      expect(await recusa(parseAreaFile(ficheiro('nada.geojson', vazio)))).toEqual({
        code: 'import.no-polygon',
        params: { what: 'GeoJSON', n: 0 },
      })
  })

  test('KML só com uma linha; polígonos sem coordenadas ou com três pontos não contam', async () => {
    const eixo = kml(
      '<Placemark><LineString><coordinates>-9.14,38.7 -9.13,38.71</coordinates></LineString></Placemark>',
    )
    expect(await recusa(parseAreaFile(ficheiro('eixo.kml', eixo)))).toEqual({
      code: 'import.no-polygon-lines',
      params: { what: 'KML', n: 1 },
    })
    const fracos = kml(
      '<Placemark><Polygon/></Placemark>' +
        '<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>' +
        '-9.14,38.7 -9.13,38.7 -9.14,38.7</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>',
    )
    expect(await recusa(parseAreaFile(ficheiro('fracos.kml', fracos)))).toEqual({
      code: 'import.no-polygon',
      params: { what: 'KML', n: 0 },
    })
  })
})

describe('GeoJSON', () => {
  test('geometria nula e pontos ficam de fora; polígonos dentro de colecções contam; anel aberto entra tal e qual', async () => {
    const aberto = sq(-9.2, 38.7, 0.002).slice(0, 4)
    const gj = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: null, properties: {} },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-9.14, 38.7] } },
        {
          type: 'Feature',
          geometry: {
            type: 'GeometryCollection',
            geometries: [linha, { type: 'Polygon', coordinates: [sq(-9.14, 38.7, 0.01)] }],
          },
        },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [aberto] } },
      ],
    }
    const r = await parseAreaFile(ficheiro('mistura.geojson', gj))
    expect(r.parts).toHaveLength(2)
    expect(r.discardedParts).toBe(1)
    expect(r.ring).toEqual(sq(-9.14, 38.7, 0.01).slice(0, 4))
    expect(r.parts[1].ring).toEqual(aberto)
  })

  test('buraco com uma coordenada nula: fica de fora, o anel exterior entra', async () => {
    const buraco = sq(-9.137, 38.703, 0.003)
    buraco[2] = [-9.134, null]
    const r = await parseAreaFile(
      ficheiro('a.geojson', { type: 'Polygon', coordinates: [sq(-9.14, 38.7, 0.01), buraco] }),
    )
    expect(r.ring).toHaveLength(4)
    expect(r.holes).toEqual([])
  })

  test('membro crs sem código EPSG: não se aplica nada', async () => {
    const semCodigo = { crs: { type: 'name', properties: { name: 'Lisboa local' } } }
    expect(crsCodeFromGeojson(semCodigo)).toBeNull()
    expect(crsCodeFromGeojson({ crs: { properties: { name: 3763 } } })).toBeNull()
    const r = await parseAreaFile(
      ficheiro('a.geojson', {
        type: 'Polygon',
        coordinates: [sq(-9.14, 38.7, 0.01)],
        ...semCodigo,
      }),
    )
    expect(r.needsCrs).toBeUndefined()
    expect(r.crsCode).toBeUndefined()
    expect(r.ring[0]).toEqual([-9.14, 38.7])
  })

  test('anel vazio ou que não é lista: não passa por projectado', () => {
    for (const ring of [[], null, undefined, 'abc']) expect(looksProjected(ring)).toBe(false)
  })
})

describe('KML e shapefile', () => {
  test('polígono sem outerBoundaryIs: vale o anel que tem; os pares com lixo ficam de fora', async () => {
    const coords = 'a,b -9.14,38.7 -9.13,38.7 -9.13,38.71 x -9.14,38.71 -9.14,38.7'
    const r = await parseAreaFile(
      ficheiro(
        'solto.kml',
        kml(
          `<Placemark><Polygon><LinearRing><coordinates>${coords}</coordinates></LinearRing></Polygon></Placemark>`,
        ),
      ),
    )
    expect(r.ring).toEqual([
      [-9.14, 38.7],
      [-9.13, 38.7],
      [-9.13, 38.71],
      [-9.14, 38.71],
    ])
  })

  test('duas camadas de shapefile no mesmo ZIP: as duas partes, a maior como anel', async () => {
    const original = await JSZip.loadAsync(
      readFileSync(new URL('../fixtures/area-qgis-pttm06.zip', import.meta.url)),
    )
    const duas = new JSZip()
    for (const [nome, f] of Object.entries(original.files)) {
      const ext = nome.split('.').pop()
      const dados = await f.async('uint8array')
      duas.file(`camada-a.${ext}`, dados)
      duas.file(`camada-b.${ext}`, dados)
    }
    const r = await parseAreaFile(
      ficheiro('duas.zip', await duas.generateAsync({ type: 'uint8array' })),
    )
    expect(r.parts).toHaveLength(2)
    expect(r.discardedParts).toBe(1)
    expect(r.needsCrs).toBeUndefined()
    // o .prj de cada camada reprojecta-a: as duas caem no mesmo sítio, em graus
    expect(r.parts[0].ring).toEqual(r.parts[1].ring)
    expect(r.ring[0][0]).toBeCloseTo(-7.9, 6)
    expect(r.ring[0][1]).toBeCloseTo(38.55, 6)
  })
})
