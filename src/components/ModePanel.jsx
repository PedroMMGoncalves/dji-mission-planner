/**
 * Peças dos painéis dos outros modos (Face, Órbita, Corredor, Circular), no
 * desenho de Outubro de 2026: o mesmo painel em secções do modo Área, pela
 * ordem do trabalho (ui/Section, uma aberta de cada vez), com os resultados
 * onde se decide, os nomes técnicos do KMZ em «O que vai no KMZ» e o que
 * encurtou numa dica ou atrás de uma ligação. Aqui ficam a coluna com o
 * nome do modo; os controlos que os quatro repetem (interruptor, botões de
 * escolha, cartões de escolha, lista, um valor só de leitura); as notas; os
 * mosaicos, as linhas e a barra do voo do resumo; a linha do preflight; o
 * desenho no mapa (desenhar, limpar, anular, concluir); a exportação; a
 * descolagem; e as acções de segurança (as do cartão da área, Cards.jsx).
 */
import { Fragment, useId, useState } from 'react'
import { useT } from '../i18n.jsx'
import { missionExportLabel, rangeText, tCount } from '../i18n/format.js'
import { preflightCounts } from '../mission/preflight.js'
import { DEFAULT_SAFETY } from '../mission/safety.js'
import { rthRangeLabel } from '../mission/transitLegs.js'
import { RthLine, SafetyActions } from './Cards.jsx'
import {
  IconBlocked,
  IconCheck,
  IconCheckCircle,
  IconChevronDown,
  IconDownload,
  IconInfo,
  IconReport,
  IconTrash,
  IconWarning,
} from './Icons.jsx'
import { Icon } from './MapOverlay.jsx'
import { fmtClock } from './StatsPanel.jsx'
import { Button } from './ui/Button.jsx'
import { PanelCollapseButton } from './ui/PanelCollapse.jsx'
import { useAccordion } from './ui/useAccordion.js'

/**
 * A coluna do painel (a que rola), com o nome do modo e uma linha a dizer
 * para que serve: 360 px a partir de 1024 px de largura, como a da área. No
 * tablet, ao lado do nome, o botão que recolhe o painel (ui/PanelCollapse.jsx).
 * @param {{title: any, description: any, label: string, children?: any}} props
 */
export function ModePanel({ title, description, label, children = null }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="flex h-full w-80 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-800 bg-panel px-3 pb-6 pt-3.5 lg:w-[360px]"
    >
      <div className="flex items-start gap-2 px-1 pb-2 pt-0.5">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-slate-100">
            {title}
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-[1.45] text-slate-400">{description}</p>
        </div>
        <PanelCollapseButton />
      </div>
      {children}
    </div>
  )
}

/**
 * Uma secção aberta de cada vez, como no desenho (ui/useAccordion.js, o
 * mesmo acordeão do painel da área), a começar em `initial` (o passo em que
 * o trabalho está quando o separador abre); depois, a que o operador abrir,
 * sem a gravar. `section(id)` dá as propriedades da Section `card-<id>` (o
 * resumo vê-se também aberta).
 * @param {string|null} initial
 */
export function useOpenSection(initial) {
  // só a do primeiro render: a secção de partida não segue o trabalho
  const [first] = useState(initial)
  const { isOpen, toggle } = useAccordion(first)
  return (/** @type {string} */ id) => ({
    testId: `card-${id}`,
    open: isOpen(id),
    onToggle: () => toggle(id),
    summaryOpen: true,
  })
}

/** Dica por baixo de um controlo ou de um grupo. */
export function Hint({ id = undefined, className = '', children = null }) {
  return (
    <p id={id} className={`text-xs leading-normal text-slate-400 ${className}`}>
      {children}
    </p>
  )
}

