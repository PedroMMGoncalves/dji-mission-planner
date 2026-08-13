import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import ChecklistPage from './components/ChecklistPage.jsx'
import HelpModal from './components/HelpModal.jsx'

// carregados sob demanda
const Map3D = lazy(() => import('./components/Map3D.jsx'))
const MissionReport = lazy(() => import('./components/MissionReport.jsx'))
import { DRONE_PROFILES, DEFAULT_CUSTOM_SENSOR, FLIGHT_PRESETS } from './data/drones.js'
import {
  computeAlignment,
  computeFootprint,
  computeGSD,
  distanceToArea,
  generateFlightPlan,
  gridFromAnchor,
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
import { loadTerrain, terrainFollowLines } from './utils/terrain.js'
import { loadDemFromFile } from './utils/demFile.js'
import { buildGcpKML, gcpStats, planGcps, suggestedGcpCount } from './utils/gcp.js'
import { IconCheck, IconCube, IconDrone, IconDownload } from './components/Icons.jsx'
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
  const [droneId, setDroneId] = useState('M3E')
  const [custom, setCustom] = useState(DEFAULT_CUSTOM_SENSOR)
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
    gimbalPitch: -90, // inclinação da câmara: -90 nadir · -60/-45 oblíqua
  })
  const [mode, setMode] = useState('idle') // 'idle' | 'draw' | 'anchor' | 'base'
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
    batteryMin: 25,
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
  const [fitKey, setFitKey] = useState(0) // sinal para enquadrar o mapa na área
  const tileHistoryRef = useRef([]) // histórico de seleção de células (Ctrl+Z)
  const skipTileResetRef = useRef(false)
  const hydratedRef = useRef(false)

  const setParam = useCallback((key, value) => {
    setParams((p) => ({ ...p, [key]: value }))
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
  const profile = DRONE_PROFILES[droneId]
  const sensor = useMemo(() => resolveSensor(profile, custom), [profile, custom])

  const wpml = useMemo(
    () =>
      profile.type === 'custom'
        ? {
            ...profile.wpml,
            droneEnumValue: custom.droneEnumValue,
            payloadEnumValue: custom.payloadEnumValue,
          }
        : profile.wpml,
    [profile, custom],
  )

  const footprint = useMemo(
    () => computeFootprint(sensor, params.altitude),
    [sensor, params.altitude],
  )
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
  const gsd = useMemo(() => computeGSD(sensor, params.altitude), [sensor, params.altitude])

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
        batteryMin: split.batteryMin,
        reservePct: split.reservePct,
        speed: params.speed,
        spacingM: spacing,
        transitS,
        maxSideM: split.maxSide,
        passes: params.crosshatch ? 2 : 1,
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
    split.batteryMin,
    split.reservePct,
    split.maxSide,
    params.speed,
    spacing,
    basePoint,
  ])

  const tiles = Array.isArray(tilesResult?.cells) ? tilesResult.cells : null
  const tilesError = tilesResult?.cells?.error ?? null
  const tileSide = tilesResult?.side ?? null

  // regenerar o mosaico limpa a seleção de células desativadas
  useEffect(() => {
    if (skipTileResetRef.current) {
      skipTileResetRef.current = false
      return
    }
    setDisabledTiles(new Set())
    tileHistoryRef.current = []
  }, [ring, split.mode, tileSide, split.tileOrientation])

  const toggleTile = useCallback((index) => {
    setDisabledTiles((prev) => {
      tileHistoryRef.current.push(new Set(prev))
      if (tileHistoryRef.current.length > 100) tileHistoryRef.current.shift()
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const undoTiles = useCallback(() => {
    const prev = tileHistoryRef.current.pop()
    if (prev) setDisabledTiles(prev)
  }, [])

  const restoreAllTiles = useCallback(() => {
    setDisabledTiles((prev) => {
      if (prev.size === 0) return prev
      tileHistoryRef.current.push(new Set(prev))
      return new Set()
    })
  }, [])

  // Ctrl+Z desfaz a última alteração às células do mosaico
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (tileHistoryRef.current.length > 0) {
        e.preventDefault()
        undoTiles()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoTiles])

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
        flightTimeS: sum((s) => s.flightTimeS),
        areaHa: sum((s) => s.areaHa),
        bufferedAreaHa: sum((s) => s.bufferedAreaHa),
      },
    }
  }, [ring, validation.valid, spacing, params.angle, params.bufferPct, interval, params.speed, params.crosshatch, activeCells])

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
      }))
    }
    // 'battery' e 'tiles' produzem células (acima); só 'area' corta a serpentina
    if (split.mode !== 'area') return null
    return splitIntoBlocks(planOk, {
      mode: split.mode,
      maxAreaHa: split.maxAreaHa,
      batteryMin: split.batteryMin,
      reservePct: split.reservePct,
      speed: params.speed,
      spacingM: spacing,
      basePoint,
    })
  }, [planOk, activeCells, split, params.speed, spacing, basePoint])

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
      }
    },
    [mode],
  )

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
        setRing(clean)
        setAreaOrigin('draw')
        setMode('idle')
        return []
      }
      return draft
    })
  }, [])

  const removeDraftVertex = useCallback((index) => {
    setDraftVertices((d) => d.filter((_, i) => i !== index))
  }, [])

  const removeLastDraftVertex = useCallback(() => {
    setDraftVertices((d) => d.slice(0, -1))
  }, [])

  // Teclado no modo de desenho: Backspace/Delete anula o último ponto,
  // Escape cancela o desenho (ignorado quando o foco está num input)
  useEffect(() => {
    if (mode !== 'draw') return
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

  const handleVertexDrag = useCallback((index, lonlat) => {
    setRing((r) => (r ? r.map((v, i) => (i === index ? lonlat : v)) : r))
  }, [])

  const handleVertexInsert = useCallback((index, lonlat) => {
    setRing((r) => {
      if (!r) return r
      const next = [...r]
      next.splice(index, 0, lonlat)
      return next
    })
    setAreaOrigin('draw') // deixou de ser um retângulo perfeito
  }, [])

  const handleVertexDelete = useCallback((index) => {
    setRing((r) => (r && r.length > 3 ? r.filter((_, i) => i !== index) : r))
  }, [])

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
          const wps = []
          for (let k = 0; k < b.lines.length; k++) wps.push(...(porLinha[li++] ?? []))
          return { ...b, waypoints: wps }
        })
      }
      return { ...res, refElev, blocks3 }
    } catch (err) {
      return { error: err?.message ?? 'Falha no cálculo do terreno' }
    }
  }, [terrainFollow, terrainCovers, terrain.data, planOk, blocks, basePoint, params.altitude])

  /* ------------------------ Importação de áreas ----------------------- */
  const applyImportedRing = useCallback((rawRing) => {
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
    if (!p || p.version !== 1) return false
    skipTileResetRef.current = true
    if (typeof p.missionName === 'string') setMissionName(p.missionName)
    if (p.droneId && DRONE_PROFILES[p.droneId]) setDroneId(p.droneId)
    if (p.custom) setCustom((c) => ({ ...c, ...p.custom }))
    if (p.params) setParams((prev) => ({ ...prev, ...p.params }))
    if (p.split) setSplit((prev) => ({ ...prev, ...p.split }))
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
            version: 1,
            missionName,
            droneId,
            custom,
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
  }, [missionName, droneId, custom, params, split, anchor, ring, areaOrigin, basePoint, disabledTiles, terrainFollow, gcpConfig])

  const exportProject = useCallback(() => {
    const data = {
      version: 1,
      missionName,
      droneId,
      custom,
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
  }, [missionName, droneId, custom, params, split, anchor, ring, areaOrigin, basePoint, disabledTiles, terrainFollow, gcpConfig])

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
    setMode('idle')
    setDraftVertices([])
    setRing(null)
    setAreaOrigin(null)
    setGridCells(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [])

  // Presets de voo do perfil ativo (o preset LiDAR só faz sentido nesse modo)
  const flightPresets = useMemo(() => {
    const all = FLIGHT_PRESETS[droneId] ?? []
    if (profile.type !== 'custom') return all
    return all.filter((p) =>
      custom.mode === 'lidar' ? p.id === 'lidar' : p.id !== 'lidar',
    )
  }, [droneId, profile.type, custom.mode])

  const applyPreset = useCallback((preset) => {
    const { id: _id, ...values } = preset
    setParams((prev) => ({ ...prev, ...values }))
  }, [])

  // GSD alvo → altitude (inverso do cálculo do GSD)
  const setAltitudeFromGsd = useCallback(
    (gsdTarget) => {
      if (sensor.type !== 'camera' || !sensor.imageWidth || !(gsdTarget > 0)) return
      const alt =
        (gsdTarget * sensor.focalLength * sensor.imageWidth) / (sensor.sensorWidth * 100)
      setParams((p) => ({ ...p, altitude: Math.round(alt * 10) / 10 }))
    },
    [sensor],
  )

  // Atalhos de direção das linhas relativamente ao bloco/aresta de referência
  const setAngleRelative = useCallback(
    (offsetDeg) => {
      if (refAzimuth == null) return
      setParams((p) => ({ ...p, angle: Math.round((refAzimuth + offsetDeg) % 360) }))
    },
    [refAzimuth],
  )

  /* --------------------------- Exportação ---------------------------- */
  const safeName = missionName.trim().replace(/[^\w\-]+/g, '-') || 'missao'
  const canExportKML = Boolean(ring && validation.valid)
  const canExportKMZ = Boolean(planOk && planOk.waypoints.length >= 2)

  const handleExportKML = () => {
    if (canExportKML) exportSimpleKML(ring, safeName, basePoint, gcps)
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
    const exportParams = {
      name: safeName,
      waypoints: terrainOk ? terrainResult.waypoints : planOk.waypoints,
      altitude: params.altitude,
      speed: params.speed,
      wpml,
      photoIntervalM: sensor.type === 'camera' ? interval : 0,
      triggerMode: params.triggerMode,
      gimbalPitch: params.gimbalPitch,
    }
    const exportBlocks = terrainOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
    if (exportBlocks && exportBlocks.length > 1) {
      exportBlocksZip(exportParams, exportBlocks)
    } else {
      exportWPMLKmz(exportParams)
    }
  }

  /* ----------------------------- Layout ------------------------------ */
  if (view === 'checklist') {
    return (
      <ChecklistPage
        missionName={missionName}
        droneLabel={profile.label}
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
            disabled={!(terrain.status === 'ready' && terrainCovers && planOk)}
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
              {LANGS.map(({ code, flag, label }) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  title={label}
                  className={`px-2 py-1 text-base leading-none transition-colors ${
                    lang === code ? 'bg-slate-700' : 'opacity-50 hover:opacity-90'
                  }`}
                >
                  {flag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ControlPanel
          missionName={missionName}
          setMissionName={setMissionName}
          droneId={droneId}
          setDroneId={setDroneId}
          custom={custom}
          setCustom={setCustom}
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
          blocks={blocks}
          gridActive={Boolean(gridCells)}
          tilesTotal={tiles?.length ?? null}
          tilesError={tilesError}
          tileSide={tileSide}
          gsd={gsd}
          onGsdTarget={setAltitudeFromGsd}
          presets={flightPresets}
          onApplyPreset={applyPreset}
          importState={importState}
          importError={importError}
          onImportFile={handleImportFile}
          onImportCrs={handleImportCrs}
          onImportCancel={cancelImport}
          onProjectExport={exportProject}
          onProjectImport={importProject}
          onTilesUndo={undoTiles}
          onTilesRestoreAll={restoreAllTiles}
          terrain={terrain}
          terrainCovers={terrainCovers}
          terrainFollow={terrainFollow}
          setTerrainFollow={setTerrainFollow}
          onLoadTerrain={handleLoadTerrain}
          onImportDem={handleImportDem}
          terrainResult={terrainResult}
          gcpConfig={gcpConfig}
          setGcpConfig={setGcpConfig}
          gcpAutoCount={gcpAutoCount}
          gcpInfo={gcpInfo}
          onExportGcps={handleExportGcps}
          onUndoVertex={removeLastDraftVertex}
          onStartDraw={startDraw}
          onStartAnchor={startAnchor}
          onStartBase={startBase}
          onRemoveBase={removeBase}
          onSetAngleRelative={setAngleRelative}
          onFinishDraw={handleFinishDraw}
          onClear={clearAll}
        />

        <main className="relative min-w-0 flex-1">
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
            fitKey={fitKey}
            editable={!gridCells && split.mode !== 'tiles' && split.mode !== 'battery'}
            onMapClick={handleMapClick}
            onVertexDrag={handleVertexDrag}
            onVertexInsert={handleVertexInsert}
            onVertexDelete={handleVertexDelete}
            onDraftVertexRemove={removeDraftVertex}
            onAnchorDrag={handleAnchorDrag}
            onBaseDrag={handleBaseDrag}
            onFinishDraw={handleFinishDraw}
          />
          <StatsPanel
            gsd={gsd}
            footprint={footprint}
            spacing={spacing}
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
            droneLabel={profile.label}
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

      {show3d && terrain.status === 'ready' && planOk && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">
              {t('app.loading3d')}
            </div>
          }
        >
          <Map3D
            terrain={terrain.data}
            ring={ring}
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
            basePoint={basePoint}
            gcps={gcps}
            onClose={() => setShow3d(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
