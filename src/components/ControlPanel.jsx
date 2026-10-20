import { useEffect, useRef, useState } from 'react'
import { AIRCRAFT, PAYLOADS } from '../data/drones.js'
import { CRS_OPTIONS } from '../utils/importArea.js'
import { useLang, useT } from '../i18n.jsx'
import {
  IconChart,
  IconCheck,
  IconDownload,
  IconFolder,
  IconGear,
  IconHelipad,
  IconMountain,
  IconPolygon,
  IconTarget,
  IconTrash,
} from './Icons.jsx'
import BatterySetsNote from './BatterySetsNote.jsx'
import BasesPanel, { FlightExports, ViewshedBox } from './BasesPanel.jsx'
import {
  Card,
  CardColumn,
  Drawer,
  DrawerGroup,
  RthLine,
  SafetyActions,
  useDrawers,
} from './Cards.jsx'
import { errorText, terrainErrorText as terrainErrText } from '../utils/appError.js'
import { batteryLabel } from '../mission/equipment.js'
import { notesSince } from '../data/versionNotes.js'
import { versionBefore } from '../mission/project.js'

function Field({ label, suffix = null, children }) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-300">
      <span className="flex-1">{label}</span>
      {children}
      {suffix && <span className="w-8 text-xs text-slate-400">{suffix}</span>}
    </label>
  )
}

/** Erro do seguimento de terreno (código de useAreaMission) na língua da interface. */
function terrainErrorText(res, t) {
  const key = `cp.terrain.err.${res.error}`
  const msg = t(key, { msg: res.detail ?? '' })
  return msg === key ? String(res.error) : msg
}

/**
 * Campo numérico com rascunho local (M3-C9): o valor só chega ao estado no
 * blur, no Enter ou 400 ms depois da última tecla, já limitado a [min, max].
 * Cada tecla era um plano novo — o «1» e o «12» a caminho de «120» na
 * altitude davam um plano a 1 m com 1882 faixas e outro a 12 m —, o campo
 * vazio valia 0 e os limites do campo não se aplicavam ao que se escrevia.
 */
/** mm:ss (ou h:mm:ss), o mesmo formato do painel de métricas (M3-U13). */
function fmtClock(sec) {
  if (!Number.isFinite(sec)) return '—'
  const tt = Math.round(sec)
  const h = Math.floor(tt / 3600)
  const m = Math.floor((tt % 3600) / 60)
  const ss = String(tt % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * @param {{value: any, onChange: (v: any) => void, min?: number, max?: number, step?: number,
 *   wide?: boolean, testId?: string, label?: string}} props
 */
function NumberInput({ value, onChange, min, max, step = 1, wide, testId, label }) {
  const [draft, setDraft] = useState(null)
  const timer = useRef(null)
  const commit = (raw) => {
    clearTimeout(timer.current)
    setDraft(null)
    const n = Number(raw)
    if (raw === '' || raw == null || !Number.isFinite(n)) return
    let v = n
    if (Number.isFinite(min)) v = Math.max(min, v)
    if (Number.isFinite(max)) v = Math.min(max, v)
    if (v !== value) onChange(v)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <input
      type="number"
      aria-label={label}
      data-testid={testId}
      onBlur={() => draft != null && commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && draft != null) commit(draft)
      }}
      className={`${wide ? 'w-28' : 'w-20'} rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-sky-500 focus:outline-none`}
      value={draft ?? value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(raw), 400)
      }}
    />
  )
}

/**
 * Orientação dos quadrados do mosaico: por omissão paralelos às faixas (o
 * ângulo que o plano usa, também o "óptimo"); desligado, a orientação manual.
 */
function MosaicOrientation({ split, setSplitParam, tileOrientation }) {
  const t = useT()
  const auto = split.tileOrientationAuto !== false
  return (
    <div className="mb-2">
      <label className="mb-1 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          data-testid="tile-orientation-auto"
          checked={auto}
          onChange={(e) => {
            // ao passar a manual parte-se da orientação que estava a ser usada
            if (!e.target.checked && Number.isFinite(tileOrientation))
              setSplitParam('tileOrientation', Math.round(tileOrientation))
            setSplitParam('tileOrientationAuto', e.target.checked)
          }}
          className="accent-sky-500"
        />
        <span className="flex-1">{t('cp.split.orientationAuto')}</span>
      </label>
      {auto ? (
        <p className="text-xs leading-relaxed text-slate-400">
          {t('cp.split.orientationAutoHint', {
            deg: Number.isFinite(tileOrientation) ? Math.round(tileOrientation) : '-',
          })}
        </p>
      ) : (
        <Field label={t('cp.split.meshOrientation')} suffix="°">
          <NumberInput
            value={split.tileOrientation}
            min={0}
            max={180}
            onChange={(v) => setSplitParam('tileOrientation', v)}
          />
        </Field>
      )}
    </div>
  )
}

/** Etiqueta do datum vertical de uma fonte de relevo (ver utils/verticalDatum.js). */
function datumLabel(d, t) {
  const base =
    d.kind === 'ellipsoidal'
      ? t('cp.terrain.datumEllip', { model: d.model })
      : d.kind === 'orthometric'
        ? t('cp.terrain.datumOrtho', { model: d.model })
        : t('cp.terrain.datumUnknown')
  const assumed = d.assumed && d.kind !== 'unknown' ? t('cp.terrain.datumAssumed') : ''
  const unit = d.unitFactor !== 1 ? t('cp.terrain.datumUnit', { unit: d.unitLabel }) : ''
  return `${base}${assumed}${unit}`
}

/** Duração: «12 min 05 s», ou «17 h 19 min» a partir de uma hora. */
function fmtTime(s) {
  if (!Number.isFinite(s)) return '—'
  const t = Math.round(s)
  if (t >= 3600) {
    const h = Math.floor(t / 3600)
    const min = Math.round((t % 3600) / 60)
    return min === 60 ? `${h + 1} h 00 min` : `${h} h ${String(min).padStart(2, '0')} min`
  }
  return `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, '0')} s`
}

/**
 * Painel da área: sete cartões numerados pela ordem do trabalho — Missão,
 * Área e relevo, Parâmetros de voo, Divisão em voos, Bases e segurança,
 * Extras, Resumo e exportar —, cada um com o essencial; o resto de cada
 * cartão está na sua gaveta («Mais opções ›», src/components/Cards.jsx).
 * Nenhum controlo se perdeu na passagem para os cartões: o cenário E2E
 * `inventario-painel-area` verifica-os todos, no cartão ou na gaveta.
 */
