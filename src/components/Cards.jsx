import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { rthRangeLabel } from '../mission/transitLegs.js'
import {
  DEFAULT_SAFETY,
  FINISH_ACTIONS,
  MIN_RTH_HEIGHT_M,
  RC_LOST_ACTIONS,
  RC_LOST_MODES,
} from '../mission/safety.js'
import {
  DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
  MAX_RTH_HEIGHT_M,
  MAX_TAKEOFF_SECURITY_HEIGHT_M,
  MIN_TAKEOFF_SECURITY_HEIGHT_M,
} from '../utils/exporters.js'
import NumberInput from './NumberInput.jsx'

/**
 * Painéis em cartões: uma coluna de cartões numerados pela ordem do
 * trabalho, cada um só com o essencial, e uma gaveta lateral por cartão
 * («Mais opções ›») com o resto dos controlos. A gaveta abre ao lado do
 * painel, por cima do mapa (num ecrã estreito, por cima de tudo); só há uma
 * aberta de cada vez, fecha no ✕ e com Escape, e o foco entra nela ao abrir
 * e volta ao botão que a abriu ao fechar. As gavetas fechadas continuam
 * montadas (escondidas): os campos guardam o que se estava a escrever.
 */

/** Coluna de cartões de um painel de modo (o contentor que rola). */
export function CardColumn({ children, label }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="flex h-full w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-800 bg-slate-950 p-3 lg:w-96"
    >
      {children}
    </div>
  )
}

/**
 * Estado das gavetas de um painel: qual está aberta, abrir/fechar, e o botão
 * «Mais opções» de cada cartão (para o foco voltar a ele).
 */
export function useDrawers() {
  const [open, setOpen] = useState(null)
  const close = useCallback(() => setOpen(null), [])
  const toggle = useCallback((id) => setOpen((cur) => (cur === id ? null : id)), [])
  // Escape fecha a gaveta aberta (um diálogo modal por cima trata do seu)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
  /** Propriedades do botão «Mais opções» do cartão `id`. */
  const more = (id) => ({ expanded: open === id, onToggle: () => toggle(id) })
  /** Propriedades da gaveta do cartão `id`. */
  const drawer = (id) => ({ open: open === id, onClose: close })
  return { open, close, more, drawer }
}

/**
 * Cartão numerado: título, o essencial e, com `more`, o botão «Mais opções ›»
 * que abre a gaveta `drawer-<id>`.
 */
