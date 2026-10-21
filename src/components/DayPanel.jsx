/**
 * A operação do dia, num painel próprio à direita do mapa (o lugar do
 * cartão das métricas, que fica escondido enquanto ele está aberto): em
 * cima os conjuntos de baterias, o tempo total e o voo mais longo; depois o
 * voo seguinte, com «Ver no mapa» e «Marcar feito»; e a ordem do dia, uma
 * linha por voo pela ordem de voo, com a sua base, a barra contra o tempo
 * útil (o tempo no bloco e a deslocação noutro tom), a percentagem e a
 * distância à base. Feito é o voo com a «Hora fim» no registo de voos da
 * checklist de campo (src/mission/dayPlan.js): marcar aqui escreve lá.
 * Abre-se no botão «Operação do dia», por baixo das métricas (DayOpener).
 */
import { useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { OPS_NEAR_FRAC } from '../mission/opsSummary.js'
import { inkFor } from './BasesPanel.jsx'
import { FOCUS, Icon, PILL } from './MapOverlay.jsx'
import { Note } from './ModePanel.jsx'
import { fmtClock, fmtTime } from './StatsPanel.jsx'
import { buttonClass } from './ui/Button.jsx'

/** O ícone da operação: o caminho de uma base a outra. */
const ROUTE = (
  <>
    <circle cx="6" cy="19" r="3" />
    <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
    <circle cx="18" cy="5" r="3" />
  </>
)
const CHECK = 'M20 6 9 17l-5-5'
const CHEVRON = 'm9 18 6-6-6-6'

// as cores da barra de cada voo: o tempo no bloco e a deslocação (mais
// clara), pelo nível do cartão das métricas; esbatidas num voo feito
const BAR = {
  ok: ['bg-sky-400', 'bg-sky-200'],
  near: ['bg-amber-500', 'bg-amber-200'],
  over: ['bg-red-400', 'bg-red-200'],
  done: ['bg-[#3A4A66]', 'bg-[#55657F]'],
}
const levelOf = (frac) =>
  frac == null ? 'ok' : frac > 1 ? 'over' : frac > OPS_NEAR_FRAC ? 'near' : 'ok'
const minutes = (s) => Math.round(s / 60)

/**
 * O botão que abre o painel, por baixo das métricas: o nome e, a cinzento,
 * os voos e o tempo total.
 * @param {{flights: number, totalS: number|null, onOpen: () => void,
 *   buttonRef?: import('react').Ref<HTMLButtonElement>}} props
 */
export function DayOpener({ flights, totalS, onOpen, buttonRef }) {
  const t = useT()
  const parts = [
    tCount(t, 'stats.flightsN', flights, { n: flights }),
    Number.isFinite(totalS) ? fmtTime(totalS) : null,
  ].filter(Boolean)
  return (
    <button
      type="button"
      ref={buttonRef}
      data-testid="day-open"
      onClick={onOpen}
      title={t('day.openTitle')}
      className={`pointer-events-auto flex-none ${PILL}`}
    >
      <Icon className="text-sky-300">{ROUTE}</Icon>
      {t('day.title')}
      <span className="tabular-nums text-slate-400">· {parts.join(' · ')}</span>
      <Icon d="m15 18-6-6 6-6" className="text-slate-400" />
    </button>
  )
}

/** O rótulo de uma base num círculo da sua cor (cinzento num voo feito). */
function BaseBadge({ base, done = false, className = 'h-[22px] w-[22px] text-[11px]' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center rounded-full font-bold ${className}`}
      style={
        done
          ? { background: '#27354F', color: '#AEB9CC' }
          : { background: base.color ?? '#27354F', color: inkFor(base.color) }
      }
    >
      {base.label}
    </span>
  )
}

/** Um dos três números do dia, com o rótulo e o ícone por cima. */
function Tile({ icon, label, testId, children }) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-[106px] min-w-0 flex-col rounded-[10px] border border-slate-800 bg-surface px-3 py-2.5"
    >
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <Icon d={icon} size={14} />
        {label}
      </span>
      {children}
    </div>
  )
}

/** Uma ligação discreta («Definir na Configuração ›»). */
function LinkButton({ onClick, title, className = '', children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 whitespace-nowrap rounded text-[12.5px] font-medium text-sky-300 transition-colors hover:text-sky-200 ${FOCUS} ${className}`}
    >
      {children}
      <Icon d={CHEVRON} size={13} />
    </button>
  )
}

