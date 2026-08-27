import * as turf from '@turf/turf'
import { ringToPolygon } from './geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from './units.js'

/**
 * PLANEAMENTO DE PONTOS DE CONTROLO NO SOLO (GCPs)
 * ------------------------------------------------
 * Heurística de colocação de alvos para fotogrametria com drone.
 *
 * Fundamento (literatura fotogramétrica):
 *  - Martínez-Carricondo et al. (2018), "Assessment of UAV-photogrammetric
 *    mapping accuracy based on variation of ground control points":
 *    o erro planimétrico minimiza-se com GCPs distribuídos ao longo do BORDO
 *    da área, uniformemente espaçados; o erro altimétrico minimiza-se
 *    acrescentando GCPs no INTERIOR (bordo + centro é a configuração ótima).
 *  - Sanz-Ablanedo et al. (2018), "Accuracy of UAV photogrammetry... as a
 *    function of the number and location of GCPs": o ganho de exatidão satura
 *    a partir de ~1 GCP por 2–10 ha; abaixo de 5 GCPs o erro cresce
 *    rapidamente e acima de ~25 o esforço de campo deixa de compensar.
 *
 * Traduz-se em três regras implementadas neste módulo:
 *  1. densidade — ~1 GCP por 5 ha, com mínimo de 5 e máximo de 25;
 *  2. bordo primeiro — candidatos amostrados no perímetro, mas puxados para
 *     DENTRO da área (os alvos têm de assentar em terreno levantado);
 *  3. uniformidade — seleção greedy "farthest-point", que maximiza a
 *     separação mínima e cobre também o interior.
 *
 * Convenções (iguais às de geo.js):
 *  - "ring" = anel aberto do polígono: [[lon, lat], ...] sem repetir o 1.º vértice.
 *  - Coordenadas em WGS84 (EPSG:4326), distâncias em metros.
 */

const BOUNDARY_SAMPLES = 64 // nº de amostras ao longo do perímetro
const MAX_GRID_POINTS = 2500 // trava contra grelhas interiores enormes
const MIN_SEPARATION_M = 10 // dois alvos mais próximos que isto não acrescentam informação
const MIN_INSET_M = 15 // recuo mínimo do bordo
const INSET_FRACTION = 0.03 // recuo = 3% de √área

/** Identificador normalizado: 1 → 'GCP-01'. */
function gcpId(n) {
  return `GCP-${String(n).padStart(2, '0')}`
}

/**
 * Nº de GCPs sugerido para uma área: 5 de base, +1 por cada 5 ha,
 * limitado a 25 (ver Sanz-Ablanedo 2018 — a exatidão satura).
 * @param {number} areaHa área em hectares
 * @returns {number} inteiro entre 5 e 25
 */
export function suggestedGcpCount(areaHa) {
  const ha = Number.isFinite(areaHa) && areaHa > 0 ? areaHa : 0
  return Math.min(25, Math.max(5, 5 + Math.floor(ha / 5)))
}

/**
 * Distribui `count` GCPs sobre a área: bordo (recuado para dentro) + interior,
 * com separação máxima entre alvos.
 *
 * Algoritmo:
 *  a) recuo (`insetM`) = 3% de √área, nunca inferior a 15 m;
 *  b) candidatos de bordo: ~64 amostras regulares do perímetro, cada uma
 *     deslocada `insetM` metros na direção do centróide;
 *  c) candidatos interiores: grelha regular sobre a bbox, com espaçamento
 *     max(50, √(área/count)/2) metros;
 *  d) todos os candidatos são filtrados para dentro do polígono, exigindo
 *     ainda uma folga de `insetM/2` ao bordo (evita alvos à beira do limite);
 *  e) seleção greedy farthest-point a partir de turf.pointOnFeature.
 *
 * Se a área for pequena demais para `count` alvos com este recuo, devolve
 * apenas os que couberem (nunca menos de 1).
 *
 * @param {Array<[number,number]>} ring anel aberto [[lon,lat], ...]
 * @param {number} count nº de GCPs pretendido
 * @param {{ insetM?: number|null }} [options]
 * @returns {Array<{ id: string, point: [number, number] }>} ordenados por id
 */
