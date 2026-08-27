import * as turf from '@turf/turf'
import proj4 from 'proj4'
import shp from 'shpjs'
import { findAll, findFirst, parseXml, textOf } from './xml.js'

/**
 * Importação de áreas de levantamento a partir de ficheiros:
 *  - .kml            → sempre WGS84
 *  - .geojson/.json  → WGS84 por especificação; se as coordenadas parecerem
 *                      projetadas, o utilizador escolhe o CRS de origem
 *  - .zip (shapefile) → reprojetado automaticamente pelo shpjs via .prj
 *
 * Extrai o maior polígono do ficheiro e devolve o anel exterior aberto.
 */

const MAX_VERTICES = 400

/** CRS comuns em Portugal para GeoJSON/dados projetados sem .prj. */
export const CRS_OPTIONS = [
  {
    code: 'EPSG:3763',
    label: 'PT-TM06 / ETRS89 (EPSG:3763)',
    def: '+proj=tmerc +lat_0=39.6682583333333 +lon_0=-8.13310833333333 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  {
    code: 'EPSG:25829',
    label: 'ETRS89 / UTM 29N (EPSG:25829)',
    def: '+proj=utm +zone=29 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  },
  {
    code: 'EPSG:32629',
    label: 'WGS84 / UTM 29N (EPSG:32629)',
    def: '+proj=utm +zone=29 +datum=WGS84 +units=m +no_defs',
  },
  {
    code: 'EPSG:27493',
    label: 'Datum 73 / Hayford-Gauss (EPSG:27493)',
    def: '+proj=tmerc +lat_0=39.6666666666667 +lon_0=-8.13190611111111 +k=1 +x_0=180.598 +y_0=-86.99 +ellps=intl +towgs84=-223.237,110.193,36.649 +units=m +no_defs',
  },
  {
    code: 'EPSG:20790',
    label: 'Lisboa / Hayford-Gauss Militar (EPSG:20790)',
    def: '+proj=tmerc +lat_0=39.6666666666667 +lon_0=1.06541666666667 +k=1 +x_0=200000 +y_0=300000 +ellps=intl +pm=lisbon +towgs84=-304.046,-60.576,103.64 +units=m +no_defs',
  },
]

/** Área planar (shoelace) — serve para comparar tamanhos em qualquer CRS. */
function planarArea(ring) {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s / 2)
}

function dropClosingVertex(ring) {
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]]
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) {
      return ring.slice(0, -1)
    }
  }
  return ring
}

/** Recolhe todos os anéis exteriores de polígonos de um GeoJSON qualquer. */
function collectOuterRings(geojson, out = []) {
  if (!geojson) return out
  if (Array.isArray(geojson)) {
    geojson.forEach((g) => collectOuterRings(g, out))
    return out
  }
  switch (geojson.type) {
    case 'FeatureCollection':
      geojson.features?.forEach((f) => collectOuterRings(f, out))
      break
    case 'Feature':
      collectOuterRings(geojson.geometry, out)
      break
    case 'Polygon':
      if (geojson.coordinates?.[0]?.length >= 4) out.push(geojson.coordinates[0])
      break
    case 'MultiPolygon':
      geojson.coordinates?.forEach((p) => {
        if (p?.[0]?.length >= 4) out.push(p[0])
      })
      break
    case 'GeometryCollection':
      geojson.geometries?.forEach((g) => collectOuterRings(g, out))
      break
    default:
      break
  }
  return out
}

function largestRing(rings) {
  if (rings.length === 0) return null
  let best = rings[0]
  let bestArea = planarArea(rings[0])
  for (const r of rings.slice(1)) {
    const a = planarArea(r)
    if (a > bestArea) {
      best = r
      bestArea = a
    }
  }
  return dropClosingVertex(best.map((c) => [c[0], c[1]]))
}

function looksProjected(ring) {
  return ring.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90)
}

/** Reprojeta um anel de um CRS (proj string) para WGS84. */
export function reprojectRing(ring, projDef) {
  return ring.map(([x, y]) => proj4(projDef, proj4.WGS84, [x, y]))
}

/** Reduz anéis muito densos para manter a edição e o planeamento fluidos. */
export function simplifyRingIfNeeded(ring) {
  if (ring.length <= MAX_VERTICES) return ring
  let tolerance = 1e-5 // ~1 m
  let current = ring
  for (let i = 0; i < 8 && current.length > MAX_VERTICES; i++) {
    const poly = turf.polygon([[...ring, ring[0]]])
    const simplified = turf.simplify(poly, { tolerance, highQuality: true })
    current = simplified.geometry.coordinates[0].slice(0, -1)
    tolerance *= 2
  }
  return current
}

/**
 * Anéis exteriores de todos os `<Polygon>` de um KML.
 *
 * Procura pelo NOME LOCAL das tags (ver xml.js): um `<kml:Polygon>` de um
 * ficheiro com prefixo de namespace conta como qualquer outro. Dentro de cada
 * polígono prefere-se explicitamente o `<outerBoundaryIs>`; só quando ele não
 * existe é que se cai no primeiro `<coordinates>` encontrado — assim um
 * polígono cujo anel interior venha primeiro no documento não é confundido
 * com o exterior.
 */
function parseKml(text) {
  const doc = parseXml(text, 'KML inválido')
  const rings = []
  for (const poly of findAll(doc.documentElement, 'Polygon')) {
    const outer = findFirst(poly, 'outerBoundaryIs')
    const coords = textOf(findFirst(outer ?? poly, 'coordinates'))
    if (!coords) continue
    const ring = coords
      .split(/\s+/)
      .map((triple) => triple.split(',').map(Number))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map((c) => [c[0], c[1]])
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/**
 * Lê um ficheiro de área. Devolve:
 *  { ring }                     → pronto a usar (WGS84)
 *  { ring, needsCrs: true }     → coordenadas projetadas; escolher CRS e
 *                                 chamar reprojectRing(ring, def)
 * Lança Error com mensagem legível em caso de falha.
 */
export async function parseAreaFile(file) {
  const name = file.name.toLowerCase()

  if (name.endsWith('.zip')) {
    const buffer = await file.arrayBuffer()
    const geojson = await shp(buffer) // reprojeta via .prj quando presente
    const ring = largestRing(collectOuterRings(geojson))
    if (!ring || ring.length < 3) throw new Error('Nenhum polígono encontrado no shapefile')
    return looksProjected(ring) ? { ring, needsCrs: true } : { ring }
  }

  if (name.endsWith('.kml')) {
    const rings = parseKml(await file.text())
    const ring = largestRing(rings)
    if (!ring || ring.length < 3) throw new Error('Nenhum polígono encontrado no KML')
    return { ring }
  }

  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    let geojson
    try {
      geojson = JSON.parse(await file.text())
    } catch {
      throw new Error('GeoJSON inválido')
    }
    const ring = largestRing(collectOuterRings(geojson))
    if (!ring || ring.length < 3) throw new Error('Nenhum polígono encontrado no GeoJSON')
    return looksProjected(ring) ? { ring, needsCrs: true } : { ring }
  }

  throw new Error('Formato não suportado — use .kml, .geojson/.json ou .zip (shapefile)')
}
