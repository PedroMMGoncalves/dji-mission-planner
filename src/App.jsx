import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import SettingsModal from './components/SettingsModal.jsx'
import DisclaimerModal, {
  acceptDisclaimer,
  disclaimerAccepted,
} from './components/DisclaimerModal.jsx'

// carregados sob demanda
const Map3D = lazy(() => import('./components/Map3D.jsx'))
const MissionReport = lazy(() => import('./components/MissionReport.jsx'))
const ElevationProfile = lazy(() => import('./components/ElevationProfile.jsx'))
import {
  AIRCRAFT,
  PAYLOADS,
  positioningError,
  DEFAULT_CUSTOM_SENSOR,
  DEFAULT_SELECTION,
  MISSION_PRESETS,
  aglCapWarning,
} from './data/drones.js'
import {
  aircraftEquipmentFor,
  flightsVsSets,
  followBatteryIfEqual,
  loadEquipment,
  resolveMissionBattery,
  saveEquipment,
  vlosFor,
} from './mission/equipment.js'
import { opsSummary } from './mission/opsSummary.js'
import {
  addBase,
  assignBlockBase,
  blockClickTarget,
  moveBase,
  nearestBase,
  removeBase as removeBaseFrom,
  setBaseRadius,
} from './mission/bases.js'
import { blockRing, blocksViewRoute, summarizeBases } from './mission/baseLayout.js'
import { baseFieldSheets } from './mission/fieldSheet.js'
import { buildBasesKML } from './mission/basesKml.js'
import {
  aggregatePlans,
  normalizeTriggerMode,
  normalizeWaypointStops,
  computeFootprint,
  computeGSD,
  distanceToArea,
  findOptimalDirection,
  lidarPointDensity,
  lineSpacing,
  photoInterval,
  resolveSensor,
} from './utils/geo.js'
import { MissionExportError, downloadBlob } from './utils/exporters.js'
import { useAreaGeometry } from './hooks/useAreaGeometry.js'
import { useAreaMission } from './hooks/useAreaMission.js'
import { useCorridorMission, useCorridorRoute } from './hooks/useCorridorMission.js'
import { bboxCovers, bboxOfPoints, terrainTargetBbox } from './mission/corridorTerrain.js'
import { useCircularMission } from './hooks/useCircularMission.js'
import { useOrbitMission } from './hooks/useOrbitMission.js'
import { useFaceMission } from './hooks/useFaceMission.js'
import { useInspection } from './hooks/useInspection.js'
import { useTerrain } from './hooks/useTerrain.js'
import { useProject } from './hooks/useProject.js'
import { terrainIdentity, useViewsheds } from './hooks/useViewsheds.js'
import { useBaseProposal } from './hooks/useBaseProposal.js'
import { viewshedJobs, viewshedTerrainModel } from './mission/viewshedPlan.js'
import { DEFAULT_PARAMS } from './mission/defaults.js'
import { hasBlockers, preflightArea, preflightPlan } from './mission/preflight.js'
import { routeClearance } from './mission/clearance.js'
import { checkFaceClearance } from './utils/faceMode.js'
import { gimbalRangeViolation } from './mission/gimbal.js'
import {
  motionBlur,
  routeChecks,
  terrainReliefRange,
  uncertaintyIntervals,
} from './mission/uncertainty.js'
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

