import { useRef, useState } from 'react'
import { AIRCRAFT, PAYLOADS } from '../data/drones.js'
import { CRS_OPTIONS } from '../utils/importArea.js'
import { useLang, useT } from '../i18n.jsx'
import {
  IconBlocked,
  IconChart,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconFolder,
  IconGear,
  IconMountain,
  IconRings,
  IconShield,
  IconTarget,
  IconTrash,
  IconWarning,
} from './Icons.jsx'
import BatterySetsNote from './BatterySetsNote.jsx'
import NumberInput from './NumberInput.jsx'
import { droneForAircraft } from './AircraftPicker.jsx'
import BasesPanel, { FlightExports, ViewshedBox } from './BasesPanel.jsx'
import {
  CardColumn,
  Drawer,
  DrawerGroup,
  RthLine,
  SafetyActions,
  SelectBox,
  SelectChevron,
  SubSection,
  selectInput,
  useDrawers,
  useOnSignal,
  useSections,
} from './Cards.jsx'
import { Button, buttonClass } from './ui/Button.jsx'
import { Field, fieldBox, fieldInput } from './ui/Field.jsx'
import { Badge } from './ui/Pill.jsx'
import { MoreButton, Section } from './ui/Section.jsx'
import { Segmented } from './ui/Segmented.jsx'
import { Switch } from './ui/Switch.jsx'
import { errorText, terrainErrorText as terrainErrText } from '../utils/appError.js'
import { verticalDatumLabel } from '../utils/verticalDatum.js'
import { batteryLabel } from '../mission/equipment.js'
import { terrainWaypointCount } from '../mission/blocks.js'
import { missionExportLabel, rangeText, tCount } from '../i18n/format.js'
import { notesSince } from '../data/versionNotes.js'
import { versionBefore } from '../mission/project.js'

/** As secções abertas do painel da área, lembradas neste aparelho. */
const SECTIONS_KEY = 'dji-mission-planner:areaSections'

/** Linhas da tabela dos voos à vista antes de «Ver os N voos». */
const FLIGHT_ROWS = 6

/** Erro do seguimento de terreno (código de useAreaMission) na língua da interface. */
function terrainErrorText(res, t) {
  const key = `cp.terrain.err.${res.error}`
  const msg = t(key, { msg: res.detail ?? '' })
  return msg === key ? String(res.error) : msg
}

