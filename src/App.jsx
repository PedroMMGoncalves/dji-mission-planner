import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import { DRONE_PROFILES, DEFAULT_CUSTOM_SENSOR } from './data/drones.js'
import {
  computeFootprint,
  computeGSD,
  distanceToArea,
  generateFlightLines,
  gridFromAnchor,
  lineSpacing,
  longestEdgeBearing,
  photoInterval,
  rectangleFromAnchor,
  resolveSensor,
  ringToPolygon,
  splitIntoBlocks,
  validateRing,
} from './utils/geo.js'
import { exportBlocksZip, exportSimpleKML, exportWPMLKmz } from './utils/exporters.js'
import { IconDrone, IconDownload } from './components/Icons.jsx'

export default function App() {
  /* ----------------------------- Estado ----------------------------- */
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
    mode: 'none', // 'none' | 'area' | 'battery'
    maxAreaHa: 20,
    batteryMin: 25,
    reservePct: 30, // regressar à base com 30% de bateria
  })

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

  const plan = useMemo(() => {
    if (!ring || !validation.valid) return null
    const opts = {
      spacingM: spacing,
      angleDeg: params.angle,
      bufferPct: params.bufferPct,
      photoIntervalM: interval ?? 0,
      speed: params.speed,
    }
    if (!gridCells) return generateFlightLines(ring, opts)

    // Grelha: cada célula é planeada de forma independente com os mesmos
    // parâmetros (o buffer, se ativo, cria sobreposição entre células)
    const perCell = gridCells.map((cell) => generateFlightLines(cell, opts))
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
  }, [ring, validation.valid, spacing, params.angle, params.bufferPct, interval, params.speed, gridCells])

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
    if (gridCells && planOk.cellPlans) {
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
    if (split.mode === 'none') return null
    return splitIntoBlocks(planOk, {
      mode: split.mode,
      maxAreaHa: split.maxAreaHa,
      batteryMin: split.batteryMin,
      reservePct: split.reservePct,
      speed: params.speed,
      spacingM: spacing,
      basePoint,
    })
  }, [planOk, gridCells, split, params.speed, spacing, basePoint])

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
    if (canExportKML) exportSimpleKML(ring, safeName, basePoint)
  }

  const handleExportKMZ = () => {
    if (!canExportKMZ) return
    const exportParams = {
      name: safeName,
      waypoints: planOk.waypoints,
      altitude: params.altitude,
      speed: params.speed,
      wpml,
      photoIntervalM: sensor.type === 'camera' ? interval : 0,
      triggerMode: params.triggerMode,
    }
    if (blocks && blocks.length > 1) {
      exportBlocksZip(exportParams, blocks)
    } else {
      exportWPMLKmz(exportParams)
    }
  }

  /* ----------------------------- Layout ------------------------------ */
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <IconDrone className="h-7 w-7 text-sky-400" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">DJI Mission Planner</h1>
            <p className="text-[11px] text-slate-500">
              Grelhas fotogramétricas / LiDAR · exportação KML &amp; WPML para DJI Pilot 2
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportKML}
            disabled={!canExportKML}
            title="Polígono 2D da área (KML padrão)"
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> Exportar KML Simples
          </button>
          <button
            onClick={handleExportKMZ}
            disabled={!canExportKMZ}
            title="Missão completa DJI (wpmz/template.kml + waylines.wpml)"
            className="flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> Exportar WPML Avançado (KMZ)
          </button>
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
            editable={!gridCells}
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
    </div>
  )
}
