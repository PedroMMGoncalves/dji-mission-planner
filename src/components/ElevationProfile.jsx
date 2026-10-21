import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../i18n.jsx'
import { buildProfile } from '../mission/elevationProfile.js'
import { IconBlocked, IconChart, IconCheckCircle, IconWarning } from './Icons.jsx'
import { BACKDROP, CloseKeyButton, WINDOW, WindowHeader, useDialogFocus } from './ui/Window.jsx'

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
 * onde o drone passa mais perto do relevo, em destaque ao lado do gráfico,
 * com os limites das cores escritos, e marcada no gráfico.
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

/** Hook de conveniência: `const L = useL()` e depois `L(par)` ou `L(par, { n: 3 })`. */
function useL() {
  const lang = useLang()
  return (v, vars = null) => {
    let s = tr(v, lang)
    if (vars) for (const [k, x] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(x))
    return s
  }
}

const TXT = {
  title: bi('Perfil de elevação do voo', 'Flight elevation profile'),
  subtitle: bi(
    'Terreno sob a rota e altitude de voo, em metros (valores absolutos)',
    'Terrain under the route and flight altitude, in metres (absolute values)',
  ),
  close: bi('Fechar', 'Close'),
  closeTitle: bi('Fechar (Esc)', 'Close (Esc)'),
  selection: bi('Selecção', 'Selection'),
  selectionGroup: bi('Selecção: a rota toda ou um voo', 'Selection: the whole route or one flight'),
  byBase: bi('Cada voo na cor da sua base', 'Each flight in its base’s colour'),
  all: bi('Tudo', 'All'),
  terrain: bi('Terreno', 'Terrain'),
  flight: bi('Voo', 'Flight'),
  agl: bi('Altura de voo (AGL)', 'Flight height (AGL)'),
  clearance: bi('Folga mínima', 'Minimum clearance'),
  clearanceAt: bi('aos {d}', 'at {d}'),
  limits: bi(
    'Onde o voo passa mais perto do relevo. Verde a partir de {ok} m, âmbar de {warn} a {ok} m, vermelho abaixo de {warn} m.',
    'Where the flight passes closest to the terrain. Green from {ok} m, amber from {warn} to {ok} m, red below {warn} m.',
  ),
  summary: bi('Resumo do perfil', 'Profile summary'),
  reference: bi('Referência (descolagem)', 'Reference (take-off)'),
  refBase: bi('base', 'base'),
  refAreaMin: bi('mínima da área', 'lowest of the area'),
  refBases: bi('a mais baixa das zonas das bases', 'lowest of the base zones'),
  refZone: bi('zona da base', 'base zone'),
  length: bi('Percurso', 'Route length'),
  lengthNote: bi(
    'só o que se voa, sem as passagens entre voos',
    'only what is flown, without the jumps between flights',
  ),
  waypoints: bi('Waypoints', 'Waypoints'),
  waypointsNote: bi('dos {n} voos', 'of the {n} flights'),
  axisDist: bi('Distância acumulada', 'Cumulative distance'),
  axisAlt: bi('Altitude (m)', 'Altitude (m)'),
  noTerrain: bi(
    'Sem dados de relevo — mostra-se apenas a linha de voo.',
    'No terrain data — only the flight line is shown.',
  ),
  allFlights: bi(
    '«Tudo» junta os {n} voos; um voo sozinho usa a cota de referência da zona da sua base.',
    '“All” joins the {n} flights; a single flight uses the reference elevation of its base’s zone.',
  ),
  gaps: bi(
    'As falhas no perfil são zonas sem relevo ou a passagem de um voo para o seguinte.',
    'Gaps in the profile are areas without terrain or the jump from one flight to the next.',
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

const MAX_NODE_DOTS = 400 // acima disto, os pontos dos waypoints não se desenham
const CLEAR_OK_M = 30 // folga confortável
const CLEAR_WARN_M = 15 // folga no limite

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

/**
 * Cores da folga mínima: verde ≥ 30 m, âmbar 15–30 m, vermelho < 15 m (o
 * cartão em destaque e o traço no gráfico).
 */
function clearanceTone(v) {
  if (v == null || !Number.isFinite(v)) {
    return {
      key: 'none',
      box: 'border-slate-700 bg-surface',
      title: 'text-slate-300',
      text: 'text-slate-200',
      note: 'text-slate-400',
      stroke: '#94a3b8',
      icon: IconChart,
    }
  }
  if (v >= CLEAR_OK_M) {
    return {
      key: 'ok',
      box: 'border-[#1F5C47] bg-[#0D2A21]',
      title: 'text-emerald-200',
      text: 'text-emerald-300',
      note: 'text-[#9DD9C0]',
      stroke: '#34d399',
      icon: IconCheckCircle,
    }
  }
  if (v >= CLEAR_WARN_M) {
    return {
      key: 'warn',
      box: 'border-[#6B4A12] bg-[#1F170A]',
      title: 'text-amber-200',
      text: 'text-amber-300',
      note: 'text-amber-100/80',
      stroke: '#fbbf24',
      icon: IconWarning,
    }
  }
  return {
    key: 'danger',
    box: 'border-[#7A2530] bg-[#2B1215]',
    title: 'text-red-200',
    text: 'text-red-300',
    note: 'text-red-100/80',
    stroke: '#f87171',
    icon: IconBlocked,
  }
}

/* ---------------- Peças de UI ---------------- */

/** Uma linha do resumo: o rótulo à esquerda, o valor à direita e uma nota por baixo. */
function Row({ label, value, note = null, testId, first = false }) {
  return (
    <div
      data-testid={testId}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-[7px] ${
        first ? '' : 'border-t border-slate-800'
      }`}
    >
      <dt className="text-[12.5px] text-slate-300">{label}</dt>
      <dd className="m-0 whitespace-nowrap text-[13.5px] font-medium tabular-nums text-slate-100">
        {value}
      </dd>
      {note && (
        <dd className="col-span-2 m-0 mt-0.5 text-xs leading-snug text-slate-400">{note}</dd>
      )}
    </div>
  )
}

/** Símbolo de 22 × 12 da legenda do gráfico. */
function Key({ children, label }) {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <svg aria-hidden="true" width="22" height="12" viewBox="0 0 22 12">
        {children}
      </svg>
      {label}
    </span>
  )
}

/* ---------------- Componente ---------------- */

export default function ElevationProfile({
  terrain,
  waypoints,
  breaks = null,
  refElev,
  reference = null,
  blocks,
  colorOf = null,
  onClose,
}) {
  const L = useL()
  const [sel, setSel] = useState('all')
  const boxRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  useDialogFocus(boxRef)

  // Esc fecha (na captura, antes das gavetas e da base seleccionada)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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

  // Um bloco com cota de referência própria (bases múltiplas: a zona da sua
  // base) usa-a; a rota inteira usa a comum
  const selected = active !== 'all' ? blockList.find((x) => String(x.id) === active) : null
  const wps = useMemo(
    () => (selected ? selected.waypoints : Array.isArray(waypoints) ? waypoints : []),
    [selected, waypoints],
  )
  const ref = Number.isFinite(selected?.refElev) ? selected.refElev : refElev
  const shownRef = selected?.reference ?? reference

  // a rota inteira com bases tem saltos entre voos; um bloco só, não
  const wpBreaks = selected ? null : breaks
  const p = useMemo(() => buildProfile(wps, terrain, ref, wpBreaks), [wps, terrain, ref, wpBreaks])

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
  // um troço por voo: os saltos entre blocos não se desenham
  const flightPieces = []
  for (const n of p.nodes) {
    if (n.gap || flightPieces.length === 0) flightPieces.push([])
    flightPieces[flightPieces.length - 1].push(`${X(n.d).toFixed(1)},${Y(n.alt).toFixed(1)}`)
  }

  // os voos do selector, com a cor da base de cada um (com bases)
  const choices = [
    { key: 'all', label: L(TXT.all), color: null },
    ...blockList.map((b, i) => {
      const n = Number(b.id)
      return {
        key: String(b.id),
        label: b.label
          ? String(b.label)
          : Number.isFinite(n)
            ? `B${String(n).padStart(2, '0')}`
            : String(b.id ?? i + 1),
        color: colorOf?.(b.id) ?? null,
      }
    }),
  ]
  const tinted = choices.some((c) => c.color)
  // com bases, cada voo sozinho usa a cota da zona da sua base
  const zoneRefs = blockList.some((b) => Number.isFinite(b.refElev))
  const ToneIcon = tone.icon
  const clearanceValue = p.hasTerrain ? fmtM(p.aglMin, 1) : L(TXT.na)
  const refNote = !shownRef
    ? null
    : shownRef.source === 'zone'
      ? `${L(TXT.refZone)} ${shownRef.base ?? ''}`.trim()
      : L(
          shownRef.source === 'base'
            ? TXT.refBase
            : shownRef.source === 'bases'
              ? TXT.refBases
              : TXT.refAreaMin,
        )
  // o rótulo do valor da folga, junto do traço (à esquerda dele na ponta direita)
  const worstX = p.worst ? X(p.worst.d) : 0
  const labelLeft = worstX > PAD.left + PW * 0.82

  return (
    <div className={`${BACKDROP} z-[2600] bg-[rgba(4,7,15,0.78)]`} onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        aria-describedby="profile-sub"
        data-testid="elevation-profile"
        tabIndex={-1}
        className={`${WINDOW} max-w-[1200px] border-slate-700`}
        onClick={(e) => e.stopPropagation()}
      >
        <WindowHeader
          id="profile-title"
          subtitleId="profile-sub"
          className="py-3.5 pl-5 pr-4"
          iconClass="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] border border-[#1E2E4A] bg-[#10233A] text-sky-300"
          icon={<IconChart className="h-[18px] w-[18px]" />}
          title={L(TXT.title)}
          subtitle={L(TXT.subtitle)}
        >
          <CloseKeyButton text={L(TXT.close)} title={L(TXT.closeTitle)} onClick={onClose} />
        </WindowHeader>

        <div className="min-h-0 overflow-y-auto">
          {/* Seletor de bloco */}
          {blockList.length > 0 && (
            <div className="px-5 pt-3.5">
              <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-slate-400">
                <span>{L(TXT.selection)}</span>
                {tinted && <span>{L(TXT.byBase)}</span>}
              </div>
              <div
                role="group"
                aria-label={L(TXT.selectionGroup)}
                data-testid="profile-selection"
                // colunas iguais: com muitos voos, as linhas de baixo alinham com as de cima
                className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-0.5 rounded-[9px] border border-slate-800 bg-field p-[3px]"
              >
                {choices.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={active === c.key}
                    onClick={() => setSel(c.key)}
                    className={`flex h-[34px] min-w-0 items-center justify-center gap-[5px] whitespace-nowrap rounded-md px-1 text-[12.5px] tabular-nums transition-colors ${
                      active === c.key
                        ? 'bg-[#1E3A52] font-semibold text-sky-100'
                        : 'font-medium text-slate-200 hover:bg-raised'
                    }`}
                  >
                    {c.color && (
                      <span
                        aria-hidden="true"
                        className="h-[7px] w-[7px] flex-none rounded-full"
                        style={{ background: c.color }}
                      />
                    )}
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!p.ok ? (
            <p className="m-0 px-5 py-10 text-center text-sm text-slate-400">{L(TXT.empty)}</p>
          ) : (
            <div className="grid gap-5 px-5 pb-5 pt-4 lg:grid-cols-[minmax(0,1fr)_290px]">
              <div className="min-w-0">
                {/* Gráfico */}
                <div className="overflow-hidden rounded-[10px] border border-slate-800 bg-[#070C1E]">
                  <svg
                    viewBox={`0 0 ${VB_W} ${VB_H}`}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
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

                    {/* Marcador da folga mínima, com o valor */}
                    {p.worst && (
                      <g data-testid="profile-worst">
                        <line
                          x1={worstX}
                          x2={worstX}
                          y1={Y(p.worst.alt)}
                          y2={Y(p.worst.ground)}
                          stroke={tone.stroke}
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                        <circle cx={worstX} cy={Y(p.worst.alt)} r="3.5" fill={tone.stroke} />
                        <circle cx={worstX} cy={Y(p.worst.ground)} r="2.5" fill={tone.stroke} />
                        <text
                          x={labelLeft ? worstX - 7 : worstX + 7}
                          y={Math.max(PAD.top + 10, Y(p.worst.alt) - 8)}
                          textAnchor={labelLeft ? 'end' : 'start'}
                          fontSize="12"
                          fontWeight="600"
                          fill={tone.stroke}
                          stroke="#070C1E"
                          strokeWidth="3"
                          paintOrder="stroke"
                        >
                          {clearanceValue}
                        </text>
                      </g>
                    )}

                    {/* Linha de voo */}
                    {flightPieces.map((pts, i) => (
                      <polyline
                        key={`f${i}`}
                        points={pts.join(' ')}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ))}
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
                <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-slate-200">
                  <Key label={L(TXT.flight)}>
                    <path d="M1 6h20" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" />
                  </Key>
                  <Key label={L(TXT.terrain)}>
                    <path d="M1 4h20v8H1z" fill="#B45309" fillOpacity="0.45" />
                    <path d="M1 4h20" stroke="#F59E0B" strokeWidth="1.6" />
                  </Key>
                  <Key label={L(TXT.clearance)}>
                    <path
                      d="M11 3v9"
                      stroke={tone.stroke}
                      strokeWidth="1.6"
                      strokeDasharray="2.5 2"
                    />
                    <circle cx="11" cy="2.6" r="2.2" fill={tone.stroke} />
                  </Key>
                </div>
                <p className="m-0 mt-2 max-w-[820px] text-xs leading-normal text-slate-400">
                  {!selected && zoneRefs && blockList.length > 1
                    ? `${L(TXT.allFlights, { n: blockList.length })} `
                    : ''}
                  {p.hasTerrain ? L(TXT.gaps) : L(TXT.noTerrain)}
                </p>
              </div>

              {/* Resumo: a folga mínima em destaque, com os limites, e os valores */}
              <aside aria-label={L(TXT.summary)} className="flex min-w-0 flex-col gap-2.5">
                <div
                  data-testid="profile-clearance"
                  data-tone={tone.key}
                  className={`rounded-[10px] border px-3.5 py-3 ${tone.box}`}
                >
                  <div
                    className={`flex items-center gap-2 text-[12.5px] font-medium ${tone.title}`}
                  >
                    <ToneIcon className="h-4 w-4" />
                    {L(TXT.clearance)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span
                      data-testid="profile-clearance-value"
                      className={`text-2xl font-semibold tabular-nums tracking-[-0.01em] ${tone.text}`}
                    >
                      {clearanceValue}
                    </span>
                    {p.hasTerrain && (
                      <span className={`text-[12.5px] tabular-nums ${tone.title}`}>
                        {L(TXT.clearanceAt, { d: fmtDist(p.worst.d, p.totalM) })}
                      </span>
                    )}
                  </div>
                  <p
                    data-testid="profile-limits"
                    className={`m-0 mt-1.5 text-xs leading-snug ${tone.note}`}
                  >
                    {L(TXT.limits, { ok: CLEAR_OK_M, warn: CLEAR_WARN_M })}
                  </p>
                </div>
                <dl className="m-0 rounded-[10px] border border-slate-800 bg-surface px-3.5 py-0.5">
                  <Row
                    first
                    testId="profile-agl"
                    label={L(TXT.agl)}
                    value={
                      p.hasTerrain
                        ? `${Math.round(p.aglMin)} – ${Math.round(p.aglMax)} m`
                        : L(TXT.na)
                    }
                  />
                  <Row
                    testId="profile-terrain"
                    label={L(TXT.terrain)}
                    value={
                      p.hasTerrain ? `${Math.round(p.gMin)} – ${Math.round(p.gMax)} m` : L(TXT.na)
                    }
                  />
                  {shownRef?.elev != null && (
                    <Row
                      testId="profile-ref"
                      label={L(TXT.reference)}
                      value={`${Math.round(shownRef.elev)} m`}
                      note={refNote}
                    />
                  )}
                  <Row
                    testId="profile-length"
                    label={L(TXT.length)}
                    value={fmtDist(p.totalM, p.totalM)}
                    note={wpBreaks?.length ? L(TXT.lengthNote) : null}
                  />
                  <Row
                    testId="profile-wps"
                    label={L(TXT.waypoints)}
                    value={p.wpCount}
                    note={
                      !selected && blockList.length > 1
                        ? L(TXT.waypointsNote, { n: blockList.length })
                        : null
                    }
                  />
                </dl>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
