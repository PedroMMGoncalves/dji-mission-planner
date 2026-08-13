import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../i18n.jsx'

/* ------------------------------------------------------------------ *
 * Relatório de plano de missão — página imprimível (A4 retrato).
 *
 * Sobreposição em ecrã inteiro sobre o planeador, com um mapa estático
 * composto em <canvas> (tiles Esri World Imagery + geometria desenhada
 * no contexto 2D), tabela de parâmetros, estatísticas, blocos de voo,
 * GCPs e assinaturas.
 *
 * Bilingue PT/EN com dicionário interno (`bi`), como em ChecklistPage:
 * os textos são específicos desta página e vivem junto do sítio onde
 * são usados, sem passar pelo dicionário global.
 *
 * Convenção de coordenadas (ver src/utils/geo.js): [lon, lat] em WGS84.
 * ------------------------------------------------------------------ */

/** Par bilingue PT/EN. */
const bi = (pt, en) => ({ pt, en })

/** Resolve um par bilingue (ou string simples) na língua pedida. */
const tr = (v, lang) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return v[lang] ?? v.pt ?? ''
}

/* ---------------------------- Textos ---------------------------- */

const UI = {
  title: bi('Relatório de Plano de Missão', 'Mission Plan Report'),
  subtitle: bi(
    'Plano gerado no DJI Mission Planner · verificar em campo antes de voar',
    'Plan generated in DJI Mission Planner · verify in the field before flying',
  ),
  print: bi('Imprimir', 'Print'),
  close: bi('Fechar', 'Close'),
  mission: bi('Missão', 'Mission'),
  date: bi('Data', 'Date'),
  platform: bi('Plataforma', 'Platform'),
  untitled: bi('Missão sem nome', 'Untitled mission'),
  dash: bi('—', '—'),

  mapCaption: bi(
    'Área do levantamento, faixas de voo, base e GCPs · imagem: Esri World Imagery',
    'Survey area, flight lines, base and GCPs · imagery: Esri World Imagery',
  ),
  mapCaptionOffline: bi(
    'Área do levantamento, faixas de voo, base e GCPs · imagem de satélite indisponível',
    'Survey area, flight lines, base and GCPs · satellite imagery unavailable',
  ),
  mapCaptionLoading: bi(
    'A compor a imagem de satélite…',
    'Composing the satellite imagery…',
  ),
  mapMissing: bi('Sem área desenhada.', 'No area drawn.'),

  paramsTitle: bi('Parâmetros de voo', 'Flight parameters'),
  pAltitude: bi('Altitude AGL', 'Altitude AGL'),
  pGsd: bi('GSD', 'GSD'),
  pSpeed: bi('Velocidade', 'Speed'),
  pFrontOverlap: bi('Sobreposição frontal', 'Forward overlap'),
  pSideOverlap: bi('Sobreposição lateral', 'Side overlap'),
  pManualSpacing: bi('Espaçamento manual', 'Manual spacing'),
  pSpacing: bi('Espaçamento entre faixas', 'Line spacing'),
  pInterval: bi('Intervalo de disparo', 'Trigger interval'),
  pAngle: bi('Azimute das faixas', 'Line azimuth'),
  pBuffer: bi('Buffer da área', 'Area buffer'),
  pGimbal: bi('Inclinação do gimbal', 'Gimbal pitch'),
  pCrosshatch: bi('Dupla grelha', 'Crosshatch'),
  yes: bi('Sim', 'Yes'),
  no: bi('Não', 'No'),

  statsTitle: bi('Estatísticas do plano', 'Plan statistics'),
  sArea: bi('Área', 'Area'),
  sLines: bi('Faixas', 'Lines'),
  sWaypoints: bi('Waypoints', 'Waypoints'),
  sDistance: bi('Distância', 'Distance'),
  sPhotos: bi('Fotos', 'Photos'),
  sTime: bi('Tempo est.', 'Est. time'),
  noStats: bi('Plano ainda não gerado.', 'Plan not generated yet.'),

  blocksTitle: bi('Blocos de voo', 'Flight blocks'),
  bBlock: bi('Bloco', 'Block'),
  bArea: bi('Área (ha)', 'Area (ha)'),
  bDistance: bi('Distância (km)', 'Distance (km)'),
  bTime: bi('Tempo (min)', 'Time (min)'),
  bTotal: bi('Total', 'Total'),

  gcpsTitle: bi('Pontos de controlo (GCPs)', 'Ground control points (GCPs)'),
  gcpsNote: bi('Coordenadas WGS84 (lat, lon)', 'WGS84 coordinates (lat, lon)'),

  sigPilot: bi('Piloto responsável', 'Pilot in command'),
  sigSupervisor: bi('Supervisor técnico', 'Technical supervisor'),
  warning: bi(
    'Validar a missão no DJI Pilot 2 antes de voar.',
    'Validate the mission in DJI Pilot 2 before flying.',
  ),
}

