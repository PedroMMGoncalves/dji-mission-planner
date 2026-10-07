/**
 * Configuração: o equipamento da equipa por aeronave (alcance visual, tipos
 * de bateria com o tempo útil por conjunto e quantos conjuntos há) e os
 * valores por omissão da zona de descolagem. O estado vive no App (e no
 * localStorage); aqui só se edita, com as funções puras de
 * mission/equipment.js. Exportar/Importar leva a configuração para outro
 * computador; Repor volta aos valores por omissão, com confirmação.
 */
import { useEffect, useRef, useState } from 'react'
import { AIRCRAFT } from '../data/drones.js'
import {
  EQUIPMENT_LIMITS,
  addBattery,
  aircraftEquipmentFor,
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

export const EQUIPMENT_FILE_NAME = 'equipamento-dji-mission-planner.json'

const INPUT =
  'min-h-[44px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'
const BUTTON =
  'min-h-[44px] rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40'

function H({ children }) {
  return (
    <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-sky-400 first:mt-0">
      {children}
    </h3>
  )
}

/**
 * Campo numérico com rascunho enquanto tem o foco: o valor só é gravado
 * quando é válido (dentro de `limits`), e ao sair do campo volta ao valor
 * gravado. Assim escrever "1000" não passa por "1" recortado a 50.
 * `allowEmpty`: vazio grava null (ex.: conjuntos desconhecidos).
 */
function NumField({ id, value, onCommit, limits, step = 1, integer = false, allowEmpty, ...rest }) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? (value == null ? '' : String(value))
  return (
    <input
      id={id}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      className={`${INPUT} w-24 text-right`}
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
      className={`${INPUT} w-full`}
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
 * @param {{equipment: import('../mission/equipment.js').Equipment,
 *   setEquipment: (fn: any) => void, initialAircraftId: string, onClose: () => void}} props
 */
export default function SettingsModal({ equipment, setEquipment, initialAircraftId, onClose }) {
  const t = useT()
  const ids = Object.keys(AIRCRAFT)
  const [aircraftId, setAircraftId] = useState(
    ids.includes(initialAircraftId) ? initialAircraftId : ids[0],
  )
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [status, setStatus] = useState(/** @type {{kind: string, text: string}|null} */ (null))
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  // ao fechar, o equipamento fica normalizado (nomes aparados, limites)
  const close = () => {
    setEquipment((eq) => normalizeEquipment(eq))
    onClose()
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
      setStatus({ kind: 'ok', text: t('set.imported') })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings"
        className="mt-6 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-slate-700 pl-5">
          <h2 id="settings-title" className="py-3 text-base font-semibold text-sky-300">
            {t('set.title')}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('set.close')}
            title={t('set.closeTitle')}
            className="ml-auto min-h-[44px] min-w-[44px] px-4 text-slate-400 transition-colors hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">
          <p className="mb-4 text-[12px] leading-relaxed text-slate-400">{t('set.intro')}</p>

          <H>{t('set.aircraftTitle')}</H>
          <div
            role="tablist"
            aria-label={t('set.aircraftTitle')}
            className="mb-3 flex flex-wrap gap-1.5"
          >
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === aircraftId}
                onClick={() => setAircraftId(id)}
                className={`min-h-[44px] rounded px-3 py-2 text-sm font-medium transition-colors ${
                  id === aircraftId
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {AIRCRAFT[id].label}
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={AIRCRAFT[aircraftId].label}>
            <div className="mb-1 flex items-center gap-2">
              <label htmlFor="set-vlos" className="flex-1">
                {t('set.vlos')}
              </label>
              <NumField
                id="set-vlos"
                value={a.vlosM}
                limits={L.vlosM}
                step={50}
                integer
                onCommit={(v) =>
                  edit((eq) => updateAircraftEquipment(eq, aircraftId, { vlosM: v }))
                }
              />
              <span className="w-8 text-xs text-slate-500">m</span>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">{t('set.vlosHint')}</p>

            <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">
              {t('set.batteriesTitle')}
            </p>
            <ul className="space-y-2" data-testid="settings-batteries">
              {a.batteries.map((b, i) => {
                const pre = `set-${aircraftId}-${i}`
                return (
                  <li
                    key={b.id}
                    data-battery-id={b.id}
                    className="rounded border border-slate-800 bg-slate-950/50 p-2.5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <label
                        htmlFor={`${pre}-label`}
                        className="w-28 shrink-0 text-xs text-slate-400"
                      >
                        {t('set.batteryLabel')}
                      </label>
                      <TextField
                        id={`${pre}-label`}
                        value={b.label}
                        onCommit={(v) =>
                          edit((eq) => updateBattery(eq, aircraftId, b.id, { label: v }))
                        }
                      />
                    </div>
                    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`${pre}-useful`} className="text-xs text-slate-400">
                          {t('set.usefulMin')}
                        </label>
                        <NumField
                          id={`${pre}-useful`}
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
                        <span className="text-xs text-slate-500">min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor={`${pre}-count`} className="text-xs text-slate-400">
                          {t('set.count')}
                        </label>
                        <NumField
                          id={`${pre}-count`}
                          value={b.count}
                          limits={L.count}
                          integer
                          allowEmpty
                          placeholder={t('set.countPlaceholder')}
                          onCommit={(v) =>
                            edit((eq) => updateBattery(eq, aircraftId, b.id, { count: v }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label
                        className="flex min-h-[44px] cursor-pointer items-center gap-2 text-xs text-slate-300"
                        title={t('set.defaultTitle')}
                      >
                        <input
                          type="radio"
                          name={`set-default-${aircraftId}`}
                          className="h-4 w-4 accent-sky-500"
                          checked={a.defaultBatteryId === b.id}
                          onChange={() => edit((eq) => setDefaultBattery(eq, aircraftId, b.id))}
                        />
                        {t('set.default')}
                      </label>
                      {b.estimated && (
                        <span className="text-[11px] italic text-amber-300/90">
                          {t('set.estimated')}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={a.batteries.length <= 1}
                        onClick={() => edit((eq) => removeBattery(eq, aircraftId, b.id))}
                        title={t('set.removeTitle')}
                        aria-label={`${t('set.remove')} ${b.label}`}
                        className={`${BUTTON} ml-auto text-xs`}
                      >
                        {t('set.remove')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={() =>
                edit((eq) => addBattery(eq, aircraftId, t('set.newBattery')).equipment)
              }
              className={`${BUTTON} mt-2 w-full`}
            >
              {t('set.add')}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {t('set.batteriesHint')}
            </p>
          </div>

          <H>{t('set.zoneTitle')}</H>
          <div className="mb-1 flex items-center gap-2">
            <label htmlFor="set-zone-radius" className="flex-1">
              {t('set.zoneRadius')}
            </label>
            <NumField
              id="set-zone-radius"
              value={equipment.zoneRadiusM}
              limits={L.zoneRadiusM}
              step={10}
              onCommit={(v) => edit((eq) => ({ ...eq, zoneRadiusM: v }))}
            />
            <span className="w-8 text-xs text-slate-500">m</span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            {t('set.zoneRadiusHint')}
          </p>
          <div className="mb-1 flex items-center gap-2">
            <label htmlFor="set-zone-relief" className="flex-1">
              {t('set.zoneRelief')}
            </label>
            <NumField
              id="set-zone-relief"
              value={equipment.zoneMaxReliefM}
              limits={L.zoneMaxReliefM}
              onCommit={(v) => edit((eq) => ({ ...eq, zoneMaxReliefM: v }))}
            />
            <span className="w-8 text-xs text-slate-500">m</span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            {t('set.zoneReliefHint')}
          </p>
          <div className="mb-1 flex items-center gap-2">
            <label htmlFor="set-max-flights" className="flex-1">
              {t('set.maxFlightsPerBase')}
            </label>
            <NumField
              id="set-max-flights"
              value={equipment.maxFlightsPerBase ?? 0}
              limits={L.maxFlightsPerBase}
              integer
              onCommit={(v) => edit((eq) => ({ ...eq, maxFlightsPerBase: v }))}
            />
            <span className="w-8 text-xs text-slate-500" />
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            {t('set.maxFlightsPerBaseHint')}
          </p>

          <H>{t('set.operatorTitle')}</H>
          <div className="mb-1 flex items-center gap-2">
            <label htmlFor="set-eye-height" className="flex-1">
              {t('set.eyeHeight')}
            </label>
            <NumField
              id="set-eye-height"
              value={equipment.eyeHeightM}
              limits={L.eyeHeightM}
              step={0.1}
              onCommit={(v) => edit((eq) => ({ ...eq, eyeHeightM: v }))}
            />
            <span className="w-8 text-xs text-slate-500">m</span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            {t('set.eyeHeightHint')}
          </p>
          <div className="mb-1 flex items-center gap-2">
            <label htmlFor="set-antenna-height" className="flex-1">
              {t('set.antennaHeight')}
            </label>
            <NumField
              id="set-antenna-height"
              value={equipment.antennaHeightM}
              limits={L.antennaHeightM}
              step={0.1}
              onCommit={(v) => edit((eq) => ({ ...eq, antennaHeightM: v }))}
            />
            <span className="w-8 text-xs text-slate-500">m</span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            {t('set.antennaHeightHint')}
          </p>

          <H>{t('set.fileTitle')}</H>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportFile}
              title={t('set.exportTitle')}
              className={BUTTON}
            >
              {t('set.export')}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title={t('set.importTitle')}
              className={BUTTON}
            >
              {t('set.import')}
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
          {!confirmRestore ? (
            <button
              type="button"
              onClick={() => {
                setStatus(null)
                setConfirmRestore(true)
              }}
              className={`${BUTTON} mt-2 w-full`}
            >
              {t('set.restore')}
            </button>
          ) : (
            <div
              role="alertdialog"
              aria-label={t('set.restore')}
              className="mt-2 rounded border border-amber-700 bg-amber-950/50 p-2.5 text-[12px] leading-relaxed text-amber-200"
            >
              <p className="mb-2">{t('set.restoreConfirm')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEquipment(defaultEquipment())
                    setConfirmRestore(false)
                    setStatus({ kind: 'ok', text: t('set.restored') })
                  }}
                  className="min-h-[44px] rounded bg-amber-600 px-3 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-amber-500"
                >
                  {t('set.restoreYes')}
                </button>
                <button type="button" onClick={() => setConfirmRestore(false)} className={BUTTON}>
                  {t('set.restoreNo')}
                </button>
              </div>
            </div>
          )}
          {status && (
            <p
              role={status.kind === 'error' ? 'alert' : 'status'}
              className={`mt-2 rounded border p-2 text-[12px] leading-relaxed ${
                status.kind === 'error'
                  ? 'border-red-800 bg-red-950/60 text-red-200'
                  : 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
              }`}
            >
              {status.text}
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-700 px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="min-h-[44px] rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            {t('set.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
