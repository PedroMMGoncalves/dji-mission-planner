import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
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
import { IconChevronDown, IconClose } from './Icons.jsx'
import NumberInput from './NumberInput.jsx'
import { Field, fieldBox, fieldInput } from './ui/Field.jsx'
import { Section } from './ui/Section.jsx'

/**
 * Painéis em secções: uma coluna de secções numeradas pela ordem do
 * trabalho, cada uma com o essencial e, fechada, o resumo numa linha; o
 * resto dos controlos de uma secção está na sua gaveta («Mais opções ›»). A
 * gaveta abre ao lado do painel, por cima do mapa (num ecrã estreito, por
 * cima de tudo), com uma seta para o botão que a abriu; só há uma aberta de
 * cada vez, fecha no ✕ e com Escape, e o foco entra nela ao abrir e volta ao
 * botão que a abriu ao fechar. As gavetas fechadas continuam montadas
 * (escondidas): os campos guardam o que se estava a escrever.
 */

/**
 * Coluna de um painel de modo (o contentor que rola): 360 px a partir de
 * 1024 px de largura, ao lado dos 64 px da barra dos modos. Com `title`, o
 * painel do desenho novo (o da área): por cima, o nome do modo e uma linha a
 * dizer para que serve (`subtitle`), o fundo do painel e as secções mais
 * juntas; sem ele, a coluna de cartões dos outros modos, como estava.
 * @param {{children?: any, label: string, title?: any, subtitle?: any,
 *   testId?: string}} props
 */