/* ------------------- Mapa: constantes e projeção ------------------- */

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
  '#22d3ee', '#a3e635', '#f472b6', '#fbbf24',
  '#c084fc', '#34d399', '#fb923c', '#60a5fa',
]

const LINE_COLOR = '#22d3ee'
const BASE_COLOR = '#f59e0b'
const GCP_COLOR = '#facc15'
const HALO = 'rgba(2, 6, 23, 0.72)'

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
 * Vista do mapa: zoom, escala e função de projeção lon/lat → píxel do canvas.
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
      jobs.push(
        loadTile(tileUrl(z, x, y), pending).then((img) => (img ? { img, x, y } : null)),
      )
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

/** Número do bloco num círculo, no meio da primeira faixa do bloco. */
function drawBlockBadges(ctx, view, groups) {
  if (groups.length < 2) return
  ctx.save()
  for (const g of groups) {
    const first = g.lines[0]
    if (!first) continue
    const mid = [(first[0][0] + first[1][0]) / 2, (first[0][1] + first[1][1]) / 2]
    const [x, y] = view.project(mid)
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = HALO
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.strokeStyle = g.color
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.save()
    ctx.font = 'bold 14px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#0f172a'
    ctx.fillText(String(g.id), x, y + 0.5)
    ctx.restore()
  }
  ctx.restore()
}

function drawBase(ctx, view, basePoint) {
  const [x, y] = view.project(basePoint)
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 12, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, Math.PI * 2)
  ctx.fillStyle = BASE_COLOR
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
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

const M_PER_DEG_LAT = 110574

