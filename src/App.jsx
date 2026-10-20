import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import CorridorPanel from './components/CorridorPanel.jsx'
import CircularPanel from './components/CircularPanel.jsx'
import MissionModeSelector from './components/MissionModeSelector.jsx'
import FacePanel from './components/FacePanel.jsx'
import OrbitPanel from './components/OrbitPanel.jsx'
import ProjectSummary from './components/ProjectSummary.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import ChecklistPage from './components/ChecklistPage.jsx'
import HelpModal from './components/HelpModal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import DisclaimerModal, {
  acceptDisclaimer,
  disclaimerAccepted,
} from './components/DisclaimerModal.jsx'

// carregados sob demanda
const Map3D = lazy(() => import('./components/Map3D.jsx'))
const MissionReport = lazy(() => import('./components/MissionReport.jsx'))
const ElevationProfile = lazy(() => import('./components/ElevationProfile.jsx'))
import { addBase, nearestBase } from './mission/bases.js'
import {
  baseFieldSheets,
  daySummary,
  heightsOfWaypoints,
  singleRouteSheet,
} from './mission/fieldSheet.js'
import { buildBasesKML } from './mission/basesKml.js'
import { blocksKmlByBase } from './mission/blocksKml.js'
import {
  bufferDistanceMeters,
  computeGSD,
  findOptimalDirection,
  ringToPolygon,
  squareFlightTimeS,
} from './utils/geo.js'
import {
  DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
  MissionExportError,
  buildFilesZip,
  downloadBlob,
} from './utils/exporters.js'
import { useHardware } from './hooks/useHardware.js'
import { useAreaParams } from './hooks/useAreaParams.js'
import { useBaseActions, useBasesState } from './hooks/useBases.js'
import { useMissionOps } from './hooks/useMissionOps.js'
import { useRouteChecks } from './hooks/useRouteChecks.js'
import { usePreflight } from './hooks/usePreflight.js'
import { useActiveRoute } from './hooks/useActiveRoute.js'
import { useAreaGeometry } from './hooks/useAreaGeometry.js'
import { useAreaMission } from './hooks/useAreaMission.js'
import { useCorridorMission, useCorridorRoute } from './hooks/useCorridorMission.js'
import { bboxCovers, bboxOfPoints, terrainTargetBbox } from './mission/corridorTerrain.js'
import { useCircularMission } from './hooks/useCircularMission.js'
import { useOrbitMission } from './hooks/useOrbitMission.js'
import { useFaceMission } from './hooks/useFaceMission.js'
import { useInspection } from './hooks/useInspection.js'
import { useTerrain } from './hooks/useTerrain.js'
import { useProjectSession } from './hooks/useProjectSession.js'
import { terrainIdentity, useViewsheds } from './hooks/useViewsheds.js'
import { viewshedJobs, viewshedTerrainModel } from './mission/viewshedPlan.js'
import { DEFAULT_MISSION_NAME } from './mission/defaults.js'
import { checkFaceClearance } from './utils/faceMode.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from './utils/units.js'
import { serializeProject } from './mission/project.js'
import { DEFAULT_SAFETY } from './mission/safety.js'
import { PreflightList, PreflightPill } from './components/PreflightBar.jsx'
import {
  FlagGB,
  FlagPT,
  IconCheck,
  IconCube,
  IconDrone,
  IconDownload,
  IconGear,
} from './components/Icons.jsx'

const FLAG_BY_LANG = { pt: FlagPT, en: FlagGB }
/** Camada «Bacias de visão» ligada neste aparelho ('1') ou não. */
const VIEWSHED_LAYER_KEY = 'dji-mission-planner:viewshedLayer'

import { browserStorage } from './utils/browserStorage.js'
import { LANGS, LangContext, useT } from './i18n.jsx'

/** Bases a menos de ~3 km da caixa da área: entram na caixa do relevo (a cota da zona). */
function basePointsNear(bases, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return []
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const dLat = 3000 / M_PER_DEG_LAT
  const dLon = 3000 / metersPerDegLonSafe((y0 + y1) / 2)
  // a zona (até 500 m) também tem de ficar dentro do relevo
  const r = 500 / M_PER_DEG_LAT
  const out = []
  for (const b of bases ?? []) {
    const [x, y] = b.point
    if (x < x0 - dLon || x > x1 + dLon || y < y0 - dLat || y > y1 + dLat) continue
    out.push([x - r * 1.3, y - r], [x + r * 1.3, y + r])
  }
  return out
}

export default function App() {
  // a língua gravada, lida com guarda (M3-C6): com o armazenamento recusado
  // o getter lança e a página ficava em branco; um valor desconhecido cai em pt
  const [lang, setLang] = useState(() => {
    try {
      const v = window.localStorage.getItem('dji-mission-planner:lang')
      return LANGS.some((l) => l.code === v) ? v : 'pt'
    } catch {
      return 'pt'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('dji-mission-planner:lang', lang)
    } catch {
      /* ignora */
    }
  }, [lang])

  return (
    <LangContext.Provider value={lang}>
      <AppInner lang={lang} setLang={setLang} />
    </LangContext.Provider>
  )
}

