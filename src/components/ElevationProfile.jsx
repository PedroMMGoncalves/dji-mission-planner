import { useEffect, useMemo, useState } from 'react'
import * as turf from '@turf/turf'
import { useLang } from '../i18n.jsx'

/* ------------------------------------------------------------------ *
 * PERFIL DE ELEVAÇÃO DO VOO
 * -------------------------
 * Gráfico SVG puro (sem bibliotecas) que sobrepõe:
 *
 *  - o TERRENO sob a rota, amostrado a cada ~25 m com `terrain.elevationAt`
 *    (interpolação linear em lon/lat entre waypoints consecutivos — os
 *    segmentos têm poucos km, o erro face à geodésica é desprezável);
 *  - a LINHA DE VOO, linear entre as altitudes absolutas dos waypoints
 *    (`refElev + alturaRel`).
 *
 * A métrica que interessa ao piloto é a diferença entre as duas curvas: a
 * altura real acima do solo (AGL) e, sobretudo, a FOLGA MÍNIMA — o ponto
 * onde o drone passa mais perto do relevo.
 *
 * Bilingue PT/EN com dicionário interno (mesmo padrão do ChecklistPage).
 * ------------------------------------------------------------------ */

/** Par bilingue PT/EN. */
const bi = (pt, en) => ({ pt, en })

/** Resolve um par bilingue (ou string simples) na língua pedida. */
const tr = (v, lang) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return v[lang] ?? v.pt ?? ''
}

/** Hook de conveniência: `const L = useL()` e depois `L(par)`. */
function useL() {
  const lang = useLang()
  return (v) => tr(v, lang)
}

const TXT = {
  title: bi('Perfil de elevação do voo', 'Flight elevation profile'),
  subtitle: bi(
    'Terreno sob a rota vs. altitude de voo (valores absolutos, m)',
    'Terrain under the route vs. flight altitude (absolute values, m)',
  ),
  close: bi('Fechar (Esc)', 'Close (Esc)'),
  selection: bi('Seleção', 'Selection'),
  all: bi('Tudo', 'All'),
  terrain: bi('Terreno', 'Terrain'),
  flight: bi('Voo', 'Flight'),
  agl: bi('Altura de voo (AGL)', 'Flight height (AGL)'),
  clearance: bi('Folga mínima', 'Minimum clearance'),
  length: bi('Percurso', 'Route length'),
  waypoints: bi('Waypoints', 'Waypoints'),
  axisDist: bi('Distância acumulada', 'Cumulative distance'),
  axisAlt: bi('Altitude (m)', 'Altitude (m)'),
  noTerrain: bi(
    'Sem dados de relevo — mostra-se apenas a linha de voo.',
    'No terrain data — only the flight line is shown.',
  ),
  gaps: bi(
    'As zonas sem dados de relevo aparecem como falhas no perfil do terreno.',
    'Areas without terrain data appear as gaps in the terrain profile.',
  ),
  empty: bi(
    'São precisos pelo menos dois waypoints para traçar o perfil.',
    'At least two waypoints are needed to draw the profile.',
  ),
  na: bi('sem dados', 'no data'),
}

/* ---------------- Geometria do desenho (viewBox fixo) ---------------- */

const VB_W = 960
const VB_H = 360
const PAD = { top: 18, right: 20, bottom: 42, left: 62 }
const PW = VB_W - PAD.left - PAD.right
const PH = VB_H - PAD.top - PAD.bottom
const BASE_Y = PAD.top + PH

/* ---------------- Amostragem ---------------- */

const STEP_M = 25 // passo alvo de amostragem do terreno
const MAX_SAMPLES = 2000 // trava de performance: o passo cresce se preciso
const MAX_NODE_DOTS = 400 // acima disto, os pontos dos waypoints não se desenham
const CLEAR_OK_M = 30 // folga confortável
const CLEAR_WARN_M = 15 // folga no limite

/** Mediana de uma lista de números (assume-se não vazia). */
function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Constrói o perfil da seleção.
 *
 * Devolve `{ ok, samples, nodes, totalM, hasTerrain, gMin, gMax, aglMin,
 * aglMax, worst, yMin, yMax, wpCount }`, onde `samples` são as amostras do
 * terreno (`ground` pode ser `null`) e `nodes` os vértices da linha de voo.
 */
