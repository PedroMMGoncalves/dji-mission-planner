import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang, useT } from '../i18n.jsx'
import { rangeText, tCount } from '../i18n/format.js'
import { OPS_NEAR_FRAC } from '../mission/opsSummary.js'
import { preflightCounts } from '../mission/preflight.js'
import { groupPreflight } from '../mission/preflightGroups.js'
import { DEFAULT_SAFETY } from '../mission/safety.js'
import { rthRangeLabel } from '../mission/transitLegs.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'
import { verticalDatumLabel } from '../utils/verticalDatum.js'
import BaseFieldSheets, {
  flightViewText,
  viewCaveatText,
  viewTerrainText,
} from './BaseFieldSheets.jsx'
import { IconCheckCircle, IconInfo, IconReport, IconShield, IconWarning } from './Icons.jsx'
import { inkOn, PreflightGroup, PreflightItem } from './PreflightBar.jsx'
import { fmtClock, fmtTime } from './StatsPanel.jsx'
import { Button } from './ui/Button.jsx'
import { Badge } from './ui/Pill.jsx'
import { Table } from './ui/Table.jsx'
import { CloseKeyButton, useDialogFocus } from './ui/Window.jsx'

/* ------------------------------------------------------------------ *
 * Relatório de plano de missão — página imprimível (A4 retrato).
 *
 * Sobreposição em ecrã inteiro sobre o planeador, com uma barra (as
 * secções, imprimir e fechar) que não se imprime, e por baixo: a
 * identificação, o mapa estático composto em <canvas> (tiles Esri World
 * Imagery + geometria desenhada no contexto 2D) com a operação e a legenda
 * ao lado, os parâmetros de voo, os voos por base (a ficha de campo de cada
 * base numa linha; as fichas inteiras abrem-se por baixo da tabela), os
 * GCPs, os pontos de inspecção, a segurança, o preflight, a
 * reprodutibilidade e as assinaturas. Os voos e as bases têm os nomes e as
 * cores do planeador (A-1 … T-20). Impresso, sai em branco, sem a barra.
 *
 * Bilingue PT/EN com dicionário interno (`bi`), como em ChecklistPage:
 * os textos só desta página vivem junto do sítio onde são usados, sem
 * passar pelo dicionário global; os que o planeador já diz (preflight,
 * métricas, fichas das bases, segurança) vêm de lá, com as mesmas palavras.
 *
 * Convenção de coordenadas (ver src/utils/geo.js): [lon, lat] em WGS84.
 * ------------------------------------------------------------------ */

/** Par bilingue PT/EN. */
const bi = (pt, en) => ({ pt, en })

/** Resolve um par bilingue (ou string simples) na língua pedida, com `{chave}` trocadas. */
const tr = (v, lang, vars = null) => {
  if (v == null) return ''
  let s = typeof v === 'string' ? v : (v[lang] ?? v.pt ?? '')
  if (vars) for (const [k, x] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(x))
  return s
}

/* ---------------------------- Textos ---------------------------- */

const UI = {
  // a barra de cima (não se imprime)
  sectionsNav: bi('Secções do relatório', 'Report sections'),
  paramsNav: bi('Parâmetros', 'Parameters'),
  a4: bi('A4 vertical · imprime em fundo branco', 'A4 portrait · prints on white'),
  print: bi('Imprimir', 'Print'),
  printTitle: bi(
    'Imprimir o relatório, ou guardá-lo em PDF',
    'Print the report, or save it as PDF',
  ),
  close: bi('Fechar', 'Close'),
  closeTitle: bi('Fechar o relatório (Esc)', 'Close the report (Esc)'),

  // identificação
  title: bi('Relatório de plano de missão', 'Mission plan report'),
  subtitle: bi(
    'Plano gerado no DJI Mission Planner · verificar em campo antes de voar',
    'Plan generated in DJI Mission Planner · verify in the field before flying',
  ),
  mission: bi('Missão', 'Mission'),
  date: bi('Data', 'Date'),
  platform: bi('Plataforma', 'Platform'),
  camera: bi('Câmara', 'Camera'),
  sensor: bi('Sensor', 'Sensor'),
  focal: bi('focal {f} mm', 'focal length {f} mm'),
  mode: bi('Modo', 'Mode'),
  terrain: bi('Relevo', 'Terrain'),
  noTerrain: bi('sem relevo carregado', 'no terrain loaded'),
  positioning: bi('Posicionamento', 'Positioning'),
  posGnss: bi('GNSS · RTK desligado', 'GNSS · RTK off'),
  posRtk: bi('RTK', 'RTK'),
  untitled: bi('Missão sem nome', 'Untitled mission'),
  flightsN: bi('{n} voos', '{n} flights'),
  flightsOne: bi('1 voo', '1 flight'),
  flightsIn: bi('{flights} em {bases}', '{flights} from {bases}'),

  // mapa, operação e legenda
  mapTitle: bi('Mapa', 'Map'),
  mapArea: bi('área', 'area'),
  mapLinesByFlight: bi('faixas por voo', 'lines by flight'),
  mapLines: bi('faixas de voo', 'flight lines'),
  mapBases: bi('bases', 'bases'),
  mapGcps: bi('GCPs', 'GCPs'),
  and: bi(' e ', ' and '),
  mapImagery: bi('imagem: Esri World Imagery', 'imagery: Esri World Imagery'),
  mapOffline: bi('imagem de satélite indisponível', 'satellite imagery unavailable'),
  mapLoading: bi('A compor a imagem de satélite…', 'Composing the satellite imagery…'),
  mapMissing: bi('Sem área desenhada.', 'No area drawn.'),
  opTitle: bi('Operação', 'Operation'),
  opIn: bi('{n} em {bases}', '{n} from {bases}'),
  opRange: bi('{lead}, de {first} a {last}', '{lead}, {first} to {last}'),
  teamSets: bi('na equipa: {s}', 'in the team: {s}'),
  teamUnknown: bi('na equipa: por definir na Configuração', 'in the team: not set in Settings'),
  totalTime: bi('Tempo total', 'Total time'),
  withTransit: bi('{time} com deslocações', '{time} incl. transit'),
  flyingSum: bi('{time} a voar (soma dos voos)', '{time} flying (sum of the flights)'),
  vlosWorst: bi(
    '{vlos} m · pior caso {worst} m ({flight})',
    '{vlos} m · worst case {worst} m ({flight})',
  ),
  legendTitle: bi('Legenda', 'Legend'),
  legendBase: bi('Base, na cor da base', 'Base, in its colour'),
  legendFlight: bi('Voo, na 1.ª faixa do bloco', 'Flight, on the block’s first line'),
  legendLines: bi('Faixas de voo', 'Flight lines'),
  legendArea: bi('Contorno da área', 'Area outline'),
  legendGcp: bi('GCP, alvo de apoio', 'GCP, ground control target'),

  // parâmetros
  paramsTitle: bi('Parâmetros de voo', 'Flight parameters'),
  paramsSame: bi('os mesmos em todos os voos', 'the same for every flight'),
  pAltitudeRel: bi('Altura acima da descolagem', 'Height above take-off'),
  pAltitudeTf: bi('Altura AGL (segue o terreno)', 'AGL height (follows terrain)'),
  pGsd: bi('GSD', 'GSD'),
  pSpeed: bi('Velocidade', 'Speed'),
  pOverlap: bi('Sobreposição frontal / lateral', 'Forward / side overlap'),
  pManualSpacing: bi('Espaçamento manual', 'Manual spacing'),
  pSpacing: bi('Espaçamento entre faixas', 'Line spacing'),
  pInterval: bi('Intervalo de disparo', 'Trigger interval'),
  pAngle: bi('Azimute das faixas', 'Line azimuth'),
  pBuffer: bi('Margem da área', 'Area buffer'),
  pGimbal: bi('Inclinação do gimbal', 'Gimbal pitch'),
  pCrosshatch: bi('Dupla grelha', 'Crosshatch'),
  yes: bi('Sim', 'Yes'),
  no: bi('Não', 'No'),
  noStats: bi('Plano ainda não gerado.', 'Plan not generated yet.'),

  // voos
  flightsByBase: bi('Voos por base', 'Flights by base'),
  flights: bi('Voos', 'Flights'),
  flightsNoteBases: bi(
    '{bases} · {flights} · pela ordem de voo · a ficha de campo de cada base numa linha',
    '{bases} · {flights} · in flight order · each base’s field sheet on one line',
  ),
  flightsNote: bi('{flights} · pela ordem de voo', '{flights} · in flight order'),
  commonLead: bi('Comum a todos os voos:', 'Common to every flight:'),
  commonTakeoff: bi('subida de {m} m na descolagem', '{m} m climb at take-off'),
  commonSets: bi('1 conjunto de baterias por voo', '1 battery set per flight'),
  commonZone: bi('zona de descolagem pedida: {r} m', 'requested take-off zone: {r} m'),
  commonTransit: bi(
    '{min} min de deslocação em cada voo (ida e volta)',
    '{min} min of transit on each flight (there and back)',
  ),
  commonView: bi('cada bloco 100 % visível da sua base', 'each block 100 % visible from its base'),
  commonViewPending: bi('a vista da base a calcular…', 'the view from the base being computed…'),
  filesRange: bi(
    'Um KMZ por voo, com o nome do voo: de {first} a {last}.',
    'One KMZ per flight, named after the flight: {first} to {last}.',
  ),
  fileOne: bi('O KMZ do voo: {file}.', 'The flight’s KMZ: {file}.'),
  cBase: bi('Base', 'Base'),
  cBaseSub: bi('coordenadas', 'coordinates'),
  cZone: bi('Zona de descolagem', 'Take-off zone'),
  cZoneSub: bi('raio · o que a reduz', 'radius · what reduces it'),
  cRefSub: bi('voo acima do planeado', 'flight above plan'),
  cRth: bi('RTH', 'RTH'),
  cRthSub: bi('acima da descolagem', 'above take-off'),
  cFlightSub: bi('área · distância', 'area · distance'),
  cTimeUseful: bi('Tempo contra os {u} úteis', 'Time vs the {u} usable'),
  cTime: bi('Tempo', 'Time'),
  cTimeSub: bi('com deslocação · % útil', 'incl. transit · % usable'),
  cTimeSubNoUseful: bi('com deslocação', 'incl. transit'),
  cTimeSubPct: bi('% do tempo útil', '% of usable time'),
  cHeightsSub: bi('1.º waypoint–máximo', '1st waypoint–highest'),
  cVlos: bi('VLOS', 'VLOS'),
  cVlosSub: bi('pior caso', 'worst case'),
  cArea: bi('Área', 'Area'),
  cDistance: bi('Distância', 'Distance'),
  zoneReduced: bi('{r} m, reduzida', '{r} m, reduced'),
  zoneReducedFrom: bi('{r} m, reduzida de {req} m', '{r} m, reduced from {req} m'),
  zoneRelief: bi('{relief} m de desnível a {at} m', '{relief} m of relief at {at} m'),
  zoneNone: bi('sem redução', 'not reduced'),
  gainUpTo: bi('voo até +{gain} m', 'flight up to +{gain} m'),
  longest: bi('{pct} % · o mais longo ({clock})', '{pct} % · the longest ({clock})'),
  transitOf: bi('{min} min de deslocação', '{min} min of transit'),
  flyMin: bi('{min} min a voar', '{min} min flying'),
  barLabel: bi(
    '{flight}: {fly} a voar e {transit} de deslocação, {total} de {useful} úteis ({pct} %)',
    '{flight}: {fly} flying and {transit} of transit, {total} of {useful} usable ({pct} %)',
  ),
  barLabelNoTransit: bi(
    '{flight}: {total} de {useful} úteis ({pct} %)',
    '{flight}: {total} of {useful} usable ({pct} %)',
  ),
  total: bi('Total', 'Total'),
  setsN: bi('{n} conjuntos', '{n} sets'),
  setsOne: bi('1 conjunto', '1 set'),
  zonesReduced: bi('{n} zonas reduzidas', '{n} reduced zones'),
  zonesReducedOne: bi('1 zona reduzida', '1 reduced zone'),
  zonesNone: bi('nenhuma reduzida', 'none reduced'),
  // o número e a unidade juntos: no papel, se faltar largura, parte depois de «máx.»
  maxVlos: bi('máx. {m}\u00a0m', 'max. {m}\u00a0m'),
  sheetsShow: bi('Ver as fichas de campo das {n} bases', 'Show the field sheets of the {n} bases'),
  sheetsShowOne: bi('Ver a ficha de campo da base {label}', 'Show the field sheet of base {label}'),
  sheetsHide: bi('Esconder as fichas de campo', 'Hide the field sheets'),
  sheetsHideOne: bi('Esconder a ficha de campo', 'Hide the field sheet'),
  sheetsHint: bi(
    'Inteiras, como na checklist de campo: os ficheiros, a vista da base e as baterias de cada base. Abertas, imprimem-se com o relatório.',
    'In full, as in the field checklist: each base’s files, view from the base and batteries. Open, they print with the report.',
  ),

  // GCPs e pontos de inspecção
  gcpsTitle: bi('GCPs', 'GCPs'),
  gcpsNote: bi('Coordenadas WGS84 (lat, lon)', 'WGS84 coordinates (lat, lon)'),
  inspectTitle: bi('Pontos de inspecção', 'Inspection points'),
  inspectNav: bi('Inspecção', 'Inspection'),
  inspectNote: bi('Esqueleto do relatório de campo', 'Field report skeleton'),
  inspectIdx: bi('N.º', 'No.'),
  inspectLabel: bi('Etiqueta', 'Label'),
  inspectCoords: bi('Lat, Lon', 'Lat, Lon'),
  inspectHeight: bi('Altura (m)', 'Height (m)'),
  inspectPhoto: bi('Foto prevista', 'Expected photo'),
  inspectYes: bi('sim', 'yes'),
  inspectNo: bi('não', 'no'),

  // segurança
  safetyTitle: bi('Segurança', 'Safety'),
  sTakeoff: bi('Altura de segurança na descolagem', 'Take-off safety height'),
  sHeights: bi('Alturas no KMZ', 'Heights in the KMZ'),
  rthAuto: bi('Automática: {range} m acima da descolagem', 'Automatic: {range} m above take-off'),
  rthAutoTable: bi(
    'Automática: {range} m acima da descolagem, a de cada voo na tabela «Voos por base»',
    'Automatic: {range} m above take-off, each flight’s in the “Flights by base” table',
  ),
  rthFixed: bi(
    '{range} m acima da descolagem, escrita pelo piloto, em todos os voos',
    '{range} m above take-off, typed by the pilot, on every flight',
  ),
  takeoffValue: bi(
    '{m} m de subida vertical antes da deslocação',
    '{m} m vertical climb before the transit',
  ),
  heightsTakeoff: bi('Relativas ao ponto de descolagem', 'Relative to the take-off point'),
  heightsBases: bi(
    'Relativas ao ponto de descolagem de cada base',
    'Relative to each base’s take-off point',
  ),

  // reprodutibilidade e incerteza
  reproTitle: bi('Reprodutibilidade e incerteza', 'Reproducibility and uncertainty'),
  reproNav: bi('Reprodutibilidade', 'Reproducibility'),
  rVersion: bi('Versão da aplicação', 'Application version'),
  rHash: bi('Impressão do projecto (SHA-256)', 'Project fingerprint (SHA-256)'),
  rPositioning: bi('Posicionamento', 'Positioning'),
  rAgl: bi('Altura AGL [pior, melhor]', 'AGL height [worst, best]'),
  rGsd: bi('GSD [pior, melhor]', 'GSD [worst, best]'),
  rOverlap: bi(
    'Sobreposição frontal / lateral [pior, melhor]',
    'Forward / side overlap [worst, best]',
  ),
  rBlur: bi('Arrastamento a 1/1000 · 1/500 s', 'Motion blur at 1/1000 · 1/500 s'),
  rDatum: bi('Datum vertical do relevo', 'Elevation vertical datum'),
  rPreflight: bi('Preflight', 'Preflight'),
  rPreflightOk: bi('sem bloqueios nem avisos', 'no blockers or warnings'),
  rNote: bi(
    'A impressão é o SHA-256 do ficheiro de projecto tal como se grava; com a mesma versão e a mesma impressão o plano regenera-se bit a bit.',
    'The fingerprint is the SHA-256 of the project file as saved; with the same version and fingerprint the plan regenerates bit for bit.',
  ),

  // assinaturas
  sigPilot: bi('Piloto responsável', 'Pilot in command'),
  sigSupervisor: bi('Supervisor técnico', 'Technical supervisor'),
  warning: bi(
    'Validar a missão no DJI Pilot 2 antes de voar.',
    'Validate the mission in DJI Pilot 2 before flying.',
  ),
}