/** A zona de descolagem da base do voo, numa linha (âmbar quando foi reduzida). */
function zoneLine(t, base) {
  const r = Math.round(base.radiusM ?? 0)
  if (base.noTerrain) return { text: t('day.zoneNoTerrain', { r }), tone: 'text-red-300' }
  if (base.reduced)
    return {
      text: t('day.zoneReduced', {
        r,
        relief: Math.round(base.cause?.reliefM ?? 0),
        at: Math.round(base.cause?.atM ?? 0),
      }),
      tone: 'text-amber-300',
    }
  return { text: t('day.zone', { r }), tone: 'text-slate-300' }
}

/**
 * @param {{flights: import('../mission/dayPlan.js').DayFlight[], done: Set<string>,
 *   next: import('../mission/dayPlan.js').DayFlight|null, focusId: number|null,
 *   ops: any, daySheets: {flights: number, sets: number|null, short: boolean}|null,
 *   missionTimeS: number|null, battery: string, usefulMin: number,
 *   estimated?: boolean, vlosM: number|null, onToggle: (label: string) => void,
 *   onMark: (label: string) => void, onShow: (blockId: number) => void,
 *   onClose: () => void, closeRef?: import('react').Ref<HTMLButtonElement>,
 *   onOpenSettings: () => void, onAdjustUseful: () => void}} props
 */
