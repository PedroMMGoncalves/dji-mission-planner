/**
 * Legenda das camadas do mapa e da vista 3D: um cartão opaco que se abre e
 * fecha num botão, com o símbolo de cada camada desenhado como no mapa, o
 * nome, uma linha que o explica e um interruptor para a mostrar ou
 * esconder. Só lista as camadas com conteúdo no modo aberto, em grupos
 * (missão; análise, com as bacias de visão); o estado (aberta, camadas
 * escondidas) é de quem a usa.
 */
import { useT } from '../i18n.jsx'
import { BASE_COLORS } from '../mission/bases.js'
import { CARD, FOCUS, ICON_BUTTON, Icon, PILL, useToggleFocus } from './MapOverlay.jsx'

/** Caixa de 30 × 22 dos símbolos. */
function Box({ children }) {
  return (
    <svg aria-hidden="true" width="30" height="22" viewBox="0 0 30 22" className="shrink-0">
      {children}
    </svg>
  )
}

/** Uma linha horizontal no meio da caixa. */
const hline = (y, color, extra = {}) => (
  <path
    key={y}
    d={`M2 ${y}h26`}
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    {...extra}
  />
)

/**
 * Símbolo da camada, como o mapa a desenha (MapView.jsx): a área com os
 * blocos, as faixas na cor da base, as fotos, o pino da base, o alvo GCP,
 * o ponto de inspecção, as pré-visualizações dos modos e as bacias de
 * visão. As formas simples (linha, tracejado, ponto, marcador, área) são
 * as da vista 3D.
 * @param {{item: any}} props
 */
function Swatch({ item }) {
  const { kind, color = '#38bdf8', colors = null } = item
  if (kind === 'area')
    return (
      <Box>
        <rect
          x="1"
          y="1"
          width="28"
          height="20"
          rx="2"
          fill={color}
          fillOpacity="0.08"
          stroke={color}
          strokeWidth="2"
        />
        {colors?.slice(0, 2).map((c, i) => (
          <rect
            key={c + i}
            x={i ? 16 : 5}
            y="5"
            width="9"
            height="12"
            fill={c}
            fillOpacity={item.cellsDashed ? 0.08 : 0.25}
            stroke={c}
            strokeWidth="1"
            strokeDasharray={item.cellsDashed ? '2 2' : undefined}
          />
        ))}
      </Box>
    )
  if (kind === 'lines')
    return (
      <Box>
        {(colors ?? [color]).length === 1
          ? hline(11, (colors ?? [color])[0])
          : colors.slice(0, 3).map((c, i) => hline(5 + i * 6, c))}
      </Box>
    )
  if (kind === 'photos')
    return (
      <Box>
        {[4, 11, 18, 25].map((x) => (
          <circle key={x} cx={x} cy="7" r="2" fill={color} />
        ))}
        {[7.5, 14.5, 21.5].map((x) => (
          <circle key={x} cx={x} cy="15" r="2" fill={color} />
        ))}
      </Box>
    )
  if (kind === 'base')
    return (
      <Box>
        <circle cx="15" cy="11" r="10" fill={color} stroke="#ffffff" strokeWidth="1.5" />
        <text
          x="15"
          y="15"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#0f172a"
          fontFamily="inherit"
        >
          {item.letter ?? 'A'}
        </text>
      </Box>
    )
  if (kind === 'gcp')
    return (
      <Box>
        <rect
          x="8"
          y="4"
          width="14"
          height="14"
          rx="1.5"
          fill="#fff"
          stroke={color}
          strokeWidth="1.5"
        />
        <path d="M15 4h7v7h-7zM8 11h7v7H8z" fill="#111" />
      </Box>
    )
  if (kind === 'inspect')
    return (
      <Box>
        <circle cx="15" cy="11" r="9" fill={color} stroke="#0f172a" strokeWidth="2" />
        <text x="15" y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f172a">
          1
        </text>
      </Box>
    )
  if (kind === 'corridor')
    return (
      <Box>
        <rect x="1" y="3" width="28" height="16" fill={color} fillOpacity="0.08" />
        {hline(6, '#fde047', { strokeWidth: 1.5 })}
        {hline(11, color, { strokeWidth: 3 })}
        {hline(16, '#fde047', { strokeWidth: 1.5 })}
      </Box>
    )
  if (kind === 'face')
    return (
      <Box>
        {hline(17, color, { strokeWidth: 3 })}
        {hline(7, '#38bdf8', { strokeWidth: 2, strokeDasharray: '4 3', strokeLinecap: 'butt' })}
        <path d="M8 7v5M15 7v5M22 7v5" stroke="#fde047" strokeWidth="1.5" />
      </Box>
    )
  if (kind === 'orbit')
    return (
      <Box>
        <ellipse
          cx="15"
          cy="11"
          rx="12"
          ry="8"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <path d="M15 3v3M15 16v3M3 11h3M24 11h3" stroke="#fde047" strokeWidth="1.5" />
        <circle cx="15" cy="11" r="3" fill="#f59e0b" stroke="#0f172a" strokeWidth="1" />
      </Box>
    )
  if (kind === 'circular')
    return (
      <Box>
        <circle cx="9" cy="11" r="7" fill="none" stroke="#38bdf8" strokeDasharray="3 2" />
        <circle cx="21" cy="11" r="7" fill="none" stroke="#a78bfa" strokeDasharray="3 2" />
        <path d="M2 11h26" stroke={color} strokeWidth="1.5" />
      </Box>
    )
  if (kind === 'viewshed')
    return (
      <Box>
        <rect x="1" y="4" width="13" height="14" fill="#f97316" fillOpacity="0.55" />
        <rect
          x="16.5"
          y="4.5"
          width="12"
          height="13"
          fill="#fde047"
          fillOpacity="0.2"
          stroke="#facc15"
          strokeWidth="1"
          strokeDasharray="2.5 2"
        />
      </Box>
    )
  if (kind === 'dashed')
    return (
      <Box>
        {hline(11, color, { strokeWidth: 2, strokeDasharray: '4 4', strokeLinecap: 'butt' })}
      </Box>
    )
  if (kind === 'dot')
    return (
      <Box>
        <circle cx="15" cy="11" r="4" fill={color} />
      </Box>
    )
  if (kind === 'marker')
    return (
      <Box>
        <rect
          x="10"
          y="6"
          width="10"
          height="10"
          fill={color}
          stroke="#0f172a"
          transform="rotate(45 15 11)"
        />
      </Box>
    )
  return <Box>{hline(11, color)}</Box>
}