/** localStorage, ou null quando o browser o recusa (modo privado, cookies bloqueados). */
function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
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
  const dLat = 3000 / 110574
  const dLon = 3000 / (111320 * Math.max(0.1, Math.cos(((y0 + y1) / 2) * (Math.PI / 180))))
  // a zona (até 500 m) também tem de ficar dentro do relevo
  const r = 500 / 110574
  const out = []
  for (const b of bases ?? []) {
    const [x, y] = b.point
    if (x < x0 - dLon || x > x1 + dLon || y < y0 - dLat || y > y1 + dLat) continue
    out.push([x - r * 1.3, y - r], [x + r * 1.3, y + r])
  }
  return out
}

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('dji-mission-planner:lang') ?? 'pt')
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
  const [missionName, setMissionName] = useState('missao-drone')
  // acções de segurança (fim da missão, sinal perdido) de todos os modos
  const [safety, setSafety] = useState(() => ({ ...DEFAULT_SAFETY }))
  // seleção de hardware: aeronave + payload (T1.1)
  const [drone, setDrone] = useState(() => ({ ...DEFAULT_SELECTION }))
  const [custom, setCustom] = useState(DEFAULT_CUSTOM_SENSOR)
  // afinações por payload (T1.2): { [payloadId]: { effectiveFov } }
  const [payloadTuning, setPayloadTuning] = useState({})
  // Equipamento (Configuração): baterias com tempo útil, VLOS e zona de
  // descolagem por aeronave. Vive no browser, à parte do projecto.
  const [equipment, setEquipment] = useState(() => loadEquipment(browserStorage()))
  useEffect(() => {
    saveEquipment(browserStorage(), equipment)
  }, [equipment])
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
  // zona de descolagem das bases (Configuração): raio e desnível máximo
  const zoneConfig = useMemo(
    () => ({ radiusM: equipment.zoneRadiusM, maxReliefM: equipment.zoneMaxReliefM }),
    [equipment.zoneRadiusM, equipment.zoneMaxReliefM],
  )
  // bateria da missão: tipo e tempo útil acertado para o dia (null = o da
  // bateria); só vale para a aeronave em que foi escolhida
  const [missionBattery, setMissionBattery] = useState(() => ({
    aircraftId: null,
    batteryId: null,
    usefulMin: null,
  }))
  const [params, setParams] = useState(() => ({ ...DEFAULT_PARAMS }))
  const [mode, setMode] = useState('idle') // 'idle' | 'draw' | 'anchor' | 'base' | 'inspect' | 'face'
  // tipo de missão activo (E1.0, modelo A): troca a ferramenta e o painel
  const [missionMode, setMissionMode] = useState('area') // 'area' | 'face' | 'orbit' | 'corridor'
  // pontos de inspeção (R2.9): waypoints avulsos com rumo/pitch/foto próprios
  const [draftVertices, setDraftVertices] = useState([])
  // Bases de descolagem (A, B, ...): pontos do operador, cada um com a sua
  // zona (src/mission/bases.js). Os modos de rota única usam a mais próxima.
  const [bases, setBases] = useState(/** @type {any[]} */ ([]))
  // atribuições manuais de blocos a bases, feitas na disposição de blocos
  // `key` (null = adoptar a actual, ao abrir um projecto), com as células e
  // o contorno dela: refeito o mosaico, passam para os blocos novos por
  // sobreposição, e `lost` conta as que não passaram (useAreaMission)
  const [blockBaseState, setBlockBaseState] = useState(() => ({
    key: /** @type {string|null} */ (null),
    map: /** @type {Record<string, string>} */ ({}),
    cells: /** @type {Array<{id: number, ring: number[][]}>|null} */ (null),
    ring: /** @type {number[][]|null} */ (null),
    lost: 0,
  }))
  const [selectedBaseId, setSelectedBaseId] = useState(null)
  // As bases e as atribuições entram no histórico de edição da área (Ctrl+Z,
  // useAreaGeometry): um passo leva o estado inteiro de antes da edição
  const basesSnapshotRef = useRef({ bases, blockBaseState })
  useEffect(() => {
    basesSnapshotRef.current = { bases, blockBaseState }
  }, [bases, blockBaseState])
  const basesHistory = useMemo(
    () => ({
      capture: () => basesSnapshotRef.current,
      restore: (snap) => {
        setBases(snap.bases)
        setBlockBaseState(snap.blockBaseState)
        setSelectedBaseId((sel) => (snap.bases.some((b) => b.id === sel) ? sel : null))
      },
    }),
    [],
  )
  // a última proposta: {added, outOfVlos, poorSites} ou {cancelled: true}
  const [baseProposal, setBaseProposal] = useState(null)
  const [exportError, setExportError] = useState(null)

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
      setExportError(err instanceof MissionExportError ? err.code : 'unknown')
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

  const aircraftRef = useRef(null)
  const setParam = useCallback((key, value) => {
    setParams((p) => {
      if (!Number.isFinite(value) && typeof value === 'number') return p
      // a velocidade é sempre limitada aos limites da aeronave selecionada
      if (key === 'speed') {
        const r = aircraftRef.current?.speedRange ?? { min: 1, max: 20 }
        value = Math.min(r.max, Math.max(r.min, value))
      }
      return { ...p, [key]: value }
    })
  }, [])

  /* ------------------- Pipeline de cálculo (memo) -------------------- */
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  // alcance visual da aeronave (Configuração): bases e blocos
  const vlosM = vlosFor(equipment, drone.aircraftId)
  // Escrito num efeito e não durante o render: mutar um ref no corpo do
  // componente é inseguro com renderização concorrente (React pode repetir ou
  // descartar o render). aircraftRef só é lido dentro de callbacks, por acção
  // do utilizador, sempre depois de o efeito ter corrido.
  useEffect(() => {
    aircraftRef.current = aircraft
  })

  // A velocidade gravada pode ficar fora dos limites quando a aeronave muda —
  // pelo selector, por carregar um projecto ou por aplicar um preset. Em vez
  // de a corrigir com um efeito (um render extra e uma cascata de estado),
  // limita-se aqui, no render: é este o valor que o painel mostra e que entra
  // no plano, nas estatísticas e na exportação. A escrita já vinha limitada
  // por setParam, pelo que isto só actua quando a aeronave muda por baixo.
  const speedRange = aircraft.speedRange ?? { min: 1, max: 20 }
  const speed = Math.min(speedRange.max, Math.max(speedRange.min, params.speed))

  // Mesma regra para o corredor, que tem o seu proprio campo de velocidade: o
  // painel aceita ate 25 m/s (normalizeCorridorConfig) e um M3E voa 15. Sem
  // limitar, o WPML saia com autoFlightSpeed acima do que a aeronave faz e o
  // tempo estimado ficava optimista — e e desse tempo que sai o numero de
  // baterias que o operador leva para o campo.

  // rótulo composto para o relatório/checklist: a aeronave, e o payload
  // quando a aeronave tem mais do que um montável
  const hardwareLabel =
    aircraft.payloads.length > 1 ? `${aircraft.label} + ${payload.label}` : aircraft.label

  // payload ativo com a afinação aplicada: um LiDAR pode voar com um corte
  // de trabalho do feixe (effectiveFov) mais estreito do que o nominal
  const effectiveFov = payloadTuning[drone.payloadId]?.effectiveFov ?? null
  const activePayload = useMemo(
    () => (payload.type === 'lidar' && effectiveFov ? { ...payload, effectiveFov } : payload),
    [payload, effectiveFov],
  )
  const sensor = useMemo(() => resolveSensor(activePayload, custom), [activePayload, custom])

  const setEffectiveFov = useCallback(
    (value) => {
      setPayloadTuning((m) => {
        const pid = drone.payloadId
        const nominal = PAYLOADS[pid]?.fov
        // clamp to ]5, nominal]; at (or above) nominal the override is removed
        if (!Number.isFinite(value) || !nominal || value >= nominal) {
          const { [pid]: _drop, ...rest } = m
          return rest
        }
        return { ...m, [pid]: { ...m[pid], effectiveFov: Math.max(5, value) } }
      })
    },
    [drone.payloadId],
  )

  // Tempo útil por voo efectivo (min): o acerto da missão, senão o da
  // bateria escolhida no equipamento. JÁ inclui a reserva de aterragem, por
  // isso entra em todo o lado como `batteryMin` com split.reservePct a 0
  // (blocos, lado do quadrado, preflight, resumo, circular).
  const {
    battery: missionBatteryType,
    usefulMin: batteryMin,
    overridden: batteryOverridden,
  } = resolveMissionBattery(equipment, drone.aircraftId, missionBattery)
  const setMissionBatteryId = useCallback(
    (batteryId) => setMissionBattery({ aircraftId: drone.aircraftId, batteryId, usefulMin: null }),
    [drone.aircraftId],
  )
  // editar para o valor da bateria (ou um valor inválido) volta a segui-la
  const setUsefulMin = useCallback(
    (value) => {
      const id = missionBatteryType.id
      const own = missionBatteryType.usefulMin
      setMissionBattery({
        aircraftId: drone.aircraftId,
        batteryId: id,
        usefulMin:
          !Number.isFinite(value) || value <= 0 || value === own
            ? null
            : Math.min(120, Math.max(1, value)),
      })
    },
    [drone.aircraftId, missionBatteryType],
  )

  // Enums WPML: aeronave + payload; o editor custom substitui o enum do
  // payload sempre, e o da aeronave apenas quando a aeronave é CUSTOM
  // (num M300 com payload custom o droneEnumValue continua a ser o do M300)
  const wpml = useMemo(() => {
    const merged = {
      ...aircraft.wpml,
      ...payload.wpml,
      // limites do gimbal e lente do payload: a exportacao recorta o pitch ao
      // intervalo e o template nomeia a lente nos payloads multi-lente
      gimbalPitchRange: payload.gimbalPitch ?? null,
      imageFormat: payload.imageFormat ?? null,
    }
    if (payload.type === 'custom') {
      merged.payloadEnumValue = custom.payloadEnumValue
      if (aircraft.id === 'CUSTOM') merged.droneEnumValue = custom.droneEnumValue
    }
    return merged
  }, [aircraft, payload, custom])

  const footprint = useMemo(
    () => computeFootprint(sensor, params.altitude),
    [sensor, params.altitude],
  )
  // Espaçamento e intervalo de disparo mantêm-se nadir-based mesmo com o
  // gimbal oblíquo — decisão deliberada (R2.4): a pegada oblíqua no chão é
  // maior do que a nadir, pelo que a sobreposição real fica sempre ≥ à
  // pedida (erro conservador). Só o GSD apresentado usa o alcance inclinado.
  const spacing = useMemo(
    () =>
      params.spacingMode === 'manual'
        ? Math.max(1, params.manualSpacing)
        : lineSpacing(footprint.across, params.sideOverlap),
    [footprint, params.sideOverlap, params.spacingMode, params.manualSpacing],
  )
  const interval = useMemo(
    () => photoInterval(footprint.along, params.frontOverlap),
    [footprint, params.frontOverlap],
  )
  // com a passagem nadir extra (R2.10) o produto orto é governado pelo GSD
  // nadir — é esse que se mostra e que serve de alvo
  const gsdPitch = params.crosshatch && params.includeNadir ? -90 : params.gimbalPitch
  const gsd = useMemo(
    () => computeGSD(sensor, params.altitude, gsdPitch),
    [sensor, params.altitude, gsdPitch],
  )

  // densidade de pontos LiDAR no solo (T2.1) — só para payloads com PRR
  const pointDensity = useMemo(
    () =>
      sensor.type === 'lidar' && payload.maxPrr
        ? lidarPointDensity({ prr: payload.maxPrr, speed: speed, swathM: footprint.across })
        : null,
    [sensor.type, payload, speed, footprint],
  )

  // intervalo entre fotos abaixo do que o obturador consegue?
  const avisoObturador = useCallback(
    (v) => {
      if (interval == null || !(v > 0)) return null
      const minS = payload.minTriggerS ?? 0.7
      const actualS = interval / v
      if (actualS >= minS) return null
      return { actualS, minS, maxSpeed: interval / minS }
    },
    [interval, payload],
  )
  const triggerWarn = useMemo(() => avisoObturador(speed), [avisoObturador, speed])
  // o mesmo aviso para um intervalo que não é o da área (as fotos ao longo
  // de um círculo no modo circular)
  const avisoIntervalo = useCallback(
    (intervalM, v) => {
      if (!(intervalM > 0) || !(v > 0)) return null
      const minS = payload.minTriggerS ?? 0.7
      const actualS = intervalM / v
      if (actualS >= minS) return null
      return { actualS, minS, maxSpeed: intervalM / minS }
    },
    [payload],
  )
  /* ------------------------- Modo corredor ---------------------------- */
  const {
    corridorConfig,
    setCorridorConfig,
    setCorridorParam,
    corridorSpeed,
    corridorTriggerWarn,
    corridorPlan: corridorPlanFlat,
    corridorBbox,
    corridorPreview,
    startCorridorDraw,
    handleFinishCorridor,
    clearCorridorAxis,
  } = useCorridorMission({
    sensor,
    speedRange,
    altitude: params.altitude,
    sideOverlap: params.sideOverlap,
    interval,
    missionMode,
    setMode,
    setDraftVertices,
    avisoObturador,
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
  // Reimportar um WPML devolve nome, altitude e velocidade da missão antiga
  const onImportedMission = useCallback(({ name, altitude, speed: s }) => {
    if (name) setMissionName(name)
    setParams((p) => {
      const next = { ...p }
      if (Number.isFinite(altitude)) next.altitude = altitude
      if (Number.isFinite(s)) {
        const r = aircraftRef.current?.speedRange ?? { min: 1, max: 20 }
        next.speed = Math.min(r.max, Math.max(r.min, s))
      }
      return next
    })
  }, [])
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
    setImportError,
    importWarning,
    handleImportFile,
    handleImportCrs,
    cancelImport,
    fitKey,
    setFitKey,
    applyProjectGeometry,
  } = useAreaGeometry({
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
    altitude: params.altitude,
    interval,
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
    t,
  })

  // Disposição de blocos nova: as atribuições lidas de um projecto adoptam-na
  // (key null); refeito o mosaico, ficam as que passaram por sobreposição
  // (calculadas em useAreaMission) e a contagem das que se perderam. Sem
  // blocos fica tudo como estava, para voltar quando os blocos voltarem.
  useEffect(() => {
    if (!layoutKey || blockBaseState.key === layoutKey) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlockBaseState({
      key: layoutKey,
      map: blockBaseEffective,
      cells: layoutCells,
      ring,
      lost: manualLost,
    })
  }, [blockBaseState.key, layoutKey, blockBaseEffective, layoutCells, ring, manualLost])

  // atribuições manuais novas, na disposição de blocos de agora
  const setManualBlockBase = useCallback(
    (map) =>
      setBlockBaseState((st) => ({ key: layoutKey, map, cells: layoutCells, ring, lost: st.lost })),
    [layoutKey, layoutCells, ring],
  )

  /* --------------- Modo circular (circlegrammetry) -------------------- */
  // Sobre o mesmo poligono da area: herda o relevo, a cota de referencia e
  // o seguimento de terreno; a geometria e os blocos sao proprios.
  const {
    circularConfig,
    setCircularConfig,
    setCircularParam,
    circularSpeed,
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
    batteryMin,
    reservePct: split.reservePct,
    missionMode,
    runExport,
    avisoIntervalo,
  })

  // Base de referência da área numa rota única (a mais próxima dela) e a
  // sua distância; com blocos, cada bloco tem a sua (baseLayout)
  const areaBasePoint = refBase?.point ?? null
  const perBlockBases = Boolean(baseLayout?.hasBases && blocks?.length)
  const areaBaseDistance = useMemo(
    () => (areaBasePoint && ring ? distanceToArea(areaBasePoint, ring) : null),
    [areaBasePoint, ring],
  )
  const circularBaseDistance = useMemo(
    () => (circularBase && ring ? distanceToArea(circularBase.point, ring) : null),
    [circularBase, ring],
  )

  // bases para o painel e o mapa: zona, cota de referência e voos de cada uma
  const baseRows = useMemo(
    () =>
      summarizeBases({
        bases,
        zones,
        layout: baseLayout,
        defaultRadiusM: equipment.zoneRadiusM,
      }),
    [bases, zones, baseLayout, equipment.zoneRadiusM],
  )

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

  // ficha de campo por base (checklist, relatório e KML «Bases e blocos»):
  // só com a área dividida em blocos e bases marcadas
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
          })
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
    ],
  )
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
        },
        t,
      )
      downloadBlob(
        new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
        `${areaSafeName}_bases.kml`,
      )
    })
  }, [fieldSheets, runExport, missionName, areaSafeName, blocks, baseLayout, flightFiles, t])

  // tipos de bateria da aeronave (selector da missão) e voos contra os
  // conjuntos que a equipa tem — o aviso só aparece com a contagem conhecida
  const equipmentBatteries = aircraftEquipmentFor(equipment, drone.aircraftId).batteries
  const setsCheck = blocks?.length
    ? flightsVsSets(equipment, drone.aircraftId, missionBatteryType.id, blocks.length)
    : null
  const circularSetsCheck =
    circularBlocks?.length > 1
      ? flightsVsSets(equipment, drone.aircraftId, missionBatteryType.id, circularBlocks.length)
      : null

  // Painel de estatísticas: os números do separador aberto (antes o
  // corredor, a fachada e a órbita mostravam os da área) e o resumo
  // operacional — voos, bases, baterias, voo mais longo e tempo total
  const modeStats = useMemo(() => {
    const ok = (p) => (p && !p.error ? (p.stats ?? null) : null)
    if (missionMode === 'circular') return ok(circularPlan)
    if (missionMode === 'corridor') return ok(corridorPlan)
    if (missionMode === 'face') return ok(facePlan)
    if (missionMode === 'orbit') return ok(orbitPlan)
    return planOk?.stats ?? null
  }, [missionMode, circularPlan, corridorPlan, facePlan, orbitPlan, planOk])
  const statsOps = useMemo(() => {
    const transit = (d, v) => (d > 0 && v > 0 ? (2 * d) / v : 0)
    const flightsOf = (n) =>
      flightsVsSets(equipment, drone.aircraftId, missionBatteryType.id, Math.max(1, n))
    if (missionMode === 'area') {
      const n = blocks?.length ?? 0
      return opsSummary({
        blocks: n ? blocks : null,
        byBlock: baseLayout?.byBlock ?? null,
        singleTimeS: planOk?.stats?.flightTimeS ?? null,
        singleTransitS: transit(areaBaseDistance, speed),
        usefulMin: batteryMin,
        bases: bases.length,
        sets: flightsOf(n),
      })
    }
    if (missionMode === 'circular') {
      const n = circularBlocks?.length > 1 ? circularBlocks.length : 0
      return opsSummary({
        blocks: n ? circularBlocks.map((b, i) => ({ id: i + 1, timeS: b.timeS })) : null,
        singleTimeS: modeStats?.flightTimeS ?? null,
        singleTransitS: transit(circularBaseDistance, circularSpeed),
        usefulMin: batteryMin,
        bases: bases.length,
        sets: flightsOf(n),
      })
    }
    return opsSummary({
      singleTimeS: modeStats?.flightTimeS ?? null,
      usefulMin: batteryMin,
      bases: bases.length,
      sets: flightsOf(1),
    })
  }, [
    missionMode,
    blocks,
    baseLayout,
    planOk,
    areaBaseDistance,
    speed,
    batteryMin,
    bases.length,
    circularBlocks,
    modeStats,
    circularBaseDistance,
    circularSpeed,
    equipment,
    drone.aircraftId,
    missionBatteryType.id,
  ])

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
    [mode, handleAreaClick, addInspectPoint, setOrbitConfig, bases, pushHistory],
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

  // arrastar uma base: só o operador a move (um passo do Ctrl+Z por arrasto)
  const handleBaseDrag = useCallback(
    (id, lonlat) => {
      pushHistory()
      setBases((bs) => moveBase(bs, id, lonlat))
      setSelectedBaseId(id)
    },
    [pushHistory],
  )

  const applySlopeAngle = useCallback(() => {
    if (slopeHint) setParams((p) => ({ ...p, angle: Math.round(slopeHint.contourAzimuthDeg) }))
  }, [slopeHint])

  const applySlopeGimbal = useCallback(() => {
    if (slopeHint) setParams((p) => ({ ...p, gimbalPitch: slopeHint.gimbal }))
  }, [slopeHint])

  // E3.2: agregado do projecto quando coexistem varios planos
  const projectSummary = useMemo(
    () =>
      aggregatePlans(
        [
          planOk?.stats,
          facePlan && !facePlan.error ? facePlan.stats : null,
          orbitPlan && !orbitPlan.error ? orbitPlan.stats : null,
          // O corredor entrou depois e ficou de fora desta lista: um projecto
          // com corredor mostrava menos planos, menos tempo e menos baterias
          // do que tem, e e daqui que sai o pack que vai para o campo.
          corridorPlan && !corridorPlan.error ? corridorPlan.stats : null,
          circularPlan && !circularPlan.error ? circularPlan.stats : null,
        ],
        { batteryMin, reservePct: split.reservePct },
      ),
    [planOk, facePlan, orbitPlan, corridorPlan, circularPlan, batteryMin, split.reservePct],
  )

  // E1.4: a vista 3D cobre o modo activo — grelha (com terrain follow),
  // passagens de fachada empilhadas ou anéis de órbita às suas alturas.
  // refElev ancora as alturas relativas: pé da face / solo do POI / base.
  const view3d = useMemo(() => {
    const elevAt = terrain.status === 'ready' ? terrain.data?.elevationAt : null
    if (missionMode === 'face' && facePlan && !facePlan.error) {
      const foot = elevAt?.(faceConfig.baseline[0][0], faceConfig.baseline[0][1])
      return { waypoints: facePlan.waypoints, refElev: Number.isFinite(foot) ? foot : 0 }
    }
    if (missionMode === 'orbit' && orbitPlan && !orbitPlan.error) {
      const ground = elevAt?.(orbitConfig.poi[0], orbitConfig.poi[1])
      return { waypoints: orbitPlan.waypoints, refElev: Number.isFinite(ground) ? ground : 0 }
    }
    // Sem este ramo o modo corredor caía no plano de ÁREA: com um polígono
    // desenhado antes, a vista 3D e o perfil mostravam a grelha da área
    // enquanto o painel do corredor estava aberto — a missão errada.
    // Circular: alturas por ponto (planas ou do terreno) sobre a cota de
    // referencia da area, a mesma cadeia do modo area
    if (missionMode === 'circular') {
      if (!circularPlan || circularPlan.error) return null
      return {
        waypoints: circularPlan.waypoints,
        refElev: circularReference?.elev ?? null,
        refSource: circularReference?.source ?? null,
      }
    }
    // Corredor: a mesma cadeia de referência da área (base com relevo, senão
    // a mínima debaixo da rota); antes era a cota do início do eixo
    if (missionMode === 'corridor') {
      if (!corridorPlan || corridorPlan.error) return null
      return {
        waypoints: corridorPlan.waypoints.map(([lon, lat, h]) => [lon, lat, h ?? params.altitude]),
        refElev: corridorReference?.elev ?? null,
        refSource: corridorReference?.source ?? null,
      }
    }
    if (!planOk) return null
    const tfOk = terrainResult && !terrainResult.error
    // Bases múltiplas: cada bloco na cota da zona da sua base, exprimido na
    // comum (a mesma altitude absoluta); os troços entre blocos não se voam
    if (blockRefs && blocks?.length) {
      const src = tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
      const vr = blocksViewRoute(src, blockRefs, params.altitude)
      return {
        waypoints: vr.waypoints,
        breaks: vr.breaks,
        refElev: blockRefs.common,
        refSource: 'bases',
      }
    }
    const wps = tfOk
      ? terrainResult.waypoints
      : planOk.waypoints.map(([lon, lat]) => [lon, lat, params.altitude])
    // Cota de referencia unica (useAreaMission): base com relevo, senao a
    // minima do relevo debaixo da rota. Antes caia em 0 com a base fora do
    // relevo e o perfil punha o voo debaixo da terra.
    const refElev = tfOk ? terrainResult.refElev : (reference?.elev ?? null)
    return { waypoints: wps, refElev, refSource: reference?.source ?? null }
  }, [
    missionMode,
    facePlan,
    faceConfig.baseline,
    orbitPlan,
    orbitConfig.poi,
    corridorPlan,
    corridorReference,
    circularPlan,
    circularReference,
    planOk,
    terrainResult,
    terrain,
    reference,
    blockRefs,
    blocks,
    params.altitude,
  ])

  // Vista 3D com bases: a cor de cada voo (a da sua base, como no mapa),
  // pela ordem dos troços de view3d, e o contorno e o rótulo de cada bloco
  const view3dColors = useMemo(() => {
    if (missionMode !== 'area' || view3d?.refSource !== 'bases' || !baseLayout?.hasBases)
      return null
    const tfOk = terrainResult && !terrainResult.error
    const src = tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
    if (!src?.length) return null
    const colorOf = (id) => baseLayout.byBlock[id]?.color ?? null
    return {
      // um troço por bloco com waypoints (os vazios não abrem troço)
      pieces: src.filter((b) => b.waypoints?.length > 0).map((b) => colorOf(b.id)),
      blocks: (blocks ?? []).map((b) => ({
        ring: b.cellRing ?? blockRing(b),
        color: colorOf(b.id),
        label: baseLayout.byBlock[b.id]?.flightLabel ?? '',
      })),
    }
  }, [missionMode, view3d, baseLayout, terrainResult, blocks])

  // Pior folga ao solo da rota que sairia no KMZ, sobre o relevo carregado.
  // E daqui que o preflight bloqueia uma rota que entra no terreno.
  const clearance = useMemo(() => {
    const elevationAt = terrain.status === 'ready' ? terrain.data?.elevationAt : null
    if (!elevationAt || !view3d?.waypoints?.length || !Number.isFinite(view3d.refElev)) return null
    return routeClearance(view3d.waypoints, {
      elevationAt,
      refElev: view3d.refElev,
      breaks: view3d.breaks ?? null,
    })
  }, [terrain, view3d])

  // Maior altura acima do solo da rota exportável, sobre o relevo. Só para a
  // nota da categoria aberta (120 m): a altura é decisão do operador e nada
  // é cortado nem bloqueado.
  const aglMaxM = Number.isFinite(clearance?.maxM) ? clearance.maxM : null

  // O relevo cobre a rota que sairia no KMZ do separador aberto? Sem isto
  // não há exportação: as alturas são relativas à descolagem e só o relevo
  // diz a que altura do chão se voa (o preflight diz o que falta).
  const view3dBoxKey = useMemo(() => {
    const b = bboxOfPoints(view3d?.waypoints)
    return b ? b.map((v) => v.toFixed(4)).join(',') : ''
  }, [view3d])
  useEffect(() => {
    const box = view3dBoxKey ? view3dBoxKey.split(',').map(Number) : null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRouteBox((r) =>
      r.mode === missionMode && String(r.box) === String(box) ? r : { mode: missionMode, box },
    )
  }, [view3dBoxKey, missionMode])

  const terrainRoute = useMemo(() => {
    const box = bboxOfPoints(view3d?.waypoints)
    const covered =
      terrain.status === 'ready' && Boolean(box) && bboxCovers(terrain.data?.bbox, box)
    return {
      covered,
      status: terrain.status,
      source: terrain.data?.source ?? null,
      error: terrain.error ?? null,
      fromFile: Boolean(terrain.fromFile),
    }
  }, [view3d, terrain])

  // Inclinacao do gimbal pedida fora do que o payload alcanca (a exportacao
  // recorta; aqui avisa-se do valor pedido), no modo activo e nos pontos de
  // inspeccao que tenham pitch proprio
  const gimbal = useMemo(() => {
    const pitches =
      missionMode === 'face'
        ? [faceConfig.gimbalPitch]
        : missionMode === 'orbit'
          ? (orbitPlan?.perWaypoint ?? []).map((w) => w.gimbalPitch)
          : missionMode === 'corridor'
            ? [-90]
            : missionMode === 'circular'
              ? [circularConfig.gimbalPitch]
              : [params.gimbalPitch]
    for (const p of inspectPoints ?? []) if (p?.gimbalPitch != null) pitches.push(p.gimbalPitch)
    return gimbalRangeViolation(pitches, payload.gimbalPitch ?? null)
  }, [
    missionMode,
    faceConfig.gimbalPitch,
    orbitPlan,
    circularConfig.gimbalPitch,
    params.gimbalPitch,
    inspectPoints,
    payload,
  ])

  // Teto operacional AGL do payload (T1.3), ex.: LiDAR limitado a 100 m
  const aglWarn = useMemo(
    () =>
      aglCapWarning(payload, params.altitude, {
        terrainFollowActive: Boolean(
          terrainFollow.enabled && terrainResult && !terrainResult.error,
        ),
        toleranceM: terrainFollow.tolerance,
      }),
    [payload, params.altitude, terrainFollow, terrainResult],
  )

  /* ------------------------ Incerteza propagada ----------------------- */
  // Intervalos [pior, melhor] de AGL, GSD e sobreposicoes com o erro de
  // posicionamento (GNSS ou RTK) e o relevo dentro da area (ou a tolerancia
  // do seguimento); arrastamento por movimento; rota exportada segmento a
  // segmento. Tudo puro em src/mission/uncertainty.js.
  const posError = useMemo(
    () => positioningError(aircraft, drone.rtk === true),
    [aircraft, drone.rtk],
  )
  const relief = useMemo(() => {
    if (!planOk || terrain.status !== 'ready' || !terrain.data?.elevationAt) return null
    return terrainReliefRange(
      planOk.waypoints,
      terrain.data.elevationAt,
      areaBasePoint ?? planOk.waypoints[0],
    )
  }, [planOk, terrain, areaBasePoint])
  const tfActive = Boolean(terrainFollow.enabled && terrainResult && !terrainResult.error)
  const uncertainty = useMemo(
    () =>
      planOk && sensor.type === 'camera'
        ? uncertaintyIntervals({
            sensor,
            altitude: params.altitude,
            gimbalPitch: gsdPitch,
            spacing,
            interval,
            posError,
            relief,
            terrainFollow: tfActive,
            toleranceM: terrainFollow.tolerance,
          })
        : null,
    [
      planOk,
      sensor,
      params.altitude,
      gsdPitch,
      spacing,
      interval,
      posError,
      relief,
      tfActive,
      terrainFollow.tolerance,
    ],
  )
  const blur = useMemo(() => (gsd != null ? motionBlur({ speed, gsdCm: gsd }) : null), [speed, gsd])
  // Sobre a geometria que sai no KMZ do modo activo (view3d), e nao so na
  // area: a orbita, a fachada, o corredor e a inspeccao ficavam sem nenhuma
  // verificacao de rota, e foi na orbita que apareceu o troco inexecutavel.
  const route = useMemo(() => {
    if (!view3d?.waypoints?.length) return null
    const v =
      missionMode === 'orbit'
        ? orbitConfig.speedMS
        : missionMode === 'circular'
          ? circularSpeed
          : speed
    return routeChecks(view3d.waypoints, {
      speed: v,
      maxClimbMS: aircraft.maxClimbMS ?? 5,
      breaks: view3d.breaks ?? null,
    })
  }, [view3d, missionMode, orbitConfig.speedMS, circularSpeed, speed, aircraft.maxClimbMS])

  /* ----------------------------- Preflight ---------------------------- */
  // Uma só lista, calculada a partir do mesmo estado que a exportação usa
  // (src/mission/preflight.js). Os bloqueios desactivam o botão do KMZ.
  const preflight = useMemo(() => {
    if (missionMode === 'area') {
      return preflightArea({
        plan,
        blocks,
        photoMode,
        waypointStops: params.waypointStops,
        terrainFollow,
        terrainCovers,
        terrainResult,
        basePoint: areaBasePoint,
        // com blocos e bases, o alcance e o trânsito vão bloco a bloco
        baseDistance: perBlockBases ? null : areaBaseDistance,
        baseLayout: perBlockBases ? baseLayout : null,
        viewsheds: perBlockBases ? viewshedByBlock : null,
        refZone:
          !perBlockBases && refBase && zones[refBase.id] && !zones[refBase.id].error
            ? { label: refBase.label, zone: zones[refBase.id] }
            : null,
        vlosM,
        speed,
        batteryMin,
        reservePct: split.reservePct,
        aglWarn,
        triggerWarn,
        terrainDatum: terrain.data?.verticalDatum ?? null,
        uncertainty,
        blur,
        route,
        clearance,
        reference,
        gimbal,
        aglMaxM,
        terrainRoute,
      })
    }
    const other = {
      batteryMin,
      reservePct: split.reservePct,
      clearance,
      route,
      gimbal,
      aglMaxM,
      terrainRoute,
    }
    if (missionMode === 'corridor')
      return preflightPlan({
        ...other,
        plan: corridorPlan,
        aglWarn,
        triggerWarn: corridorTriggerWarn,
        photoMode: corridorConfig.photoMode,
        waypointStops: corridorConfig.waypointStops,
        terrainFollow,
        terrainCovers: corridorCovers,
        terrainResult: corridorTerrain,
        reference: corridorReference,
        basePoint: corridorBase?.point ?? null,
        baseDistance: corridorBaseDistance,
        speed: corridorSpeed,
      })
    if (missionMode === 'circular')
      return preflightPlan({
        ...other,
        plan: circularPlan,
        aglWarn,
        triggerWarn: circularTriggerWarn,
        terrainFollow,
        terrainCovers: circularCovers,
        terrainResult: circularTerrain,
        reference: circularReference,
        basePoint: circularBase?.point ?? null,
        baseDistance: circularBaseDistance,
        speed: circularSpeed,
      })
    if (missionMode === 'face') return preflightPlan({ ...other, plan: facePlan })
    return preflightPlan({ ...other, plan: orbitPlan })
  }, [
    missionMode,
    plan,
    blocks,
    photoMode,
    params.waypointStops,
    corridorConfig.photoMode,
    corridorConfig.waypointStops,
    terrainFollow,
    terrainCovers,
    terrainResult,
    areaBasePoint,
    areaBaseDistance,
    perBlockBases,
    baseLayout,
    viewshedByBlock,
    refBase,
    zones,
    vlosM,
    corridorBase,
    circularBase,
    circularBaseDistance,
    speed,
    batteryMin,
    split.reservePct,
    aglWarn,
    triggerWarn,
    corridorPlan,
    corridorTriggerWarn,
    corridorTerrain,
    corridorReference,
    corridorCovers,
    corridorBaseDistance,
    corridorSpeed,
    circularPlan,
    circularTriggerWarn,
    circularReference,
    circularTerrain,
    circularCovers,
    circularSpeed,
    facePlan,
    orbitPlan,
    terrain.data,
    clearance,
    reference,
    gimbal,
    uncertainty,
    blur,
    route,
    aglMaxM,
    terrainRoute,
  ])
  const exportBlocked = hasBlockers(preflight)
  // sem relevo sobre a rota, o próprio item do preflight descarrega o global
  const terrainActions = useMemo(() => {
    const a = { label: t('cp.terrain.downloadGlobal'), onClick: handleLoadTerrain }
    return {
      'terrain-missing': a,
      'terrain-download-error': a,
      'terrain-file-outside': a,
      'terrain-file-error': a,
    }
  }, [t, handleLoadTerrain])

  // Exportação da missão do SEPARADOR ABERTO, sempre atrás do preflight dela:
  // o botão do cabeçalho e os botões de cada painel. Antes o cabeçalho
  // exportava a área com o preflight do outro modo ao lado, e os painéis
  // exportavam rotas que o preflight bloqueava (rota dentro do relevo,
  // waypoints repetidos, base inalcançável).
  const modeExport = {
    area: handleExportKMZ,
    face: handleExportFace,
    orbit: handleExportOrbitSingle,
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

  /* --------------- Persistência do projeto (localStorage) -------------- */

  // leitura e migração (v1/v2) em src/mission/project.js e mecânica de
  // gravação/ficheiro em hooks/useProject.js; aqui só se distribui o
  // projecto normalizado pelo estado, porque é o App que tem os setters
  const applyNormalized = useCallback(
    (n) => {
      if (n.missionName != null) setMissionName(n.missionName)
      if (n.drone) setDrone(n.drone)
      if (n.custom) setCustom((c) => ({ ...c, ...n.custom }))
      if (n.payloadTuning) setPayloadTuning(n.payloadTuning)
      if (n.params) {
        // triggerMode desconhecido (ou ausente) carrega como distância
        setParams((prev) => ({
          ...prev,
          ...n.params,
          triggerMode: normalizeTriggerMode(n.params.triggerMode ?? prev.triggerMode),
          // projectos anteriores ao parâmetro abrem com paragem só nos cantos
          waypointStops: normalizeWaypointStops(n.params.waypointStops),
        }))
      }
      // bateria da missão (os projectos antigos já vêm convertidos em tempo
      // útil, project.js): igual ao do equipamento, passa a segui-lo
      if (n.battery) setMissionBattery(followBatteryIfEqual(equipment, n.battery))
      if (n.missionMode) setMissionMode(n.missionMode)
      if (n.faceConfig) setFaceConfig(n.faceConfig)
      if (n.orbitConfig) setOrbitConfig(n.orbitConfig)
      if (n.corridorConfig) setCorridorConfig(n.corridorConfig)
      if (n.circularConfig) setCircularConfig(n.circularConfig)
      if (n.inspectPoints) {
        setInspectPoints(n.inspectPoints)
        inspectSeqRef.current = n.nextInspectId
      }
      applyProjectGeometry(n) // split, anchor, ring, origem e células desactivadas
      // bases (a base única antiga abre como A) e as atribuições manuais,
      // que valem para a disposição de blocos que o projecto reabre
      setBases(n.bases ?? [])
      setBlockBaseState({ key: null, map: n.blockBase ?? {}, cells: null, ring: null, lost: 0 })
      setSelectedBaseId(null)
      setBaseProposal(null)
      if (n.terrainFollow) setTerrainFollow((t) => ({ ...t, ...n.terrainFollow }))
      if (n.gcpConfig) setGcpConfig((g) => ({ ...g, ...n.gcpConfig }))
      setObstacleM(n.obstacleHeightM ?? 0)
      setDemMemory(n.demFile ?? null)
      // projectos anteriores às acções de segurança abrem com as omissões
      setSafety(n.safety ?? { ...DEFAULT_SAFETY })
    },
    [
      setCorridorConfig,
      setCircularConfig,
      setOrbitConfig,
      setFaceConfig,
      setInspectPoints,
      inspectSeqRef,
      setTerrainFollow,
      applyProjectGeometry,
      setGcpConfig,
      equipment,
    ],
  )

  // a bateria tal como o projecto a guarda: o tipo e o tempo útil efectivo
  const projectBattery = useMemo(
    () => ({ batteryId: missionBatteryType.id, usefulMin: batteryMin }),
    [missionBatteryType.id, batteryMin],
  )

  // tudo o que o projecto guarda, num só objecto (autosave e ficheiro)
  // ficheiro de relevo a gravar no projecto: com um ficheiro carregado, o
  // dele; sem ele (ainda por reimportar), o do projecto aberto. Depende só
  // de valores simples: o relevo recortado de novo (outro objecto, o mesmo
  // ficheiro) não pode reiniciar a espera da gravação automática
  const projectDemFile = useMemo(
    () => (demFileLabel ? { label: demFileLabel, surface: demSurface } : demMemory),
    [demFileLabel, demSurface, demMemory],
  )
  const projectState = useMemo(
    () => ({
      missionName,
      drone,
      custom,
      payloadTuning,
      battery: projectBattery,
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
      areaOrigin,
      bases,
      // só as atribuições que valem para os blocos de agora
      blockBase: blockBaseEffective,
      disabledTiles,
      terrainFollow,
      gcpConfig,
      obstacleHeightM: obstacleM,
      safety,
      // com um ficheiro carregado grava-se o dele; sem ele (ainda por
      // reimportar) mantém-se o do projecto aberto
      demFile: projectDemFile,
    }),
    [
      missionName,
      drone,
      custom,
      payloadTuning,
      projectBattery,
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
      areaOrigin,
      bases,
      blockBaseEffective,
      disabledTiles,
      terrainFollow,
      gcpConfig,
      obstacleM,
      safety,
      projectDemFile,
    ],
  )

  const fitToArea = useCallback(() => setFitKey((k) => k + 1), [setFitKey])
  const { exportProject, importProject } = useProject({
    state: projectState,
    missionName,
    applyNormalized,
    onLoaded: fitToArea,
    setImportError,
  })

  const startBase = useCallback(() => {
    setMode((m) => (m === 'base' ? 'idle' : 'base'))
  }, [])

  // retirar uma base: os blocos atribuídos à mão a ela voltam à automática
  // (as atribuições guardadas, que podem ser de outra disposição de blocos)
  const removeBaseById = useCallback(
    (id) => {
      pushHistory()
      const res = removeBaseFrom(bases, blockBaseState.map, id)
      setBases(res.bases)
      setBlockBaseState((st) => ({ ...st, map: res.blockBase }))
      setSelectedBaseId((sel) => (sel === id ? null : sel))
      setMode((m) => (m === 'base' ? 'idle' : m))
    },
    [bases, blockBaseState.map, pushHistory],
  )

  // "Remover base": a seleccionada, senão a de referência do separador
  // aberto (a única, num projecto com uma base)
  const removeBase = useCallback(() => {
    const ref =
      missionMode === 'corridor'
        ? corridorBase
        : missionMode === 'circular'
          ? circularBase
          : (refBase ?? null)
    const id = bases.some((b) => b.id === selectedBaseId) ? selectedBaseId : ref?.id
    if (id) removeBaseById(id)
  }, [missionMode, corridorBase, circularBase, refBase, bases, selectedBaseId, removeBaseById])

  // raio da zona: o que se escreve num campo, tecla a tecla, é um só passo
  // do Ctrl+Z (`edit` muda a cada vez que o campo ganha o foco)
  const setBaseRadiusById = useCallback(
    (id, r, edit = null) => {
      pushHistory(edit ? `radius:${id}:${edit}` : null)
      setBases((bs) => setBaseRadius(bs, id, r))
    },
    [pushHistory],
  )

  // "Propor bases": bases novas só para os blocos que nenhuma base vê
  // inteiros; as do operador ficam onde estão. Com relevo, sítios planos e
  // altos com o rádio livre para os blocos que servem (src/mission/baseSites.js),
  // em fatias (useBaseProposal): o painel diz «A propor bases…» e deixa
  // cancelar. Sem relevo, a cobertura de sempre.
  const {
    start: startProposal,
    cancel: cancelProposalRun,
    running: proposing,
    progress: proposeProgress,
  } = useBaseProposal()
  const proposeBasesForBlocks = useCallback(() => {
    if (!blocks?.length) return
    const ready = terrain.status === 'ready' && terrainCovers
    const model = ready
      ? viewshedTerrainModel(terrain.data, {
          surface: terrain.data?.source === 'file' ? demSurface : 'dtm',
          obstacleM,
        })
      : null
    setBaseProposal(null)
    startProposal(
      {
        blocks,
        bases,
        zones,
        manual: blockBaseEffective,
        vlosM,
        defaultRadiusM: equipment.zoneRadiusM,
        maxBlocksPerBase: equipment.maxFlightsPerBase ?? 0,
        maxReliefM: equipment.zoneMaxReliefM,
        terrain: model
          ? { elevationAt: terrain.data.elevationAt, obstacleM: model.obstacleM }
          : null,
        altitudeM: params.altitude,
        terrainFollow: viewshedTf,
        eyeHeightM: equipment.eyeHeightM,
        antennaHeightM: equipment.antennaHeightM,
      },
      (res) => {
        if (res.added > 0) {
          pushHistory()
          setBases(res.bases)
          setManualBlockBase(res.blockBase)
        }
        setBaseProposal({ added: res.added, outOfVlos: res.outOfVlos, poorSites: res.poorSites })
      },
    )
  }, [
    blocks,
    bases,
    zones,
    blockBaseEffective,
    vlosM,
    equipment,
    pushHistory,
    setManualBlockBase,
    terrain,
    terrainCovers,
    demSurface,
    obstacleM,
    viewshedTf,
    params.altitude,
    startProposal,
  ])
  const cancelProposal = useCallback(() => {
    if (cancelProposalRun()) setBaseProposal({ cancelled: true })
  }, [cancelProposalRun])
  // uma edição a meio da proposta: o resultado já não seria o desta área
  useEffect(() => {
    cancelProposalRun()
  }, [cancelProposalRun, blocks, bases, blockBaseEffective, terrain.data])

  // Base seleccionada (o pino ou o rótulo na lista) = destino dos blocos:
  // clicar num bloco passa-o para ela; sem base seleccionada, o clique
  // activa/desactiva a célula. Esc ou um novo clique no pino desselecciona.
  const assignMode =
    missionMode === 'area' &&
    mode === 'idle' &&
    Boolean(blocks?.length) &&
    bases.some((b) => b.id === selectedBaseId)
  const assignBlock = useCallback(
    (blockId) => {
      if (!baseLayout?.byBlock[blockId]) return
      const target = blockClickTarget(selectedBaseId, baseLayout.byBlock[blockId].baseId)
      if (!target) return
      pushHistory()
      setManualBlockBase(assignBlockBase(blockBaseEffective, blockId, bases, { baseId: target }))
    },
    [bases, baseLayout, selectedBaseId, blockBaseEffective, pushHistory, setManualBlockBase],
  )

  // clique numa célula do mosaico: passar o bloco para a base seleccionada,
  // ou activar/desactivar a célula
  const handleTileClick = useCallback(
    (index) => {
      if (assignMode) {
        if (!disabledTiles.has(index)) assignBlock(index + 1)
        return
      }
      toggleTile(index)
    },
    [assignMode, disabledTiles, assignBlock, toggleTile],
  )
  const handleBlockClick = useCallback(
    (blockId) => {
      if (assignMode) assignBlock(blockId)
    },
    [assignMode, assignBlock],
  )
  // o pino da base selecciona-a; um segundo clique desselecciona
  const handleBaseSelect = useCallback(
    (id) => setSelectedBaseId((sel) => (sel === id ? null : id)),
    [],
  )
  // Esc desselecciona a base (fora dos campos de texto e dos desenhos). O
  // Esc fecha primeiro o que está por cima: com uma janela (3D, perfil,
  // ajuda, relatório, configuração, aviso) ou uma gaveta aberta, a base fica
  const overlayOpen =
    show3d || showProfile || showHelp || showReport || showSettings || Boolean(disclaimer)
  useEffect(() => {
    if (!selectedBaseId || mode !== 'idle' || overlayOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (document.querySelector('[data-testid^="drawer-"]:not([hidden]), [aria-modal="true"]'))
        return
      setSelectedBaseId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedBaseId, mode, overlayOpen])

  // Catálogo de presets de missão aplicáveis ao sensor ativo, com a
  // velocidade já resolvida para a aeronave selecionada
  const flightPresets = useMemo(() => {
    const kind = sensor.type === 'lidar' ? 'lidar' : 'camera'
    return MISSION_PRESETS.filter((p) => p.appliesTo === kind).map((p) => ({
      id: p.id,
      name: p.name,
      desc: p.desc,
      values: {
        ...p.values,
        speed: p.speedByProfile?.[drone.aircraftId] ?? p.values.speed,
      },
    }))
  }, [sensor.type, drone.aircraftId])

  const applyPreset = useCallback(
    (presetId) => {
      const preset = flightPresets.find((p) => p.id === presetId)
      if (preset) setParams((prev) => ({ ...prev, ...preset.values }))
    },
    [flightPresets],
  )

  // GSD alvo → altitude (inverso do cálculo do GSD, com o mesmo alcance
  // inclinado do gimbal oblíquo)
  const setAltitudeFromGsd = useCallback(
    (gsdTarget) => {
      if (sensor.type !== 'camera' || !sensor.imageWidth || !(gsdTarget > 0)) return
      const absPitch = Math.max(20, Math.min(90, Math.abs(gsdPitch)))
      const slantToAlt = Math.sin((absPitch * Math.PI) / 180)
      const alt =
        ((gsdTarget * sensor.focalLength * sensor.imageWidth) / (sensor.sensorWidth * 100)) *
        slantToAlt
      setParams((p) => ({ ...p, altitude: Math.round(alt * 10) / 10 }))
    },
    [sensor, gsdPitch],
  )

  // Atalhos de direção das linhas relativamente ao bloco/aresta de referência
  const setAngleRelative = useCallback(
    (offsetDeg) => {
      if (refAzimuth == null) return
      setParams((p) => ({ ...p, angle: Math.round((refAzimuth + offsetDeg) % 360) }))
    },
    [refAzimuth],
  )

  // Direção ótima (T3.2): menor número de troços dentro do polígono real
  const setAngleOptimal = useCallback(() => {
    if (!ring || !validation.valid) return
    const best = findOptimalDirection(ring, spacing)
    if (best != null) setParams((p) => ({ ...p, angle: Math.round(best) }))
  }, [ring, validation.valid, spacing])

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
        safety={safety}
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
              <span className="text-[11px] font-normal text-slate-500">
                v{import.meta.env.APP_VERSION}
              </span>
            </h1>
            {/* em ecrãs estreitos (tablet no campo) o subtítulo dá lugar aos botões */}
            <p className="hidden text-[11px] text-slate-500 xl:block">{t('app.subtitle')}</p>
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
            title={t('app.exportKmlTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('app.exportKml')}
          </button>
          <PreflightPill
            items={preflight}
            open={showPreflight}
            onToggle={() => setShowPreflight((v) => !v)}
          />
          <button
            // no modo circular o KMZ do cabecalho e a missao circular: o
            // preflight ao lado e o dela, e a grelha da area exporta-se no
            // separador Area
            onClick={gated(modeExport)}
            disabled={!modePlanOk || exportBlocked}
            title={t('app.exportWpmlTitle')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
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
          <span>{t(`export.err.${exportError}`)}</span>
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
                safety={safety}
                setSafety={setSafety}
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
                onExport={gated(handleExportFace)}
                exportBlocked={exportBlocked}
              />
            )}
            {missionMode === 'orbit' && (
              <OrbitPanel
                safety={safety}
                setSafety={setSafety}
                orbitConfig={orbitConfig}
                setOrbitParam={setOrbitParam}
                orbitPlan={orbitPlan}
                cameraOk={sensor.type === 'camera'}
                gsdAtRadius={gsdAtRadius}
                onGsdTarget={setRadiusFromGsd}
                mode={mode}
                onStartPoi={startOrbitPoi}
                onClearPoi={clearOrbitPoi}
                onExportSingle={gated(handleExportOrbitSingle)}
                onExportPerLevel={gated(handleExportOrbitPerLevel)}
                exportBlocked={exportBlocked}
              />
            )}
            {missionMode === 'corridor' && (
              <CorridorPanel
                safety={safety}
                setSafety={setSafety}
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
                safety={safety}
                setSafety={setSafety}
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
                altitude={params.altitude}
                frontOverlap={params.frontOverlap}
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
                waypointWarn={waypointWarn}
                aglWarn={aglWarn}
                importState={importState}
                importError={importError}
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
                onApplySlopeGimbal={applySlopeGimbal}
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
            blocks={
              // os blocos são da área; nos outros modos não se desenham. Com
              // bases, cada bloco com o número do voo e a cota da sua zona
              missionMode !== 'area'
                ? null
                : blockRefs && blocks?.length
                  ? (terrainResult && !terrainResult.error && terrainResult.blocks3
                      ? terrainResult.blocks3
                      : blocks
                    ).map((b, i) => {
                      const info = baseLayout?.byBlock[b.id]
                      const r = blockRefs.refs[i] ?? blockRefs.common
                      return {
                        id: b.id,
                        label: info?.flightLabel || `B${String(b.id).padStart(2, '0')}`,
                        refElev: r,
                        reference: { elev: r, source: 'zone', base: info?.baseLabel ?? '' },
                        waypoints: b.waypoints.map(([lon, lat, h]) => [
                          lon,
                          lat,
                          Number.isFinite(h) ? h : params.altitude,
                        ]),
                      }
                    })
                  : terrainResult && !terrainResult.error && terrainResult.blocks3
                    ? terrainResult.blocks3.map((b) => ({ id: b.id, waypoints: b.waypoints }))
                    : (blocks?.map((b) => ({
                        id: b.id,
                        waypoints: b.waypoints.map(([lon, lat]) => [lon, lat, params.altitude]),
                      })) ?? null)
            }
            onClose={() => setShowProfile(false)}
          />
        </Suspense>
      )}

      {showReport && planOk && (
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
      )}

      {show3d && terrain.status === 'ready' && view3d && (
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
            onClose={() => setShow3d(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