/** Comprimento aproximado de um segmento [lon,lat] → [lon,lat], em metros. */
function segLengthM(seg) {
  const [a, b] = seg
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const dx = (b[0] - a[0]) * 111320 * Math.cos(midLat)
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

const blockColor = (id, idx) =>
  BLOCK_COLORS[((Number.isFinite(id) ? id - 1 : idx) % BLOCK_COLORS.length + BLOCK_COLORS.length) % BLOCK_COLORS.length]

/**
 * Agrupa as faixas por bloco para colorir o mapa.
 *
 * Se os blocos trouxerem as suas próprias faixas (`block.lines`), usa-as
 * diretamente. Caso contrário reparte a lista global — que vem na mesma ordem
 * de voo em serpentina usada por splitIntoBlocks — pelo comprimento acumulado
 * de cada bloco (`lengthM`), o que reproduz exatamente a partição original.
 */
function groupLinesByBlock(lines, blocks) {
  const segs = Array.isArray(lines) ? lines.filter((s) => Array.isArray(s) && s.length >= 2) : []
  if (segs.length === 0) return []
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [{ id: 1, color: LINE_COLOR, lines: segs }]
  }

  if (blocks.every((b) => Array.isArray(b?.lines) && b.lines.length > 0)) {
    return blocks.map((b, i) => ({
      id: b.id ?? i + 1,
      color: blockColor(b.id, i),
      lines: b.lines,
    }))
  }

  const groups = []
  let idx = 0
  let acc = 0
  let cur = { id: blocks[0].id ?? 1, color: blockColor(blocks[0].id, 0), lines: [] }
  for (const seg of segs) {
    const len = segLengthM(seg)
    const budget = Number.isFinite(blocks[idx]?.lengthM) ? blocks[idx].lengthM : Infinity
    if (cur.lines.length > 0 && idx < blocks.length - 1 && acc + len / 2 > budget) {
      groups.push(cur)
      idx += 1
      acc = 0
      cur = { id: blocks[idx].id ?? idx + 1, color: blockColor(blocks[idx].id, idx), lines: [] }
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
const fmtMin = (s) => (fin(s) ? (s / 60).toFixed(0) : DASH)
const blockLabel = (id, i) => `B${String(fin(id) ? id : i + 1).padStart(2, '0')}`

/* --------------------------- Subcomponentes --------------------------- */

function Section({ title, right, children, className = '' }) {
  return (
    <section className={`rep-block mb-3 rounded border border-slate-800 bg-slate-900 p-3 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-sky-400">
          {title}
        </h2>
        {right && <span className="font-mono text-[9px] text-slate-500">{right}</span>}
      </div>
      {children}
    </section>
  )
}

function ParamTable({ rows }) {
  return (
    <table className="rep-table w-full border-collapse text-left">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th className="w-1/2 border border-slate-800 px-2 py-[3px] font-normal text-[11px] text-slate-400">
              {label}
            </th>
            <td className="border border-slate-800 px-2 py-[3px] font-mono text-[11px] text-slate-100">
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatCell({ label, value }) {
  return (
    <div className="rep-stat rounded border border-slate-800 bg-slate-950 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-[13px] text-sky-300">{value}</div>
    </div>
  )
}

/* ------------------------------ Página ------------------------------ */

export default function MissionReport({
  missionName,
  droneLabel,
  params,
  spacing,
  interval,
  gsd,
  stats,
  blocks,
  ring,
  basePoint,
  gcps,
  lines,
  onClose,
}) {
  const lang = useLang()
  const L = (v) => tr(v, lang)

  const canvasRef = useRef(null)
  const [imagery, setImagery] = useState(null) // null = a carregar · true/false
  const now = useMemo(() => new Date(), [])

  /* ------------------------- Esc fecha o relatório ------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* ----------------------- Composição do mapa (canvas) ---------------------- */
  const groups = useMemo(() => groupLinesByBlock(lines, blocks), [lines, blocks])

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
      if (
        Array.isArray(basePoint) &&
        Number.isFinite(basePoint[0]) &&
        Number.isFinite(basePoint[1])
      ) {
        drawBase(ctx, view, basePoint)
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
  }, [ring, groups, basePoint, gcps])

  /* ---------------------------- Dados derivados ---------------------------- */
  const p = params || {}
  const speed = fin(p.speed) && p.speed > 0 ? p.speed : null

  const intervalText = !fin(interval)
    ? DASH
    : p.triggerMode === 'time'
      ? speed
        ? `${(interval / speed).toFixed(1)} s`
        : DASH
      : `${interval.toFixed(1)} m`

  const paramRows = [
    [L(UI.pAltitude), fmt(p.altitude, 0, 'm AGL')],
    [L(UI.pGsd), fmt(gsd, 2, 'cm/px')],
    [L(UI.pSpeed), fmt(p.speed, 1, 'm/s')],
    ...(p.spacingMode === 'manual'
      ? [[L(UI.pManualSpacing), fmt(p.manualSpacing, 1, 'm')]]
      : [
          [L(UI.pFrontOverlap), fmt(p.frontOverlap, 0, '%')],
          [L(UI.pSideOverlap), fmt(p.sideOverlap, 0, '%')],
        ]),
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

  const blockTotals = Array.isArray(blocks)
    ? blocks.reduce(
        (acc, b) => ({
          areaHa: acc.areaHa + (fin(b.areaHa) ? b.areaHa : 0),
          lengthM: acc.lengthM + (fin(b.lengthM) ? b.lengthM : 0),
          timeS: acc.timeS + (fin(b.timeS) ? b.timeS : 0),
        }),
        { areaHa: 0, lengthM: 0, timeS: 0 },
      )
    : null

  const dateText = now.toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const caption =
    imagery === null
      ? L(UI.mapCaptionLoading)
      : imagery
        ? L(UI.mapCaption)
        : L(UI.mapCaptionOffline)

  return (
    <div className="rep-root fixed inset-0 z-[2500] overflow-y-auto bg-slate-950 text-slate-100">
      <style>{PRINT_CSS}</style>

      <div className="rep-page mx-auto max-w-[920px] px-6 py-6">
        {/* --------------------------- Cabeçalho --------------------------- */}
        <header className="rep-header mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">
              {L(UI.title)}
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-500">{L(UI.subtitle)}</p>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
              <div className="flex gap-1.5">
                <dt className="uppercase tracking-wider text-slate-500">
                  {L(UI.mission)}
                </dt>
                <dd className="font-mono text-slate-200">
                  {missionName || L(UI.untitled)}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="uppercase tracking-wider text-slate-500">{L(UI.date)}</dt>
                <dd className="font-mono text-slate-200">{dateText}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="uppercase tracking-wider text-slate-500">
                  {L(UI.platform)}
                </dt>
                <dd className="font-mono text-slate-200">{droneLabel || DASH}</dd>
              </div>
            </dl>
          </div>

          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            >
              {L(UI.print)}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
            >
              {L(UI.close)}
            </button>
          </div>
        </header>

        {/* ------------------------------ Mapa ------------------------------ */}
        <figure className="rep-map mb-3">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="block h-auto w-full rounded border border-slate-800 bg-slate-900"
          />
          <figcaption className="mt-1 text-[9px] text-slate-500">
            {ring && ring.length >= 3 ? caption : L(UI.mapMissing)}
          </figcaption>
        </figure>

        {/* --------------------------- Parâmetros --------------------------- */}
        <Section title={L(UI.paramsTitle)}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <ParamTable rows={paramRows.slice(0, half)} />
            <ParamTable rows={paramRows.slice(half)} />
          </div>
        </Section>

        {/* -------------------------- Estatísticas -------------------------- */}
        <Section title={L(UI.statsTitle)}>
          {stats ? (
            <div className="rep-stats grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              <StatCell label={L(UI.sArea)} value={`${fmt(stats.areaHa, 2)} ha`} />
              <StatCell label={L(UI.sLines)} value={fmtInt(stats.lineCount)} />
              <StatCell label={L(UI.sWaypoints)} value={fmtInt(stats.waypointCount)} />
              <StatCell
                label={L(UI.sDistance)}
                value={`${fmtKm(stats.pathLengthM)} km`}
              />
              <StatCell label={L(UI.sPhotos)} value={fmtInt(stats.photoCount)} />
              <StatCell label={L(UI.sTime)} value={`${fmtMin(stats.flightTimeS)} min`} />
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">{L(UI.noStats)}</p>
          )}
        </Section>

        {/* ----------------------------- Blocos ----------------------------- */}
        {Array.isArray(blocks) && blocks.length > 0 && (
          <Section title={L(UI.blocksTitle)} right={`n = ${blocks.length}`}>
            <table className="rep-table w-full border-collapse text-left">
              <thead>
                <tr>
                  {[UI.bBlock, UI.bArea, UI.bDistance, UI.bTime].map((h, i) => (
                    <th
                      key={h.pt}
                      className={`border border-slate-800 bg-slate-950 px-2 py-[3px] text-[9px] font-semibold uppercase tracking-wider text-slate-400 ${
                        i === 0 ? 'w-24' : ''
                      }`}
                    >
                      {L(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blocks.map((b, i) => (
                  <tr key={b.id ?? i}>
                    <td className="border border-slate-800 px-2 py-[3px] font-mono text-[11px] text-slate-200">
                      <span
                        className="rep-swatch mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: blockColor(b.id, i) }}
                      />
                      {blockLabel(b.id, i)}
                    </td>
                    <td className="border border-slate-800 px-2 py-[3px] font-mono text-[11px] text-slate-100">
                      {fmt(b.areaHa, 2)}
                    </td>
                    <td className="border border-slate-800 px-2 py-[3px] font-mono text-[11px] text-slate-100">
                      {fmtKm(b.lengthM)}
                    </td>
                    <td className="border border-slate-800 px-2 py-[3px] font-mono text-[11px] text-slate-100">
                      {fmtMin(b.timeS)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="border border-slate-800 bg-slate-950 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {L(UI.bTotal)}
                  </td>
                  <td className="border border-slate-800 bg-slate-950 px-2 py-[3px] font-mono text-[11px] text-sky-300">
                    {fmt(blockTotals?.areaHa, 2)}
                  </td>
                  <td className="border border-slate-800 bg-slate-950 px-2 py-[3px] font-mono text-[11px] text-sky-300">
                    {fmtKm(blockTotals?.lengthM)}
                  </td>
                  <td className="border border-slate-800 bg-slate-950 px-2 py-[3px] font-mono text-[11px] text-sky-300">
                    {fmtMin(blockTotals?.timeS)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Section>
        )}

        {/* ------------------------------ GCPs ------------------------------ */}
        {validGcps.length > 0 && (
          <Section title={L(UI.gcpsTitle)} right={L(UI.gcpsNote)}>
            <ul className="rep-gcps grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              {validGcps.map((g, i) => (
                <li
                  key={g.id ?? i}
                  className="flex items-baseline gap-1.5 font-mono text-[10px]"
                >
                  <span className="shrink-0 text-amber-300">
                    {g.id ?? `GCP-${String(i + 1).padStart(2, '0')}`}
                  </span>
                  <span className="text-slate-300">
                    {g.point[1].toFixed(6)}, {g.point[0].toFixed(6)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ----------------------------- Rodapé ----------------------------- */}
        <footer className="rep-footer mt-4">
          <div className="grid grid-cols-2 gap-8">
            {[UI.sigPilot, UI.sigSupervisor].map((papel) => (
              <div key={papel.pt}>
                <div className="rep-sig h-8 border-b border-slate-600" />
                <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  {L(papel)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] font-medium text-amber-400">{L(UI.warning)}</p>
        </footer>
      </div>
    </div>
  )
}

/* --------------------------- Estilos de impressão --------------------------- */

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm; }

  html, body {
    background: #fff !important;
    color: #000 !important;
  }

  /* Só o relatório é impresso: o planeador por baixo fica invisível. */
  body { visibility: hidden !important; }
  .rep-root, .rep-root * { visibility: visible !important; }

  .rep-root {
    position: absolute !important;
    inset: auto !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .rep-root, .rep-root * {
    background: transparent !important;
    color: #000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  .no-print { display: none !important; }

  .rep-page {
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: 9pt;
  }

  .rep-header {
    border-bottom: 1px solid #999 !important;
    padding-bottom: 2mm !important;
    margin-bottom: 3mm !important;
  }
  .rep-header h1 { font-size: 13pt !important; }
  .rep-header p, .rep-header dl { font-size: 8pt !important; }

  .rep-map { margin-bottom: 3mm !important; break-inside: avoid; }
  .rep-map canvas {
    width: 100% !important;
    height: auto !important;
    max-height: 112mm !important;
    object-fit: contain !important;
    border: 1px solid #999 !important;
    border-radius: 0 !important;
  }
  .rep-map figcaption { font-size: 6.5pt !important; color: #555 !important; }

  .rep-block {
    border: 1px solid #bbb !important;
    border-radius: 0 !important;
    padding: 2mm !important;
    margin-bottom: 2.5mm !important;
    break-inside: avoid;
  }
  .rep-block h2 { font-size: 7pt !important; }

  .rep-table th,
  .rep-table td {
    border: 1px solid #ccc !important;
    padding: 0.4mm 1.2mm !important;
    font-size: 7.5pt !important;
  }

  .rep-stat {
    border: 1px solid #ccc !important;
    border-radius: 0 !important;
    padding: 0.8mm 1.2mm !important;
  }
  .rep-stat div:first-child { font-size: 6pt !important; }
  .rep-stat div:last-child { font-size: 9pt !important; }

  .rep-stats {
    display: grid !important;
    grid-template-columns: repeat(6, 1fr) !important;
    gap: 1.2mm !important;
  }

  .rep-gcps {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr) !important;
    font-size: 7pt !important;
  }
  .rep-gcps li { font-size: 7pt !important; }

  /* As bolinhas de cor dos blocos mantêm a cor impressa, se o browser deixar. */
  .rep-swatch {
    border: 1px solid #666 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .rep-footer { break-inside: avoid; margin-top: 4mm !important; }
  .rep-footer .rep-sig {
    height: 8mm !important;
    border-bottom: 1px solid #000 !important;
  }
  .rep-footer p { font-size: 7pt !important; }
}
`