export default function DayPanel({
  flights,
  done,
  next,
  focusId,
  ops,
  daySheets: day,
  missionTimeS,
  battery,
  usefulMin,
  estimated = false,
  vlosM,
  onToggle,
  onMark,
  onShow,
  onClose,
  closeRef,
  onOpenSettings,
  onAdjustUseful,
}) {
  const t = useT()
  const total = flights.length
  const nDone = flights.filter((f) => done.has(f.label)).length
  const left = total - nDone
  const usefulS = usefulMin > 0 ? usefulMin * 60 : null
  const useful = usefulS ? fmtClock(usefulS) : '—'
  const bases = new Set(flights.map((f) => f.base.id)).size
  const longest = ops?.longest ?? null
  const longestPct = ops?.longestFrac != null ? Math.round(ops.longestFrac * 100) : null
  const longestLevel = ops?.level ?? 'ok'
  // a maior distância à base do dia, a negrito
  const worstVlos = Math.max(0, ...flights.map((f) => f.worstVlosM ?? 0))
  const sets = day?.sets ?? null
  const flightsText = tCount(t, 'stats.flightsN', total, { n: total })
  const setsText = tCount(t, 'day.setsN', total, { n: total })
  return (
    <aside
      id="day-panel"
      aria-labelledby="day-title"
      data-testid="day-panel"
      onKeyDown={(e) => {
        // o Esc fecha o painel (um menu ou uma janela por cima tratam do seu)
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        onClose()
      }}
      className="flex h-full w-[560px] max-w-[calc(100vw-64px)] shrink-0 flex-col border-l border-slate-700 bg-panel text-slate-100 min-[1180px]:w-[640px]"
    >
      {/* o nome, a linha do dia e fechar */}
      <div className="flex min-h-16 flex-none items-center gap-3 border-b border-slate-800 py-2.5 pl-5 pr-3">
        <Icon size={20} sw={1.8} className="text-sky-300">
          {ROUTE}
        </Icon>
        <div className="min-w-0 flex-1">
          <h2 id="day-title" className="m-0 text-[17px] font-semibold tracking-[-0.01em]">
            {t('day.title')}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            {[
              t('day.inOrder'),
              t('day.flightsIn', {
                flights: flightsText,
                bases: tCount(t, 'stats.basesN', bases, { b: bases }),
              }),
              t('day.battery', { battery, min: usefulMin }),
            ].join(' · ')}
          </p>
        </div>
        <button
          type="button"
          ref={closeRef}
          onClick={onClose}
          aria-label={t('day.close')}
          title={t('day.close')}
          aria-keyshortcuts="Escape"
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-raised hover:text-slate-100 ${FOCUS}`}
        >
          <Icon d="M18 6 6 18M6 6l12 12" />
        </button>
      </div>

      {/* os três números do dia */}
      <div className="grid flex-none grid-cols-3 gap-2 px-5 pt-3.5">
        <Tile
          icon="M4 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM22 11v2"
          label={t('stats.batteries')}
          testId="day-sets"
        >
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tabular-nums tracking-[-0.01em]">
              {day?.flights ?? total}
            </span>
            <span className="text-[12.5px] text-slate-300">
              {tCount(t, 'day.needed', day?.flights ?? total)}
            </span>
          </span>
          <span className={`mt-px text-xs ${day?.short ? 'text-amber-300' : 'text-slate-400'}`}>
            {sets == null ? t('day.teamUnknown') : t('day.team', { s: sets })}
          </span>
          <LinkButton
            onClick={onOpenSettings}
            title={t('day.setInSettingsTitle')}
            className="mt-auto self-start pt-1.5 text-xs"
          >
            {t('day.setInSettings')}
          </LinkButton>
        </Tile>
        <Tile
          icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2"
          label={t('day.totalTime')}
          testId="day-total"
        >
          <span className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.01em]">
            {fmtTime(ops?.totalS)}
          </span>
          <span className="mt-px text-xs text-slate-400">{t('day.withTransit')}</span>
          {Number.isFinite(missionTimeS) && (
            <span className="mt-auto pt-1.5 text-xs tabular-nums text-slate-300">
              {t('day.inMission', { t: fmtTime(missionTimeS) })}
            </span>
          )}
        </Tile>
        <Tile icon="M3 12h4l3-8 4 16 3-8h4" label={t('stats.longest')} testId="day-longest">
          <span className="mt-1 flex items-baseline gap-1.5 tabular-nums">
            <span
              data-tone={longestLevel}
              className={`text-[22px] font-semibold tracking-[-0.01em] ${
                longestLevel === 'over'
                  ? 'text-red-300'
                  : longestLevel === 'near'
                    ? 'text-amber-300'
                    : ''
              }`}
            >
              {longest ? fmtClock(longest.timeS) : '—'}
            </span>
            {longest?.label && (
              <span className="text-[12.5px] text-slate-300">{longest.label}</span>
            )}
          </span>
          {longestPct != null && (
            <>
              <span className="mt-px text-xs tabular-nums text-slate-400">
                {t('day.ofUseful', { u: useful, p: longestPct })}
              </span>
              <span
                role="img"
                aria-label={t('day.longestBar', { flight: longest?.label ?? '', p: longestPct })}
                className="mt-auto block h-1.5 overflow-hidden rounded-full bg-slate-800"
              >
                <span
                  className={`block h-full rounded-full ${BAR[longestLevel]?.[0] ?? BAR.ok[0]}`}
                  style={{ width: `${Math.min(100, longestPct)}%` }}
                />
              </span>
            </>
          )}
        </Tile>
      </div>

      {day?.short && (
        <Note tone="warn" lead={t('day.setsShort')} testId="day-sets-short" className="mx-5 mt-2.5">
          {t('sets.short', { flights: day.flights, sets: day.sets, battery })}
        </Note>
      )}

      {/* o voo seguinte, ou todos feitos */}
      {next ? (
        <NextFlight
          flight={next}
          usefulS={usefulS}
          onShow={() => onShow(next.blockId)}
          onMark={() => onMark(next.label)}
        />
      ) : (
        <div
          data-testid="day-all-done"
          role="status"
          className="mx-5 mt-2.5 flex flex-none items-center gap-2.5 rounded-[10px] border border-[#1F5C47] bg-[#0D2A21] p-3.5 text-[13px] text-emerald-200"
        >
          <Icon size={18} className="text-emerald-400">
            <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
            <path d="M22 4 12 14l-3-3" />
          </Icon>
          {tCount(t, 'day.allDone', total, { n: total })}
        </div>
      )}

      {/* a ordem do dia */}
      <div className="flex flex-none items-baseline justify-between gap-3 px-5 pb-1 pt-4">
        <h3 className="m-0 text-sm font-semibold">{t('day.order')}</h3>
        <span
          data-testid="day-progress"
          title={t('day.logNote')}
          className="text-xs tabular-nums text-slate-400"
        >
          {[
            t('day.doneOf', { done: nDone, total }),
            left > 0 ? tCount(t, 'day.left', left, { n: left }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {usefulS && (
        <div className="flex flex-none flex-wrap items-center gap-x-3.5 gap-y-1 px-5 pb-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-3.5 rounded-full bg-sky-400" />
            {t('day.legendBlock')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-3.5 rounded-full bg-sky-200" />
            {t('day.legendTransit')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-0.5 rounded-sm bg-[#B7791F]" />
            {t('day.legendLimit', { p: Math.round(OPS_NEAR_FRAC * 100) })}
          </span>
          <span>
            {t('day.legendScale', { u: useful })}
            {estimated ? ` ${t('day.estimated')}` : ''}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-800">
        <table
          aria-label={t('day.list')}
          className="w-full table-fixed border-collapse text-[13px] tabular-nums"
        >
          <colgroup>
            <col className="w-[54px]" />
            <col className="w-[112px]" />
            <col className="w-[54px]" />
            <col />
            <col className="w-[90px]" />
            <col className="w-[52px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead className="sticky top-0 z-[1] bg-sunken text-[11.5px] text-slate-400">
            <tr className="h-[30px]">
              <th scope="col" className="pl-2.5 text-center font-normal">
                {t('day.col.done')}
              </th>
              <th scope="col" className="pl-3 text-left font-normal">
                {t('day.col.base')}
              </th>
              <th scope="col" className="pl-2 text-left font-normal">
                {t('day.col.flight')}
              </th>
              <th scope="col" className="truncate pl-2 text-left font-normal">
                {t('day.col.bar', { u: useful })}
              </th>
              <th scope="col" className="pr-1 text-right font-normal">
                {t('day.col.time')}
              </th>
              <th scope="col" className="pr-1 text-right font-normal">
                {t('day.col.pct')}
              </th>
              <th scope="col" className="pr-5 text-right font-normal">
                {t('day.col.vlos')}
              </th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f) => (
              <FlightRow
                key={f.blockId}
                flight={f}
                done={done.has(f.label)}
                isNext={next?.blockId === f.blockId}
                focused={focusId === f.blockId}
                longest={ops?.flights > 1 && f.label === longest?.label}
                worst={f.worstVlosM != null && f.worstVlosM === worstVlos && worstVlos > 0}
                usefulS={usefulS}
                vlosM={vlosM}
                onToggle={() => onToggle(f.label)}
                onShow={() => onShow(f.blockId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* o total do dia */}
      <div className="flex flex-none flex-col gap-1 border-t border-slate-700 bg-sunken px-5 pb-3 pt-2.5">
        <div className="flex items-baseline justify-between gap-3 tabular-nums">
          <span className="text-[13.5px] font-semibold">{t('day.dayTotal')}</span>
          <span data-testid="day-total-line" className="text-right text-[13.5px] text-slate-200">
            {flightsText} · {setsText} ·{' '}
            <strong className="font-semibold text-slate-100">{fmtTime(ops?.totalS)}</strong>{' '}
            {t('day.withTransit')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs leading-[1.45] text-slate-400">
            {t('day.totalNote', { v: vlosM ?? '—' })}
          </span>
          <LinkButton
            onClick={onAdjustUseful}
            title={t('day.adjustUsefulTitle')}
            className="h-8 flex-none px-0.5"
          >
            {t('day.adjustUseful')}
          </LinkButton>
        </div>
      </div>
    </aside>
  )
}

/** O voo seguinte: a base, o voo, o tempo, a zona, e «Ver no mapa» e «Marcar feito». */
function NextFlight({ flight: f, usefulS, onShow, onMark }) {
  const t = useT()
  const vars = { base: f.base.label, flight: f.label }
  const zone = zoneLine(t, f.base)
  const line = [
    t('day.minTransit', { min: minutes(f.totalS) }),
    usefulS && f.pctUseful != null ? t('day.pctBattery', { p: f.pctUseful }) : null,
    f.worstVlosM != null ? t('day.vlos', { v: Math.round(f.worstVlosM) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section
      data-testid="day-next"
      data-flight={f.label}
      aria-labelledby="day-next-title"
      className="mx-5 mt-2.5 grid flex-none grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 rounded-[10px] border border-[#2C4A68] bg-[#0F2438] py-3 pl-3.5 pr-3"
    >
      <BaseBadge
        base={f.base}
        className="row-span-2 mt-0.5 h-[34px] w-[34px] self-start text-[15px] shadow-[0_0_0_2px_#0F2438,0_0_0_3.5px_rgba(255,255,255,0.85)]"
      />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sky-300">
          {t('day.next')}
        </div>
        <h3 id="day-next-title" className="m-0 mt-px text-[15px] font-semibold">
          {t('day.nextFlight', vars)}
        </h3>
      </div>
      <button
        type="button"
        onClick={onShow}
        aria-label={t('day.showFlight', vars)}
        title={t('day.showFlight', vars)}
        className={`${buttonClass('secondary', 'field')} border-[#2C4A68] ${FOCUS}`}
      >
        <Icon>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </Icon>
        {t('day.showOnMap')}
      </button>
      <button
        type="button"
        data-testid="day-mark-next"
        onClick={onMark}
        aria-label={t('day.markFlight', vars)}
        title={t('day.markTitle', vars)}
        className={`${buttonClass('primary', 'field')} ${FOCUS}`}
      >
        <Icon d={CHECK} sw={2.4} />
        {t('day.markDone')}
      </button>
      <div className="col-[2/5] min-w-0">
        <div className="text-[12.5px] tabular-nums text-slate-200">{line}</div>
        <div className={`mt-px text-xs ${zone.tone}`}>{zone.text}</div>
      </div>
    </section>
  )
}

/** Uma linha da ordem do dia. */
function FlightRow({
  flight: f,
  done,
  isNext,
  focused,
  longest,
  worst,
  usefulS,
  vlosM,
  onToggle,
  onShow,
}) {
  const t = useT()
  const vars = { flight: f.label, base: f.base.label }
  const pct = usefulS ? (100 * f.totalS) / usefulS : null
  const level = done ? 'done' : levelOf(usefulS ? f.totalS / usefulS : null)
  // a barra contra o tempo útil: acima dele, as duas partes em proporção
  const scale = pct != null && pct > 100 ? 100 / pct : 1
  const flightW = usefulS ? (100 * f.flightS * scale) / usefulS : 0
  const transitW = usefulS ? (100 * f.transitS * scale) / usefulS : 0
  const [barBlock, barTransit] = BAR[level] ?? BAR.ok
  const extra = [
    f.areaHa != null && f.lengthM != null
      ? t('day.areaKm', { ha: f.areaHa.toFixed(1), km: (f.lengthM / 1000).toFixed(1) })
      : null,
  ].filter(Boolean)
  const vlosOver = !f.withinVlos
  return (
    <tr
      data-testid="day-row"
      data-flight={f.label}
      data-done={done ? 'true' : 'false'}
      className={`h-12 border-b border-raised ${
        isNext ? 'bg-[#0F2438]' : focused ? 'bg-[#16223A]' : ''
      } ${done ? 'text-slate-400' : 'text-slate-100'}`}
    >
      <td className="pl-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={t('day.markFlight', vars)}
          title={t('day.markTitle', vars)}
          className={`flex h-11 w-11 items-center justify-center rounded-lg text-[#04241A] transition-colors hover:bg-raised ${FOCUS}`}
        >
          <span
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-[1.5px] ${
              done ? 'border-emerald-400 bg-emerald-400' : 'border-slate-500'
            }`}
          >
            {done && <Icon d={CHECK} size={14} sw={3} />}
          </span>
        </button>
      </td>
      <td className="pl-1">
        {/* o nome é o que se lê (a base e os conjuntos); «Ver no mapa: voo …» é
            a descrição e a dica */}
        <button
          type="button"
          onClick={onShow}
          title={t('day.showFlight', vars)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left transition-colors hover:bg-raised ${FOCUS}`}
        >
          <BaseBadge base={f.base} done={done} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">
              {t('bases.label', { label: f.base.label })}
            </span>
            <span className="truncate text-[11.5px] text-slate-400">
              {tCount(t, 'day.setsN', f.base.flights?.length ?? 1, {
                n: f.base.flights?.length ?? 1,
              })}
            </span>
          </span>
        </button>
      </td>
      <td className="pl-2 font-semibold">{f.label}</td>
      <td className="px-2">
        <span className="flex min-w-0 flex-col justify-center gap-[5px]">
          {pct != null && (
            <span
              role="img"
              aria-label={t('day.barLabel', {
                flight: f.label,
                min: minutes(f.totalS),
                p: Math.round(pct),
              })}
              className="relative flex h-2 rounded-full bg-slate-800"
            >
              <span
                className={`h-2 rounded-l-full ${barBlock}`}
                style={{ width: `${flightW.toFixed(2)}%` }}
              />
              <span
                className={`h-2 rounded-r-full ${barTransit}`}
                style={{ width: `${transitW.toFixed(2)}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute -top-[3px] h-3.5 w-0.5 rounded-sm bg-[#B7791F]"
                style={{ left: `${Math.round(OPS_NEAR_FRAC * 100)}%` }}
              />
            </span>
          )}
          <span className="truncate whitespace-nowrap text-[11.5px] text-slate-400">
            {extra.join(' · ')}
            {longest && (
              <span className="text-sky-300">
                {extra.length ? ' · ' : ''}
                {t('day.longestNote')}
              </span>
            )}
          </span>
        </span>
      </td>
      <td className="pr-1 text-right">
        <span className="flex flex-col items-end leading-tight">
          <span>{minutes(f.totalS)} min</span>
          <span className="text-[11.5px] text-slate-400">
            {t('day.transit', { min: minutes(f.transitS) })}
          </span>
        </span>
      </td>
      <td className="pr-1 text-right">{f.pctUseful != null ? `${f.pctUseful} %` : '—'}</td>
      <td
        className={`pr-5 text-right ${worst ? 'font-semibold' : ''} ${vlosOver ? 'text-amber-300' : ''}`}
        title={vlosOver && vlosM ? t('day.vlosOver', { v: vlosM }) : undefined}
      >
        {f.worstVlosM != null ? `${Math.round(f.worstVlosM)} m` : '—'}
      </td>
    </tr>
  )
}
