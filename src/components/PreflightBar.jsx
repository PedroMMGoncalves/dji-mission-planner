/**
 * Preflight no cabeçalho: uma pastilha com o estado (sem plano, bloqueios,
 * avisos, pronto) e, aberta, a lista por cima do mapa, sem o empurrar: as
 * contagens no topo, os bloqueios primeiro, depois os avisos e as notas, e
 * os itens do mesmo código juntos numa tabela (src/mission/preflightGroups.js).
 * Os itens vêm de src/mission/preflight.js; as mensagens soltas são as de
 * i18n/dict.preflight.js, palavra por palavra.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useT } from '../i18n.jsx'
import { preflightCounts } from '../mission/preflight.js'
import { PREFLIGHT_COLUMNS, groupPreflight } from '../mission/preflightGroups.js'
import {
  IconBlocked,
  IconCheck,
  IconCheckCircle,
  IconClose,
  IconInfo,
  IconWarning,
} from './Icons.jsx'
import { Badge, pillClass } from './ui/Pill.jsx'
import { Table } from './ui/Table.jsx'

/** Sem plano ainda: nada a verificar, a pastilha diz o passo seguinte (M3-U12). */
const isNoPlan = (items) => items.length === 1 && items[0].code === 'no-plan'

const PILL = {
  none: { tone: 'neutral', Icon: IconInfo, icon: 'text-slate-300', label: 'text-slate-300' },
  block: { tone: 'block', Icon: IconBlocked, icon: 'text-red-400', label: 'text-[#FBC4C4]' },
  warn: { tone: 'warn', Icon: IconWarning, icon: 'text-amber-500', label: 'text-[#F2D58A]' },
  ok: { tone: 'ok', Icon: IconCheck, icon: 'text-emerald-400', label: 'text-emerald-200' },
}

// por nível: o cartão, o texto das frases, o título e a nota de um grupo
const LEVEL = {
  block: {
    card: 'border-[#7A2530] bg-[#1C0E11]',
    text: 'text-red-100',
    title: 'text-red-300',
    note: 'text-[#E8C4C7]',
    Icon: IconBlocked,
    icon: 'text-red-400',
  },
  warn: {
    card: 'border-[#5C4214] bg-[#17120A]',
    text: 'text-[#E9D8AE]',
    title: 'text-amber-300',
    note: 'text-[#D9CBA6]',
    Icon: IconWarning,
    icon: 'text-amber-500',
  },
  info: {
    card: 'border-[#1E2E4A] bg-[#0F1A2E]',
    text: 'text-slate-200',
    title: 'text-blue-200',
    note: 'text-slate-300',
    Icon: IconInfo,
    icon: 'text-blue-300',
  },
}

/** «3 avisos», «1 bloqueio»: o número e a palavra no singular ou no plural. */
function counted(t, n, one, many) {
  return `${n} ${t(n === 1 ? one : many)}`
}

/**
 * A pastilha do preflight no cabeçalho: o estado numa palavra e as
 * contagens; abre e fecha a lista. `tall`: 44 px de altura (o tablet).
 * @param {{items: any[], open: boolean, onToggle: () => void, mode?: string,
 *   buttonRef?: any, tall?: boolean}} props
 */
export function PreflightPill({
  items,
  open,
  onToggle,
  mode = 'area',
  buttonRef = null,
  tall = false,
}) {
  const t = useT()
  const c = preflightCounts(items)
  const state = isNoPlan(items) ? 'none' : c.block > 0 ? 'block' : c.warn > 0 ? 'warn' : 'ok'
  const word = (n, one, many) => t(n === 1 ? one : many)
  const bw = word(c.block, 'preflight.word.blocker', 'preflight.word.blockers')
  const ww = word(c.warn, 'preflight.word.warning', 'preflight.word.warnings')
  // como no desenho, só o que há: «3 avisos», sem «0 bloqueios» à frente
  const label =
    state === 'none'
      ? t(mode === 'area' ? 'preflight.noPlanArea' : 'preflight.noPlan')
      : state === 'block'
        ? c.warn > 0
          ? t('preflight.summary', { b: c.block, bw, w: c.warn, ww })
          : `${c.block} ${bw}`
        : state === 'warn'
          ? `${c.warn} ${ww}`
          : t('preflight.ok')
  const s = PILL[state]
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={open ? 'preflight-dialog' : undefined}
      title={t('preflight.pillTitle')}
      data-testid="preflight-pill"
      className={`${pillClass(s.tone)} transition-[filter] hover:brightness-125 ${tall ? '!h-11' : ''}`}
    >
      <s.Icon className={`h-4 w-4 ${s.icon}`} />
      {t('preflight.title')}
      <span className={`font-medium ${s.label}`}>{label}</span>
    </button>
  )
}