export function CardColumn({ children, label, title = null, subtitle = null, testId }) {
  return (
    <div
      role="region"
      aria-label={label}
      data-testid={testId}
      className={`flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 lg:w-[360px] ${
        title != null ? 'gap-2 bg-panel px-3 pb-6 pt-3.5' : 'gap-3 bg-slate-950 p-3'
      }`}
    >
      {title != null && (
        <div className="px-1 pb-2 pt-0.5">
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-100">{title}</h2>
          {subtitle != null && <p className="mt-0.5 text-[12.5px] text-slate-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Gaveta aberta e a parte dela que o botão pediu (um grupo, ex.: os pontos
 * de inspecção da gaveta dos Extras): os grupos de uma gaveta lêem-na para
 * se abrirem e ficarem à vista.
 */
const DrawerContext = createContext({ part: /** @type {string|null} */ (null), reveal: 0 })

/**
 * Estado das gavetas de um painel: qual está aberta (e que parte dela),
 * abrir/fechar, e o botão «Mais opções» de cada secção. Fechada a gaveta,
 * o foco volta ao botão que a abriu, se não foi para outro lado.
 */
export function useDrawers() {
  // id: a gaveta aberta; part: o grupo que o botão pediu; reveal: conta as
  // aberturas, para o grupo pedido se mostrar de novo
  const [state, setState] = useState({ id: null, part: null, reveal: 0 })
  const openerRef = useRef(/** @type {HTMLElement|null} */ (null))
  const close = useCallback(() => setState((s) => ({ ...s, id: null, part: null })), [])
  /** Abre (ou fecha, se já está aberta nessa parte) a gaveta `id`. */
  const toggle = useCallback((id, opener = null, part = null) => {
    openerRef.current = opener
    setState((s) =>
      s.id === id && s.part === part
        ? { ...s, id: null, part: null }
        : { id, part, reveal: s.reveal + 1 },
    )
  }, [])
  const open = state.id
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
  // a gaveta fechou: o foco volta ao botão que a abriu (se não foi para
  // outro lado — outra gaveta, um campo no mapa)
  const wasOpen = useRef(/** @type {string|null} */ (null))
  useEffect(() => {
    const was = wasOpen.current
    wasOpen.current = open
    if (!was || open) return
    const a = document.activeElement
    if (!a || a === document.body || document.getElementById(`drawer-${was}`)?.contains(a))
      openerRef.current?.focus()
  }, [open])
  /** Propriedades do botão «Mais opções» da secção `id` (`part`: o grupo que ele abre). */
  const more = (id, part = null) => ({
    expanded: open === id && state.part === part,
    onToggle: (e) => toggle(id, e?.currentTarget ?? null, part),
  })
  /** Propriedades da gaveta da secção `id`. */
  const drawer = (id) => ({
    open: open === id,
    onClose: close,
    part: open === id ? state.part : null,
    reveal: state.reveal,
  })
  return { open, close, more, drawer }
}

/**
 * Caixas que fecham dentro das secções de um painel (SubSection; no da área,
 * as acções de segurança), fora do acordeão das secções (ui/useAccordion.js):
 * cada uma fica aberta ou fechada como o operador a deixou, neste aparelho
 * (`key` no localStorage, um objecto id → aberta); sem escolha, fechada.
 * @param {string} key
 */
export function useSubSections(key) {
  const [chosen, setChosen] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  useEffect(() => {
    if (Object.keys(chosen).length === 0) return
    try {
      localStorage.setItem(key, JSON.stringify(chosen))
    } catch {
      /* sem armazenamento: fica só nesta sessão */
    }
  }, [key, chosen])
  return {
    isOpen: (id) => chosen[id] === true,
    toggle: (id) => setChosen((c) => ({ ...c, [id]: c[id] !== true })),
  }
}

/**
 * Chama `onSignal` quando `signal` muda para um valor verdadeiro (um erro
 * novo, um modo do mapa que mostra campos numa secção), no próprio render.
 * @param {any} signal
 * @param {() => void} onSignal
 */
export function useOnSignal(signal, onSignal) {
  const now = signal || null
  const [seen, setSeen] = useState(null)
  if (now !== seen) {
    setSeen(now)
    if (now) onSignal()
  }
}

/**
 * Cartão numerado: título, o essencial e, com `more`, o botão «Mais opções ›»
 * que abre a gaveta `drawer-<id>`. Sem `n`, sem número (a aeronave e o sensor
 * no topo dos outros modos, antes do trabalho numerado).
 */
export function Card({ id, n = null, title, children, more = null }) {
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
        {n != null && (
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-mono text-xs text-sky-300"
          >
            {n}
          </span>
        )}
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
 * Gaveta lateral da secção `id`: ao lado do painel e por cima do mapa, com o
 * número e o nome da secção (`n`, `title`) e uma seta que aponta para o
 * botão que a abriu; num ecrã estreito ocupa a largura do painel, por cima
 * dele. Escondida quando fechada, mas montada. `part` e `reveal` (de
 * useDrawers) dizem aos grupos qual deles o botão pediu.
 * @param {{id: string, n?: number|null, title: any, open: boolean,
 *   onClose: () => void, part?: string|null, reveal?: number, children?: any}} props
 */
export function Drawer({ id, n = null, title, open, onClose, part = null, reveal = 0, children }) {
  const t = useT()
  const closeRef = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const asideRef = useRef(/** @type {HTMLElement|null} */ (null))
  const arrowRef = useRef(/** @type {HTMLSpanElement|null} */ (null))
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])
  // a seta acompanha o botão que abriu a gaveta quando o painel rola; com
  // ele fora da vista (ou a secção fechada), desaparece
  useEffect(() => {
    if (!open) return
    const place = () => {
      const aside = asideRef.current
      const arrow = arrowRef.current
      if (!aside || !arrow) return
      const btn = document.querySelector(`[aria-controls="drawer-${id}"][aria-expanded="true"]`)
      const a = aside.getBoundingClientRect()
      const b = btn?.getBoundingClientRect()
      const y = b && b.height > 0 ? b.top + b.height / 2 - a.top : -1
      arrow.style.top = `${Math.round(y - 6)}px`
      arrow.style.visibility = y >= 16 && y <= a.height - 16 ? 'visible' : 'hidden'
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [open, id, part])
  return (
    <aside
      ref={asideRef}
      id={`drawer-${id}`}
      data-testid={`drawer-${id}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`drawer-${id}-title`}
      hidden={!open}
      className={`${
        open ? 'flex' : 'hidden'
      } absolute inset-y-0 left-0 z-[1100] w-full max-w-sm flex-col border-r border-slate-700 bg-panel shadow-[16px_0_40px_rgba(0,0,0,0.5)] sm:left-full sm:w-80 sm:border-l sm:border-l-[#2C4A68] lg:w-[380px]`}
    >
      <span
        ref={arrowRef}
        aria-hidden="true"
        className="invisible absolute -left-[7px] hidden h-3 w-3 rotate-45 border-b border-l border-[#2C4A68] bg-panel sm:block"
      />
      <div className="flex items-center gap-2.5 border-b border-slate-800 py-[11px] pl-3.5 pr-2.5">
        {n != null && (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sky-400 text-xs font-semibold text-[#06202E]"
          >
            {n}
          </span>
        )}
        <h2
          id={`drawer-${id}-title`}
          className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight text-slate-100"
        >
          {title}
          {/* o nome da gaveta lê-se «Parâmetros de voo: mais opções» */}
          <span className="sr-only">: </span>
          <span className="mt-px block text-[12.5px] font-normal tracking-normal text-slate-400">
            {t('cards.drawerSub')}
          </span>
        </h2>
        <kbd
          aria-hidden="true"
          className="inline-flex h-[22px] items-center rounded-[5px] border border-b-2 border-[#2C3A55] bg-surface px-1.5 font-sans text-[11.5px] font-semibold text-slate-300"
        >
          Esc
        </kbd>
        <button
          type="button"
          ref={closeRef}
          onClick={onClose}
          aria-label={t('cards.close', { title })}
          title={t('cards.closeTitle')}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-raised hover:text-slate-100"
        >
          <IconClose className="h-[18px] w-[18px]" />
        </button>
      </div>
      <DrawerContext.Provider value={{ part, reveal }}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5">
          {children}
        </div>
      </DrawerContext.Provider>
    </aside>
  )
}

/**
 * Um grupo de uma gaveta: uma secção que fecha, com o resumo numa linha
 * (aberta por omissão, ou não com `defaultOpen`). Com `part`, abre-se e fica
 * à vista quando a gaveta é aberta pelo botão que pede essa parte.
 * @param {{title: any, summary?: any, part?: string|null, defaultOpen?: boolean,
 *   testId?: string, children?: any}} props
 */
export function DrawerGroup({
  title,
  summary = null,
  part = null,
  defaultOpen = true,
  testId,
  children = null,
}) {
  const { part: wanted, reveal } = useContext(DrawerContext)
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  // pedido por um botão: aberto, sem esperar por um efeito
  const ask = part != null && wanted === part ? reveal : 0
  const [asked, setAsked] = useState(ask)
  if (ask !== asked) {
    setAsked(ask)
    if (ask) setOpen(true)
  }
  useEffect(() => {
    if (ask) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [ask])
  return (
    <div ref={ref} className="shrink-0">
      <Section
        title={title}
        summary={summary}
        summaryOpen
        open={open}
        onToggle={() => setOpen((v) => !v)}
        testId={testId}
      >
        {children}
      </Section>
    </div>
  )
}

/**
 * Caixa que fecha dentro de uma secção (as acções de segurança, as bacias
 * de visão): um ícone, o nome e o resumo numa linha. Aberta por fora
 * (`open`, `onToggle`) ou por si (`defaultOpen`).
 * @param {{icon?: any, title: any, summary?: any, open?: boolean,
 *   onToggle?: () => void, defaultOpen?: boolean, testId?: string, children?: any}} props
 */
export function SubSection({
  icon = null,
  title,
  summary = null,
  open,
  onToggle,
  defaultOpen = false,
  testId,
  children = null,
}) {
  const id = useId()
  const [own, setOwn] = useState(defaultOpen)
  const isOpen = open ?? own
  const toggle = onToggle ?? (() => setOwn((v) => !v))
  return (
    <section
      data-testid={testId}
      className="shrink-0 overflow-hidden rounded-[9px] border border-slate-800"
    >
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${id}-body`}
          aria-labelledby={`${id}-title`}
          aria-describedby={summary ? `${id}-summary` : undefined}
          onClick={toggle}
          className="flex min-h-[52px] w-full items-center gap-2.5 bg-sunken px-3 py-2 text-left transition-colors hover:bg-raised"
        >
          {icon}
          <span className="min-w-0 flex-1">
            <span id={`${id}-title`} className="block text-[13.5px] font-semibold text-slate-100">
              {title}
            </span>
            {summary && (
              <span id={`${id}-summary`} className="mt-0.5 block truncate text-xs text-slate-400">
                {summary}
              </span>
            )}
          </span>
          <IconChevronDown
            className={`h-4 w-4 flex-none text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </h4>
      <div
        id={`${id}-body`}
        hidden={!isOpen}
        className={`${isOpen ? 'flex' : 'hidden'} flex-col gap-3 border-t border-slate-800 p-3`}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * Um <select> com o aspecto dos campos: dentro de um Field (ou de uma caixa
 * `fieldBox`), sem a seta do browser, com a do desenho por cima da margem
 * direita (SelectChevron como `unit`), e as opções em fundo escuro.
 */
export const selectInput =
  'h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-field pr-6 text-[13px] font-medium text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-40'

/** A seta de um select (`unit` do Field): os cliques passam para o select. */
export function SelectChevron() {
  return <IconChevronDown className="pointer-events-none -ml-6 h-4 w-4 flex-none text-slate-400" />
}

/**
 * Um <select> com a caixa e a seta dos campos, sem rótulo visível (o nome
 * vem de `aria-label`). As propriedades passam ao <select>.
 * @param {{className?: string, children?: any} & Record<string, any>} props
 */
export function SelectBox({ className = '', children = null, ...rest }) {
  return (
    <span className={`${fieldBox} ${className}`}>
      <select {...rest} className={selectInput}>
        {children}
      </select>
      <SelectChevron />
    </span>
  )
}

/**
 * Acções de segurança da missão (src/mission/safety.js): no fim da missão e
 * com o sinal do comando perdido, e as alturas de descolagem e de regresso.
 * Saem no missionConfig do KMZ de todos os modos.
 */
export function SafetyActions({ safety, onChange }) {
  const t = useT()
  const s = { ...DEFAULT_SAFETY, ...(safety ?? {}) }
  const set = (key, value) => onChange({ ...s, [key]: value })
  const stopped = s.exitOnRCLost === 'executeLostAction'
  return (
    <div data-testid="safety-actions" className="flex flex-col gap-3">
      <Field label={t('safety.finish')} unit={<SelectChevron />} hint={t('safety.finishHint')}>
        <select
          data-testid="safety-finish"
          value={s.finishAction}
          onChange={(e) => set('finishAction', e.target.value)}
          className={selectInput}
        >
          {FINISH_ACTIONS.map((v) => (
            <option key={v} value={v}>
              {t(`safety.finish.${v}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={t('safety.rcLost')}
        unit={<SelectChevron />}
        hint={
          <span className={stopped ? '' : 'text-amber-300'}>
            {t(stopped ? 'safety.rcLostHint' : 'safety.rcLostContinueHint')}
          </span>
        }
      >
        <select
          data-testid="safety-rc-lost"
          value={s.exitOnRCLost}
          onChange={(e) => set('exitOnRCLost', e.target.value)}
          className={selectInput}
        >
          {RC_LOST_MODES.map((v) => (
            <option key={v} value={v}>
              {t(`safety.rcLost.${v}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={t('safety.rcLostAction')}
        unit={<SelectChevron />}
        hint={t('safety.rcLostActionHint')}
      >
        <select
          data-testid="safety-rc-action"
          value={s.executeRCLostAction}
          disabled={!stopped}
          onChange={(e) => set('executeRCLostAction', e.target.value)}
          className={selectInput}
        >
          {RC_LOST_ACTIONS.map((v) => (
            <option key={v} value={v}>
              {t(`safety.rcAction.${v}`)}
            </option>
          ))}
        </select>
      </Field>
      {/* alturas escritas no missionConfig: vazio = automática */}
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label={t('safety.takeoffHeight')} unit="m">
          <NumberInput
            testId="safety-takeoff-height"
            className={fieldInput}
            allowEmpty
            value={s.takeOffSecurityHeightM ?? null}
            placeholder={String(DEFAULT_TAKEOFF_SECURITY_HEIGHT_M)}
            min={MIN_TAKEOFF_SECURITY_HEIGHT_M}
            max={MAX_TAKEOFF_SECURITY_HEIGHT_M}
            onChange={(v) => set('takeOffSecurityHeightM', v)}
          />
        </Field>
        <Field label={t('safety.rthHeight')} unit="m">
          <NumberInput
            testId="safety-rth-height"
            className={fieldInput}
            allowEmpty
            value={s.rthHeightM ?? null}
            placeholder={t('safety.auto')}
            min={MIN_RTH_HEIGHT_M}
            max={MAX_RTH_HEIGHT_M}
            step={5}
            onChange={(v) => set('rthHeightM', v)}
          />
        </Field>
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
    <p data-testid="safety-rth" className="text-[12.5px] leading-relaxed text-slate-200">
      {t('safety.rth', { rth: rthRangeLabel(info), takeoff: info.takeoffM })}
      <span className="mt-0.5 block text-xs text-slate-400">{t('safety.rthHint')}</span>
    </p>
  )
}