/* ------------------- Mapa: constantes e projecção ------------------- */

const CANVAS_W = 1200
const CANVAS_H = 800
const TILE_SIZE = 256
const MAX_ZOOM = 19
const MIN_SPAN_PX = 1000 // resolução mínima pedida no lado maior da bbox
const BBOX_PAD = 0.125 // 12,5% por lado → ~25% de margem total
const MAX_TILES = 160 // trava contra mosaicos enormes
const TILE_TIMEOUT_MS = 9000
const MERCATOR_MAX_LAT = 85.05112878

/** Paleta dos blocos — igual à do mapa principal (ver MapView.jsx). */
const BLOCK_COLORS = [
  '#22d3ee',
  '#a3e635',
  '#f472b6',
  '#fbbf24',
  '#c084fc',
  '#34d399',
  '#fb923c',
  '#60a5fa',
]

const LINE_COLOR = '#22d3ee'
const BASE_COLOR = '#f59e0b'
const GCP_COLOR = '#facc15'
const HALO = 'rgba(2, 6, 23, 0.72)'
// o fundo dos rótulos dos voos e o contorno dos pinos (os da legenda e do desenho)
const BADGE_BG = '#111A2D'
const PIN_RING = 'rgba(10, 15, 28, 0.6)'

const tileUrl = (z, x, y) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Web Mercator: lon/lat → píxel global do mosaico do zoom `z`.
 * Origem no canto noroeste do mundo; o mosaico tem 2^z × TILE_SIZE píxeis de
 * lado (mesma fórmula de lonLatToPixel em src/utils/terrain.js).
 */
function lonLatToPixel(lon, lat, z) {
  const scale = 2 ** z * TILE_SIZE
  const latRad = (clamp(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT) * Math.PI) / 180
  const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2
  return { x: ((lon + 180) / 360) * scale, y: y * scale }
}

/** Bounding box do anel com margem relativa. */
function paddedBBox(ring) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const p of ring) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    if (p[0] < minLon) minLon = p[0]
    if (p[0] > maxLon) maxLon = p[0]
    if (p[1] < minLat) minLat = p[1]
    if (p[1] > maxLat) maxLat = p[1]
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null
  const dLon = Math.max(maxLon - minLon, 1e-4)
  const dLat = Math.max(maxLat - minLat, 1e-4)
  return {
    minLon: minLon - dLon * BBOX_PAD,
    maxLon: maxLon + dLon * BBOX_PAD,
    minLat: minLat - dLat * BBOX_PAD,
    maxLat: maxLat + dLat * BBOX_PAD,
  }
}

/** Menor zoom em que o lado maior da bbox atinge MIN_SPAN_PX (máx. MAX_ZOOM). */
function pickZoom(bbox) {
  for (let z = 1; z < MAX_ZOOM; z++) {
    const nw = lonLatToPixel(bbox.minLon, bbox.maxLat, z)
    const se = lonLatToPixel(bbox.maxLon, bbox.minLat, z)
    if (Math.max(se.x - nw.x, se.y - nw.y) >= MIN_SPAN_PX) return z
  }
  return MAX_ZOOM
}

/**
 * Vista do mapa: zoom, escala e função de projecção lon/lat → píxel do canvas.
 * A bbox é ajustada ao canvas preservando a proporção (letterbox centrado).
 */
function buildView(ring) {
  if (!ring || ring.length < 3) return null
  const bbox = paddedBBox(ring)
  if (!bbox) return null

  let z = pickZoom(bbox)
  let view = null
  // reduz o zoom enquanto o mosaico exigir demasiados tiles
  for (; z >= 1; z--) {
    const nw = lonLatToPixel(bbox.minLon, bbox.maxLat, z)
    const se = lonLatToPixel(bbox.maxLon, bbox.minLat, z)
    const w = se.x - nw.x
    const h = se.y - nw.y
    if (!(w > 0) || !(h > 0)) return null

    const scale = Math.min(CANVAS_W / w, CANVAS_H / h)
    const offX = (CANVAS_W - w * scale) / 2 - nw.x * scale
    const offY = (CANVAS_H - h * scale) / 2 - nw.y * scale

    const n = 2 ** z
    const x0 = clamp(Math.floor(-offX / scale / TILE_SIZE), 0, n - 1)
    const x1 = clamp(Math.floor((CANVAS_W - offX) / scale / TILE_SIZE), 0, n - 1)
    const y0 = clamp(Math.floor(-offY / scale / TILE_SIZE), 0, n - 1)
    const y1 = clamp(Math.floor((CANVAS_H - offY) / scale / TILE_SIZE), 0, n - 1)

    view = {
      z,
      scale,
      offX,
      offY,
      tiles: { x0, x1, y0, y1 },
      project: (pt) => {
        const p = lonLatToPixel(pt[0], pt[1], z)
        return [p.x * scale + offX, p.y * scale + offY]
      },
    }
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES) break
  }
  return view
}

/* ---------------------- Carregamento dos tiles ---------------------- */

/**
 * Carrega uma imagem com CORS. Resolve sempre (com a imagem ou com null),
 * para que uma falha de rede/CORS nunca quebre o relatório. `pending`
 * recolhe as imagens em curso para permitir cancelamento no cleanup.
 */
function loadTile(url, pending) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      pending.delete(img)
      resolve(value)
    }
    const timer = setTimeout(() => {
      img.src = ''
      finish(null)
    }, TILE_TIMEOUT_MS)
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    pending.add(img)
    img.src = url
  })
}

function loadTiles(view, pending) {
  const { z, tiles } = view
  const jobs = []
  for (let x = tiles.x0; x <= tiles.x1; x++) {
    for (let y = tiles.y0; y <= tiles.y1; y++) {
      jobs.push(loadTile(tileUrl(z, x, y), pending).then((img) => (img ? { img, x, y } : null)))
    }
  }
  return Promise.all(jobs).then((r) => r.filter(Boolean))
}

/* -------------------------- Desenho no canvas -------------------------- */

/** Fundo neutro com grelha — usado quando não há tiles disponíveis. */
function drawFallback(ctx) {
  ctx.save()
  ctx.fillStyle = '#64748b'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= CANVAS_W; x += 60) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, CANVAS_H)
  }
  for (let y = 0; y <= CANVAS_H; y += 60) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(CANVAS_W, y + 0.5)
  }
  ctx.stroke()
  ctx.restore()
}

/** Mosaico de tiles, alinhado ao píxel para não deixar costuras. */
function drawTiles(ctx, view, tiles) {
  const { scale, offX, offY } = view
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const { img, x, y } of tiles) {
    const px0 = Math.floor(x * TILE_SIZE * scale + offX)
    const px1 = Math.ceil((x + 1) * TILE_SIZE * scale + offX)
    const py0 = Math.floor(y * TILE_SIZE * scale + offY)
    const py1 = Math.ceil((y + 1) * TILE_SIZE * scale + offY)
    try {
      ctx.drawImage(img, px0, py0, px1 - px0, py1 - py0)
    } catch {
      /* imagem inutilizável — ignorar este tile */
    }
  }
  ctx.restore()
}

