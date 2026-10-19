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
import * as turf from '@turf/turf'
import { escapeXml } from '../utils/exporters.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'
import { convexHull } from './baseLayout.js'
import { mapLinks } from './fieldSheet.js'
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

const closeRing = (ring) => {
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

/** Contorno de um bloco: a célula do mosaico, senão o invólucro da rota. */
export function blockOutline(block) {
  const cell = (block?.cellRing ?? []).filter(isPoint)
  const ring = cell.length >= 3 ? cell : convexHull(block?.waypoints ?? [])
  if (ring.length < 3) return []
  return closeRing(ring)
}

/** Área planar (fórmula do cadarço) de um anel fechado em metros, em m². */
const planarArea = (ring) => {
  let s = 0
  for (let i = 0; i < ring.length - 1; i++)
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return Math.abs(s) / 2
}

/** Rectângulo de ±w à volta do segmento [a, b] (coordenadas locais em m), fechado. */
function stripRect(a, b, w) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (!(len > 0)) return null
  const nx = (-dy / len) * w
  const ny = (dx / len) * w
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
    [a[0] + nx, a[1] + ny],
  ]
}

/**
 * Contornos exactos de um bloco, como peças { ring, holes } (anéis
 * fechados). Uma célula (mosaico, bateria, grelha, partes) é uma peça, com
 * os buracos que tiver. Um bloco de faixas (K-E2 da revisão) é a área ∩ a
 * faixa de ±espaçamento/2 à volta das suas linhas, limitada a cada
 * segmento — pode dar mais de uma peça num U; o invólucro convexo da rota
 * deixava 32 % da área fora de qualquer bloco e sobrepunha blocos
 * vizinhos. A geometria faz-se num quadro local em metros (rectângulos
 * planos, união e intersecção com a área), com 1 % do espaçamento (e pelo
 * menos 5 cm) a mais de cada lado: o planeador distribui as linhas pela
 * largura da área e o espaçamento real desvia-se até ~1 % do nominal, e
 * sem a folga a união deixava fendas entre faixas vizinhas. Sem
 * espaçamento nem linhas, o invólucro, como antes.
 * @param {any} block { cellRing?, cellHoles?, lines?, waypoints }
 * @param {{spacingM?: number|null, area?: {ring: number[][], holes?: number[][][]}|null}} [opts]
 * @returns {Array<{ring: number[][], holes: number[][][]}>}
 */
export function blockOutlines(block, { spacingM = null, area = null } = {}) {
  const cell = (block?.cellRing ?? []).filter(isPoint)
  if (cell.length >= 3) {
    const holes = (block.cellHoles ?? [])
      .filter((h) => Array.isArray(h) && h.filter(isPoint).length >= 3)
      .map((h) => closeRing(h.filter(isPoint)))
    return [{ ring: closeRing(cell), holes }]
  }
  const lines = Array.isArray(block?.lines)
    ? block.lines.filter((l) => Array.isArray(l) && l.filter(isPoint).length >= 2)
    : []
  const hull = () => {
    const ring = blockOutline(block)
    return ring.length >= 4 ? [{ ring, holes: [] }] : []
  }
  if (!(spacingM > 0) || lines.length === 0) return hull()
  try {
    const origin = lines[0].filter(isPoint)[0]
    const mLon = metersPerDegLonSafe(origin[1])
    const toLocal = (p) => [(p[0] - origin[0]) * mLon, (p[1] - origin[1]) * M_PER_DEG_LAT]
    const fromLocal = (p) => [origin[0] + p[0] / mLon, origin[1] + p[1] / M_PER_DEG_LAT]
    const w = spacingM / 2 + Math.max(0.05, spacingM * 0.01)
    const rects = []
    for (const l of lines) {
      const pts = l.filter(isPoint).map(toLocal)
      for (let i = 0; i < pts.length - 1; i++) {
        const r = stripRect(pts[i], pts[i + 1], w)
        if (r) rects.push(turf.polygon([r]))
      }
    }
    if (rects.length === 0) return hull()
    let shape = rects.length === 1 ? rects[0] : turf.union(turf.featureCollection(rects))
    if (!shape) return hull()
    const areaRing = (area?.ring ?? []).filter(isPoint)
    if (areaRing.length >= 3) {
      const rings = [
        closeRing(areaRing.map(toLocal)),
        ...(area.holes ?? [])
          .filter((h) => Array.isArray(h) && h.filter(isPoint).length >= 3)
          .map((h) => closeRing(h.filter(isPoint).map(toLocal))),
      ]
      const clipped = turf.intersect(turf.featureCollection([shape, turf.polygon(rings)]))
      if (!clipped) return []
      shape = clipped
    }
    const polys =
      shape.geometry.type === 'MultiPolygon'
        ? shape.geometry.coordinates
        : [shape.geometry.coordinates]
    return (
      polys
        .map((coords) => ({
          area: planarArea(coords[0]),
          ring: coords[0].map(fromLocal),
          holes: coords.slice(1).map((h) => h.map(fromLocal)),
        }))
        // peças de menos de 1 m² são fendas numéricas, não blocos
        .filter((p) => p.ring.length >= 4 && p.area > 1)
        .sort((a, b) => b.area - a.area)
        .map(({ ring, holes }) => ({ ring, holes }))
    )
  } catch {
    return hull()
  }
}

