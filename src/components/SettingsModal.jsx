/**
 * Configuração: o equipamento da equipa por aeronave (alcance visual, tipos
 * de bateria com o tempo útil por conjunto e quantos conjuntos há), os
 * valores por omissão da zona de descolagem e as alturas do piloto. O
 * estado vive no App (e no localStorage); aqui só se edita, com as funções
 * puras de mission/equipment.js. Quatro secções com um índice à esquerda
 * (aeronaves e baterias, zona de descolagem, piloto, ficheiro e dados): as
 * escondidas ficam montadas, com o que se estava a escrever. Exportar e
 * Importar levam a configuração para outro computador; Repor volta aos
 * valores por omissão, com confirmação.
 */
import { useEffect, useRef, useState } from 'react'
import { AIRCRAFT, aircraftLabel } from '../data/drones.js'
import {
  EQUIPMENT_LIMITS,
  addBattery,
  aircraftEquipmentFor,
  batteryLabel,
  defaultEquipment,
  equipmentFromJson,
  equipmentToJson,
  normalizeEquipment,
  removeBattery,
  setDefaultBattery,
  updateAircraftEquipment,
  updateBattery,
} from '../mission/equipment.js'
import { downloadBlob } from '../utils/exporters.js'
import { useT } from '../i18n.jsx'
import { errorInfo, errorText } from '../utils/appError.js'
import { clearTileCache } from '../utils/tileCache.js'
import {
  IconCheck,
  IconCheckCircle,
  IconDownload,
  IconDrone,
  IconGear,
  IconHelipad,
  IconTrash,
  IconWarning,
} from './Icons.jsx'
import { Icon } from './MapOverlay.jsx'
import { buttonClass } from './ui/Button.jsx'
import { fieldBox, fieldInput } from './ui/Field.jsx'
import { BACKDROP, CloseIconButton, WINDOW, WindowHeader, useDialogFocus } from './ui/Window.jsx'

export const EQUIPMENT_FILE_NAME = 'equipamento-dji-mission-planner.json'

/** Cartão de uma secção (os campos e os esquemas). */
const CARD = 'rounded-[10px] border border-slate-800 bg-surface'

/** O olho (piloto) e a pilha de discos (ficheiro e dados), só no índice. */
const IconEye = ({ className = '' }) => (
  <Icon size={18} sw={1.8} className={className}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
const IconData = ({ className = '' }) => (
  <Icon size={18} sw={1.8} className={className}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Icon>
)

/** As secções, pela ordem do índice. */
const SECTIONS = [
  { id: 'aircraft', title: 'set.secAircraft', desc: 'set.secAircraftDesc', icon: IconDrone },
  { id: 'zone', title: 'set.zoneTitle', desc: 'set.secZoneDesc', icon: IconHelipad },
  { id: 'pilot', title: 'set.operatorTitle', desc: 'set.secPilotDesc', icon: IconEye },
  { id: 'data', title: 'set.secData', desc: 'set.secDataDesc', icon: IconData },
]

/** O nome curto de uma aeronave no selector: sem o «DJI» nem o código entre parênteses. */
const shortName = (label) => label.replace(/^DJI\s+/, '').replace(/\s*\([^)]*\)\s*$/, '')

/**
 * Teclado de uma lista de separadores (o índice e as aeronaves): as setas
 * passam ao seguinte e ao anterior (dão a volta), Home e End às pontas; o
 * foco e a escolha andam juntos.
 * @param {string[]} ids
 * @param {string} current
 * @param {(id: string) => void} pick
 * @param {(id: string) => HTMLElement|null} el
 */
function tabKeys(ids, current, pick, el) {
  return (/** @type {import('react').KeyboardEvent} */ e) => {
    const i = ids.indexOf(current)
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? ids[(i + 1) % ids.length]
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? ids[(i - 1 + ids.length) % ids.length]
          : e.key === 'Home'
            ? ids[0]
            : e.key === 'End'
              ? ids[ids.length - 1]
              : null
    if (!next) return
    e.preventDefault()
    pick(next)
    el(next)?.focus()
  }
}

/**
 * Campo numérico com rascunho enquanto tem o foco: o valor só é gravado
 * quando é válido (dentro de `limits`), e ao sair do campo volta ao valor
 * gravado. Assim escrever "1000" não passa por "1" recortado a 50.
 * `allowEmpty`: vazio grava null (ex.: conjuntos desconhecidos).
 */