function AppInner({ lang, setLang }) {
  const t = useT()
  /* ----------------------------- Estado ----------------------------- */
  // 'planner' | 'checklist' — o hash #checklist permite ligação direta
  const [view, setView] = useState(() =>
    window.location.hash === '#checklist' ? 'checklist' : 'planner',
  )
  useEffect(() => {
    const hash = view === 'checklist' ? '#checklist' : ''
    if (window.location.hash !== hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search + hash)
    }
  }, [view])
  const [missionName, setMissionName] = useState(DEFAULT_MISSION_NAME)
  // acções de segurança (fim da missão, sinal perdido) de todos os modos
  const [safety, setSafety] = useState(() => ({ ...DEFAULT_SAFETY }))
  // aeronave, payload, equipamento e bateria da missão (src/hooks/useHardware.js)
  const {
    drone,
    setDrone,
    custom,
    setCustom,
    payloadTuning,
    setPayloadTuning,
    equipment,
    setEquipment,
    zoneConfig,
    setMissionBattery,
    aircraftRef,
    aircraft,
    payload,
    vlosM,
    speedRange,
    hardwareLabel,
    effectiveFov,
    activePayload,
    sensor,
    setEffectiveFov,
    missionBatteryType,
    batteryMin,
    batteryOverridden,
    setMissionBatteryId,
    setUsefulMin,
    wpml,
    equipmentBatteries,
  } = useHardware()
  const [showSettings, setShowSettings] = useState(false)
  // bacias de visão: vegetação e obstáculos a somar a um MDT (por missão,
  // no projecto: dependem do sítio)
  const [obstacleM, setObstacleM] = useState(0)
  // ficheiro de relevo do projecto aberto (nome e MDT/MDS): o ficheiro não
  // vai no projecto, mas a escolha volta quando for reimportado
  const [demMemory, setDemMemory] = useState(
    /** @type {{label: string, surface: 'dtm'|'dsm'}|null} */ (null),
  )
  // camada das bacias de visão: desligada por omissão, lembrada neste aparelho
  const [viewshedLayerOn, setViewshedLayerOn] = useState(
    () => browserStorage()?.getItem(VIEWSHED_LAYER_KEY) === '1',
  )
  useEffect(() => {
    try {
      browserStorage()?.setItem(VIEWSHED_LAYER_KEY, viewshedLayerOn ? '1' : '0')
    } catch {
      /* ignora */
    }
  }, [viewshedLayerOn])
  const [mode, setMode] = useState('idle') // 'idle' | 'draw' | 'anchor' | 'base' | 'inspect' | 'face'
  // tipo de missão activo (E1.0, modelo A): troca a ferramenta e o painel
  const [missionMode, setMissionMode] = useState('area') // 'area' | 'face' | 'orbit' | 'corridor'
  // pontos de inspeção (R2.9): waypoints avulsos com rumo/pitch/foto próprios
  const [draftVertices, setDraftVertices] = useState([])
  // bases de descolagem: estado, Ctrl+Z e a última proposta (src/hooks/useBases.js)
  const {
    bases,
    setBases,
    blockBaseState,
    setBlockBaseState,
    selectedBaseId,
    setSelectedBaseId,
    basesHistory,
    baseProposal,
    setBaseProposal,
  } = useBasesState()
  const [exportError, setExportError] = useState(null)
  // a versão que gravou o projecto aberto (M3-U17): o cartão 1 diz o que mudou
  // desde então; null depois de lido ou quando é a actual

  /**
   * E4.1: nenhuma exportação escreve um ficheiro com valores inválidos. O
   * exportador valida na fronteira e lança MissionExportError; aqui a falha
   * vira uma mensagem no cabeçalho, em vez de uma promessa rejeitada sem
   * dono e de um KMZ que só falha no comando, no campo.
   */
  const runExport = useCallback(async (fn) => {
    setExportError(null)
    try {
      await fn()
    } catch (err) {
      // o código e o detalhe (M3-C10): um erro que não é da validação chega
      // ao operador com a mensagem, não com a chave `export.err.unknown` crua
      setExportError(
        err instanceof MissionExportError
          ? { code: err.code, detail: err.detail ?? '' }
          : { code: 'unknown', detail: String(err?.message ?? err ?? '') },
      )
      if (!(err instanceof MissionExportError)) console.error(err)
    }
  }, [])
  const [showHelp, setShowHelp] = useState(false)
  // aviso antes de usar: uma vez por aparelho (e de novo quando o texto
  // muda); reaberto da ajuda, só para reler
  const [disclaimer, setDisclaimer] = useState(() => (disclaimerAccepted() ? null : 'first'))
  const closeDisclaimer = useCallback(() => {
    acceptDisclaimer()
    setDisclaimer(null)
  }, [])
  const [show3d, setShow3d] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showPreflight, setShowPreflight] = useState(false)

  /* ------------------- Pipeline de cálculo (memo) -------------------- */
  // parâmetros de voo da área: pegada, espaçamento, intervalo, GSD e avisos
  // do obturador (src/hooks/useAreaParams.js)
  const {
    params,
    setParams,
    setParam,
    speed,
    footprint,
    spacing,
    trigger,
    interval,
    gsdPitch,
    gsd,
    pointDensity,
    triggerWarn,
    avisoIntervalo,
    onImportedMission,
    flightPresets,
    applyPreset,
    setAltitudeFromGsd,
  } = useAreaParams({
    aircraftRef,
    speedRange,
    sensor,
    payload,
    aircraftId: drone.aircraftId,
    setMissionName,
  })

  /* ------------------------- Modo corredor ---------------------------- */
  const {
    corridorConfig,
    setCorridorConfig,
    setCorridorParam,
    corridorSpeed,
    corridorTriggerWarn,
    corridorFlight,
    corridorSplit,
    corridorPlan: corridorPlanFlat,
    corridorBbox,
    corridorPreview,
    startCorridorDraw,
    handleFinishCorridor,
    clearCorridorAxis,
  } = useCorridorMission({
    draftVertices,
    sensor,
    speedRange,
    // a altura e as sobreposições da área valem quando o corredor não tem as
    // suas; o intervalo do corredor é sempre o automático (o manual é da área)
    altitude: params.altitude,
    frontOverlap: params.frontOverlap,
    sideOverlap: params.sideOverlap,
    missionMode,
    setMode,
    setDraftVertices,
    avisoIntervalo,
    usableMin: batteryMin,
  })

  /* ------------------------ Modo órbita (E1.2) ------------------------ */
  const {
    orbitConfig,
    setOrbitConfig,
    setOrbitParam,
    startOrbitPoi,
    clearOrbitPoi,
    handleOrbitPoiDrag,
    orbitPlan,
    gsdAtRadius,
    setRadiusFromGsd,
    orbitPreview,
    handleExportOrbitSingle,
    handleExportOrbitPerLevel,
  } = useOrbitMission({
    sensor,
    missionMode,
    missionName,
    wpml,
    safety,
    bases,
    setMode,
    runExport,
  })

  /* ----------------------- Modo fachada (E1.1) ------------------------ */
  const {
    faceConfig,
    setFaceConfig,
    setFaceParam,
    startFaceDraw,
    handleFinishFace,
    clearFaceBaseline,
    facePlan,
    facePreview,
    handleExportFace,
  } = useFaceMission({
    draftVertices,
    sensor,
    missionMode,
    missionName,
    wpml,
    safety,
    setMode,
    setDraftVertices,
    runExport,
  })

  /* --------------------- Pontos de inspeção (R2.9) -------------------- */
  const {
    inspectPoints,
    setInspectPoints,
    inspectSeqRef,
    startInspect,
    addInspectPoint,
    updateInspectPoint,
    removeInspectPoint,
    moveInspectPoint,
    reorderInspectPoints,
    suggestInspectOrder,
    handleInspectDrag,
    handleExportInspection,
  } = useInspection({
    bases,
    altitude: params.altitude,
    speed,
    gimbalPitch: params.gimbalPitch,
    sensorType: sensor.type,
    missionName,
    wpml,
    safety,
    setMode,
    runExport,
  })

  /* ------------------ Modo área, parte 1: geometria ------------------- */
  const {
    ring,
    holes,
    importParts,
    useAllImportedParts,
    areaOrigin,
    anchor,
    setAnchorParam,
    gridCells,
    split,
    setSplitParam,
    disabledTiles,
    validation,
    ringBbox,
    tiles,
    tilesError,
    tileSide,
    tileOrientation,
    activeCells,
    activeCellIds,
    activeCellHoles,
    refAzimuth,
    undoEdit,
    pushHistory,
    toggleTile,
    restoreAllTiles,
    startDraw,
    startAnchor,
    clearAll,
    handleFinishDraw,
    handleAreaClick,
    handleVertexDrag,
    handleVertexInsert,
    handleVertexDelete,
    handleAreaMove,
    importState,
    importError,
    importWarning,
    handleImportFile,
    handleImportCrs,
    cancelImport,
    fitKey,
    setFitKey,
    applyProjectGeometry,
  } = useAreaGeometry({
    draftVertices,
    mode,
    setMode,
    setDraftVertices,
    // os quadrados seguem as faixas: o ângulo que o plano usa
    lineAngle: params.angle,
    zoneRadiusM: equipment.zoneRadiusM,
    speed,
    spacing,
    batteryMin,
    passes: params.crosshatch ? (params.includeNadir ? 3 : 2) : 1,
    // prolongamento, fiada e margem: o lado por bateria conta o que a
    // célula voa além do quadrado
    overshootM: Math.max(0, params.overshoot || 0),
    tieLine: Boolean(params.tieLine),
    bufferPct: Math.max(0, params.bufferPct || 0),
    // foto por waypoint com paragem em todos: uma paragem a cada intervalo
    stopEveryM:
      params.waypointStops === 'all' &&
      sensor.type === 'camera' &&
      params.triggerMode === 'waypoint' &&
      interval > 0
        ? interval
        : 0,
    onImportedMission,
    t,
    history: basesHistory,
  })

  /* ------------------------------ Terreno ----------------------------- */
  // Caixa da rota exportada do separador aberto, calculada mais abaixo (a
  // rota vem depois do relevo) e trazida para aqui no render seguinte;
  // arredondada a ~10 m para não mudar com as alturas do terreno
  const [routeBox, setRouteBox] = useState(
    /** @type {{mode: string|null, box: number[]|null}} */ ({ mode: null, box: null }),
  )
  // Todas as geometrias do projecto juntas (um só MDT para todas), ou a do
  // separador aberto quando ficam a mais de 20 km. Chave estável: uma caixa
  // nova a cada render reiniciava a espera da descarga automática.
  const terrainTargetKey = useMemo(() => {
    const ok = (p) => (p && !p.error ? bboxOfPoints(p.waypoints) : null)
    // a área com as células (partes de um MultiPolygon podem ficar fora do
    // contorno) e os pontos de inspecção, missão do mesmo separador
    const areaPts = [
      ...(ring && validation.valid ? ring : []),
      ...(ring && validation.valid && Array.isArray(gridCells) ? gridCells.flat() : []),
      ...(inspectPoints ?? []).map((p) => p.point),
      // as zonas das bases junto da área: a cota de referência de cada bloco
      ...(ring && validation.valid ? basePointsNear(bases, ring) : []),
    ]
    const boxes = {
      areaBbox: bboxOfPoints(areaPts),
      corridorBbox,
      faceBbox: ok(facePlan),
      orbitBbox: ok(orbitPlan),
    }
    const active = {
      area: 'areaBbox',
      circular: 'areaBbox',
      corridor: 'corridorBbox',
      face: 'faceBbox',
      orbit: 'orbitBbox',
    }[missionMode]
    // e a rota do separador aberto, que sai da geometria (círculos que
    // passam o contorno, margem da área): é ela que tem de ficar coberta
    const withRoute = (b) => {
      if (!b || routeBox.mode !== missionMode || !routeBox.box) return b
      const r = routeBox.box
      return [
        Math.min(b[0], r[0]),
        Math.min(b[1], r[1]),
        Math.max(b[2], r[2]),
        Math.max(b[3], r[3]),
      ]
    }
    const key = (b) => (b ? b.map((v) => v.toFixed(6)).join(',') : '')
    // todas as geometrias juntas (relevo global) | só o separador aberto
    // (recorte do MDT importado, sem perder resolução com a união)
    return [
      key(withRoute(terrainTargetBbox({ ...boxes, missionMode }))),
      key(withRoute(active ? boxes[active] : null)),
    ].join('|')
  }, [
    routeBox,
    ring,
    validation.valid,
    gridCells,
    inspectPoints,
    bases,
    corridorBbox,
    facePlan,
    orbitPlan,
    missionMode,
  ])
  const [terrainTarget, terrainActive] = useMemo(
    () => terrainTargetKey.split('|').map((k) => (k ? k.split(',').map(Number) : null)),
    [terrainTargetKey],
  )
  const {
    terrain,
    terrainFollow,
    setTerrainFollow,
    handleLoadTerrain,
    handleImportDem,
    terrainCovers,
    slopeHint,
    demSurface,
    setDemSurface,
    demFileLabel,
  } = useTerrain({
    ring,
    ringBbox,
    ringValid: validation.valid,
    targetBbox: terrainTarget,
    activeBbox: terrainActive,
    rememberedDem: demMemory,
  })

  // Pontos de inspecção: missão própria, fora do preflight da área, mas com a
  // mesma regra, sem relevo sobre os pontos não se exporta
  const inspectTerrainOk = useMemo(() => {
    const box = bboxOfPoints((inspectPoints ?? []).map((p) => p.point))
    return terrain.status === 'ready' && Boolean(box) && bboxCovers(terrain.data?.bbox, box)
  }, [inspectPoints, terrain])
  const exportInspection = useCallback(() => {
    if (inspectTerrainOk) handleExportInspection()
  }, [inspectTerrainOk, handleExportInspection])

  // Fachada: folga só contra DSM LOCAL; com o relevo global fica "standoff
  // não verificado"
  const dsmLoaded = terrain.status === 'ready' && terrain.data?.source === 'file'
  const faceClearance = useMemo(() => {
    if (!facePlan || facePlan.error || !dsmLoaded) return null
    return checkFaceClearance(facePlan, terrain.data.elevationAt, {
      minClearanceM: faceConfig.minClearanceM,
    })
  }, [facePlan, dsmLoaded, terrain.data, faceConfig.minClearanceM])

  /* ---------- Corredor, parte 2: relevo, referência, exportação -------- */
  // Modos de rota única: a base de referência é a mais próxima da rota (ou
  // da geometria) desse modo; com uma só base é sempre ela, como antes
  const corridorBase = useMemo(
    () =>
      nearestBase(
        bases,
        corridorPlanFlat && !corridorPlanFlat.error
          ? corridorPlanFlat.waypoints
          : corridorConfig.centreline,
      ),
    [bases, corridorPlanFlat, corridorConfig.centreline],
  )
  const circularBase = useMemo(() => nearestBase(bases, ring), [bases, ring])
  const {
    corridorRoute: corridorPlan,
    corridorTerrain,
    corridorReference,
    corridorCovers,
    corridorBaseDistance,
    handleExportCorridor,
  } = useCorridorRoute({
    corridorPlan: corridorPlanFlat,
    corridorConfig,
    corridorSpeed,
    terrain,
    terrainFollow,
    basePoint: corridorBase?.point ?? null,
    zoneConfig,
    baseRadiusM: corridorBase?.radiusM ?? null,
    altitude: corridorFlight.altitude,
    interval: corridorFlight.interval,
    corridorSplit,
    bases,
    missionName,
    wpml,
    safety,
    sensorType: sensor.type,
    runExport,
  })

  /* ---------- Modo área, parte 2: plano, blocos, GCPs, exportação ------ */
  const {
    gcpConfig,
    setGcpConfig,
    photoMode,
    plan,
    planOk,
    blocks,
    waypointWarn,
    gcpAutoCount,
    gcps,
    gcpInfo,
    photoPoints,
    terrainResult,
    reference,
    zones,
    baseLayout,
    blockRefs,
    refBase,
    layoutKey,
    layoutCells,
    blockBase: blockBaseEffective,
    manualLost,
    canExportKML,
    canExportKMZ,
    handleExportKML,
    handleExportGcps,
    handleExportKMZ,
    handleExportFlights,
    flightFiles,
    exportBaseName,
    safeName: areaSafeName,
  } = useAreaMission({
    ring,
    holes,
    validation,
    activeCells,
    activeCellIds,
    activeCellHoles,
    tiles,
    gridCells,
    bases,
    blockBaseState,
    zoneConfig,
    vlosM,
    params,
    spacing,
    interval,
    intervalS: trigger.seconds,
    speed,
    batteryMin,
    split,
    sensor,
    wpml,
    safety,
    missionName,
    terrain,
    terrainFollow,
    terrainCovers,
    runExport,
  })

  /* --------------- Modo circular (circlegrammetry) -------------------- */
  // Sobre o mesmo poligono da area: herda o relevo, a cota de referencia e
  // o seguimento de terreno; a geometria e os blocos sao proprios.
  const {
    circularConfig,
    setCircularConfig,
    setCircularParam,
    circularSpeed,
    circularFlight,
    circularTriggerWarn,
    circularPlan,
    circularAdvice,
    circularReference,
    circularTerrain,
    circularCovers,
    enableCircular,
    removeCircular,
    circularBlocks,
    circularUsableMin,
    circularPreview,
    handleExportCircularSingle,
    handleExportCircularBlocks,
  } = useCircularMission({
    ring,
    holes,
    validation,
    sensor,
    altitude: params.altitude,
    frontOverlap: params.frontOverlap,
    speedRange,
    missionName,
    wpml,
    safety,
    terrain,
    terrainFollow,
    basePoint: circularBase?.point ?? null,
    zoneConfig,
    baseRadiusM: circularBase?.radiusM ?? null,
    batteryMin,
    reservePct: split.reservePct,
    missionMode,
    runExport,
    avisoIntervalo,
  })

  // trânsitos, alcance visual, voos contra as baterias, métricas e resumo do
  // projecto (src/hooks/useMissionOps.js)
  const {
    areaBasePoint,
    perBlockBases,
    areaBaseDistance,
    areaRouteOps,
    corridorRouteOps,
    circularRouteOps,
    circularBaseDistance,
    setsCheck,
    circularSetsCheck,
    modeStats,
    statsOps,
    projectSummary,
  } = useMissionOps({
    baseLayout,
    refBase,
    blocks,
    ring,
    zones,
    equipment,
    planOk,
    speed,
    corridorPlan,
    corridorSpeed,
    corridorBase,
    circularBase,
    circularPlan,
    circularSpeed,
    drone,
    missionBatteryType,
    circularBlocks,
    bases,
    missionMode,
    facePlan,
    orbitPlan,
    batteryMin,
    split,
  })

  // Bacias de visão: cada bloco visto dos olhos do operador no ponto da sua
  // base (src/mission/viewshedPlan.js), na área dividida em blocos com bases
  // e relevo sobre a área. A cota do drone é a do KMZ: com seguimento de
  // terreno relevo + AGL, sem ele a cota da zona do bloco + altura. Calculado
  // em fatias, depois de uma pausa nas edições (useViewsheds).
  const viewshedOn =
    missionMode === 'area' && perBlockBases && terrain.status === 'ready' && terrainCovers
  const viewTerrain = useMemo(
    () =>
      viewshedOn
        ? viewshedTerrainModel(terrain.data, {
            surface: terrain.data?.source === 'file' ? demSurface : 'dtm',
            obstacleM,
          })
        : null,
    [viewshedOn, terrain.data, demSurface, obstacleM],
  )
  const viewshedTf = Boolean(terrainFollow.enabled && terrainResult && !terrainResult.error)
  const viewJobs = useMemo(
    () =>
      viewshedOn && viewTerrain
        ? viewshedJobs({
            blocks,
            layout: baseLayout,
            bases,
            zones,
            altitudeM: params.altitude,
            terrainFollow: viewshedTf,
            terrainKey: terrainIdentity(terrain.data),
            eyeHeightM: equipment.eyeHeightM,
            antennaHeightM: equipment.antennaHeightM,
            obstacleM: viewTerrain.obstacleM,
            resolutionM: viewTerrain.resolutionM,
          })
        : [],
    [
      viewshedOn,
      viewTerrain,
      blocks,
      baseLayout,
      bases,
      zones,
      params.altitude,
      viewshedTf,
      terrain.data,
      equipment.eyeHeightM,
      equipment.antennaHeightM,
    ],
  )
  const viewsheds = useViewsheds({
    jobs: viewJobs,
    elevationAt: viewshedOn ? (terrain.data?.elevationAt ?? null) : null,
    eyeHeightM: equipment.eyeHeightM,
    antennaHeightM: equipment.antennaHeightM,
    obstacleM: viewTerrain?.obstacleM ?? 0,
    resolutionM: viewTerrain?.resolutionM ?? 0,
  })
  const viewshedByBlock = viewJobs.length ? viewsheds.byBlock : null

  // bases: zonas no painel, arrasto, remoção, raio, «Propor bases» e
  // atribuição de blocos (src/hooks/useBases.js)
  const overlayOpen =
    show3d || showProfile || showHelp || showReport || showSettings || Boolean(disclaimer)
  const {
    baseRows,
    handleBaseDrag,
    startBase,
    removeBaseById,
    removeBase,
    setBaseRadiusById,
    proposeBasesForBlocks,
    cancelProposal,
    proposing,
    proposeProgress,
    assignMode,
    handleTileClick,
    handleBlockClick,
    handleBaseSelect,
  } = useBaseActions({
    bases,
    setBases,
    blockBaseState,
    setBlockBaseState,
    selectedBaseId,
    setSelectedBaseId,
    setBaseProposal,
    layoutKey,
    layoutCells,
    ring,
    manualLost,
    blockBaseEffective,
    blocks,
    zones,
    baseLayout,
    refBase,
    disabledTiles,
    toggleTile,
    pushHistory,
    missionMode,
    mode,
    setMode,
    corridorBase,
    circularBase,
    terrain,
    terrainCovers,
    demSurface,
    obstacleM,
    viewshedTf,
    altitudeM: params.altitude,
    equipment,
    vlosM,
    overlayOpen,
  })

  const handleMapClick = useCallback(
    (lonlat) => {
      if (handleAreaClick(lonlat)) return
      if (mode === 'base') {
        // "Marcar base" acrescenta uma base (A, B, C...) e selecciona-a
        const res = addBase(bases, lonlat)
        if (res.base) pushHistory()
        setBases(res.bases)
        if (res.base) setSelectedBaseId(res.base.id)
        setMode('idle')
      } else if (mode === 'face' || mode === 'corridor') {
        setDraftVertices((d) => [...d, lonlat])
      } else if (mode === 'orbit') {
        setOrbitConfig((c) => ({ ...c, poi: lonlat }))
        setMode('idle')
      } else if (mode === 'inspect') {
        addInspectPoint(lonlat)
      }
    },
    [
      mode,
      handleAreaClick,
      addInspectPoint,
      setOrbitConfig,
      bases,
      pushHistory,
      setBases,
      setSelectedBaseId,
    ],
  )

  /* ---------------------- Interacções comuns -------------------------- */
  const changeMissionMode = useCallback(
    (m) => {
      setMissionMode(m)
      setMode('idle')
      setDraftVertices([])
      // abrir o separador circular é escolher essa missão: passa a existir
      if (m === 'circular') enableCircular()
    },
    [enableCircular],
  )

  // o duplo clique no mapa conclui o desenho activo (área, baseline ou eixo)
  const handleFinishAny = useCallback(() => {
    if (mode === 'face') handleFinishFace()
    else if (mode === 'corridor') handleFinishCorridor()
    else handleFinishDraw()
  }, [mode, handleFinishFace, handleFinishCorridor, handleFinishDraw])

  const removeLastDraftVertex = useCallback(() => {
    setDraftVertices((d) => d.slice(0, -1))
  }, [])

  // Teclado nos desenhos (polígono, linha de base, eixo): Backspace/Delete
  // ou Ctrl+Z anulam o último ponto (o Ctrl+Z das edições da área fica de
  // fora enquanto se desenha), Escape cancela o desenho (ignorado quando o
  // foco está num input)
  useEffect(() => {
    if (mode !== 'draw' && mode !== 'face' && mode !== 'corridor') return
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const undo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'
      if (e.key === 'Backspace' || e.key === 'Delete' || undo) {
        e.preventDefault()
        removeLastDraftVertex()
      } else if (e.key === 'Escape') {
        setMode('idle')
        setDraftVertices([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, removeLastDraftVertex])

  const applySlopeAngle = useCallback(() => {
    if (slopeHint) setParams((p) => ({ ...p, angle: Math.round(slopeHint.contourAzimuthDeg) }))
  }, [slopeHint, setParams])

  // a rota que sairia no KMZ do separador aberto, a vista 3D, as fotos no
  // mapa e no 3D e os blocos do perfil (src/hooks/useActiveRoute.js)
  const {
    faceTakeoff,
    orbitTakeoff,
    view3d,
    photos3d,
    mapPhotoPoints,
    view3dColors,
    profileBlocks,
  } = useActiveRoute({
    missionMode,
    terrain,
    facePlan,
    faceConfig,
    orbitPlan,
    orbitConfig,
    corridorPlan,
    corridorReference,
    corridorFlight,
    corridorConfig,
    corridorPreview,
    circularPlan,
    circularReference,
    planOk,
    terrainResult,
    reference,
    blockRefs,
    blocks,
    baseLayout,
    photoPoints,
    params,
    bases,
    zoneConfig,
    setRouteBox,
  })

  // folga ao solo, buracos do relevo, trânsitos e RTH da rota que sairia no
  // KMZ (src/hooks/useRouteChecks.js)
  const { clearance, terrainHoles, transitClearanceInfo, rthInfo } = useRouteChecks({
    terrain,
    view3d,
    bases,
    terrainResult,
    missionMode,
    areaBasePoint,
    corridorBase,
    circularBase,
    perBlockBases,
    blocks,
    baseLayout,
    blockRefs,
    safety,
    params,
  })

  // os parâmetros que o piloto confere no Pilot 2, na ficha (M3-U10)
  // (no corredor, a altura e as sobreposições que o corredor usa: as suas ou as da área)
  const sheetParams = useMemo(
    () =>
      missionMode === 'corridor'
        ? {
            altitudeM: corridorFlight.altitude,
            speedMS: corridorSpeed,
            frontPct: corridorFlight.frontOverlap,
            sidePct: corridorFlight.sideOverlap,
            gsdCm: computeGSD(sensor, corridorFlight.altitude, -90),
          }
        : missionMode === 'circular'
          ? {
              altitudeM: circularFlight.altitude,
              speedMS: circularSpeed,
              frontPct: circularFlight.frontOverlap,
              sidePct: circularConfig.overlapPct,
              gsdCm: computeGSD(sensor, circularFlight.altitude, circularConfig.gimbalPitch),
            }
          : {
              altitudeM: params.altitude,
              speedMS: speed,
              frontPct: params.frontOverlap,
              sidePct: params.sideOverlap,
              gsdCm: Number.isFinite(gsd) ? gsd : null,
            },
    [
      missionMode,
      corridorFlight,
      corridorSpeed,
      circularFlight,
      circularSpeed,
      circularConfig.overlapPct,
      circularConfig.gimbalPitch,
      sensor,
      params.altitude,
      params.frontOverlap,
      params.sideOverlap,
      speed,
      gsd,
    ],
  )
  // a ficha de uma rota única com a base marcada (área sem blocos, corredor,
  // circular): a mesma forma das fichas por base, com um só voo (M3-U10)
  const singleSheet = useMemo(() => {
    if (perBlockBases) return null
    const pick =
      missionMode === 'area'
        ? {
            base: refBase,
            zone: refBase ? zones[refBase.id] : null,
            ops: areaRouteOps,
            timeS: planOk?.stats?.flightTimeS,
            file: `${exportBaseName}.kmz`,
          }
        : missionMode === 'corridor'
          ? {
              base: corridorBase,
              zone: corridorReference?.zone ?? null,
              ops: corridorRouteOps,
              timeS: modeStats?.flightTimeS,
              file: null,
            }
          : missionMode === 'circular'
            ? {
                base: circularBase,
                zone: circularReference?.zone ?? null,
                ops: circularRouteOps,
                timeS: modeStats?.flightTimeS,
                file: null,
              }
            : null
    if (!pick?.base?.point || !Number.isFinite(pick.timeS)) return null
    const z = pick.zone && !pick.zone.error ? pick.zone : null
    return singleRouteSheet({
      label: pick.base.label ?? 'A',
      color: pick.base.color ?? null,
      point: pick.base.point,
      radiusM: z?.radiusM ?? pick.base.radiusM ?? equipment.zoneRadiusM,
      requestedRadiusM: z?.requestedRadiusM ?? null,
      reduced: Boolean(z?.reduced),
      cause: z?.cause ?? null,
      noTerrain: Boolean(pick.zone?.error),
      refElev: z?.refElev ?? view3d?.refElev ?? null,
      gainM: z?.gainM ?? null,
      flightLabel: '1',
      file: pick.file,
      flightS: pick.timeS,
      transitS: pick.ops?.transitS ?? 0,
      vlosM,
      worstVlosM: pick.ops?.vlosWorstM ?? null,
      rthM: rthInfo?.maxM ?? null,
      takeoffM: rthInfo?.takeoffM ?? DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
      heights: heightsOfWaypoints(view3d?.waypoints, params.altitude),
      usefulS: batteryMin > 0 ? batteryMin * 60 : null,
      params: sheetParams,
      equipment,
      aircraftId: drone.aircraftId,
      batteryId: missionBatteryType.id,
      baseWord: t('bases.label', { label: '' }).trim(),
    })
  }, [
    perBlockBases,
    missionMode,
    refBase,
    zones,
    areaRouteOps,
    planOk,
    exportBaseName,
    corridorBase,
    corridorReference,
    corridorRouteOps,
    circularBase,
    circularReference,
    circularRouteOps,
    modeStats,
    equipment,
    view3d,
    vlosM,
    rthInfo,
    params.altitude,
    batteryMin,
    sheetParams,
    drone.aircraftId,
    missionBatteryType.id,
    t,
  ])
  // ficha de campo por base (checklist, relatório e KML «Bases e blocos»):
  // com a área dividida em blocos e bases marcadas, ou a rota única com base
  const fieldSheets = useMemo(
    () =>
      perBlockBases
        ? baseFieldSheets({
            rows: baseRows,
            layout: baseLayout,
            blocks,
            files: flightFiles,
            vlosM,
            equipment,
            aircraftId: drone.aircraftId,
            batteryId: missionBatteryType.id,
            baseWord: t('bases.label', { label: '' }).trim(),
            viewsheds: viewshedByBlock,
            viewTerrain,
            rthByFlight: rthInfo?.byFlight ?? null,
            takeoffM: rthInfo?.takeoffM ?? DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
            heightsOf: (id) => {
              const tfOk = terrainResult && !terrainResult.error
              const src = tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
              return heightsOfWaypoints(src?.find((b) => b.id === id)?.waypoints, params.altitude)
            },
            usefulS: batteryMin > 0 ? batteryMin * 60 : null,
            params: sheetParams,
          })
        : singleSheet
          ? [singleSheet]
          : [],
    [
      viewshedByBlock,
      viewTerrain,
      perBlockBases,
      baseRows,
      baseLayout,
      blocks,
      flightFiles,
      vlosM,
      equipment,
      drone.aircraftId,
      missionBatteryType.id,
      t,
      rthInfo,
      terrainResult,
      params.altitude,
      batteryMin,
      sheetParams,
      singleSheet,
    ],
  )
  // a linha do dia por cima das fichas: todos os voos contra os conjuntos da equipa
  const fieldSheetsDay = useMemo(
    () =>
      daySummary(fieldSheets, {
        equipment,
        aircraftId: drone.aircraftId,
        batteryId: missionBatteryType.id,
      }),
    [fieldSheets, equipment, drone.aircraftId, missionBatteryType.id],
  )
  // avisos do KML da área (K-B1, K-E1 e K-M8 da revisão da exportação): o
  // ficheiro para o Pilot 2 leva só o anel exterior da maior parte, com as
  // células desactivadas dentro; vão no título dos dois botões e no cartão 7
  const areaKmlNotes = useMemo(() => {
    const notes = []
    const nHoles = holes?.length ?? 0
    if (nHoles) notes.push(t(nHoles === 1 ? 'app.kmlHoleNote' : 'app.kmlHolesNote', { n: nHoles }))
    const parts = gridCells?.length > 1 ? gridCells.length : (importParts?.length ?? 0)
    if (parts > 1) notes.push(t('app.kmlPartsNote', { n: parts }))
    const off = disabledTiles?.size ?? 0
    if (off) notes.push(t(off === 1 ? 'app.kmlCellNote' : 'app.kmlCellsNote', { n: off }))
    return notes
  }, [holes, gridCells, importParts, disabledTiles, t])
  const exportKmlTitle = [t('app.exportKmlTitle'), ...areaKmlNotes].join(' ')

  const handleExportBasesKml = useCallback(() => {
    if (!fieldSheets.length) return
    runExport(() => {
      const kml = buildBasesKML(
        {
          name: missionName.trim() || areaSafeName,
          sheets: fieldSheets,
          blocks,
          layout: baseLayout,
          files: flightFiles,
          // contornos exactos dos blocos de faixas: área ∩ faixa das linhas
          spacingM: spacing,
          area: ring ? { ring, holes } : null,
        },
        t,
      )
      downloadBlob(
        new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
        `${areaSafeName}_bases.kml`,
      )
    })
  }, [
    fieldSheets,
    runExport,
    missionName,
    areaSafeName,
    blocks,
    baseLayout,
    flightFiles,
    spacing,
    ring,
    holes,
    t,
  ])

  // KML por base (secção 7 da revisão da exportação): um ZIP com uma pasta
  // por base, um KML por bloco só com o polígono (a missão de mapeamento do
  // Pilot 2, que calcula a rota dele) e mapa/ com a base; sem preflight,
  // como os outros KML
  const handleExportKmlByBase = useCallback(() => {
    if (!fieldSheets.length || !blocks?.length) return
    runExport(async () => {
      const { entries } = blocksKmlByBase(
        {
          missionName: missionName.trim() || areaSafeName,
          blocks,
          layout: baseLayout,
          sheets: fieldSheets,
          files: flightFiles,
          spacingM: spacing,
          area: ring ? { ring, holes } : null,
        },
        t,
      )
      downloadBlob(await buildFilesZip(entries), `${exportBaseName}_kml-por-base.zip`)
    })
  }, [
    fieldSheets,
    blocks,
    runExport,
    missionName,
    areaSafeName,
    baseLayout,
    flightFiles,
    spacing,
    ring,
    holes,
    t,
    exportBaseName,
  ])

  // o preflight do separador aberto: avisos, bloqueios e o que os alimenta
  // (src/hooks/usePreflight.js)
  const { preflight, aglWarn, uncertainty, blur, orbitTriggerWarn, exportBlocked, terrainActions } =
    usePreflight({
      baseLayout,
      view3d,
      blocks,
      t,
      missionMode,
      plan,
      corridorPlan,
      circularPlan,
      facePlan,
      orbitPlan,
      payload,
      corridorReference,
      circularReference,
      perBlockBases,
      zones,
      refBase,
      clearance,
      terrain,
      faceConfig,
      circularConfig,
      params,
      inspectPoints,
      terrainFollow,
      terrainResult,
      aircraft,
      drone,
      planOk,
      areaBasePoint,
      sensor,
      gsdPitch,
      spacing,
      interval,
      gsd,
      speed,
      orbitConfig,
      circularSpeed,
      avisoIntervalo,
      photoMode,
      terrainCovers,
      areaBaseDistance,
      areaRouteOps,
      viewshedByBlock,
      vlosM,
      batteryMin,
      split,
      triggerWarn,
      terrainHoles,
      transitClearanceInfo,
      reference,
      rthInfo,
      corridorTriggerWarn,
      corridorConfig,
      corridorCovers,
      corridorTerrain,
      corridorBase,
      corridorBaseDistance,
      corridorRouteOps,
      corridorSpeed,
      circularTriggerWarn,
      circularCovers,
      circularTerrain,
      circularBase,
      circularBaseDistance,
      circularRouteOps,
      dsmLoaded,
      faceClearance,
      faceTakeoff,
      orbitTakeoff,
      handleLoadTerrain,
    })

  // Exportação da missão do SEPARADOR ABERTO, sempre atrás do preflight dela:
  // o botão do cabeçalho e os botões de cada painel. Antes o cabeçalho
  // exportava a área com o preflight do outro modo ao lado, e os painéis
  // exportavam rotas que o preflight bloqueava (rota dentro do relevo,
  // waypoints repetidos, base inalcançável).
  const modeExport = {
    area: handleExportKMZ,
    face: () => handleExportFace(faceTakeoff),
    orbit: () => handleExportOrbitSingle(orbitTakeoff),
    corridor: handleExportCorridor,
    circular: handleExportCircularSingle,
  }[missionMode]
  const modePlan = {
    face: facePlan,
    orbit: orbitPlan,
    corridor: corridorPlan,
    circular: circularPlan,
  }[missionMode]
  const modePlanOk = missionMode === 'area' ? canExportKMZ : Boolean(modePlan && !modePlan.error)
  const gated = (fn) => () => {
    if (!exportBlocked) fn()
  }

  /* --------------- Persistência do projecto (localStorage) -------------- */

  // leitura e migração (v1/v2) em src/mission/project.js e mecânica de
  // gravação/ficheiro em hooks/useProject.js; aqui só se distribui o
  // projecto normalizado pelo estado, porque é o App que tem os setters
  // Um projecto aberto parte das OMISSÕES e escreve todos os campos, presentes
  // ou não (M3-C1): antes fundia-se no estado corrente (`{...prev, ...n.x}`),
  // e um projecto v1 aberto por cima de uma sessão herdava o prolongamento, a
  // fiada, a margem e o seguir terreno que nunca teve
  const fitToArea = useCallback(() => setFitKey((k) => k + 1), [setFitKey])
  // um alvo GCP arrastado no mapa fica no projecto, pelo seu id; a heurística
  // continua a dar os outros
  const handleGcpDrag = useCallback(
    (id, point) =>
      setGcpConfig((c) => ({ ...c, manual: { ...(c.manual ?? {}), [String(id)]: point } })),
    [setGcpConfig],
  )
  const {
    projectState,
    exportProject,
    importProject,
    projectVersion,
    dismissVersionNote,
    projectError,
  } = useProjectSession({
    values: {
      missionName,
      drone,
      custom,
      payloadTuning,
      missionBatteryType,
      batteryMin,
      inspectPoints,
      missionMode,
      faceConfig,
      corridorConfig,
      orbitConfig,
      circularConfig,
      params,
      split,
      anchor,
      ring,
      holes,
      gridCells,
      areaOrigin,
      bases,
      blockBaseEffective,
      disabledTiles,
      terrainFollow,
      gcpConfig,
      obstacleM,
      safety,
      demFileLabel,
      demSurface,
      demMemory,
    },
    setters: {
      setMissionName,
      setDrone,
      setCustom,
      setPayloadTuning,
      setParams,
      setMissionBattery,
      setMissionMode,
      setFaceConfig,
      setOrbitConfig,
      setCorridorConfig,
      setCircularConfig,
      setInspectPoints,
      inspectSeqRef,
      applyProjectGeometry,
      setBases,
      setBlockBaseState,
      setSelectedBaseId,
      setBaseProposal,
      setTerrainFollow,
      setGcpConfig,
      setObstacleM,
      setDemMemory,
      setSafety,
    },
    equipment,
    onLoaded: fitToArea,
    t,
  })

  // a margem em metros do contorno (M3-U22: o Pilot 2 e o UgCS pedem metros)
  const bufferM = useMemo(
    () =>
      ring && params.bufferPct > 0
        ? bufferDistanceMeters(ringToPolygon(ring, holes), params.bufferPct)
        : 0,
    [ring, holes, params.bufferPct],
  )
  // minutos de um quadrado com os parâmetros actuais (M3-U20)
  const squareMinutes = useCallback(
    (sideM) =>
      squareFlightTimeS(sideM, {
        speed,
        spacingM: spacing,
        passes: (params.crosshatch ? 2 : 1) + (params.includeNadir ? 1 : 0),
        stopEveryM: photoMode === 'waypoint' && params.waypointStops === 'all' ? interval : 0,
        overshootM: params.overshoot,
        tieLine: params.tieLine,
        bufferM,
      }) / 60,
    [speed, spacing, params, photoMode, interval, bufferM],
  )

  // Os blocos sob demanda (vista 3D, relatório, perfil) pedem-se depois do
  // arranque, para ficarem na cache do browser antes de se ir para o campo
  // sem rede (M3-C4); uma falha aqui não é erro: a janela volta a pedi-los
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 3000))
    const cancel = window.cancelIdleCallback ?? clearTimeout
    const id = idle(() => {
      import('./components/Map3D.jsx').catch(() => {})
      import('./components/MissionReport.jsx').catch(() => {})
      import('./components/ElevationProfile.jsx').catch(() => {})
    })
    return () => cancel(id)
  }, [])

  // Atalhos de direção das linhas relativamente ao bloco/aresta de referência
  const setAngleRelative = useCallback(
    (offsetDeg) => {
      if (refAzimuth == null) return
      setParams((p) => ({ ...p, angle: Math.round((refAzimuth + offsetDeg) % 360) }))
    },
    [refAzimuth, setParams],
  )

  // Direção ótima (T3.2): menor número de troços dentro do polígono real
  const setAngleOptimal = useCallback(() => {
    if (!ring || !validation.valid) return
    const best = findOptimalDirection(ring, spacing)
    if (best != null) setParams((p) => ({ ...p, angle: Math.round(best) }))
  }, [ring, validation.valid, spacing, setParams])

  /* ----------------------------- Layout ------------------------------ */
  if (view === 'checklist') {
    return (
      <ChecklistPage
        missionName={missionName}
        droneLabel={hardwareLabel}
        sensorType={sensor.type}
        faceMode={missionMode === 'face' && Boolean(faceConfig.baseline)}
        corridorMode={missionMode === 'corridor' && Boolean(corridorConfig.centreline)}
        blocks={blocks ?? []}
        flightLabels={baseLayout?.byBlock ?? null}
        baseSheets={missionMode === 'area' ? fieldSheets : []}
        plannedGcps={gcps ?? []}
        params={params}
        terrainFollowOn={Boolean(terrainFollow?.enabled)}
        daySheets={missionMode === 'area' ? fieldSheetsDay : null}
        safety={safety}
        rthInfo={rthInfo}
        onBack={() => setView('planner')}
      />
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <IconDrone className="h-7 w-7 text-sky-400" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              DJI Mission Planner{' '}
              <span className="text-xs font-normal text-slate-400">
                v{import.meta.env.APP_VERSION}
              </span>
            </h1>
            {/* em ecrãs estreitos (tablet no campo) o subtítulo dá lugar aos botões */}
            <p className="hidden text-xs text-slate-400 xl:block">{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShow3d(true)}
            disabled={
              !(
                terrain.status === 'ready' &&
                view3d &&
                (missionMode !== 'area' || (terrainCovers && planOk))
              )
            }
            title={terrain.status === 'ready' ? t('app.view3dReady') : t('app.view3dNotReady')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCube /> {t('app.view3d')}
          </button>
          <button
            onClick={() => setShowReport(true)}
            disabled={!planOk}
            title={t('app.reportTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('app.report')}
          </button>
          <button
            onClick={() => setView('checklist')}
            title={t('app.checklistTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-amber-500 hover:text-amber-300"
          >
            <IconCheck /> {t('app.checklist')}
          </button>
          <button
            onClick={handleExportKML}
            disabled={!canExportKML}
            title={exportKmlTitle}
            className="flex items-center gap-1.5 whitespace-nowrap rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('app.exportKml')}
          </button>
          <PreflightPill
            items={preflight}
            open={showPreflight}
            onToggle={() => setShowPreflight((v) => !v)}
            mode={missionMode}
          />
          <button
            // no modo circular o KMZ do cabecalho e a missao circular: o
            // preflight ao lado e o dela, e a grelha da area exporta-se no
            // separador Area
            onClick={gated(modeExport)}
            disabled={!modePlanOk || exportBlocked}
            title={t('app.exportWpmlTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('app.exportWpml')}
          </button>

          {/* configuração, ajuda e língua encostados à direita */}
          <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
            <button
              onClick={() => setShowSettings(true)}
              title={t('app.settingsTitle')}
              aria-label={t('app.settings')}
              data-testid="open-settings"
              className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-2.5 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
            >
              <IconGear />
            </button>
            <button
              onClick={() => setShowHelp(true)}
              title={t('app.helpTitle')}
              className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
            >
              ?
            </button>
            <div className="flex overflow-hidden rounded border border-slate-700">
              {LANGS.map(({ code, label }) => {
                const Flag = FLAG_BY_LANG[code]
                return (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    title={label}
                    className={`px-2 py-1.5 leading-none transition-opacity ${
                      lang === code ? 'bg-slate-700' : 'opacity-40 hover:opacity-90'
                    }`}
                  >
                    <Flag />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {showPreflight && <PreflightList items={preflight} actions={terrainActions} />}

      {exportError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-800 bg-red-950/60 px-4 py-2 text-xs text-red-200"
        >
          <span className="font-semibold">⚠ {t('export.failed')}</span>
          <span>{t(`export.err.${exportError.code}`, { d: exportError.detail })}</span>
          <button
            onClick={() => setExportError(null)}
            className="ml-auto rounded border border-red-700 px-2 py-0.5 font-medium hover:bg-red-900"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex h-full shrink-0 flex-col">
          <MissionModeSelector mode={missionMode} onChange={changeMissionMode} />
          <div className="min-h-0 flex-1">
            {missionMode === 'face' && (
              <FacePanel
                drone={drone}
                setDrone={setDrone}
                sensor={sensor}
                gimbalRange={activePayload.gimbalPitch ?? null}
                safety={safety}
                setSafety={setSafety}
                rthInfo={rthInfo}
                faceConfig={faceConfig}
                setFaceParam={setFaceParam}
                facePlan={facePlan}
                faceClearance={faceClearance}
                dsmLoaded={dsmLoaded}
                cameraOk={sensor.type === 'camera'}
                mode={mode}
                draftCount={draftVertices.length}
                onStartDraw={startFaceDraw}
                onUndoVertex={removeLastDraftVertex}
                onFinishDraw={handleFinishFace}
                onClearBaseline={clearFaceBaseline}
                onExport={gated(() => handleExportFace(faceTakeoff))}
                bases={bases}
                takeoff={faceTakeoff}
                exportBlocked={exportBlocked}
              />
            )}
            {missionMode === 'orbit' && (
              <OrbitPanel
                drone={drone}
                setDrone={setDrone}
                sensor={sensor}
                gimbalRange={activePayload.gimbalPitch ?? null}
                safety={safety}
                setSafety={setSafety}
                rthInfo={rthInfo}
                orbitConfig={orbitConfig}
                setOrbitParam={setOrbitParam}
                orbitPlan={orbitPlan}
                cameraOk={sensor.type === 'camera'}
                gsdAtRadius={gsdAtRadius}
                onGsdTarget={setRadiusFromGsd}
                mode={mode}
                onStartPoi={startOrbitPoi}
                onClearPoi={clearOrbitPoi}
                onExportSingle={gated(() => handleExportOrbitSingle(orbitTakeoff))}
                onExportPerLevel={gated(() => handleExportOrbitPerLevel(orbitTakeoff))}
                bases={bases}
                takeoff={orbitTakeoff}
                exportBlocked={exportBlocked}
                triggerWarn={orbitTriggerWarn}
              />
            )}
            {missionMode === 'corridor' && (
              <CorridorPanel
                drone={drone}
                setDrone={setDrone}
                sensor={sensor}
                safety={safety}
                setSafety={setSafety}
                rthInfo={rthInfo}
                triggerWarn={corridorTriggerWarn}
                corridorConfig={
                  corridorConfig.speedMS === corridorSpeed
                    ? corridorConfig
                    : { ...corridorConfig, speedMS: corridorSpeed }
                }
                setCorridorParam={setCorridorParam}
                corridorPlan={corridorPlan}
                sensorType={sensor.type}
                mode={mode}
                onStartAxis={startCorridorDraw}
                onFinishAxis={handleFinishCorridor}
                onUndoAxisPoint={() => setDraftVertices((d) => d.slice(0, -1))}
                onClearAxis={clearCorridorAxis}
                draftCount={draftVertices.length}
                onExport={gated(handleExportCorridor)}
                exportBlocked={exportBlocked}
                terrain={terrain}
                corridorCovers={corridorCovers}
                terrainFollow={terrainFollow}
                setTerrainFollow={setTerrainFollow}
                corridorTerrain={corridorTerrain}
                corridorReference={corridorReference}
                areaParams={{
                  altitude: params.altitude,
                  frontOverlap: params.frontOverlap,
                  sideOverlap: params.sideOverlap,
                }}
                corridorSplit={corridorSplit}
                usableMin={batteryMin}
                hasBase={Boolean(corridorBase)}
                onStartBase={startBase}
                onRemoveBase={removeBase}
                onLoadTerrain={handleLoadTerrain}
                onImportDem={handleImportDem}
                onShowProfile={() => setShowProfile(true)}
              />
            )}
            {missionMode === 'circular' && (
              <CircularPanel
                drone={drone}
                setDrone={setDrone}
                sensor={sensor}
                safety={safety}
                setSafety={setSafety}
                rthInfo={rthInfo}
                circularConfig={
                  circularConfig.speedMS === circularSpeed
                    ? circularConfig
                    : { ...circularConfig, speedMS: circularSpeed }
                }
                setCircularParam={setCircularParam}
                circularPlan={circularPlan}
                advice={circularAdvice}
                blocks={circularBlocks}
                usableMin={circularUsableMin}
                setsCheck={circularSetsCheck}
                batteryLabel={missionBatteryType.label || missionBatteryType.id}
                triggerWarn={circularTriggerWarn}
                altitude={circularFlight.altitude}
                frontOverlap={circularFlight.frontOverlap}
                areaParams={{ altitude: params.altitude, frontOverlap: params.frontOverlap }}
                areaStats={planOk?.stats ?? null}
                areaKind={params.crosshatch ? 'crosshatch' : 'serpentine'}
                terrainFollow={terrainFollow}
                setTerrainFollow={setTerrainFollow}
                terrainReady={terrain.status === 'ready'}
                mode={mode}
                draftCount={draftVertices.length}
                hasRing={Boolean(ring)}
                onStartDraw={startDraw}
                onUndoVertex={removeLastDraftVertex}
                onFinishDraw={handleFinishDraw}
                onClear={clearAll}
                onExportSingle={gated(handleExportCircularSingle)}
                onExportBlocks={gated(handleExportCircularBlocks)}
                exportBlocked={exportBlocked}
                circularTerrain={circularTerrain}
                circularCovers={circularCovers}
                onRemove={() => {
                  removeCircular()
                  changeMissionMode('area')
                }}
              />
            )}
            {missionMode === 'area' && (
              <ControlPanel
                missionName={missionName}
                setMissionName={setMissionName}
                drone={drone}
                setDrone={setDrone}
                custom={custom}
                setCustom={setCustom}
                effectiveFov={effectiveFov}
                onEffectiveFov={setEffectiveFov}
                // o painel lê params.speed directamente; recebe-o já limitado aos
                // limites da aeronave, sem que o estado guardado seja reescrito
                params={params.speed === speed ? params : { ...params, speed }}
                setParam={setParam}
                mode={mode}
                draftCount={draftVertices.length}
                hasRing={Boolean(ring)}
                validation={validation}
                planError={plan?.error ?? null}
                planErrorCells={plan?.cells ?? null}
                anchor={anchor}
                setAnchorParam={setAnchorParam}
                hasBase={bases.length > 0}
                refAzimuth={refAzimuth}
                split={split}
                setSplitParam={setSplitParam}
                batteries={equipmentBatteries}
                battery={missionBatteryType}
                usefulMin={batteryMin}
                usefulOverridden={batteryOverridden}
                onBatteryId={setMissionBatteryId}
                onUsefulMin={setUsefulMin}
                setsCheck={setsCheck}
                onOpenSettings={() => setShowSettings(true)}
                blocks={blocks}
                gridActive={Boolean(gridCells)}
                tilesTotal={tiles?.length ?? null}
                tilesError={tilesError}
                tileSide={tileSide}
                gsd={gsd}
                onGsdTarget={setAltitudeFromGsd}
                presets={flightPresets}
                onApplyPreset={applyPreset}
                triggerWarn={triggerWarn}
                trigger={trigger}
                waypointWarn={waypointWarn}
                aglWarn={aglWarn}
                importState={importState}
                importError={importError}
                projectError={projectError}
                projectVersion={projectVersion}
                onDismissVersionNote={dismissVersionNote}
                ops={statsOps}
                bufferM={bufferM}
                squareMinutes={squareMinutes}
                routeClearance={clearance}
                rthInfo={rthInfo}
                preflightBlockers={preflight
                  .filter((i) => i.level === 'block')
                  .slice(0, 2)
                  .map((i) => t(`preflight.${i.code}`, i.params))}
                onShowPreflight={() => setShowPreflight(true)}
                importWarning={importWarning}
                importParts={importParts}
                onImportUseAll={useAllImportedParts}
                onImportFile={handleImportFile}
                onImportCrs={handleImportCrs}
                onImportCancel={cancelImport}
                onProjectExport={exportProject}
                onProjectImport={importProject}
                onTilesUndo={undoEdit}
                onTilesRestoreAll={restoreAllTiles}
                terrain={terrain}
                terrainCovers={terrainCovers}
                terrainFollow={terrainFollow}
                setTerrainFollow={setTerrainFollow}
                onLoadTerrain={handleLoadTerrain}
                onImportDem={handleImportDem}
                demSurface={demSurface}
                onDemSurface={setDemSurface}
                rememberedDem={demFileLabel ? null : demMemory}
                onShowProfile={() => setShowProfile(true)}
                terrainResult={terrainResult}
                slopeHint={slopeHint}
                onApplySlopeAngle={applySlopeAngle}
                gcpConfig={gcpConfig}
                setGcpConfig={setGcpConfig}
                gcpAutoCount={gcpAutoCount}
                gcpInfo={gcpInfo}
                onExportGcps={handleExportGcps}
                inspectPoints={inspectPoints}
                onStartInspect={startInspect}
                onInspectUpdate={updateInspectPoint}
                onInspectRemove={removeInspectPoint}
                onInspectMove={moveInspectPoint}
                onInspectReorder={reorderInspectPoints}
                onInspectSuggestOrder={suggestInspectOrder}
                onExportInspection={exportInspection}
                inspectTerrainOk={inspectTerrainOk}
                onUndoVertex={removeLastDraftVertex}
                onStartDraw={startDraw}
                onStartAnchor={startAnchor}
                onStartBase={startBase}
                onRemoveBase={removeBase}
                onSetAngleRelative={setAngleRelative}
                onSetAngleOptimal={setAngleOptimal}
                onFinishDraw={handleFinishDraw}
                onClear={clearAll}
                baseLayout={baseLayout}
                tileOrientation={tiles ? tileOrientation : null}
                zoneRadiusM={equipment.zoneRadiusM}
                safety={safety}
                setSafety={setSafety}
                // cartão «Resumo e exportar»: os números do painel de métricas
                summary={{
                  flights: blocks?.length || (planOk ? 1 : 0),
                  timeS: planOk?.stats?.flightTimeS ?? null,
                  areaHa: planOk?.stats?.areaHa ?? null,
                }}
                onExportMission={gated(handleExportKMZ)}
                canExportMission={canExportKMZ && !exportBlocked}
                onExportArea={handleExportKML}
                canExportArea={canExportKML}
                exportAreaNotes={areaKmlNotes}
                basesPanel={{
                  rows: baseRows,
                  selectedBaseId,
                  onSelect: setSelectedBaseId,
                  onRemove: removeBaseById,
                  onRadius: setBaseRadiusById,
                  onPropose: proposeBasesForBlocks,
                  // proposta em curso: progresso e cancelar
                  proposing: proposing
                    ? { progress: proposeProgress, onCancel: cancelProposal }
                    : null,
                  // atribuições manuais que não passaram para o mosaico refeito
                  carryLost: blocks?.length ? manualLost : 0,
                  onDismissCarry: () => setBlockBaseState((st) => ({ ...st, lost: 0 })),
                  hasBlocks: Boolean(blocks?.length),
                  proposal: baseProposal,
                  assignMode,
                  vlosM,
                  defaultRadiusM: equipment.zoneRadiusM,
                  maxFlightsPerBase: equipment.maxFlightsPerBase ?? 0,
                  // exportação por voo / por base, atrás do preflight
                  exportFlights: {
                    files: flightFiles,
                    baseName: exportBaseName,
                    canExport: canExportKMZ,
                    blocked: exportBlocked,
                    onExport: (sel) => gated(() => handleExportFlights(sel))(),
                    onExportKml: fieldSheets.length ? handleExportBasesKml : null,
                    onExportKmlByBase: fieldSheets.length ? handleExportKmlByBase : null,
                  },
                  // bacias de visão: por voo no painel, relevo usado e camada do mapa
                  viewshed: perBlockBases
                    ? {
                        byBlock: viewshedByBlock,
                        terrain: viewTerrain,
                        running: viewsheds.running,
                        layerOn: viewshedLayerOn,
                        onLayer: setViewshedLayerOn,
                        obstacleM,
                        onObstacle: setObstacleM,
                      }
                    : null,
                }}
              />
            )}
          </div>
        </div>

        <main className="relative min-w-0 flex-1">
          <ProjectSummary summary={projectSummary} />
          <MapView
            mode={mode}
            draftVertices={draftVertices}
            ring={ring}
            holes={holes}
            valid={validation.valid}
            kinks={validation.kinks}
            anchorCenter={anchor.center}
            bases={baseRows}
            selectedBaseId={selectedBaseId}
            onBaseSelect={handleBaseSelect}
            baseLayout={missionMode === 'area' ? baseLayout : null}
            assignMode={assignMode}
            onBlockClick={handleBlockClick}
            // no modo circular a grelha da area ficava por cima dos circulos
            plan={missionMode === 'circular' ? null : planOk}
            blocks={missionMode === 'circular' ? null : blocks}
            gridCells={gridCells}
            tiles={tiles}
            disabledTiles={disabledTiles}
            onTileToggle={handleTileClick}
            gcps={gcps}
            onGcpDrag={handleGcpDrag}
            photoPoints={mapPhotoPoints}
            inspectPoints={inspectPoints}
            onInspectDrag={handleInspectDrag}
            facePreview={facePreview}
            corridorPreview={corridorPreview}
            orbitPreview={orbitPreview}
            circularPreview={circularPreview}
            onOrbitPoiDrag={handleOrbitPoiDrag}
            fitKey={fitKey}
            editable={!gridCells && split.mode !== 'tiles' && split.mode !== 'battery'}
            areaMovable={missionMode === 'area' || missionMode === 'circular'}
            onMapClick={handleMapClick}
            onVertexDrag={handleVertexDrag}
            onVertexInsert={handleVertexInsert}
            onVertexDelete={handleVertexDelete}
            onAreaMove={handleAreaMove}
            onBaseDrag={handleBaseDrag}
            onFinishDraw={handleFinishAny}
            viewsheds={missionMode === 'area' ? viewshedByBlock : null}
            viewshedLayerOn={viewshedLayerOn}
            onViewshedLayer={setViewshedLayerOn}
          />
          <StatsPanel
            uncertainty={uncertainty}
            gsd={gsd}
            gimbalPitch={gsdPitch}
            footprint={footprint}
            spacing={spacing}
            pointDensity={pointDensity}
            interval={interval}
            intervalS={trigger.seconds}
            intervalManual={trigger.manual}
            triggerMode={params.triggerMode}
            speed={speed}
            missionMode={missionMode}
            stats={modeStats}
            ops={statsOps}
            shutterWarn={Boolean(
              missionMode === 'circular'
                ? circularTriggerWarn
                : missionMode === 'corridor'
                  ? corridorTriggerWarn
                  : missionMode === 'area'
                    ? triggerWarn
                    : null,
            )}
            baseDistance={missionMode === 'area' && bases.length <= 1 ? areaBaseDistance : null}
          />
        </main>
      </div>

      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          onShowDisclaimer={() => {
            setShowHelp(false)
            setDisclaimer('review')
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          equipment={equipment}
          setEquipment={setEquipment}
          initialAircraftId={drone.aircraftId}
          onClose={() => setShowSettings(false)}
        />
      )}
      {disclaimer && (
        <DisclaimerModal
          lang={lang}
          setLang={setLang}
          onAccept={closeDisclaimer}
          dismissable={disclaimer === 'review'}
        />
      )}

      {showProfile && terrain.status === 'ready' && view3d && (
        <ErrorBoundary onClose={() => setShowProfile(false)}>
          <Suspense fallback={null}>
            <ElevationProfile
              terrain={terrain.data}
              waypoints={view3d.waypoints}
              breaks={view3d.breaks ?? null}
              refElev={view3d.refElev ?? 0}
              reference={
                missionMode === 'area'
                  ? reference
                  : missionMode === 'corridor'
                    ? corridorReference
                    : missionMode === 'circular'
                      ? circularReference
                      : null
              }
              blocks={profileBlocks}
              onClose={() => setShowProfile(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showReport && planOk && (
        <ErrorBoundary onClose={() => setShowReport(false)}>
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">
                {t('app.loadingReport')}
              </div>
            }
          >
            <MissionReport
              missionName={missionName}
              droneLabel={hardwareLabel}
              inspectPoints={inspectPoints}
              // a mesma velocidade limitada que entra no plano e no ficheiro
              params={params.speed === speed ? params : { ...params, speed }}
              spacing={spacing}
              interval={interval}
              gsd={gsd}
              stats={planOk.stats}
              blocks={blocks}
              ring={ring}
              basePoints={bases.map((b) => b.point)}
              baseSheets={missionMode === 'area' ? fieldSheets : []}
              terrainFollowOn={Boolean(terrainFollow?.enabled)}
              rthInfo={rthInfo}
              daySheets={missionMode === 'area' ? fieldSheetsDay : null}
              gcps={gcps}
              lines={planOk.lines}
              reproducibility={{
                version: import.meta.env.APP_VERSION,
                projectJson: JSON.stringify(serializeProject(projectState)),
                uncertainty,
                blur,
                terrainDatum: terrain.data?.verticalDatum ?? null,
                preflight,
              }}
              onClose={() => setShowReport(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {show3d && terrain.status === 'ready' && view3d && (
        <ErrorBoundary onClose={() => setShow3d(false)}>
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">
                {t('app.loading3d')}
              </div>
            }
          >
            <Map3D
              terrain={terrain.data}
              ring={
                missionMode === 'area' || missionMode === 'circular'
                  ? ring
                  : missionMode === 'corridor'
                    ? (corridorPreview?.buffer ?? null)
                    : null
              }
              waypoints={view3d.waypoints}
              refElev={view3d.refElev}
              breaks={view3d.breaks ?? null}
              pieceColors={view3dColors?.pieces ?? null}
              blocks3d={view3dColors?.blocks ?? null}
              bases3d={baseRows.map((b) => ({
                point: b.point,
                label: b.label,
                color: b.color,
                radiusM: b.radiusM,
              }))}
              gcps={missionMode === 'area' ? gcps : null}
              photos={photos3d}
              onClose={() => setShow3d(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  )
}