/** Um grupo de controlos; `divided` separa-o do de cima com um traço. */
export function Part({ divided = false, className = '', children = null }) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 ${divided ? 'border-t border-slate-800 pt-3.5' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Dois campos por linha, alinhados pela caixa. */
export function Grid({ className = '', children = null }) {
  return <div className={`grid grid-cols-2 items-end gap-3 ${className}`}>{children}</div>
}

const NOTE = {
  // o que sai dos parâmetros acima (passagens, círculos, anéis)
  result: 'border-[#1D3A55] bg-[#0B1D2E] text-[#C9E6F7] [&_strong]:text-sky-100',
  neutral: 'border-slate-800 bg-field text-slate-200 [&_strong]:text-slate-100',
  info: 'border-[#1E2E4A] bg-[#0F1A2E] text-slate-200 [&_strong]:text-slate-100',
  warn: 'border-[#5C4214] bg-[#1C160B] text-[#E9D8AE] [&_strong]:text-amber-300',
  block: 'border-[#7A2530] bg-[#1C0E11] text-red-200 [&_strong]:text-red-300',
  ok: 'border-[#1F5C47] bg-[#0D2A21] text-emerald-200 [&_strong]:text-emerald-100',
}
const NOTE_ICON = {
  info: <IconInfo className="mt-0.5 h-4 w-4 flex-none text-blue-300" />,
  warn: <IconWarning className="mt-0.5 h-4 w-4 flex-none text-amber-500" />,
  block: <IconBlocked className="mt-0.5 h-4 w-4 flex-none text-red-400" />,
  ok: <IconCheckCircle className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />,
}

/**
 * Caixa de nota: `result` (azul, o que os campos dão), `neutral`, `info`,
 * `warn`, `block` e `ok`, estas com o ícone do tom. `lead` vai a negrito à
 * frente do texto.
 * @param {{tone?: 'result'|'neutral'|'info'|'warn'|'block'|'ok', lead?: any,
 *   testId?: string, className?: string, children?: any}} props
 */
export function Note({ tone = 'neutral', lead = null, testId, className = '', children = null }) {
  const icon = NOTE_ICON[tone] ?? null
  return (
    <div
      data-testid={testId}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] leading-normal [overflow-wrap:anywhere] [&_strong]:font-semibold ${NOTE[tone] ?? NOTE.neutral} ${className}`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {lead != null ? (
          <>
            <strong>{lead}</strong> {children}
          </>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/**
 * Cartões de escolha (rádios de verdade, com as setas do browser): o nome
 * de cada opção é o título; a descrição fica por baixo, como descrição dele.
 * @param {{name: string, label: string, value: string, onChange: (v: string) => void,
 *   options: {value: string, title: any, desc: any, testId?: string}[], testId?: string}} props
 */
export function Choices({ name, label, value, onChange, options, testId }) {
  const id = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="flex flex-col overflow-hidden rounded-[9px] border border-slate-800"
    >
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors ${
              i > 0 ? 'border-t border-slate-800' : ''
            } ${on ? 'bg-[#16223A]' : 'hover:bg-raised/60'}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              aria-labelledby={`${id}-${i}-t`}
              aria-describedby={`${id}-${i}-d`}
              data-testid={o.testId}
              className="mt-0.5 h-4 w-4 flex-none cursor-pointer appearance-none rounded-full border-2 border-slate-400 checked:border-sky-400 checked:bg-[radial-gradient(circle,#38BDF8_2.5px,transparent_3px)]"
            />
            <span className="min-w-0 flex-1">
              <span
                id={`${id}-${i}-t`}
                className={`block text-[13.5px] text-slate-100 ${on ? 'font-semibold' : 'font-medium'}`}
              >
                {o.title}
              </span>
              <span
                id={`${id}-${i}-d`}
                className={`mt-0.5 block text-xs leading-[1.45] ${on ? 'text-slate-300' : 'text-slate-400'}`}
              >
                {o.desc}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/**
 * Lista (um <select> de verdade) com o rótulo por cima e a seta do desenho;
 * `icon` fica à esquerda do valor.
 * @param {{label: any, value: string, onChange: (v: string) => void, children?: any,
 *   id?: string, testId?: string, describedBy?: string, icon?: any, disabled?: boolean,
 *   className?: string}} props
 */
export function Select({
  label,
  value,
  onChange,
  children = null,
  id: idProp,
  testId,
  describedBy,
  icon = null,
  disabled = false,
  className = '',
}) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs text-slate-400">
        {label}
      </label>
      <span className="relative flex min-w-0">
        {icon && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
            {icon}
          </span>
        )}
        <select
          id={id}
          data-testid={testId}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`h-10 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-slate-700 bg-field pr-9 text-[13.5px] font-medium text-slate-100 outline-none transition-colors focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40 ${icon ? 'pl-8' : 'pl-3'}`}
        >
          {children}
        </select>
        <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-slate-400" />
      </span>
    </div>
  )
}

/**
 * Campo com o rótulo à esquerda e a caixa estreita à direita (uma linha):
 * `children` é o controlo, com `fieldInput` (ui/Field.jsx).
 * @param {{label: any, unit?: any, children?: any, boxClass: string}} props
 */
export function InlineField({ label, unit = null, children = null, boxClass }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13.5px] text-slate-100">
      <span className="min-w-0">{label}</span>
      <span className={`${boxClass} w-[120px] flex-none`}>
        {children}
        {unit != null && (
          <span className="flex-none text-[12.5px] font-normal text-slate-400">{unit}</span>
        )}
      </span>
    </label>
  )
}

/** Um valor que sai dos outros, com o rótulo de um campo e sem caixa para escrever. */
export function Readout({ label, value, extra = null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="flex h-10 min-w-0 items-center gap-1.5 rounded-lg bg-sunken px-2.5 text-sm font-semibold tabular-nums text-slate-100">
        <span className="whitespace-nowrap">{value}</span>
        {extra != null && (
          <span className="truncate text-xs font-normal text-slate-400">{extra}</span>
        )}
      </span>
    </div>
  )
}

/** Uma linha rótulo / valor numa caixa (a cota de referência, o GSD no eixo óptico). */
export function KeyLine({ label, value, extra = null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg border border-slate-800 bg-field px-3 py-2.5 text-[12.5px]">
      <span className="text-slate-300">{label}</span>
      <span className="text-right font-semibold tabular-nums text-slate-100">
        {value}
        {extra != null && <span className="font-normal text-slate-400"> {extra}</span>}
      </span>
    </div>
  )
}

/**
 * Linhas rótulo / valor do resumo, numa caixa: `[rótulo, valor, extra]`.
 * @param {{rows: any[][], testId?: string}} props
 */
export function Rows({ rows, testId }) {
  return (
    <dl
      data-testid={testId}
      className="m-0 rounded-[9px] border border-slate-800 bg-sunken px-3 py-1.5"
    >
      {rows.map(([k, v, extra]) => (
        <div key={k} className="flex min-h-[28px] items-center justify-between gap-3 text-[12.5px]">
          <dt className="text-slate-300">{k}</dt>
          <dd className="m-0 whitespace-nowrap text-right tabular-nums text-slate-100">
            {v}
            {extra != null && <span className="text-slate-400">{extra}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Os mosaicos do resumo, dois por linha: rótulo, valor e uma linha por baixo.
 * @param {{tiles: {label: any, value: any, sub?: any, testId?: string}[]}} props
 */
export function Tiles({ tiles }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-2">
      {tiles.map((x) => (
        <div
          key={x.label}
          data-testid={x.testId}
          className="min-w-0 rounded-[9px] border border-slate-800 bg-sunken px-3 py-2.5"
        >
          <dt className="text-xs leading-tight text-slate-400">{x.label}</dt>
          <dd className="m-0 mt-[3px] truncate text-lg font-semibold leading-tight tabular-nums text-slate-100">
            {x.value}
          </dd>
          {x.sub != null && <dd className="m-0 text-xs leading-tight text-slate-400">{x.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}

const TONE = { ok: 'text-slate-100', near: 'text-amber-300', over: 'text-red-300' }
const BAR = { ok: 'bg-sky-400', near: 'bg-amber-500', over: 'bg-red-400' }

/**
 * O voo mais longo (ou o único) contra o tempo útil de uma bateria, com a
 * barra: os números e as cores do cartão de métricas (useMissionOps). Por
 * baixo, a percentagem e o que quer dizer o âmbar ou o vermelho; `lead` vai
 * antes dela (a deslocação desde a base) e `note` depois (os conjuntos de
 * baterias); `margin` explica o âmbar (o circular); `label` troca o nome da
 * linha (o «Bloco mais longo» do circular).
 * @param {{ops: any, label?: string|null, lead?: string|null, note?: string|null,
 *   margin?: string|null}} props
 */
export function FlightBar({
  ops,
  label: labelProp = null,
  lead = null,
  note = null,
  margin = null,
}) {
  const t = useT()
  if (!ops?.longest) return null
  const pct = ops.longestFrac != null ? Math.round(ops.longestFrac * 100) : null
  const level = ops.level ?? 'ok'
  const label =
    labelProp ??
    (ops.flights > 1
      ? ops.longest.label
        ? t('stats.longestOf', { label: ops.longest.label })
        : t('stats.longest')
      : t('mp.flight.single'))
  // «91 % do tempo útil (âmbar acima de 90 %)», e a razão do âmbar
  const pctText =
    pct == null
      ? null
      : [
          t('mp.flight.pct', { p: pct }),
          level === 'near' ? t('mp.flight.near') : level === 'over' ? t('mp.flight.over') : null,
        ]
          .filter(Boolean)
          .join(' ') + (margin && level === 'near' ? `: ${margin}` : '')
  return (
    <div
      title={t('stats.longestHint')}
      className="rounded-[9px] border border-slate-800 bg-sunken px-3 py-2.5"
    >
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-slate-300">{label}</span>
        <span
          className={`whitespace-nowrap font-semibold tabular-nums ${TONE[level] ?? TONE.ok}`}
          data-tone={level}
        >
          {fmtClock(ops.longest.timeS)}
          {ops.usefulS ? (
            <span className="font-normal text-slate-400">
              {' '}
              {t('stats.ofUseful', { u: fmtClock(ops.usefulS) })}
            </span>
          ) : null}
        </span>
      </div>
      {pct != null && (
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${BAR[level] ?? BAR.ok}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
      {(pctText || lead || note) && (
        <div className="mt-1.5 text-xs leading-normal text-slate-400">
          {[lead, pctText, note].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

/**
 * «1 conjunto de baterias», por baixo da barra do voo (o número do cartão de
 * métricas).
 * @param {(key: string, vars?: any) => string} t
 * @param {any} ops
 */
export function setsNote(t, ops) {
  const n = ops?.sets ?? ops?.flights
  return n ? tCount(t, 'mp.setsN', n, { n }) : null
}

/**
 * Bloco que abre e fecha dentro de uma secção (as acções de segurança, «O
 * que vai no KMZ»): fechado, o conteúdo fica montado e escondido.
 * @param {{title: any, summary?: any, icon?: any, testId?: string, children?: any}} props
 */
function Disclosure({ title, summary = null, icon = null, testId, children = null }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div data-testid={testId} className="overflow-hidden rounded-[9px] border border-slate-800">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        aria-labelledby={`${id}-title`}
        aria-describedby={summary != null ? `${id}-summary` : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 bg-sunken px-3 py-2 text-left text-slate-100 transition-colors hover:bg-raised focus-visible:outline-offset-[-2px] ${
          summary != null ? 'min-h-[52px]' : 'min-h-[44px]'
        }`}
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span
            id={`${id}-title`}
            className={`block ${summary != null ? 'text-[13.5px] font-semibold' : 'text-[13px] font-medium'}`}
          >
            {title}
          </span>
          {summary != null && (
            <span id={`${id}-summary`} className="mt-0.5 block truncate text-xs text-slate-400">
              {summary}
            </span>
          )}
        </span>
        <IconChevronDown
          className={`h-[15px] w-[15px] flex-none text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {/* a classe e não só o atributo: o `flex` passava por cima do hidden */}
      <div
        id={`${id}-body`}
        hidden={!open}
        className={`${open ? 'flex' : 'hidden'} flex-col gap-3 border-t border-slate-800 p-3`}
      >
        {children}
      </div>
    </div>
  )
}

/** Nome técnico do KMZ, a letra de código. */
export function Code({ children = null }) {
  return <code className="font-mono text-[11.5px] text-slate-200">{children}</code>
}

/**
 * «O que vai no KMZ»: o que a exportação escreve, uma frase por linha, com
 * os nomes técnicos do WPML (que saíram das dicas dos campos).
 * @param {{lines: any[]}} props
 */
export function KmzContents({ lines }) {
  const t = useT()
  return (
    <Disclosure
      title={t('mp.kmz')}
      testId="mode-kmz-contents"
      icon={<IconReport className="h-4 w-4 flex-none text-sky-300" />}
    >
      <div className="-mt-0.5 flex flex-col gap-1.5 text-[12.5px] leading-normal text-slate-200 [overflow-wrap:anywhere]">
        {lines.filter(Boolean).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </Disclosure>
  )
}

const BADGE = {
  neutral: 'bg-[#16213A] text-slate-300',
  ok: 'bg-[#0D2A21] text-emerald-300',
  warn: 'bg-[#2A1F0B] text-amber-300',
  block: 'bg-[#2B1215] text-red-300',
}

/**
 * Etiqueta curta de uma secção fechada (avisos, o voo mais longo): o
 * número à vista e a frase inteira para o leitor de ecrã e na dica.
 * @param {{tone?: 'neutral'|'ok'|'warn'|'block', icon?: any, value: any, label: string}} props
 */
export function StatusBadge({ tone = 'warn', icon = null, value, label }) {
  return (
    <span
      title={label}
      className={`inline-flex h-[22px] flex-none items-center gap-1 rounded-full px-[7px] text-xs font-semibold tabular-nums ${BADGE[tone] ?? BADGE.warn}`}
    >
      {icon}
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** O visto verde de uma secção pronta, com o nome do estado. */
export function StatusDone({ label }) {
  return (
    <span role="img" aria-label={label} title={label} className="flex">
      <IconCheck className="h-4 w-4 text-emerald-400" />
    </span>
  )
}

/** Ícone de bateria das etiquetas do voo mais longo. */
const BATTERY_ICON = (
  <Icon size={13} sw={2.2}>
    <rect x="2" y="7" width="16" height="10" rx="2" />
    <path d="M22 11v2M6 11v2M10 11v2" />
  </Icon>
)

/**
 * A etiqueta de uma secção com o voo mais longo (ou o bloco) contra o tempo
 * útil: «91 %», na cor do cartão de métricas.
 * @param {{ops: any, label: string}} props
 */
export function LongestBadge({ ops, label }) {
  if (ops?.longestFrac == null) return null
  const pct = Math.round(ops.longestFrac * 100)
  const tone = ops.level === 'over' ? 'block' : ops.level === 'near' ? 'warn' : 'neutral'
  return <StatusBadge tone={tone} icon={BATTERY_ICON} value={`${pct} %`} label={label} />
}

/** Sem plano, a lista do preflight só diz o passo seguinte (PreflightBar.jsx). */
const isNoPlan = (items) => items.length === 1 && items[0].code === 'no-plan'

/** «3 avisos», «1 bloqueio»: o número e a palavra (as do preflight). */
function counted(t, n, one, many) {
  return `${n} ${t(n === 1 ? one : many)}`
}

/**
 * As contagens do preflight do separador, para a etiqueta e o resumo da
 * secção «Resumo e exportar»; null sem plano.
 * @param {any[]} items
 */
export function preflightState(items) {
  if (!items?.length || isNoPlan(items)) return null
  const c = preflightCounts(items)
  return { block: c.block ?? 0, warn: c.warn ?? 0 }
}

/**
 * A etiqueta da secção «Resumo e exportar»: os bloqueios, senão os avisos,
 * senão o visto de pronto a exportar.
 * @param {{state: {block: number, warn: number}|null}} props
 */
export function PreflightStatus({ state }) {
  const t = useT()
  if (!state) return null
  if (state.block > 0)
    return (
      <StatusBadge
        tone="block"
        icon={<IconBlocked className="h-3 w-3" />}
        value={state.block}
        label={t('mp.inPreflight', {
          n: counted(t, state.block, 'preflight.word.blocker', 'preflight.word.blockers'),
        })}
      />
    )
  if (state.warn > 0)
    return (
      <StatusBadge
        tone="warn"
        icon={<IconWarning className="h-3 w-3 text-amber-500" />}
        value={state.warn}
        label={t('mp.inPreflight', {
          n: counted(t, state.warn, 'preflight.word.warning', 'preflight.word.warnings'),
        })}
      />
    )
  return <StatusDone label={t('preflight.ok')} />
}

/**
 * A linha do preflight no fim do resumo: os bloqueios ou «sem bloqueios»,
 * os avisos, e «Ver», que abre a lista do cabeçalho.
 * @param {{state: {block: number, warn: number}|null, onShow?: (() => void)|null}} props
 */
export function PreflightRow({ state, onShow = null }) {
  const t = useT()
  if (!state) return null
  const pill = 'inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs font-semibold'
  return (
    <div
      data-testid="mode-preflight"
      className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-[9px] border border-slate-800 bg-sunken px-3 py-1.5"
    >
      <span className="text-[12.5px] text-slate-300">{t('preflight.title')}</span>
      {state.block > 0 ? (
        <span className={`${pill} ${BADGE.block}`}>
          <IconBlocked className="h-3 w-3" />
          {counted(t, state.block, 'preflight.word.blocker', 'preflight.word.blockers')}
        </span>
      ) : state.warn > 0 ? (
        <span className={`${pill} ${BADGE.ok}`}>
          {counted(t, 0, 'preflight.word.blocker', 'preflight.word.blockers')}
        </span>
      ) : (
        <span className={`${pill} ${BADGE.ok}`}>
          <IconCheck className="h-3 w-3" />
          {t('preflight.ok')}
        </span>
      )}
      {state.warn > 0 && (
        <span className={`${pill} ${BADGE.warn}`}>
          <IconWarning className="h-3 w-3 text-amber-500" />
          {counted(t, state.warn, 'preflight.word.warning', 'preflight.word.warnings')}
        </span>
      )}
      <span className="flex-1" />
      {onShow && (
        <button
          type="button"
          onClick={onShow}
          aria-label={t('mp.preflightSee')}
          title={t('mp.preflightSee')}
          className="rounded text-[12.5px] font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200"
        >
          {t('mp.preflightSeeShort')}
        </button>
      )}
    </div>
  )
}

/**
 * Botão de uma ferramenta do mapa (desenhar, marcar): premido enquanto está
 * activa. `outline` é o de contorno, para uma acção que não é o passo
 * seguinte da secção (marcar uma base no fim da lista das bases).
 * @param {{pressed: boolean, onClick: () => void, icon?: any, title?: string,
 *   outline?: boolean, children?: any}} props
 */
export function ToolButton({
  pressed,
  onClick,
  icon = null,
  title = undefined,
  outline = false,
  children = null,
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-[13px] transition-colors ${
        pressed
          ? 'border-sky-400 bg-sky-400 font-semibold text-[#06202E] hover:bg-sky-300'
          : outline
            ? 'border-slate-700 font-medium text-slate-100 hover:bg-raised'
            : 'border-[#2C4A68] bg-[#0F2438] font-semibold text-sky-200 hover:bg-[#143049]'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  )
}

const SMALL_BUTTON =
  'flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent'

/**
 * Desenhar no mapa e limpar, e, a desenhar, os vértices com «Anular último»
 * e «Concluir» (a face, o eixo do corredor e a área do circular). O botão
 * de desenhar fica premido enquanto se desenha.
 * @param {{label: any, title?: string, icon?: any, drawing: boolean, onDraw: () => void,
 *   clearLabel: any, onClear: () => void, clearDisabled: boolean, count: number,
 *   hint: any, onUndo: () => void, onFinish: () => void, minVertices?: number}} props
 */
export function DrawControls({
  label,
  title,
  icon = null,
  drawing,
  onDraw,
  clearLabel,
  onClear,
  clearDisabled,
  count,
  hint,
  onUndo,
  onFinish,
  minVertices = 2,
}) {
  const t = useT()
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <ToolButton pressed={drawing} onClick={onDraw} icon={icon} title={title}>
          {label}
        </ToolButton>
        <Button
          variant="danger"
          size="field"
          onClick={onClear}
          disabled={clearDisabled}
          icon={<IconTrash className="h-[15px] w-[15px]" />}
        >
          {clearLabel}
        </Button>
      </div>
      {drawing && (
        <div className="flex flex-col gap-2.5 rounded-[9px] border border-[#1D3A55] bg-[#0B1D2E] px-3 py-2.5">
          <p className="text-[12.5px] leading-normal text-[#C9E6F7]">
            <strong className="font-semibold text-sky-100">
              {tCount(t, 'mp.vertices', count, { n: count })}
            </strong>{' '}
            {hint}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onUndo} disabled={count === 0} className={SMALL_BUTTON}>
              <Icon size={15} sw={1.8}>
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </Icon>
              {t('cp.area.undoVertex')}
            </button>
            <button
              type="button"
              onClick={onFinish}
              disabled={count < minVertices}
              className={SMALL_BUTTON}
            >
              <Icon size={15} d="M20 6 9 17l-5-5" />
              {t('cp.area.finish')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * O botão de exportar a missão do separador: o mesmo do cabeçalho, com o
 * mesmo nome, a mesma dica e o mesmo preflight (quem chama dá-os).
 * @param {{kind?: string, onClick: () => void, disabled: boolean, title?: string}} props
 */
export function ExportButton({ kind = 'kmz', onClick, disabled, title }) {
  const t = useT()
  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full rounded-[9px]"
      onClick={onClick}
      disabled={disabled}
      title={title}
      icon={<IconDownload className="h-[17px] w-[17px]" />}
    >
      {missionExportLabel(t, kind)}
    </Button>
  )
}

/**
 * Outra exportação do separador (por nível, por bloco), numa linha com o
 * que sai por baixo do nome; o nome é o do menu da seta do cabeçalho.
 * @param {{label: any, description?: any, onClick: () => void, disabled: boolean}} props
 */
export function ExportRow({ label, description = null, onClick, disabled }) {
  const id = useId()
  return (
    <div className="overflow-hidden rounded-[9px] border border-slate-800">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-labelledby={`${id}-l`}
        aria-describedby={description != null ? `${id}-d` : undefined}
        className="flex min-h-[52px] w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <span className="min-w-0 flex-1">
          <span id={`${id}-l`} className="block">
            {label}
          </span>
          {description != null && (
            <span id={`${id}-d`} className="mt-0.5 block text-xs font-normal text-slate-400">
              {description}
            </span>
          )}
        </span>
        <IconDownload className="h-4 w-4 flex-none text-sky-300" />
      </button>
    </div>
  )
}

/**
 * Descolagem da face ou da órbita (src/mission/takeoffRef.js): no chão do
 * alvo, como sempre, ou numa base do projecto, com as alturas exportadas
 * convertidas pela diferença de cotas. A dica diz a conversão, ou o erro.
 * `otherHint`, com uma base escolhida, lembra a outra escolha (o chão do alvo).
 * @param {{value: string|null, onChange: (v: string|null) => void, bases?: any[],
 *   takeoff?: any, targetLabel: string, targetHint: string, otherHint?: string,
 *   testId: string}} props
 */
export function TakeoffField({
  value,
  onChange,
  bases = [],
  takeoff = null,
  targetLabel,
  targetHint,
  otherHint = '',
  testId,
}) {
  const t = useT()
  const hintId = useId()
  const signed = (v) => signedText(v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid={testId}>
      <Select
        id={`${testId}-select`}
        testId={`${testId}-select`}
        label={t('takeoff.label')}
        value={value ?? ''}
        onChange={(v) => onChange(v || null)}
        describedBy={hintId}
      >
        <option value="">{targetLabel}</option>
        {bases.map((b) => (
          <option key={b.id} value={b.id}>
            {t('takeoff.base', { label: b.label })}
          </option>
        ))}
      </Select>
      {takeoff?.error ? (
        <p id={hintId} className="text-xs leading-normal text-red-300">
          ⚠ {t(`takeoff.err.${takeoff.error}`)}
        </p>
      ) : (
        <Hint id={hintId}>
          {takeoff?.mode === 'base'
            ? t('mp.takeoff.baseHint', {
                base: takeoff.base?.label ?? '',
                dh: signed(takeoff.dh),
                elev: Number.isFinite(takeoff.baseElev)
                  ? signedText(Math.round(takeoff.baseElev))
                  : '—',
                other: otherHint,
              })
            : targetHint}
        </Hint>
      )}
    </div>
  )
}

/**
 * A descolagem em poucas palavras, para o resumo da secção: «Base A», ou o
 * chão do alvo (`target`).
 * @param {(key: string, vars?: any) => string} t
 * @param {any} takeoff
 * @param {string} target
 */
export function takeoffShort(t, takeoff, target) {
  return takeoff?.mode === 'base' && takeoff.base
    ? t('mp.base', { label: takeoff.base.label })
    : target
}

/**
 * As acções de segurança numa linha: «RTH no fim e ao perder o sinal», ou
 * o fim e a perda de sinal cada um com a sua palavra.
 * @param {(key: string, vars?: any) => string} t
 * @param {any} safety
 */
export function safetySummary(t, safety) {
  const s = { ...DEFAULT_SAFETY, ...(safety ?? {}) }
  const stops = s.exitOnRCLost === 'executeLostAction'
  if (stops && s.finishAction === 'goHome' && s.executeRCLostAction === 'goBack')
    return t('mp.safety.rthBoth')
  return t('mp.safety.summary', {
    finish: t(`mp.safety.end.${s.finishAction}`),
    lost: stops
      ? t('mp.safety.stop', { action: t(`mp.safety.act.${s.executeRCLostAction}`) })
      : t('mp.safety.continue'),
  })
}

/** O que a aeronave faz no fim da missão, para o resumo: «RTH no fim». */
export function safetyEnd(t, safety) {
  const s = { ...DEFAULT_SAFETY, ...(safety ?? {}) }
  return t('mp.safety.endShort', { finish: t(`mp.safety.end.${s.finishAction}`) })
}

/** «regresso a 100 m» (ou «a 100–120 m»), do RTH escrito no KMZ. */
export function rthShort(t, rthInfo) {
  return rthInfo ? t('mp.rthShort', { m: rthRangeLabel(rthInfo) }) : null
}

/**
 * Só a altura do RTH, «121 m», depois das acções de segurança no resumo da
 * secção do corredor e do circular («RTH no fim e ao perder o sinal · 121 m»).
 */
export function rthHeight(rthInfo) {
  return rthInfo ? `${rthRangeLabel(rthInfo)} m` : null
}

/** Escudo das acções de segurança. */
const SHIELD = (
  <Icon size={17} sw={1.8} className="text-sky-300">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Icon>
)

/**
 * As acções de segurança e o RTH escrito no KMZ: os campos são os do
 * cartão da área (SafetyActions, a mesma escolha para todos os modos);
 * `nested` põe-nos num bloco que abre e fecha, com o resumo numa linha.
 * @param {{safety: any, setSafety: (s: any) => void, rthInfo?: any, nested?: boolean}} props
 */
export function SafetyBlock({ safety, setSafety, rthInfo = null, nested = false }) {
  const t = useT()
  const actions = <SafetyActions safety={safety} onChange={setSafety} />
  return (
    <>
      {nested ? (
        <Disclosure title={t('safety.title')} summary={safetySummary(t, safety)} icon={SHIELD}>
          {actions}
        </Disclosure>
      ) : (
        actions
      )}
      {rthInfo && (
        <div className="rounded-lg border border-slate-800 bg-field px-3 py-2.5 [&>p]:mt-0">
          <RthLine info={rthInfo} />
        </div>
      )}
    </>
  )
}

/**
 * Um número com o sinal de menos tipográfico («−45»), nos textos; os campos
 * continuam com o do teclado.
 * @param {number} v
 */
export const signedText = (v) => String(v).replace('-', '−')

/**
 * A unidade dos campos de velocidade, com o intervalo da aeronave: «m/s · 1–15».
 * @param {(key: string, vars?: any) => string} t
 * @param {number} min
 * @param {number} max
 */
export function speedUnit(t, min, max) {
  return t('mp.speedUnit', { range: rangeText(min, max) })
}

/**
 * «30, 45 e 60»: uma lista numa frase, com «e» antes do último.
 * @param {(key: string, vars?: any) => string} t
 * @param {string[]} items
 */
export function joinList(t, items) {
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')}${t('mp.and')}${items[items.length - 1]}`
    : (items[0] ?? '')
}

/**
 * «−45°, 0° e 30°»: uma lista de ângulos numa frase.
 * @param {(key: string, vars?: any) => string} t
 * @param {number[]} list
 */
export function anglesText(t, list) {
  return joinList(
    t,
    list.map((p) => `${signedText(p)}°`),
  )
}

/**
 * Uma frase com nomes técnicos do KMZ: cada `{c1}`, `{c2}`… do texto passa
 * a `codes[0]`, `codes[1]`…, em letra de código.
 * @param {string} text
 * @param {string[]} codes
 */
export function codeText(text, codes) {
  const parts = text.split(/\{c(\d)\}/)
  return parts.map((p, i) => (i % 2 ? <Code key={i}>{codes[Number(p) - 1]}</Code> : p))
}

/**
 * Uma frase com os valores a negrito, como no desenho: cada `{b1}`, `{b2}`…
 * do texto passa a `values[0]`, `values[1]`… dentro de <strong>.
 * @param {string} text
 * @param {any[]} values
 */
export function boldText(text, values) {
  const parts = text.split(/\{b(\d)\}/)
  return parts.map((p, i) =>
    i % 2 ? <strong key={i}>{values[Number(p) - 1]}</strong> : <Fragment key={i}>{p}</Fragment>,
  )
}
