import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
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
  migrateDroneSelection,
} from './data/drones.js'
import {
  aggregatePlans,
  computeAlignment,
  computeFootprint,
  computeGSD,
  distanceToArea,
  findOptimalDirection,
  generateFlightPlan,
  gridFromAnchor,
  nadirLineLocalPerBlock,
  lidarPointDensity,
  lineSpacing,
  longestEdgeBearing,
  photoInterval,
  rectangleFromAnchor,
  resolveSensor,
  ringToPolygon,
  splitIntoBlocks,
  squareSideForBattery,
  tilePolygonWithSquares,
  validateRing,
} from './utils/geo.js'
import {
  buildExportName,
  downloadBlob,
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
import { fitSlopePlane, loadTerrain, terrainFollowLines } from './utils/terrain.js'
import { inspectionToWaypoints, nearestNeighbourOrder, reorderList } from './utils/inspect.js'
import {
  DEFAULT_FACE_CONFIG,
  checkFaceClearance,
  generateFacePlan,
  normalizeFaceConfig,
} from './utils/faceMode.js'
import { headingTicks } from './utils/preview.js'
import {
  DEFAULT_ORBIT_CONFIG,
  generateOrbitPlan,
  normalizeOrbitConfig,
  orbitLevelsToBlocks,
} from './utils/orbit.js'
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
  const [missionMode, setMissionMode] = useState('area') // 'area' | 'face' | 'orbit'
  const [faceConfig, setFaceConfig] = useState(() => ({ ...DEFAULT_FACE_CONFIG }))
  const [orbitConfig, setOrbitConfig] = useState(() => ({ ...DEFAULT_ORBIT_CONFIG }))
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

  /* ------------------- Pipeline de cálculo (memo) -------------------- */
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  aircraftRef.current = aircraft

  // rótulo composto para o relatório/checklist: a aeronave, e o payload
  // quando a aeronave tem mais do que um montável
  const hardwareLabel =
    aircraft.payloads.length > 1 ? `${aircraft.label} + ${payload.label}` : aircraft.label

  // ao trocar de aeronave, a velocidade atual é reencaixada nos novos limites
  useEffect(() => {
    const r = aircraft.speedRange ?? { min: 1, max: 20 }
    setParams((p) =>
      p.speed < r.min || p.speed > r.max
        ? { ...p, speed: Math.min(r.max, Math.max(r.min, p.speed)) }
        : p,
    )
  }, [aircraft])

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
        ? lidarPointDensity({ prr: payload.maxPrr, speed: params.speed, swathM: footprint.across })
        : null,
    [sensor.type, payload, params.speed, footprint],
  )

  // intervalo entre fotos abaixo do que o obturador consegue?
  const triggerWarn = useMemo(() => {
    if (interval == null || !(params.speed > 0)) return null
    const minS = payload.minTriggerS ?? 0.7
    const actualS = interval / params.speed
    if (actualS >= minS) return null
    return { actualS, minS, maxSpeed: interval / minS }
  }, [interval, params.speed, payload])

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
      const transitS = dist != null ? (2 * dist) / (params.speed || 10) : 0
      side = squareSideForBattery({
        batteryMin,
        reservePct: split.reservePct,
        speed: params.speed,
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
    params.speed,
    spacing,
    basePoint,
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

  const plan = useMemo(() => {
    if (!ring || !validation.valid) return null
    const opts = {
      spacingM: spacing,
      angleDeg: params.angle,
      bufferPct: params.bufferPct,
      photoIntervalM: interval ?? 0,
      speed: params.speed,
      crosshatch: params.crosshatch,
      includeNadir: Boolean(params.crosshatch && params.includeNadir),
      overshootM: Math.max(0, params.overshoot || 0),
      tieLine: Boolean(params.tieLine),
    }
    if (!activeCells) return generateFlightPlan(ring, opts)

    // Grelha/mosaico: cada célula é planeada com os mesmos parâmetros e com
    // alinhamento global — as faixas de células adjacentes são colineares e
    // têm continuidade (o buffer, se ativo, cria sobreposição entre células)
    const align = computeAlignment(ring, spacing, params.angle)
    const align2 = params.crosshatch
      ? computeAlignment(ring, spacing, (params.angle + 90) % 360)
      : null
    const perCell = activeCells.map((cell) =>
      generateFlightPlan(cell, { ...opts, align, align2 }),
    )
    if (perCell.some((p) => p?.error)) return { error: 'too-many-lines' }
    const ok = perCell.filter(Boolean)
    if (ok.length === 0) return null
    const sum = (f) => ok.reduce((acc, p) => acc + (f(p.stats) ?? 0), 0)
    return {
      area: ringToPolygon(ring),
      lines: ok.flatMap((p) => p.lines),
      waypoints: ok.flatMap((p) => p.waypoints),
      cellPlans: ok,
      stats: {
        lineCount: sum((s) => s.lineCount),
        waypointCount: sum((s) => s.waypointCount),
        totalLineLengthM: sum((s) => s.totalLineLengthM),
        pathLengthM: sum((s) => s.pathLengthM),
        photoCount: interval != null ? sum((s) => s.photoCount) : null,
        photoCountArea:
          interval != null && params.overshoot > 0 ? sum((s) => s.photoCountArea) : null,
        flightTimeS: sum((s) => s.flightTimeS),
        areaHa: sum((s) => s.areaHa),
        bufferedAreaHa: sum((s) => s.bufferedAreaHa),
      },
    }
  }, [ring, validation.valid, spacing, params.angle, params.bufferPct, interval, params.speed, params.crosshatch, params.includeNadir, params.overshoot, params.tieLine, activeCells])

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
  const blocks = useMemo(() => {
    if (!planOk) return null
    if (activeCells && planOk.cellPlans) {
      return planOk.cellPlans.map((p, i) => ({
        id: i + 1,
        lines: p.lines,
        waypoints: p.waypoints,
        areaHa: p.stats.areaHa,
        lengthM: p.stats.totalLineLengthM,
        transitS: 0,
        timeS: p.stats.flightTimeS ?? 0,
        // R2.10: cada célula tem a sua grelha nadir no fim
        nadirLineLocal: p.nadirStartLine ?? null,
      }))
    }
    // 'battery' e 'tiles' produzem células (acima); só 'area' corta a serpentina
    if (split.mode !== 'area') return null
    const cut = splitIntoBlocks(planOk, {
      mode: split.mode,
      maxAreaHa: split.maxAreaHa,
      batteryMin,
      reservePct: split.reservePct,
      speed: params.speed,
      spacingM: spacing,
      basePoint,
    })
    if (!cut || planOk.nadirStartLine == null) return cut
    // R2.10: em que linha local de cada bloco começa a grelha nadir
    const locals = nadirLineLocalPerBlock(cut.map((b) => b.lines.length), planOk.nadirStartLine)
    return cut.map((b, i) => ({ ...b, nadirLineLocal: locals[i] }))
  }, [planOk, activeCells, split, batteryMin, params.speed, spacing, basePoint])

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
      } else if (mode === 'face') {
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
    [mode, params.altitude],
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
    exportWPMLKmz({
      name: buildExportName(missionName, 'face', {
        part: `p1-${facePlan.stats.passCount}`,
      }),
      waypoints: facePlan.waypoints,
      perWaypoint: facePlan.perWaypoint,
      altitude: Math.round(facePlan.stats.heights[facePlan.stats.heights.length - 1]),
      speed: faceConfig.speedMS,
      wpml,
      photoIntervalM: 0,
      triggerMode: 'distance',
      gimbalPitch: faceConfig.gimbalPitch,
      sensorType: sensor.type,
    })
  }, [facePlan, missionName, faceConfig.speedMS, wpml, faceConfig.gimbalPitch, sensor.type])

  /* ------------------------ Modo órbita (E1.2) ------------------------ */
  const setOrbitParam = useCallback((key, value) => {
    setOrbitConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startOrbitPoi = useCallback(() => {
    setMode((m) => (m === 'orbit' ? 'idle' : 'orbit'))
  }, [])

  const clearOrbitPoi = useCallback(() => {
    setOrbitConfig((c) => ({ ...c, poi: null }))
    setMode('idle')
  }, [])

  const handleOrbitPoiDrag = useCallback((lonlat) => {
    setOrbitConfig((c) => ({ ...c, poi: lonlat }))
  }, [])

  const orbitPlan = useMemo(() => {
    if (!orbitConfig.poi) return null
    return generateOrbitPlan(orbitConfig.poi, {
      sensor: sensor.type === 'camera' ? sensor : null,
      radiusM: orbitConfig.radiusM,
      levels: {
        count: orbitConfig.levelCount,
        startM: orbitConfig.levelStartM,
        stepM: orbitConfig.levelStepM,
      },
      horizontalOverlapPct: orbitConfig.horizontalOverlapPct,
      poiHeightM: orbitConfig.poiHeightM,
      clockwise: orbitConfig.clockwise,
      speed: orbitConfig.speedMS,
    })
  }, [orbitConfig, sensor])

  const gsdAtRadius = useMemo(
    () => (sensor.type === 'camera' ? computeGSD(sensor, orbitConfig.radiusM) : null),
    [sensor, orbitConfig.radiusM],
  )

  const setRadiusFromGsd = useCallback(
    (gsdTarget) => {
      if (sensor.type !== 'camera' || !sensor.imageWidth || !(gsdTarget > 0)) return
      const r = (gsdTarget * sensor.focalLength * sensor.imageWidth) / (sensor.sensorWidth * 100)
      setOrbitConfig((c) => ({ ...c, radiusM: Math.max(5, Math.min(500, Math.round(r))) }))
    },
    [sensor],
  )

  const orbitPreview = useMemo(() => {
    if (missionMode !== 'orbit') return null
    const ok = orbitPlan && !orbitPlan.error ? orbitPlan : null
    const per = ok ? ok.stats.pointsPerOrbit + 1 : 0
    return {
      poi: orbitConfig.poi,
      ring: ok ? ok.waypoints.slice(0, per) : null,
      ticks: ok
        ? headingTicks(ok.waypoints, ok.perWaypoint, {
            lengthM: Math.min(12, orbitConfig.radiusM * 0.25),
            limit: per,
          })
        : null,
    }
  }, [missionMode, orbitPlan, orbitConfig.poi, orbitConfig.radiusM])

  const orbitExportParams = useCallback(() => ({
    name: buildExportName(missionName, 'orbit', {
      part: `n${orbitPlan.stats.levelCount}`,
    }),
    waypoints: orbitPlan.waypoints,
    perWaypoint: orbitPlan.perWaypoint,
    turnMode: orbitPlan.turnMode,
    altitude: Math.round(orbitPlan.stats.heights[orbitPlan.stats.heights.length - 1]),
    speed: orbitConfig.speedMS,
    wpml,
    photoIntervalM: 0,
    triggerMode: 'distance',
    gimbalPitch: orbitPlan.perLevel[0]?.gimbalPitch ?? -45,
    sensorType: sensor.type,
  }), [orbitPlan, missionName, orbitConfig.speedMS, wpml, sensor.type])

  const handleExportOrbitSingle = useCallback(() => {
    if (!orbitPlan || orbitPlan.error) return
    exportWPMLKmz(orbitExportParams())
  }, [orbitPlan, orbitExportParams])

  const handleExportOrbitPerLevel = useCallback(() => {
    if (!orbitPlan || orbitPlan.error) return
    exportBlocksZip(orbitExportParams(), orbitLevelsToBlocks(orbitPlan))
  }, [orbitPlan, orbitExportParams])

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

  // o duplo clique no mapa conclui o desenho activo (área ou baseline)
  const handleFinishAny = useCallback(() => {
    if (mode === 'face') handleFinishFace()
    else handleFinishDraw()
  }, [mode, handleFinishFace, handleFinishDraw])

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
    if (!terrainFollow.enabled || !terrainCovers || !planOk?.lines?.length) return null
    const data = terrain.data
    const refPt = basePoint ?? planOk.waypoints[0]
    const refElev = data.elevationAt(refPt[0], refPt[1])
    if (refElev == null) return { error: 'Referência fora do terreno carregado' }
    try {
      const res = terrainFollowLines(data, planOk.lines, {
        agl: params.altitude,
        refElev,
        toleranceM: Math.max(1, terrainFollow.tolerance),
      })
      // reagrupar os waypoints densificados por bloco (ordem preservada)
      let blocks3 = null
      if (blocks) {
        const porLinha = []
        let idx = 0
        res.perLine.forEach((n) => {
          porLinha.push(res.waypoints.slice(idx, idx + n))
          idx += n
        })
        let li = 0
        blocks3 = blocks.map((b) => {
          const startLine = li
          const wps = []
          for (let k = 0; k < b.lines.length; k++) wps.push(...(porLinha[li++] ?? []))
          // R2.10: com densificação, o waypoint local onde o nadir começa é a
          // soma dos comprimentos das linhas anteriores do bloco
          let nadirMarkerAt = null
          if (b.nadirLineLocal != null) {
            nadirMarkerAt = 0
            for (let k = 0; k < b.nadirLineLocal; k++) {
              nadirMarkerAt += porLinha[startLine + k]?.length ?? 0
            }
          }
          return { ...b, waypoints: wps, nadirMarkerAt }
        })
      }
      return { ...res, refElev, blocks3 }
    } catch (err) {
      return { error: err?.message ?? 'Falha no cálculo do terreno' }
    }
  }, [terrainFollow, terrainCovers, terrain.data, planOk, blocks, basePoint, params.altitude])

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
        ],
        { batteryMin, reservePct: split.reservePct },
      ),
    [planOk, facePlan, orbitPlan, batteryMin, split.reservePct],
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
  }, [missionMode, facePlan, faceConfig.baseline, orbitPlan, orbitConfig.poi, planOk, terrainResult, terrain, basePoint, params.altitude])

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
  }, [])

  const handleImportFile = useCallback(
    async (file) => {
      if (!file) return
      setImportError(null)
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
          setImportState({ ring: result.ring, filename: file.name })
        } else {
          applyImportedRing(result.ring)
        }
      } catch (err) {
        setImportError(err?.message ?? 'Falha ao ler o ficheiro')
        setImportState(null)
      }
    },
    [applyImportedRing],
  )

  const handleImportCrs = useCallback(
    (code) => {
      if (!importState) return
      const crs = CRS_OPTIONS.find((c) => c.code === code)
      if (!crs) return
      try {
        applyImportedRing(reprojectRing(importState.ring, crs.def))
      } catch {
        setImportError('Falha na conversão de coordenadas')
        setImportState(null)
      }
    },
    [importState, applyImportedRing],
  )

  const cancelImport = useCallback(() => {
    setImportState(null)
    setImportError(null)
  }, [])

  /* --------------- Persistência do projeto (localStorage) -------------- */
  const PROJECT_KEY = 'dji-mission-planner:project:v1'

  const applyProject = useCallback((p) => {
    // v1: droneId (perfil único, pré-T1.1) · v2: drone {aircraftId, payloadId}
    if (!p || (p.version !== 1 && p.version !== 2)) return false
    skipTileResetRef.current = true
    if (typeof p.missionName === 'string') setMissionName(p.missionName)
    const sel = p.drone || p.droneId ? migrateDroneSelection(p.drone ?? p.droneId) : null
    if (sel) setDrone(sel)
    if (p.custom) setCustom((c) => ({ ...c, ...p.custom }))
    if (p.payloadTuning && typeof p.payloadTuning === 'object') setPayloadTuning(p.payloadTuning)
    if (p.params) setParams((prev) => ({ ...prev, ...p.params }))
    if (p.split) {
      // projetos antigos guardavam uma duração de bateria única dentro de
      // split — preserva o comportamento exato como override da combinação
      const { batteryMin: legacyBatteryMin, ...restSplit } = p.split
      setSplit((prev) => ({ ...prev, ...restSplit }))
      if (Number.isFinite(legacyBatteryMin) && sel) {
        setBatteryByCombo((m) => ({
          ...m,
          [`${sel.aircraftId}:${sel.payloadId}`]: legacyBatteryMin,
        }))
      }
    }
    if (p.batteryByCombo && typeof p.batteryByCombo === 'object') {
      setBatteryByCombo((m) => ({ ...m, ...p.batteryByCombo }))
    }
    if (p.missionMode === 'area' || p.missionMode === 'face' || p.missionMode === 'orbit') {
      setMissionMode(p.missionMode)
    }
    if (p.faceConfig) setFaceConfig(normalizeFaceConfig(p.faceConfig))
    if (p.orbitConfig) setOrbitConfig(normalizeOrbitConfig(p.orbitConfig))
    if (Array.isArray(p.inspectPoints)) {
      const pts = p.inspectPoints.filter((q) => q && Array.isArray(q.point))
      setInspectPoints(pts)
      inspectSeqRef.current = pts.reduce((mx, q) => Math.max(mx, (q.id ?? 0) + 1), 1)
    }
    if (p.anchor) setAnchor((prev) => ({ ...prev, ...p.anchor }))
    if (Array.isArray(p.ring)) setRing(p.ring)
    setAreaOrigin(p.areaOrigin ?? null)
    setBasePoint(Array.isArray(p.basePoint) ? p.basePoint : null)
    setDisabledTiles(new Set(Array.isArray(p.disabledTiles) ? p.disabledTiles : []))
    if (p.terrainFollow) setTerrainFollow((t) => ({ ...t, ...p.terrainFollow }))
    if (p.gcpConfig) setGcpConfig((g) => ({ ...g, ...p.gcpConfig }))
    return true
  }, [])

  // hidratar uma vez no arranque
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_KEY)
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

  // gravação automática (debounce 500 ms)
  useEffect(() => {
    if (!hydratedRef.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          PROJECT_KEY,
          JSON.stringify({
            version: 2,
            missionName,
            drone,
            custom,
            payloadTuning,
            batteryByCombo,
            inspectPoints,
            missionMode,
            faceConfig,
            orbitConfig,
            params,
            split,
            anchor,
            ring,
            areaOrigin,
            basePoint,
            disabledTiles: [...disabledTiles],
            terrainFollow,
            gcpConfig,
          }),
        )
      } catch {
        /* armazenamento indisponível */
      }
    }, 500)
    return () => clearTimeout(t)
  }, [missionName, drone, custom, payloadTuning, batteryByCombo, inspectPoints, missionMode, faceConfig, orbitConfig, params, split, anchor, ring, areaOrigin, basePoint, disabledTiles, terrainFollow, gcpConfig])

  const exportProject = useCallback(() => {
    const data = {
      version: 2,
      missionName,
      drone,
      custom,
      payloadTuning,
      batteryByCombo,
      inspectPoints,
      missionMode,
      faceConfig,
      orbitConfig,
      params,
      split,
      anchor,
      ring,
      areaOrigin,
      basePoint,
      disabledTiles: [...disabledTiles],
      terrainFollow,
      gcpConfig,
    }
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `${missionName.trim().replace(/[^\w\-]+/g, '-') || 'missao'}-projeto.json`,
    )
  }, [missionName, drone, custom, payloadTuning, batteryByCombo, inspectPoints, missionMode, faceConfig, orbitConfig, params, split, anchor, ring, areaOrigin, basePoint, disabledTiles, terrainFollow, gcpConfig])

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
  const safeName = missionName.trim().replace(/[^\w\-]+/g, '-') || 'missao'
  const canExportKML = Boolean(ring && validation.valid)
  const canExportKMZ = Boolean(planOk && planOk.waypoints.length >= 2)

  const handleExportKML = () => {
    if (canExportKML) exportSimpleKML(ring, safeName, basePoint, gcps, planOk?.lines ?? null)
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
    const terrainOk = terrainResult && !terrainResult.error
    // E3.1: tipo e variantes codificados no nome do ficheiro
    const areaName = buildExportName(missionName, 'area', {
      variant: [
        params.crosshatch && 'crosshatch',
        params.crosshatch && params.includeNadir && 'nadir',
        params.tieLine && 'tie',
        terrainOk && 'tf',
      ],
    })
    const exportParams = {
      name: areaName,
      waypoints: terrainOk ? terrainResult.waypoints : planOk.waypoints,
      altitude: params.altitude,
      speed: params.speed,
      wpml,
      photoIntervalM: sensor.type === 'camera' ? interval : 0,
      triggerMode: params.triggerMode,
      gimbalPitch: params.gimbalPitch,
      sensorType: sensor.type,
    }
    const exportBlocks = terrainOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks

    // R2.10: com a passagem nadir extra, o gimbal roda a −90 no primeiro
    // waypoint da grelha nadir (a missão arranca no pitch oblíquo global)
    const nadirLine = planOk.nadirStartLine ?? planOk.cellPlans?.[0]?.nadirStartLine ?? null
    if (nadirLine != null) {
      if (exportBlocks && exportBlocks.length > 1) {
        const annotated = exportBlocks.map((b) => {
          const at = terrainOk
            ? b.nadirMarkerAt
            : b.nadirLineLocal != null
              ? 2 * b.nadirLineLocal
              : null
          if (at == null) return b
          const pw = []
          pw[at] = { gimbalPitch: -90 }
          return { ...b, perWaypoint: pw }
        })
        exportBlocksZip(exportParams, annotated)
        return
      }
      let at
      if (terrainOk) {
        at = 0
        for (let k = 0; k < nadirLine; k++) at += terrainResult.perLine[k] ?? 0
      } else {
        at = planOk.nadirStartWaypoint ?? planOk.cellPlans?.[0]?.nadirStartWaypoint ?? 2 * nadirLine
      }
      const pw = []
      pw[at] = { gimbalPitch: -90 }
      exportParams.perWaypoint = pw
    }

    if (exportBlocks && exportBlocks.length > 1) {
      exportBlocksZip(exportParams, exportBlocks)
    } else {
      exportWPMLKmz(exportParams)
    }
  }

  // Missão de inspeção (R2.9): KMZ próprio com os pontos avulsos, rumo e
  // pitch por ponto via perWaypoint; sem disparo por distância
  const handleExportInspection = () => {
    if (inspectPoints.length === 0) return
    const { waypoints, perWaypoint } = inspectionToWaypoints(inspectPoints)
    exportWPMLKmz({
      name: buildExportName(missionName, 'inspect', { part: `n${inspectPoints.length}` }),
      waypoints,
      perWaypoint,
      altitude: params.altitude,
      speed: params.speed,
      wpml,
      photoIntervalM: 0,
      triggerMode: 'distance',
      gimbalPitch: params.gimbalPitch,
      sensorType: sensor.type,
    })
  }

  /* ----------------------------- Layout ------------------------------ */
  if (view === 'checklist') {
    return (
      <ChecklistPage
        missionName={missionName}
        droneLabel={hardwareLabel}
        sensorType={sensor.type}
        faceMode={missionMode === 'face' && Boolean(faceConfig.baseline)}
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
            <h1 className="text-base font-semibold tracking-tight">DJI Mission Planner</h1>
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
          params={params}
          setParam={setParam}
          mode={mode}
          draftCount={draftVertices.length}
          hasRing={Boolean(ring)}
          validation={validation}
          planError={plan?.error ?? null}
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
          aglWarn={aglWarn}
          importState={importState}
          importError={importError}
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
            speed={params.speed}
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
            params={params}
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