function NumField({
  id,
  value,
  onCommit,
  limits,
  step = 1,
  integer = false,
  allowEmpty = false,
  ...rest
}) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? (value == null ? '' : String(value))
  return (
    <input
      id={id}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      className={fieldInput}
      value={shown}
      min={limits.min}
      max={limits.max}
      step={step}
      onFocus={() => setDraft(shown)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        if (text.trim() === '') {
          if (allowEmpty) onCommit(null)
          return
        }
        const n = Number(text)
        if (!Number.isFinite(n) || n < limits.min || n > limits.max) return
        onCommit(integer ? Math.round(n) : n)
      }}
      {...rest}
    />
  )
}

/** Campo de texto com rascunho: grava o nome aparado e não vazio. */
function TextField({ id, value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? value
  return (
    <input
      id={id}
      type="text"
      className={`${fieldInput} font-medium`}
      value={shown}
      maxLength={40}
      onFocus={() => setDraft(shown)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = e.target.value.trim()
        if (v) onCommit(v)
      }}
      {...rest}
    />
  )
}

/**
 * Uma linha de campo: o rótulo e a explicação à esquerda, a caixa com a
 * unidade à direita (o desenho da configuração).
 */
function FieldRow({ id, label, hint, unit = null, first = false, children }) {
  return (
    <div
      className={`grid grid-cols-1 items-center gap-x-5 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_150px] ${
        first ? '' : 'border-t border-slate-800'
      }`}
    >
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-slate-100">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-[3px] text-[12.5px] leading-normal text-slate-400">
          {hint}
        </p>
      </div>
      <span className={fieldBox}>
        {children}
        {unit != null && <span className="flex-none text-[12.5px] text-slate-400">{unit}</span>}
      </span>
    </div>
  )
}