/**
 * Tinta legível sobre a cor da base: branca nas escuras, quase preta nas
 * claras (também a letra das bases no relatório).
 * @param {string} hex
 */
export function inkOn(hex) {
  const v = parseInt(String(hex).slice(1), 16)
  if (!Number.isFinite(v)) return '#0A0F1C'
  const lin = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0549 ? '#FFFFFF' : '#0A0F1C'
}

/**
 * A lista por baixo da pastilha, com o lado direito 120 px além dela (como
 * no desenho), mas sempre dentro do ecrã: com o cabeçalho partido em duas
 * linhas a pastilha pode ficar encostada à esquerda.
 */
function placeDialog(el) {
  const anchor = el?.parentElement
  if (!anchor) return
  const r = anchor.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const w = Math.min(520, vw - 32)
  const right = Math.min(vw - 16, Math.max(16 + w, r.right + 120))
  el.style.width = `${w}px`
  el.style.right = `${Math.round(r.right - right)}px`
}

/** Um item sozinho: a frase de sempre, e o botão da acção que houver. */
function Item({ item, actions, tone }) {
  const t = useT()
  const s = LEVEL[tone] ?? LEVEL.info
  const action = actions?.[item.code]
  return (
    <li
      data-level={item.level}
      data-code={item.code}
      className={`flex gap-2.5 rounded-[10px] border px-3 py-2.5 text-[12.5px] leading-normal ${s.card} ${s.text}`}
    >
      <s.Icon className={`mt-0.5 h-4 w-4 flex-none ${s.icon}`} />
      <span className="min-w-0">
        {t(`preflight.${item.code}`, item.params)}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-2 mt-1 rounded-md border border-current px-2 py-0.5 text-xs font-medium hover:bg-white/10"
          >
            {action.label}
          </button>
        )}
      </span>
    </li>
  )
}