export default function ControlPanel({
  missionName,
  setMissionName,
  drone,
  setDrone,
  custom,
  setCustom,
  effectiveFov,
  onEffectiveFov,
  params,
  setParam,
  mode,
  draftCount,
  hasRing,
  validation,
  planError,
  planErrorCells,
  anchor,
  setAnchorParam,
  hasBase,
  refAzimuth,
  split,
  setSplitParam,
  batteries = [],
  battery = null,
  usefulMin,
  usefulOverridden = false,
  onBatteryId,
  onUsefulMin,
  setsCheck = null,
  onOpenSettings,
  blocks,
  gridActive,
  tilesTotal,
  tilesError,
  tileSide,
  gsd,
  onGsdTarget,
  presets,
  onApplyPreset,
  triggerWarn,
  waypointWarn,
  aglWarn,
  importState,
  importError,
  // o projecto que não abriu: no cartão 1, junto do botão (M3-U18)
  projectError = null,
  // o projecto aberto foi gravado por uma versão anterior (M3-U17): {saved, now}
  projectVersion = null,
  onDismissVersionNote = null,
  // resumo operacional (voos, conjuntos, voo mais longo), para o cartão 7 (M3-U13)
  ops = null,
  // margem em metros (M3-U22) e minutos de um quadrado (M3-U20)
  bufferM = 0,
  squareMinutes = null,
  // folga ao solo da rota (min/max), para o intervalo AGL sobre a área (M3-U2)
  routeClearance = null,
  // altura de regresso (RTH) e subida de descolagem escritas no KMZ (M3-U3)
  rthInfo = null,
  // os primeiros bloqueios do preflight, ditos no cartão 7 (M3-U6)
  preflightBlockers = [],
  onShowPreflight = null,
  importWarning = null,
  importParts = null,
  onImportUseAll = null,
  onImportFile,
  onImportCrs,
  onImportCancel,
  onProjectExport,
  onProjectImport,
  onTilesUndo,
  onTilesRestoreAll,
  terrain,
  terrainCovers,
  terrainFollow,
  setTerrainFollow,
  onLoadTerrain,
  onImportDem,
  demSurface = 'dtm',
  rememberedDem = null,
  onDemSurface = null,
  onShowProfile,
  terrainResult,
  slopeHint,
  onApplySlopeAngle,
  gcpConfig,
  setGcpConfig,
  gcpAutoCount,
  gcpInfo,
  onExportGcps,
  inspectPoints,
  onStartInspect,
  onInspectUpdate,
  onInspectRemove,
  onInspectMove,
  onInspectReorder,
  onInspectSuggestOrder,
  onExportInspection,
  inspectTerrainOk = true,
  onUndoVertex,
  onStartDraw,
  onStartAnchor,
  onStartBase,
  onRemoveBase,
  onSetAngleRelative,
  onSetAngleOptimal,
  onFinishDraw,
  onClear,
  // bases múltiplas: props de BasesPanel (null esconde a lista)
  basesPanel = null,
  // voos por bloco (layoutBlocks): rótulo "A-1" e cor da base
  baseLayout = null,
  // orientação efectiva dos quadrados (segue as faixas, ou a manual)
  tileOrientation = null,
  zoneRadiusM = 100,
  // acções de segurança (fim da missão, sinal perdido): cartão 5
  safety = null,
  setSafety = (_next) => {},
  // cartão 7: números da missão e exportação
  summary = null,
  onExportMission = null,
  canExportMission = false,
  onExportArea = null,
  canExportArea = false,
  // avisos do KML da área: buracos, partes e células desactivadas que ficam
  // de fora ou dentro do polígono (K-B1, K-E1, K-M8 da revisão)
  exportAreaNotes = [],
}) {
  const t = useT()
  const lang = useLang()
  // E1.3: arrastar-e-largar na lista de pontos de inspecção (as setas
  // mantêm-se para ecrãs tácteis, onde o HTML5 DnD não dispara)
  const dragIndexRef = useRef(null)
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  const isCustom = payload.type === 'custom'
  const areaFileRef = useRef(null)
  const projectFileRef = useRef(null)
  const demFileRef = useRef(null)

  const d = useDrawers()
  const terrainReady = terrain.status === 'ready'
  const exportFlights = basesPanel?.exportFlights ?? null
  const viewshed = basesPanel?.viewshed ?? null
  // descarregar o relevo global e importar um MDT: no cartão enquanto não há
  // relevo; depois, na gaveta (reimportar ou voltar ao global)
  const terrainButtons = (
    <div className="grid grid-cols-1 gap-2">
      <button
        onClick={onLoadTerrain}
        disabled={!hasRing || terrain.status === 'loading'}
        className="flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconMountain />{' '}
        {terrain.status === 'loading' ? t('cp.terrain.loading') : t('cp.terrain.downloadGlobal')}
      </button>
      <button
        onClick={() => demFileRef.current?.click()}
        disabled={!hasRing || terrain.status === 'loading'}
        title={t('cp.terrain.importDemTitle')}
        className="flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconFolder /> {t('cp.terrain.importDem')}
      </button>
    </div>
  )

  return (
    <div className="relative h-full">
      <CardColumn label={t('cards.panel')}>
        {/* 1. Missão */}
        <Card id="missao" n={1} title={t('cards.mission')} more={d.more('missao')}>
          <input
            type="text"
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            value={missionName}
            onChange={(e) => setMissionName(e.target.value)}
            placeholder={t('cp.mission.namePlaceholder')}
            aria-label={t('cards.missionName')}
          />
          <p className="mt-1.5 text-xs text-slate-400">
            {t('cp.mission.nameHintA')} (<span className="font-mono">.kml</span> /{' '}
            <span className="font-mono">.kmz</span>) {t('cp.mission.nameHintB')}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={onProjectExport}
              title={t('cp.mission.saveTitle')}
              className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              <IconDownload /> {t('cp.mission.save')}
            </button>
            <button
              onClick={() => projectFileRef.current?.click()}
              title={t('cp.mission.openTitle')}
              className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              <IconFolder /> {t('cp.mission.open')}
            </button>
            <input
              ref={projectFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                onProjectImport(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {projectVersion && (
            <div
              data-testid="project-version-note"
              className="mt-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs leading-relaxed text-amber-200"
            >
              <p className="font-semibold">
                {projectVersion.saved
                  ? t('cards.versionNote', { v: projectVersion.saved, now: projectVersion.now })
                  : t('cards.versionNoteOld', { now: projectVersion.now })}
              </p>
              <ul className="mt-1 list-disc pl-4">
                {notesSince(projectVersion.saved, versionBefore).flatMap((n) =>
                  (lang === 'en' ? n.en : n.pt).map((txt, i) => (
                    <li key={`${n.version}-${i}`}>{txt}</li>
                  )),
                )}
              </ul>
              <p className="mt-1 text-amber-300/90">{t('cards.versionNoteHint')}</p>
              {onDismissVersionNote && (
                <button
                  type="button"
                  onClick={onDismissVersionNote}
                  className="mt-1.5 rounded border border-current px-2 py-0.5 text-xs font-medium hover:bg-white/10"
                >
                  {t('cards.versionNoteClose')}
                </button>
              )}
            </div>
          )}
          {projectError && (
            <p
              data-testid="project-error"
              className="mt-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300"
            >
              ⚠ {errorText(projectError, t)}
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-400">{t('cp.mission.autosave')}</p>
          <div className="mt-3">
            <select
              className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={drone.aircraftId}
              aria-label={t('cards.aircraft')}
              onChange={(e) => {
                const a = AIRCRAFT[e.target.value]
                // keep the payload when the new aircraft also mounts it
                setDrone({
                  aircraftId: a.id,
                  payloadId: a.payloads.includes(drone.payloadId) ? drone.payloadId : a.payloads[0],
                })
              }}
            >
              {Object.values(AIRCRAFT).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>

            <label
              className="mb-2 flex items-start gap-2 text-xs text-slate-300"
              title={t('cp.drone.rtkHint')}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={drone.rtk === true}
                onChange={(e) => setDrone({ ...drone, rtk: e.target.checked })}
              />
              <span>{t('cp.drone.rtk')}</span>
            </label>

            {aircraft.payloads.length > 1 && (
              <>
                <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">
                  {t('cp.drone.payload')}
                </p>
                <select
                  className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  value={drone.payloadId}
                  aria-label={t('cp.drone.payload')}
                  onChange={(e) => setDrone({ ...drone, payloadId: e.target.value })}
                >
                  {aircraft.payloads.map((pid) => (
                    <option key={pid} value={pid}>
                      {PAYLOADS[pid].label}
                    </option>
                  ))}
                </select>
              </>
            )}

            {payload.type === 'camera' && (
              <p className="text-xs leading-relaxed text-slate-400">
                {t('cp.drone.specs', {
                  camera: payload.desc,
                  w: payload.sensorWidth,
                  h: payload.sensorHeight,
                  focal: payload.focalLength,
                  payload: payload.payloadLabel,
                })}
              </p>
            )}
            {payload.type === 'lidar' && (
              <p className="text-xs leading-relaxed text-slate-400">
                {t('cp.drone.lidarSpecs', {
                  desc: payload.desc,
                  fov: payload.fov,
                  agl: payload.maxAglM ?? '—',
                })}
              </p>
            )}
          </div>
        </Card>

        {/* 2. Área e relevo */}
        <Card id="area" n={2} title={t('cards.area')} more={d.more('area')}>
          <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">
            {t('cp.area.shape')}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={onStartDraw}
              title={t('cp.area.polygonTitle')}
              className={`flex items-center justify-center gap-1 rounded px-1.5 py-2 text-xs font-medium transition-colors ${
                mode === 'draw'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <IconPolygon /> {t('cp.area.polygon')}
            </button>
            <button
              onClick={() => onStartAnchor('rect')}
              title={t('cp.area.rectTitle')}
              className={`flex items-center justify-center gap-1 rounded px-1.5 py-2 text-xs font-medium transition-colors ${
                mode === 'anchor' && anchor.shape === 'rect'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <IconTarget /> {t('cp.area.rect')}
            </button>
            <button
              onClick={() => onStartAnchor('square')}
              title={t('cp.area.squareTitle')}
              className={`flex items-center justify-center gap-1 rounded px-1.5 py-2 text-xs font-medium transition-colors ${
                mode === 'anchor' && anchor.shape === 'square'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <IconTarget /> {t('cp.area.square')}
            </button>
          </div>

          <button
            onClick={() => areaFileRef.current?.click()}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
            title={t('cp.area.importTitle')}
          >
            <IconFolder /> {t('cp.area.import')}
          </button>
          <input
            ref={areaFileRef}
            type="file"
            accept=".kml,.geojson,.json,.zip,.kmz"
            className="hidden"
            onChange={(e) => {
              onImportFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          {importState && (
            <div className="mt-2 rounded border border-sky-800 bg-sky-950/40 p-3">
              <p className="mb-2 text-xs leading-relaxed text-sky-200">
                <strong>{importState.filename}</strong>: {t('cp.area.crsPrompt')}
                {importState.crsHint &&
                  ` ${t('cp.area.importCrsHint', { crs: importState.crsHint })}`}
              </p>
              <select
                className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                defaultValue="EPSG:3763"
                id="crs-select"
                aria-label={t('cards.crs')}
              >
                {CRS_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    onImportCrs(
                      /** @type {HTMLSelectElement} */ (document.getElementById('crs-select'))
                        .value,
                    )
                  }
                  className="rounded bg-sky-700 px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-700"
                >
                  {t('cp.area.convert')}
                </button>
                <button
                  onClick={onImportCancel}
                  className="rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700"
                >
                  {t('cp.area.cancel')}
                </button>
              </div>
            </div>
          )}

          {importError && (
            <p
              data-testid="import-error"
              className="mt-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300"
            >
              ⚠ {errorText(importError, t)}
            </p>
          )}
          {importWarning && (
            <div className="mt-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-200">
              ⚠ {importWarning}
              {importParts && onImportUseAll && (
                <button
                  type="button"
                  onClick={onImportUseAll}
                  className="mt-1.5 block rounded border border-amber-700 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-900/60"
                >
                  {t('cp.area.importUseAll')}
                </button>
              )}
            </div>
          )}
          {mode === 'draw' && (
            <div className="mt-2 space-y-2">
              <p className="text-xs leading-relaxed text-slate-400">
                {t('cp.area.drawHintA', { n: draftCount })}{' '}
                <strong className="text-slate-300">Backspace</strong> /{' '}
                <strong className="text-slate-300">Ctrl+Z</strong> {t('cp.area.drawHintB')}{' '}
                <strong className="text-slate-300">{t('cp.area.drawHintFirst')}</strong>,{' '}
                <strong className="text-slate-300">{t('cp.area.drawHintDblClick')}</strong>{' '}
                {t('cp.area.drawHintC')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onUndoVertex}
                  disabled={draftCount === 0}
                  className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↩ {t('cp.area.undoVertex')}
                </button>
                <button
                  onClick={onFinishDraw}
                  disabled={draftCount < 3}
                  className="flex items-center justify-center gap-1.5 rounded bg-emerald-700 px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconCheck /> {t('cp.area.finish')}
                </button>
              </div>
            </div>
          )}

          {mode === 'anchor' && (
            <div className="mt-2 space-y-1 rounded border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-xs text-slate-400">{t('cp.area.anchorHint')}</p>
              <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">
                {t('cp.area.quickSizes')}
              </p>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {[250, 500, 750, 1000].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setAnchorParam('length', s)
                      if (anchor.shape !== 'square') setAnchorParam('width', s)
                    }}
                    title={
                      s === 250
                        ? t('cp.area.sizeTitleBattery', {
                            s,
                            min: squareMinutes ? Math.round(squareMinutes(s)) : '—',
                          })
                        : t('cp.area.sizeTitle', { s })
                    }
                    className={`rounded px-1 py-1.5 text-xs font-medium transition-colors ${
                      anchor.length === s && anchor.width === s
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s}²
                  </button>
                ))}
              </div>
              {anchor.shape === 'square' ? (
                <Field label={t('cp.area.side')} suffix="m">
                  <NumberInput
                    value={anchor.length}
                    min={10}
                    onChange={(v) => setAnchorParam('length', v)}
                  />
                </Field>
              ) : (
                <>
                  <Field label={t('cp.area.length')} suffix="m">
                    <NumberInput
                      value={anchor.length}
                      min={10}
                      onChange={(v) => setAnchorParam('length', v)}
                    />
                  </Field>
                  <Field label={t('cp.area.width')} suffix="m">
                    <NumberInput
                      value={anchor.width}
                      min={10}
                      onChange={(v) => setAnchorParam('width', v)}
                    />
                  </Field>
                </>
              )}
              <Field label={t('cp.area.orientation')} suffix="°">
                <NumberInput
                  value={anchor.orientation}
                  min={0}
                  max={360}
                  onChange={(v) => setAnchorParam('orientation', v)}
                />
              </Field>
            </div>
          )}

          {hasRing && mode !== 'draw' && !gridActive && split.mode !== 'tiles' && (
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {t('cp.area.editHintA')}{' '}
              <strong className="text-slate-400">{t('cp.area.editHintInsert')}</strong>{' '}
              {t('cp.area.editHintB')}{' '}
              <strong className="text-slate-400">{t('cp.area.editHintRemove')}</strong>.
            </p>
          )}

          {hasRing && (
            <button
              onClick={onClear}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-300 transition-colors hover:bg-red-900/60 hover:text-red-200"
            >
              <IconTrash /> {t('cp.area.clear')}
            </button>
          )}

          {hasRing && !validation.valid && (
            <div className="mt-3 rounded border border-red-700 bg-red-950/60 p-3 text-xs leading-relaxed text-red-300">
              ⚠ <strong>{t('cp.area.invalidTitle')}</strong> {t('cp.area.invalidBody')}
            </div>
          )}

          {planError === 'too-many-lines' && (
            <div className="mt-3 rounded border border-red-700 bg-red-950/60 p-3 text-xs leading-relaxed text-red-300">
              ⛔ {t('cp.area.tooManyLines')}
            </div>
          )}
          {planError && planError !== 'too-many-lines' && (
            <div className="mt-3 rounded border border-red-700 bg-red-950/60 p-3 text-xs leading-relaxed text-red-300">
              ⚠ {t(`cp.area.planError.${planError}`, { cells: (planErrorCells ?? []).join(', ') })}
            </div>
          )}
          <div className="mt-3 border-t border-slate-800 pt-3">
            {!terrainReady && terrainButtons}
            <input
              ref={demFileRef}
              type="file"
              accept=".tif,.tiff"
              className="hidden"
              onChange={(e) => {
                onImportDem(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button
              onClick={onShowProfile}
              disabled={!(terrain.status === 'ready' && terrainCovers)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChart /> {t('cp.terrain.profile')}
            </button>

            {rememberedDem && (
              <p
                data-testid="dem-remembered"
                className="mt-2 rounded border border-slate-700 bg-slate-900 p-2 text-xs leading-relaxed text-slate-300"
              >
                {t(
                  rememberedDem.surface === 'dsm'
                    ? 'cp.terrain.rememberedDsm'
                    : 'cp.terrain.rememberedDtm',
                  { file: rememberedDem.label },
                )}
              </p>
            )}

            {terrain.status === 'ready' && terrain.data?.source === 'file' && (
              <div className="mt-2 rounded border border-emerald-800 bg-emerald-950/40 p-2 text-xs leading-relaxed text-emerald-200">
                <p>
                  {t(demSurface === 'dsm' ? 'cp.terrain.localDsm' : 'cp.terrain.localDem')}{' '}
                  <strong>{terrain.data.label}</strong>{' '}
                  {t('cp.terrain.demGrid', {
                    crs: terrain.data.crsCode,
                    res: terrain.data.resolutionM?.toFixed(1),
                  })}
                </p>
                {onDemSurface && (
                  <div
                    className="mt-1.5 flex items-center gap-1.5"
                    title={t('cp.terrain.surfaceHint')}
                  >
                    <span className="text-emerald-300">{t('cp.terrain.surface')}</span>
                    {[
                      { value: 'dtm', key: 'cp.terrain.surfaceDtm' },
                      { value: 'dsm', key: 'cp.terrain.surfaceDsm' },
                    ].map(({ value, key }) => (
                      <button
                        key={value}
                        type="button"
                        data-testid={`dem-surface-${value}`}
                        aria-pressed={demSurface === value}
                        onClick={() => onDemSurface(value)}
                        className={`rounded px-2 py-0.5 font-medium transition-colors ${
                          demSurface === value
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {terrain.status === 'error' && (
              <p className="mt-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
                ⚠ {terrainErrText(terrain.error, t)}
              </p>
            )}
            {terrain.status === 'ready' && !terrainCovers && (
              <p className="mt-2 rounded border border-red-700 bg-red-950/60 p-2 text-xs leading-relaxed text-red-300">
                ⛔ {t('cp.terrain.outOfCoverage')}
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              {terrain.data?.source === 'file'
                ? t('cp.terrain.sourceHintFile', {
                    label: terrain.data.label,
                    res: terrain.data.resolutionM?.toFixed(1),
                  })
                : t('cp.terrain.sourceHint')}
            </p>
            {terrain.status === 'ready' && terrain.data?.verticalDatum?.kind === 'ellipsoidal' && (
              <p className="mt-1.5 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs leading-relaxed text-amber-200">
                ⚠ {t('cp.terrain.datumEllipWarn')}
              </p>
            )}
            {slopeHint && (
              <p className="mt-2 text-xs leading-relaxed text-sky-300">
                {t('cards.slopeAvailable', { slope: Math.round(slopeHint.slopeDeg) })}
              </p>
            )}
          </div>
        </Card>

        {/* 3. Parâmetros de voo */}
        <Card id="voo" n={3} title={t('cards.flight')} more={d.more('voo')}>
          <Field
            label={terrainFollow?.enabled ? t('cp.flight.altitudeTf') : t('cp.flight.altitudeRel')}
            suffix="m"
          >
            <NumberInput
              value={params.altitude}
              min={5}
              max={1500}
              onChange={(v) => setParam('altitude', v)}
            />
          </Field>
          {!terrainFollow?.enabled &&
            Number.isFinite(routeClearance?.minM) &&
            Number.isFinite(routeClearance?.maxM) && (
              <p
                data-testid="agl-over-area"
                className={`-mt-1 mb-2 text-xs leading-relaxed ${
                  routeClearance.minM < params.altitude / 2 ? 'text-amber-300' : 'text-slate-400'
                }`}
              >
                {t('cp.flight.aglOverArea', {
                  min: Math.round(routeClearance.minM),
                  max: Math.round(routeClearance.maxM),
                })}
              </p>
            )}
          {gsd != null && (
            <Field label={t('cp.flight.gsdTarget')} suffix="cm/px">
              <NumberInput
                value={Number(gsd.toFixed(2))}
                min={0.1}
                step={0.1}
                onChange={onGsdTarget}
              />
            </Field>
          )}
          {params.altitude > 120 && (
            <p className="mb-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs leading-relaxed text-amber-200">
              ⚠ {t('cp.flight.altWarnPre')} <strong>120 m AGL</strong> {t('cp.flight.altWarnPost')}
            </p>
          )}
          {aglWarn && (
            <p className="mb-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs leading-relaxed text-amber-200">
              ⚠{' '}
              {t('cp.flight.aglCapWarn', {
                payload: payload.label,
                cap: aglWarn.cap,
                worst: Math.round(aglWarn.worstAgl),
              })}
            </p>
          )}
          <Field
            label={`${t('cp.flight.speed')} (${aircraft.speedRange?.min ?? 1}–${aircraft.speedRange?.max ?? 20})`}
            suffix="m/s"
          >
            <NumberInput
              value={params.speed}
              min={aircraft.speedRange?.min ?? 1}
              max={aircraft.speedRange?.max ?? 20}
              step={0.5}
              onChange={(v) => setParam('speed', v)}
            />
          </Field>
          {triggerWarn && (
            <p className="mb-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs leading-relaxed text-amber-200">
              ⚠{' '}
              {t('cp.flight.triggerFast', {
                s: triggerWarn.actualS.toFixed(2),
                min: triggerWarn.minS.toFixed(1),
                vmax: triggerWarn.maxSpeed.toFixed(1),
              })}
            </p>
          )}
          <Field label={t('cp.flight.frontOverlap')} suffix="%">
            <NumberInput
              value={params.frontOverlap}
              min={0}
              max={95}
              onChange={(v) => setParam('frontOverlap', v)}
            />
          </Field>
          <div className={params.spacingMode === 'manual' ? 'opacity-40' : ''}>
            <Field label={t('cp.flight.sideOverlap')} suffix="%">
              <NumberInput
                value={params.sideOverlap}
                min={0}
                max={95}
                onChange={(v) => setParam('sideOverlap', v)}
              />
            </Field>
          </div>
          {waypointWarn != null && (
            <p className="mb-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-200">
              ⚠ {t('cp.flight.waypointWarn', { n: waypointWarn })}
            </p>
          )}
          <p className="mb-1 mt-3 text-xs uppercase tracking-wider text-slate-400">
            {t('cp.orientation.title')}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label={t('cards.lineAzimuth')}
              min={0}
              max={360}
              step={1}
              value={params.angle}
              onChange={(e) => setParam('angle', Number(e.target.value))}
              className="flex-1"
            />
            <NumberInput
              value={params.angle}
              label={t('cards.lineAzimuth')}
              min={0}
              max={360}
              onChange={(v) => setParam('angle', Math.max(0, Math.min(360, v)))}
            />
            <span className="text-xs text-slate-400">°</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{t('cp.orientation.azimuthHint')}</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[
              { key: 'cp.orientation.parallel', offset: 0 },
              { key: 'cp.orientation.perpendicular', offset: 90 },
              { key: 'cp.orientation.oblique45', offset: 45 },
            ].map(({ key, offset }) => (
              <button
                key={offset}
                onClick={() => onSetAngleRelative(offset)}
                disabled={refAzimuth == null}
                title={t('cp.orientation.relativeTitle')}
                className="rounded bg-slate-800 px-1.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t(key)}
              </button>
            ))}
            <button
              onClick={onSetAngleOptimal}
              disabled={!hasRing || !validation.valid}
              title={t('cp.orientation.optimalTitle')}
              className="rounded bg-slate-800 px-1.5 py-1.5 text-xs font-medium text-sky-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('cp.orientation.optimal')}
            </button>
          </div>
          {refAzimuth != null && (
            <p className="mt-1 text-xs text-slate-400">
              {t('cp.orientation.reference', { deg: Math.round(refAzimuth) })}
            </p>
          )}
          <div className="mt-3 border-t border-slate-800 pt-1">
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={terrainFollow.enabled}
                // ligar exige relevo que cubra a área; desligar, nunca (a opção é
                // partilhada com o corredor e o circular)
                disabled={!terrainFollow.enabled && !(terrain.status === 'ready' && terrainCovers)}
                onChange={(e) => setTerrainFollow({ ...terrainFollow, enabled: e.target.checked })}
              />
              {t('cp.terrain.follow')}
            </label>

            {terrainFollow.enabled && (
              <div className="mt-1">
                <Field label={t('cp.terrain.tolerance')} suffix="m">
                  <NumberInput
                    value={terrainFollow.tolerance}
                    min={1}
                    max={20}
                    onChange={(v) => setTerrainFollow({ ...terrainFollow, tolerance: v })}
                  />
                </Field>
              </div>
            )}

            {terrainFollow.enabled && terrainResult && !terrainResult.error && (
              <div className="mt-1 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs leading-relaxed text-slate-400">
                {t('cp.terrain.result', {
                  min: Math.round(terrainResult.elevMin),
                  max: Math.round(terrainResult.elevMax),
                  n: terrainResult.waypoints.length,
                  ref: Math.round(terrainResult.refElev),
                })}
                {terrainResult.warnings?.map((w, i) => (
                  <p key={i} className="mt-1 text-amber-300">
                    ⚠ {errorText(w, t)}
                  </p>
                ))}
              </div>
            )}
            {terrainFollow.enabled && terrainResult?.error && (
              <p className="mt-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
                ⚠ {terrainErrorText(terrainResult, t)}
              </p>
            )}
          </div>
        </Card>

        {/* 4. Divisão em voos */}
        <Card id="divisao" n={4} title={t('cards.split')} more={d.more('divisao')}>
          {gridActive && (
            <p className="mb-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs leading-relaxed text-amber-200">
              {t('cp.split.gridActive')}
            </p>
          )}
          {!gridActive && (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { value: 'none', key: 'cp.split.modeNone' },
                { value: 'area', key: 'cp.split.modeArea' },
                { value: 'battery', key: 'cp.split.modeBattery' },
                { value: 'tiles', key: 'cp.split.modeTiles' },
              ].map(({ value, key }) => (
                <button
                  key={value}
                  onClick={() => setSplitParam('mode', value)}
                  className={`rounded px-1 py-1.5 text-xs font-medium transition-colors ${
                    split.mode === value
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          )}
          {!gridActive && split.mode === 'tiles' && (
            <div className="mt-2">
              <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">
                {t('cp.split.tileSideLabel')}
              </p>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {[250, 500, 750, 1000].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSplitParam('tileSize', s)}
                    className={`rounded px-1 py-1.5 text-xs font-medium transition-colors ${
                      split.tileSize === s
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s} m
                  </button>
                ))}
              </div>
              <Field label={t('cp.split.customSide')} suffix="m">
                <NumberInput
                  value={split.tileSize}
                  min={50}
                  max={5000}
                  step={50}
                  onChange={(v) => setSplitParam('tileSize', v)}
                />
              </Field>
              {tilesError === 'too-many-cells' && (
                <p className="mt-2 rounded border border-amber-700 bg-amber-950/60 p-2 text-xs leading-relaxed text-amber-300">
                  ⚠ {t('cp.split.tooManyCellsTile')}
                </p>
              )}
            </div>
          )}
          {!gridActive && (
            <div className="mt-2">
              <Field label={t('cp.split.batteryType')}>
                <select
                  className="w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  data-testid="mission-battery"
                  value={battery?.id ?? ''}
                  onChange={(e) => onBatteryId(e.target.value)}
                >
                  {batteries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {batteryLabel(b, t)} · {b.usefulMin} min
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('cp.split.usefulMin')} suffix="min">
                <div className="flex items-center gap-1.5">
                  <NumberInput
                    value={usefulMin}
                    min={1}
                    max={120}
                    step={0.5}
                    onChange={onUsefulMin}
                    testId="mission-useful"
                  />
                  {usefulOverridden && battery && (
                    <button
                      data-testid="mission-useful-reset"
                      onClick={() => onUsefulMin(battery.usefulMin)}
                      title={t('cp.split.usefulResetTitle', { min: battery.usefulMin })}
                      className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                    >
                      {t('cp.split.usefulReset', { min: battery.usefulMin })}
                    </button>
                  )}
                </div>
              </Field>
              <p className="mb-2 text-xs leading-relaxed text-slate-400">
                {t('cp.split.usefulHint')}{' '}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 text-sky-400 underline hover:text-sky-300"
                >
                  <IconGear className="h-3 w-3" />
                  {t('app.settings')}
                </button>
                .
                {battery?.estimated && !usefulOverridden && (
                  <span className="text-amber-300/90"> {t('cp.split.estimated')}</span>
                )}
              </p>
            </div>
          )}
          {!gridActive && split.mode === 'area' && (
            <Field label={t('cp.split.maxAreaPerBlock')} suffix="ha">
              <NumberInput
                value={split.maxAreaHa}
                min={0.5}
                step={0.5}
                onChange={(v) => setSplitParam('maxAreaHa', v)}
              />
            </Field>
          )}
          {!gridActive && split.mode === 'battery' && (
            <div className="mt-2">
              {tileSide != null && (
                <p className="mb-2 rounded border border-sky-800 bg-sky-950/40 p-2 text-xs leading-relaxed text-sky-200">
                  {t('cp.split.squareBlocks')}{' '}
                  <strong>
                    {tileSide} × {tileSide} m
                  </strong>
                  {t('cp.split.batteryUse', { min: usefulMin })}{' '}
                  {t('cp.split.transitCorner', { r: zoneRadiusM })}.
                </p>
              )}
              {tilesError === 'too-many-cells' && (
                <p className="mt-2 rounded border border-amber-700 bg-amber-950/60 p-2 text-xs leading-relaxed text-amber-300">
                  ⚠ {t('cp.split.tooManyCellsBattery')}
                </p>
              )}
            </div>
          )}
          {(gridActive || split.mode !== 'none') && blocks && (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded border border-slate-800 bg-slate-900/60 p-2">
              {[...blocks]
                .sort(
                  (a, b) =>
                    (baseLayout?.byBlock[a.id]?.flight ?? a.id) -
                    (baseLayout?.byBlock[b.id]?.flight ?? b.id),
                )
                .map((b) => {
                  const f = baseLayout?.byBlock[b.id]
                  return (
                    <div
                      key={b.id}
                      data-testid="block-row"
                      data-block-id={b.id}
                      data-flight={f?.flightLabel ?? ''}
                      className="flex items-center justify-between text-xs text-slate-300"
                    >
                      <span
                        className="font-mono text-sky-300"
                        title={
                          f?.flightLabel
                            ? t('bases.flightLabel', { flight: f.flightLabel, id: b.id })
                            : undefined
                        }
                      >
                        {f?.baseId && (
                          <span
                            className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ backgroundColor: f.color }}
                          />
                        )}
                        {f?.flightLabel || String(b.id)}
                      </span>
                      <span>{b.areaHa.toFixed(1)} ha</span>
                      <span>{(b.lengthM / 1000).toFixed(1)} km</span>
                      <span className="font-mono">
                        {Math.round((b.timeS + (f?.transitS ?? 0)) / 60)} min
                      </span>
                    </div>
                  )
                })}
              <p className="pt-1 text-xs text-slate-400">{t('cp.split.exportHint')}</p>
            </div>
          )}
        </Card>

        {/* 5. Bases e segurança */}
        <Card id="bases" n={5} title={t('cards.bases')} more={d.more('bases')}>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={onStartBase}
              title={t('cp.area.baseTitle')}
              className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-medium transition-colors ${
                mode === 'base'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <IconHelipad /> {t('cp.area.markBase')}
            </button>
            <button
              onClick={onRemoveBase}
              disabled={!hasBase}
              className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconTrash /> {t('cp.area.removeBase')}
            </button>
          </div>

          {mode === 'base' && (
            <p className="mt-2 text-xs text-slate-400">{t('cp.area.baseHint')}</p>
          )}
          {basesPanel && <BasesPanel {...basesPanel} part="list" />}
          <div className="mt-3 border-t border-slate-800 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('safety.title')}
            </p>
            <SafetyActions safety={safety} onChange={setSafety} />
            <RthLine info={rthInfo} />
          </div>
        </Card>

        {/* 6. Extras */}
        <Card id="extras" n={6} title={t('cards.extras')} more={d.more('extras')}>
          <p data-testid="extras-summary" className="text-xs leading-relaxed text-slate-300">
            {t('cards.extras.summary', {
              gcp: gcpConfig.enabled
                ? (gcpInfo?.count ?? gcpConfig.count ?? gcpAutoCount)
                : t('cards.extras.gcpOff'),
              n: inspectPoints?.length ?? 0,
            })}
          </p>
          {mode === 'inspect' && (
            <p className="mt-2 text-xs leading-relaxed text-orange-300">
              {t('cards.extras.inspecting')}
            </p>
          )}
        </Card>

        {/* 7. Resumo e exportar */}
        <Card id="resumo" n={7} title={t('cards.summary')}>
          <dl data-testid="summary-stats" className="grid grid-cols-2 gap-2 text-xs">
            {[
              [t('cards.summary.flights'), summary?.flights ? String(summary.flights) : '—'],
              [t('stats.time'), fmtTime(summary?.timeS)],
              [
                t('cards.summary.sets'),
                setsCheck && setsCheck.sets != null
                  ? t('cards.summary.setsValue', { n: setsCheck.flights, s: setsCheck.sets })
                  : setsCheck
                    ? t('cards.summary.setsUnknown', { n: setsCheck.flights })
                    : '—',
              ],
              ...(ops?.longest
                ? [
                    [
                      t('cards.summary.longest'),
                      `${ops.flights > 1 && ops.longest.label ? `${ops.longest.label} ` : ''}${fmtClock(ops.longest.timeS)}${ops.usefulS ? ` / ${fmtClock(ops.usefulS)}` : ''}`,
                      ops.level,
                    ],
                  ]
                : []),
              [
                t('stats.area'),
                Number.isFinite(summary?.areaHa) ? `${summary.areaHa.toFixed(2)} ha` : '—',
              ],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded bg-slate-900/80 px-2 py-1.5">
                <dt className="text-xs uppercase tracking-wider text-slate-400">{k}</dt>
                <dd
                  data-tone={tone ?? undefined}
                  className={`font-mono text-sm ${
                    tone === 'over'
                      ? 'text-red-300'
                      : tone === 'near'
                        ? 'text-amber-300'
                        : 'text-sky-300'
                  }`}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <BatterySetsNote check={setsCheck} battery={batteryLabel(battery, t)} />
          {preflightBlockers.length > 0 && (
            <div
              data-testid="summary-blockers"
              className="mt-3 rounded border border-red-800/60 bg-red-950/40 p-2 text-xs leading-relaxed text-red-200"
            >
              <p className="font-semibold">⛔ {t('cards.summary.blocked')}</p>
              {preflightBlockers.map((txt, i) => (
                <p key={i} className="mt-1">
                  {txt}
                </p>
              ))}
              {onShowPreflight && (
                <button
                  type="button"
                  onClick={onShowPreflight}
                  className="mt-1.5 rounded border border-current px-2 py-0.5 text-xs font-medium hover:bg-white/10"
                >
                  {t('cards.summary.seeAll')}
                </button>
              )}
            </div>
          )}
          {exportFlights && exportFlights.files.length > 1 && (
            <FlightExports {...exportFlights} rows={basesPanel.rows} />
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {onExportMission && (
              <button
                type="button"
                data-testid="summary-export-mission"
                onClick={onExportMission}
                disabled={!canExportMission}
                title={t(
                  baseLayout?.hasBases
                    ? 'cards.summary.exportMissionByBaseTitle'
                    : 'cards.summary.exportMissionTitle',
                )}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded bg-sky-700 px-2 text-xs font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconDownload />{' '}
                {t(
                  baseLayout?.hasBases
                    ? 'cards.summary.exportMissionByBase'
                    : 'cards.summary.exportMission',
                )}
              </button>
            )}
            {onExportArea && (
              <button
                type="button"
                data-testid="summary-export-area"
                onClick={onExportArea}
                disabled={!canExportArea}
                title={[t('cards.summary.exportAreaTitle'), ...exportAreaNotes].join(' ')}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded bg-slate-800 px-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconDownload /> {t('cards.summary.exportArea')}
              </button>
            )}
          </div>
          {exportAreaNotes.length > 0 && (
            <p
              data-testid="summary-export-area-notes"
              className="mt-2 text-xs leading-relaxed text-amber-300/90"
            >
              {exportAreaNotes.join(' ')}
            </p>
          )}
        </Card>
      </CardColumn>

      {/* ---------------- gavetas («Mais opções ›») ---------------- */}
      <Drawer id="missao" title={t('cards.mission')} {...d.drawer('missao')}>
        {presets?.length > 0 && (
          <DrawerGroup title={t('cards.preset')}>
            {(() => {
              const activeId =
                presets.find((p) => Object.entries(p.values).every(([k, v]) => params[k] === v))
                  ?.id ?? ''
              const chosen = presets.find((p) => p.id === activeId)
              return (
                <div className="mb-3">
                  <label className="mb-1 flex items-center justify-between gap-2 text-sm text-slate-300">
                    <span>{t('cp.preset.label')}</span>
                    <select
                      className="w-44 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                      value={activeId}
                      onChange={(e) => {
                        if (e.target.value) onApplyPreset(e.target.value)
                      }}
                    >
                      <option value="">{t('cp.preset.custom')}</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name[lang] ?? p.name.pt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs leading-relaxed text-slate-400">
                    {chosen ? (chosen.desc[lang] ?? chosen.desc.pt) : t('cp.preset.hint')}
                  </p>
                </div>
              )
            })()}
          </DrawerGroup>
        )}
        {(payload.type === 'lidar' || isCustom) && (
          <DrawerGroup title={t('cards.sensor')}>
            {payload.type === 'lidar' && (
              <div className="mt-2">
                <Field label={t('cp.drone.effectiveFov')} suffix="°">
                  <div className="flex items-center gap-1.5">
                    <NumberInput
                      value={effectiveFov ?? payload.fov}
                      min={5}
                      max={payload.fov}
                      step={0.1}
                      onChange={onEffectiveFov}
                    />
                    {effectiveFov != null && (
                      <button
                        onClick={() => onEffectiveFov(payload.fov)}
                        title={t('cp.drone.effectiveFovResetTitle', { fov: payload.fov })}
                        className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                      >
                        {t('cp.drone.effectiveFovReset')}
                      </button>
                    )}
                  </div>
                </Field>
                <p className="text-xs leading-relaxed text-slate-400">
                  {t('cp.drone.effectiveFovHint')}
                </p>
              </div>
            )}
            {isCustom && (
              <div className="mt-2 space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex gap-4 text-sm text-slate-300">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={custom.mode === 'camera'}
                      onChange={() => setCustom({ ...custom, mode: 'camera' })}
                    />
                    {t('cp.drone.camera')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={custom.mode === 'lidar'}
                      onChange={() => setCustom({ ...custom, mode: 'lidar' })}
                    />
                    {t('cp.drone.lidar')}
                  </label>
                </div>

                {custom.mode === 'camera' ? (
                  <>
                    <Field label={t('cp.drone.sensorWidth')} suffix="mm">
                      <NumberInput
                        value={custom.sensorWidth}
                        step={0.1}
                        min={1}
                        onChange={(v) => setCustom({ ...custom, sensorWidth: v })}
                      />
                    </Field>
                    <Field label={t('cp.drone.sensorHeight')} suffix="mm">
                      <NumberInput
                        value={custom.sensorHeight}
                        step={0.1}
                        min={1}
                        onChange={(v) => setCustom({ ...custom, sensorHeight: v })}
                      />
                    </Field>
                    <Field label={t('cp.drone.focalLength')} suffix="mm">
                      <NumberInput
                        value={custom.focalLength}
                        step={0.1}
                        min={1}
                        onChange={(v) => setCustom({ ...custom, focalLength: v })}
                      />
                    </Field>
                    <Field label={t('cp.drone.imageWidth')} suffix="px">
                      <NumberInput
                        value={custom.imageWidth}
                        min={100}
                        onChange={(v) => setCustom({ ...custom, imageWidth: v })}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label={t('cp.drone.fov')} suffix="°">
                    <NumberInput
                      value={custom.fov}
                      min={1}
                      max={179}
                      onChange={(v) => setCustom({ ...custom, fov: v })}
                    />
                  </Field>
                )}

                <p className="pt-1 text-xs text-slate-400">{t('cp.drone.wpmlEnums')}</p>
                {/* on a real aircraft the drone enum is the aircraft's own;
                only the CUSTOM aircraft exposes it for editing */}
                {aircraft.id === 'CUSTOM' && (
                  <Field label="droneEnumValue">
                    <NumberInput
                      value={custom.droneEnumValue}
                      min={0}
                      onChange={(v) => setCustom({ ...custom, droneEnumValue: v })}
                    />
                  </Field>
                )}
                <Field label="payloadEnumValue">
                  <NumberInput
                    value={custom.payloadEnumValue}
                    min={0}
                    onChange={(v) => setCustom({ ...custom, payloadEnumValue: v })}
                  />
                </Field>
              </div>
            )}
          </DrawerGroup>
        )}
      </Drawer>

      <Drawer id="area" title={t('cards.area')} {...d.drawer('area')}>
        {mode === 'anchor' && (
          <DrawerGroup title={t('cards.anchorShape')}>
            <p className="pb-1 pt-2 text-xs uppercase tracking-wider text-slate-400">
              {t('cp.area.blockGrid')}
            </p>
            <Field label={t('cp.area.cols')}>
              <NumberInput
                value={anchor.cols}
                min={1}
                max={12}
                onChange={(v) => setAnchorParam('cols', v)}
              />
            </Field>
            <Field label={t('cp.area.rows')}>
              <NumberInput
                value={anchor.rows}
                min={1}
                max={12}
                onChange={(v) => setAnchorParam('rows', v)}
              />
            </Field>
            <p className="pt-1 text-xs leading-relaxed text-slate-400">{t('cp.area.gridHint')}</p>
          </DrawerGroup>
        )}
        {slopeHint && (
          <DrawerGroup title={t('cards.slope')}>
            {slopeHint && (
              <div className="mt-2 rounded border border-sky-800 bg-sky-950/40 p-2 text-xs leading-relaxed text-sky-200">
                {t('cp.terrain.slopeHint', {
                  slope: Math.round(slopeHint.slopeDeg),
                  az: Math.round(slopeHint.downhillAzimuthDeg),
                  lines: Math.round(slopeHint.contourAzimuthDeg),
                })}
                <div className="mt-1.5 grid grid-cols-1 gap-2">
                  <button
                    onClick={onApplySlopeAngle}
                    className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
                  >
                    {t('cp.terrain.slopeApplyLines', {
                      lines: Math.round(slopeHint.contourAzimuthDeg),
                    })}
                  </button>
                </div>
              </div>
            )}
          </DrawerGroup>
        )}
        <DrawerGroup title={t('cards.terrainSource')}>
          {terrainReady && (
            <>
              <p className="mb-2 text-xs text-slate-400">{t('cards.terrainReload')}</p>
              {terrainButtons}
            </>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{t('cp.terrain.auto')}</p>
          {terrain.status === 'ready' &&
            terrain.data?.cacheEnabled &&
            terrain.data.cachedCount > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {t('cp.terrain.cacheHint', {
                  hits: terrain.data.cachedCount,
                  total: terrain.data.tileCount,
                })}
              </p>
            )}
          {terrain.status === 'ready' && terrain.data?.verticalDatum && (
            <p className="mt-1 text-xs text-slate-400" data-testid="terrain-datum">
              {t('cp.terrain.datum', { datum: datumLabel(terrain.data.verticalDatum, t) })}
            </p>
          )}
        </DrawerGroup>
      </Drawer>

      <Drawer id="voo" title={t('cards.flight')} {...d.drawer('voo')}>
        <DrawerGroup title={t('cards.lines')}>
          <label className="mb-2 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={params.spacingMode === 'manual'}
              onChange={(e) => setParam('spacingMode', e.target.checked ? 'manual' : 'auto')}
            />
            {t('cp.flight.manualSpacing')}
          </label>
          {params.spacingMode === 'manual' && (
            <Field label={t('cp.flight.lineDistance')} suffix="m">
              <NumberInput
                value={params.manualSpacing}
                min={1}
                max={2000}
                onChange={(v) => setParam('manualSpacing', v)}
              />
            </Field>
          )}
          <p className="mb-1 mt-2 text-xs uppercase tracking-wider text-slate-400">
            {t('cp.buffer.title')}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 10, 20, 30].map((pct) => (
              <button
                key={pct}
                onClick={() => setParam('bufferPct', pct)}
                className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                  params.bufferPct === pct
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
          {params.bufferPct > 0 && bufferM > 0 && (
            <p data-testid="buffer-metres" className="mt-1 text-xs text-slate-400">
              {t('cp.buffer.metres', { m: Math.round(bufferM), pct: params.bufferPct })}
            </p>
          )}
        </DrawerGroup>
        <DrawerGroup title={t('cards.capture')}>
          <Field label={t('cp.flight.triggerBy')}>
            <select
              className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={
                payload.type === 'camera' || params.triggerMode !== 'waypoint'
                  ? params.triggerMode
                  : 'distance'
              }
              onChange={(e) => setParam('triggerMode', e.target.value)}
            >
              <option value="distance">{t('cp.flight.triggerDistance')}</option>
              <option value="time">{t('cp.flight.triggerTime')}</option>
              {/* B: foto por waypoint só faz sentido com câmara */}
              {payload.type === 'camera' && (
                <option value="waypoint">{t('cp.flight.triggerWaypoint')}</option>
              )}
            </select>
          </Field>
          {payload.type === 'camera' && params.triggerMode === 'waypoint' && (
            <p className="-mt-1 mb-2 text-xs leading-relaxed text-slate-400">
              {t('cp.flight.triggerWaypointHint')}
            </p>
          )}
          {/* só há pontos intermédios com foto por waypoint ou seguimento de terreno */}
          {((payload.type === 'camera' && params.triggerMode === 'waypoint') ||
            terrainFollow.enabled) && (
            <>
              <Field label={t('cp.flight.stops')}>
                <select
                  className="w-40 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  value={params.waypointStops === 'all' ? 'all' : 'corners'}
                  onChange={(e) => setParam('waypointStops', e.target.value)}
                >
                  <option value="corners">{t('cp.flight.stopsCorners')}</option>
                  <option value="all">{t('cp.flight.stopsAll')}</option>
                </select>
              </Field>
              <p className="-mt-1 mb-2 text-xs leading-relaxed text-slate-400">
                {t('cp.flight.stopsHint')}
              </p>
            </>
          )}
          <Field label={t('cp.flight.gimbalPitch')} suffix="°">
            <NumberInput
              value={params.gimbalPitch}
              min={-90}
              max={0}
              step={5}
              onChange={(v) => setParam('gimbalPitch', Math.max(-90, Math.min(0, v)))}
            />
          </Field>
          <p className="text-xs text-slate-400">{t('cp.flight.gimbalHint')}</p>
          <div className="mt-2">
            <Field label={t('cp.flight.overshoot')} suffix="m">
              <NumberInput
                value={params.overshoot}
                min={0}
                max={100}
                step={5}
                onChange={(v) => setParam('overshoot', Math.max(0, Math.min(100, v)))}
              />
            </Field>
            <p className="text-xs leading-relaxed text-slate-400">{t('cp.flight.overshootHint')}</p>
          </div>
        </DrawerGroup>
        <DrawerGroup title={t('cards.passes')}>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={params.crosshatch}
              onChange={(e) => setParam('crosshatch', e.target.checked)}
            />
            {t('cp.orientation.crosshatch')}
          </label>
          {params.crosshatch && (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {t('cp.orientation.crosshatchHint', { deg: (params.angle + 90) % 360 })}
            </p>
          )}
          {params.crosshatch && (
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(params.includeNadir)}
                onChange={(e) => setParam('includeNadir', e.target.checked)}
              />
              {t('cp.orientation.includeNadir')}
            </label>
          )}
          {params.crosshatch && params.includeNadir && (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {t('cp.orientation.includeNadirHint')}
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(params.tieLine)}
              onChange={(e) => setParam('tieLine', e.target.checked)}
            />
            {t('cp.orientation.tieLine')}
          </label>
          {params.tieLine && (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {t('cp.orientation.tieLineHint')}
            </p>
          )}
        </DrawerGroup>
      </Drawer>

      <Drawer id="divisao" title={t('cards.split')} {...d.drawer('divisao')}>
        {gridActive && (
          <p className="mb-2 text-xs leading-relaxed text-slate-400">{t('cp.split.gridActive')}</p>
        )}
        {!gridActive && split.mode === 'none' && (
          <p className="text-xs leading-relaxed text-slate-400">{t('cards.splitNone')}</p>
        )}
        {!gridActive && split.mode === 'tiles' && (
          <DrawerGroup title={t('cards.cells')}>
            <MosaicOrientation
              split={split}
              setSplitParam={setSplitParam}
              tileOrientation={tileOrientation}
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={onTilesUndo}
                title={t('cp.split.undoTitle')}
                className="rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                ↩ {t('cp.split.undo')}
              </button>
              <button
                onClick={onTilesRestoreAll}
                className="rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                {t('cp.split.restoreAll')}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {t('cp.split.tilesHintA')}{' '}
              <strong className="text-slate-400">{t('cp.split.clickCell')}</strong>{' '}
              {t('cp.split.tilesHintB')}
              {tilesTotal != null && (
                <>
                  {' '}
                  <span className="text-sky-300">
                    {t('cp.split.cellsGenerated', { n: tilesTotal })}
                  </span>
                  {t('cp.split.cellsActive', { n: blocks ? blocks.length : 0 })}.
                </>
              )}
            </p>
          </DrawerGroup>
        )}
        {!gridActive && split.mode === 'battery' && (
          <DrawerGroup title={t('cards.cells')}>
            <Field label={t('cp.split.maxSide')} suffix="m">
              <NumberInput
                value={split.maxSide}
                min={100}
                max={2000}
                step={50}
                onChange={(v) => setSplitParam('maxSide', v)}
              />
            </Field>
            <MosaicOrientation
              split={split}
              setSplitParam={setSplitParam}
              tileOrientation={tileOrientation}
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={onTilesUndo}
                title={t('cp.split.undoTitle')}
                className="rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                ↩ {t('cp.split.undo')}
              </button>
              <button
                onClick={onTilesRestoreAll}
                className="rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                {t('cp.split.restoreAll')}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {t('cp.split.batteryHintA')}{' '}
              <strong className="text-slate-400">{t('cp.split.clickCell')}</strong>{' '}
              {t('cp.split.batteryHintB')}
              {!hasBase && ` ${t('cp.split.markBaseHint')}`}
              {tilesTotal != null && (
                <>
                  {' '}
                  <span className="text-sky-300">{t('cp.split.cells', { n: tilesTotal })}</span>
                  {t('cp.split.cellsActive', { n: blocks ? blocks.length : 0 })}.
                </>
              )}
            </p>
          </DrawerGroup>
        )}
      </Drawer>

      <Drawer id="bases" title={t('cards.bases')} {...d.drawer('bases')}>
        {viewshed && basesPanel?.rows.length > 0 && basesPanel?.hasBlocks ? (
          <ViewshedBox {...viewshed} />
        ) : (
          <p className="text-xs leading-relaxed text-slate-400">{t('cards.bases.noView')}</p>
        )}
      </Drawer>

      <Drawer id="extras" title={t('cards.extras')} {...d.drawer('extras')}>
        <DrawerGroup title={t('cp.gcp.title')}>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={gcpConfig.enabled}
              disabled={!hasRing}
              onChange={(e) => setGcpConfig({ ...gcpConfig, enabled: e.target.checked })}
            />
            {t('cp.gcp.plan')}
          </label>

          {gcpConfig.enabled && (
            <div className="mt-2">
              <Field label={t('cp.gcp.count')}>
                <div className="flex items-center gap-1.5">
                  <NumberInput
                    value={gcpConfig.count ?? gcpAutoCount}
                    min={1}
                    max={25}
                    onChange={(v) => setGcpConfig({ ...gcpConfig, count: v })}
                  />
                  <button
                    onClick={() => setGcpConfig({ ...gcpConfig, count: null })}
                    title={t('cp.gcp.autoTitle', { n: gcpAutoCount })}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      gcpConfig.count == null
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {t('cp.gcp.auto')}
                  </button>
                </div>
              </Field>
              {Object.keys(gcpConfig.manual ?? {}).length > 0 && (
                <p
                  className="mt-1 flex items-center gap-2 text-xs text-slate-400"
                  data-testid="gcp-manual"
                >
                  <span>{t('cp.gcp.manual', { n: Object.keys(gcpConfig.manual).length })}</span>
                  <button
                    onClick={() => setGcpConfig({ ...gcpConfig, manual: {} })}
                    className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    {t('cp.gcp.reset')}
                  </button>
                </p>
              )}
              {gcpInfo && (
                <p className="text-xs leading-relaxed text-slate-400">
                  {t('cp.gcp.info', {
                    count: gcpInfo.count,
                    ha: gcpInfo.haPerGcp?.toFixed(1),
                    spacing: Number.isFinite(gcpInfo.minSpacingM)
                      ? `${Math.round(gcpInfo.minSpacingM)} m`
                      : '—',
                  })}
                </p>
              )}
              <button
                onClick={onExportGcps}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-emerald-700 px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <IconDownload /> {t('cp.gcp.export')}
              </button>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{t('cp.gcp.hint')}</p>
            </div>
          )}
        </DrawerGroup>
        <DrawerGroup title={t('cp.inspect.title')}>
          <button
            onClick={onStartInspect}
            title={t('cp.inspect.markTitle')}
            className={`flex w-full items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-medium transition-colors ${
              mode === 'inspect'
                ? 'bg-orange-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconTarget /> {t('cp.inspect.mark')}
          </button>
          {mode === 'inspect' && (
            <p className="mt-2 text-xs text-slate-400">{t('cp.inspect.markHint')}</p>
          )}

          {inspectPoints?.length > 0 && (
            <div className="mt-2 space-y-2">
              {inspectPoints.map((p, i) => (
                <div
                  key={p.id}
                  className="cursor-grab rounded border border-slate-800 bg-slate-900/60 p-2 active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => {
                    // não iniciar o arrasto a partir dos campos de edição
                    const tag = /** @type {HTMLElement} */ (e.target)?.tagName
                    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
                      e.preventDefault()
                      return
                    }
                    dragIndexRef.current = i
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndexRef.current != null) onInspectReorder(dragIndexRef.current, i)
                    dragIndexRef.current = null
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 font-mono text-xs font-bold text-orange-300">
                      ⋮⋮ {i + 1}
                    </span>
                    <input
                      type="text"
                      className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                      value={p.label}
                      aria-label={t('cards.inspectName', { n: i + 1 })}
                      onChange={(e) => onInspectUpdate(p.id, { label: e.target.value })}
                    />
                    <button
                      aria-label={t('cp.inspect.moveUp', { n: i + 1 })}
                      onClick={() => onInspectMove(p.id, -1)}
                      disabled={i === 0}
                      className="rounded bg-slate-800 px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={t('cp.inspect.moveDown', { n: i + 1 })}
                      onClick={() => onInspectMove(p.id, 1)}
                      disabled={i === inspectPoints.length - 1}
                      className="rounded bg-slate-800 px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={t('cp.inspect.remove', { n: i + 1 })}
                      onClick={() => onInspectRemove(p.id)}
                      className="rounded bg-slate-800 px-1.5 py-1 text-xs text-slate-300 hover:bg-red-900/60 hover:text-red-200"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs text-slate-400">
                    <label className="flex items-center gap-1">
                      {t('cp.inspect.height')}
                      <input
                        type="number"
                        className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-right text-xs text-slate-100"
                        value={p.heightM}
                        min={2}
                        onChange={(e) => onInspectUpdate(p.id, { heightM: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-1" title={t('cp.inspect.headingTitle')}>
                      {t('cp.inspect.heading')}
                      <input
                        type="number"
                        className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-right text-xs text-slate-100"
                        value={p.heading ?? ''}
                        placeholder="—"
                        min={0}
                        max={359}
                        onChange={(e) =>
                          onInspectUpdate(p.id, {
                            heading:
                              e.target.value === ''
                                ? null
                                : Math.max(0, Math.min(359, Number(e.target.value))),
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-1" title={t('cp.inspect.pitchTitle')}>
                      {t('cp.inspect.pitch')}
                      <input
                        type="number"
                        className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-right text-xs text-slate-100"
                        value={p.gimbalPitch ?? ''}
                        placeholder="—"
                        min={-90}
                        max={20}
                        onChange={(e) =>
                          onInspectUpdate(p.id, {
                            gimbalPitch:
                              e.target.value === ''
                                ? null
                                : Math.max(-90, Math.min(20, Number(e.target.value))),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={p.photo !== false}
                      onChange={(e) => onInspectUpdate(p.id, { photo: e.target.checked })}
                    />
                    {t('cp.inspect.photo')}
                  </label>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onInspectSuggestOrder}
                  disabled={inspectPoints.length < 3}
                  title={t('cp.inspect.suggestTitle')}
                  className="rounded bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('cp.inspect.suggest')}
                </button>
                <button
                  onClick={onExportInspection}
                  disabled={!inspectTerrainOk || inspectPoints.length < 2}
                  className="flex items-center justify-center gap-1.5 rounded bg-sky-700 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconDownload /> {t('cp.inspect.export')}
                </button>
              </div>
              {!inspectTerrainOk && (
                <p className="text-xs leading-relaxed text-amber-300">
                  {t('cp.inspect.noTerrain')}
                </p>
              )}
              <p className="text-xs leading-relaxed text-slate-400">{t('cp.inspect.hint')}</p>
            </div>
          )}
        </DrawerGroup>
      </Drawer>
    </div>
  )
}