/** Interruptor de 40 × 24 de uma camada. */
function Toggle({ on, label, onClick, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={`flex h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors ${FOCUS} focus-visible:outline-offset-2 ${
        on ? 'justify-end bg-sky-400' : 'justify-start bg-slate-700'
      }`}
    >
      <span className={`h-5 w-5 rounded-full ${on ? 'bg-slate-950' : 'bg-slate-300'}`} />
    </button>
  )
}

/** Seta do botão de abrir e fechar (para cima ou para baixo). */
const chevron = (up) => <Icon d={up ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />

/**
 * @param {{items: Array<{key: string, label: string, kind: string, color?: string,
 *     colors?: string[], desc?: any, group?: 'mission'|'analysis', checked?: boolean,
 *     onToggle?: () => void, details?: Array<{kind: string, text: string}>}>,
 *   hidden: Set<string>, onToggle: (key: string) => void, open: boolean,
 *   onOpenChange: (open: boolean) => void, className?: string, testId?: string,
 *   hint?: string, note?: string, opensUp?: boolean}} props
 */
export default function LayerLegend({
  items,
  hidden,
  onToggle,
  open,
  onOpenChange,
  className = '',
  testId = 'layer-legend',
  // ao lado do título («mostrar no mapa») e no fim («só aparecem…»)
  hint = null,
  note = null,
  // no canto de baixo abre para cima: a seta do botão aponta o caminho
  opensUp = false,
}) {
  const t = useT()
  const { ref: toggleRef, mark: markToggle } = useToggleFocus(open)
  const setOpen = (v) => {
    markToggle()
    onOpenChange(v)
  }
  if (!items?.length) return null
  // recolhida, o corpo não existe: a pastilha não tem aria-controls
  if (!open)
    return (
      <div className={className} data-testid={testId}>
        <button
          type="button"
          ref={toggleRef}
          data-testid={`${testId}-toggle`}
          aria-expanded="false"
          title={t('legend.expand')}
          onClick={() => setOpen(true)}
          className={PILL}
        >
          <span aria-hidden="true" className="flex gap-[3px]">
            {BASE_COLORS.slice(0, 3).map((c) => (
              <span key={c} className="h-2 w-2 rounded-sm" style={{ background: c }} />
            ))}
          </span>
          {t('legend.title')}
          {chevron(opensUp)}
        </button>
      </div>
    )
  const on = (it) => it.checked ?? !hidden.has(it.key)
  // desligada, a camada esbate-se; a linha de estado (bacias de visão:
  // «Desligada · lembrada…») continua legível
  const dim = (it) => (on(it) ? '' : 'opacity-50')
  const row = (it, i) => (
    <div key={it.key} className={i ? 'border-t border-slate-800/70' : ''}>
      <div className="grid grid-cols-[30px_minmax(0,1fr)_40px] items-center gap-3 px-3.5 py-[9px]">
        <span className={dim(it)}>
          <Swatch item={it} />
        </span>
        <div className={`min-w-0 ${it.details ? '' : dim(it)}`}>
          <div
            className={`text-[13.5px] font-medium leading-tight text-slate-100 ${it.details ? dim(it) : ''}`}
          >
            {it.label}
          </div>
          {it.desc && <div className="mt-px text-xs leading-snug text-slate-400">{it.desc}</div>}
        </div>
        <Toggle
          on={on(it)}
          label={it.label}
          testId={`${testId}-${it.key}`}
          onClick={() => (it.onToggle ? it.onToggle() : onToggle(it.key))}
        />
      </div>
      {it.details && (
        <div
          className={`-mt-0.5 mb-2.5 ml-[56px] mr-3.5 flex flex-col gap-1.5 text-xs leading-snug text-slate-200 ${dim(it)}`}
        >
          {it.details.map((d) => (
            <div key={d.kind} className="flex items-center gap-2">
              {d.kind === 'pct' ? (
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 shrink-0 items-center rounded bg-slate-800 px-1 text-[10.5px] font-semibold text-slate-100"
                >
                  %
                </span>
              ) : (
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  className="shrink-0"
                >
                  {d.kind === 'hidden' ? (
                    <rect
                      x="0.5"
                      y="0.5"
                      width="13"
                      height="13"
                      fill="#f97316"
                      fillOpacity="0.55"
                    />
                  ) : (
                    <rect
                      x="1"
                      y="1"
                      width="12"
                      height="12"
                      fill="#fde047"
                      fillOpacity="0.2"
                      stroke="#facc15"
                      strokeWidth="1"
                      strokeDasharray="2.5 2"
                    />
                  )}
                </svg>
              )}
              {d.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
  const mission = items.filter((it) => it.group !== 'analysis')
  const analysis = items.filter((it) => it.group === 'analysis')
  // com grupos (o mapa) cada um tem o seu título; sem eles (a vista 3D), só a lista
  const grouped = items.some((it) => it.group)
  const groupTitle = (text, first) => (
    <div
      className={`px-3.5 pb-0.5 text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] text-slate-400 ${
        first ? 'pt-2.5' : 'border-t border-slate-800 pt-3'
      }`}
    >
      {text}
    </div>
  )
  return (
    <section
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className={`flex w-[360px] flex-col overflow-hidden ${CARD} ${className}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 py-1.5 pl-3.5 pr-1.5">
        <h2 id={`${testId}-title`} className="m-0 flex-1 text-[13.5px] font-semibold">
          {t('legend.title')}
        </h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        <button
          type="button"
          ref={toggleRef}
          data-testid={`${testId}-toggle`}
          aria-expanded="true"
          aria-controls={`${testId}-body`}
          aria-label={t('legend.collapse')}
          title={t('legend.collapse')}
          onClick={() => setOpen(false)}
          className={`h-9 w-9 ${ICON_BUTTON}`}
        >
          {chevron(!opensUp)}
        </button>
      </div>
      <div id={`${testId}-body`} className="min-h-0 overflow-y-auto">
        {grouped && groupTitle(t('legend.groupMission'), true)}
        {mission.map(row)}
        {analysis.length > 0 && (
          <>
            {groupTitle(t('legend.groupAnalysis'), false)}
            {analysis.map(row)}
          </>
        )}
        {note && (
          <div className="border-t border-slate-800 bg-slate-950/50 px-3.5 pb-3 pt-2.5 text-xs leading-normal text-slate-400">
            {note}
          </div>
        )}
      </div>
    </section>
  )
}