function buildProfile(wps, terrain, refElev) {
  const empty = {
    ok: false,
    samples: [],
    nodes: [],
    totalM: 0,
    hasTerrain: false,
    gMin: null,
    gMax: null,
    aglMin: null,
    aglMax: null,
    worst: null,
    yMin: 0,
    yMax: 1,
    wpCount: 0,
  }

  const pts = (Array.isArray(wps) ? wps : []).filter(
    (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  )
  if (pts.length < 2) return empty

  // Alturas relativas: as que faltam herdam a mediana das existentes (voo
  // plano) ou 100 m se nenhum waypoint trouxer altura.
  const given = pts.map((p) => p[2]).filter(Number.isFinite)
  const fallback = given.length > 0 ? median(given) : 100
  const ref = Number.isFinite(refElev) ? refElev : 0
  const alt = pts.map((p) => ref + (Number.isFinite(p[2]) ? p[2] : fallback))

  // Comprimento de cada segmento e percurso total
  const segLen = []
  let totalM = 0
  for (let i = 1; i < pts.length; i++) {
    const d = turf.distance([pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]], {
      units: 'meters',
    })
    const len = Number.isFinite(d) ? d : 0
    segLen.push(len)
    totalM += len
  }

  // Passo efetivo: nunca abaixo de STEP_M e sempre dentro do orçamento de
  // amostras (cada segmento gasta pelo menos uma).
  const budget = Math.max(2, MAX_SAMPLES - segLen.length)
  const step = Math.max(STEP_M, totalM / budget)

  // O receiver é preservado (algumas fontes de relevo usam closures/estado).
  const sample =
    typeof terrain?.elevationAt === 'function' ? (lon, lat) => terrain.elevationAt(lon, lat) : null

  const samples = []
  const nodes = [{ d: 0, alt: alt[0] }]

  const push = (d, lon, lat, a) => {
    const g = sample ? sample(lon, lat) : null
    samples.push({ d, alt: a, ground: Number.isFinite(g) ? g : null })
  }

  push(0, pts[0][0], pts[0][1], alt[0])

  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = segLen[i - 1]
    const n = len > 0 ? Math.max(1, Math.ceil(len / step)) : 1
    for (let k = 1; k <= n; k++) {
      const t = k / n
      push(
        acc + len * t,
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        alt[i - 1] + (alt[i] - alt[i - 1]) * t,
      )
    }
    acc += len
    nodes.push({ d: acc, alt: alt[i] })
  }

  // Estatísticas: terreno, AGL real e pior folga (com a distância onde ocorre)
  let gMin = Infinity
  let gMax = -Infinity
  let aglMin = Infinity
  let aglMax = -Infinity
  let worst = null
  for (const s of samples) {
    if (s.ground == null) continue
    if (s.ground < gMin) gMin = s.ground
    if (s.ground > gMax) gMax = s.ground
    const agl = s.alt - s.ground
    if (agl > aglMax) aglMax = agl
    if (agl < aglMin) {
      aglMin = agl
      worst = { d: s.d, alt: s.alt, ground: s.ground, agl }
    }
  }
  const hasTerrain = worst != null

  // Domínio vertical com margem
  let lo = Math.min(...alt)
  let hi = Math.max(...alt)
  if (hasTerrain) {
    lo = Math.min(lo, gMin)
    hi = Math.max(hi, gMax)
  }
  const span = hi - lo
  const pad = Math.max(5, span * 0.1)

  return {
    ok: true,
    samples,
    nodes,
    totalM,
    hasTerrain,
    gMin: hasTerrain ? gMin : null,
    gMax: hasTerrain ? gMax : null,
    aglMin: hasTerrain ? aglMin : null,
    aglMax: hasTerrain ? aglMax : null,
    worst,
    yMin: lo - pad,
    yMax: hi + pad,
    wpCount: pts.length,
  }
}

/* ---------------- Eixos ---------------- */

/** Passo "redondo" (1/2/2.5/5 × 10ⁿ) para ~`target` divisões. */
function niceStep(range, target) {
  const raw = Math.max(1e-6, range) / Math.max(1, target)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return mult * mag
}

/** Valores dos ticks dentro de [min, max]. */
function axisTicks(min, max, target) {
  const step = niceStep(max - min, target)
  const first = Math.ceil(min / step - 1e-9)
  const last = Math.floor(max / step + 1e-9)
  const out = []
  for (let k = first; k <= last && out.length < 40; k++) out.push(k * step)
  return out
}

/* ---------------- Formatação ---------------- */

