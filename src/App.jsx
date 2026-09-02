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
  distanceToArea,
  findOptimalDirection,
  gridFromAnchor,
  lidarPointDensity,
  lineSpacing,
  longestEdgeBearing,
  photoInterval,
  rectangleFromAnchor,
  resolveSensor,
  squareSideForBattery,
  tilePolygonWithSquares,
  validateRing,
} from './utils/geo.js'
import {
  downloadBlob,
  MissionExportError,
  exportBlocksZip,
  exportSimpleKML,
  exportWPMLKmz,
} from './utils/exporters.js'
import {
  parseAreaFile,
  reprojectRing,
  simplifyRingIfNeeded,
  CRS_OPTIONS,
} from './utils/importArea.js'
import { fitSlopePlane, loadTerrain } from './utils/terrain.js'
import { planTerrainFollow } from './mission/terrainFollow.js'
import { buildAreaExport } from './mission/areaExport.js'
import { faceExportParams, inspectionExportParams } from './mission/exportParams.js'
import { planBlocks } from './mission/blocks.js'
import { useCorridorMission } from './hooks/useCorridorMission.js'
import { useOrbitMission } from './hooks/useOrbitMission.js'
import { planArea } from './mission/areaPlan.js'
import { PROJECT_STORAGE_KEY, normalizeProject, projectFileName, serializeProject } from './mission/project.js'
import { nearestNeighbourOrder, reorderList } from './utils/inspect.js'
import {
  DEFAULT_FACE_CONFIG,
  checkFaceClearance,
  generateFacePlan,
} from './utils/faceMode.js'
import { headingTicks } from './utils/preview.js'
import {
} from './utils/corridor.js'
import { loadDemFromFile } from './utils/demFile.js'
import { parseWpmlKmz } from './utils/importWpml.js'
import { buildGcpKML, gcpStats, planGcps, suggestedGcpCount } from './utils/gcp.js'
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
  const [lang, setLang] = useState(
    () => localStorage.getItem('dji-mission-planner:lang') ?? 'pt',
  )
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
  const [params, setParams] = useState({
    altitude: 100,
    speed: 10,
    frontOverlap: 80,
    sideOverlap: 70,
    angle: 90,
    bufferPct: 0,
    triggerMode: 'distance',
    spacingMode: 'auto', // 'auto' (sobreposição) | 'manual' (distância em m)
    manualSpacing: 50,
    crosshatch: false, // dupla grelha perpendicular (3D)
    includeNadir: false, // passagem nadir extra no fim do crosshatch — R2.10
    gimbalPitch: -90, // inclinação da câmara: -90 nadir · -60/-45 oblíqua
    overshoot: 0, // prolongamento de cada faixa nos dois extremos (m) — T2.2
    tieLine: false, // fiada de amarração perpendicular no fim — T2.3
  })
  const [mode, setMode] = useState('idle') // 'idle' | 'draw' | 'anchor' | 'base' | 'inspect' | 'face'
  // tipo de missão activo (E1.0, modelo A): troca a ferramenta e o painel
  const [missionMode, setMissionMode] = useState('area') // 'area' | 'face' | 'orbit' | 'corridor'
  const [faceConfig, setFaceConfig] = useState(() => ({ ...DEFAULT_FACE_CONFIG }))
  // pontos de inspeção (R2.9): waypoints avulsos com rumo/pitch/foto próprios
  const [inspectPoints, setInspectPoints] = useState([])
  const inspectSeqRef = useRef(1)
  const [draftVertices, setDraftVertices] = useState([])
  const [ring, setRing] = useState(null) // anel aberto [[lon,lat], ...]
  const [areaOrigin, setAreaOrigin] = useState(null) // 'draw' | 'anchor' | null
  const [basePoint, setBasePoint] = useState(null) // base do operador [lon,lat]
  const [anchor, setAnchor] = useState({
    center: null,
    length: 500,
    width: 300,
    orientation: 90,
    shape: 'rect', // 'rect' | 'square'
    cols: 1, // grelha de blocos: colunas ao longo da orientação
    rows: 1, // grelha de blocos: linhas perpendiculares
  })
  const [gridCells, setGridCells] = useState(null) // anéis das células da grelha
  const [split, setSplit] = useState({
    mode: 'none', // 'none' | 'area' | 'battery' | 'tiles'
    maxAreaHa: 20,
    reservePct: 30, // regressar à base com 30% de bateria
    maxSide: 500, // teto do lado do bloco por bateria (conforto VLOS)
    tileSize: 250, // lado dos quadrados do mosaico (m)
    tileOrientation: 0, // azimute da malha do mosaico
  })
  const [disabledTiles, setDisabledTiles] = useState(() => new Set())
  const [importState, setImportState] = useState(null) // {ring, filename} à espera de CRS
  const [importError, setImportError] = useState(null)
  // aviso brando da importação (ex.: MultiPolygon com partes ignoradas)
  const [importWarning, setImportWarning] = useState(null)
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
  const [terrain, setTerrain] = useState({ status: 'idle', data: null, error: null })
  const [terrainFollow, setTerrainFollow] = useState({ enabled: false, tolerance: 5 })
  const [gcpConfig, setGcpConfig] = useState({ enabled: false, count: null }) // null = auto
  const [showHelp, setShowHelp] = useState(false)
  const [show3d, setShow3d] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [fitKey, setFitKey] = useState(0) // sinal para enquadrar o mapa na área
  // Histórico de edição unificado (Ctrl+Z): geometria da área + seleção de células
  const editHistoryRef = useRef([])
  const ringSnapshotRef = useRef(null)
  const tilesSnapshotRef = useRef(new Set())
  const skipTileResetRef = useRef(false)
  const hydratedRef = useRef(false)

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

  const setAnchorParam = useCallback((key, value) => {
    setAnchor((a) => {
      // no modo quadrado, o lado único controla comprimento e largura
      if (a.shape === 'square' && (key === 'length' || key === 'width')) {
        return { ...a, length: value, width: value }
      }
      return { ...a, [key]: value }
    })
  }, [])

  const setSplitParam = useCallback((key, value) => {
    setSplit((s) => ({ ...s, [key]: value }))
  }, [])

  /* ------- Modo âncora → retângulo perfeito ou grelha de células ------- */
  // O anel é estado com várias origens — desenho no mapa, importação de
  // ficheiro, âncora. Derivá-lo do render exigiria uma só fonte de verdade
  // para a área, o que é uma reestruturação do componente e não um acerto
  // local; fica registado em vez de forçado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (anchor.center && anchor.length > 0 && anchor.width > 0) {
      const cols = Math.max(1, Math.round(anchor.cols))
      const rows = Math.max(1, Math.round(anchor.rows))
      if (cols * rows > 1) {
        const grid = gridFromAnchor(
          anchor.center, anchor.length, anchor.width, anchor.orientation, cols, rows,
        )
        setRing(grid.outline)
        setGridCells(grid.cells)
      } else {
        setRing(
          rectangleFromAnchor(anchor.center, anchor.length, anchor.width, anchor.orientation),
        )
        setGridCells(null)
      }
      setAreaOrigin('anchor')
    }
  }, [anchor])
  /* eslint-enable react-hooks/set-state-in-effect */

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
    () =>
      payload.type === 'lidar' && effectiveFov
        ? { ...payload, effectiveFov }
        : payload,
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
  const gsdPitch =
    params.crosshatch && params.includeNadir ? -90 : params.gimbalPitch
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
    corridorConfig, setCorridorConfig, setCorridorParam, corridorSpeed, corridorTriggerWarn,
    corridorPlan, corridorPreview, startCorridorDraw, handleFinishCorridor, clearCorridorAxis,
    handleExportCorridor,
  } = useCorridorMission({
    sensor, speedRange, altitude: params.altitude, sideOverlap: params.sideOverlap, interval, missionMode,
    missionName, wpml, setMode, setDraftVertices, runExport, avisoObturador,
  })

  /* ------------------------ Modo órbita (E1.2) ------------------------ */
  const {
    orbitConfig, setOrbitConfig, setOrbitParam, startOrbitPoi, clearOrbitPoi, handleOrbitPoiDrag,
    orbitPlan, gsdAtRadius, setRadiusFromGsd, orbitPreview, handleExportOrbitSingle, handleExportOrbitPerLevel,
  } = useOrbitMission({ sensor, missionMode, missionName, wpml, setMode, runExport })

  const validation = useMemo(
    () => (ring ? validateRing(ring) : { valid: false, kinks: [] }),
    [ring],
  )

  // Mosaico de quadrados: manual ('tiles') ou dimensionado pela bateria
  // ('battery' — lado calculado a partir do tempo útil e do teto VLOS)
  const tilesResult = useMemo(() => {
    if (!ring || !validation.valid || gridCells) return null
    if (split.mode !== 'tiles' && split.mode !== 'battery') return null
    let side = split.tileSize
    if (split.mode === 'battery') {
      const dist = basePoint ? distanceToArea(basePoint, ring) : null
      const transitS = dist != null ? (2 * dist) / (speed || 10) : 0
      side = squareSideForBattery({
        batteryMin,
        reservePct: split.reservePct,
        speed: speed,
        spacingM: spacing,
        transitS,
        maxSideM: split.maxSide,
        passes: params.crosshatch ? (params.includeNadir ? 3 : 2) : 1,
      })
    }
    return { cells: tilePolygonWithSquares(ring, side, split.tileOrientation), side }
  }, [
    ring,
    validation.valid,
    gridCells,
    split.mode,
    split.tileSize,
    split.tileOrientation,
    batteryMin,
    split.reservePct,
    split.maxSide,
    speed,
    spacing,
    basePoint,
    // O lado do quadrado dimensionado por bateria depende do número de
    // passagens (cross-hatch e passagem nadir extra multiplicam o voo por
    // célula). Sem estas duas dependências o lado ficava preso ao valor
    // anterior ao ligar/desligar o cross-hatch, e a célula podia exceder o
    // que uma bateria voa.
    params.crosshatch,
    params.includeNadir,
  ])

  const tiles = Array.isArray(tilesResult?.cells) ? tilesResult.cells : null
  const tilesError = tilesResult?.cells?.error ?? null
  const tileSide = tilesResult?.side ?? null

  // espelhos do estado atual, para os snapshots do histórico
  useEffect(() => {
    ringSnapshotRef.current = ring
  }, [ring])
  useEffect(() => {
    tilesSnapshotRef.current = disabledTiles
  }, [disabledTiles])

  const pushHistory = useCallback(() => {
    editHistoryRef.current.push({
      ring: ringSnapshotRef.current,
      tiles: new Set(tilesSnapshotRef.current),
    })
    if (editHistoryRef.current.length > 100) editHistoryRef.current.shift()
  }, [])

  const undoEdit = useCallback(() => {
    const prev = editHistoryRef.current.pop()
    if (!prev) return
    skipTileResetRef.current = true
    setRing(prev.ring)
    setDisabledTiles(new Set(prev.tiles))
  }, [])

  // regenerar o mosaico limpa a seleção de células desativadas
  useEffect(() => {
    if (skipTileResetRef.current) {
      skipTileResetRef.current = false
      return
    }
    setDisabledTiles(new Set())
  }, [ring, split.mode, tileSide, split.tileOrientation])

  const toggleTile = useCallback(
    (index) => {
      pushHistory()
      setDisabledTiles((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
    },
    [pushHistory],
  )

  const restoreAllTiles = useCallback(() => {
    pushHistory()
    setDisabledTiles(new Set())
  }, [pushHistory])

  // Ctrl+Z desfaz a última edição (vértices, área ou células)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (editHistoryRef.current.length > 0) {
        e.preventDefault()
        undoEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoEdit])

  // Células ativas: grelha da âncora, ou mosaico sem as células removidas
  const activeCells = useMemo(() => {
    if (gridCells) return gridCells
    if (tiles) {
      const kept = tiles.filter((_, i) => !disabledTiles.has(i))
      return kept.length > 0 ? kept : null
    }
    return null
  }, [gridCells, tiles, disabledTiles])

  // B: disparo por waypoint só com câmara e intervalo válido; com LiDAR ou
  // sem óptica o plano fica no modo distância (e a opção não aparece)
  const photoMode =
    sensor.type === 'camera' && params.triggerMode === 'waypoint' && interval > 0
      ? 'waypoint'
      : 'distance'

  const plan = useMemo(() => {
    if (!ring || !validation.valid) return null
    const opts = {
      spacingM: spacing,
      angleDeg: params.angle,
      bufferPct: params.bufferPct,
      photoIntervalM: interval ?? 0,
      speed: speed,
      crosshatch: params.crosshatch,
      includeNadir: Boolean(params.crosshatch && params.includeNadir),
      overshootM: Math.max(0, params.overshoot || 0),
      tieLine: Boolean(params.tieLine),
      photoMode,
    }
    // plano simples, ou um plano por célula com alinhamento global (src/mission/areaPlan.js)
    return planArea(ring, activeCells, opts)
  }, [photoMode, ring, validation.valid, spacing, params.angle, params.bufferPct, interval, speed, params.crosshatch, params.includeNadir, params.overshoot, params.tieLine, activeCells])

  const planOk = plan && !plan.error ? plan : null

  // Direção de referência: orientação do bloco (âncora) ou aresta mais longa
  const refAzimuth = useMemo(() => {
    if (!ring) return null
    if (areaOrigin === 'anchor') return ((anchor.orientation % 180) + 180) % 180
    return longestEdgeBearing(ring)
  }, [ring, areaOrigin, anchor.orientation])

  const baseDistance = useMemo(
    () => (basePoint && ring ? distanceToArea(basePoint, ring) : null),
    [basePoint, ring],
  )

  // Divisão em blocos de voo numerados: células da grelha, ou corte da
  // serpentina por área/bateria
  const blocks = useMemo(
    () => planBlocks(planOk, { activeCells, split, batteryMin, speed, spacingM: spacing, basePoint }),
    [planOk, activeCells, split, batteryMin, speed, spacing, basePoint],
  )

  // B: aviso brando — missões com milhares de waypoints importam lentamente
  // no Pilot 2; o limite duro do WPML (65535 índices) fica longe
  const waypointWarn = useMemo(() => {
    if (photoMode !== 'waypoint' || !planOk) return null
    const n = blocks?.length
      ? Math.max(...blocks.map((b) => b.waypoints.length))
      : planOk.waypoints.length
    return n > 2000 ? n : null
  }, [photoMode, planOk, blocks])

  /* --------------------------- Interações ---------------------------- */
  const handleMapClick = useCallback(
    (lonlat) => {
      if (mode === 'draw') {
        setDraftVertices((d) => [...d, lonlat])
      } else if (mode === 'anchor') {
        setAnchor((a) => ({ ...a, center: lonlat }))
      } else if (mode === 'base') {
        setBasePoint(lonlat)
        setMode('idle')
      } else if (mode === 'face' || mode === 'corridor') {
        setDraftVertices((d) => [...d, lonlat])
      } else if (mode === 'orbit') {
        setOrbitConfig((c) => ({ ...c, poi: lonlat }))
        setMode('idle')
      } else if (mode === 'inspect') {
        const n = inspectSeqRef.current++
        setInspectPoints((pts) => [
          ...pts,
          {
            id: n,
            label: `P${String(n).padStart(2, '0')}`,
            point: lonlat,
            heightM: params.altitude,
            heading: null, // null = segue a rota (followWayline)
            gimbalPitch: null, // null = mantém o pitch em vigor
            photo: true,
          },
        ])
      }
    },
    [mode, params.altitude, setOrbitConfig],
  )

  /* ----------------------- Modo fachada (E1.1) ------------------------ */
  const changeMissionMode = useCallback((m) => {
    setMissionMode(m)
    setMode('idle')
    setDraftVertices([])
  }, [])

  const setFaceParam = useCallback((key, value) => {
    setFaceConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startFaceDraw = useCallback(() => {
    setMode((m) => (m === 'face' ? 'idle' : 'face'))
    setDraftVertices([])
  }, [])

  const handleFinishFace = useCallback(() => {
    setDraftVertices((draft) => {
      const EPS = 1e-6
      const clean = draft.filter(
        (v, i) =>
          i === 0 ||
          Math.abs(v[0] - draft[i - 1][0]) > EPS ||
          Math.abs(v[1] - draft[i - 1][1]) > EPS,
      )
      if (clean.length >= 2) {
        setFaceConfig((c) => ({ ...c, baseline: clean }))
        setMode('idle')
        return []
      }
      return draft
    })
  }, [])

  /* ---------------------- Modo corredor (E5.1) ----------------------- */
  const clearFaceBaseline = useCallback(() => {
    setFaceConfig((c) => ({ ...c, baseline: null }))
    setDraftVertices([])
    setMode('idle')
  }, [])

  const facePlan = useMemo(() => {
    if (!faceConfig.baseline || sensor.type !== 'camera') return null
    return generateFacePlan(faceConfig.baseline, {
      sensor,
      faceHeightM: faceConfig.heightM,
      standoffM: faceConfig.standoffM,
      side: faceConfig.side,
      verticalOverlapPct: faceConfig.verticalOverlapPct,
      horizontalOverlapPct: faceConfig.horizontalOverlapPct,
      gimbalPitch: faceConfig.gimbalPitch,
      // P1: a velocidade é um parâmetro explícito da fachada — o tempo
      // estimado usa exactamente o valor que a exportação escreve
      speed: faceConfig.speedMS,
    })
  }, [faceConfig, sensor])

  // folga só contra DSM LOCAL; com Terrarium fica "standoff não verificado"
  const dsmLoaded = terrain.status === 'ready' && terrain.data?.source === 'file'
  const faceClearance = useMemo(() => {
    if (!facePlan || facePlan.error || !dsmLoaded) return null
    return checkFaceClearance(facePlan, terrain.data.elevationAt, {
      minClearanceM: faceConfig.minClearanceM,
    })
  }, [facePlan, dsmLoaded, terrain.data, faceConfig.minClearanceM])

  const facePreview = useMemo(() => {
    if (missionMode !== 'face') return null
    const ok = facePlan && !facePlan.error ? facePlan : null
    return {
      baseline: faceConfig.baseline,
      offsetLine: ok?.offsetLine ?? null,
      ticks: ok
        ? headingTicks(ok.waypoints, ok.perWaypoint, {
            lengthM: Math.min(12, faceConfig.standoffM * 0.4),
            limit: ok.stats.pointsPerPass,
          })
        : null,
    }
  }, [missionMode, facePlan, faceConfig.baseline, faceConfig.standoffM])

  const handleExportFace = useCallback(() => {
    if (!facePlan || facePlan.error) return
    runExport(() => exportWPMLKmz(faceExportParams({
      missionName, plan: facePlan, speed: faceConfig.speedMS, wpml, gimbalPitch: faceConfig.gimbalPitch, sensorType: sensor.type,
    })))
  }, [facePlan, missionName, faceConfig.speedMS, wpml, faceConfig.gimbalPitch, sensor.type, runExport])

  /* --------------------- Pontos de inspeção (R2.9) -------------------- */
  const startInspect = useCallback(() => {
    setMode((m) => (m === 'inspect' ? 'idle' : 'inspect'))
  }, [])

  const updateInspectPoint = useCallback((id, patch) => {
    setInspectPoints((pts) => pts.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const removeInspectPoint = useCallback((id) => {
    setInspectPoints((pts) => pts.filter((p) => p.id !== id))
  }, [])

  const moveInspectPoint = useCallback((id, dir) => {
    setInspectPoints((pts) => {
      const i = pts.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= pts.length) return pts
      const next = pts.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])

  const reorderInspectPoints = useCallback((from, to) => {
    setInspectPoints((pts) => reorderList(pts, from, to))
  }, [])

  const suggestInspectOrder = useCallback(() => {
    setInspectPoints((pts) => nearestNeighbourOrder(pts, basePoint ?? null))
  }, [basePoint])

  const handleInspectDrag = useCallback((id, lonlat) => {
    setInspectPoints((pts) => pts.map((p) => (p.id === id ? { ...p, point: lonlat } : p)))
  }, [])

  const handleFinishDraw = useCallback(() => {
    setDraftVertices((draft) => {
      // remove vértices quase-duplicados consecutivos (ex.: 2.º clique do
      // duplo-clique, com tolerância para o jitter de ~1 píxel)
      const EPS = 1e-6
      const clean = draft.filter(
        (v, i) =>
          i === 0 ||
          Math.abs(v[0] - draft[i - 1][0]) > EPS ||
          Math.abs(v[1] - draft[i - 1][1]) > EPS,
      )
      if (clean.length >= 3) {
        pushHistory()
        setRing(clean)
        setAreaOrigin('draw')
        setMode('idle')
        return []
      }
      return draft
    })
  }, [pushHistory])

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

  const handleVertexDrag = useCallback(
    (index, lonlat) => {
      pushHistory()
      setRing((r) => (r ? r.map((v, i) => (i === index ? lonlat : v)) : r))
    },
    [pushHistory],
  )

  const handleVertexInsert = useCallback(
    (index, lonlat) => {
      pushHistory()
      setRing((r) => {
        if (!r) return r
        const next = [...r]
        next.splice(index, 0, lonlat)
        return next
      })
      setAreaOrigin('draw') // deixou de ser um retângulo perfeito
    },
    [pushHistory],
  )

  const handleVertexDelete = useCallback(
    (index) => {
      pushHistory()
      setRing((r) => (r && r.length > 3 ? r.filter((_, i) => i !== index) : r))
    },
    [pushHistory],
  )

  const handleAnchorDrag = useCallback((lonlat) => {
    setAnchor((a) => ({ ...a, center: lonlat }))
  }, [])

  const handleBaseDrag = useCallback((lonlat) => {
    setBasePoint(lonlat)
  }, [])

  /* ------------------------- Terreno (DEM) --------------------------- */
  const ringBbox = useMemo(() => {
    if (!ring) return null
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    ring.forEach(([x, y]) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    return [minX, minY, maxX, maxY]
  }, [ring])

  const handleLoadTerrain = useCallback(async () => {
    if (!ringBbox) return
    setTerrain({ status: 'loading', data: null, error: null })
    try {
      const m = 0.01 // ~1 km de margem para incluir a base
      const bbox = [ringBbox[0] - m, ringBbox[1] - m, ringBbox[2] + m, ringBbox[3] + m]
      const data = await loadTerrain(bbox)
      setTerrain({ status: 'ready', data, error: null })
    } catch (err) {
      setTerrain({ status: 'error', data: null, error: err?.message ?? 'Falha no terreno' })
    }
  }, [ringBbox])

  // Importar um MDT GeoTIFF local (ex.: LiDAR DGT 50 cm/2 m) como fonte
  const handleImportDem = useCallback(
    async (file) => {
      if (!file || !ringBbox) return
      setTerrain({ status: 'loading', data: null, error: null })
      try {
        const data = await loadDemFromFile(file, ringBbox)
        setTerrain({ status: 'ready', data, error: null })
      } catch (err) {
        setTerrain({ status: 'error', data: null, error: err?.message ?? 'Falha ao ler o MDT' })
      }
    },
    [ringBbox],
  )

  // a área ainda está coberta pelo terreno carregado?
  const terrainCovers = useMemo(() => {
    if (terrain.status !== 'ready' || !ringBbox || !terrain.data?.bbox) return false
    const [a, b, c, d] = terrain.data.bbox
    return ringBbox[0] >= a && ringBbox[1] >= b && ringBbox[2] <= c && ringBbox[3] <= d
  }, [terrain, ringBbox])

  // Descarga automática do relevo global quando a área fica definida:
  // com debounce (não dispara enquanto se arrastam vértices), sem nunca
  // substituir um MDT local importado, e sem repetir sozinha após um erro
  // na mesma área (o botão manual fica como recurso).
  const autoTerrainTriedRef = useRef(null)
  useEffect(() => {
    if (!ring || !validation.valid || !ringBbox) return
    if (terrain.status === 'loading') return
    if (terrain.data?.source === 'file') return
    if (terrain.status === 'ready' && terrainCovers) return
    const key = ringBbox.map((v) => v.toFixed(3)).join(',')
    if (terrain.status === 'error' && autoTerrainTriedRef.current === key) return
    const timer = setTimeout(() => {
      autoTerrainTriedRef.current = key
      handleLoadTerrain()
    }, 1500)
    return () => clearTimeout(timer)
  }, [ring, validation.valid, ringBbox, terrain, terrainCovers, handleLoadTerrain])

  /* ------------------------------ GCPs -------------------------------- */
  const gcpAutoCount = useMemo(() => {
    const areaHa = planOk?.stats?.areaHa
    return areaHa ? suggestedGcpCount(areaHa) : 5
  }, [planOk])

  const gcps = useMemo(() => {
    if (!gcpConfig.enabled || !ring || !validation.valid) return null
    try {
      return planGcps(ring, gcpConfig.count ?? gcpAutoCount)
    } catch {
      return null
    }
  }, [gcpConfig, ring, validation.valid, gcpAutoCount])

  const gcpInfo = useMemo(
    () => (gcps && gcps.length > 0 ? gcpStats(ring, gcps) : null),
    [gcps, ring],
  )

  /* ------------- Terrain follow: alturas por waypoint ----------------- */
  const terrainResult = useMemo(() => {
    // B: com foto por waypoint, a densificação do seguimento de terreno
    // reindexaria as acções de foto — erro explícito (e exportação bloqueada)
    // em vez de uma missão parcial com alturas planas ou fotos perdidas
    if (terrainFollow.enabled && photoMode === 'waypoint') return { error: t('cp.terrain.photoWaypoint') }
    if (!terrainFollow.enabled || !terrainCovers || !planOk?.lines?.length) return null
    try {
      const res = planTerrainFollow(terrain.data, planOk, {
        blocks,
        refPt: basePoint ?? planOk.waypoints[0],
        agl: params.altitude,
        toleranceM: terrainFollow.tolerance,
      })
      if (res.error === 'ref-outside-terrain') return { error: 'Referência fora do terreno carregado' }
      return res
    } catch (err) {
      return { error: err?.message ?? 'Falha no cálculo do terreno' }
    }
  }, [photoMode, t, terrainFollow, terrainCovers, terrain.data, planOk, blocks, basePoint, params.altitude])

  // Sugestões para encostas íngremes (T4.5): plano médio do terreno na área
  // → linhas ao longo das curvas de nível e gimbal ≈ −(90 − inclinação).
  // Só sugestões; nada é aplicado automaticamente.
  const slopeHint = useMemo(() => {
    if (terrain.status !== 'ready' || !terrainCovers || !ring || !validation.valid) return null
    const fit = fitSlopePlane(terrain.data, ring)
    if (!fit || fit.slopeDeg < 8) return null
    const gimbal = Math.max(-90, Math.min(-45, -Math.round((90 - fit.slopeDeg) / 5) * 5))
    return { ...fit, gimbal }
  }, [terrain, terrainCovers, ring, validation.valid])

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
        : (elevAt?.((basePoint ?? planOk.waypoints[0])[0], (basePoint ?? planOk.waypoints[0])[1]) ?? 0)
    return { waypoints: wps, refElev: ref }
  }, [missionMode, facePlan, faceConfig.baseline, orbitPlan, orbitConfig.poi, corridorPlan, corridorConfig.centreline, planOk, terrainResult, terrain, basePoint, params.altitude])

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

  /* ------------------------ Importação de áreas ----------------------- */
  const applyImportedRing = useCallback((rawRing) => {
    pushHistory()
    const clean = simplifyRingIfNeeded(rawRing)
    setMode('idle')
    setDraftVertices([])
    setGridCells(null)
    setAnchor((a) => ({ ...a, center: null }))
    setRing(clean)
    setAreaOrigin('draw')
    setImportState(null)
    setImportError(null)
    setFitKey((k) => k + 1)
  }, [pushHistory])

  const handleImportFile = useCallback(
    async (file) => {
      if (!file) return
      setImportError(null)
      setImportWarning(null)
      try {
        // Reimportar uma missão WPML existente: reconstrói a área a partir
        // dos waypoints e recupera altitude/velocidade/nome
        if (file.name.toLowerCase().endsWith('.kmz')) {
          const res = await parseWpmlKmz(file)
          applyImportedRing(res.ring)
          if (res.name) setMissionName(res.name)
          setParams((p) => {
            const next = { ...p }
            if (Number.isFinite(res.altitude)) next.altitude = res.altitude
            if (Number.isFinite(res.speed)) {
              const r = aircraftRef.current?.speedRange ?? { min: 1, max: 20 }
              next.speed = Math.min(r.max, Math.max(r.min, res.speed))
            }
            return next
          })
          return
        }
        const result = await parseAreaFile(file)
        if (result.needsCrs) {
          setImportState({ ring: result.ring, filename: file.name, discardedParts: result.discardedParts })
        } else {
          applyImportedRing(result.ring)
          // O import escolhe o maior polígono de um MultiPolygon e deitava os
          // outros fora em silêncio — o operador ficava a planear uma parte
          // da área convencido de que tinha a área toda.
          if (result.discardedParts > 0) {
            setImportWarning(t('cp.area.importDiscarded', { n: result.discardedParts }))
          }
        }
      } catch (err) {
        setImportError(err?.message ?? 'Falha ao ler o ficheiro')
        setImportState(null)
      }
    },
    [applyImportedRing, t],
  )

  const handleImportCrs = useCallback(
    (code) => {
      if (!importState) return
      const crs = CRS_OPTIONS.find((c) => c.code === code)
      if (!crs) return
      try {
        applyImportedRing(reprojectRing(importState.ring, crs.def))
        if (importState.discardedParts > 0) {
          setImportWarning(t('cp.area.importDiscarded', { n: importState.discardedParts }))
        }
      } catch {
        setImportError('Falha na conversão de coordenadas')
        setImportState(null)
      }
    },
    [importState, applyImportedRing, t],
  )

  const cancelImport = useCallback(() => {
    setImportState(null)
    setImportError(null)
    setImportWarning(null)
  }, [])

  /* --------------- Persistência do projeto (localStorage) -------------- */

  const applyProject = useCallback((p) => {
    // leitura e migracao (v1/v2) em src/mission/project.js; aqui so se
    // distribui o resultado pelo estado
    const n = normalizeProject(p)
    if (!n) return false
    skipTileResetRef.current = true
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
    if (n.split) setSplit((prev) => ({ ...prev, ...n.split }))
    // projectos antigos guardavam uma duração de bateria única dentro de
    // split — preserva o comportamento exacto como override da combinação
    if (n.legacyBatteryMin != null && n.drone) {
      setBatteryByCombo((m) => ({ ...m, [`${n.drone.aircraftId}:${n.drone.payloadId}`]: n.legacyBatteryMin }))
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
    if (n.anchor) setAnchor((prev) => ({ ...prev, ...n.anchor }))
    if (n.ring) setRing(n.ring)
    setAreaOrigin(n.areaOrigin)
    setBasePoint(n.basePoint)
    setDisabledTiles(n.disabledTiles)
    if (n.terrainFollow) setTerrainFollow((t) => ({ ...t, ...n.terrainFollow }))
    if (n.gcpConfig) setGcpConfig((g) => ({ ...g, ...n.gcpConfig }))
    return true
  }, [setCorridorConfig, setOrbitConfig])

  // hidratar uma vez no arranque
  // Hidratação única no arranque: applyProject reconstitui uma dezena de
  // átomos de estado a partir do projecto gravado, e passá-los todos a
  // inicializadores preguiçosos de useState não é um acerto local. Custa um
  // render extra, uma só vez.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if (applyProject(p) && p.ring) setFitKey((k) => k + 1)
      }
    } catch {
      /* projeto corrompido: ignora */
    }
    hydratedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // tudo o que o projecto guarda, num só objecto (autosave e ficheiro)
  const projectState = useMemo(
    () => ({
      missionName, drone, custom, payloadTuning, batteryByCombo, inspectPoints, missionMode, faceConfig,
      corridorConfig, orbitConfig, params, split, anchor, ring, areaOrigin, basePoint, disabledTiles,
      terrainFollow, gcpConfig,
    }),
    [missionName, drone, custom, payloadTuning, batteryByCombo, inspectPoints, missionMode, faceConfig, corridorConfig, orbitConfig, params, split, anchor, ring, areaOrigin, basePoint, disabledTiles, terrainFollow, gcpConfig],
  )

  // gravação automática (debounce 500 ms)
  useEffect(() => {
    if (!hydratedRef.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(serializeProject(projectState)))
      } catch {
        /* armazenamento indisponível */
      }
    }, 500)
    return () => clearTimeout(t)
  }, [projectState])

  const exportProject = useCallback(() => {
    downloadBlob(
      new Blob([JSON.stringify(serializeProject(projectState), null, 2)], { type: 'application/json' }),
      projectFileName(missionName),
    )
  }, [projectState, missionName])

  const importProject = useCallback(
    async (file) => {
      if (!file) return
      try {
        const p = JSON.parse(await file.text())
        if (!applyProject(p)) {
          setImportError('Ficheiro de projeto inválido')
          return
        }
        if (p.ring) setFitKey((k) => k + 1)
      } catch {
        setImportError('Ficheiro de projeto inválido')
      }
    },
    [applyProject],
  )

  const startDraw = useCallback(() => {
    setMode('draw')
    setDraftVertices([])
    setRing(null)
    setAreaOrigin(null)
    setGridCells(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [])

  const startAnchor = useCallback((shape = 'rect') => {
    setMode('anchor')
    setDraftVertices([])
    setRing(null)
    setAreaOrigin(null)
    setAnchor((a) => ({
      ...a,
      center: null,
      shape,
      width: shape === 'square' ? a.length : a.width,
    }))
  }, [])

  const startBase = useCallback(() => {
    setMode((m) => (m === 'base' ? 'idle' : 'base'))
  }, [])

  const removeBase = useCallback(() => {
    setBasePoint(null)
    setMode((m) => (m === 'base' ? 'idle' : m))
  }, [])

  const clearAll = useCallback(() => {
    pushHistory()
    setMode('idle')
    setDraftVertices([])
    setRing(null)
    setAreaOrigin(null)
    setGridCells(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [pushHistory])

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

  /* --------------------------- Exportação ---------------------------- */
  const safeName = missionName.trim().replace(/[^\w-]+/g, '-') || 'missao'
  const canExportKML = Boolean(ring && validation.valid)
  // B: seguir terreno + foto por waypoint é um erro explícito, não uma
  // exportação com alturas planas
  const canExportKMZ =
    Boolean(planOk && planOk.waypoints.length >= 2) && !(terrainFollow.enabled && photoMode === 'waypoint')

  const handleExportKML = () => {
    if (canExportKML) runExport(() => exportSimpleKML(ring, safeName, basePoint, gcps, planOk?.lines ?? null))
  }

  const handleExportGcps = () => {
    if (!gcps || gcps.length === 0) return
    downloadBlob(
      new Blob([buildGcpKML(gcps, `${safeName}-gcps`)], {
        type: 'application/vnd.google-earth.kml+xml',
      }),
      `${safeName}-gcps.kml`,
    )
  }

  const handleExportKMZ = () => {
    if (!canExportKMZ) return
    // toda a montagem (nome com variantes, waypoints do terrain follow,
    // intervalos de disparo, blocos, marcador do gimbal nadir) é pura e
    // testada em src/mission/areaExport.js
    const { params: exportParams, blocks: exportBlocks } = buildAreaExport({
      missionName,
      plan: planOk,
      terrainResult,
      blocks,
      spacingM: spacing,
      photoMode,
      sensorType: sensor.type,
      altitude: params.altitude,
      speed,
      wpml,
      photoIntervalM: interval,
      triggerMode: params.triggerMode,
      gimbalPitch: params.gimbalPitch,
      crosshatch: params.crosshatch,
      includeNadir: params.includeNadir,
      tieLine: params.tieLine,
    })
    if (exportBlocks) runExport(() => exportBlocksZip(exportParams, exportBlocks))
    else runExport(() => exportWPMLKmz(exportParams))
  }

  // Missão de inspeção (R2.9): KMZ próprio com os pontos avulsos, rumo e
  // pitch por ponto via perWaypoint; sem disparo por distância
  const handleExportInspection = () => {
    if (inspectPoints.length === 0) return
    runExport(() => exportWPMLKmz(inspectionExportParams({
      missionName, points: inspectPoints, altitude: params.altitude, speed, wpml, gimbalPitch: params.gimbalPitch, sensorType: sensor.type,
    })))
  }

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
              <span className="text-[11px] font-normal text-slate-500">v{import.meta.env.APP_VERSION}</span>
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
            title={
              terrain.status === 'ready' ? t('app.view3dReady') : t('app.view3dNotReady')
            }
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
          <button
            onClick={handleExportKMZ}
            disabled={!canExportKMZ}
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
                : terrain.data.elevationAt(
                    (basePoint ?? planOk.waypoints[0])[0],
                    (basePoint ?? planOk.waypoints[0])[1],
                  ) ?? 0
            }
            blocks={
              terrainResult && !terrainResult.error && terrainResult.blocks3
                ? terrainResult.blocks3.map((b) => ({ id: b.id, waypoints: b.waypoints }))
                : blocks?.map((b) => ({
                    id: b.id,
                    waypoints: b.waypoints.map(([lon, lat]) => [lon, lat, params.altitude]),
                  })) ?? null
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
