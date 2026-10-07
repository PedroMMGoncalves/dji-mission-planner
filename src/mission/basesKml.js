/**
 * KML de campo «Bases e blocos», para o Google Earth ou a navegação no
 * telemóvel: as bases (ponto com o rótulo e a ficha na descrição), a zona
 * de descolagem de cada uma (círculo com o raio efectivo) e o contorno de
 * cada bloco com o rótulo do seu voo (A-1, B-3). Não é para o Pilot 2 (o
 * parser de KML dele só aceita a área: buildAreaKML).
 *
 * Texto escapado duas vezes onde é HTML: a descrição de um Placemark é
 * HTML dentro de XML, pelo que cada valor é escapado como HTML e a
 * descrição inteira como XML (escapeXml faz as duas coisas).
 */
import { escapeXml } from '../utils/exporters.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'
import { convexHull } from './baseLayout.js'
import basesDict from '../i18n/dict.bases.js'

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const isPoint = (p) => Array.isArray(p) && fin(p[0]) && fin(p[1])

/** Tradutor por omissão: o texto em português de dict.bases.js. */
export function defaultBasesT(key, vars) {
  const entry = /** @type {Record<string, {pt: string}>} */ (basesDict)[key]
  let s = entry ? entry.pt : key
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Cor CSS #rrggbb para a cor KML aabbggrr. */
export function kmlColor(hex, alpha = 'ff') {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex ?? ''))
  if (!m) return `${alpha}ffffff`
  return `${alpha}${m[3]}${m[2]}${m[1]}`.toLowerCase()
}

/**
 * Anel fechado de `n` pontos à volta de `center` com `radiusM` metros
 * (aproximação local, como as zonas do mapa).
 */
export function circleRing(center, radiusM, n = 72) {
  if (!isPoint(center) || !(radiusM > 0)) return []
  const mLon = metersPerDegLonSafe(center[1])
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    out.push([
      center[0] + (radiusM * Math.sin(a)) / mLon,
      center[1] + (radiusM * Math.cos(a)) / M_PER_DEG_LAT,
    ])
  }
  out.push(out[0])
  return out
}