/** Mensagem de um botão da secção (importada, reposta, cache apagada, erro). */
function Status({ status }) {
  const error = status.kind === 'error'
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] leading-normal ${
        error
          ? 'border-[#7A2530] bg-[#2B1215] text-red-200'
          : 'border-[#1F5C47] bg-[#0D2A21] text-emerald-200'
      }`}
    >
      {error ? (
        <IconWarning className="mt-0.5 h-4 w-4 text-red-400" />
      ) : (
        <IconCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
      )}
      <span>{status.text}</span>
    </p>
  )
}

/** Esquema da zona de descolagem, como o mapa a desenha na base seleccionada. */
function ZoneSketch({ label }) {
  return (
    <svg role="img" aria-label={label} width="260" height="150" viewBox="0 0 260 150">
      <rect width="260" height="150" rx="8" fill="#0A1222" />
      {[146, 162, 178, 194].map((x) => (
        <path
          key={x}
          d={`M${x} 6 C ${x - 10} 46, ${x + 4} 104, ${x - 6} 144`}
          fill="none"
          stroke="#B7791F"
          strokeWidth="1.6"
        />
      ))}
      <circle
        cx="98"
        cy="75"
        r="62"
        fill="none"
        stroke="#38BDF8"
        strokeWidth="1.6"
        strokeDasharray="5 5"
      />
      <circle
        cx="98"
        cy="75"
        r="34"
        fill="#38BDF8"
        fillOpacity="0.16"
        stroke="#38BDF8"
        strokeWidth="2"
      />
      <circle cx="98" cy="75" r="11" fill="#38BDF8" stroke="#0A0F1C" strokeWidth="2" />
      <text
        x="98"
        y="79.5"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#06202E"
        fontFamily="inherit"
      >
        A
      </text>
    </svg>
  )
}

/** Esquema da linha de vista dos olhos e da zona de Fresnel do comando. */
function SightSketch({ label }) {
  return (
    <svg role="img" aria-label={label} width="280" height="150" viewBox="0 0 280 150">
      <rect width="280" height="150" rx="8" fill="#0A1222" />
      <path
        d="M0 128 C 40 126, 70 120, 100 112 C 130 104, 150 104, 175 114 C 205 126, 240 130, 280 128 L 280 150 L 0 150 Z"
        fill="#16223A"
      />
      <path
        d="M0 128 C 40 126, 70 120, 100 112 C 130 104, 150 104, 175 114 C 205 126, 240 130, 280 128"
        fill="none"
        stroke="#5B6B85"
        strokeWidth="1.5"
      />
      <ellipse
        cx="141"
        cy="71"
        rx="117"
        ry="13"
        transform="rotate(-15.6 141 71)"
        fill="#FDE047"
        fillOpacity="0.08"
        stroke="#FACC15"
        strokeWidth="1.3"
        strokeDasharray="4 3"
      />
      <path d="M28 122 V 98" stroke="#C8D2E1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="97" r="3" fill="#7DD3FC" />
      <path d="M36 123 V 103" stroke="#AEB9CC" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="36" cy="102" r="2.5" fill="#FACC15" />
      <path d="M28 97 L 252 38" stroke="#7DD3FC" strokeWidth="1.6" />
      <circle cx="254" cy="38" r="6" fill="#0A0F1C" stroke="#E6EDF7" strokeWidth="1.6" />
      <path
        d="M246 30 l -4 -4 M262 30 l 4 -4 M246 46 l -4 4 M262 46 l 4 4"
        stroke="#E6EDF7"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Uma linha da legenda de um esquema: o símbolo de 22 × 22 e o texto. */
function KeyLine({ symbol, children }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="flex-none">
        {symbol}
      </svg>
      <span>{children}</span>
    </div>
  )
}

/**
 * @param {{equipment: import('../mission/equipment.js').Equipment,
 *   setEquipment: (fn: any) => void, initialAircraftId: string, onClose: () => void}} props
 */
export default function SettingsModal({ equipment, setEquipment, initialAircraftId, onClose }) {
  const t = useT()
  const ids = Object.keys(AIRCRAFT)
  const [aircraftId, setAircraftId] = useState(
    ids.includes(initialAircraftId) ? initialAircraftId : ids[0],
  )
  const [section, setSection] = useState('aircraft')
  const [confirmRestore, setConfirmRestore] = useState(false)
  // a mensagem do último botão, na sua secção (`where`): ficheiro, repor ou cache
  const [status, setStatus] = useState(
    /** @type {{kind: string, text: string, where: string}|null} */ (null),
  )
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const boxRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const tabRef = useRef(/** @type {HTMLButtonElement|null} */ (null))
  useDialogFocus(boxRef, tabRef)

  // ao fechar, o equipamento fica normalizado (nomes aparados, limites)
  const close = () => {
    setEquipment((eq) => normalizeEquipment(eq))
    onClose()
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  // Esc fecha (na captura, antes das gavetas e da base seleccionada)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const a = aircraftEquipmentFor(equipment, aircraftId)
  const L = EQUIPMENT_LIMITS
  const edit = (fn) => {
    setStatus(null)
    setEquipment(fn)
  }

  const exportFile = () => {
    downloadBlob(
      new Blob([equipmentToJson(equipment)], { type: 'application/json' }),
      EQUIPMENT_FILE_NAME,
    )
  }
  const importFile = async (file) => {
    if (!file) return
    try {
      const eq = equipmentFromJson(await file.text())
      setEquipment(eq)
      setConfirmRestore(false)
      setStatus({ kind: 'ok', text: t('set.imported'), where: 'file' })
    } catch (err) {
      setStatus({ kind: 'error', text: errorText(errorInfo(err), t), where: 'file' })
    }
  }
  const clearCache = async () => {
    const ok = await clearTileCache()
    let usedMb = null
    try {
      const est = await navigator.storage?.estimate?.()
      if (est && Number.isFinite(est.usage)) usedMb = Math.round(est.usage / 1048576)
    } catch {
      /* sem estimativa */
    }
    setConfirmRestore(false)
    setStatus({
      kind: 'ok',
      text:
        (ok ? t('set.cacheCleared') : t('set.cacheEmpty')) +
        (usedMb != null ? ` ${t('set.storageUsed', { mb: usedMb })}` : ''),
      where: 'cache',
    })
  }
  const statusIn = (where) => status?.where === where && <Status status={status} />

  const sectionIds = SECTIONS.map((s) => s.id)
  const sectionKeys = tabKeys(sectionIds, section, setSection, (id) =>
    document.getElementById(`set-tab-${id}`),
  )
  const aircraftKeys = tabKeys(ids, aircraftId, setAircraftId, (id) =>
    document.getElementById(`set-aircraft-${id}`),
  )
  const panel = (id, children) => (
    <div
      key={id}
      role="tabpanel"
      id={`set-panel-${id}`}
      aria-labelledby={`set-tab-${id}`}
      hidden={section !== id}
      className="h-full overflow-y-auto px-4 pb-6 pt-5 sm:px-6"
    >
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
  const removeTitle = t('set.removeTitle')

  return (
    <div className={`${BACKDROP} z-[3000] bg-[rgba(3,6,14,0.74)]`} onClick={close}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-describedby="settings-sub"
        data-testid="settings"
        tabIndex={-1}
        className={`${WINDOW} h-[768px] max-w-[940px] border-slate-700`}
        onClick={(e) => e.stopPropagation()}
      >
        <WindowHeader
          id="settings-title"
          subtitleId="settings-sub"
          icon={<IconGear className="h-[18px] w-[18px]" />}
          title={t('set.title')}
          subtitle={t('set.intro')}
        >
          <CloseIconButton
            label={t('set.closeLabel')}
            title={t('set.closeTitle')}
            onClick={close}
          />
        </WindowHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[232px_minmax(0,1fr)] sm:grid-rows-1">
          <div className="flex min-w-0 flex-col justify-between gap-3 border-b border-slate-800 bg-slate-950 px-2.5 pb-3.5 pt-3 sm:border-b-0 sm:border-r">
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label={t('set.sections')}
              className="flex gap-1 overflow-x-auto sm:flex-col"
            >
              {SECTIONS.map((s) => {
                const on = s.id === section
                const SectionIcon = s.icon
                return (
                  <button
                    key={s.id}
                    ref={on ? tabRef : undefined}
                    type="button"
                    role="tab"
                    id={`set-tab-${s.id}`}
                    aria-selected={on}
                    aria-controls={`set-panel-${s.id}`}
                    // o nome é o título; a linha de baixo é a descrição
                    aria-labelledby={`set-tab-${s.id}-name`}
                    aria-describedby={`set-tab-${s.id}-desc`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => {
                      setSection(s.id)
                      setConfirmRestore(false)
                    }}
                    onKeyDown={sectionKeys}
                    className={`flex flex-none items-start gap-2.5 rounded-[9px] p-2.5 text-left transition-colors sm:w-full ${
                      on
                        ? 'bg-[#16223A] text-slate-100'
                        : 'text-slate-200 hover:bg-raised hover:text-slate-100'
                    }`}
                  >
                    <SectionIcon
                      className={`mt-px h-[18px] w-[18px] ${on ? 'text-sky-300' : 'text-slate-400'}`}
                    />
                    <span>
                      <span
                        id={`set-tab-${s.id}-name`}
                        className="block whitespace-nowrap text-[13.5px] font-semibold sm:whitespace-normal"
                      >
                        {t(s.title)}
                      </span>
                      <span
                        id={`set-tab-${s.id}-desc`}
                        className="mt-0.5 hidden text-xs leading-snug text-slate-400 sm:block"
                      >
                        {t(s.desc)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="m-0 hidden rounded-[9px] border border-slate-800 bg-sunken p-2.5 text-xs leading-normal text-slate-300 sm:block">
              {t('set.sectionsNote')}
            </p>
          </div>

          <div className="min-h-0 min-w-0">
            {panel(
              'aircraft',
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-400">
                    <span id="set-aircraft-label">{t('set.aircraftTitle')}</span>
                    <span>{t('set.perAircraft')}</span>
                  </div>
                  <div
                    role="tablist"
                    aria-labelledby="set-aircraft-label"
                    className="grid grid-cols-2 gap-1 rounded-[9px] border border-slate-800 bg-field p-[3px] md:grid-cols-4"
                  >
                    {ids.map((id) => {
                      const on = id === aircraftId
                      return (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          id={`set-aircraft-${id}`}
                          aria-selected={on}
                          aria-controls="set-aircraft-panel"
                          aria-label={aircraftLabel(AIRCRAFT[id], t)}
                          tabIndex={on ? 0 : -1}
                          onClick={() => setAircraftId(id)}
                          onKeyDown={aircraftKeys}
                          className={`h-9 truncate rounded-md px-2 text-[13px] transition-colors ${
                            on
                              ? 'bg-[#1E3A52] font-semibold text-sky-100'
                              : 'font-medium text-slate-200 hover:bg-raised'
                          }`}
                        >
                          {shortName(aircraftLabel(AIRCRAFT[id], t))}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex min-h-6 flex-wrap items-center gap-2 text-[13px] text-slate-200">
                    {aircraftLabel(AIRCRAFT[aircraftId], t)}
                    {aircraftId === initialAircraftId && (
                      <span className="inline-flex h-[22px] items-center rounded-full bg-[#10233A] px-2 text-xs font-medium text-blue-300">
                        {t('set.inProject')}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  role="tabpanel"
                  id="set-aircraft-panel"
                  aria-labelledby={`set-aircraft-${aircraftId}`}
                  className="flex flex-col gap-4"
                >
                  <section aria-label={t('set.vlos')} className={CARD}>
                    <FieldRow
                      id="set-vlos"
                      label={t('set.vlos')}
                      hint={t('set.vlosHint')}
                      unit="m"
                      first
                    >
                      <NumField
                        id="set-vlos"
                        aria-describedby="set-vlos-hint"
                        value={a.vlosM}
                        limits={L.vlosM}
                        step={50}
                        integer
                        onCommit={(v) =>
                          edit((eq) => updateAircraftEquipment(eq, aircraftId, { vlosM: v }))
                        }
                      />
                    </FieldRow>
                  </section>

                  <section aria-labelledby="set-batteries" className={`${CARD} overflow-hidden`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pb-2.5 pt-3.5">
                      <h3 id="set-batteries" className="m-0 text-sm font-semibold">
                        {t('set.batteriesTitle')}
                      </h3>
                      <span className="text-xs text-slate-400">{t('set.batteriesNote')}</span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="hidden grid-cols-[76px_minmax(0,1fr)_128px_128px_40px] items-center gap-2.5 border-t border-slate-800 bg-sunken px-4 py-[7px] text-[11.5px] text-slate-400 md:grid"
                    >
                      <span>{t('set.default')}</span>
                      <span>{t('set.batteryLabel')}</span>
                      <span>{t('set.usefulMin')}</span>
                      <span>{t('set.count')}</span>
                      <span />
                    </div>
                    <ul className="m-0 list-none p-0" data-testid="settings-batteries">
                      {a.batteries.map((b, i) => {
                        const pre = `set-${aircraftId}-${i}`
                        const name = batteryLabel(b, t)
                        const only = a.batteries.length <= 1
                        return (
                          <li
                            key={b.id}
                            data-battery-id={b.id}
                            className="border-t border-[#18233A] px-4 py-2"
                          >
                            <div className="grid grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-2.5 md:grid-cols-[76px_minmax(0,1fr)_128px_128px_40px]">
                              <label
                                className="flex h-10 w-11 cursor-pointer items-center justify-center"
                                title={t('set.defaultTitle')}
                              >
                                <input
                                  type="radio"
                                  name={`set-default-${aircraftId}`}
                                  aria-label={t('set.defaultAria', { name })}
                                  className="grid h-[18px] w-[18px] cursor-pointer appearance-none place-content-center rounded-full border-2 border-slate-500 before:h-2 before:w-2 before:rounded-full before:content-[''] checked:border-sky-400 checked:before:bg-sky-400"
                                  checked={a.defaultBatteryId === b.id}
                                  onChange={() =>
                                    edit((eq) => setDefaultBattery(eq, aircraftId, b.id))
                                  }
                                />
                              </label>
                              <span className={fieldBox}>
                                <TextField
                                  id={`${pre}-label`}
                                  aria-label={t('set.nameAria')}
                                  value={name}
                                  onCommit={(v) =>
                                    edit((eq) => updateBattery(eq, aircraftId, b.id, { label: v }))
                                  }
                                />
                              </span>
                              <span
                                className={`${fieldBox} col-start-2 md:col-start-auto`}
                                title={t('set.usefulMin')}
                              >
                                <NumField
                                  id={`${pre}-useful`}
                                  aria-label={t('set.usefulAria', { name })}
                                  value={b.usefulMin}
                                  limits={L.usefulMin}
                                  step={0.5}
                                  // um tempo introduzido pelo operador deixa de ser estimativa
                                  onCommit={(v) =>
                                    edit((eq) =>
                                      updateBattery(eq, aircraftId, b.id, {
                                        usefulMin: v,
                                        estimated: false,
                                      }),
                                    )
                                  }
                                />
                                <span className="flex-none text-[12.5px] text-slate-400">min</span>
                              </span>
                              <span
                                className={`${fieldBox} col-start-2 md:col-start-auto`}
                                title={t('set.count')}
                              >
                                <NumField
                                  id={`${pre}-count`}
                                  aria-label={t('set.countAria', { name })}
                                  value={b.count}
                                  limits={L.count}
                                  integer
                                  allowEmpty
                                  placeholder={t('set.countPlaceholder')}
                                  onCommit={(v) =>
                                    edit((eq) => updateBattery(eq, aircraftId, b.id, { count: v }))
                                  }
                                />
                              </span>
                              <button
                                type="button"
                                disabled={only}
                                onClick={() => edit((eq) => removeBattery(eq, aircraftId, b.id))}
                                title={removeTitle}
                                aria-label={`${t('set.remove')} ${name}`}
                                className="col-start-3 row-start-1 flex h-10 w-10 items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-950/40 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent md:col-start-auto md:row-start-auto"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </div>
                            {b.estimated && (
                              <p className="mb-0.5 mt-1.5 flex items-center gap-2 text-[12.5px] leading-snug text-amber-300 md:ml-[86px]">
                                <IconWarning className="h-3.5 w-3.5 text-amber-500" />
                                {t('set.estimated')}
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    <div className="flex flex-col gap-2.5 border-t border-[#18233A] px-4 pb-3.5 pt-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          edit((eq) => addBattery(eq, aircraftId, t('set.newBattery')).equipment)
                        }
                        className={`${buttonClass('secondary', 'md')} h-10 self-start px-3.5`}
                      >
                        <Icon d="M12 5v14M5 12h14" size={15} />
                        {t('set.add')}
                      </button>
                      <p className="m-0 text-[12.5px] leading-normal text-slate-400">
                        {t('set.batteriesHint')}
                      </p>
                    </div>
                  </section>
                </div>
              </>,
            )}

            {panel(
              'zone',
              <>
                <p className="m-0 text-[13px] leading-relaxed text-slate-300">
                  {t('set.zoneIntro')}
                </p>
                <section aria-label={t('set.zoneTitle')} className={CARD}>
                  <FieldRow
                    id="set-zone-radius"
                    label={t('set.zoneRadius')}
                    hint={t('set.zoneRadiusHint')}
                    unit="m"
                    first
                  >
                    <NumField
                      id="set-zone-radius"
                      aria-describedby="set-zone-radius-hint"
                      value={equipment.zoneRadiusM}
                      limits={L.zoneRadiusM}
                      step={10}
                      onCommit={(v) => edit((eq) => ({ ...eq, zoneRadiusM: v }))}
                    />
                  </FieldRow>
                  <FieldRow
                    id="set-zone-relief"
                    label={t('set.zoneRelief')}
                    hint={t('set.zoneReliefHint')}
                    unit="m"
                  >
                    <NumField
                      id="set-zone-relief"
                      aria-describedby="set-zone-relief-hint"
                      value={equipment.zoneMaxReliefM}
                      limits={L.zoneMaxReliefM}
                      onCommit={(v) => edit((eq) => ({ ...eq, zoneMaxReliefM: v }))}
                    />
                  </FieldRow>
                  <FieldRow
                    id="set-max-flights"
                    label={t('set.maxFlightsPerBase')}
                    hint={t('set.maxFlightsPerBaseHint')}
                    unit={t('set.flightsUnit')}
                  >
                    <NumField
                      id="set-max-flights"
                      aria-describedby="set-max-flights-hint"
                      value={equipment.maxFlightsPerBase ?? 0}
                      limits={L.maxFlightsPerBase}
                      integer
                      onCommit={(v) => edit((eq) => ({ ...eq, maxFlightsPerBase: v }))}
                    />
                  </FieldRow>
                </section>
                <section
                  aria-label={t('set.zoneMapTitle')}
                  className={`${CARD} grid items-center gap-5 px-4 py-3.5 md:grid-cols-[260px_minmax(0,1fr)]`}
                >
                  <ZoneSketch label={t('set.zoneMapAria')} />
                  <div className="flex flex-col gap-2.5 text-[12.5px] leading-normal text-slate-200">
                    <div className="text-[13.5px] font-semibold text-slate-100">
                      {t('set.zoneMapTitle')}
                    </div>
                    <KeyLine
                      symbol={
                        <circle
                          cx="11"
                          cy="11"
                          r="9"
                          fill="none"
                          stroke="#38BDF8"
                          strokeWidth="1.6"
                          strokeDasharray="3.5 3"
                        />
                      }
                    >
                      {t('set.zoneMapRequested', { r: equipment.zoneRadiusM })}
                    </KeyLine>
                    <KeyLine
                      symbol={
                        <circle
                          cx="11"
                          cy="11"
                          r="8"
                          fill="#38BDF8"
                          fillOpacity="0.16"
                          stroke="#38BDF8"
                          strokeWidth="2"
                        />
                      }
                    >
                      {t('set.zoneMapZone')}
                    </KeyLine>
                    <KeyLine
                      symbol={
                        <path
                          d="M6 2 C 3 8, 7 14, 4 20M11 2 C 8 8, 12 14, 9 20M16 2 C 13 8, 17 14, 14 20"
                          fill="none"
                          stroke="#B7791F"
                          strokeWidth="1.6"
                        />
                      }
                    >
                      {t('set.zoneMapRelief')}
                    </KeyLine>
                  </div>
                </section>
              </>,
            )}

            {panel(
              'pilot',
              <>
                <p className="m-0 text-[13px] leading-relaxed text-slate-300">
                  {t('set.pilotIntro')}
                </p>
                <section aria-label={t('set.operatorTitle')} className={CARD}>
                  <FieldRow
                    id="set-eye-height"
                    label={t('set.eyeHeight')}
                    hint={t('set.eyeHeightHint')}
                    unit="m"
                    first
                  >
                    <NumField
                      id="set-eye-height"
                      aria-describedby="set-eye-height-hint"
                      value={equipment.eyeHeightM}
                      limits={L.eyeHeightM}
                      step={0.1}
                      onCommit={(v) => edit((eq) => ({ ...eq, eyeHeightM: v }))}
                    />
                  </FieldRow>
                  <FieldRow
                    id="set-antenna-height"
                    label={t('set.antennaHeight')}
                    hint={t('set.antennaHeightHint')}
                    unit="m"
                  >
                    <NumField
                      id="set-antenna-height"
                      aria-describedby="set-antenna-height-hint"
                      value={equipment.antennaHeightM}
                      limits={L.antennaHeightM}
                      step={0.1}
                      onCommit={(v) => edit((eq) => ({ ...eq, antennaHeightM: v }))}
                    />
                  </FieldRow>
                </section>
                <section
                  aria-label={t('set.losAria')}
                  className={`${CARD} grid items-center gap-5 px-4 py-3.5 md:grid-cols-[280px_minmax(0,1fr)]`}
                >
                  <SightSketch label={t('set.losAria')} />
                  <div className="flex flex-col gap-2.5 text-[12.5px] leading-normal text-slate-200">
                    <KeyLine symbol={<path d="M2 16 L 20 6" stroke="#7DD3FC" strokeWidth="1.8" />}>
                      {t('set.losLine', { h: equipment.eyeHeightM })}
                    </KeyLine>
                    <KeyLine
                      symbol={
                        <ellipse
                          cx="11"
                          cy="11"
                          rx="9"
                          ry="5"
                          fill="#FDE047"
                          fillOpacity="0.12"
                          stroke="#FACC15"
                          strokeWidth="1.3"
                          strokeDasharray="3 2"
                        />
                      }
                    >
                      {t('set.losFresnel', { h: equipment.antennaHeightM })}
                    </KeyLine>
                    <p className="m-0 text-slate-400">{t('set.losMap')}</p>
                  </div>
                </section>
              </>,
            )}

            {panel(
              'data',
              <>
                <section aria-labelledby="set-file" className={CARD}>
                  <h3 id="set-file" className="m-0 px-4 pb-1 pt-3.5 text-sm font-semibold">
                    {t('set.fileTitle')}
                  </h3>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 px-4 pb-3 pt-2.5">
                    <div>
                      <div className="text-[13.5px] font-medium">{t('set.export')}</div>
                      <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-slate-400">
                        {t('set.exportDesc')}{' '}
                        <span className="font-mono text-xs text-slate-200">
                          {EQUIPMENT_FILE_NAME}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={exportFile}
                      title={t('set.exportTitle')}
                      className={`${buttonClass('secondary', 'md')} h-10 px-3.5`}
                    >
                      <IconDownload className="h-[15px] w-[15px]" />
                      {t('set.export')}
                    </button>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-t border-slate-800 px-4 pb-3.5 pt-3">
                    <div>
                      <div className="text-[13.5px] font-medium">{t('set.import')}</div>
                      <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-slate-400">
                        {t('set.importDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      title={t('set.importTitle')}
                      className={`${buttonClass('secondary', 'md')} h-10 px-3.5`}
                    >
                      <Icon size={15}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <path d="m17 8-5-5-5 5M12 3v12" />
                      </Icon>
                      {t('set.import')}…
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".json,application/json"
                      data-testid="settings-import"
                      className="hidden"
                      onChange={(e) => {
                        importFile(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                  </div>
                  {status?.where === 'file' && (
                    <div className="px-4 pb-3.5">
                      <Status status={status} />
                    </div>
                  )}
                </section>

                <section
                  aria-labelledby="set-restore"
                  className={`${CARD} flex flex-col gap-3 px-4 py-3.5`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5">
                    <div>
                      <h3 id="set-restore" className="m-0 text-sm font-semibold">
                        {t('set.restore')}
                      </h3>
                      <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-slate-400">
                        {t('set.restoreDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${t('set.restore')}…`}
                      aria-expanded={confirmRestore}
                      onClick={() => {
                        setStatus(null)
                        setConfirmRestore(true)
                      }}
                      className={`${buttonClass('danger', 'md')} h-10`}
                    >
                      <Icon size={15}>
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                      </Icon>
                      {t('set.restoreYes')}…
                    </button>
                  </div>
                  {confirmRestore && (
                    <div
                      role="alertdialog"
                      aria-labelledby="set-restore-question"
                      className="flex flex-col gap-3 rounded-[9px] border border-[#7A2530] bg-[#2B1215] px-3.5 py-3"
                    >
                      <p
                        id="set-restore-question"
                        className="m-0 flex gap-2.5 text-[13px] leading-normal text-red-100"
                      >
                        <IconWarning className="mt-0.5 h-4 w-4 text-red-400" />
                        <span>
                          <strong className="font-semibold text-red-300">
                            {t('set.restoreConfirm')}
                          </strong>{' '}
                          {t('set.restoreLoss')}
                        </span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEquipment(defaultEquipment())
                            setConfirmRestore(false)
                            setStatus({ kind: 'ok', text: t('set.restored'), where: 'restore' })
                          }}
                          className={`${buttonClass('dangerSolid', 'md')} h-10 px-4`}
                        >
                          {t('set.restoreYes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRestore(false)}
                          className={`${buttonClass('secondary', 'md')} h-10 px-4`}
                        >
                          {t('set.restoreNo')}
                        </button>
                      </div>
                    </div>
                  )}
                  {statusIn('restore')}
                </section>

                <section
                  aria-labelledby="set-cache"
                  className={`${CARD} flex flex-col gap-3 px-4 py-3.5`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5">
                    <div>
                      <h3 id="set-cache" className="m-0 text-sm font-semibold">
                        {t('set.cacheTitle')}
                      </h3>
                      <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-slate-400">
                        {t('set.cacheDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="settings-clear-cache"
                      aria-label={t('set.clearCache')}
                      title={t('set.clearCache')}
                      onClick={clearCache}
                      className={`${buttonClass('secondary', 'md')} h-10 px-3.5`}
                    >
                      <IconTrash className="h-[15px] w-[15px]" />
                      {t('set.clearCacheShort')}
                    </button>
                  </div>
                  {statusIn('cache')}
                </section>
              </>,
            )}
          </div>
        </div>

        <div className="flex flex-none items-center gap-3 border-t border-slate-800 py-3 pl-5 pr-4">
          <span className="flex items-center gap-2 text-[12.5px] text-slate-400">
            <IconCheckCircle className="h-[15px] w-[15px] text-emerald-400" />
            {t('set.autosave')}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={close}
            className={`${buttonClass('primary', 'lg')} h-10 px-5 text-[13.5px]`}
          >
            {t('set.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