const fmtM = (v, dec = 0) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(dec)} m`

/** Distância na unidade do eixo (m até 2 km, km acima disso). */
function fmtDist(m, totalM) {
  if (totalM >= 2000) return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

/** Cores/estilo da folga mínima: verde ≥ 30 m, âmbar 15–30 m, vermelho < 15 m. */
function clearanceTone(v) {
  if (v == null || !Number.isFinite(v)) {
    return { box: 'border-slate-600 bg-slate-800/70', text: 'text-slate-300', stroke: '#94a3b8' }
  }
  if (v >= CLEAR_OK_M) {
    return { box: 'border-emerald-500/60 bg-emerald-500/10', text: 'text-emerald-300', stroke: '#34d399' }
  }
  if (v >= CLEAR_WARN_M) {
    return { box: 'border-amber-500/60 bg-amber-500/10', text: 'text-amber-300', stroke: '#fbbf24' }
  }
  return { box: 'border-red-500/60 bg-red-500/10', text: 'text-red-300', stroke: '#f87171' }
}

/* ---------------- Peças de UI ---------------- */

function Metric({ label, value, box = 'border-slate-700 bg-slate-800/70', text = 'text-slate-100' }) {
  return (
    <div className={`rounded border px-2.5 py-1.5 ${box}`}>
      <div className="text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${text}`}>{value}</div>
    </div>
  )
}