export function Card({ id, n, title, children, more = null }) {
  const t = useT()
  const buttonRef = useRef(null)
  const wasOpen = useRef(false)
  const expanded = Boolean(more?.expanded)
  // a gaveta fechou: o foco volta ao botão que a abriu (se não foi para
  // outro lado — outra gaveta, um campo no mapa)
  useEffect(() => {
    if (wasOpen.current && !expanded) {
      const a = document.activeElement
      if (!a || a === document.body || document.getElementById(`drawer-${id}`)?.contains(a))
        buttonRef.current?.focus()
    }
    wasOpen.current = expanded
  }, [expanded, id])
  return (
    <section
      data-testid={`card-${id}`}
      aria-labelledby={`card-${id}-title`}
      className="shrink-0 rounded-lg border border-slate-800 bg-slate-900/40"
    >
      <h2
        id={`card-${id}-title`}
        className="flex items-center gap-2 px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-widest text-sky-400"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-mono text-xs text-sky-300"
        >
          {n}
        </span>
        <span>{title}</span>
      </h2>
      <div className="px-3 pb-3">
        {children}
        {more && (
          <button
            type="button"
            ref={buttonRef}
            data-testid={`card-more-${id}`}
            aria-expanded={expanded}
            aria-controls={`drawer-${id}`}
            aria-label={t('cards.moreFor', { title })}
            onClick={more.onToggle}
            className={`mt-3 flex min-h-[44px] w-full items-center justify-between rounded border px-3 text-sm font-medium transition-colors ${
              expanded
                ? 'border-sky-600 bg-sky-950/50 text-sky-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-600 hover:text-sky-200'
            }`}
          >
            <span>{t('cards.more')}</span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Gaveta lateral do cartão `id`: ao lado do painel e por cima do mapa; num
 * ecrã estreito ocupa a largura do painel, por cima dele. Escondida quando
 * fechada, mas montada.
 */
export function Drawer({ id, title, open, onClose, children }) {
  const t = useT()
  const closeRef = useRef(null)
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])
  return (
    <aside
      id={`drawer-${id}`}
      data-testid={`drawer-${id}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`drawer-${id}-title`}
      hidden={!open}
      className={`${
        open ? 'flex' : 'hidden'
      } absolute inset-y-0 left-0 z-[1100] w-full max-w-sm flex-col border-r border-slate-700 bg-slate-950 shadow-2xl shadow-black/60 sm:left-full sm:w-80 lg:w-96`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <h2
          id={`drawer-${id}-title`}
          className="text-xs font-semibold uppercase tracking-widest text-sky-400"
        >
          {t('cards.drawerTitle', { title })}
        </h2>
        <button
          type="button"
          ref={closeRef}
          onClick={onClose}
          aria-label={t('cards.close', { title })}
          title={t('cards.closeTitle')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  )
}

/** Subtítulo de um grupo dentro de uma gaveta. */
export function DrawerGroup({ title, children }) {
  return (
    <div className="mb-4 border-b border-slate-800 pb-4 last:mb-0 last:border-b-0 last:pb-0">
      {title && (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

/** Campo das alturas de segurança (vazio = automática). */
const HEIGHT_INPUT =
  'w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

/**
 * Acções de segurança da missão (src/mission/safety.js): no fim da missão e
 * com o sinal do comando perdido. Saem no missionConfig do KMZ de todos os
 * modos.
 */
export function SafetyActions({ safety, onChange }) {
  const t = useT()
  const s = { ...DEFAULT_SAFETY, ...(safety ?? {}) }
  const set = (key, value) => onChange({ ...s, [key]: value })
  const select =
    'w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-40'
  const stopped = s.exitOnRCLost === 'executeLostAction'
  return (
    <div data-testid="safety-actions" className="space-y-3 text-sm text-slate-300">
      <div>
        <label htmlFor="safety-finish" className="mb-1 block">
          {t('safety.finish')}
        </label>
        <select
          id="safety-finish"
          data-testid="safety-finish"
          aria-describedby="safety-finish-hint"
          value={s.finishAction}
          onChange={(e) => set('finishAction', e.target.value)}
          className={select}
        >
          {FINISH_ACTIONS.map((v) => (
            <option key={v} value={v}>
              {t(`safety.finish.${v}`)}
            </option>
          ))}
        </select>
        <p id="safety-finish-hint" className="mt-1 text-xs leading-relaxed text-slate-400">
          {t('safety.finishHint')}
        </p>
      </div>
      <div>
        <label htmlFor="safety-rc-lost" className="mb-1 block">
          {t('safety.rcLost')}
        </label>
        <select
          id="safety-rc-lost"
          data-testid="safety-rc-lost"
          aria-describedby="safety-rc-lost-hint"
          value={s.exitOnRCLost}
          onChange={(e) => set('exitOnRCLost', e.target.value)}
          className={select}
        >
          {RC_LOST_MODES.map((v) => (
            <option key={v} value={v}>
              {t(`safety.rcLost.${v}`)}
            </option>
          ))}
        </select>
        <p
          id="safety-rc-lost-hint"
          className={`mt-1 text-xs leading-relaxed ${stopped ? 'text-slate-400' : 'text-amber-300'}`}
        >
          {t(stopped ? 'safety.rcLostHint' : 'safety.rcLostContinueHint')}
        </p>
      </div>
      <div>
        <label htmlFor="safety-rc-action" className="mb-1 block">
          {t('safety.rcLostAction')}
        </label>
        <select
          id="safety-rc-action"
          data-testid="safety-rc-action"
          aria-describedby="safety-rc-action-hint"
          value={s.executeRCLostAction}
          disabled={!stopped}
          onChange={(e) => set('executeRCLostAction', e.target.value)}
          className={select}
        >
          {RC_LOST_ACTIONS.map((v) => (
            <option key={v} value={v}>
              {t(`safety.rcAction.${v}`)}
            </option>
          ))}
        </select>
        <p id="safety-rc-action-hint" className="mt-1 text-xs leading-relaxed text-slate-400">
          {t('safety.rcLostActionHint')}
        </p>
      </div>
      {/* alturas escritas no missionConfig: vazio = automática */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-300">
          <span className="mb-1 block">{t('safety.takeoffHeight')}</span>
          <span className="flex items-center gap-1">
            <NumberInput
              testId="safety-takeoff-height"
              className={HEIGHT_INPUT}
              allowEmpty
              value={s.takeOffSecurityHeightM ?? null}
              placeholder={String(DEFAULT_TAKEOFF_SECURITY_HEIGHT_M)}
              min={MIN_TAKEOFF_SECURITY_HEIGHT_M}
              max={MAX_TAKEOFF_SECURITY_HEIGHT_M}
              onChange={(v) => set('takeOffSecurityHeightM', v)}
            />
            m
          </span>
        </label>
        <label className="block text-xs text-slate-300">
          <span className="mb-1 block">{t('safety.rthHeight')}</span>
          <span className="flex items-center gap-1">
            <NumberInput
              testId="safety-rth-height"
              className={HEIGHT_INPUT}
              allowEmpty
              value={s.rthHeightM ?? null}
              placeholder={t('safety.auto')}
              min={MIN_RTH_HEIGHT_M}
              max={MAX_RTH_HEIGHT_M}
              step={5}
              onChange={(v) => set('rthHeightM', v)}
            />
            m
          </span>
        </label>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">{t('safety.heightsHint')}</p>
    </div>
  )
}

/**
 * Altura de regresso (RTH) e subida de descolagem escritas no KMZ (M3-U3):
 * nenhum ecrã as mostrava, e a checklist mandava «confirmar o RTH».
 */
export function RthLine({ info }) {
  const t = useT()
  if (!info) return null
  return (
    <p data-testid="safety-rth" className="mt-2 text-xs leading-relaxed text-slate-300">
      {t('safety.rth', { rth: rthRangeLabel(info), takeoff: info.takeoffM })}
      <span className="block text-slate-400">{t('safety.rthHint')}</span>
    </p>
  )
}

/** Cartão das acções de segurança dos painéis dos outros modos. */
export function SafetyCard({ id = 'seguranca', n, safety, onChange, rthInfo = null }) {
  const t = useT()
  return (
    <Card id={id} n={n} title={t('safety.title')}>
      <SafetyActions safety={safety} onChange={onChange} />
      <RthLine info={rthInfo} />
    </Card>
  )
}

/**
 * Descolagem da face ou da órbita (src/mission/takeoffRef.js): no chão do
 * alvo, como sempre, ou numa base do projecto, com as alturas exportadas
 * convertidas pela diferença de cotas.
 */
export function TakeoffSelect({
  value,
  onChange,
  bases = [],
  takeoff = null,
  targetLabel,
  targetHint,
  testId = 'takeoff',
}) {
  const t = useT()
  const signed = (v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))
  return (
    <div className="mt-2" data-testid={testId}>
      <label htmlFor={`${testId}-select`} className="mb-1 block text-sm text-slate-300">
        {t('takeoff.label')}
      </label>
      <select
        id={`${testId}-select`}
        data-testid={`${testId}-select`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
      >
        <option value="">{targetLabel}</option>
        {bases.map((b) => (
          <option key={b.id} value={b.id}>
            {t('takeoff.base', { label: b.label })}
          </option>
        ))}
      </select>
      {takeoff?.error ? (
        <p className="mt-1 text-xs leading-relaxed text-red-300">
          ⚠ {t(`takeoff.err.${takeoff.error}`)}
        </p>
      ) : takeoff?.mode === 'base' ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {t('takeoff.baseHint', {
            base: takeoff.base?.label ?? '',
            dh: signed(takeoff.dh),
            elev: Number.isFinite(takeoff.baseElev) ? Math.round(takeoff.baseElev) : '—',
          })}
        </p>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{targetHint}</p>
      )}
    </div>
  )
}
