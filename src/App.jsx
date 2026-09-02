import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import CorridorPanel from './components/CorridorPanel.jsx'
import MissionModeSelector from './components/MissionModeSelector.jsx'
import FacePanel from './components/FacePanel.jsx'
import OrbitPanel from './components/OrbitPanel.jsx'
import ProjectSummary from './components/ProjectSummary.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import ChecklistPage from './components/ChecklistPage.jsx'
import HelpModal from './components/HelpModal.jsx'

// carregados sob demanda
const Map3D = lazy(() => import('./components/Map3D.jsx'))
const MissionReport = lazy(() => import('./components/MissionReport.jsx'))
const ElevationProfile = lazy(() => import('./components/ElevationProfile.jsx'))
import {
  AIRCRAFT,
  PAYLOADS,
  DEFAULT_CUSTOM_SENSOR,
  DEFAULT_SELECTION,
  MISSION_PRESETS,
  aglCapWarning,
  batteryMinFor,
} from './data/drones.js'
import {
  aggregatePlans,
  normalizeTriggerMode,
  computeFootprint,
  computeGSD,
  findOptimalDirection,
  lidarPointDensity,
  lineSpacing,
  photoInterval,
  resolveSensor,
} from './utils/geo.js'
import { MissionExportError } from './utils/exporters.js'
import { useAreaGeometry } from './hooks/useAreaGeometry.js'
import { useAreaMission } from './hooks/useAreaMission.js'
import { useCorridorMission } from './hooks/useCorridorMission.js'
import { useOrbitMission } from './hooks/useOrbitMission.js'
import { useFaceMission } from './hooks/useFaceMission.js'
import { useInspection } from './hooks/useInspection.js'
import { useTerrain } from './hooks/useTerrain.js'
import { useProject } from './hooks/useProject.js'
import { DEFAULT_PARAMS } from './mission/defaults.js'
import { hasBlockers, preflightArea, preflightPlan } from './mission/preflight.js'
import { PreflightList, PreflightPill } from './components/PreflightBar.jsx'
import {
  FlagGB,
  FlagPT,
  IconCheck,
  IconCube,
  IconDrone,
  IconDownload,
} from './components/Icons.jsx'