/** mm:ss (ou h:mm:ss), o mesmo formato do painel de métricas (M3-U13). */
function fmtClock(sec) {
  if (!Number.isFinite(sec)) return '—'
  const tt = Math.round(sec)
  const h = Math.floor(tt / 3600)
  const m = Math.floor((tt % 3600) / 60)
  const ss = String(tt % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
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

/** Um ângulo com o sinal menos tipográfico («−90»). */
const signed = (v) => String(v).replace('-', '−')

/** O nome curto da aeronave para o resumo: o código entre parênteses, ou o nome sem «DJI». */
function aircraftShort(a) {
  const code = /\(([^)]+)\)\s*$/.exec(a.label)
  return code ? code[1] : a.label.replace(/^DJI\s+/, '')
}

/** Caixas de aviso, erro e informação dentro de uma secção. */
const BOX = {
  warn: 'rounded-[9px] border border-[#5C4214] bg-[#1C160B] px-3 py-2.5 text-[#E9D8AE]',
  error: 'rounded-[9px] border border-[#7A2530] bg-[#2B1215] px-3 py-2.5 text-red-200',
  info: 'rounded-[9px] border border-[#1D3A55] bg-[#0B1D2E] px-3 py-2.5 text-[#C9E6F7]',
  plain: 'rounded-[9px] border border-slate-800 bg-sunken px-3 py-2.5 text-slate-300',
}
/** O texto das caixas. */
const SMALL = 'text-xs leading-relaxed'

/**
 * Aviso com o ícone à esquerda (o triângulo, ou o octógono de um bloqueio).
 * @param {{tone?: 'warn'|'error', children?: any, testId?: string}} props
 */
function Notice({ tone = 'warn', children = null, testId }) {
  const Icon = tone === 'error' ? IconBlocked : IconWarning
  return (
    <div data-testid={testId} className={`flex items-start gap-2.5 ${SMALL} ${BOX[tone]}`}>
      <Icon
        className={`mt-px h-4 w-4 flex-none ${tone === 'error' ? 'text-red-300' : 'text-amber-500'}`}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Um rótulo de grupo de controlos (o nome por cima de um controlo segmentado). */
const GroupLabel = ({ children }) => <span className="text-xs text-slate-400">{children}</span>

/**
 * Orientação dos quadrados do mosaico: por omissão paralelos às faixas (o
 * ângulo que o plano usa, também o "óptimo"); desligado, a orientação manual.
 */
function MosaicOrientation({ split, setSplitParam, tileOrientation }) {
  const t = useT()
  const auto = split.tileOrientationAuto !== false
  return (
    <div className="flex flex-col gap-2.5">
      <Switch
        label={t('cp.split.orientationAuto')}
        description={
          auto
            ? t('cp.split.orientationAutoHint', {
                deg: Number.isFinite(tileOrientation) ? Math.round(tileOrientation) : '-',
              })
            : null
        }
        checked={auto}
        testId="tile-orientation-auto"
        onChange={(on) => {
          // ao passar a manual parte-se da orientação que estava a ser usada
          if (!on && Number.isFinite(tileOrientation))
            setSplitParam('tileOrientation', Math.round(tileOrientation))
          setSplitParam('tileOrientationAuto', on)
        }}
      />
      {!auto && (
        <Field label={t('cp.split.meshOrientation')} unit="°" className="w-40">
          <NumberInput
            className={fieldInput}
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

/**
 * Botão dos Extras que abre a gaveta numa das suas partes (os GCP, os pontos
 * de inspecção): o nome, o estado à direita e a seta.
 */
function ExtrasButton({ icon, label, value, expanded, onToggle, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={expanded}
      aria-controls="drawer-extras"
      onClick={onToggle}
      className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border px-2.5 text-left text-[13px] font-medium transition-colors ${
        expanded
          ? 'border-[#2C4A68] bg-[#0F2438] text-sky-100'
          : 'border-slate-800 bg-sunken text-slate-100 hover:bg-raised'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      <span className="text-xs font-normal text-slate-400">{value}</span>
      <IconChevronRight className="h-3.5 w-3.5 flex-none text-slate-400" />
    </button>
  )
}

/**
 * Painel da área: sete secções numeradas pela ordem do trabalho — Missão,
 * Área e relevo, Parâmetros de voo, Divisão em voos, Bases e segurança,
 * Extras, Resumo e exportar —, cada uma com o essencial e, fechada, o resumo
 * numa linha; o resto de cada secção está na sua gaveta («Mais opções ›»,
 * src/components/Cards.jsx). As secções abertas ficam lembradas neste
 * aparelho; uma secção abre-se sozinha quando passa a ter alguma coisa a
 * dizer (um erro de importação, as medidas do rectângulo, a base escolhida
 * no mapa). Nenhum controlo se perdeu na passagem para as secções: o cenário
 * E2E `inventario-painel-area` verifica-os todos, na secção ou na gaveta.
 */
export default function ControlPanel({
  // grupos do App (o resultado de cada hook), desfeitos abaixo nos nomes que o corpo usa
  hw,
  areaParams,
  geom,
  area,
  terrainState,
  inspect,
  session,
  areaTools,
  baseActions,
  safetyChecks,
  missionName,
  setMissionName,
  params,
  mode,
  draftCount,
  hasRing,
  planError,
  planErrorCells,
  hasBase,
  setsCheck = null,
  onOpenSettings,
  gridActive,
  tilesTotal,
  aglWarn,
  // resumo operacional (voos, conjuntos, voo mais longo), para a secção 7 (M3-U13)
  ops = null,
  // os primeiros bloqueios do preflight, ditos na secção 7 (M3-U6)
  preflightBlockers = [],
  onShowPreflight = null,
  rememberedDem = null,
  onShowProfile,
  onExportInspection,
  inspectTerrainOk = true,
  onUndoVertex,
  // bases múltiplas: props de BasesPanel (null esconde a lista)
  basesPanel = null,
  // orientação efectiva dos quadrados (segue as faixas, ou a manual)
  tileOrientation = null,
  zoneRadiusM = 100,
  // acções de segurança (fim da missão, sinal perdido): secção 5
  safety = null,
  setSafety = (_next) => {},
  // secção 7: números da missão e exportação; os dois botões do fim são os
  // do cabeçalho, com as dicas deles
  summary = null,
  onExportMission = null,
  canExportMission = false,
  exportMissionTitle = null,
  exportAreaTitle = null,
  // avisos do KML da área: buracos, partes e células desactivadas que ficam
  // de fora ou dentro do polígono (K-B1, K-E1, K-M8 da revisão)
  exportAreaNotes = [],
}) {
  const {
    drone,
    setDrone,
    custom,
    setCustom,
    effectiveFov,
    setEffectiveFov: onEffectiveFov,
    equipmentBatteries: batteries = [],
    missionBatteryType: battery = null,
    batteryMin: usefulMin,
    batteryOverridden: usefulOverridden = false,
    setMissionBatteryId: onBatteryId,
    setUsefulMin: onUsefulMin,
  } = hw
  const {
    setParam,
    gsd,
    setAltitudeFromGsd: onGsdTarget,
    flightPresets: presets,
    applyPreset: onApplyPreset,
    triggerWarn,
    // intervalo de disparo efectivo e sobreposição frontal resultante (triggerInterval)
    trigger = null,
    // espaçamento entre faixas automático (pela sobreposição lateral)
    spacing = null,
  } = areaParams
  const {
    validation,
    anchor,
    setAnchorParam,
    refAzimuth,
    split,
    setSplitParam,
    tilesError,
    tileSide,
    importState,
    importError,
    importWarning = null,
    importParts = null,
    useAllImportedParts: onImportUseAll = null,
    handleImportFile: onImportFile,
    handleImportCrs: onImportCrs,
    cancelImport: onImportCancel,
    undoEdit: onTilesUndo,
    restoreAllTiles: onTilesRestoreAll,
    handleFinishDraw: onFinishDraw,
    clearAll: onClear,
  } = geom
  const {
    blocks,
    waypointWarn,
    terrainResult,
    gcpConfig,
    setGcpConfig,
    gcpAutoCount,
    gcpInfo,
    handleExportGcps: onExportGcps,
    // voos por bloco (layoutBlocks): rótulo "A-1" e cor da base
    baseLayout = null,
    // secção 7: exportação do KML da área, e o que a da missão escreve
    // ('kmz' | 'zip'), para o botão dizer o que sai
    handleExportKML: onExportArea = null,
    canExportKML: canExportArea = false,
    exportKind = 'kmz',
  } = area
  const {
    terrain,
    terrainCovers,
    terrainFollow,
    setTerrainFollow,
    handleLoadTerrain: onLoadTerrain,
    handleImportDem: onImportDem,
    demSurface = 'dtm',
    setDemSurface: onDemSurface = null,
    slopeHint,
  } = terrainState
  const {
    inspectPoints,
    startInspect: onStartInspect,
    updateInspectPoint: onInspectUpdate,
    removeInspectPoint: onInspectRemove,
    moveInspectPoint: onInspectMove,
    reorderInspectPoints: onInspectReorder,
    suggestInspectOrder: onInspectSuggestOrder,
  } = inspect
  const {
    // o projecto que não abriu: na secção 1, junto do botão (M3-U18)
    projectError = null,
    // o projecto aberto foi gravado por uma versão anterior (M3-U17): {saved, now}
    projectVersion = null,
    dismissVersionNote: onDismissVersionNote = null,
    exportProject: onProjectExport,
    importProject: onProjectImport,
  } = session
  const {
    // margem em metros (M3-U22) e minutos de um quadrado (M3-U20)
    bufferM = 0,
    squareMinutes = null,
    applySlopeAngle: onApplySlopeAngle,
    setAngleRelative: onSetAngleRelative,
    setAngleOptimal: onSetAngleOptimal,
  } = areaTools
  const { startBase: onStartBase, removeBase: onRemoveBase } = baseActions
  const {
    // folga ao solo da rota (min/max), para o intervalo AGL sobre a área (M3-U2)
    clearance: routeClearance = null,
    // altura de regresso (RTH) e subida de descolagem escritas no KMZ (M3-U3)
    rthInfo = null,
  } = safetyChecks
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
  // a tabela dos voos toda à vista, ou só as primeiras linhas
  const [allFlights, setAllFlights] = useState(false)

  const d = useDrawers()
  // abertas à partida: a da área (é por ali que se começa) e, quando há
  // área, também a dos parâmetros de voo; o resto, fechado
  const S = useSections(SECTIONS_KEY, { area: true, voo: hasRing })
  const sec = (id) => ({ open: S.isOpen(id), onToggle: () => S.toggle(id) })
  const more = (id, label, part = null) => {
    const m = d.more(id, part)
    return (
      <MoreButton
        label={label}
        onClick={m.onToggle}
        expanded={m.expanded}
        controls={`drawer-${id}`}
        testId={`card-more-${id}`}
      />
    )
  }
  // o que aparece numa secção fechada abre-a: o projecto que não abriu (ou
  // de uma versão anterior), o ficheiro da área (coordenadas, erro, partes),
  // o desenho e as medidas do rectângulo, marcar uma base, a base escolhida
  // no mapa e marcar os pontos de inspecção
  useOnSignal(projectError, () => S.setOpen('missao', true))
  useOnSignal(projectVersion, () => S.setOpen('missao', true))
  useOnSignal(importState, () => S.setOpen('area', true))
  useOnSignal(importError, () => S.setOpen('area', true))
  useOnSignal(importWarning, () => S.setOpen('area', true))
  useOnSignal(mode === 'draw' || mode === 'anchor' ? mode : null, () => S.setOpen('area', true))
  useOnSignal(mode === 'base' ? mode : null, () => S.setOpen('bases', true))
  useOnSignal(basesPanel?.selectedBaseId, () => S.setOpen('bases', true))
  useOnSignal(mode === 'inspect' ? mode : null, () => S.setOpen('extras', true))

  const terrainReady = terrain.status === 'ready'
  const exportFlights = basesPanel?.exportFlights ?? null
  // com vários voos, as escolhas (todos, por base, um voo; KMZ e KML) em
  // «Exportar voos», por cima do par do cabeçalho
  const perFlight = Boolean(exportFlights && exportFlights.files.length > 1)
  const viewshed = basesPanel?.viewshed ?? null
  const tf = Boolean(terrainFollow?.enabled)
  // descarregar o relevo global e importar um MDT: na secção enquanto não há
  // relevo; depois, na gaveta (reimportar ou voltar ao global)
  const terrainButtons = (
    <div className="grid grid-cols-1 gap-2">
      <Button
        onClick={onLoadTerrain}
        disabled={!hasRing || terrain.status === 'loading'}
        icon={<IconMountain />}
        className="h-10"
      >
        {terrain.status === 'loading' ? t('cp.terrain.loading') : t('cp.terrain.downloadGlobal')}
      </Button>
      <Button
        onClick={() => demFileRef.current?.click()}
        disabled={!hasRing || terrain.status === 'loading'}
        title={t('cp.terrain.importDemTitle')}
        icon={<IconFolder />}
        className="h-10"
      >
        {t('cp.terrain.importDem')}
      </Button>
    </div>
  )

  /* ---------------- resumos numa linha (secção fechada) ---------------- */
  const missionSummary = [
    aircraftShort(aircraft),
    payload.label,
    t(drone.rtk === true ? 'cards.sum.rtkOn' : 'cards.sum.rtkOff'),
  ].join(' · ')
  const terrainSummary =
    terrain.status === 'loading'
      ? t('cp.terrain.loading')
      : terrainReady && terrain.data?.source === 'file'
        ? t(demSurface === 'dsm' ? 'cards.sum.dsmFile' : 'cards.sum.dtmFile', {
            label: terrain.data.label,
            res: terrain.data.resolutionM?.toFixed(1),
          })
        : terrainReady
          ? t('cards.sum.terrainGlobal')
          : t('cards.sum.noTerrain')
  const areaProblem =
    hasRing && !validation.valid
      ? t('cards.sum.invalid')
      : planError
        ? t('cards.sum.planError')
        : terrain.status === 'error' || (terrainReady && !terrainCovers)
          ? t('cards.sum.terrainError')
          : null
  const areaSummary = !hasRing
    ? t('cards.sum.noArea')
    : (areaProblem ??
      [Number.isFinite(summary?.areaHa) ? `${summary.areaHa.toFixed(2)} ha` : null, terrainSummary]
        .filter(Boolean)
        .join(' · '))
  const areaStatus = !hasRing ? null : areaProblem ? (
    <IconBlocked aria-label={t('cards.status.error')} className="h-4 w-4 text-red-300" />
  ) : terrainReady && terrainCovers ? (
    <IconCheck aria-label={t('cards.status.ready')} className="h-4 w-4 text-emerald-400" />
  ) : null
  const flightSummary = [
    t(tf ? 'cards.sum.agl' : 'cards.sum.rel', { m: params.altitude }),
    gsd != null ? `${gsd.toFixed(2)} cm/px` : null,
    `${params.frontOverlap}/${params.sideOverlap} %`,
    tf ? t('cards.sum.tf') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  // minutos de cada voo, com a deslocação (os da tabela)
  const sortedBlocks = blocks
    ? [...blocks].sort(
        (a, b) =>
          (baseLayout?.byBlock[a.id]?.flight ?? a.id) - (baseLayout?.byBlock[b.id]?.flight ?? b.id),
      )
    : []
  const blockMinutes = sortedBlocks.map((b) =>
    Math.round((b.timeS + (baseLayout?.byBlock[b.id]?.transitS ?? 0)) / 60),
  )
  const splitName = {
    none: t('cp.split.modeNone'),
    area: t('cp.split.modeArea'),
    battery: t('cp.split.modeBattery'),
    tiles: t('cp.split.modeTiles'),
  }
  const flightsText =
    blockMinutes.length > 0
      ? tCount(t, 'cards.sum.flights', blockMinutes.length, {
          n: blockMinutes.length,
          range: rangeText(Math.min(...blockMinutes), Math.max(...blockMinutes)),
        })
      : null
  const splitSummary = gridActive
    ? [t('cards.sum.grid'), flightsText].filter(Boolean).join(' · ')
    : split.mode === 'none'
      ? t('cards.sum.splitNone')
      : [splitName[split.mode], flightsText].filter(Boolean).join(' · ')
  const safe = { finishAction: 'goHome', exitOnRCLost: 'executeLostAction', ...(safety ?? {}) }
  const finishShort = t(`safety.finishShort.${safe.finishAction}`)
  const safetySummary = [
    finishShort,
    safe.exitOnRCLost === 'goContinue'
      ? t('safety.lostShort.goContinue')
      : t('safety.lostShort.stop', {
          action: t(`safety.actionShort.${safe.executeRCLostAction ?? 'goBack'}`),
        }),
  ].join(' · ')
  const nBases = basesPanel?.rows.length ?? (hasBase ? 1 : 0)
  const basesSummary = [
    nBases > 0 ? tCount(t, 'bases.count', nBases, { n: nBases }) : t('cards.sum.noBases'),
    finishShort,
    rthInfo ? t('cards.sum.takeoff', { m: rthInfo.takeoffM }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const reducedBases = basesPanel?.rows.filter((r) => r.reduced).length ?? 0
  const basesStatus =
    reducedBases > 0 ? (
      <Badge tone="warn" className="!h-[22px] !px-[7px] text-xs font-semibold">
        <IconWarning className="h-3 w-3 text-amber-500" />
        <span aria-hidden="true">{reducedBases}</span>
        <span className="sr-only">
          {tCount(t, 'bases.reducedWarn', reducedBases, { n: reducedBases })}
        </span>
      </Badge>
    ) : null
  const gcpCount = gcpInfo?.count ?? gcpConfig.count ?? gcpAutoCount
  const extrasSummary = t('cards.extras.summary', {
    gcp: gcpConfig.enabled ? gcpCount : t('cards.extras.gcpOff'),
    n: inspectPoints?.length ?? 0,
  })
  const totalS = ops?.totalS ?? summary?.timeS ?? null
  const blocked = preflightBlockers.length > 0
  const exportSummary = !summary?.flights
    ? t('cards.sum.noPlan')
    : [
        tCount(t, 'stats.flightsN', summary.flights, { n: summary.flights }),
        Number.isFinite(totalS) ? fmtTime(totalS) : null,
        blocked ? t('cards.sum.blocked') : canExportMission ? t('cards.sum.ready') : null,
      ]
        .filter(Boolean)
        .join(' · ')
  const exportStatus = blocked ? (
    <IconBlocked aria-label={t('cards.status.blocked')} className="h-4 w-4 text-red-300" />
  ) : canExportMission ? (
    <IconCheck aria-label={t('cards.status.exportReady')} className="h-4 w-4 text-emerald-400" />
  ) : null

  // as escolhas do disparo, tal como o plano as lê
  const triggerMode =
    payload.type === 'camera' || params.triggerMode !== 'waypoint' ? params.triggerMode : 'distance'
  const stopsShown = (payload.type === 'camera' && params.triggerMode === 'waypoint') || tf
  const stops = params.waypointStops === 'all' ? 'all' : 'corners'
  const headingFixed = params.headingMode === 'fixed'
  // «Paralelas», «Perpend.» e «45°» premidas quando o ângulo é o que dariam
  const relPressed = (offset) =>
    refAzimuth != null && params.angle === Math.round((refAzimuth + offset) % 360)

  return (
    <div className="relative h-full">
      <CardColumn
        label={t('cards.panel')}
        title={t('mode.area')}
        subtitle={t('cards.areaSubtitle')}
        testId="area-panel"
      >
        {/* 1. Missão */}
        <Section
          n={1}
          title={t('cards.mission')}
          summary={missionSummary}
          summaryOpen
          testId="card-missao"
          {...sec('missao')}
          more={isCustom ? more('missao', t('cards.moreAircraft')) : null}
        >
          <Field
            label={t('cards.missionName')}
            hint={
              <>
                {t('cp.mission.nameHintA')} (<span className="font-mono">.kml</span> /{' '}
                <span className="font-mono">.kmz</span>) {t('cp.mission.nameHintB')}
              </>
            }
          >
            <input
              type="text"
              className={fieldInput}
              value={missionName}
              onChange={(e) => setMissionName(e.target.value)}
              placeholder={t('cp.mission.namePlaceholder')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onProjectExport}
              title={t('cp.mission.saveTitle')}
              className={`${buttonClass('secondary', 'md')} !px-2`}
            >
              {t('cp.mission.save')}
            </button>
            <button
              type="button"
              onClick={() => projectFileRef.current?.click()}
              title={t('cp.mission.openTitle')}
              className={`${buttonClass('secondary', 'md')} !px-2`}
            >
              {t('cp.mission.open')}
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
            <div data-testid="project-version-note" className={`${SMALL} ${BOX.warn}`}>
              <p className="font-semibold text-amber-300">
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
              <p className="mt-1">{t('cards.versionNoteHint')}</p>
              {onDismissVersionNote && (
                <button
                  type="button"
                  onClick={onDismissVersionNote}
                  className={`${buttonClass('secondary', 'sm')} mt-2`}
                >
                  {t('cards.versionNoteClose')}
                </button>
              )}
            </div>
          )}
          {projectError && (
            <Notice tone="error" testId="project-error">
              {errorText(projectError, t)}
            </Notice>
          )}
          <p className="-mt-1 text-xs text-slate-400">{t('cp.mission.autosave')}</p>
          <div className="border-t border-slate-800" />
          <Field label={t('cards.aircraft')} unit={<SelectChevron />}>
            <select
              className={selectInput}
              value={drone.aircraftId}
              // keep the payload when the new aircraft also mounts it
              onChange={(e) => setDrone(droneForAircraft(drone, e.target.value))}
            >
              {Object.values(AIRCRAFT).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          {aircraft.payloads.length > 1 && (
            <Field label={t('cp.drone.payload')} unit={<SelectChevron />}>
              <select
                className={selectInput}
                value={drone.payloadId}
                onChange={(e) => setDrone({ ...drone, payloadId: e.target.value })}
              >
                {aircraft.payloads.map((pid) => (
                  <option key={pid} value={pid}>
                    {PAYLOADS[pid].label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {payload.type === 'camera' && (
            <p className="-mt-1 text-xs leading-relaxed text-slate-400">
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
            <>
              <p className="-mt-1 text-xs leading-relaxed text-slate-400">
                {t('cp.drone.lidarSpecs', {
                  desc: payload.desc,
                  fov: payload.fov,
                  agl: payload.maxAglM ?? '—',
                })}
              </p>
              {/* o FOV de trabalho, sozinho na gaveta, veio para a secção */}
              <div className="flex items-start gap-2">
                <Field
                  label={t('cp.drone.effectiveFov')}
                  unit="°"
                  hint={t('cp.drone.effectiveFovHint')}
                  className="flex-1"
                >
                  <NumberInput
                    className={fieldInput}
                    value={effectiveFov ?? payload.fov}
                    min={5}
                    max={payload.fov}
                    step={0.1}
                    onChange={onEffectiveFov}
                  />
                </Field>
                {effectiveFov != null && (
                  <Button
                    onClick={() => onEffectiveFov(payload.fov)}
                    title={t('cp.drone.effectiveFovResetTitle', { fov: payload.fov })}
                    className="mt-[22px] h-10"
                  >
                    {t('cp.drone.effectiveFovReset')}
                  </Button>
                )}
              </div>
            </>
          )}
          <Switch
            label={t('cp.drone.rtk')}
            title={t('cp.drone.rtkHint')}
            checked={drone.rtk === true}
            onChange={(on) => setDrone({ ...drone, rtk: on })}
          />
          {presets?.length > 0 &&
            (() => {
              const activeId =
                presets.find((p) => Object.entries(p.values).every(([k, v]) => params[k] === v))
                  ?.id ?? ''
              const chosen = presets.find((p) => p.id === activeId)
              return (
                <Field
                  label={t('cp.preset.label')}
                  unit={<SelectChevron />}
                  hint={chosen ? (chosen.desc[lang] ?? chosen.desc.pt) : t('cp.preset.hint')}
                >
                  <select
                    className={selectInput}
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
                </Field>
              )
            })()}
        </Section>

        {/* 2. Área e relevo */}
        <Section
          n={2}
          title={t('cards.area')}
          summary={areaSummary}
          summaryOpen
          status={areaStatus}
          testId="card-area"
          {...sec('area')}
          more={more('area', t('cards.moreArea'))}
        >
          {/* as formas (polígono, rectângulo, quadrado) estão na barra
              sobre o mapa, com a base e os pontos de inspecção */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button
              onClick={() => areaFileRef.current?.click()}
              title={t('cp.area.importTitle')}
              icon={<IconFolder />}
              className="h-10"
            >
              {t('cp.area.import')}
            </Button>
            {hasRing && (
              <Button variant="danger" onClick={onClear} icon={<IconTrash />} className="h-10">
                {t('cp.area.clear')}
              </Button>
            )}
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
          </div>
          <p className="-mt-1 text-xs leading-relaxed text-slate-400">{t('cp.area.drawOnMap')}</p>

          {importState && (
            <div className={`flex flex-col gap-2 ${SMALL} ${BOX.info}`}>
              <p>
                <strong className="text-[#E0F2FE]">{importState.filename}</strong>:{' '}
                {t('cp.area.crsPrompt')}
                {importState.crsHint &&
                  ` ${t('cp.area.importCrsHint', { crs: importState.crsHint })}`}
              </p>
              <SelectBox defaultValue="EPSG:3763" id="crs-select" aria-label={t('cards.crs')}>
                {CRS_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </SelectBox>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  onClick={() =>
                    onImportCrs(
                      /** @type {HTMLSelectElement} */ (document.getElementById('crs-select'))
                        .value,
                    )
                  }
                >
                  {t('cp.area.convert')}
                </Button>
                <Button onClick={onImportCancel}>{t('cp.area.cancel')}</Button>
              </div>
            </div>
          )}

          {importError && (
            <Notice tone="error" testId="import-error">
              {errorText(importError, t)}
            </Notice>
          )}
          {importWarning && (
            <Notice>
              <p>{importWarning}</p>
              {importParts && onImportUseAll && (
                <button
                  type="button"
                  onClick={onImportUseAll}
                  className={`${buttonClass('secondary', 'sm')} mt-2`}
                >
                  {t('cp.area.importUseAll')}
                </button>
              )}
            </Notice>
          )}
          {mode === 'draw' && (
            <div className={`flex flex-col gap-2 ${SMALL} ${BOX.plain}`}>
              <p>
                {t('cp.area.drawHintA', { n: draftCount })}{' '}
                <strong className="text-slate-100">Backspace</strong> /{' '}
                <strong className="text-slate-100">Ctrl+Z</strong> {t('cp.area.drawHintB')}{' '}
                <strong className="text-slate-100">{t('cp.area.drawHintFirst')}</strong>,{' '}
                <strong className="text-slate-100">{t('cp.area.drawHintDblClick')}</strong>{' '}
                {t('cp.area.drawHintC')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={onUndoVertex} disabled={draftCount === 0}>
                  {t('cp.area.undoVertex')}
                </Button>
                <Button
                  variant="primary"
                  onClick={onFinishDraw}
                  disabled={draftCount < 3}
                  icon={<IconCheck />}
                >
                  {t('cp.area.finish')}
                </Button>
              </div>
            </div>
          )}

          {mode === 'anchor' && (
            <div className={`flex flex-col gap-3 ${SMALL} ${BOX.plain}`}>
              <p>{t('cp.area.anchorHint')}</p>
              <div className="flex flex-col gap-1.5">
                <GroupLabel>{t('cp.area.quickSizes')}</GroupLabel>
                <Segmented
                  label={t('cp.area.quickSizes')}
                  options={[250, 500, 750, 1000].map((s) => ({
                    value: s,
                    label: `${s}²`,
                    title:
                      s === 250
                        ? t('cp.area.sizeTitleBattery', {
                            s,
                            min: squareMinutes ? Math.round(squareMinutes(s)) : '—',
                          })
                        : t('cp.area.sizeTitle', { s }),
                    pressed: anchor.length === s && anchor.width === s,
                    onClick: () => {
                      setAnchorParam('length', s)
                      if (anchor.shape !== 'square') setAnchorParam('width', s)
                    },
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                {anchor.shape === 'square' ? (
                  <Field label={t('cp.area.side')} unit="m">
                    <NumberInput
                      className={fieldInput}
                      value={anchor.length}
                      min={10}
                      onChange={(v) => setAnchorParam('length', v)}
                    />
                  </Field>
                ) : (
                  <>
                    <Field label={t('cp.area.length')} unit="m">
                      <NumberInput
                        className={fieldInput}
                        value={anchor.length}
                        min={10}
                        onChange={(v) => setAnchorParam('length', v)}
                      />
                    </Field>
                    <Field label={t('cp.area.width')} unit="m">
                      <NumberInput
                        className={fieldInput}
                        value={anchor.width}
                        min={10}
                        onChange={(v) => setAnchorParam('width', v)}
                      />
                    </Field>
                  </>
                )}
                <Field label={t('cp.area.orientation')} unit="°">
                  <NumberInput
                    className={fieldInput}
                    value={anchor.orientation}
                    min={0}
                    max={360}
                    onChange={(v) => setAnchorParam('orientation', v)}
                  />
                </Field>
              </div>
            </div>
          )}

          {hasRing && mode !== 'draw' && !gridActive && split.mode !== 'tiles' && (
            <p className="text-xs leading-relaxed text-slate-400">
              {t('cp.area.editHintA')}{' '}
              <strong className="font-medium text-slate-300">{t('cp.area.editHintInsert')}</strong>{' '}
              {t('cp.area.editHintB')}{' '}
              <strong className="font-medium text-slate-300">{t('cp.area.editHintRemove')}</strong>.
            </p>
          )}

          {hasRing && !validation.valid && (
            <Notice tone="error">
              <strong className="font-semibold">{t('cp.area.invalidTitle')}</strong>{' '}
              {t('cp.area.invalidBody')}
            </Notice>
          )}

          {planError === 'too-many-lines' && (
            <Notice tone="error">{t('cp.area.tooManyLines')}</Notice>
          )}
          {planError && planError !== 'too-many-lines' && (
            <Notice tone="error">
              {t(`cp.area.planError.${planError}`, { cells: (planErrorCells ?? []).join(', ') })}
            </Notice>
          )}

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
          {terrain.status === 'ready' && terrain.data?.source === 'file' && (
            <div className="flex flex-col gap-2.5 rounded-[9px] border border-[#1F5C47] bg-[#0D2A21] p-3">
              <div className="flex items-start gap-2.5">
                <IconMountain className="mt-px h-[18px] w-[18px] flex-none text-emerald-400" />
                <div className="min-w-0">
                  <p className="break-words text-[13.5px] font-semibold text-[#D1FAE5]">
                    {t(demSurface === 'dsm' ? 'cp.terrain.localDsm' : 'cp.terrain.localDem')}{' '}
                    {terrain.data.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[#9DD9C0]">
                    {t('cp.terrain.demGrid', {
                      crs: terrain.data.crsCode,
                      res: terrain.data.resolutionM?.toFixed(1),
                    })}
                  </p>
                </div>
              </div>
              {onDemSurface && (
                <Segmented
                  tone="emerald"
                  label={t('cp.terrain.surface')}
                  title={t('cp.terrain.surfaceHint')}
                  value={demSurface}
                  onChange={onDemSurface}
                  options={[
                    { value: 'dtm', label: t('cp.terrain.surfaceDtm'), testId: 'dem-surface-dtm' },
                    { value: 'dsm', label: t('cp.terrain.surfaceDsm'), testId: 'dem-surface-dsm' },
                  ]}
                />
              )}
            </div>
          )}
          <Button
            onClick={onShowProfile}
            disabled={!(terrain.status === 'ready' && terrainCovers)}
            icon={<IconChart />}
            className="h-10"
          >
            {t('cp.terrain.profile')}
          </Button>

          {rememberedDem && (
            <p data-testid="dem-remembered" className={`${SMALL} ${BOX.plain}`}>
              {t(
                rememberedDem.surface === 'dsm'
                  ? 'cp.terrain.rememberedDsm'
                  : 'cp.terrain.rememberedDtm',
                { file: rememberedDem.label },
              )}
            </p>
          )}
          {terrain.status === 'error' && (
            <Notice tone="error">{terrainErrText(terrain.error, t)}</Notice>
          )}
          {terrain.status === 'ready' && !terrainCovers && (
            <Notice tone="error">{t('cp.terrain.outOfCoverage')}</Notice>
          )}
          <p className="text-xs leading-relaxed text-slate-400">
            {terrain.data?.source === 'file'
              ? t('cp.terrain.sourceHintFile', {
                  label: terrain.data.label,
                  res: terrain.data.resolutionM?.toFixed(1),
                })
              : t('cp.terrain.sourceHint')}
          </p>
          {terrain.status === 'ready' && terrain.data?.verticalDatum?.kind === 'ellipsoidal' && (
            <Notice>{t('cp.terrain.datumEllipWarn')}</Notice>
          )}
          {slopeHint && (
            <p className="text-xs leading-relaxed text-sky-300">
              {t('cards.slopeAvailable', { slope: Math.round(slopeHint.slopeDeg) })}
            </p>
          )}
        </Section>

        {/* 3. Parâmetros de voo */}
        <Section
          n={3}
          title={t('cards.flight')}
          summary={flightSummary}
          summaryOpen
          testId="card-voo"
          {...sec('voo')}
          more={more('voo', t('cards.moreFlight'))}
        >
          <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3">
            <Field label={tf ? t('cp.flight.altitudeTf') : t('cp.flight.altitudeRel')} unit="m">
              <NumberInput
                className={fieldInput}
                value={params.altitude}
                min={5}
                max={1500}
                onChange={(v) => setParam('altitude', v)}
              />
            </Field>
            {gsd != null && (
              <Field label={t('cp.flight.gsdTarget')} unit="cm/px">
                <NumberInput
                  className={fieldInput}
                  value={Number(gsd.toFixed(2))}
                  min={0.1}
                  step={0.1}
                  onChange={onGsdTarget}
                />
              </Field>
            )}
            <Field
              label={t('cp.flight.speed')}
              unit={`m/s · ${aircraft.speedRange?.min ?? 1}–${aircraft.speedRange?.max ?? 20}`}
            >
              <NumberInput
                className={fieldInput}
                value={params.speed}
                min={aircraft.speedRange?.min ?? 1}
                max={aircraft.speedRange?.max ?? 20}
                step={0.5}
                onChange={(v) => setParam('speed', v)}
              />
            </Field>
            {tf && (
              <Field label={t('cp.terrain.tolerance')} unit="m">
                <NumberInput
                  className={fieldInput}
                  value={terrainFollow.tolerance}
                  min={1}
                  max={20}
                  onChange={(v) => setTerrainFollow({ ...terrainFollow, tolerance: v })}
                />
              </Field>
            )}
            {/* com o intervalo manual a sobreposição frontal resulta do intervalo */}
            <Field
              label={t('cp.flight.frontOverlap')}
              unit="%"
              className={
                params.intervalMode === 'manual' && payload.type === 'camera' ? 'opacity-40' : ''
              }
            >
              <NumberInput
                className={fieldInput}
                value={params.frontOverlap}
                min={0}
                max={95}
                onChange={(v) => setParam('frontOverlap', v)}
              />
            </Field>
            <Field
              label={t('cp.flight.sideOverlap')}
              unit="%"
              className={params.spacingMode === 'manual' ? 'opacity-40' : ''}
            >
              <NumberInput
                className={fieldInput}
                value={params.sideOverlap}
                min={0}
                max={95}
                onChange={(v) => setParam('sideOverlap', v)}
              />
            </Field>
          </div>
          {!tf &&
            Number.isFinite(routeClearance?.minM) &&
            Number.isFinite(routeClearance?.maxM) && (
              <p
                data-testid="agl-over-area"
                className={`text-xs leading-relaxed ${
                  routeClearance.minM < params.altitude / 2 ? 'text-amber-300' : 'text-slate-400'
                }`}
              >
                {t('cp.flight.aglOverArea', {
                  range: rangeText(routeClearance.minM, routeClearance.maxM, Math.round),
                })}
              </p>
            )}
          {params.altitude > 120 && (
            <Notice>
              {t('cp.flight.altWarnPre')} <strong className="text-amber-300">120 m AGL</strong>{' '}
              {t('cp.flight.altWarnPost')}
            </Notice>
          )}
          {aglWarn && (
            <Notice>
              {t('cp.flight.aglCapWarn', {
                payload: payload.label,
                cap: aglWarn.cap,
                worst: Math.round(aglWarn.worstAgl),
              })}
            </Notice>
          )}
          {triggerWarn && (
            <Notice>
              {t('cp.flight.triggerFast', {
                s: triggerWarn.actualS.toFixed(2),
                min: triggerWarn.minS.toFixed(1),
                vmax: triggerWarn.maxSpeed.toFixed(1),
              })}
            </Notice>
          )}
          {waypointWarn != null && (
            <Notice>{t('cp.flight.waypointWarn', { n: waypointWarn })}</Notice>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <GroupLabel>{t('cp.orientation.title')}</GroupLabel>
              <span className={`${fieldBox} !h-8 w-[4.75rem] !px-2`}>
                <NumberInput
                  className={fieldInput}
                  value={params.angle}
                  label={t('cards.lineAzimuth')}
                  min={0}
                  max={360}
                  onChange={(v) => setParam('angle', Math.max(0, Math.min(360, v)))}
                />
                <span className="flex-none text-xs text-slate-400">°</span>
              </span>
            </div>
            <input
              type="range"
              aria-label={t('cards.lineAzimuth')}
              min={0}
              max={360}
              step={1}
              value={params.angle}
              onChange={(e) => setParam('angle', Number(e.target.value))}
              className="w-full accent-sky-400"
            />
            <Segmented
              label={t('cp.orientation.group')}
              columns="grid-cols-2 lg:grid-cols-4"
              options={[
                {
                  value: 'parallel',
                  label: t('cp.orientation.parallel'),
                  title: t('cp.orientation.relativeTitle'),
                  disabled: refAzimuth == null,
                  pressed: relPressed(0),
                  onClick: () => onSetAngleRelative(0),
                },
                {
                  value: 'perpendicular',
                  label: t('cp.orientation.perpendicularShort'),
                  ariaLabel: t('cp.orientation.perpendicular'),
                  title: t('cp.orientation.relativeTitle'),
                  disabled: refAzimuth == null,
                  pressed: relPressed(90),
                  onClick: () => onSetAngleRelative(90),
                },
                {
                  value: 'oblique',
                  label: '45°',
                  ariaLabel: t('cp.orientation.oblique45'),
                  title: t('cp.orientation.relativeTitle'),
                  disabled: refAzimuth == null,
                  pressed: relPressed(45),
                  onClick: () => onSetAngleRelative(45),
                },
                {
                  value: 'optimal',
                  label: t('cp.orientation.optimal'),
                  title: t('cp.orientation.optimalTitle'),
                  disabled: !hasRing || !validation.valid,
                  onClick: onSetAngleOptimal,
                  className: 'text-sky-300',
                },
              ]}
            />
            <p className="text-xs leading-relaxed text-slate-400">
              {t('cp.orientation.azimuthHint')}
              {refAzimuth != null &&
                ` · ${t('cp.orientation.reference', { deg: Math.round(refAzimuth) })}`}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 border-t border-slate-800 pt-3.5">
            <Switch
              label={t('cp.terrain.follow')}
              checked={terrainFollow.enabled}
              // ligar exige relevo que cubra a área; desligar, nunca (a opção é
              // partilhada com o corredor e o circular)
              disabled={!terrainFollow.enabled && !(terrain.status === 'ready' && terrainCovers)}
              onChange={(on) => setTerrainFollow({ ...terrainFollow, enabled: on })}
            />
            {tf && terrainResult && !terrainResult.error && (
              <div className="rounded-lg border border-slate-800 bg-field px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-200">
                {t('cp.terrain.result', {
                  range: rangeText(terrainResult.elevMin, terrainResult.elevMax, Math.round),
                  // com blocos, só os waypoints dos voos (sem os troços entre blocos)
                  n: terrainWaypointCount(terrainResult),
                  ref: Math.round(terrainResult.refElev),
                })}
                {terrainResult.warnings?.map((w, i) => (
                  <p key={i} className="mt-1 text-amber-300">
                    {errorText(w, t)}
                  </p>
                ))}
              </div>
            )}
            {tf && terrainResult?.error && (
              <Notice tone="error">{terrainErrorText(terrainResult, t)}</Notice>
            )}
          </div>
        </Section>

        {/* 4. Divisão em voos */}
        <Section
          n={4}
          title={t('cards.split')}
          summary={splitSummary}
          summaryOpen
          testId="card-divisao"
          {...sec('divisao')}
          more={
            !gridActive && (split.mode === 'tiles' || split.mode === 'battery')
              ? more('divisao', t('cards.moreCells'))
              : null
          }
        >
          {gridActive && <Notice>{t('cp.split.gridActive')}</Notice>}
          {/* 2 × 2 no painel estreito (w-80, abaixo de lg): em quatro
              colunas, «Quadrícula» e «Nenhuma» não cabiam no botão */}
          {!gridActive && (
            <Segmented
              label={t('cards.split')}
              columns="grid-cols-2 lg:grid-cols-4"
              value={split.mode}
              onChange={(v) => setSplitParam('mode', v)}
              options={['none', 'area', 'battery', 'tiles'].map((v) => ({
                value: v,
                label: splitName[v],
              }))}
            />
          )}
          {!gridActive && split.mode === 'tiles' && (
            <>
              <div className="flex flex-col gap-1.5">
                <GroupLabel>{t('cp.split.tileSideLabel')}</GroupLabel>
                <Segmented
                  label={t('cp.split.tileSideLabel')}
                  value={split.tileSize}
                  onChange={(v) => setSplitParam('tileSize', v)}
                  options={[250, 500, 750, 1000].map((s) => ({ value: s, label: `${s} m` }))}
                />
              </div>
              <Field label={t('cp.split.customSide')} unit="m" className="w-40">
                <NumberInput
                  className={fieldInput}
                  value={split.tileSize}
                  min={50}
                  max={5000}
                  step={50}
                  onChange={(v) => setSplitParam('tileSize', v)}
                />
              </Field>
              {tilesError === 'too-many-cells' && <Notice>{t('cp.split.tooManyCellsTile')}</Notice>}
            </>
          )}
          {!gridActive && (
            <>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label={t('cp.split.batteryType')} unit={<SelectChevron />}>
                  <select
                    className={selectInput}
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
                <Field label={t('cp.split.usefulMin')} unit="min">
                  <NumberInput
                    className={fieldInput}
                    value={usefulMin}
                    min={1}
                    max={120}
                    step={0.5}
                    onChange={onUsefulMin}
                    testId="mission-useful"
                  />
                </Field>
              </div>
              {usefulOverridden && battery && (
                <button
                  type="button"
                  data-testid="mission-useful-reset"
                  onClick={() => onUsefulMin(battery.usefulMin)}
                  title={t('cp.split.usefulResetTitle', { min: battery.usefulMin })}
                  className={`${buttonClass('secondary', 'sm')} -mt-1 self-end`}
                >
                  {t('cp.split.usefulReset', { min: battery.usefulMin })}
                </button>
              )}
              <p className="text-xs leading-relaxed text-slate-400">
                {t('cp.split.usefulHint')}{' '}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  <IconGear className="h-3 w-3" />
                  {t('app.settings')}
                </button>
                .
                {battery?.estimated && !usefulOverridden && (
                  <span className="text-amber-300"> {t('cp.split.estimated')}</span>
                )}
              </p>
            </>
          )}
          {!gridActive && split.mode === 'area' && (
            <Field label={t('cp.split.maxAreaPerBlock')} unit="ha" className="w-40">
              <NumberInput
                className={fieldInput}
                value={split.maxAreaHa}
                min={0.5}
                step={0.5}
                onChange={(v) => setSplitParam('maxAreaHa', v)}
              />
            </Field>
          )}
          {!gridActive && split.mode === 'battery' && (
            <>
              {tileSide != null && (
                <p className={`text-[12.5px] leading-relaxed ${BOX.info}`}>
                  {t('cp.split.squareBlocks')}{' '}
                  <strong className="font-semibold text-[#E0F2FE]">
                    {tileSide} × {tileSide} m
                  </strong>
                  {t('cp.split.batteryUse', { min: usefulMin })}{' '}
                  {t('cp.split.transitCorner', { r: zoneRadiusM })}.
                </p>
              )}
              {tilesError === 'too-many-cells' && (
                <Notice>{t('cp.split.tooManyCellsBattery')}</Notice>
              )}
            </>
          )}
          {(gridActive || split.mode !== 'none') && blocks && (
            <>
              <div className="overflow-hidden rounded-[9px] border border-slate-800">
                <div
                  className={
                    allFlights || sortedBlocks.length <= FLIGHT_ROWS
                      ? ''
                      : 'max-h-[212px] overflow-y-auto'
                  }
                >
                  <table className="w-full table-fixed border-collapse text-[12.5px] tabular-nums">
                    <thead className="sticky top-0 bg-sunken text-[11.5px] text-slate-400">
                      <tr>
                        <th scope="col" className="w-[28%] px-3 py-1.5 text-left font-normal">
                          {t('cards.col.flight')}
                        </th>
                        <th scope="col" className="px-1 py-1.5 text-right font-normal">
                          {t('cards.col.area')}
                        </th>
                        <th scope="col" className="px-1 py-1.5 text-right font-normal">
                          {t('cards.col.distance')}
                        </th>
                        <th scope="col" className="w-[22%] px-3 py-1.5 text-right font-normal">
                          {t('cards.col.time')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBlocks.map((b, i) => {
                        const f = baseLayout?.byBlock[b.id]
                        return (
                          <tr
                            key={b.id}
                            data-testid="block-row"
                            data-block-id={b.id}
                            data-flight={f?.flightLabel ?? ''}
                            className="h-[30px] border-t border-raised"
                          >
                            <td
                              className="px-3 text-slate-100"
                              title={
                                f?.flightLabel
                                  ? t('bases.flightLabel', { flight: f.flightLabel, id: b.id })
                                  : undefined
                              }
                            >
                              <span className="inline-flex items-center gap-2">
                                {f?.baseId && (
                                  <span
                                    aria-hidden="true"
                                    className="inline-block h-[9px] w-[9px] rounded-full"
                                    style={{ backgroundColor: f.color }}
                                  />
                                )}
                                {f?.flightLabel || String(b.id)}
                              </span>
                            </td>
                            <td className="px-1 text-right text-slate-200">
                              {b.areaHa.toFixed(1)} ha
                            </td>
                            <td className="px-1 text-right text-slate-200">
                              {(b.lengthM / 1000).toFixed(1)} km
                            </td>
                            <td className="px-3 text-right text-slate-200">
                              {blockMinutes[i]} min
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {sortedBlocks.length > FLIGHT_ROWS && (
                  <button
                    type="button"
                    aria-expanded={allFlights}
                    onClick={() => setAllFlights((v) => !v)}
                    className="h-9 w-full border-t border-raised text-[12.5px] font-medium text-sky-300 transition-colors hover:bg-raised hover:text-sky-200"
                  >
                    {allFlights
                      ? t('cards.flightsFew')
                      : t('cards.flightsAll', { n: sortedBlocks.length })}
                  </button>
                )}
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{t('cp.split.exportHint')}</p>
            </>
          )}
        </Section>

        {/* 5. Bases e segurança */}
        <Section
          n={5}
          title={t('cards.bases')}
          summary={basesSummary}
          summaryOpen
          status={basesStatus}
          testId="card-bases"
          {...sec('bases')}
        >
          {(() => {
            // a mesma acção, com o mesmo nome, da barra sobre o mapa: o rótulo
            // curto, e o nome e a dica completos
            const markRemove = (
              <>
                <button
                  type="button"
                  onClick={onStartBase}
                  aria-pressed={mode === 'base'}
                  aria-label={t('cp.area.markBase')}
                  title={t('cp.area.markBase')}
                  className={`${buttonClass('secondary', 'md')} h-10 !px-2 ${
                    mode === 'base' ? '!border-sky-400/40 bg-sky-400/15 text-sky-300' : ''
                  }`}
                >
                  {t('cp.area.markBaseShort')}
                </button>
                <button
                  type="button"
                  onClick={onRemoveBase}
                  disabled={!hasBase}
                  aria-label={t('cp.area.removeBase')}
                  title={t('cp.area.removeBase')}
                  className={`${buttonClass('secondary', 'md')} h-10 !px-2`}
                >
                  {t('cp.area.removeBaseShort')}
                </button>
              </>
            )
            const hint =
              mode === 'base' ? (
                <p className="-mt-1 text-xs leading-relaxed text-slate-400">
                  {t('cp.area.baseHint')}
                </p>
              ) : null
            return basesPanel ? (
              <BasesPanel
                {...basesPanel}
                part="list"
                actions={markRemove}
                actionsNote={hint}
                onShowPreflight={onShowPreflight}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5">{markRemove}</div>
                {hint}
              </>
            )
          })()}
          {/* as bacias de visão, sozinhas na gaveta, vieram para a secção */}
          {viewshed && basesPanel?.rows.length > 0 && basesPanel?.hasBlocks && (
            <ViewshedBox {...viewshed} />
          )}
          <SubSection
            icon={<IconShield className="h-[17px] w-[17px] flex-none text-sky-300" />}
            title={t('safety.title')}
            summary={safetySummary}
            open={S.isOpen('seguranca')}
            onToggle={() => S.toggle('seguranca')}
          >
            <SafetyActions safety={safety} onChange={setSafety} />
            <RthLine info={rthInfo} />
          </SubSection>
        </Section>

        {/* 6. Extras */}
        <Section
          n={6}
          title={t('cards.extras')}
          summary={extrasSummary}
          summaryOpen
          testId="card-extras"
          {...sec('extras')}
        >
          <div className="flex flex-col gap-1.5">
            {[
              {
                part: 'gcp',
                testId: 'card-more-extras',
                icon: <IconRings className="h-4 w-4 flex-none text-sky-300" />,
                label: t('cards.extras.gcp'),
                value: gcpConfig.enabled ? gcpCount : t('cards.extras.gcpOff'),
              },
              {
                part: 'inspect',
                testId: 'card-more-extras-inspect',
                icon: <IconTarget className="h-4 w-4 flex-none text-orange-300" />,
                label: t('cards.extras.inspect'),
                value: inspectPoints?.length ?? 0,
              },
            ].map(({ part, ...b }) => {
              const m = d.more('extras', part)
              return <ExtrasButton key={part} {...b} expanded={m.expanded} onToggle={m.onToggle} />
            })}
          </div>
          {mode === 'inspect' && (
            <p className="text-xs leading-relaxed text-orange-300">
              {t('cards.extras.inspecting')}
            </p>
          )}
        </Section>

        {/* 7. Resumo e exportar */}
        <Section
          n={7}
          title={t('cards.summary')}
          summary={exportSummary}
          summaryOpen
          status={exportStatus}
          testId="card-resumo"
          {...sec('resumo')}
        >
          <dl data-testid="summary-stats" className="grid grid-cols-2 gap-2">
            {[
              {
                k: t('cards.summary.flights'),
                v: summary?.flights ? String(summary.flights) : '—',
                sub:
                  ops?.bases > 0
                    ? tCount(t, 'cards.tile.inBases', ops.bases, { n: ops.bases })
                    : null,
              },
              {
                k: t('cards.tile.total'),
                v: fmtTime(totalS),
                sub: Number.isFinite(summary?.timeS)
                  ? t('cards.tile.inMission', { time: fmtTime(summary.timeS) })
                  : null,
                title: t('stats.totalTimeHint'),
              },
              {
                k: t('cards.summary.sets'),
                v: setsCheck ? String(setsCheck.flights) : '—',
                sub: setsCheck
                  ? setsCheck.sets != null
                    ? tCount(t, 'cards.tile.needed', setsCheck.flights, { s: setsCheck.sets })
                    : tCount(t, 'cards.tile.neededOnly', setsCheck.flights, {})
                  : null,
              },
              {
                k: t('stats.area'),
                v: Number.isFinite(summary?.areaHa) ? `${summary.areaHa.toFixed(2)} ha` : '—',
                sub: Number.isFinite(summary?.photos)
                  ? tCount(t, 'cards.tile.photos', summary.photos, { n: summary.photos })
                  : null,
              },
            ].map(({ k, v, sub, title }) => (
              <div
                key={k}
                title={title}
                className="rounded-[9px] border border-slate-800 bg-sunken px-3 py-2.5"
              >
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">{v}</dd>
                {sub && <dd className="text-xs leading-snug text-slate-400">{sub}</dd>}
              </div>
            ))}
          </dl>
          {ops?.longest && (
            <div
              data-testid="summary-longest"
              data-tone={ops.level}
              className="rounded-[9px] border border-slate-800 bg-sunken px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="text-slate-300">
                  {ops.flights > 1 && ops.longest.label
                    ? t('stats.longestOf', { label: ops.longest.label })
                    : t('stats.longest')}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    ops.level === 'over'
                      ? 'text-red-300'
                      : ops.level === 'near'
                        ? 'text-amber-300'
                        : 'text-slate-100'
                  }`}
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
              {ops.longestFrac != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      ops.level === 'over'
                        ? 'bg-red-400'
                        : ops.level === 'near'
                          ? 'bg-amber-400'
                          : 'bg-sky-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.round(ops.longestFrac * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}
          <BatterySetsNote check={setsCheck} battery={batteryLabel(battery, t)} />
          {preflightBlockers.length > 0 && (
            <Notice tone="error" testId="summary-blockers">
              <p className="font-semibold text-red-200">{t('cards.summary.blocked')}</p>
              {preflightBlockers.map((txt, i) => (
                <p key={i} className="mt-1">
                  {txt}
                </p>
              ))}
              {onShowPreflight && (
                <button
                  type="button"
                  onClick={onShowPreflight}
                  className={`${buttonClass('secondary', 'sm')} mt-2`}
                >
                  {t('cards.summary.seeAll')}
                </button>
              )}
            </Notice>
          )}
          {perFlight && <FlightExports {...exportFlights} rows={basesPanel.rows} />}
          {/* o par do cabeçalho, igual em tudo: o mesmo nome, a mesma dica, o
              mesmo preflight e o mesmo ficheiro (com vários voos, o ZIP que o
              cabeçalho escreve: a dica diz qual dos de «Exportar voos» é) */}
          {onExportMission && (
            <Button
              variant="primary"
              size="lg"
              data-testid="summary-export-mission"
              onClick={onExportMission}
              disabled={!canExportMission}
              title={exportMissionTitle ?? undefined}
              icon={<IconDownload className="h-[17px] w-[17px]" />}
              className="w-full"
            >
              {missionExportLabel(t, exportKind)}
            </Button>
          )}
          {onExportArea && (
            <Button
              data-testid="summary-export-area"
              onClick={onExportArea}
              disabled={!canExportArea}
              title={exportAreaTitle ?? undefined}
              icon={<IconDownload />}
              className="h-10 w-full"
            >
              {t('app.exportKml')}
            </Button>
          )}
          {exportAreaNotes.length > 0 && (
            <p
              data-testid="summary-export-area-notes"
              className="text-xs leading-relaxed text-amber-300"
            >
              {exportAreaNotes.join(' ')}
            </p>
          )}
        </Section>
      </CardColumn>

      {/* ---------------- gavetas («Mais opções ›») ---------------- */}
      <Drawer id="missao" n={1} title={t('cards.mission')} {...d.drawer('missao')}>
        {isCustom && (
          <DrawerGroup title={t('cards.sensor')} summary={payload.label}>
            <Segmented
              label={t('cards.sensorKind')}
              value={custom.mode}
              onChange={(v) => setCustom({ ...custom, mode: v })}
              options={[
                { value: 'camera', label: t('cp.drone.camera') },
                { value: 'lidar', label: t('cp.drone.lidar') },
              ]}
            />
            {custom.mode === 'camera' ? (
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label={t('cp.drone.sensorWidth')} unit="mm">
                  <NumberInput
                    className={fieldInput}
                    value={custom.sensorWidth}
                    step={0.1}
                    min={1}
                    onChange={(v) => setCustom({ ...custom, sensorWidth: v })}
                  />
                </Field>
                <Field label={t('cp.drone.sensorHeight')} unit="mm">
                  <NumberInput
                    className={fieldInput}
                    value={custom.sensorHeight}
                    step={0.1}
                    min={1}
                    onChange={(v) => setCustom({ ...custom, sensorHeight: v })}
                  />
                </Field>
                <Field label={t('cp.drone.focalLength')} unit="mm">
                  <NumberInput
                    className={fieldInput}
                    value={custom.focalLength}
                    step={0.1}
                    min={1}
                    onChange={(v) => setCustom({ ...custom, focalLength: v })}
                  />
                </Field>
                <Field label={t('cp.drone.imageWidth')} unit="px">
                  <NumberInput
                    className={fieldInput}
                    value={custom.imageWidth}
                    min={100}
                    onChange={(v) => setCustom({ ...custom, imageWidth: v })}
                  />
                </Field>
              </div>
            ) : (
              <Field label={t('cp.drone.fov')} unit="°" className="w-40">
                <NumberInput
                  className={fieldInput}
                  value={custom.fov}
                  min={1}
                  max={179}
                  onChange={(v) => setCustom({ ...custom, fov: v })}
                />
              </Field>
            )}
          </DrawerGroup>
        )}
        {isCustom && (
          <DrawerGroup title={t('cp.drone.wpmlEnums')} defaultOpen={false}>
            <div className="grid grid-cols-2 items-end gap-3">
              {/* on a real aircraft the drone enum is the aircraft's own;
                  only the CUSTOM aircraft exposes it for editing */}
              {aircraft.id === 'CUSTOM' && (
                <Field label="droneEnumValue">
                  <NumberInput
                    className={fieldInput}
                    value={custom.droneEnumValue}
                    min={0}
                    onChange={(v) => setCustom({ ...custom, droneEnumValue: v })}
                  />
                </Field>
              )}
              <Field label="payloadEnumValue">
                <NumberInput
                  className={fieldInput}
                  value={custom.payloadEnumValue}
                  min={0}
                  onChange={(v) => setCustom({ ...custom, payloadEnumValue: v })}
                />
              </Field>
            </div>
          </DrawerGroup>
        )}
      </Drawer>

      <Drawer id="area" n={2} title={t('cards.area')} {...d.drawer('area')}>
        {mode === 'anchor' && (
          <DrawerGroup
            title={t('cards.anchorShape')}
            summary={`${t('cp.area.blockGrid')} · ${anchor.cols} × ${anchor.rows}`}
          >
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label={t('cp.area.cols')}>
                <NumberInput
                  className={fieldInput}
                  value={anchor.cols}
                  min={1}
                  max={12}
                  onChange={(v) => setAnchorParam('cols', v)}
                />
              </Field>
              <Field label={t('cp.area.rows')}>
                <NumberInput
                  className={fieldInput}
                  value={anchor.rows}
                  min={1}
                  max={12}
                  onChange={(v) => setAnchorParam('rows', v)}
                />
              </Field>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{t('cp.area.gridHint')}</p>
          </DrawerGroup>
        )}
        {slopeHint && (
          <DrawerGroup
            title={t('cards.slope')}
            summary={`${Math.round(slopeHint.slopeDeg)}° · ${t('cp.terrain.slopeApplyLines', {
              lines: Math.round(slopeHint.contourAzimuthDeg),
            })}`}
          >
            <p className={`${SMALL} ${BOX.info}`}>
              {t('cp.terrain.slopeHint', {
                slope: Math.round(slopeHint.slopeDeg),
                az: Math.round(slopeHint.downhillAzimuthDeg),
                lines: Math.round(slopeHint.contourAzimuthDeg),
              })}
            </p>
            <Button onClick={onApplySlopeAngle}>
              {t('cp.terrain.slopeApplyLines', {
                lines: Math.round(slopeHint.contourAzimuthDeg),
              })}
            </Button>
          </DrawerGroup>
        )}
        <DrawerGroup
          title={t('cards.terrainSource')}
          summary={
            terrain.status === 'ready' && terrain.data?.verticalDatum
              ? t('cards.sum.datum', {
                  datum: verticalDatumLabel(terrain.data.verticalDatum, t),
                })
              : terrainSummary
          }
        >
          {terrainReady && (
            <>
              <p className="text-xs text-slate-400">{t('cards.terrainReload')}</p>
              {terrainButtons}
            </>
          )}
          <p className="text-xs leading-relaxed text-slate-400">{t('cp.terrain.auto')}</p>
          {terrain.status === 'ready' &&
            terrain.data?.cacheEnabled &&
            terrain.data.cachedCount > 0 && (
              <p className="text-xs text-slate-400">
                {t('cp.terrain.cacheHint', {
                  hits: terrain.data.cachedCount,
                  total: terrain.data.tileCount,
                })}
              </p>
            )}
          {terrain.status === 'ready' && terrain.data?.verticalDatum && (
            <p className="text-xs leading-relaxed text-slate-300" data-testid="terrain-datum">
              {t('cp.terrain.datum', {
                datum: verticalDatumLabel(terrain.data.verticalDatum, t),
              })}
            </p>
          )}
        </DrawerGroup>
      </Drawer>

      <Drawer id="voo" n={3} title={t('cards.flight')} {...d.drawer('voo')}>
        <DrawerGroup
          title={t('cards.lines')}
          defaultOpen={false}
          summary={[
            params.spacingMode === 'manual'
              ? t('cards.sum.spacingManual', { m: params.manualSpacing })
              : spacing != null
                ? t('cards.sum.spacing', { m: spacing.toFixed(1) })
                : null,
            t('cards.sum.buffer', { pct: params.bufferPct }),
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <Switch
            label={t('cp.flight.manualSpacing')}
            description={
              params.spacingMode === 'manual'
                ? t('cards.spacingManual')
                : spacing != null
                  ? t('cards.spacingAuto', { m: spacing.toFixed(1) })
                  : t('cards.spacingAutoNoValue')
            }
            checked={params.spacingMode === 'manual'}
            onChange={(on) => setParam('spacingMode', on ? 'manual' : 'auto')}
          />
          {params.spacingMode === 'manual' && (
            <Field label={t('cp.flight.lineDistance')} unit="m" className="w-40">
              <NumberInput
                className={fieldInput}
                value={params.manualSpacing}
                min={1}
                max={2000}
                onChange={(v) => setParam('manualSpacing', v)}
              />
            </Field>
          )}
          <div className="flex flex-col gap-1.5">
            <GroupLabel>{t('cp.buffer.title')}</GroupLabel>
            <Segmented
              label={t('cp.buffer.title')}
              value={params.bufferPct}
              onChange={(pct) => setParam('bufferPct', pct)}
              options={[0, 10, 20, 30].map((pct) => ({ value: pct, label: `${pct}%` }))}
            />
            {params.bufferPct > 0 && bufferM > 0 && (
              <p data-testid="buffer-metres" className="text-xs leading-relaxed text-slate-400">
                {t('cp.buffer.metres', { m: Math.round(bufferM), pct: params.bufferPct })}
              </p>
            )}
          </div>
          <Field
            label={t('cp.flight.overshoot')}
            unit="m"
            hint={t('cp.flight.overshootHint')}
            className="w-full [&>label]:w-40"
          >
            <NumberInput
              className={fieldInput}
              value={params.overshoot}
              min={0}
              max={100}
              step={5}
              onChange={(v) => setParam('overshoot', Math.max(0, Math.min(100, v)))}
            />
          </Field>
        </DrawerGroup>
        <DrawerGroup
          title={t('cards.capture')}
          summary={[
            t(`cards.sum.trigger.${triggerMode}`),
            payload.type === 'camera' && params.intervalMode === 'manual'
              ? t('cards.sum.intervalManual')
              : null,
            t('cards.sum.gimbal', { deg: signed(params.gimbalPitch) }),
            headingFixed
              ? t('cards.sum.headingFixed', { deg: params.headingDeg })
              : t('cards.sum.headingRoute'),
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <div className="flex flex-col gap-1.5">
            <GroupLabel>{t('cp.flight.triggerBy')}</GroupLabel>
            <Segmented
              label={t('cp.flight.triggerBy')}
              value={triggerMode}
              onChange={(v) => setParam('triggerMode', v)}
              options={[
                { value: 'distance', label: t('cp.flight.triggerDistance') },
                { value: 'time', label: t('cp.flight.triggerTime') },
                // B: foto por waypoint só faz sentido com câmara
                ...(payload.type === 'camera'
                  ? [{ value: 'waypoint', label: t('cp.flight.triggerWaypoint') }]
                  : []),
              ]}
            />
            {payload.type === 'camera' && params.triggerMode === 'waypoint' && (
              <p className="text-xs leading-relaxed text-slate-400">
                {t('cp.flight.triggerWaypointHint')}
              </p>
            )}
          </div>
          {/* intervalo escrito à mão: metros em Distância e Waypoint, segundos em Tempo */}
          {payload.type === 'camera' && (
            <>
              <Switch
                label={t('cp.flight.manualInterval')}
                description={
                  params.intervalMode === 'manual'
                    ? t('cards.intervalManual')
                    : params.triggerMode !== 'time' && trigger?.intervalM != null
                      ? t('cards.intervalAuto', { m: trigger.intervalM.toFixed(1) })
                      : t('cards.intervalAutoNoValue')
                }
                checked={params.intervalMode === 'manual'}
                testId="interval-manual"
                onChange={(on) => setParam('intervalMode', on ? 'manual' : 'auto')}
              />
              {params.intervalMode === 'manual' &&
                (params.triggerMode === 'time' ? (
                  <Field label={t('cp.flight.intervalValue')} unit="s" className="w-40">
                    <NumberInput
                      className={fieldInput}
                      value={params.manualIntervalS}
                      min={0.1}
                      max={60}
                      step={0.1}
                      testId="interval-seconds"
                      onChange={(v) => setParam('manualIntervalS', v)}
                    />
                  </Field>
                ) : (
                  <Field label={t('cp.flight.intervalValue')} unit="m" className="w-40">
                    <NumberInput
                      className={fieldInput}
                      value={params.manualIntervalM}
                      min={0.5}
                      max={1000}
                      step={0.5}
                      testId="interval-metres"
                      onChange={(v) => setParam('manualIntervalM', v)}
                    />
                  </Field>
                ))}
              {params.intervalMode === 'manual' && trigger?.frontOverlapPct != null && (
                <p
                  data-testid="interval-overlap"
                  className={`-mt-1 text-xs leading-relaxed ${
                    trigger.frontOverlapPct < 60 ? 'text-amber-300' : 'text-slate-400'
                  }`}
                >
                  {t('cp.flight.intervalOverlap', {
                    pct: Math.round(trigger.frontOverlapPct),
                    m: trigger.intervalM.toFixed(1),
                  })}
                  {trigger.frontOverlapPct < 60 && ` ${t('cp.flight.intervalOverlapLow')}`}
                </p>
              )}
            </>
          )}
          {/* só há pontos intermédios com foto por waypoint ou seguimento de terreno */}
          {stopsShown && (
            <div className="flex flex-col gap-1.5">
              <GroupLabel>{t('cp.flight.stops')}</GroupLabel>
              <Segmented
                label={t('cp.flight.stops')}
                value={stops}
                onChange={(v) => setParam('waypointStops', v)}
                options={[
                  { value: 'corners', label: t('cp.flight.stopsCorners') },
                  { value: 'all', label: t('cp.flight.stopsAll') },
                ]}
              />
              <p className="text-xs leading-relaxed text-slate-400">
                {t(stops === 'all' ? 'cp.flight.stopsHintAll' : 'cp.flight.stopsHintCorners')}
              </p>
              <p className="rounded-md border border-slate-800 bg-field px-2 py-1.5 text-[11.5px] leading-relaxed text-slate-400">
                {t(stops === 'all' ? 'cp.flight.stopsKmzAll' : 'cp.flight.stopsKmzCorners')}{' '}
                <span className="font-mono text-slate-300">
                  {stops === 'all'
                    ? 'toPointAndStopWithDiscontinuityCurvature'
                    : 'waypointTurnMode toPointAndPassWithContinuityCurvature, useStraightLine 1'}
                </span>
              </p>
            </div>
          )}
          <Field
            label={t('cp.flight.gimbalPitch')}
            unit="°"
            hint={t('cp.flight.gimbalHint')}
            className="w-full [&>label]:w-40"
          >
            <NumberInput
              className={fieldInput}
              value={params.gimbalPitch}
              min={-90}
              max={0}
              step={5}
              onChange={(v) => setParam('gimbalPitch', Math.max(-90, Math.min(0, v)))}
            />
          </Field>
          {/* rumo da aeronave: segue a rota, ou fixo (smoothTransition com o mesmo ângulo) */}
          <div className="flex flex-col gap-1.5">
            <GroupLabel>{t('cp.flight.headingMode')}</GroupLabel>
            <Segmented
              label={t('cp.flight.headingMode')}
              testId="heading-mode"
              value={headingFixed ? 'fixed' : 'route'}
              onChange={(v) => setParam('headingMode', v)}
              options={[
                { value: 'route', label: t('cp.flight.headingRoute') },
                { value: 'fixed', label: t('cp.flight.headingFixed') },
              ]}
            />
            {headingFixed && (
              <Field label={t('cp.flight.headingDeg')} unit="° · 0–359" className="mt-1.5 w-40">
                <NumberInput
                  className={fieldInput}
                  value={params.headingDeg}
                  min={0}
                  max={359}
                  step={5}
                  testId="heading-deg"
                  onChange={(v) => setParam('headingDeg', ((Math.round(v) % 360) + 360) % 360)}
                />
              </Field>
            )}
            <p className="text-xs leading-relaxed text-slate-400">
              {t(headingFixed ? 'cp.flight.headingHintFixed' : 'cp.flight.headingHintRoute')}
            </p>
          </div>
        </DrawerGroup>
        <DrawerGroup
          title={t('cards.passes')}
          defaultOpen={false}
          summary={
            [
              params.crosshatch
                ? t(params.includeNadir ? 'cards.sum.crossNadir' : 'cards.sum.cross')
                : null,
              params.tieLine ? t('cards.sum.tie') : null,
            ]
              .filter(Boolean)
              .join(' · ') || t('cards.sum.passesNone')
          }
        >
          <Switch
            label={t('cp.orientation.crosshatch')}
            description={
              params.crosshatch
                ? t('cp.orientation.crosshatchHint', { deg: (params.angle + 90) % 360 })
                : null
            }
            checked={params.crosshatch}
            onChange={(on) => setParam('crosshatch', on)}
          />
          {params.crosshatch && (
            <div className="rounded-lg border border-slate-800 bg-sunken p-3">
              <Switch
                label={t('cp.orientation.includeNadir')}
                description={params.includeNadir ? t('cp.orientation.includeNadirHint') : null}
                checked={Boolean(params.includeNadir)}
                onChange={(on) => setParam('includeNadir', on)}
              />
            </div>
          )}
          <Switch
            label={t('cp.orientation.tieLine')}
            description={params.tieLine ? t('cp.orientation.tieLineHint') : null}
            checked={Boolean(params.tieLine)}
            onChange={(on) => setParam('tieLine', on)}
          />
        </DrawerGroup>
      </Drawer>

      <Drawer id="divisao" n={4} title={t('cards.split')} {...d.drawer('divisao')}>
        {!gridActive && (split.mode === 'tiles' || split.mode === 'battery') && (
          <DrawerGroup
            title={t('cards.cells')}
            summary={
              tilesTotal != null
                ? `${t(split.mode === 'tiles' ? 'cp.split.cellsGenerated' : 'cp.split.cells', {
                    n: tilesTotal,
                  })}${t('cp.split.cellsActive', { n: blocks ? blocks.length : 0 })}`
                : null
            }
          >
            {split.mode === 'battery' && (
              <Field label={t('cp.split.maxSide')} unit="m" className="w-40">
                <NumberInput
                  className={fieldInput}
                  value={split.maxSide}
                  min={100}
                  max={2000}
                  step={50}
                  onChange={(v) => setSplitParam('maxSide', v)}
                />
              </Field>
            )}
            <MosaicOrientation
              split={split}
              setSplitParam={setSplitParam}
              tileOrientation={tileOrientation}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={onTilesUndo} title={t('cp.split.undoTitle')}>
                {t('cp.split.undo')}
              </Button>
              <Button onClick={onTilesRestoreAll}>{t('cp.split.restoreAll')}</Button>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {split.mode === 'tiles' ? t('cp.split.tilesHintA') : t('cp.split.batteryHintA')}{' '}
              <strong className="font-medium text-slate-300">{t('cp.split.clickCell')}</strong>{' '}
              {split.mode === 'tiles' ? t('cp.split.tilesHintB') : t('cp.split.batteryHintB')}
              {split.mode === 'battery' && !hasBase && ` ${t('cp.split.markBaseHint')}`}
              {tilesTotal != null && (
                <>
                  {' '}
                  <span className="text-sky-300">
                    {t(split.mode === 'tiles' ? 'cp.split.cellsGenerated' : 'cp.split.cells', {
                      n: tilesTotal,
                    })}
                  </span>
                  {t('cp.split.cellsActive', { n: blocks ? blocks.length : 0 })}.
                </>
              )}
            </p>
          </DrawerGroup>
        )}
      </Drawer>

      <Drawer id="extras" n={6} title={t('cards.extras')} {...d.drawer('extras')}>
        <DrawerGroup
          title={t('cards.extras.gcp')}
          part="gcp"
          summary={gcpConfig.enabled ? `${gcpCount} GCP` : t('cards.extras.gcpOff')}
        >
          <Switch
            label={t('cp.gcp.plan')}
            checked={gcpConfig.enabled}
            disabled={!hasRing}
            onChange={(on) => setGcpConfig({ ...gcpConfig, enabled: on })}
          />
          {gcpConfig.enabled && (
            <>
              <div className="flex items-end gap-2">
                <Field label={t('cp.gcp.count')} className="w-40">
                  <NumberInput
                    className={fieldInput}
                    value={gcpConfig.count ?? gcpAutoCount}
                    min={1}
                    max={25}
                    onChange={(v) => setGcpConfig({ ...gcpConfig, count: v })}
                  />
                </Field>
                <button
                  type="button"
                  aria-pressed={gcpConfig.count == null}
                  onClick={() => setGcpConfig({ ...gcpConfig, count: null })}
                  title={t('cp.gcp.autoTitle', { n: gcpAutoCount })}
                  className={`${buttonClass('secondary', 'md')} h-10 ${
                    gcpConfig.count == null ? '!border-sky-400/40 bg-sky-400/15 text-sky-300' : ''
                  }`}
                >
                  {t('cp.gcp.auto')}
                </button>
              </div>
              {Object.keys(gcpConfig.manual ?? {}).length > 0 && (
                <p
                  className="flex items-center gap-2 text-xs text-slate-400"
                  data-testid="gcp-manual"
                >
                  <span className="flex-1">
                    {t('cp.gcp.manual', { n: Object.keys(gcpConfig.manual).length })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGcpConfig({ ...gcpConfig, manual: {} })}
                    className={buttonClass('secondary', 'sm')}
                  >
                    {t('cp.gcp.reset')}
                  </button>
                </p>
              )}
              {gcpInfo && (
                <p className="text-xs leading-relaxed text-slate-300">
                  {t('cp.gcp.info', {
                    count: gcpInfo.count,
                    ha: gcpInfo.haPerGcp?.toFixed(1),
                    spacing: Number.isFinite(gcpInfo.minSpacingM)
                      ? `${Math.round(gcpInfo.minSpacingM)} m`
                      : '—',
                  })}
                </p>
              )}
              <Button onClick={onExportGcps} icon={<IconDownload />} className="h-10 w-full">
                {t('cp.gcp.export')}
              </Button>
              <p className="text-xs leading-relaxed text-slate-400">{t('cp.gcp.hint')}</p>
            </>
          )}
        </DrawerGroup>
        <DrawerGroup
          title={t('cards.extras.inspect')}
          part="inspect"
          summary={tCount(t, 'cards.sum.points', inspectPoints?.length ?? 0, {
            n: inspectPoints?.length ?? 0,
          })}
        >
          <button
            type="button"
            onClick={onStartInspect}
            title={t('cp.inspect.markTitle')}
            aria-pressed={mode === 'inspect'}
            className={`${buttonClass('secondary', 'md')} h-10 w-full ${
              mode === 'inspect' ? '!border-orange-400/40 bg-orange-400/15 text-orange-200' : ''
            }`}
          >
            <IconTarget className="h-4 w-4" /> {t('cp.inspect.mark')}
          </button>
          {mode === 'inspect' && (
            <p className="text-xs leading-relaxed text-slate-400">{t('cp.inspect.markHint')}</p>
          )}

          {inspectPoints?.length > 0 && (
            <div className="flex flex-col gap-2">
              {inspectPoints.map((p, i) => (
                <div
                  key={p.id}
                  className="cursor-grab rounded-lg border border-slate-800 bg-sunken p-2.5 active:cursor-grabbing"
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
                    <span className="flex w-6 shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums text-orange-300">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 8 14"
                        className="h-3.5 w-2 fill-current text-slate-500"
                      >
                        <circle cx="2" cy="2" r="1.2" />
                        <circle cx="6" cy="2" r="1.2" />
                        <circle cx="2" cy="7" r="1.2" />
                        <circle cx="6" cy="7" r="1.2" />
                        <circle cx="2" cy="12" r="1.2" />
                        <circle cx="6" cy="12" r="1.2" />
                      </svg>
                      {i + 1}
                    </span>
                    <span className={`${fieldBox} !h-8 min-w-0 flex-1 rounded-md !px-2`}>
                      <input
                        type="text"
                        className={fieldInput}
                        value={p.label}
                        aria-label={t('cards.inspectName', { n: i + 1 })}
                        onChange={(e) => onInspectUpdate(p.id, { label: e.target.value })}
                      />
                    </span>
                    <button
                      type="button"
                      aria-label={t('cp.inspect.moveUp', { n: i + 1 })}
                      onClick={() => onInspectMove(p.id, -1)}
                      disabled={i === 0}
                      className={`${buttonClass('ghost', 'sm')} !h-8 !w-8 !px-0`}
                    >
                      <IconChevronDown className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('cp.inspect.moveDown', { n: i + 1 })}
                      onClick={() => onInspectMove(p.id, 1)}
                      disabled={i === inspectPoints.length - 1}
                      className={`${buttonClass('ghost', 'sm')} !h-8 !w-8 !px-0`}
                    >
                      <IconChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('cp.inspect.remove', { n: i + 1 })}
                      onClick={() => onInspectRemove(p.id)}
                      className={`${buttonClass('danger', 'sm')} !h-8 !w-8 !px-0`}
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs text-slate-400">
                    {[
                      {
                        k: 'height',
                        label: t('cp.inspect.height'),
                        title: t('cp.inspect.heightTitle'),
                        value: p.heightM,
                        min: 2,
                        set: (v) => ({ heightM: Number(v) }),
                      },
                      {
                        k: 'heading',
                        label: t('cp.inspect.heading'),
                        title: t('cp.inspect.headingTitle'),
                        value: p.heading ?? '',
                        min: 0,
                        max: 359,
                        set: (v) => ({
                          heading: v === '' ? null : Math.max(0, Math.min(359, Number(v))),
                        }),
                      },
                      {
                        k: 'pitch',
                        label: t('cp.inspect.pitch'),
                        title: t('cp.inspect.pitchTitle'),
                        value: p.gimbalPitch ?? '',
                        min: -90,
                        max: 20,
                        set: (v) => ({
                          gimbalPitch: v === '' ? null : Math.max(-90, Math.min(20, Number(v))),
                        }),
                      },
                    ].map((f) => (
                      <label key={f.k} className="flex min-w-0 items-center gap-1" title={f.title}>
                        {f.label}
                        <input
                          type="number"
                          className="w-full min-w-0 rounded-md border border-slate-700 bg-field px-1 py-0.5 text-right text-xs tabular-nums text-slate-100 focus:border-sky-400 focus:outline-none"
                          value={f.value}
                          placeholder={f.k === 'height' ? undefined : '—'}
                          min={f.min}
                          max={f.max}
                          onChange={(e) => onInspectUpdate(p.id, f.set(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={p.photo !== false}
                        onChange={(e) => onInspectUpdate(p.id, { photo: e.target.checked })}
                        className="h-4 w-4 accent-sky-400"
                      />
                      {t('cp.inspect.photo')}
                    </label>
                    <label className="flex items-center gap-1" title={t('cp.inspect.hoverTitle')}>
                      {t('cp.inspect.hover')}
                      <input
                        type="number"
                        className="w-14 rounded-md border border-slate-700 bg-field px-1 py-0.5 text-right text-xs tabular-nums text-slate-100 focus:border-sky-400 focus:outline-none"
                        value={p.hoverS ?? ''}
                        placeholder="0"
                        min={0}
                        max={60}
                        step={0.5}
                        onChange={(e) =>
                          onInspectUpdate(p.id, {
                            hoverS:
                              e.target.value === ''
                                ? null
                                : Math.max(0, Math.min(60, Number(e.target.value))),
                          })
                        }
                      />
                      s
                    </label>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={onInspectSuggestOrder}
                  disabled={inspectPoints.length < 3}
                  title={t('cp.inspect.suggestTitle')}
                >
                  {t('cp.inspect.suggest')}
                </Button>
                <Button
                  variant="primary"
                  onClick={onExportInspection}
                  disabled={!inspectTerrainOk || inspectPoints.length < 2}
                  icon={<IconDownload />}
                >
                  {t('cp.inspect.export')}
                </Button>
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
