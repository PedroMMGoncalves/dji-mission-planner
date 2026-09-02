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
/** extensão máxima plausível de uma área em graus (mais do que isto e projectada) */
const MAX_SPAN_DEG = 2

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

/**
 * Recolhe todos os polígonos de um GeoJSON qualquer, cada um com o anel
 * exterior e os anéis interiores (buracos), tal como estão no ficheiro.
 */
function collectPolygons(geojson, out = []) {
  if (!geojson) return out
  if (Array.isArray(geojson)) {
    geojson.forEach((g) => collectPolygons(g, out))
    return out
  }
  const push = (coords) => {
    if (coords?.[0]?.length >= 4) {
      out.push({ ring: coords[0], holes: coords.slice(1).filter((h) => h?.length >= 4) })
    }
  }
  switch (geojson.type) {
    case 'FeatureCollection':
      geojson.features?.forEach((f) => collectPolygons(f, out))
      break
    case 'Feature':
      collectPolygons(geojson.geometry, out)
      break
    case 'Polygon':
      push(geojson.coordinates)
      break
    case 'MultiPolygon':
      geojson.coordinates?.forEach(push)
      break
    case 'GeometryCollection':
      geojson.geometries?.forEach((g) => collectPolygons(g, out))
      break
    default:
      break
  }
  return out
}

const cleanRing = (r) => dropClosingVertex(r.map((c) => [c[0], c[1]]))

/** Polígonos em bruto → partes limpas ({ring, holes}), por ordem decrescente de área. */
function toParts(polys) {
  return polys
    .map((p) => ({
      ring: cleanRing(p.ring),
      holes: (p.holes ?? []).map(cleanRing).filter((h) => h.length >= 3),
    }))
    .filter((p) => p.ring.length >= 3)
    .sort((a, b) => planarArea(b.ring) - planarArea(a.ring))
}

/**
 * Coordenadas projectadas? Duas pistas, qualquer uma basta: valores fora
 * de [-180, 180] x [-90, 90], ou uma extensão acima de 2 graus em qualquer
 * eixo — nenhum levantamento mede 220 km, mas um polígono em metros locais
 * (0..5000) cabia no teste de magnitude e caía no golfo da Guiné como se
 * fosse WGS84.
 */
export function looksProjected(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return false
  if (ring.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90)) return true
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return maxX - minX > MAX_SPAN_DEG || maxY - minY > MAX_SPAN_DEG
}

/**
 * Membro `crs` (GeoJSON 2008) → código EPSG, ou null. A RFC 7946 aboliu o
 * membro, mas o QGIS e outros continuam a escreve-lo, e é a única pista
 * fiável sobre dados projectados.
 */
export function crsCodeFromGeojson(geojson) {
  const name = geojson?.crs?.properties?.name
  if (typeof name !== 'string') return null
  if (/CRS84/i.test(name)) return 4326
  const m = name.match(/EPSG:{1,2}(\d+)/i)
  return m ? Number(m[1]) : null
}

/** Partes de um ficheiro projectado → WGS84 com a definição dada. */
export function reprojectParts(parts, projDef) {
  return parts.map((p) => ({
    ring: reprojectRing(p.ring, projDef),
    holes: p.holes.map((h) => reprojectRing(h, projDef)),
  }))
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
  const polys = []
  const ringOf = (node) => {
    const coords = textOf(node ? findFirst(node, 'coordinates') : null)
    if (!coords) return null
    const ring = coords
      .split(/\s+/)
      .map((triple) => triple.split(',').map(Number))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map((c) => [c[0], c[1]])
    return ring.length >= 4 ? ring : null
  }
  for (const poly of findAll(doc.documentElement, 'Polygon')) {
    const outer = findFirst(poly, 'outerBoundaryIs')
    const ring = ringOf(outer ?? poly)
    if (!ring) continue
    const holes = findAll(poly, 'innerBoundaryIs').map(ringOf).filter(Boolean)
    polys.push({ ring, holes })
  }
  return polys
}

/**
 * Lê um ficheiro de área. Devolve sempre `parts` (todos os polígonos do
 * ficheiro, cada um com anel exterior e buracos, por ordem decrescente de
 * área) e o maior deles como `ring` + `holes`:
 *  { ring, holes, parts }         → pronto a usar (WGS84)
 *  discardedParts                 → polígonos a mais no ficheiro: usa-se o
 *                                   maior; quem chama avisa e pode usar todos
 *                                   como células (parts)
 *  { ..., needsCrs: true }        → coordenadas projectadas sem CRS conhecido;
 *                                   escolher CRS e chamar reprojectParts
 *  crsCode                        → CRS lido do ficheiro e já aplicado
 * Lança Error com mensagem legível em caso de falha.
 * @returns {Promise<any>}
 */
export async function parseAreaFile(file) {
  const name = file.name.toLowerCase()
  const finish = (parts, what, extra = {}) => {
    if (parts.length === 0) throw new Error(`Nenhum polígono encontrado no ${what}`)
    const [main] = parts
    return { ring: main.ring, holes: main.holes, parts, discardedParts: parts.length - 1, ...extra }
  }

  if (name.endsWith('.zip')) {
    const buffer = await file.arrayBuffer()
    const geojson = await shp(buffer) // reprojeta via .prj quando presente
    const parts = toParts(collectPolygons(geojson))
    return finish(parts, 'shapefile', looksProjected(parts[0]?.ring) ? { needsCrs: true } : {})
  }

  if (name.endsWith('.kml')) {
    return finish(toParts(parseKml(await file.text())), 'KML')
  }

  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    let geojson
    try {
      geojson = JSON.parse(await file.text())
    } catch {
      throw new Error('GeoJSON inválido')
    }
    let parts = toParts(collectPolygons(geojson))
    if (parts.length === 0) throw new Error('Nenhum polígono encontrado no GeoJSON')
    // CRS declarado no ficheiro: aplica-se se for conhecido; WGS84 nao muda nada
    const code = crsCodeFromGeojson(geojson)
    if (code && code !== 4326) {
      const option = CRS_OPTIONS.find((o) => o.code === `EPSG:${code}`)
      if (option)
        return finish(reprojectParts(parts, option.def), 'GeoJSON', { crsCode: option.code })
      return finish(parts, 'GeoJSON', { needsCrs: true, crsHint: `EPSG:${code}` })
    }
    return finish(parts, 'GeoJSON', looksProjected(parts[0].ring) ? { needsCrs: true } : {})
  }

  throw new Error('Formato não suportado — use .kml, .geojson/.json ou .zip (shapefile)')
}