/** Ponto para o rótulo do bloco, dentro do contorno mesmo numa célula côncava (K-M6). */
function labelPoint(ring) {
  try {
    const p = turf.pointOnFeature(turf.polygon([closeRing(ring)]))
    return p.geometry.coordinates
  } catch {
    const pts = ring.length > 1 ? ring.slice(0, -1) : ring
    const n = pts.length || 1
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
  }
}

const coord = (p) => `${Number(p[0].toFixed(8))},${Number(p[1].toFixed(8))},0`
const coords = (ring) => ring.map(coord).join(' ')
/**
 * Descrição: linhas de texto, cada uma escapada como HTML, juntas com <br/>;
 * uma entrada { link, text } vira uma hiperligação (a navegação da base).
 */
const description = (lines) =>
  escapeXml(
    lines
      .filter((l) => l != null && l !== '')
      .map((l) =>
        typeof l === 'object'
          ? `<a href="${escapeXml(l.link)}">${escapeXml(l.text)}</a>`
          : escapeXml(l),
      )
      .join('<br/>'),
  )
const min = (s) => Math.round((fin(s) ? s : 0) / 60)

/**
 * @param {object} args
 * @param {string} args.name nome do documento (a missão)
 * @param {any[]} args.sheets baseFieldSheets (src/mission/fieldSheet.js)
 * @param {any[]} args.blocks blocos do plano (id, cellRing?, cellHoles?, lines?, waypoints)
 * @param {any} args.layout layoutBlocks
 * @param {import('./flightFiles.js').FlightFile[]} [args.files]
 * @param {number|null} [args.spacingM] espaçamento das faixas (contornos exactos dos blocos de faixas)
 * @param {{ring: number[][], holes?: number[][][]}|null} [args.area] a área, para recortar esses contornos
 * @param {(key: string, vars?: Record<string, any>) => string} [t]
 * @returns {string}
 */
export function buildBasesKML(
  { name, sheets, blocks, layout, files = [], spacingM = null, area = null },
  t = defaultBasesT,
) {
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

  // uma pasta por base (K-M4): o ponto com a ficha, a zona e os blocos
  // dela, como as pastas de _voos-por-base.zip; os blocos sem base no fim
  const perBase = new Map()
  for (const s of sheets ?? []) {
    if (!isPoint(s.point)) continue
    const key = styleFor(s.color)
    const title = t('bases.label', { label: s.label })
    const nav = mapLinks(s.point, title)
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
      nav ? { link: nav.https, text: t('bases.kml.navigate') } : '',
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
    const items = []
    items.push(`
      <Placemark>
        <name>${escapeXml(title)}</name>
        <description>${description(lines)}</description>
        <styleUrl>#base-${key}</styleUrl>
        <Point><coordinates>${coord(s.point)}</coordinates></Point>
      </Placemark>`)
    const circle = circleRing(s.point, s.radiusM)
    if (circle.length)
      items.push(`
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
    perBase.set(s.label, { title, items })
  }

  // blocos pela ordem de voo, cada um com o rótulo dentro do contorno
  // (MultiGeometry: o Google Earth põe o nome no ponto); um bloco de faixas
  // pode ter mais de uma peça, e só a maior leva o rótulo
  const ordered = [...(blocks ?? [])].sort(
    (a, b) => (layout?.byBlock?.[a.id]?.flight ?? a.id) - (layout?.byBlock?.[b.id]?.flight ?? b.id),
  )
  const noBase = []
  for (const b of ordered) {
    const pieces = blockOutlines(b, { spacingM, area })
    if (pieces.length === 0) continue
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
    const polygon = (piece) => `
          <Polygon>
            <tessellate>1</tessellate>
            <altitudeMode>clampToGround</altitudeMode>
            <outerBoundaryIs><LinearRing><coordinates>${coords(piece.ring)}</coordinates></LinearRing></outerBoundaryIs>${piece.holes
              .map(
                (h) => `
            <innerBoundaryIs><LinearRing><coordinates>${coords(h)}</coordinates></LinearRing></innerBoundaryIs>`,
              )
              .join('')}
          </Polygon>`
    const target = (info.baseLabel && perBase.get(info.baseLabel)?.items) || noBase
    pieces.forEach((piece, k) => {
      target.push(`
      <Placemark>
        <name>${escapeXml(label)}</name>
        <description>${description(lines)}</description>
        <styleUrl>#block-${key}</styleUrl>
        <MultiGeometry>${k === 0 ? `\n          <Point><coordinates>${coord(labelPoint(piece.ring))}</coordinates></Point>` : ''}${polygon(piece)}
        </MultiGeometry>
      </Placemark>`)
    })
  }

  const folder = (title, items) =>
    items.length
      ? `
    <Folder>
      <name>${escapeXml(title)}</name>${items.join('')}
    </Folder>`
      : ''
  const folders = [
    ...[...perBase.values()].map((b) => folder(b.title, b.items)),
    folder(t('bases.kml.noBaseFolder'), noBase),
  ].join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>${styles.join('')}${folders}
  </Document>
</kml>
`
}