export function planGcps(ring, count, { insetM = null } = {}) {
  if (!ring || ring.length < 3) return []

  const poly = ringToPolygon(ring)
  const areaM2 = turf.area(poly)
  const target = Math.max(1, Math.floor(Number(count) || 0) || 1)

  // (a) recuo do bordo
  const inset =
    Number.isFinite(insetM) && insetM > 0
      ? insetM
      : Math.max(MIN_INSET_M, INSET_FRACTION * Math.sqrt(areaM2))
  const clearance = inset / 2

  const outline = turf.lineString([...ring, ring[0]])
  const isInside = (c) => turf.booleanPointInPolygon(turf.point(c), poly)
  /** dentro do polígono E a pelo menos `m` metros do contorno */
  const isClear = (c, m) =>
    isInside(c) &&
    turf.pointToLineDistance(turf.point(c), outline, { units: 'meters' }) >= m

  // Alvo do deslocamento para o interior. Em polígonos côncavos o centróide
  // pode cair fora da área — nesse caso usa-se um ponto garantidamente interior.
  let pullTo = turf.centroid(poly).geometry.coordinates
  if (!isInside(pullTo)) pullTo = turf.pointOnFeature(poly).geometry.coordinates

  const candidates = []

  // (b) candidatos de bordo, recuados na direção do centróide
  const perimeterM = turf.length(outline, { units: 'meters' })
  if (perimeterM > 0) {
    const stepM = perimeterM / BOUNDARY_SAMPLES
    for (let i = 0; i < BOUNDARY_SAMPLES; i++) {
      const sample = turf.along(outline, i * stepM, { units: 'meters' }).geometry.coordinates
      const inward = turf.bearing(sample, pullTo)
      if (!Number.isFinite(inward)) continue
      const moved = turf.destination(sample, inset, inward, { units: 'meters' })
      const p = moved.geometry.coordinates
      if (isClear(p, clearance)) candidates.push(p)
    }
  }

  // (c) candidatos interiores: grelha regular sobre a bbox
  const [minX, minY, maxX, maxY] = turf.bbox(poly)
  const midLat = (minY + maxY) / 2
  const widthM = turf.distance([minX, midLat], [maxX, midLat], { units: 'meters' })
  const heightM = turf.distance([minX, minY], [minX, maxY], { units: 'meters' })
  let gridStepM = Math.max(50, Math.sqrt(areaM2 / target) / 2)
  const cells = Math.ceil(widthM / gridStepM) * Math.ceil(heightM / gridStepM)
  if (cells > MAX_GRID_POINTS) gridStepM *= Math.sqrt(cells / MAX_GRID_POINTS)

  const dLon = gridStepM / metersPerDegLon(midLat)
  const dLat = gridStepM / M_PER_DEG_LAT
  if (dLon > 0 && dLat > 0) {
    // meio passo de desfasamento para a grelha ficar centrada na bbox
    for (let x = minX + dLon / 2; x <= maxX; x += dLon) {
      for (let y = minY + dLat / 2; y <= maxY; y += dLat) {
        const p = [x, y]
        if (isClear(p, clearance)) candidates.push(p)
      }
    }
  }

  // (e) seleção greedy farthest-point. O primeiro ponto vem de
  // turf.pointOnFeature (garantidamente dentro da área).
  const chosen = [turf.pointOnFeature(poly).geometry.coordinates]
  const pool = candidates
  // minDist[i] = distância do candidato i ao GCP escolhido mais próximo
  const minDist = pool.map((p) => turf.distance(p, chosen[0], { units: 'meters' }))

  while (chosen.length < target && pool.length > 0) {
    let best = 0
    for (let i = 1; i < pool.length; i++) {
      if (minDist[i] > minDist[best]) best = i
    }
    // só restam candidatos colados aos já escolhidos: a área não dá para mais
    if (!(minDist[best] > MIN_SEPARATION_M)) break
    const picked = pool[best]
    chosen.push(picked)
    pool.splice(best, 1)
    minDist.splice(best, 1)
    for (let i = 0; i < pool.length; i++) {
      const d = turf.distance(pool[i], picked, { units: 'meters' })
      if (d < minDist[i]) minDist[i] = d
    }
  }

  // ids por ordem de seleção (o array já está ordenado por id)
  return chosen.map((point, i) => ({ id: gcpId(i + 1), point }))
}

/**
 * Métricas de controlo de qualidade da distribuição de GCPs.
 * @param {Array<[number,number]>} ring anel aberto da área
 * @param {Array<{ id: string, point: [number, number] }>} gcps
 * @returns {{ count: number, areaHa: number, haPerGcp: number|null, minSpacingM: number }}
 *          `haPerGcp` é null sem GCPs; `minSpacingM` é Infinity com 0 ou 1 GCP.
 */
export function gcpStats(ring, gcps) {
  const list = Array.isArray(gcps) ? gcps : []
  const count = list.length
  const areaHa = ring && ring.length >= 3 ? turf.area(ringToPolygon(ring)) / 10000 : 0

  let minSpacingM = Infinity
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const d = turf.distance(list[i].point, list[j].point, { units: 'meters' })
      if (d < minSpacingM) minSpacingM = d
    }
  }

  return {
    count,
    areaHa,
    haPerGcp: count > 0 ? areaHa / count : null,
    minSpacingM,
  }
}

function fmtCoord(v) {
  return Number(v.toFixed(8))
}

function escapeXml(s) {
  return String(s).replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c],
  )
}

/**
 * KML 2.2 com um Placemark por GCP (para levar no telemóvel/GPS de campo).
 * Todos os pontos partilham um Style com IconStyle amarelo (ff00d7ff, ABGR).
 * @param {Array<{ id: string, point: [number, number] }>} gcps
 * @param {string} [name] nome do Document
 * @returns {string} XML bem formado
 */
export function buildGcpKML(gcps, name = 'GCPs') {
  const placemarks = (Array.isArray(gcps) ? gcps : [])
    .map(
      ({ id, point }) => `    <Placemark>
      <name>${escapeXml(id)}</name>
      <styleUrl>#gcpTarget</styleUrl>
      <Point>
        <coordinates>${fmtCoord(point[0])},${fmtCoord(point[1])},0</coordinates>
      </Point>
    </Placemark>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Style id="gcpTarget">
      <IconStyle>
        <color>ff00d7ff</color>
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff00d7ff</color>
        <scale>0.9</scale>
      </LabelStyle>
    </Style>
${placemarks}
  </Document>
</kml>
`
}
