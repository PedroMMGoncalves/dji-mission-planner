import { useCallback, useEffect, useMemo, useState } from 'react'
import ControlPanel from './components/ControlPanel.jsx'
import CorridorPanel from './components/CorridorPanel.jsx'
import CircularPanel from './components/CircularPanel.jsx'
import MissionModeSelector from './components/MissionModeSelector.jsx'
import FacePanel from './components/FacePanel.jsx'
import OrbitPanel from './components/OrbitPanel.jsx'
import ChecklistPage from './components/ChecklistPage.jsx'
import AppOverlays from './components/AppOverlays.jsx'
import MapPane from './components/MapPane.jsx'
import AppHeader from './components/AppHeader.jsx'
import { acceptDisclaimer, disclaimerAccepted } from './components/DisclaimerModal.jsx'
import { nearestBase } from './mission/bases.js'
import { MissionExportError } from './utils/exporters.js'
import { useHardware } from './hooks/useHardware.js'
import { useAreaParams } from './hooks/useAreaParams.js'
import { useBaseActions, useBasesState } from './hooks/useBases.js'
import { useAreaTools } from './hooks/useAreaTools.js'
import { useMapInteractions } from './hooks/useMapInteractions.js'
import { useBaseViewsheds } from './hooks/useBaseViewsheds.js'
import { useFieldSheets } from './hooks/useFieldSheets.js'
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
import { DEFAULT_MISSION_NAME } from './mission/defaults.js'
import { checkFaceClearance } from './utils/faceMode.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from './utils/units.js'
import { DEFAULT_SAFETY } from './mission/safety.js'

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
  const hw = useHardware()
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
  } = hw
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
  const basesState = useBasesState()
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
  } = basesState
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
  const areaParams = useAreaParams({
    aircraftRef,
    speedRange,
    sensor,
    payload,
    aircraftId: drone.aircraftId,
    setMissionName,
  })
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
  } = areaParams

  /* ------------------------- Modo corredor ---------------------------- */
  const corridor = useCorridorMission({
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
  } = corridor

  /* ------------------------ Modo órbita (E1.2) ------------------------ */
  const orbit = useOrbitMission({
    sensor,
    missionMode,
    missionName,
    wpml,
    safety,
    bases,
    setMode,
    runExport,
  })
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
  } = orbit

  /* ----------------------- Modo fachada (E1.1) ------------------------ */
  const face = useFaceMission({
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
  } = face

  /* --------------------- Pontos de inspeção (R2.9) -------------------- */
  const inspect = useInspection({
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
  } = inspect

  /* ------------------ Modo área, parte 1: geometria ------------------- */
  const geom = useAreaGeometry({
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
  } = geom

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
  const terrainState = useTerrain({
    ring,
    ringBbox,
    ringValid: validation.valid,
    targetBbox: terrainTarget,
    activeBbox: terrainActive,
    rememberedDem: demMemory,
  })
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
  } = terrainState

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
  const corridorOnTerrain = useCorridorRoute({
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
  const {
    corridorRoute: corridorPlan,
    corridorTerrain,
    corridorReference,
    corridorCovers,
    corridorBaseDistance,
    handleExportCorridor,
  } = corridorOnTerrain

  /* ---------- Modo área, parte 2: plano, blocos, GCPs, exportação ------ */
  const area = useAreaMission({
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
  } = area

  /* --------------- Modo circular (circlegrammetry) -------------------- */
  // Sobre o mesmo poligono da area: herda o relevo, a cota de referencia e
  // o seguimento de terreno; a geometria e os blocos sao proprios.
  const circular = useCircularMission({
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
  } = circular

  // trânsitos, alcance visual, voos contra as baterias, métricas e resumo do
  // projecto (src/hooks/useMissionOps.js)
  const ops = useMissionOps({
    hw,
    basesState,
    areaParams,
    corridor,
    orbit,
    face,
    geom,
    corridorOnTerrain,
    area,
    circular,
    corridorBase,
    circularBase,
    missionMode,
  })
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
  } = ops

  // bacias de visão dos blocos com bases (src/hooks/useBaseViewsheds.js)
  const viewshedState = useBaseViewsheds({
    hw,
    basesState,
    areaParams,
    terrainState,
    area,
    ops,
    missionMode,
    obstacleM,
  })
  const { viewTerrain, viewshedTf, viewsheds, viewshedByBlock } = viewshedState

  // bases: zonas no painel, arrasto, remoção, raio, «Propor bases» e
  // atribuição de blocos (src/hooks/useBases.js)
  const overlayOpen =
    show3d || showProfile || showHelp || showReport || showSettings || Boolean(disclaimer)
  const baseActions = useBaseActions({
    hw,
    basesState,
    geom,
    terrainState,
    area,
    viewshedState,
    missionMode,
    mode,
    setMode,
    corridorBase,
    circularBase,
    obstacleM,
    altitudeM: params.altitude,
    overlayOpen,
  })
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
  } = baseActions

  // cliques, duplo clique e teclado no mapa, troca de separador
  // (src/hooks/useMapInteractions.js)
  const mapActions = useMapInteractions({
    basesState,
    corridor,
    orbit,
    face,
    inspect,
    geom,
    circular,
    mode,
    setMode,
    setDraftVertices,
    setMissionMode,
  })
  const { handleMapClick, changeMissionMode, handleFinishAny, removeLastDraftVertex } = mapActions

  // atalhos da área: direcção das linhas, margem em metros, minutos de um
  // quadrado (src/hooks/useAreaTools.js)
  const areaTools = useAreaTools({ areaParams, geom, terrainState, area })
  const { applySlopeAngle, bufferM, squareMinutes, setAngleRelative, setAngleOptimal } = areaTools

  // a rota que sairia no KMZ do separador aberto, a vista 3D, as fotos no
  // mapa e no 3D e os blocos do perfil (src/hooks/useActiveRoute.js)
  const routeView = useActiveRoute({
    hw,
    basesState,
    areaParams,
    corridor,
    orbit,
    face,
    terrainState,
    corridorOnTerrain,
    area,
    circular,
    missionMode,
    setRouteBox,
  })
  const {
    faceTakeoff,
    orbitTakeoff,
    view3d,
    photos3d,
    mapPhotoPoints,
    view3dColors,
    profileBlocks,
  } = routeView

  // folga ao solo, buracos do relevo, trânsitos e RTH da rota que sairia no
  // KMZ (src/hooks/useRouteChecks.js)
  const safetyChecks = useRouteChecks({
    basesState,
    areaParams,
    terrainState,
    area,
    ops,
    routeView,
    missionMode,
    corridorBase,
    circularBase,
    safety,
  })
  const { clearance, terrainHoles, transitClearanceInfo, rthInfo } = safetyChecks

  // fichas de campo, linha do dia e KML das bases (src/hooks/useFieldSheets.js)
  const sheets = useFieldSheets({
    hw,
    areaParams,
    corridor,
    geom,
    corridorOnTerrain,
    area,
    circular,
    ops,
    viewshedState,
    baseActions,
    routeView,
    safetyChecks,
    missionMode,
    corridorBase,
    circularBase,
    t,
    runExport,
    missionName,
  })
  const {
    fieldSheets,
    fieldSheetsDay,
    areaKmlNotes,
    exportKmlTitle,
    handleExportBasesKml,
    handleExportKmlByBase,
  } = sheets

  // o preflight do separador aberto: avisos, bloqueios e o que os alimenta
  // (src/hooks/usePreflight.js)
  const preflightState = usePreflight({
    hw,
    areaParams,
    corridor,
    orbit,
    face,
    inspect,
    geom,
    terrainState,
    corridorOnTerrain,
    area,
    circular,
    ops,
    viewshedState,
    routeView,
    safetyChecks,
    t,
    missionMode,
    corridorBase,
    circularBase,
    dsmLoaded,
    faceClearance,
  })
  const { preflight, aglWarn, uncertainty, blur, orbitTriggerWarn, exportBlocked, terrainActions } =
    preflightState

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
  const session = useProjectSession({
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
  const {
    projectState,
    exportProject,
    importProject,
    projectVersion,
    dismissVersionNote,
    projectError,
  } = session

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
      <AppHeader
        terrainState={terrainState}
        area={area}
        routeView={routeView}
        sheets={sheets}
        preflightState={preflightState}
        setShow3d={setShow3d}
        missionMode={missionMode}
        setShowReport={setShowReport}
        setView={setView}
        showPreflight={showPreflight}
        setShowPreflight={setShowPreflight}
        gated={gated}
        modeExport={modeExport}
        modePlanOk={modePlanOk}
        setShowSettings={setShowSettings}
        setShowHelp={setShowHelp}
        setLang={setLang}
        lang={lang}
        exportError={exportError}
        setExportError={setExportError}
      />
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
                hw={hw}
                areaParams={areaParams}
                geom={geom}
                area={area}
                terrainState={terrainState}
                inspect={inspect}
                session={session}
                areaTools={areaTools}
                baseActions={baseActions}
                safetyChecks={safetyChecks}
                missionName={missionName}
                setMissionName={setMissionName}
                // o painel lê params.speed directamente; recebe-o já limitado aos
                // limites da aeronave, sem que o estado guardado seja reescrito
                params={params.speed === speed ? params : { ...params, speed }}
                mode={mode}
                draftCount={draftVertices.length}
                hasRing={Boolean(ring)}
                planError={plan?.error ?? null}
                planErrorCells={plan?.cells ?? null}
                hasBase={bases.length > 0}
                setsCheck={setsCheck}
                onOpenSettings={() => setShowSettings(true)}
                gridActive={Boolean(gridCells)}
                tilesTotal={tiles?.length ?? null}
                aglWarn={aglWarn}
                ops={statsOps}
                preflightBlockers={preflight
                  .filter((i) => i.level === 'block')
                  .slice(0, 2)
                  .map((i) => t(`preflight.${i.code}`, i.params))}
                onShowPreflight={() => setShowPreflight(true)}
                rememberedDem={demFileLabel ? null : demMemory}
                onShowProfile={() => setShowProfile(true)}
                onExportInspection={exportInspection}
                inspectTerrainOk={inspectTerrainOk}
                onUndoVertex={removeLastDraftVertex}
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

        <MapPane
          basesState={basesState}
          areaParams={areaParams}
          corridor={corridor}
          orbit={orbit}
          face={face}
          inspect={inspect}
          geom={geom}
          area={area}
          circular={circular}
          ops={ops}
          viewshedState={viewshedState}
          baseActions={baseActions}
          mapActions={mapActions}
          routeView={routeView}
          preflightState={preflightState}
          mode={mode}
          draftVertices={draftVertices}
          missionMode={missionMode}
          handleGcpDrag={handleGcpDrag}
          viewshedLayerOn={viewshedLayerOn}
          setViewshedLayerOn={setViewshedLayerOn}
        />
      </div>

      <AppOverlays
        hw={hw}
        basesState={basesState}
        areaParams={areaParams}
        corridor={corridor}
        inspect={inspect}
        geom={geom}
        terrainState={terrainState}
        corridorOnTerrain={corridorOnTerrain}
        area={area}
        circular={circular}
        baseActions={baseActions}
        routeView={routeView}
        safetyChecks={safetyChecks}
        sheets={sheets}
        preflightState={preflightState}
        session={session}
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        setDisclaimer={setDisclaimer}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        disclaimer={disclaimer}
        lang={lang}
        setLang={setLang}
        closeDisclaimer={closeDisclaimer}
        showProfile={showProfile}
        setShowProfile={setShowProfile}
        missionMode={missionMode}
        showReport={showReport}
        setShowReport={setShowReport}
        missionName={missionName}
        show3d={show3d}
        setShow3d={setShow3d}
      />
    </div>
  )
}