/** Contorno de um bloco: a célula do mosaico, senão o invólucro da rota. */
export function blockOutline(block) {
  const cell = (block?.cellRing ?? []).filter(isPoint)
  const ring = cell.length >= 3 ? cell : convexHull(block?.waypoints ?? [])
  if (ring.length < 3) return []
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

/** Centróide (média dos vértices) de um anel, para o rótulo do bloco. */
function labelPoint(ring) {
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring
  const n = pts.length || 1
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
}

const coord = (p) => `${Number(p[0].toFixed(8))},${Number(p[1].toFixed(8))},0`
const coords = (ring) => ring.map(coord).join(' ')
/** Descrição: linhas de texto, cada uma escapada como HTML, juntas com <br/>. */
const description = (lines) =>
  escapeXml(
    lines
      .filter((l) => l != null && l !== '')
      .map((l) => escapeXml(l))
      .join('<br/>'),
  )
const min = (s) => Math.round((fin(s) ? s : 0) / 60)

/**
 * @param {object} args
 * @param {string} args.name nome do documento (a missão)
 * @param {any[]} args.sheets baseFieldSheets (src/mission/fieldSheet.js)
 * @param {any[]} args.blocks blocos do plano (id, cellRing?, waypoints)
 * @param {any} args.layout layoutBlocks
 * @param {import('./flightFiles.js').FlightFile[]} [args.files]
 * @param {(key: string, vars?: Record<string, any>) => string} [t]
 * @returns {string}
 */
export function buildBasesKML({ name, sheets, blocks, layout, files = [] }, t = defaultBasesT) {
  const fileOf = new Map((files ?? []).map((f) => [f.blockId, f.file]))
  const styles = []
  const styleIds = new Set()
  const styleFor = (color) => {
    const key = String(color ?? '#ffffff')
      .replace('#', '')
      .toLowerCase()
    if (!styleIds.has(key)) {
      styleIds.add(key)
      styles.push(`
    <Style id="base-${key}">
      <IconStyle><color>${kmlColor(color)}</color><scale>1.2</scale></IconStyle>
      <LabelStyle><scale>1.1</scale></LabelStyle>
    </Style>
    <Style id="zone-${key}">
      <LineStyle><color>${kmlColor(color)}</color><width>2</width></LineStyle>
      <PolyStyle><color>${kmlColor(color, '33')}</color></PolyStyle>
    </Style>
    <Style id="block-${key}">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>${kmlColor(color)}</color><scale>1</scale></LabelStyle>
      <LineStyle><color>${kmlColor(color)}</color><width>2</width></LineStyle>
      <PolyStyle><fill>0</fill></PolyStyle>
    </Style>`)
    }
    return key
  }

  const basePlacemarks = []
  const zonePlacemarks = []
  for (const s of sheets ?? []) {
    if (!isPoint(s.point)) continue
    const key = styleFor(s.color)
    const title = t('bases.label', { label: s.label })
    const zone = s.reduced
      ? t('bases.kml.zoneReduced', {
          r: Math.round(s.radiusM),
          req: Math.round(s.requestedRadiusM),
          relief: Math.round(s.cause?.reliefM ?? 0),
          at: Math.round(s.cause?.atM ?? 0),
        })
      : t('bases.kml.zone', { r: Math.round(s.radiusM) })
    const lines = [
      s.coords,
      zone,
      s.refElev != null
        ? t('bases.gain', { ref: Math.round(s.refElev), gain: Math.round(s.gainM ?? 0) })
        : t('bases.zoneNoTerrain'),
      ...s.flights.map((f) =>
        t('bases.kml.flight', {
          flight: f.flightLabel,
          min: min(f.totalS),
          file: f.file ?? '',
        }),
      ),
    ]
    basePlacemarks.push(`
      <Placemark>
        <name>${escapeXml(title)}</name>
        <description>${description(lines)}</description>
        <styleUrl>#base-${key}</styleUrl>
        <Point><coordinates>${coord(s.point)}</coordinates></Point>
      </Placemark>`)
    const circle = circleRing(s.point, s.radiusM)
    if (circle.length)
      zonePlacemarks.push(`
      <Placemark>
        <name>${escapeXml(t('bases.kml.zoneName', { label: s.label, r: Math.round(s.radiusM) }))}</name>
        <description>${description([zone])}</description>
        <styleUrl>#zone-${key}</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <altitudeMode>clampToGround</altitudeMode>
          <outerBoundaryIs><LinearRing><coordinates>${coords(circle)}</coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>`)
  }

  // blocos pela ordem de voo, cada um com o rótulo no centro (MultiGeometry:
  // o Google Earth põe o nome no ponto)
  const ordered = [...(blocks ?? [])].sort(
    (a, b) => (layout?.byBlock?.[a.id]?.flight ?? a.id) - (layout?.byBlock?.[b.id]?.flight ?? b.id),
  )
  const blockPlacemarks = []
  for (const b of ordered) {
    const ring = blockOutline(b)
    if (ring.length < 4) continue
    const info = layout?.byBlock?.[b.id] ?? {}
    const label = info.flightLabel || String(b.id)
    const key = styleFor(info.color ?? '#ffffff')
    const lines = [
      t('bases.kml.block', { id: b.id }),
      info.baseLabel ? t('bases.label', { label: info.baseLabel }) : '',
      fin(b.timeS)
        ? t('bases.kml.time', { min: min(b.timeS + (fin(info.transitS) ? info.transitS : 0)) })
        : '',
      fileOf.get(b.id) ?? '',
    ]
    blockPlacemarks.push(`
      <Placemark>
        <name>${escapeXml(label)}</name>
        <description>${description(lines)}</description>
        <styleUrl>#block-${key}</styleUrl>
        <MultiGeometry>
          <Point><coordinates>${coord(labelPoint(ring))}</coordinates></Point>
          <Polygon>
            <tessellate>1</tessellate>
            <altitudeMode>clampToGround</altitudeMode>
            <outerBoundaryIs><LinearRing><coordinates>${coords(ring)}</coordinates></LinearRing></outerBoundaryIs>
          </Polygon>
        </MultiGeometry>
      </Placemark>`)
  }

  const folder = (title, items) =>
    items.length
      ? `
    <Folder>
      <name>${escapeXml(title)}</name>${items.join('')}
    </Folder>`
      : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>${styles.join('')}${folder(t('bases.kml.basesFolder'), basePlacemarks)}${folder(t('bases.kml.zonesFolder'), zonePlacemarks)}${folder(t('bases.kml.blocksFolder'), blockPlacemarks)}
  </Document>
</kml>
`
}