function Swatch({ color, dashed = false, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-5 rounded-full"
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` }
            : { backgroundColor: color }
        }
      />
      {children}
    </span>
  )
}

/* ---------------- Componente ---------------- */

export default function ElevationProfile({ terrain, waypoints, refElev, blocks, onClose }) {
  const L = useL()
  const [sel, setSel] = useState('all')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const blockList = useMemo(
    () =>
      (Array.isArray(blocks) ? blocks : []).filter(
        (b) => b && Array.isArray(b.waypoints) && b.waypoints.length >= 2,
      ),
    [blocks],
  )

  // Se os blocos mudarem e a seleção deixar de existir, volta a "Tudo".
  const active = blockList.some((b) => String(b.id) === sel) ? sel : 'all'

  const wps = useMemo(() => {
    if (active !== 'all') {
      const b = blockList.find((x) => String(x.id) === active)
      if (b) return b.waypoints
    }
    return Array.isArray(waypoints) ? waypoints : []
  }, [active, blockList, waypoints])

  const p = useMemo(() => buildProfile(wps, terrain, refElev), [wps, terrain, refElev])

  // Escalas
  const xMax = p.totalM > 0 ? p.totalM : 1
  const ySpan = p.yMax - p.yMin > 0 ? p.yMax - p.yMin : 1
  const X = (d) => PAD.left + (d / xMax) * PW
  const Y = (v) => PAD.top + (1 - (v - p.yMin) / ySpan) * PH

  const inKm = p.totalM >= 2000
  const xTicks = axisTicks(0, xMax, 7)
  const yTicks = axisTicks(p.yMin, p.yMax, 5)
  const xLabel = (v) => (inKm ? `${+(v / 1000).toFixed(2)}` : `${Math.round(v)}`)

  // Bandas contíguas de terreno válido (as amostras `null` abrem falhas)
  const bands = useMemo(() => {
    const out = []
    let cur = null
    for (const s of p.samples) {
      if (s.ground == null) {
        cur = null
        continue
      }
      if (!cur) {
        cur = []
        out.push(cur)
      }
      cur.push(s)
    }
    return out.filter((b) => b.length >= 2)
  }, [p.samples])

  const tone = clearanceTone(p.aglMin)
  const flightPts = p.nodes.map((n) => `${X(n.d).toFixed(1)},${Y(n.alt).toFixed(1)}`).join(' ')

  return (
    <div
      className="fixed inset-0 z-[2600] flex items-start justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-6 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 border-b border-slate-700 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-sky-400">
              {L(TXT.title)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{L(TXT.subtitle)}</p>
          </div>
          <button
            onClick={onClose}
            className="-mr-2 ml-auto shrink-0 px-3 py-1 text-slate-400 transition-colors hover:text-slate-100"
            title={L(TXT.close)}
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">
          {/* Seletor de bloco */}
          {blockList.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-slate-400">
                {L(TXT.selection)}
              </span>
              {[{ key: 'all', label: L(TXT.all) }, ...blockList.map((b, i) => {
                const n = Number(b.id)
                return {
                  key: String(b.id),
                  label: Number.isFinite(n) ? `B${String(n).padStart(2, '0')}` : String(b.id ?? i + 1),
                }
              })].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setSel(c.key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    active === c.key
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {!p.ok ? (
            <p className="py-10 text-center text-slate-400">{L(TXT.empty)}</p>
          ) : (
            <>
              {/* Métricas */}
              <div className="mb-3 flex flex-wrap gap-2">
                <Metric
                  label={L(TXT.terrain)}
                  value={
                    p.hasTerrain ? `${Math.round(p.gMin)} – ${Math.round(p.gMax)} m` : L(TXT.na)
                  }
                />
                <Metric
                  label={L(TXT.agl)}
                  value={
                    p.hasTerrain
                      ? `${Math.round(p.aglMin)} – ${Math.round(p.aglMax)} m`
                      : L(TXT.na)
                  }
                />
                <Metric
                  label={L(TXT.clearance)}
                  box={tone.box}
                  text={tone.text}
                  value={
                    p.hasTerrain
                      ? `${fmtM(p.aglMin, 1)} · ${fmtDist(p.worst.d, p.totalM)}`
                      : L(TXT.na)
                  }
                />
                <Metric label={L(TXT.length)} value={fmtDist(p.totalM, p.totalM)} />
                <Metric label={L(TXT.waypoints)} value={p.wpCount} />
              </div>

              {/* Gráfico */}
              <div className="rounded border border-slate-700 bg-slate-950/60 p-1">
                <svg
                  viewBox={`0 0 ${VB_W} ${VB_H}`}
                  style={{ width: '100%', height: 'auto' }}
                  role="img"
                  aria-label={L(TXT.title)}
                >
                  {/* Grelha horizontal + eixo Y */}
                  {yTicks.map((v) => (
                    <g key={`y${v}`}>
                      <line
                        x1={PAD.left}
                        x2={PAD.left + PW}
                        y1={Y(v)}
                        y2={Y(v)}
                        stroke="#334155"
                        strokeWidth="1"
                        strokeOpacity="0.55"
                      />
                      <text
                        x={PAD.left - 8}
                        y={Y(v) + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#94a3b8"
                      >
                        {Math.round(v)}
                      </text>
                    </g>
                  ))}

                  {/* Terreno: bandas contíguas (as falhas ficam vazias) */}
                  {bands.map((band, i) => {
                    const line = band
                      .map((s) => `${X(s.d).toFixed(1)},${Y(s.ground).toFixed(1)}`)
                      .join(' L ')
                    const x0 = X(band[0].d).toFixed(1)
                    const x1 = X(band[band.length - 1].d).toFixed(1)
                    return (
                      <g key={`b${i}`}>
                        <path
                          d={`M ${line} L ${x1},${BASE_Y} L ${x0},${BASE_Y} Z`}
                          fill="#b45309"
                          fillOpacity="0.35"
                        />
                        <path d={`M ${line}`} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                      </g>
                    )
                  })}

                  {/* Marcador da folga mínima */}
                  {p.worst && (
                    <g>
                      <line
                        x1={X(p.worst.d)}
                        x2={X(p.worst.d)}
                        y1={Y(p.worst.alt)}
                        y2={Y(p.worst.ground)}
                        stroke={tone.stroke}
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                      <circle cx={X(p.worst.d)} cy={Y(p.worst.alt)} r="3.5" fill={tone.stroke} />
                    </g>
                  )}

                  {/* Linha de voo */}
                  <polyline
                    points={flightPts}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {p.nodes.length <= MAX_NODE_DOTS &&
                    p.nodes.map((n, i) => (
                      <circle
                        key={`n${i}`}
                        cx={X(n.d)}
                        cy={Y(n.alt)}
                        r="2.2"
                        fill="#67e8f9"
                        stroke="#0e7490"
                        strokeWidth="0.5"
                      />
                    ))}

                  {/* Eixos */}
                  <line
                    x1={PAD.left}
                    x2={PAD.left}
                    y1={PAD.top}
                    y2={BASE_Y}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  <line
                    x1={PAD.left}
                    x2={PAD.left + PW}
                    y1={BASE_Y}
                    y2={BASE_Y}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  {xTicks.map((v) => (
                    <g key={`x${v}`}>
                      <line x1={X(v)} x2={X(v)} y1={BASE_Y} y2={BASE_Y + 5} stroke="#475569" />
                      <text
                        x={X(v)}
                        y={BASE_Y + 18}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#94a3b8"
                      >
                        {xLabel(v)}
                      </text>
                    </g>
                  ))}

                  {/* Títulos dos eixos */}
                  <text
                    x={PAD.left + PW / 2}
                    y={VB_H - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#64748b"
                  >
                    {`${L(TXT.axisDist)} (${inKm ? 'km' : 'm'})`}
                  </text>
                  <text
                    x={-(PAD.top + PH / 2)}
                    y={16}
                    transform="rotate(-90)"
                    textAnchor="middle"
                    fontSize="11"
                    fill="#64748b"
                  >
                    {L(TXT.axisAlt)}
                  </text>
                </svg>
              </div>

              {/* Legenda */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <Swatch color="#22d3ee">{L(TXT.flight)}</Swatch>
                <Swatch color="#f59e0b">{L(TXT.terrain)}</Swatch>
                <Swatch color={tone.stroke} dashed>
                  {L(TXT.clearance)}
                </Swatch>
                <span>{p.hasTerrain ? L(TXT.gaps) : L(TXT.noTerrain)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
