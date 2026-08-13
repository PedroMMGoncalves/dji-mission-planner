import JSZip from 'jszip'
import * as turf from '@turf/turf'

/**
 * Importação de missões WPML (.kmz da DJI) — o caminho inverso de exporters.js.
 *
 * Aceita KMZ gerados por esta app (wpmz/template.kml + wpmz/waylines.wpml) e
 * pelo DJI Pilot 2, que varia na ordem/presença das tags. A leitura é
 * deliberadamente tolerante: procura sempre pelo NOME LOCAL das tags, ignorando
 * o prefixo de namespace (`wpml:`), porque nem todos os ficheiros declaram o
 * namespace da mesma forma.
 *
 * Como o WPML só guarda a rota (waypoints) e não a área de levantamento, a área
 * editável é reconstruída a partir do invólucro convexo dos waypoints.
 */

const M_PER_DEG_LAT = 110574 // metros por grau de latitude (aprox. WGS84)
const RECT_MARGIN_M = 20 // folga do retângulo de recurso (pontos colineares)
const MIN_HULL_AREA_M2 = 0.01 // abaixo disto o invólucro é degenerado

function metersPerDegLon(lat) {
  return Math.max(1, 111320 * Math.cos((lat * Math.PI) / 180))
}

/* ------------------------------------------------------------------ */
/* Utilitários DOM (tolerantes a prefixos de namespace)               */
/* ------------------------------------------------------------------ */

/** Nome da tag sem prefixo: `wpml:executeHeight` → `executeHeight`. */
function localNameOf(node) {
  return node.localName || String(node.nodeName || '').split(':').pop()
}

function elementChildren(node) {
  const out = []
  const kids = node?.childNodes || []
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].nodeType === 1) out.push(kids[i])
  }
  return out
}

/** Primeiro filho DIRETO com este nome local (ex.: `<name>` do Folder). */
function childNamed(node, name) {
  return elementChildren(node).find((el) => localNameOf(el) === name) || null
}

/** Todos os descendentes com este nome local, por ordem do documento. */
function findAll(node, name, out = []) {
  for (const el of elementChildren(node)) {
    if (localNameOf(el) === name) out.push(el)
    findAll(el, name, out)
  }
  return out
}

/** Primeiro descendente com este nome local. */
function findFirst(node, name) {
  for (const el of elementChildren(node)) {
    if (localNameOf(el) === name) return el
    const deep = findFirst(el, name)
    if (deep) return deep
  }
  return null
}

function textOf(el) {
  const t = el?.textContent
  return typeof t === 'string' ? t.trim() : ''
}

/** Primeiro dos nomes dados que exista sob `node` e contenha um número. */
function numIn(node, ...names) {
  for (const name of names) {
    const el = findFirst(node, name)
    if (!el) continue
    const v = Number(textOf(el))
    if (Number.isFinite(v)) return v
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Números                                                             */
/* ------------------------------------------------------------------ */

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Arredonda a 0.1 (altitudes e velocidades); mantém null. */
function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

/* ------------------------------------------------------------------ */
/* Leitura do XML                                                      */
/* ------------------------------------------------------------------ */

function parseXmlText(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const root = doc?.documentElement
  const failed =
    !root ||
    localNameOf(root) === 'parsererror' ||
    elementChildren(root).some((el) => localNameOf(el) === 'parsererror')
  if (failed) throw new Error('XML da missão ilegível — o ficheiro WPML está corrompido')
  return doc
}

/**
 * Primeiro par lon,lat de um bloco <coordinates> ("lon,lat[,alt] ...").
 * Devolve [lon, lat] ou null.
 */
function parseFirstCoord(text) {
  if (!text) return null
  for (const tuple of text.trim().split(/\s+/)) {
    const parts = tuple.split(',').map(Number)
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return [parts[0], parts[1]]
    }
  }
  return null
}

/**
 * Extrai de um documento (waylines.wpml ou template.kml) tudo o que interessa.
 * Devolve { waypoints, heights, speed, speeds, globalHeight, name,
 *           droneEnumValue, payloadEnumValue }.
 */
function extractFromDoc(doc) {
  const root = doc.documentElement || doc

  // --- waypoints -----------------------------------------------------
  const rows = []
  findAll(root, 'Placemark').forEach((pm, order) => {
    const point = parseFirstCoord(textOf(findFirst(pm, 'coordinates')))
    if (!point) return // Placemarks sem geometria (ex.: POI) são ignorados
    const idx = Number(textOf(findFirst(pm, 'index')))
    rows.push({
      order,
      index: Number.isFinite(idx) ? idx : null,
      point,
      // waylines usa executeHeight; template usa height (ellipsoidHeight como último recurso)
      height: numIn(pm, 'executeHeight', 'height', 'ellipsoidHeight'),
      speed: numIn(pm, 'waypointSpeed'),
    })
  })

  // Ordem de voo: <wpml:index> quando existe em todos, senão ordem do documento.
  const byIndex = rows.length > 0 && rows.every((r) => r.index != null)
  const ordered = byIndex
    ? [...rows].sort((a, b) => a.index - b.index || a.order - b.order)
    : rows

  // --- configuração global -------------------------------------------
  const folder = findFirst(root, 'Folder')
  const docEl = findFirst(root, 'Document') || root
  const droneInfo = findFirst(root, 'droneInfo')
  const payloadInfo = findFirst(root, 'payloadInfo')

  const name =
    textOf(childNamed(folder, 'name')) || textOf(childNamed(docEl, 'name')) || null

  return {
    waypoints: ordered.map((r) => r.point),
    heights: ordered.map((r) => r.height).filter((h) => Number.isFinite(h)),
    speeds: ordered.map((r) => r.speed).filter((s) => Number.isFinite(s)),
    speed: numIn(root, 'autoFlightSpeed'),
    globalHeight: numIn(root, 'globalHeight'),
    name,
    droneEnumValue: droneInfo
      ? numIn(droneInfo, 'droneEnumValue')
      : numIn(root, 'droneEnumValue'),
    payloadEnumValue: payloadInfo
      ? numIn(payloadInfo, 'payloadEnumValue')
      : numIn(root, 'payloadEnumValue'),
  }
}

/* ------------------------------------------------------------------ */
/* Reconstrução da área                                                */
/* ------------------------------------------------------------------ */

function dropClosingVertex(ring) {
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]]
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) return ring.slice(0, -1)
  }
  return ring
}