/** Os itens do mesmo código: o título, a parte comum e uma linha por item. */
function Group({ group, baseColors }) {
  const t = useT()
  const s = LEVEL[group.level]
  const title = t(`preflight.group.${group.code}`, { count: group.items.length })
  const columns = group.cols.map((col) => ({
    key: col,
    label: t(`preflight.col.${col}`),
    align: PREFLIGHT_COLUMNS[col],
  }))
  const rows = group.items.map((it, i) => ({
    key: `${i}`,
    cells: group.cols.map((col) => {
      const text = t(`preflight.cell.${col}`, it.params)
      const color = col === 'base' ? baseColors?.[it.params?.base] : null
      if (!color) return text
      // em linha (sem flex): a célula lê-se «A Base A», numa só linha
      return (
        <span className="whitespace-nowrap">
          <span
            aria-hidden="true"
            className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full align-middle text-[11px] font-bold shadow-[0_0_0_1.5px_#0A0F1C,0_0_0_2.5px_rgba(255,255,255,0.7)]"
            style={{ background: color, color: inkOn(color) }}
          >
            {it.params.base}
          </span>{' '}
          {text}
        </span>
      )
    }),
  }))
  return (
    <li
      data-level={group.level}
      data-code={group.code}
      data-group={group.items.length}
      className={`overflow-hidden rounded-[10px] border ${s.card}`}
    >
      <div className="flex gap-2.5 px-3.5 py-3">
        <s.Icon className={`mt-px h-[18px] w-[18px] flex-none ${s.icon}`} />
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${s.title}`}>{title}</p>
          {group.note && (
            <p className={`mt-1 text-[12.5px] leading-normal ${s.note}`}>
              {t(`preflight.groupNote.${group.code}`, group.items[0].params)}
            </p>
          )}
        </div>
      </div>
      <Table bare tone={group.level} label={title} columns={columns} rows={rows} />
    </li>
  )
}

// o relatório da missão (MissionReport) mostra o preflight com as mesmas peças
export { Group as PreflightGroup, Item as PreflightItem }

/**
 * A lista aberta, por cima do mapa e por baixo da pastilha (dentro do ecrã,
 * mesmo com o cabeçalho partido em duas linhas). `onClose(focoNaPastilha)`
 * fecha-a: no ✕ e com Esc, que é dela antes da gaveta e da base
 * seleccionada (com uma janela aberta, `inactive`, o Esc é da janela).
 * `actions`, opcional: `{ [code]: { label, onClick } }` põe um botão no item
 * com esse código (ex.: descarregar o relevo global em qualquer modo);
 * `baseColors`, `{ [rótulo]: cor }`, pinta as bases das tabelas.
 */
export function PreflightList({
  items,
  actions = null,
  onClose,
  inactive = false,
  baseColors = null,
}) {
  const t = useT()
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const c = preflightCounts(items)
  const noPlan = isNoPlan(items)

  // depois de cada mudança (a pastilha muda de largura com o estado) e ao
  // redimensionar a janela
  useLayoutEffect(() => placeDialog(ref.current))
  useEffect(() => {
    const onResize = () => placeDialog(ref.current)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (inactive) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      onClose(Boolean(ref.current?.contains(document.activeElement)))
    }
    // na captura: antes da gaveta e da base seleccionada, que ficam por baixo
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [inactive, onClose])

  const sections = groupPreflight(items).filter((s) => s.count > 0)
  return (
    <div
      ref={ref}
      id="preflight-dialog"
      role="dialog"
      aria-labelledby="preflight-dialog-title"
      data-testid="preflight-list"
      className="absolute top-full mt-2.5 w-[520px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-left shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-center gap-2 border-b border-slate-800 py-2.5 pl-4 pr-2.5">
        <h2 id="preflight-dialog-title" className="mr-1 text-[15px] font-semibold">
          {t('preflight.title')}
        </h2>
        {!noPlan && (
          <span className="flex flex-wrap gap-1.5">
            <Badge tone={c.block > 0 ? 'block' : 'neutral'}>
              {counted(t, c.block, 'preflight.word.blocker', 'preflight.word.blockers')}
            </Badge>
            <Badge
              tone={c.warn > 0 ? 'warn' : 'neutral'}
              className={c.warn > 0 ? 'font-semibold' : ''}
            >
              {counted(t, c.warn, 'preflight.word.warning', 'preflight.word.warnings')}
            </Badge>
            <Badge tone={c.info > 0 ? 'info' : 'neutral'}>
              {counted(t, c.info, 'preflight.word.note', 'preflight.word.notes')}
            </Badge>
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onClose(true)}
          aria-label={t('preflight.close')}
          title={t('preflight.close')}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-raised hover:text-slate-100"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      <div className="flex max-h-[min(480px,calc(100vh-11rem))] flex-col gap-3.5 overflow-y-auto px-4 pb-4 pt-3.5">
        {!noPlan && c.block === 0 && (
          <p className="flex items-center gap-2.5 rounded-[10px] border border-[#1F5C47] bg-[#0D2A21] px-3 py-2.5 text-[13px] text-emerald-200">
            <IconCheckCircle className="h-[18px] w-[18px] flex-none text-emerald-400" />
            {t(c.warn > 0 ? 'preflight.readyWarnings' : 'preflight.readyClean')}
          </p>
        )}
        {sections.map((s) => (
          <section key={s.level} aria-labelledby={noPlan ? undefined : `preflight-${s.level}`}>
            {!noPlan && (
              <h3 id={`preflight-${s.level}`} className="mb-2 flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  {t(`preflight.section.${s.level}`)}
                </span>
                <span className="text-xs text-slate-400">{s.count}</span>
              </h3>
            )}
            <ul className="flex flex-col gap-2">
              {s.entries.map((e, i) =>
                e.kind === 'group' ? (
                  <Group key={`g-${e.code}`} group={e} baseColors={baseColors} />
                ) : (
                  <Item
                    key={`${e.item.code}-${i}`}
                    item={e.item}
                    actions={actions}
                    // sem plano não há bloqueio a pintar de vermelho: é o passo seguinte
                    tone={noPlan ? 'info' : e.level}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
