/**
 * Importacao de areas: buracos preservados, todas as partes devolvidas,
 * CRS conservador (magnitude ou extensao) e o membro `crs` do GeoJSON.
 */
import { describe, expect, test } from 'vitest'
import { crsCodeFromGeojson, looksProjected, parseAreaFile } from '../../src/utils/importArea.js'
import { generateFlightLines, ringToPolygon } from '../../src/utils/geo.js'
import { planGcps } from '../../src/utils/gcp.js'
import * as turf from '@turf/turf'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'

// o leitor de KML usa o DOMParser do browser; em Node vem do xmldom, calado
globalThis.DOMParser = class extends XmlDomParser {
  constructor() {
    super({ onError: () => {} })
  }
}

const file = (name, obj) => ({
  name,
  text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)),
})
const sq = (x0, y0, s) => [
  [x0, y0],
  [x0 + s, y0],
  [x0 + s, y0 + s],
  [x0, y0 + s],
  [x0, y0],
]

describe('importacao de areas', () => {
  test('poligono com buraco: anel e buracos preservados, aviso possivel', async () => {
    const r = await parseAreaFile(
      file('a.geojson', {
        type: 'Polygon',
        coordinates: [sq(-9.14, 38.7, 0.01), sq(-9.137, 38.703, 0.003)],
      }),
    )
    expect(r.ring).toHaveLength(4)
    expect(r.holes).toHaveLength(1)
    expect(r.holes[0]).toHaveLength(4)
    expect(r.discardedParts).toBe(0)
    expect(r.needsCrs).toBeUndefined()
  })

  test('MultiPolygon: todas as partes por ordem de area, a maior como anel', async () => {
    const r = await parseAreaFile(
      file('m.geojson', {
        type: 'MultiPolygon',
        coordinates: [[sq(-9.2, 38.7, 0.002)], [sq(-9.14, 38.7, 0.01)], [sq(-9.1, 38.7, 0.004)]],
      }),
    )
    expect(r.parts).toHaveLength(3)
    expect(r.discardedParts).toBe(2)
    expect(r.ring[0][0]).toBeCloseTo(-9.14, 6)
    expect(r.parts[2].ring[0][0]).toBeCloseTo(-9.2, 6)
  })

  test('KML com innerBoundaryIs: buraco lido', async () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Polygon>
      <outerBoundaryIs><LinearRing><coordinates>-9.14,38.7,0 -9.13,38.7,0 -9.13,38.71,0 -9.14,38.71,0 -9.14,38.7,0</coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>-9.137,38.703,0 -9.134,38.703,0 -9.134,38.706,0 -9.137,38.706,0 -9.137,38.703,0</coordinates></LinearRing></innerBoundaryIs>
      </Polygon></Placemark></kml>`
    const r = await parseAreaFile(file('a.kml', kml))
    expect(r.ring).toHaveLength(4)
    expect(r.holes).toHaveLength(1)
  })

  test('membro crs: EPSG conhecido reprojecta; desconhecido pede CRS com pista; CRS84 nada muda', async () => {
    const proj = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [sq(-30000, 20000, 500)] },
    }
    const known = await parseAreaFile(
      file('p.geojson', {
        ...proj,
        crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3763' } },
      }),
    )
    expect(known.crsCode).toBe('EPSG:3763')
    expect(known.needsCrs).toBeUndefined()
    expect(Math.abs(known.ring[0][0])).toBeLessThan(180)
    expect(known.ring[0][1]).toBeGreaterThan(36)
    const unknown = await parseAreaFile(
      file('p.geojson', { ...proj, crs: { type: 'name', properties: { name: 'EPSG:9999' } } }),
    )
    expect(unknown.needsCrs).toBe(true)
    expect(unknown.crsHint).toBe('EPSG:9999')
    expect(
      crsCodeFromGeojson({
        crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      }),
    ).toBe(4326)
    expect(crsCodeFromGeojson({})).toBeNull()
  })

  test('CRS conservador: metros locais pequenos (0..1000) ja nao passam por WGS84', async () => {
    expect(looksProjected(sq(0, 0, 1000).slice(0, 4))).toBe(true)
    expect(looksProjected(sq(-9.14, 38.7, 0.01).slice(0, 4))).toBe(false)
    expect(
      looksProjected([
        [100000, 200000],
        [100500, 200000],
        [100500, 200500],
      ]),
    ).toBe(true)
    const r = await parseAreaFile(
      file('l.geojson', { type: 'Polygon', coordinates: [sq(0, 0, 1000)] }),
    )
    expect(r.needsCrs).toBe(true)
  })
})

describe('buracos no plano e nos GCPs', () => {
  const lat0 = 38.7
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
  const ring = [em(0, 0), em(600, 0), em(600, 400), em(0, 400)]
  const hole = [em(250, 150), em(350, 150), em(350, 250), em(250, 250)]
  const opts = {
    spacingM: 30,
    angleDeg: 90,
    bufferPct: 0,
    photoIntervalM: 20,
    speed: 8,
    overshootM: 0,
    tieLine: false,
    photoMode: 'distance',
  }

  test('as faixas partem-se a volta do buraco e a area desconta-o', () => {
    const cheio = generateFlightLines(ring, opts)
    const furado = generateFlightLines(ring, { ...opts, holes: [hole] })
    expect(furado.error).toBeUndefined()
    expect(furado.lines.length).toBeGreaterThan(cheio.lines.length)
    expect(furado.stats.areaHa).toBeCloseTo(cheio.stats.areaHa - 1, 1) // buraco de 100 x 100 m = 1 ha
    const holePoly = ringToPolygon(hole)
    const centre = turf.centroid(holePoly)
    // nenhuma faixa passa pelo centro do buraco (a 30 m ou menos)
    for (const seg of furado.lines) {
      const d = turf.pointToLineDistance(centre, turf.lineString(seg), { units: 'meters' })
      expect(d).toBeGreaterThan(30)
    }
  })

  test('nenhum GCP dentro do buraco', () => {
    const gcps = planGcps(ring, 12, { holes: [hole] })
    const holePoly = ringToPolygon(hole)
    expect(gcps.length).toBeGreaterThan(3)
    expect(gcps.some((g) => turf.booleanPointInPolygon(turf.point(g.point), holePoly))).toBe(false)
  })
})