function tracePath(ctx, points, view, close) {
  ctx.beginPath()
  points.forEach((pt, i) => {
    const [x, y] = view.project(pt)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (close) ctx.closePath()
}

/** Texto com halo escuro, para se ler sobre qualquer fundo. */
function labelText(ctx, text, x, y, color, size = 13, align = 'left') {
  ctx.save()
  ctx.font = `bold ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = HALO
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawArea(ctx, view, ring) {
  ctx.save()
  ctx.lineJoin = 'round'
  tracePath(ctx, ring, view, true)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.fill()
  ctx.strokeStyle = HALO
  ctx.lineWidth = 7
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()
}

function drawFlightLines(ctx, view, groups) {
  ctx.save()
  ctx.lineCap = 'round'

  // halo comum, por baixo de todas as faixas
  ctx.strokeStyle = HALO
  ctx.lineWidth = 4.5
  ctx.beginPath()
  for (const g of groups) {
    for (const seg of g.lines) {
      const a = view.project(seg[0])
      const b = view.project(seg[1])
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
  }
  ctx.stroke()

  // faixas, uma cor por bloco
  for (const g of groups) {
    ctx.strokeStyle = g.color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const seg of g.lines) {
      const a = view.project(seg[0])
      const b = view.project(seg[1])
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Caminho de um rectângulo de cantos redondos. */
function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

/**
 * O rótulo do voo («A-1», o mesmo do mapa do planeador e das fichas) numa
 * pastilha escura com o contorno na cor do bloco, no meio da primeira faixa
 * do bloco — como na legenda do relatório.
 */
function drawBlockBadges(ctx, view, groups) {
  if (groups.length < 2) return
  ctx.save()
  ctx.font = 'bold 16px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const g of groups) {
    const first = g.lines[0]
    if (!first) continue
    const mid = [(first[0][0] + first[1][0]) / 2, (first[0][1] + first[1][1]) / 2]
    const [x, y] = view.project(mid)
    const w = Math.max(32, ctx.measureText(g.label).width + 22)
    const h = 32
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, h / 2)
    ctx.fillStyle = BADGE_BG
    ctx.fill()
    ctx.strokeStyle = g.color
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(g.label, x, y + 0.5)
  }
  ctx.restore()
}

/**
 * Uma base como o pino do mapa do planeador: círculo na cor da base com a
 * letra na tinta que se lê sobre ela, anel branco e contorno escuro (ver
 * .base-pin em index.css).
 */
function drawBase(ctx, view, base) {
  const [x, y] = view.project(base.point)
  const color = base.color || BASE_COLOR
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 19, 0, Math.PI * 2)
  ctx.fillStyle = PIN_RING
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 17, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 14.5, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  if (base.label) {
    ctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = inkOn(color)
    ctx.fillText(String(base.label), x, y + 0.5)
  }
  ctx.restore()
}

/** Alvo GCP: quadrado xadrez amarelo/preto com o identificador ao lado. */
function drawGcps(ctx, view, gcps) {
  const S = 12 // lado do alvo
  const H = S / 2
  ctx.save()
  for (const g of gcps) {
    const pt = g?.point
    if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue
    const [x, y] = view.project(pt)
    const left = x - H
    const top = y - H
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(left, top, S, S)
    ctx.fillStyle = GCP_COLOR
    ctx.fillRect(left, top, H, H)
    ctx.fillRect(x, y, H, H)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.strokeRect(left - 0.5, top - 0.5, S + 1, S + 1)
    if (g.id != null && g.id !== '') {
      labelText(ctx, String(g.id), x + H + 4, y, GCP_COLOR, 12, 'left')
    }
  }
  ctx.restore()
}

/* ------------------------ Blocos ↔ faixas de voo ------------------------ */

/** Comprimento aproximado de um segmento [lon,lat] → [lon,lat], em metros. */
function segLengthM(seg) {
  const [a, b] = seg
  const dx = (b[0] - a[0]) * metersPerDegLon((a[1] + b[1]) / 2)
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

const blockColor = (id, idx) =>
  BLOCK_COLORS[
    (((Number.isFinite(id) ? id - 1 : idx) % BLOCK_COLORS.length) + BLOCK_COLORS.length) %
      BLOCK_COLORS.length
  ]

/**
 * O rótulo e a cor de um bloco, como no mapa do planeador (MapView): o
 * rótulo do voo de layoutBlocks («A-1»; sem bases, o número) e, com bases,
 * a cor da base do bloco; sem elas, uma cor por bloco. O relatório dava
 * três nomes ao mesmo voo (1, B01 e A-1) e a mesma cor laranja a todas as
 * bases.
 */
const flightLabelOf = (byBlock, id) => String(byBlock?.[id]?.flightLabel || id)
const flightColorOf = (byBlock, id, idx) => byBlock?.[id]?.color ?? blockColor(id, idx)

/**
 * Agrupa as faixas por bloco para colorir o mapa, com o rótulo e a cor do
 * planeador (`byBlock`, de layoutBlocks).
 *
 * Se os blocos trouxerem as suas próprias faixas (`block.lines`), usa-as
 * directamente. Caso contrário reparte a lista global — que vem na mesma ordem
 * de voo em serpentina usada por splitIntoBlocks — pelo comprimento acumulado
 * de cada bloco (`lengthM`), o que reproduz exactamente a partição original.
 */
function groupLinesByBlock(lines, blocks, byBlock = null) {
  const segs = Array.isArray(lines) ? lines.filter((s) => Array.isArray(s) && s.length >= 2) : []
  if (segs.length === 0) return []
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [{ id: 1, label: '1', color: LINE_COLOR, lines: segs }]
  }
  const groupOf = (b, i) => {
    const id = b.id ?? i + 1
    return { id, label: flightLabelOf(byBlock, id), color: flightColorOf(byBlock, b.id, i) }
  }

  if (blocks.every((b) => Array.isArray(b?.lines) && b.lines.length > 0)) {
    return blocks.map((b, i) => ({ ...groupOf(b, i), lines: b.lines }))
  }

  const groups = []
  let idx = 0
  let acc = 0
  let cur = { ...groupOf(blocks[0], 0), lines: [] }
  for (const seg of segs) {
    const len = segLengthM(seg)
    const budget = Number.isFinite(blocks[idx]?.lengthM) ? blocks[idx].lengthM : Infinity
    if (cur.lines.length > 0 && idx < blocks.length - 1 && acc + len / 2 > budget) {
      groups.push(cur)
      idx += 1
      acc = 0
      cur = { ...groupOf(blocks[idx], idx), lines: [] }
    }
    cur.lines.push(seg)
    acc += len
  }
  groups.push(cur)
  return groups
}

/* ---------------------------- Formatação ---------------------------- */

const fin = (v) => Number.isFinite(v)
const DASH = '—'
const fmt = (v, d, unit) => (fin(v) ? `${v.toFixed(d)}${unit ? ` ${unit}` : ''}` : DASH)
const fmtInt = (v) => (fin(v) ? String(Math.round(v)) : DASH)
const fmtKm = (m) => (fin(m) ? (m / 1000).toFixed(2) : DASH)
// minutos inteiros, como nas fichas das bases (BaseFieldSheets)
const minutes = (s) => (fin(s) ? Math.round(s / 60) : null)
// os minutos do bloco, sem a deslocação, como na antiga tabela dos blocos
const fmtMin = (s) => (fin(s) ? (s / 60).toFixed(0) : DASH)
const sum = (list, f) => list.reduce((a, x) => a + (fin(f(x)) ? f(x) : 0), 0)

/** A data por extenso; em português o mês com maiúscula (grafia anterior a 1990). */
function longDate(date, lang) {
  const s = date.toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return lang === 'pt' ? s.replace(/ de (\p{Ll})/u, (_, c) => ` de ${c.toUpperCase()}`) : s
}

/** A primeira letra em minúscula (uma acção a meio da frase: «…, depois regressar»). */
const lowerFirst = (x) => x.charAt(0).toLowerCase() + x.slice(1)

/** «a, b e c»: a lista com «e» (ou «and») antes do último. */
function joinAnd(items, and) {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`
}

/** Nível de um voo contra o tempo útil: as cores do cartão de métricas (opsSummary). */
const levelOf = (frac) =>
  frac == null ? 'ok' : frac > 1 ? 'over' : frac > OPS_NEAR_FRAC ? 'near' : 'ok'
// a barra: o voo na cor do nível e a deslocação no mesmo tom, mais claro
const BAR_FLY = { ok: '#38BDF8', near: '#F59E0B', over: '#F87171' }
const BAR_TRANSIT = { ok: '#BAE6FD', near: '#FDE68A', over: '#FECACA' }
const TONE_TEXT = { ok: '', near: 'text-amber-300', over: 'text-red-300' }

/**
 * Os voos pela ordem de voo, cada um com a ficha da sua base (baseFieldSheets)
 * e os números do bloco (área, distância, tempo): com blocos, um por bloco; sem
 * eles, o da rota única com base (a ficha «single»), se houver.
 */
function flightRows({ blocks, byBlock, sheets, stats }) {
  const sheetOf = new Map()
  for (const s of sheets) for (const f of s.flights ?? []) sheetOf.set(f.blockId, { sheet: s, f })
  if (Array.isArray(blocks) && blocks.length > 0) {
    return [...blocks]
      .sort((a, b) => (byBlock?.[a.id]?.flight ?? a.id) - (byBlock?.[b.id]?.flight ?? b.id))
      .map((b, i) => {
        const hit = sheetOf.get(b.id) ?? null
        const flightS = hit ? hit.f.flightS : fin(b.timeS) ? b.timeS : 0
        const transitS = hit ? hit.f.transitS : 0
        return {
          key: String(b.id ?? i),
          label: flightLabelOf(byBlock, b.id ?? i + 1),
          color: flightColorOf(byBlock, b.id, i),
          areaHa: b.areaHa,
          lengthM: b.lengthM,
          flightS,
          transitS,
          totalS: flightS + transitS,
          sheet: hit?.sheet ?? null,
          f: hit?.f ?? null,
        }
      })
  }
  const single = sheets.length === 1 && sheets[0].flights?.length === 1 ? sheets[0] : null
  if (!single) return []
  const f = single.flights[0]
  return [
    {
      key: 'single',
      label: f.flightLabel,
      color: single.color ?? LINE_COLOR,
      areaHa: stats?.areaHa,
      lengthM: stats?.pathLengthM,
      flightS: f.flightS,
      transitS: f.transitS,
      totalS: f.totalS,
      sheet: single,
      f,
    },
  ]
}

/** A vista da base de um voo sem nada a dizer além de «100 % visível», do ponto da base. */
const cleanView = (v) =>
  v != null && v.visiblePct === 100 && !v.eye && !(v.hidden > 0) && !(v.radioOnly > 0)

/* --------------------------- Subcomponentes --------------------------- */

/**
 * Um cartão do relatório: o título (o nome da secção), `after` ao lado dele
 * (as contagens do preflight), a nota à direita e o conteúdo.
 */
function Card({ id, title, note = null, icon = null, after = null, className = '', children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-t`}
      className={`rep-card scroll-mt-20 rounded-xl border border-slate-800 bg-slate-900 px-5 pb-5 pt-[18px] ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2
            id={`${id}-t`}
            tabIndex={-1}
            className="m-0 flex items-center gap-2 text-sm font-semibold outline-none"
          >
            {icon}
            {title}
          </h2>
          {after}
        </div>
        {note != null && <span className="rep-muted text-xs text-slate-400">{note}</span>}
      </div>
      {children}
    </section>
  )
}

/** Linhas rótulo / valor, com uma linha fina por cima de cada uma. */
function KeyRows({ rows }) {
  return (
    <dl className="m-0">
      {rows.map(([label, value, extra]) => (
        <div
          key={label}
          className="rep-kv flex min-h-[38px] items-center justify-between gap-4 border-t border-raised text-[13px]"
        >
          <dt className="text-slate-300">{label}</dt>
          <dd className="m-0 text-right tabular-nums">
            {value}
            {extra != null && extra !== '' && <span className="text-slate-400">{extra}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A letra da base no seu círculo, na cor da base (como o pino do mapa). */
function BaseDot({ label, color, size = 'h-6 w-6 text-[11.5px]' }) {
  return (
    <span
      aria-hidden="true"
      className={`rep-swatch inline-flex flex-none items-center justify-center rounded-full font-bold ${size}`}
      style={{ background: color, color: inkOn(color) }}
    >
      {label}
    </span>
  )
}

/** O rótulo de um voo como no mapa: pastilha escura com o contorno na cor do bloco. */
function FlightBadge({ label, color }) {
  return (
    <span
      aria-hidden="true"
      className="rep-swatch inline-flex h-6 flex-none items-center rounded-full border-2 px-[7px] text-[11.5px] font-bold tabular-nums text-white"
      style={{ borderColor: color, background: BADGE_BG }}
    >
      {label}
    </span>
  )
}

/**
 * A barra de um voo contra o tempo útil: o voo na cor do nível, a deslocação
 * no mesmo tom mais claro, e o traço dos 90 % (a partir daí o voo fica a
 * âmbar, como no cartão de métricas).
 */
function UsefulBar({ flightS, transitS, usefulS, label }) {
  const frac = (flightS + transitS) / usefulS
  const level = levelOf(frac)
  const fly = Math.min(1, flightS / usefulS)
  const transit = Math.max(0, Math.min(1 - fly, transitS / usefulS))
  return (
    <span role="img" aria-label={label} className="rep-bar relative flex h-2 min-w-[64px] flex-1">
      <span className="rep-track flex h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span
          className="rep-fill h-full"
          style={{ width: `${(fly * 100).toFixed(2)}%`, background: BAR_FLY[level] }}
        />
        <span
          className="rep-fill h-full"
          style={{ width: `${(transit * 100).toFixed(2)}%`, background: BAR_TRANSIT[level] }}
        />
      </span>
      <span
        aria-hidden="true"
        className="rep-fill absolute -top-[3px] h-3.5 w-0.5 rounded-sm"
        style={{ left: `${OPS_NEAR_FRAC * 100}%`, background: '#B7791F' }}
      />
    </span>
  )
}

/** Uma linha da operação: rótulo, valor, a barra (`children`) e uma linha por baixo. */
function OpItem({ label, value, sub = null, tone = 'ok', children = null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`m-0 mt-0.5 text-[13.5px] font-medium ${TONE_TEXT[tone] ?? ''}`}>{value}</dd>
      {children != null && <dd className="m-0 my-1.5 flex">{children}</dd>}
      {sub != null && <dd className="m-0 text-xs text-slate-400">{sub}</dd>}
    </div>
  )
}

/* ------------------------------ Página ------------------------------ */

export default function MissionReport({
  missionName,
  droneLabel,
  // a descrição do payload (payloadDesc) e o sensor resolvido (focal)
  camera = null,
  sensor = null,
  inspectPoints,
  params,
  spacing,
  interval,
  gsd,
  // pegada no solo (computeFootprint), como no cartão de métricas
  footprint = null,
  stats,
  blocks,
  ring,
  // as bases do planeador (summarizeBases): ponto, letra e cor
  bases = null,
  // voos por bloco (layoutBlocks): rótulo «A-1» e cor da base de cada bloco
  baseLayout = null,
  // ficha de campo por base (baseFieldSheets), com a área dividida e bases
  baseSheets = [],
  // «Altura acima da descolagem» ou «Altura AGL (segue o terreno)» (M3-U2)
  terrainFollowOn = false,
  // altura de regresso (RTH) e subida de descolagem escritas no KMZ (M3-U3)
  rthInfo = null,
  // a linha do dia por cima das fichas (daySummary)
  daySheets = null,
  // tempo útil por voo (s), sem bases (com elas vem em cada ficha)
  usefulS = null,
  // o relevo carregado (viewshedTerrainModel), para a identificação
  terrainModel = null,
  // acções de segurança escritas no KMZ (src/mission/safety.js)
  safety = null,
  gcps,
  lines,
  reproducibility = null,
  onClose,
}) {
  const lang = useLang()
  const t = useT()
  const L = (v, vars = null) => tr(v, lang, vars)

  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  // o foco entra no relatório, dá a volta dentro dele e volta ao botão que o abriu
  useDialogFocus(rootRef)
  const canvasRef = useRef(null)
  const [imagery, setImagery] = useState(null) // null = a carregar · true/false
  const [sheetsOpen, setSheetsOpen] = useState(false)
  const now = useMemo(() => new Date(), [])
  const [projectHash, setProjectHash] = useState(null)
  useEffect(() => {
    // so o resultado assincrono entra no estado; sem crypto.subtle fica em branco
    let alive = true
    const json = reproducibility?.projectJson
    if (!json || !globalThis.crypto?.subtle) return undefined
    crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(json))
      .then((buf) => {
        if (!alive) return
        setProjectHash(
          [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''),
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [reproducibility?.projectJson])

  /* ----------------- Esc fecha o relatório (na captura, antes das gavetas) ----------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  /* ----------------------- Composição do mapa (canvas) ---------------------- */
  const byBlock = baseLayout?.byBlock ?? null
  const groups = useMemo(() => groupLinesByBlock(lines, blocks, byBlock), [lines, blocks, byBlock])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let cancelled = false
    const pending = new Set()

    const view = buildView(ring)

    const paintOverlay = () => {
      if (!view) return
      drawArea(ctx, view, ring)
      if (groups.length > 0) {
        drawFlightLines(ctx, view, groups)
        drawBlockBadges(ctx, view, groups)
      }
      // todas as bases do projecto, cada uma com a sua cor e letra
      for (const b of bases ?? []) {
        const bp = b?.point
        if (Array.isArray(bp) && Number.isFinite(bp[0]) && Number.isFinite(bp[1]))
          drawBase(ctx, view, b)
      }
      if (Array.isArray(gcps) && gcps.length > 0) drawGcps(ctx, view, gcps)
    }

    // 1) desenho imediato sobre fundo neutro — o relatório nunca fica vazio
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    drawFallback(ctx)
    paintOverlay()

    if (!view) {
      setImagery(false)
      return () => {
        cancelled = true
      }
    }

    // 2) mosaico de satélite por cima, quando (e se) chegar
    setImagery(null)
    loadTiles(view, pending)
      .then((tiles) => {
        if (cancelled) return
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
        drawFallback(ctx)
        if (tiles.length > 0) drawTiles(ctx, view, tiles)
        paintOverlay()
        setImagery(tiles.length > 0)
      })
      .catch(() => {
        if (!cancelled) setImagery(false)
      })

    return () => {
      cancelled = true
      pending.forEach((img) => {
        img.onload = null
        img.onerror = null
        img.src = ''
      })
      pending.clear()
    }
  }, [ring, groups, bases, gcps])

  /* ---------------------------- Dados derivados ---------------------------- */
  const p = params || {}
  const speed = fin(p.speed) && p.speed > 0 ? p.speed : null
  const sheets = useMemo(() => (Array.isArray(baseSheets) ? baseSheets : []), [baseSheets])
  const unc = reproducibility?.uncertainty ?? null
  const items = Array.isArray(reproducibility?.preflight) ? reproducibility.preflight : null
  const counts = items ? preflightCounts(items) : null
  const counted = (n, one, many) => `${n} ${t(n === 1 ? one : many)}`
  const countBadges = counts && (
    <span className="flex flex-wrap gap-1.5">
      <Badge tone={counts.block > 0 ? 'block' : 'neutral'}>
        {counted(counts.block, 'preflight.word.blocker', 'preflight.word.blockers')}
      </Badge>
      <Badge
        tone={counts.warn > 0 ? 'warn' : 'neutral'}
        className={counts.warn > 0 ? 'font-semibold' : ''}
      >
        {counted(counts.warn, 'preflight.word.warning', 'preflight.word.warnings')}
      </Badge>
      <Badge tone={counts.info > 0 ? 'info' : 'neutral'}>
        {counted(counts.info, 'preflight.word.note', 'preflight.word.notes')}
      </Badge>
    </span>
  )

  // os voos pela ordem de voo, com a ficha da base de cada um
  const rows = useMemo(
    () => flightRows({ blocks, byBlock, sheets, stats }),
    [blocks, byBlock, sheets, stats],
  )
  const withBases = rows.some((r) => r.sheet)
  const nFlights = rows.length || (stats ? 1 : 0)
  const flightsText = nFlights === 1 ? L(UI.flightsOne) : L(UI.flightsN, { n: nFlights })
  const basesText = tCount(t, 'bases.count', sheets.length, { n: sheets.length })
  // o tempo útil de cada voo: o da ficha (com bases) ou o da missão
  const usefulOf = (r) => r.sheet?.usefulS ?? (fin(usefulS) && usefulS > 0 ? usefulS : null)
  const useful = rows.length ? usefulOf(rows[0]) : fin(usefulS) && usefulS > 0 ? usefulS : null
  const longest = rows.length
    ? rows.reduce((m, r) => (r.totalS > m.totalS ? r : m))
    : stats && fin(stats.flightTimeS)
      ? { label: null, flightS: stats.flightTimeS, transitS: 0, totalS: stats.flightTimeS }
      : null
  const pctOf = (r) =>
    r.f?.pctUseful ?? (useful && fin(r.totalS) ? Math.round((100 * r.totalS) / useful) : null)
  const barLabel = (r) => {
    const pct = pctOf(r)
    const vars = {
      flight: r.label ?? '',
      fly: fmtClock(r.flightS),
      transit: fmtClock(r.transitS),
      total: fmtClock(r.totalS),
      useful: fmtClock(useful),
      pct,
    }
    return L(r.transitS > 0 ? UI.barLabel : UI.barLabelNoTransit, vars)
  }
  // a zona pedida, quando é a mesma em todas as bases, na linha comum
  const requested = [...new Set(sheets.map((x) => Math.round(x.requestedRadiusM)))]
  const sameRequested = requested.length === 1 && fin(requested[0]) ? requested[0] : null
  // deslocação: numa só linha por cima da tabela quando é a mesma em todos os voos
  const transitMins = [...new Set(rows.filter((r) => r.sheet).map((r) => minutes(r.transitS)))]
  const sameTransit = transitMins.length === 1 ? transitMins[0] : null
  // a vista da base: «100 % visível» de todos numa linha; o resto, na linha do voo
  const sheetRows = rows.filter((r) => r.f)
  const allClean = sheetRows.length > 0 && sheetRows.every((r) => cleanView(r.f.view))
  const viewPending = sheets.some((s) => s.viewPending)
  const viewRow = (r) => (r.f?.view && !cleanView(r.f.view) ? flightViewText(t, r.f.view) : null)
  const worst = sheetRows.reduce(
    (m, r) => (fin(r.f.worstVlosM) && (m == null || r.f.worstVlosM > m.f.worstVlosM) ? r : m),
    null,
  )
  const vlosM = sheets[0]?.vlosM ?? null

  // a área dos voos e o tempo total, com e sem as deslocações
  const totalWith = sum(rows, (r) => r.totalS)
  const totalWithout = sum(rows, (r) => r.flightS)
  const anyTransit = rows.some((r) => r.transitS > 0)

  const intervalText = !fin(interval)
    ? DASH
    : p.triggerMode === 'time'
      ? speed
        ? `${(interval / speed).toFixed(1)} s`
        : DASH
      : `${interval.toFixed(1)} m`

  // o intervalo [pior, melhor] do GSD só quando, a 2 casas, ainda é um intervalo
  const f2 = (v) => v.toFixed(2)
  const gsdRange = fin(gsd) && unc?.gsd ? rangeText(unc.gsd[0], unc.gsd[1], f2) : null
  const gsdExtra = gsdRange != null && gsdRange !== f2(gsd) ? ` (${gsdRange})` : null
  const paramRows = [
    [L(terrainFollowOn ? UI.pAltitudeTf : UI.pAltitudeRel), fmt(p.altitude, 0, 'm')],
    [L(UI.pGsd), fmt(gsd, 2, 'cm/px'), gsdExtra],
    [L(UI.pSpeed), fmt(p.speed, 1, 'm/s')],
    ...(p.spacingMode === 'manual'
      ? [[L(UI.pManualSpacing), fmt(p.manualSpacing, 1, 'm')]]
      : [[L(UI.pOverlap), `${fmt(p.frontOverlap, 0)} / ${fmt(p.sideOverlap, 0)} %`]]),
    ...(unc?.front && unc?.side
      ? [
          [
            t('stats.overlapRange'),
            `${rangeText(unc.front[0], unc.front[1], Math.round)} / ${rangeText(unc.side[0], unc.side[1], Math.round)} %`,
          ],
        ]
      : []),
    ...(footprint && fin(footprint.across)
      ? [
          [
            t('stats.footprint'),
            footprint.along != null
              ? `${footprint.across.toFixed(0)} × ${footprint.along.toFixed(0)} m`
              : t('stats.swath', { v: footprint.across.toFixed(0) }),
          ],
        ]
      : []),
    [L(UI.pSpacing), fmt(spacing, 1, 'm')],
    [L(UI.pInterval), intervalText],
    [L(UI.pAngle), fin(p.angle) ? `${p.angle.toFixed(0)}°` : DASH],
    [L(UI.pBuffer), fmt(p.bufferPct, 0, '%')],
    [L(UI.pGimbal), fin(p.gimbalPitch) ? `${p.gimbalPitch.toFixed(0)}°` : DASH],
    [L(UI.pCrosshatch), p.crosshatch ? L(UI.yes) : L(UI.no)],
  ]
  const half = Math.ceil(paramRows.length / 2)

  const validGcps = Array.isArray(gcps)
    ? gcps.filter((g) => Array.isArray(g?.point) && fin(g.point[0]) && fin(g.point[1]))
    : []
  const hasInspect = Array.isArray(inspectPoints) && inspectPoints.length > 0

  const dateText = longDate(now, lang)
  const hasRing = Array.isArray(ring) && ring.length >= 3
  const mapParts = [
    L(UI.mapArea),
    L(groups.length > 1 ? UI.mapLinesByFlight : UI.mapLines),
    ...((bases ?? []).length > 0 ? [L(UI.mapBases)] : []),
    ...(validGcps.length > 0 ? [L(UI.mapGcps)] : []),
  ]
  const mapWhat = joinAnd(mapParts, L(UI.and))
  const mapWhatCap = mapWhat.charAt(0).toUpperCase() + mapWhat.slice(1)
  const caption = !hasRing
    ? L(UI.mapMissing)
    : imagery === null
      ? L(UI.mapLoading)
      : `${mapWhatCap} · ${L(imagery ? UI.mapImagery : UI.mapOffline)}`

  // as cores das bases, para as tabelas do preflight
  const baseColors = useMemo(
    () => Object.fromEntries((bases ?? []).map((b) => [b.label, b.color])),
    [bases],
  )
  const firstBase = (bases ?? [])[0] ?? null
  const s = { ...DEFAULT_SAFETY, ...(safety ?? {}) }
  const rthRange = rthInfo ? rthRangeLabel(rthInfo) : null

  const sections = [
    { id: 'rep-mapa', label: L(UI.mapTitle) },
    { id: 'rep-parametros', label: L(UI.paramsNav) },
    ...(rows.length > 0
      ? [{ id: 'rep-voos', label: L(withBases ? UI.flightsByBase : UI.flights) }]
      : []),
    ...(validGcps.length > 0 ? [{ id: 'rep-gcps', label: L(UI.gcpsTitle) }] : []),
    ...(hasInspect ? [{ id: 'rep-inspeccao', label: L(UI.inspectNav) }] : []),
    { id: 'rep-seguranca', label: L(UI.safetyTitle) },
    ...(items ? [{ id: 'rep-preflight', label: t('preflight.title') }] : []),
    ...(reproducibility ? [{ id: 'rep-reprodutibilidade', label: L(UI.reproNav) }] : []),
  ]
  // a secção sobe para debaixo da barra e o foco vai para o título dela
  const goTo = (e, id) => {
    e.preventDefault()
    const el = document.getElementById(id)
    el?.scrollIntoView({ block: 'start' })
    document.getElementById(`${id}-t`)?.focus({ preventScroll: true })
  }

  /* ---------------------------- A tabela dos voos ---------------------------- */
  const cell = 'px-2.5 py-[7px] align-middle'
  // a base, a zona e a cota: ao meio numa linha, no alto da primeira com várias
  const baseCell = (span) => `px-2.5 py-[7px] ${span > 1 ? 'align-top' : 'align-middle'}`
  // sem bases, uma linha por voo: mais baixa
  const nbCell = 'px-2.5 py-1 align-middle'
  const head = 'px-2.5 py-1.5 text-left align-bottom font-normal leading-tight'
  const headMain = 'rep-wrap block xl:whitespace-nowrap text-xs font-semibold text-slate-300'
  const headSub = 'rep-sub block text-[11.5px] text-slate-400'
  // o cabeçalho de uma coluna: o nome e, por baixo, o que a coluna diz
  const colHead = (main, below = null, right = false) => (
    <th scope="col" className={right ? `${head} text-right` : head}>
      <span className={headMain}>{main}</span>
      {below != null && <span className={headSub}>{below}</span>}
    </th>
  )
  const sub = 'rep-sub block text-xs text-slate-400'
  const timeHead = useful ? L(UI.cTimeUseful, { u: fmtClock(useful) }) : L(UI.cTime)
  const timeCell = (r) => {
    const u = usefulOf(r)
    const pct = pctOf(r)
    const level = u ? levelOf(r.totalS / u) : 'ok'
    const isLongest = r === longest && rows.length > 1
    // sem bases não há deslocação: numa linha, os minutos e a percentagem do útil
    if (!withBases)
      return (
        <span className={`rep-wrap whitespace-nowrap ${TONE_TEXT[level]}`}>
          {[
            `${minutes(r.totalS)} min`,
            pct == null
              ? null
              : isLongest
                ? L(UI.longest, { pct, clock: fmtClock(r.totalS) })
                : `${pct} %`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )
    // o tempo de voo do bloco, sem a deslocação (o «Tempo (min)» dos blocos);
    // com ele, só a percentagem (o cabeçalho diz «% útil»), para a coluna
    // não roubar largura às outras
    const fly = r.transitS > 0 ? L(UI.flyMin, { min: fmtMin(r.flightS) }) : null
    const subParts = [
      fly,
      pct != null
        ? isLongest
          ? L(UI.longest, { pct, clock: fmtClock(r.totalS) })
          : fly
            ? `${pct} %`
            : t('mp.flight.pct', { p: pct })
        : null,
      sameTransit == null && r.transitS > 0 ? L(UI.transitOf, { min: minutes(r.transitS) }) : null,
    ].filter(Boolean)
    return (
      <span className="rep-time flex min-w-[150px] flex-col gap-0.5">
        <span className="flex h-4 items-center gap-2.5">
          {u ? (
            <UsefulBar flightS={r.flightS} transitS={r.transitS} usefulS={u} label={barLabel(r)} />
          ) : null}
          <span
            className={`flex-none text-right tabular-nums ${u ? 'w-[46px]' : ''} ${TONE_TEXT[level]}`}
          >
            {minutes(r.totalS)} min
          </span>
        </span>
        {subParts.length > 0 && (
          // parte entre as partes e não a meio de uma («2 min de deslocação»)
          <span className={sub}>
            {subParts
              .join(' · ')
              .split(' · ')
              .map((p) => p.replace(/ /g, '\u00a0'))
              .join(' · ')}
          </span>
        )}
      </span>
    )
  }

  // as linhas de cada base juntas (os voos de uma base são seguidos): a
  // base, a zona e a cota uma vez, com as linhas dos voos dela
  const runs = []
  for (const r of rows) {
    const last = runs[runs.length - 1]
    if (last && r.sheet && last.sheet === r.sheet) last.rows.push(r)
    else runs.push({ sheet: r.sheet, rows: [r] })
  }
  const baseGap = () => <td colSpan={3} className="p-0" />

  const baseCells = (sh, span) => {
    const zone = sh.noTerrain ? (
      <span className="block text-amber-300">{t('bases.zoneNoTerrain')}</span>
    ) : sh.reduced ? (
      <>
        {/* «40 m, reduzida» numa linha (no papel parte, se faltar largura) */}
        <span className="rep-wrap block whitespace-nowrap text-amber-300">
          {L(sameRequested == null ? UI.zoneReducedFrom : UI.zoneReduced, {
            r: Math.round(sh.radiusM),
            req: Math.round(sh.requestedRadiusM),
          })}
        </span>
        <span className="rep-wrap block xl:whitespace-nowrap text-xs text-[#D9CBA6]">
          {L(UI.zoneRelief, {
            relief: Math.round(sh.cause?.reliefM ?? 0),
            at: Math.round(sh.cause?.atM ?? 0),
          })}
        </span>
      </>
    ) : (
      <>
        <span className="block">{`${Math.round(sh.radiusM)} m`}</span>
        <span className={sub}>{L(UI.zoneNone)}</span>
      </>
    )
    return (
      <>
        <td
          rowSpan={span}
          className={baseCell(span)}
          data-testid="report-base"
          data-base-label={sh.label}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <BaseDot label={sh.label} color={sh.color} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold">
                {t('bases.label', { label: sh.label })}
              </span>
              {sh.links ? (
                <a
                  href={sh.links.https}
                  target="_blank"
                  rel="noreferrer"
                  title={t('bases.sheet.open')}
                  className="rep-wrap block xl:whitespace-nowrap text-xs text-sky-300 no-underline hover:text-sky-200"
                >
                  {sh.coords}
                </a>
              ) : (
                <span className={sub}>{sh.coords || DASH}</span>
              )}
            </span>
          </span>
        </td>
        <td rowSpan={span} className={baseCell(span)}>
          {zone}
        </td>
        <td rowSpan={span} className={baseCell(span)}>
          {sh.refElev != null ? (
            <>
              <span className="block">{`${Math.round(sh.refElev)} m`}</span>
              <span className={sub}>{L(UI.gainUpTo, { gain: Math.round(sh.gainM ?? 0) })}</span>
            </>
          ) : (
            DASH
          )}
        </td>
      </>
    )
  }

  const flightBody = runs.map((run) => {
    const entries = run.rows.map((r) => ({ r, view: viewRow(r) }))
    const lines = entries.reduce((n, x) => n + (x.view ? 2 : 1), 0)
    // até três linhas a base ocupa-as todas e sai inteira no papel; com mais,
    // fica na primeira e as outras levam o espaço dela, para o papel poder
    // partir entre os voos (o Chromium não parte as linhas de um rowSpan)
    const span = lines <= 3 ? lines : 1
    const gap = () => (span > 1 ? null : baseGap())
    return (
      <tbody
        key={run.rows[0].key}
        className={`${lines <= 3 ? 'rep-run ' : ''}border-t border-raised`}
      >
        {entries.map(({ r, view }, i) => {
          const isWorst = worst != null && r === worst && sheetRows.length > 1
          const out = r.f && r.f.withinVlos === false
          // as linhas seguintes da mesma base: o traço só nas colunas do voo
          const line = i > 0 ? 'border-t border-raised' : ''
          return [
            <tr
              key={r.key}
              data-testid="report-block-row"
              data-flight={r.label}
              className="rep-row text-[13px] leading-snug tabular-nums"
            >
              {i > 0 ? (
                gap()
              ) : run.sheet ? (
                baseCells(run.sheet, span)
              ) : (
                <td rowSpan={span} colSpan={3} className={`${baseCell(span)} text-slate-400`}>
                  {DASH}
                </td>
              )}
              <td className={`${cell} whitespace-nowrap ${line}`}>
                {r.f?.rthM != null ? `${Math.round(r.f.rthM)} m` : DASH}
              </td>
              <td className={`${cell} ${line}`}>
                <span className="block font-semibold">{r.label}</span>
                <span className={`rep-wrap xl:whitespace-nowrap ${sub}`}>
                  {fmt(r.areaHa, 2, 'ha')} · {fmtKm(r.lengthM)} km
                </span>
              </td>
              <td className={`${cell} ${line}`}>{timeCell(r)}</td>
              <td className={`${cell} whitespace-nowrap ${line}`}>
                {r.f?.h1M != null
                  ? `${rangeText(r.f.h1M, r.f.hmaxM ?? r.f.h1M, Math.round)} m`
                  : DASH}
              </td>
              <td
                className={`${cell} text-right ${line} ${isWorst ? 'font-semibold' : ''} ${out ? 'text-amber-300' : ''}`}
              >
                <span className="whitespace-nowrap">
                  {fin(r.f?.worstVlosM) ? `${Math.round(r.f.worstVlosM)} m` : DASH}
                </span>
                {out && <span className="block text-xs">{t('bases.sheet.outOfVlos')}</span>}
              </td>
            </tr>,
            view ? (
              <tr key={`${r.key}-view`} className="rep-row text-xs">
                {gap()}
                <td
                  colSpan={5}
                  className={`px-2.5 pb-2 pt-0 ${
                    r.f.view.hidden > 0 || r.f.view.radioOnly > 0
                      ? 'text-amber-300'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-400">{t('bases.sheet.view')}:</span> {view}
                </td>
              </tr>
            ) : null,
          ]
        })}
      </tbody>
    )
  })

  const refs = sheets.map((x) => x.refElev).filter(fin)
  const rths = sheetRows.map((r) => r.f.rthM).filter(fin)
  const h1s = sheetRows.map((r) => r.f.h1M).filter(fin)
  const hmaxs = sheetRows.map((r) => r.f.hmaxM ?? r.f.h1M).filter(fin)
  const nReduced = sheets.filter((x) => x.reduced).length
  const range = (list, unit = ' m') =>
    list.length ? `${rangeText(Math.min(...list), Math.max(...list), Math.round)}${unit}` : DASH
  const areaSum = fmt(
    sum(rows, (r) => r.areaHa),
    2,
    'ha',
  )
  const kmSum = `${fmtKm(sum(rows, (r) => r.lengthM))} km`
  const totals = (
    <tfoot>
      <tr className="rep-total border-t border-slate-700 bg-sunken text-[13px] leading-snug tabular-nums">
        <td className={cell}>
          <span className="block font-semibold">{L(UI.total)}</span>
          <span className={sub}>
            {`${basesText} · ${nFlights === 1 ? L(UI.setsOne) : L(UI.setsN, { n: nFlights })}`}
          </span>
        </td>
        <td className={`${cell} ${nReduced > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
          {nReduced === 0
            ? L(UI.zonesNone)
            : L(nReduced === 1 ? UI.zonesReducedOne : UI.zonesReduced, { n: nReduced })}
        </td>
        <td className={`${cell} whitespace-nowrap`}>{range(refs)}</td>
        <td className={`${cell} whitespace-nowrap`}>{range(rths)}</td>
        <td className={cell}>
          <span className="block whitespace-nowrap">{areaSum}</span>
          <span className={`whitespace-nowrap ${sub}`}>{kmSum}</span>
        </td>
        <td className={cell}>
          {anyTransit ? (
            <>
              <span className="rep-wrap block xl:whitespace-nowrap font-semibold">
                {L(UI.withTransit, { time: fmtTime(totalWith) })}
              </span>
              {/* a soma dos voos parte em duas linhas, para não alargar a coluna */}
              <span className={sub}>{L(UI.flyingSum, { time: fmtTime(totalWithout) })}</span>
            </>
          ) : (
            <span className="block font-semibold">
              {L(UI.flyingSum, { time: fmtTime(totalWithout) })}
            </span>
          )}
        </td>
        <td className={`${cell} whitespace-nowrap text-slate-400`}>
          {h1s.length ? `${rangeText(Math.min(...h1s), Math.max(...hmaxs), Math.round)} m` : DASH}
        </td>
        <td className={`${cell} whitespace-nowrap text-right`}>
          {worst ? L(UI.maxVlos, { m: Math.round(worst.f.worstVlosM) }) : DASH}
        </td>
      </tr>
    </tfoot>
  )

  // Sem bases (sem deslocação): uma linha por voo, numa tabela, ou em duas
  // lado a lado com muitos voos (metade em cada uma, pela ordem de voo), e o
  // total numa linha por baixo
  const nbHalves =
    !withBases && rows.length > 12
      ? [rows.slice(0, Math.ceil(rows.length / 2)), rows.slice(Math.ceil(rows.length / 2))]
      : [rows]
  const nbTable = (list, k) => (
    <div key={k} className="rep-scroll overflow-x-auto rounded-[9px] border border-slate-800">
      <table className="rep-table rep-nb w-full border-collapse text-left">
        <caption className="sr-only">
          {nbHalves.length > 1
            ? `${L(UI.flights)} ${list[0].label}–${list[list.length - 1].label}`
            : L(UI.flights)}
        </caption>
        <colgroup>
          {['flight', 'area', 'dist', 'time'].map((c) => (
            <col key={c} className={`rep-c-${c}`} />
          ))}
        </colgroup>
        <thead className="bg-sunken">
          <tr>
            {colHead(t('bases.sheet.flight'))}
            {colHead(L(UI.cArea))}
            {colHead(L(UI.cDistance))}
            {colHead(timeHead, useful ? L(UI.cTimeSubPct) : null)}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr
              key={r.key}
              data-testid="report-block-row"
              data-flight={r.label}
              className="rep-row border-t border-raised text-[13px] leading-snug tabular-nums"
            >
              <td className={nbCell}>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="rep-swatch inline-block h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="font-semibold">{r.label}</span>
                </span>
              </td>
              <td className={`${nbCell} whitespace-nowrap`}>{fmt(r.areaHa, 2, 'ha')}</td>
              <td className={`${nbCell} whitespace-nowrap`}>{fmtKm(r.lengthM)} km</td>
              <td className={nbCell}>{timeCell(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const nbTotal = (
    <p className="rep-total rep-box m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-[9px] border border-slate-700 bg-sunken px-3 py-2 text-[13px] tabular-nums">
      <span className="font-semibold">{L(UI.total)}</span>
      <span>{flightsText}</span>
      <span>{areaSum}</span>
      <span>{kmSum}</span>
      <span className="font-semibold">{L(UI.flyingSum, { time: fmtTime(totalWithout) })}</span>
    </p>
  )

  // o que é igual em todos os voos, por cima da tabela
  const common = withBases
    ? [
        sheets[0]?.params
          ? t('bases.sheet.paramsValue', {
              alt: Math.round(sheets[0].params.altitudeM),
              v: sheets[0].params.speedMS,
              f: sheets[0].params.frontPct,
              s: sheets[0].params.sidePct,
              gsd: fin(sheets[0].params.gsdCm) ? sheets[0].params.gsdCm.toFixed(1) : DASH,
            })
          : null,
        sameRequested != null ? L(UI.commonZone, { r: sameRequested }) : null,
        fin(sheets[0]?.takeoffM) ? L(UI.commonTakeoff, { m: sheets[0].takeoffM }) : null,
        L(UI.commonSets),
        sameTransit ? L(UI.commonTransit, { min: sameTransit }) : null,
        allClean ? L(UI.commonView) : viewPending ? L(UI.commonViewPending) : null,
      ].filter(Boolean)
    : []
  const viewTerrain = sheets.find((x) => x.viewTerrain)?.viewTerrain ?? null
  const files = sheetRows.map((r) => r.f.file)
  const filesLine =
    sheetRows.length > 0 && files.every(Boolean)
      ? files.length === 1
        ? L(UI.fileOne, { file: files[0] })
        : L(UI.filesRange, { first: files[0], last: files[files.length - 1] })
      : null

  /* ------------------------------ A operação ------------------------------ */
  // com bases, de que voo a que voo (sem elas os rótulos são 1…N)
  const opFlights = !withBases
    ? String(nFlights)
    : rows.length > 1
      ? L(UI.opRange, {
          lead: L(UI.opIn, { n: nFlights, bases: basesText }),
          first: rows[0].label,
          last: rows[rows.length - 1].label,
        })
      : L(UI.opIn, { n: nFlights, bases: basesText })
  const longestFrac = longest && useful ? longest.totalS / useful : null
  const longestLevel = levelOf(longestFrac)

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rep-title"
      tabIndex={-1}
      className="rep-root fixed inset-0 z-[2500] overflow-y-auto bg-slate-950 text-slate-100 outline-none"
    >
      <style>{PRINT_CSS}</style>

      {/* ------------- Barra: o relatório, as secções, imprimir e fechar ------------- */}
      <header className="no-print sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-slate-800 bg-slate-950 px-4 sm:px-6">
        <div className="flex min-w-0 flex-none items-center gap-2.5">
          <IconReport className="h-5 w-5 text-sky-400" />
          <span className="text-[15px] font-semibold">{t('app.report')}</span>
          <span className="hidden truncate text-[13px] text-slate-400 sm:inline">
            {missionName || L(UI.untitled)}
          </span>
        </div>
        <nav
          aria-label={L(UI.sectionsNav)}
          className="hidden min-w-0 flex-1 justify-center gap-0.5 xl:flex"
        >
          {sections.map((x) => (
            <a
              key={x.id}
              href={`#${x.id}`}
              onClick={(e) => goTo(e, x.id)}
              className="flex h-9 items-center whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-slate-200 no-underline transition-colors hover:bg-raised hover:text-slate-100"
            >
              {x.label}
            </a>
          ))}
        </nav>
        <span className="flex-1 xl:hidden" />
        <span className="hidden flex-none text-xs text-slate-400 min-[1400px]:inline">
          {L(UI.a4)}
        </span>
        <Button
          variant="primary"
          size="md"
          onClick={() => window.print()}
          title={L(UI.printTitle)}
          icon={<PrintIcon />}
        >
          {L(UI.print)}
        </Button>
        <CloseKeyButton text={L(UI.close)} title={L(UI.closeTitle)} onClick={onClose} />
      </header>

      <div className="rep-page mx-auto flex max-w-[1216px] flex-col gap-5 px-4 pb-12 pt-7">
        {/* --------------------------- Identificação --------------------------- */}
        <section
          id="rep-identificacao"
          aria-labelledby="rep-title"
          className="rep-card rounded-xl border border-slate-800 bg-slate-900 px-6 py-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id="rep-title" className="m-0 text-xl font-semibold tracking-[-0.01em]">
                {L(UI.title)}
              </h1>
              <p className="rep-muted m-0 mt-1 text-[13px] text-slate-400">{L(UI.subtitle)}</p>
            </div>
            {counts && (
              <div className="flex flex-none items-center gap-1.5">
                <span className="mr-0.5 text-xs text-slate-400">{t('preflight.title')}</span>
                {countBadges}
              </div>
            )}
          </div>
          <dl className="rep-ident m-0 mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 border-t border-slate-800 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [L(UI.mission), missionName || L(UI.untitled)],
              [L(UI.date), dateText],
              [L(UI.platform), droneLabel || DASH],
              ...(camera
                ? [
                    [
                      L(sensor?.type === 'lidar' ? UI.sensor : UI.camera),
                      sensor?.type === 'camera' && fin(sensor.focalLength)
                        ? `${camera} · ${L(UI.focal, { f: sensor.focalLength })}`
                        : camera,
                    ],
                  ]
                : []),
              [
                L(UI.mode),
                `${t('mode.area')} · ${withBases ? L(UI.flightsIn, { flights: flightsText, bases: basesText }) : flightsText}`,
              ],
              [t('stats.area'), stats ? fmt(stats.areaHa, 2, 'ha') : DASH],
              [
                L(UI.terrain),
                terrainModel
                  ? (() => {
                      const x = viewTerrainText(t, terrainModel)
                      return x.charAt(0).toUpperCase() + x.slice(1)
                    })()
                  : L(UI.noTerrain),
              ],
              ...(unc?.inputs
                ? [[L(UI.positioning), L(unc.inputs.mode === 'rtk' ? UI.posRtk : UI.posGnss)]]
                : []),
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd className="m-0 mt-[3px] text-[13.5px] font-medium tabular-nums [overflow-wrap:anywhere]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* --------------------- Mapa, operação e legenda --------------------- */}
        <Card id="rep-mapa" title={L(UI.mapTitle)} note={caption}>
          <div className="rep-map grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_257px]">
            <figure className="m-0 min-w-0">
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                role="img"
                aria-label={`${L(UI.mapTitle)}: ${mapWhat}`}
                className="block h-auto w-full rounded-lg bg-surface shadow-[0_0_0_1px_#1C2740]"
              />
            </figure>
            <div className="rep-side flex min-w-0 flex-col gap-3">
              {longest && (
                <div className="rep-box rounded-[10px] border border-slate-800 bg-surface p-3.5">
                  <h3 className="m-0 mb-2.5 text-[13.5px] font-semibold">{L(UI.opTitle)}</h3>
                  <dl className="m-0 flex flex-col gap-2.5 tabular-nums">
                    <OpItem label={t('stats.flights')} value={opFlights} />
                    {daySheets && (
                      <OpItem
                        label={t('stats.batteries')}
                        value={tCount(t, 'stats.setsNeeded', daySheets.flights, {
                          n: daySheets.flights,
                        })}
                        tone={daySheets.short ? 'near' : 'ok'}
                        sub={[
                          daySheets.sets != null
                            ? L(UI.teamSets, { s: daySheets.sets })
                            : L(UI.teamUnknown),
                          daySheets.short ? t('bases.sheet.setsShort') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                    )}
                    <OpItem
                      label={L(UI.totalTime)}
                      value={
                        anyTransit
                          ? L(UI.withTransit, { time: fmtTime(totalWith) })
                          : t('cards.tile.inMission', { time: fmtTime(stats?.flightTimeS) })
                      }
                      sub={
                        anyTransit
                          ? t('cards.tile.inMission', { time: fmtTime(stats?.flightTimeS) })
                          : null
                      }
                    />
                    <OpItem
                      label={nFlights > 1 ? t('stats.longest') : t('stats.vsBattery')}
                      value={
                        <>
                          {longest.label && nFlights > 1 ? `${longest.label} · ` : ''}
                          {fmtClock(longest.totalS)}
                          {useful ? (
                            <span className="font-normal text-slate-300">
                              {' '}
                              {t('stats.ofUseful', { u: fmtClock(useful) })}
                            </span>
                          ) : null}
                        </>
                      }
                      tone={longestLevel}
                      sub={
                        longestFrac != null
                          ? t('stats.usefulPct', { p: Math.round(longestFrac * 100) })
                          : null
                      }
                    >
                      {useful ? (
                        <UsefulBar
                          flightS={longest.flightS}
                          transitS={longest.transitS}
                          usefulS={useful}
                          label={barLabel({ ...longest, label: longest.label ?? '' })}
                        />
                      ) : null}
                    </OpItem>
                    {worst && fin(vlosM) && (
                      <OpItem
                        label={t('bases.sheet.vlos')}
                        value={L(UI.vlosWorst, {
                          vlos: Math.round(vlosM),
                          worst: Math.round(worst.f.worstVlosM),
                          flight: worst.label,
                        })}
                        tone={sheetRows.some((r) => r.f.withinVlos === false) ? 'near' : 'ok'}
                        sub={
                          sheetRows.some((r) => r.f.withinVlos === false)
                            ? t('bases.sheet.outOfVlos')
                            : null
                        }
                      />
                    )}
                  </dl>
                </div>
              )}
              <div className="rep-box rounded-[10px] border border-slate-800 bg-surface p-3.5">
                <h3 className="m-0 mb-2.5 text-[13.5px] font-semibold">{L(UI.legendTitle)}</h3>
                <ul className="m-0 flex list-none flex-col gap-[9px] p-0 text-[12.5px] text-slate-200">
                  {firstBase && (
                    <li className="flex items-center gap-2.5">
                      <span className="rep-swatch inline-flex rounded-full shadow-[0_0_0_2px_#FFFFFF]">
                        <BaseDot
                          label={firstBase.label}
                          color={firstBase.color || BASE_COLOR}
                          size="h-[22px] w-[22px] text-[11px]"
                        />
                      </span>
                      {L(UI.legendBase)}
                    </li>
                  )}
                  {groups.length > 1 ? (
                    <li className="flex items-center gap-2.5">
                      <FlightBadge label={groups[0].label} color={groups[0].color} />
                      {L(UI.legendFlight)}
                    </li>
                  ) : (
                    <li className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="rep-swatch h-0.5 w-[34px] flex-none"
                        style={{ background: LINE_COLOR }}
                      />
                      {L(UI.legendLines)}
                    </li>
                  )}
                  <li className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="rep-swatch rep-outline h-0.5 w-[34px] flex-none bg-slate-100"
                    />
                    {L(UI.legendArea)}
                  </li>
                  {validGcps.length > 0 && (
                    <li className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="rep-swatch ml-[11px] mr-[11px] h-3 w-3 flex-none border border-white"
                        style={{
                          background: `conic-gradient(${GCP_COLOR} 0 25%, #0f172a 25% 50%, ${GCP_COLOR} 50% 75%, #0f172a 75%)`,
                        }}
                      />
                      {L(UI.legendGcp)}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </Card>

        {/* --------------------- Parâmetros e estatísticas --------------------- */}
        <Card
          id="rep-parametros"
          title={L(UI.paramsTitle)}
          note={nFlights > 1 ? L(UI.paramsSame) : null}
        >
          <div className="rep-two grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <KeyRows rows={paramRows.slice(0, half)} />
            <KeyRows rows={paramRows.slice(half)} />
          </div>
          {stats ? (
            <dl className="rep-tiles m-0 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                [t('stats.area'), `${fmt(stats.areaHa, 2)} ha`],
                [t('stats.lines'), fmtInt(stats.lineCount)],
                [t('stats.waypoints'), fmtInt(stats.waypointCount)],
                [t('stats.totalDist'), `${fmtKm(stats.pathLengthM)} km`],
                [t('stats.photos'), fmtInt(stats.photoCount)],
                [t('stats.missionTime'), fmtTime(stats.flightTimeS)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rep-tile min-w-0 rounded-[9px] border border-slate-800 bg-surface px-3 py-2.5"
                >
                  <dt className="text-xs text-slate-400">{k}</dt>
                  <dd className="m-0 mt-[3px] whitespace-nowrap text-[17px] font-semibold tabular-nums">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="m-0 mt-3 text-xs text-slate-400">{L(UI.noStats)}</p>
          )}
        </Card>

        {/* -------------------------- Voos (por base) -------------------------- */}
        {rows.length > 0 && (
          <Card
            id="rep-voos"
            title={L(withBases ? UI.flightsByBase : UI.flights)}
            note={
              withBases
                ? L(UI.flightsNoteBases, { bases: basesText, flights: flightsText })
                : L(UI.flightsNote, { flights: flightsText })
            }
            className="rep-flow"
          >
            {withBases && (common.length > 0 || viewTerrain || filesLine) && (
              <div className="rep-box mb-3 flex flex-col gap-[5px] rounded-[9px] border border-slate-800 bg-sunken px-3.5 py-3">
                {common.length > 0 && (
                  <p className="m-0 text-[13px] leading-normal text-slate-200">
                    <strong className="font-semibold text-slate-100">{L(UI.commonLead)}</strong>{' '}
                    {common.join(' · ')}.
                  </p>
                )}
                {viewTerrain && (
                  <p className="rep-muted m-0 text-xs leading-normal text-slate-400">
                    {t('bases.view.model', { model: viewTerrainText(t, viewTerrain) })}{' '}
                    {viewCaveatText(t, viewTerrain)} {t('bases.view.point')}{' '}
                    {t('bases.view.radioRule')}
                  </p>
                )}
                {filesLine && (
                  <p className="rep-muted m-0 text-xs leading-normal text-slate-400 [overflow-wrap:anywhere]">
                    {filesLine}
                  </p>
                )}
              </div>
            )}
            {withBases ? (
              <div className="rep-scroll overflow-x-auto rounded-[9px] border border-slate-800">
                <table className="rep-table w-full border-collapse text-left">
                  <caption className="sr-only">{L(UI.flightsByBase)}</caption>
                  <colgroup>
                    {['base', 'zone', 'ref', 'rth', 'flight', 'time', 'heights', 'vlos'].map(
                      (c) => (
                        <col key={c} className={`rep-c-${c}`} />
                      ),
                    )}
                  </colgroup>
                  <thead className="bg-sunken">
                    <tr>
                      {colHead(L(UI.cBase), L(UI.cBaseSub))}
                      {colHead(L(UI.cZone), L(UI.cZoneSub))}
                      {colHead(t('bases.sheet.ref'), L(UI.cRefSub))}
                      {colHead(L(UI.cRth), L(UI.cRthSub))}
                      {colHead(t('bases.sheet.flight'), L(UI.cFlightSub))}
                      {colHead(
                        timeHead,
                        useful
                          ? L(anyTransit ? UI.cTimeSub : UI.cTimeSubPct)
                          : anyTransit
                            ? L(UI.cTimeSubNoUseful)
                            : null,
                      )}
                      {colHead(t('bases.sheet.heights'), L(UI.cHeightsSub))}
                      {colHead(L(UI.cVlos), L(UI.cVlosSub), true)}
                    </tr>
                  </thead>
                  {flightBody}
                  {totals}
                </table>
              </div>
            ) : (
              <>
                <div
                  className={`grid grid-cols-1 items-start gap-3 ${
                    nbHalves.length > 1 ? 'rep-twoup lg:grid-cols-2' : ''
                  }`}
                >
                  {nbHalves.map(nbTable)}
                </div>
                {nbTotal}
              </>
            )}

            {/* as fichas inteiras de cada base (BaseFieldSheets), a um clique */}
            {sheets.length > 0 && (
              <div data-testid="report-bases" className="rep-bases mt-3">
                <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Button
                    variant="secondary"
                    size="md"
                    aria-expanded={sheetsOpen}
                    aria-controls="rep-fichas"
                    onClick={() => setSheetsOpen((v) => !v)}
                  >
                    {sheets.length === 1
                      ? L(sheetsOpen ? UI.sheetsHideOne : UI.sheetsShowOne, {
                          label: sheets[0].label,
                        })
                      : L(sheetsOpen ? UI.sheetsHide : UI.sheetsShow, { n: sheets.length })}
                  </Button>
                  <span className="text-xs text-slate-400">{L(UI.sheetsHint)}</span>
                </div>
                <div id="rep-fichas" hidden={!sheetsOpen} className="mt-3">
                  {sheetsOpen && (
                    <>
                      <h3 className="m-0 mb-2 text-[13.5px] font-semibold">
                        {t('bases.sheet.title')}
                      </h3>
                      <BaseFieldSheets
                        day={daySheets}
                        sheets={sheets}
                        cardClass="rep-base bg-surface"
                        tableClass="rep-sheet-table"
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ------------------------------ GCPs ------------------------------ */}
        {validGcps.length > 0 && (
          <Card id="rep-gcps" title={L(UI.gcpsTitle)} note={L(UI.gcpsNote)}>
            <ul className="rep-gcps m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {validGcps.map((g, i) => (
                <li key={g.id ?? i} className="flex items-baseline gap-2 text-[13px] tabular-nums">
                  <span className="shrink-0 font-semibold text-amber-300">
                    {g.id ?? `GCP-${String(i + 1).padStart(2, '0')}`}
                  </span>
                  <span className="text-slate-200">
                    {g.point[1].toFixed(6)}, {g.point[0].toFixed(6)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------------------- Pontos de inspecção (R2.9) ---------------------- */}
        {hasInspect && (
          <Card id="rep-inspeccao" title={L(UI.inspectTitle)} note={L(UI.inspectNote)}>
            <Table
              label={L(UI.inspectTitle)}
              columns={[
                { key: 'n', label: L(UI.inspectIdx) },
                { key: 'label', label: L(UI.inspectLabel) },
                { key: 'coords', label: L(UI.inspectCoords) },
                { key: 'h', label: L(UI.inspectHeight), align: 'right' },
                { key: 'photo', label: L(UI.inspectPhoto) },
              ]}
              rows={inspectPoints.map((ip, i) => ({
                key: String(ip.id ?? i),
                cells: [
                  <span key="n" className="font-semibold text-orange-300">
                    {i + 1}
                  </span>,
                  ip.label,
                  `${ip.point[1].toFixed(6)}, ${ip.point[0].toFixed(6)}`,
                  Number.isFinite(ip.heightM) ? ip.heightM : DASH,
                  ip.photo === false ? L(UI.inspectNo) : L(UI.inspectYes),
                ],
              }))}
              className="rep-table"
            />
          </Card>
        )}

        {/* ----------------------- Segurança e preflight ----------------------- */}
        <div className="rep-pair grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <Card
            id="rep-seguranca"
            title={L(UI.safetyTitle)}
            icon={<IconShield className="h-[17px] w-[17px] text-sky-300" />}
          >
            <dl className="m-0">
              {[
                [t('safety.finish'), t(`safety.finish.${s.finishAction}`)],
                [
                  t('safety.rcLost'),
                  s.exitOnRCLost === 'executeLostAction'
                    ? t('safety.checklistStop', {
                        mode: t('safety.rcLost.executeLostAction'),
                        action: lowerFirst(t(`safety.rcAction.${s.executeRCLostAction}`)),
                      })
                    : t('safety.rcLost.goContinue'),
                ],
                [
                  t('safety.rthHeight'),
                  rthInfo
                    ? rthInfo.rthManual
                      ? L(UI.rthFixed, { range: rthRange })
                      : L(withBases && nFlights > 1 ? UI.rthAutoTable : UI.rthAuto, {
                          range: rthRange,
                        })
                    : DASH,
                ],
                [L(UI.sTakeoff), rthInfo ? L(UI.takeoffValue, { m: rthInfo.takeoffM }) : DASH],
                [L(UI.sHeights), L(withBases ? UI.heightsBases : UI.heightsTakeoff)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rep-kv2 grid grid-cols-1 items-baseline gap-x-4 gap-y-0.5 border-t border-raised py-2.5 text-[13px] leading-[1.45] sm:grid-cols-[180px_minmax(0,1fr)]"
                >
                  <dt className="text-slate-300">{k}</dt>
                  <dd className="m-0 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="rep-box m-0 mt-3 flex gap-2.5 rounded-[9px] border border-[#1E2E4A] bg-[#0F1A2E] px-3 py-2.5 text-[12.5px] leading-normal text-slate-200">
              <IconInfo className="mt-0.5 h-4 w-4 flex-none text-blue-300" />
              <span>{t('safety.checklistHint')}</span>
            </p>
          </Card>

          {items && (
            <Card
              id="rep-preflight"
              title={t('preflight.title')}
              after={countBadges}
              className="rep-flow"
            >
              <ReportPreflight items={items} counts={counts} baseColors={baseColors} />
            </Card>
          )}
        </div>

        {/* ------------------ Reprodutibilidade e incerteza ------------------ */}
        {reproducibility && (
          <Card
            id="rep-reprodutibilidade"
            title={L(UI.reproTitle)}
            note={reproducibility.version ? `v${reproducibility.version}` : null}
          >
            <dl className="rep-two m-0 grid grid-cols-1 gap-x-8 md:grid-cols-2">
              {[
                [L(UI.rVersion), reproducibility.version ?? DASH],
                ...(unc
                  ? [
                      // um só valor quando as duas pontas, arredondadas, coincidem
                      [
                        L(UI.rAgl),
                        `${rangeText(unc.agl[0], unc.agl[1], (v) => fmt(v, 1), ' – ')} m`,
                      ],
                      [
                        L(UI.rPositioning),
                        `${unc.inputs.mode === 'rtk' ? 'RTK' : 'GNSS'} · ±${unc.inputs.verticalM} m V · ±${unc.inputs.horizontalM} m H`,
                      ],
                      ...(unc.gsd
                        ? [
                            [
                              L(UI.rGsd),
                              `${rangeText(unc.gsd[0], unc.gsd[1], (v) => fmt(v, 2), ' – ')} cm/px`,
                            ],
                          ]
                        : []),
                    ]
                  : []),
                ...(reproducibility.terrainDatum
                  ? [[L(UI.rDatum), verticalDatumLabel(reproducibility.terrainDatum, t)]]
                  : []),
                ...(unc?.front && unc?.side
                  ? [
                      [
                        L(UI.rOverlap),
                        `${rangeText(unc.front[0], unc.front[1], (v) => fmt(v, 0))} % / ${rangeText(unc.side[0], unc.side[1], (v) => fmt(v, 0))} %`,
                      ],
                    ]
                  : []),
                ...(Array.isArray(reproducibility.blur) && reproducibility.blur.length === 2
                  ? [
                      [
                        L(UI.rBlur),
                        `${fmt(reproducibility.blur[0].blurCm, 1)} cm · ${fmt(reproducibility.blur[1].blurCm, 1)} cm${
                          reproducibility.blur[1].blurPx != null
                            ? ` (${fmt(reproducibility.blur[1].blurPx, 1)} px)`
                            : ''
                        }`,
                      ],
                    ]
                  : []),
                [
                  L(UI.rPreflight),
                  counts && counts.block + counts.warn > 0
                    ? [
                        counted(counts.block, 'preflight.word.blocker', 'preflight.word.blockers'),
                        counted(counts.warn, 'preflight.word.warning', 'preflight.word.warnings'),
                        counted(counts.info, 'preflight.word.note', 'preflight.word.notes'),
                      ].join(' · ')
                    : L(UI.rPreflightOk),
                ],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rep-kv flex min-h-[38px] items-center justify-between gap-4 border-t border-raised text-[13px]"
                >
                  <dt className="text-slate-300">{k}</dt>
                  <dd className="m-0 text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex min-h-[38px] flex-wrap items-center justify-between gap-x-4 border-y border-raised py-1.5 text-[13px]">
              <span className="text-slate-300">{L(UI.rHash)}</span>
              <span className="break-all text-right font-mono text-[12.5px]">
                {projectHash ?? DASH}
              </span>
            </div>
            <p className="rep-muted m-0 mt-2.5 text-xs leading-normal text-slate-400">
              {L(UI.rNote)}
            </p>
          </Card>
        )}

        {/* ----------------------------- Assinaturas ----------------------------- */}
        <footer className="rep-card rep-footer rounded-xl border border-slate-800 bg-slate-900 px-6 pb-5 pt-6">
          <div className="grid grid-cols-2 gap-12">
            {[UI.sigPilot, UI.sigSupervisor].map((papel) => (
              <div key={papel.pt}>
                <div className="rep-sig h-10 border-b border-[#3A4A66]" />
                <p className="m-0 mt-1.5 text-xs text-slate-400">{L(papel)}</p>
              </div>
            ))}
          </div>
          <p className="m-0 mt-[18px] flex items-center gap-2 text-[13px] font-medium text-amber-300">
            <IconWarning className="h-4 w-4 flex-none text-amber-500" />
            {L(UI.warning)}
          </p>
        </footer>
      </div>
    </div>
  )
}

/** Impressora (o botão de imprimir). */
function PrintIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 flex-none"
    >
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  )
}

/**
 * O preflight no relatório, com as peças da lista do cabeçalho (PreflightBar):
 * sem bloqueios a linha verde; os bloqueios, os avisos e as notas, por esta
 * ordem, e os do mesmo código juntos numa tabela (src/mission/preflightGroups.js),
 * com as mesmas frases, os mesmos títulos e as mesmas colunas.
 */
function ReportPreflight({ items, counts, baseColors }) {
  const t = useT()
  const sections = groupPreflight(items).filter((x) => x.count > 0)
  return (
    <div className="flex flex-col gap-2.5">
      {counts.block === 0 && (
        <p className="rep-box m-0 flex items-center gap-2.5 rounded-[10px] border border-[#1F5C47] bg-[#0D2A21] px-3 py-2.5 text-[13px] text-emerald-200">
          <IconCheckCircle className="h-[18px] w-[18px] flex-none text-emerald-400" />
          {t(counts.warn > 0 ? 'preflight.readyWarnings' : 'preflight.readyClean')}
        </p>
      )}
      {sections.map((sec) => (
        <section key={sec.level} aria-labelledby={`rep-pf-${sec.level}`}>
          <h3 id={`rep-pf-${sec.level}`} className="m-0 mb-2 flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              {t(`preflight.section.${sec.level}`)}
            </span>
            <span className="text-xs text-slate-400">{sec.count}</span>
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sec.entries.map((e, i) =>
              e.kind === 'group' ? (
                <PreflightGroup key={`g-${e.code}`} group={e} baseColors={baseColors} />
              ) : (
                <PreflightItem
                  key={`${e.item.code}-${i}`}
                  item={e.item}
                  tone={e.level}
                  actions={null}
                />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* --------------------------- Estilos de impressão --------------------------- */

// Só o relatório se imprime (o planeador por baixo fica invisível), em A4
// vertical e em branco: sem fundos nem sombras, texto preto e contornos
// cinzentos; as cores das bases, dos voos e das barras ficam, que são
// informação (os elementos com o fundo no estilo: pinos, rótulos, barras). A
// barra de cima e o botão das fichas não saem. A identificação, o mapa, a
// operação e a legenda cabem na primeira página; a tabela dos voos e o
// preflight partem entre páginas, cada linha e cada aviso inteiros (e as
// bases de até três linhas: uma base com muitos voos parte entre eles, em vez
// de deixar meia página em branco), e a
// tabela tem colunas fixas na largura do A4, com o texto a partir e os
// números não (nem os valores dos parâmetros e da reprodutibilidade, cujo
// rótulo parte); o total sai só no fim (e não ao fundo de cada página). As
// fichas das bases, abertas, imprimem-se cada uma inteira.
const PRINT_CSS = `
@media print {
@page { size: A4 portrait; margin: 10mm; }
html, body { background: #fff !important; color: #000 !important; }
body { visibility: hidden !important; }
.rep-root, .rep-root * { visibility: visible !important; }
.rep-root { position: absolute !important; inset: auto !important; left: 0 !important; top: 0 !important; width: 100% !important; height: auto !important; overflow: visible !important; }
.rep-root, .rep-root *:not(.rep-swatch, .rep-fill, .rep-track, [style*="background"]) { background: transparent !important; color: #000 !important; box-shadow: none !important; text-shadow: none !important; border-color: #bbb !important; }
.rep-swatch, .rep-fill, .rep-track, .rep-root [style*="background"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rep-root .rep-track { background: #e2e8f0 !important; }
.rep-root .rep-muted, .rep-root .rep-muted * { color: #444 !important; }
.rep-root .rep-outline { background: #333 !important; }
.no-print { display: none !important; }
.rep-page { max-width: none !important; margin: 0 !important; padding: 0 !important; gap: 3mm !important; font-size: 9pt; }
.rep-card { border: 1px solid #bbb !important; border-radius: 0 !important; padding: 2.5mm 3mm !important; break-inside: avoid; }
.rep-card.rep-flow { break-inside: auto; }
.rep-root h1 { font-size: 13pt !important; }
.rep-root h2 { font-size: 10pt !important; }
.rep-box, .rep-root li[data-level] { border: 1px solid #ccc !important; border-radius: 0 !important; }
.rep-box, .rep-root li[data-level]:not([data-group]), .rep-root li[data-group] tr { break-inside: avoid; }
.rep-root li[data-group] > div:first-child { break-inside: avoid; break-after: avoid; }
.rep-ident { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; row-gap: 2mm !important; margin-top: 2.5mm !important; padding-top: 2.5mm !important; }
.rep-ident dd, .rep-side dd { font-size: 8.5pt !important; }
.rep-ident dt, .rep-side dt { font-size: 7pt !important; }
.rep-map { display: block !important; }
.rep-map canvas { width: 100% !important; height: auto !important; max-height: 92mm !important; object-fit: contain !important; border: 1px solid #999 !important; border-radius: 0 !important; }
.rep-side { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 3mm !important; margin-top: 3mm !important; }
.rep-side .rep-box { padding: 2mm 2.5mm !important; }
.rep-side dl { gap: 1.2mm !important; }
.rep-two { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; column-gap: 6mm !important; }
.rep-two dd { white-space: nowrap !important; }
.rep-tiles { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }
.rep-tile { border: 1px solid #ccc !important; border-radius: 0 !important; }
.rep-tile dd { font-size: 10pt !important; }
.rep-gcps { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; font-size: 7.5pt !important; }
.rep-scroll { overflow: visible !important; border-radius: 0 !important; }
.rep-table, .rep-root li[data-group] table { font-size: 7.5pt !important; }
.rep-table *, .rep-root li[data-group] table * { font-size: inherit !important; }
.rep-table .rep-sub { font-size: 6.6pt !important; }
.rep-table th, .rep-table td { padding: 0.7mm 1.2mm !important; overflow-wrap: anywhere; }
.rep-nb th, .rep-nb td { padding: 0.3mm 1.2mm !important; }
.rep-run, .rep-row, .rep-total { break-inside: avoid; }
.rep-scroll > .rep-table { table-layout: fixed !important; }
.rep-c-base, .rep-c-zone { width: 15%; } .rep-c-ref, .rep-c-heights { width: 11%; }
.rep-c-rth { width: 9%; } .rep-c-flight { width: 12%; } .rep-c-time { width: 19%; }
.rep-c-vlos { width: 8%; }
.rep-nb .rep-c-flight { width: 16%; } .rep-nb .rep-c-area, .rep-nb .rep-c-dist { width: 22%; } .rep-nb .rep-c-time { width: 40%; }
.rep-twoup { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 3mm !important; }
.rep-kv { min-height: 6.5mm !important; }
.rep-kv2 { padding-top: 1.2mm !important; padding-bottom: 1.2mm !important; }
.rep-table .rep-wrap, .rep-total td:last-child { white-space: normal !important; }
.rep-time, .rep-bar { min-width: 0 !important; }
.rep-table tfoot { display: table-row-group; }
.rep-base { border: 1px solid #ccc !important; border-radius: 0 !important; padding: 1.5mm !important; break-inside: avoid; }
.rep-sheet-table th, .rep-sheet-table td { border: 1px solid #ccc !important; padding: 0.4mm 1.2mm !important; font-size: 7.5pt !important; }
.rep-pair { display: block !important; }
.rep-pair > * + * { margin-top: 3mm !important; }
.rep-footer { break-inside: avoid; }
.rep-footer .rep-sig { height: 8mm !important; border-bottom: 1px solid #000 !important; }
.rep-root a { text-decoration: none !important; }
}
`