/** Retângulo de recurso: bbox dos pontos com ~20 m de folga de cada lado. */
function fallbackRect(waypoints) {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of waypoints) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const dLon = RECT_MARGIN_M / metersPerDegLon((minLat + maxLat) / 2)
  const dLat = RECT_MARGIN_M / M_PER_DEG_LAT
  return [
    [minLon - dLon, minLat - dLat],
    [maxLon + dLon, minLat - dLat],
    [maxLon + dLon, maxLat + dLat],
    [minLon - dLon, maxLat + dLat],
  ]
}

/**
 * Área editável a partir dos waypoints: invólucro convexo (anel aberto).
 * Com pontos colineares/degenerados recorre ao retângulo mínimo com folga.
 */
function buildRing(waypoints) {
  if (waypoints.length < 3) throw new Error('KMZ sem waypoints suficientes')
  try {
    const hull = turf.convex(turf.featureCollection(waypoints.map((p) => turf.point(p))))
    const coords = hull?.geometry?.coordinates?.[0]
    if (coords && coords.length >= 4 && turf.area(hull) > MIN_HULL_AREA_M2) {
      const ring = dropClosingVertex(coords.map((c) => [c[0], c[1]]))
      if (ring.length >= 3) return ring
    }
  } catch {
    // invólucro degenerado (pontos colineares) — segue para o retângulo
  }
  return fallbackRect(waypoints)
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/** JSZip aceita ArrayBuffer/Uint8Array/Blob; normaliza File/Blob para buffer. */
async function toZipInput(file) {
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return file
}

/** Escolhe a entrada do zip cujo nome termina em `suffix`, preferindo wpmz/. */
function pickEntry(zip, suffix) {
  const matches = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith(suffix),
  )
  if (matches.length === 0) return null
  return matches.find((f) => f.name.toLowerCase().includes('wpmz/')) || matches[0]
}

/**
 * Lê um .kmz WPML e devolve o necessário para reeditar a missão na app:
 *
 *   { ring, waypoints, altitude, speed, name, droneEnumValue,
 *     payloadEnumValue, waypointCount }
 *
 *  - `ring`      anel exterior ABERTO [[lon, lat], ...] da área reconstruída
 *  - `waypoints` [[lon, lat], ...] pela ordem de voo
 *  - `altitude`  altura única, ou a mediana se os waypoints diferirem (0.1 m)
 *  - `speed`     velocidade automática do troço, ou mediana por waypoint (0.1 m/s)
 *  - campos ausentes no ficheiro vêm a null
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} file ficheiro .kmz
 * @returns {Promise<object>}
 * @throws {Error} mensagem legível (KMZ ilegível, sem waylines/template, …)
 */
export async function parseWpmlKmz(file) {
  let zip
  try {
    zip = await JSZip.loadAsync(await toZipInput(file))
  } catch {
    throw new Error('KMZ ilegível — o ficheiro está corrompido ou não é um .kmz')
  }

  // Estrutura oficial: wpmz/waylines.wpml (rota executável) + wpmz/template.kml
  // (molde). Aceita-se ambos noutras pastas ou na raiz.
  const waylinesEntry = pickEntry(zip, 'waylines.wpml')
  const templateEntry = pickEntry(zip, 'template.kml')
  if (!waylinesEntry && !templateEntry) {
    throw new Error('KMZ sem waylines.wpml nem template.kml — não é uma missão WPML')
  }

  const waylines = waylinesEntry ? extractFromDoc(parseXmlText(await waylinesEntry.async('string'))) : null
  const template = templateEntry ? extractFromDoc(parseXmlText(await templateEntry.async('string'))) : null

  // A rota manda; o template serve de reserva (e dá o nome da missão).
  const main = waylines?.waypoints.length ? waylines : template
  const alt = main === waylines ? template : waylines
  if (!main || main.waypoints.length === 0) {
    throw new Error('KMZ sem coordenadas válidas — nenhum waypoint encontrado')
  }

  const waypoints = main.waypoints

  // Altitude: única se todas as alturas coincidirem, senão mediana.
  const heights = main.heights.length ? main.heights : alt?.heights ?? []
  let altitude = null
  if (heights.length) {
    const uniform = heights.every((h) => Math.abs(h - heights[0]) < 1e-6)
    altitude = uniform ? heights[0] : median(heights)
  } else {
    altitude = main.globalHeight ?? alt?.globalHeight ?? null
  }

  // Velocidade: autoFlightSpeed do Folder, senão mediana dos waypointSpeed.
  const speed =
    main.speed ??
    (main.speeds.length ? median(main.speeds) : null) ??
    alt?.speed ??
    (alt?.speeds.length ? median(alt.speeds) : null) ??
    null

  return {
    ring: buildRing(waypoints),
    waypoints,
    altitude: round1(altitude),
    speed: round1(speed),
    name: template?.name ?? main.name ?? null,
    droneEnumValue: main.droneEnumValue ?? alt?.droneEnumValue ?? null,
    payloadEnumValue: main.payloadEnumValue ?? alt?.payloadEnumValue ?? null,
    waypointCount: waypoints.length,
  }
}