const FLAG_BY_LANG = { pt: FlagPT, en: FlagGB }
import { LANGS, LangContext, useT } from './i18n.jsx'

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
  // seleção de hardware: aeronave + payload (T1.1)
  const [drone, setDrone] = useState(() => ({ ...DEFAULT_SELECTION }))
  const [custom, setCustom] = useState(DEFAULT_CUSTOM_SENSOR)
  // afinações por payload (T1.2): { [payloadId]: { effectiveFov } }
  const [payloadTuning, setPayloadTuning] = useState({})
  // duração de bateria por combinação (T1.4): { 'aircraftId:payloadId': min }
  const [batteryByCombo, setBatteryByCombo] = useState({})
  const [params, setParams] = useState(() => ({ ...DEFAULT_PARAMS }))
  const [mode, setMode] = useState('idle') // 'idle' | 'draw' | 'anchor' | 'base' | 'inspect' | 'face'
  // tipo de missão activo (E1.0, modelo A): troca a ferramenta e o painel
  const [missionMode, setMissionMode] = useState('area') // 'area' | 'face' | 'orbit' | 'corridor'
  // pontos de inspeção (R2.9): waypoints avulsos com rumo/pitch/foto próprios
  const [draftVertices, setDraftVertices] = useState([])
  const [basePoint, setBasePoint] = useState(null) // base do operador [lon,lat]
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

  // duração de bateria efetiva: override da combinação, senão o defeito da
  // aeronave; editar para o valor de defeito remove o override
  const batteryMin = batteryMinFor(aircraft, drone.payloadId, batteryByCombo)
  const setBatteryMin = useCallback(
    (value) => {
      setBatteryByCombo((m) => {
        const key = `${drone.aircraftId}:${drone.payloadId}`
        const dflt = AIRCRAFT[drone.aircraftId]?.batteryMin
        if (!Number.isFinite(value) || value <= 0 || value === dflt) {
          const { [key]: _drop, ...rest } = m
          return rest
        }
        return { ...m, [key]: Math.min(120, Math.max(5, value)) }
      })
    },
    [drone],
  )

  // Enums WPML: aeronave + payload; o editor custom substitui o enum do
  // payload sempre, e o da aeronave apenas quando a aeronave é CUSTOM
  // (num M300 com payload custom o droneEnumValue continua a ser o do M300)
  const wpml = useMemo(() => {
    const merged = { ...aircraft.wpml, ...payload.wpml }
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
  /* ------------------------- Modo corredor ---------------------------- */
  const {
    corridorConfig,
    setCorridorConfig,
    setCorridorParam,
    corridorSpeed,
    corridorTriggerWarn,
    corridorPlan,
    corridorPreview,
    startCorridorDraw,
    handleFinishCorridor,
    clearCorridorAxis,
    handleExportCorridor,
  } = useCorridorMission({
    sensor,
    speedRange,
    altitude: params.altitude,
    sideOverlap: params.sideOverlap,
    interval,
    missionMode,
    missionName,
    wpml,
    setMode,
    setDraftVertices,
    runExport,
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
  } = useOrbitMission({ sensor, missionMode, missionName, wpml, setMode, runExport })

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
    basePoint,
    altitude: params.altitude,
    speed,
    gimbalPitch: params.gimbalPitch,
    sensorType: sensor.type,
    missionName,
    wpml,
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
    activeCells,
    refAzimuth,
    baseDistance,
    undoEdit,
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
    handleAnchorDrag,
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
    basePoint,
    speed,
    spacing,
    batteryMin,
    passes: params.crosshatch ? (params.includeNadir ? 3 : 2) : 1,
    onImportedMission,
    t,
  })

  /* ------------------------------ Terreno ----------------------------- */
  const {
    terrain,
    terrainFollow,
    setTerrainFollow,
    handleLoadTerrain,
    handleImportDem,
    terrainCovers,
    slopeHint,
  } = useTerrain({ ring, ringBbox, ringValid: validation.valid })

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
    canExportKML,
    canExportKMZ,
    handleExportKML,
    handleExportGcps,
    handleExportKMZ,
  } = useAreaMission({
    ring,
    validation,
    activeCells,
    basePoint,
    params,
    spacing,
    interval,
    speed,
    batteryMin,
    split,
    sensor,
    wpml,
    missionName,
    terrain,
    terrainFollow,
    terrainCovers,
    runExport,
    t,
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
    dsmLoaded,
    faceClearance,
    facePreview,
    handleExportFace,
  } = useFaceMission({
    sensor,
    terrain,
    missionMode,
    missionName,
    wpml,
    setMode,
    setDraftVertices,
    runExport,
  })

  const handleMapClick = useCallback(
    (lonlat) => {
      if (handleAreaClick(lonlat)) return
      if (mode === 'base') {
        setBasePoint(lonlat)
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
    [mode, handleAreaClick, addInspectPoint, setOrbitConfig],
  )

  /* ---------------------- Interacções comuns -------------------------- */
  const changeMissionMode = useCallback((m) => {
    setMissionMode(m)
    setMode('idle')
    setDraftVertices([])
  }, [])

  // o duplo clique no mapa conclui o desenho activo (área, baseline ou eixo)
  const handleFinishAny = useCallback(() => {
    if (mode === 'face') handleFinishFace()
    else if (mode === 'corridor') handleFinishCorridor()
    else handleFinishDraw()
  }, [mode, handleFinishFace, handleFinishCorridor, handleFinishDraw])

  const removeDraftVertex = useCallback((index) => {
    setDraftVertices((d) => d.filter((_, i) => i !== index))
  }, [])

  const removeLastDraftVertex = useCallback(() => {
    setDraftVertices((d) => d.slice(0, -1))
  }, [])

  // Teclado no modo de desenho: Backspace/Delete anula o último ponto,
  // Escape cancela o desenho (ignorado quando o foco está num input)
  useEffect(() => {
    if (mode !== 'draw' && mode !== 'face') return
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'Backspace' || e.key === 'Delete') {
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

  const handleBaseDrag = useCallback((lonlat) => {
    setBasePoint(lonlat)
  }, [])

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
        ],
        { batteryMin, reservePct: split.reservePct },
      ),
    [planOk, facePlan, orbitPlan, corridorPlan, batteryMin, split.reservePct],
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
    if (missionMode === 'corridor') {
      if (!corridorPlan || corridorPlan.error) return null
      const head = corridorConfig.centreline?.[0]
      const ground = head ? elevAt?.(head[0], head[1]) : null
      return {
        waypoints: corridorPlan.waypoints.map(([lon, lat, h]) => [lon, lat, h ?? params.altitude]),
        refElev: Number.isFinite(ground) ? ground : 0,
      }
    }
    if (!planOk) return null
    const wps =
      terrainResult && !terrainResult.error
        ? terrainResult.waypoints
        : planOk.waypoints.map(([lon, lat]) => [lon, lat, params.altitude])
    const ref =
      terrainResult && !terrainResult.error
        ? terrainResult.refElev
        : (elevAt?.((basePoint ?? planOk.waypoints[0])[0], (basePoint ?? planOk.waypoints[0])[1]) ??
          0)
    return { waypoints: wps, refElev: ref }
  }, [
    missionMode,
    facePlan,
    faceConfig.baseline,
    orbitPlan,
    orbitConfig.poi,
    corridorPlan,
    corridorConfig.centreline,
    planOk,
    terrainResult,
    terrain,
    basePoint,
    params.altitude,
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

  /* ----------------------------- Preflight ---------------------------- */
  // Uma só lista, calculada a partir do mesmo estado que a exportação usa
  // (src/mission/preflight.js). Os bloqueios desactivam o botão do KMZ.
  const preflight = useMemo(() => {
    if (missionMode === 'area') {
      return preflightArea({
        plan,
        blocks,
        photoMode,
        terrainFollow,
        terrainCovers,
        terrainResult,
        basePoint,
        baseDistance,
        speed,
        batteryMin,
        reservePct: split.reservePct,
        aglWarn,
        triggerWarn,
        terrainDatum: terrain.data?.verticalDatum ?? null,
      })
    }
    const other = { batteryMin, reservePct: split.reservePct }
    if (missionMode === 'corridor')
      return preflightPlan({
        ...other,
        plan: corridorPlan,
        aglWarn,
        triggerWarn: corridorTriggerWarn,
      })
    if (missionMode === 'face') return preflightPlan({ ...other, plan: facePlan })
    return preflightPlan({ ...other, plan: orbitPlan })
  }, [
    missionMode,
    plan,
    blocks,
    photoMode,
    terrainFollow,
    terrainCovers,
    terrainResult,
    basePoint,
    baseDistance,
    speed,
    batteryMin,
    split.reservePct,
    aglWarn,
    triggerWarn,
    corridorPlan,
    corridorTriggerWarn,
    facePlan,
    orbitPlan,
    terrain.data,
  ])
  const exportBlocked = hasBlockers(preflight)

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
        }))
      }
      // projectos antigos guardavam uma duração de bateria única dentro de
      // split — preserva o comportamento exacto como override da combinação
      if (n.legacyBatteryMin != null && n.drone) {
        setBatteryByCombo((m) => ({
          ...m,
          [`${n.drone.aircraftId}:${n.drone.payloadId}`]: n.legacyBatteryMin,
        }))
      }
      if (n.batteryByCombo) setBatteryByCombo((m) => ({ ...m, ...n.batteryByCombo }))
      if (n.missionMode) setMissionMode(n.missionMode)
      if (n.faceConfig) setFaceConfig(n.faceConfig)
      if (n.orbitConfig) setOrbitConfig(n.orbitConfig)
      if (n.corridorConfig) setCorridorConfig(n.corridorConfig)
      if (n.inspectPoints) {
        setInspectPoints(n.inspectPoints)
        inspectSeqRef.current = n.nextInspectId
      }
      applyProjectGeometry(n) // split, anchor, ring, origem e células desactivadas
      setBasePoint(n.basePoint)
      if (n.terrainFollow) setTerrainFollow((t) => ({ ...t, ...n.terrainFollow }))
      if (n.gcpConfig) setGcpConfig((g) => ({ ...g, ...n.gcpConfig }))
    },
    [
      setCorridorConfig,
      setOrbitConfig,
      setFaceConfig,
      setInspectPoints,
      inspectSeqRef,
      setTerrainFollow,
      applyProjectGeometry,
      setGcpConfig,
    ],
  )

  // tudo o que o projecto guarda, num só objecto (autosave e ficheiro)
  const projectState = useMemo(
    () => ({
      missionName,
      drone,
      custom,
      payloadTuning,
      batteryByCombo,
      inspectPoints,
      missionMode,
      faceConfig,
      corridorConfig,
      orbitConfig,
      params,
      split,
      anchor,
      ring,
      areaOrigin,
      basePoint,
      disabledTiles,
      terrainFollow,
      gcpConfig,
    }),
    [
      missionName,
      drone,
      custom,
      payloadTuning,
      batteryByCombo,
      inspectPoints,
      missionMode,
      faceConfig,
      corridorConfig,
      orbitConfig,
      params,
      split,
      anchor,
      ring,
      areaOrigin,
      basePoint,
      disabledTiles,
      terrainFollow,
      gcpConfig,
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

  const removeBase = useCallback(() => {
    setBasePoint(null)
    setMode((m) => (m === 'base' ? 'idle' : m))
  }, [])

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
        plannedGcps={gcps ?? []}
        onBack={() => setView('planner')}
      />
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <IconDrone className="h-7 w-7 text-sky-400" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              DJI Mission Planner{' '}
              <span className="text-[11px] font-normal text-slate-500">
                v{import.meta.env.APP_VERSION}
              </span>
            </h1>
            <p className="text-[11px] text-slate-500">{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCube /> {t('app.view3d')}
          </button>
          <button
            onClick={() => setShowReport(true)}
            disabled={!planOk}
            title={t('app.reportTitle')}
            className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('app.report')}
          </button>
          <button
            onClick={() => setView('checklist')}
            title={t('app.checklistTitle')}
            className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-amber-500 hover:text-amber-300"
          >
            <IconCheck /> {t('app.checklist')}
          </button>
          <button
            onClick={handleExportKML}
            disabled={!canExportKML}
            title={t('app.exportKmlTitle')}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('app.exportKml')}
          </button>
          <PreflightPill
            items={preflight}
            open={showPreflight}
            onToggle={() => setShowPreflight((v) => !v)}
          />
          <button
            onClick={handleExportKMZ}
            disabled={!canExportKMZ || exportBlocked}
            title={t('app.exportWpmlTitle')}
            className="flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('app.exportWpml')}
          </button>

          {/* ajuda e língua encostados à direita */}
          <div className="ml-3 flex items-center gap-2 border-l border-slate-800 pl-3">
            <button
              onClick={() => setShowHelp(true)}
              title={t('app.helpTitle')}
              className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
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

      {showPreflight && <PreflightList items={preflight} />}

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
                onExport={handleExportFace}
              />
            )}
            {missionMode === 'orbit' && (
              <OrbitPanel
                orbitConfig={orbitConfig}
                setOrbitParam={setOrbitParam}
                orbitPlan={orbitPlan}
                cameraOk={sensor.type === 'camera'}
                gsdAtRadius={gsdAtRadius}
                onGsdTarget={setRadiusFromGsd}
                mode={mode}
                onStartPoi={startOrbitPoi}
                onClearPoi={clearOrbitPoi}
                onExportSingle={handleExportOrbitSingle}
                onExportPerLevel={handleExportOrbitPerLevel}
              />
            )}
            {missionMode === 'corridor' && (
              <CorridorPanel
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
                onExport={handleExportCorridor}
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
                hasBase={Boolean(basePoint)}
                refAzimuth={refAzimuth}
                split={split}
                setSplitParam={setSplitParam}
                batteryMin={batteryMin}
                batteryDefault={aircraft.batteryMin}
                onBatteryMin={setBatteryMin}
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
                onExportInspection={handleExportInspection}
                onUndoVertex={removeLastDraftVertex}
                onStartDraw={startDraw}
                onStartAnchor={startAnchor}
                onStartBase={startBase}
                onRemoveBase={removeBase}
                onSetAngleRelative={setAngleRelative}
                onSetAngleOptimal={setAngleOptimal}
                onFinishDraw={handleFinishDraw}
                onClear={clearAll}
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
            valid={validation.valid}
            kinks={validation.kinks}
            anchorCenter={anchor.center}
            basePoint={basePoint}
            plan={planOk}
            blocks={blocks}
            gridCells={gridCells}
            tiles={tiles}
            disabledTiles={disabledTiles}
            onTileToggle={toggleTile}
            gcps={gcps}
            inspectPoints={inspectPoints}
            onInspectDrag={handleInspectDrag}
            facePreview={facePreview}
            corridorPreview={corridorPreview}
            orbitPreview={orbitPreview}
            onOrbitPoiDrag={handleOrbitPoiDrag}
            fitKey={fitKey}
            editable={!gridCells && split.mode !== 'tiles' && split.mode !== 'battery'}
            onMapClick={handleMapClick}
            onVertexDrag={handleVertexDrag}
            onVertexInsert={handleVertexInsert}
            onVertexDelete={handleVertexDelete}
            onDraftVertexRemove={removeDraftVertex}
            onAnchorDrag={handleAnchorDrag}
            onBaseDrag={handleBaseDrag}
            onFinishDraw={handleFinishAny}
          />
          <StatsPanel
            gsd={gsd}
            gimbalPitch={gsdPitch}
            footprint={footprint}
            spacing={spacing}
            pointDensity={pointDensity}
            interval={interval}
            triggerMode={params.triggerMode}
            speed={speed}
            stats={planOk?.stats ?? null}
            baseDistance={baseDistance}
            blockCount={blocks?.length ?? null}
          />
        </main>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showProfile && terrain.status === 'ready' && planOk && (
        <Suspense fallback={null}>
          <ElevationProfile
            terrain={terrain.data}
            waypoints={
              terrainResult && !terrainResult.error
                ? terrainResult.waypoints
                : planOk.waypoints.map(([lon, lat]) => [lon, lat, params.altitude])
            }
            refElev={
              terrainResult && !terrainResult.error
                ? terrainResult.refElev
                : (terrain.data.elevationAt(
                    (basePoint ?? planOk.waypoints[0])[0],
                    (basePoint ?? planOk.waypoints[0])[1],
                  ) ?? 0)
            }
            blocks={
              terrainResult && !terrainResult.error && terrainResult.blocks3
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
            basePoint={basePoint}
            gcps={gcps}
            lines={planOk.lines}
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
            ring={missionMode === 'area' ? ring : null}
            waypoints={view3d.waypoints}
            refElev={view3d.refElev}
            basePoint={basePoint}
            gcps={missionMode === 'area' ? gcps : null}
            onClose={() => setShow3d(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
