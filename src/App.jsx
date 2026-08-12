import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import { DRONE_PROFILES, DEFAULT_CUSTOM_SENSOR } from './data/drones.js'
import {
  computeFootprint,
  computeGSD,
  generateFlightLines,
  lineSpacing,
  photoInterval,
  rectangleFromAnchor,
  resolveSensor,
  validateRing,
} from './utils/geo.js'
import { exportSimpleKML, exportWPMLKmz } from './utils/exporters.js'

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
  })
  const [mode, setMode] = useState('idle') // 'idle' | 'draw' | 'anchor'
  const [draftVertices, setDraftVertices] = useState([])
  const [ring, setRing] = useState(null) // anel aberto [[lon,lat], ...]
  const [anchor, setAnchor] = useState({
    center: null,
    length: 500,
    width: 300,
    orientation: 90,
  })

  const setParam = useCallback((key, value) => {
    setParams((p) => ({ ...p, [key]: value }))
  }, [])

  const setAnchorParam = useCallback((key, value) => {
    setAnchor((a) => ({ ...a, [key]: value }))
  }, [])

  /* ----------------- Modo âncora → retângulo perfeito ----------------- */
  useEffect(() => {
    if (anchor.center && anchor.length > 0 && anchor.width > 0) {
      setRing(
        rectangleFromAnchor(anchor.center, anchor.length, anchor.width, anchor.orientation),
      )
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
    () => lineSpacing(footprint.across, params.sideOverlap),
    [footprint, params.sideOverlap],
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
    return generateFlightLines(ring, {
      spacingM: spacing,
      angleDeg: params.angle,
      bufferPct: params.bufferPct,
      photoIntervalM: interval ?? 0,
      speed: params.speed,
    })
  }, [ring, validation.valid, spacing, params.angle, params.bufferPct, interval, params.speed])

  const planOk = plan && !plan.error ? plan : null

  /* --------------------------- Interações ---------------------------- */
  const handleMapClick = useCallback(
    (lonlat) => {
      if (mode === 'draw') {
        setDraftVertices((d) => [...d, lonlat])
      } else if (mode === 'anchor') {
        setAnchor((a) => ({ ...a, center: lonlat }))
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
        setMode('idle')
        return []
      }
      return draft
    })
  }, [])

  const handleVertexDrag = useCallback((index, lonlat) => {
    setRing((r) => (r ? r.map((v, i) => (i === index ? lonlat : v)) : r))
  }, [])

  const handleAnchorDrag = useCallback((lonlat) => {
    setAnchor((a) => ({ ...a, center: lonlat }))
  }, [])

  const startDraw = useCallback(() => {
    setMode('draw')
    setDraftVertices([])
    setRing(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [])

  const startAnchor = useCallback(() => {
    setMode('anchor')
    setDraftVertices([])
    setRing(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [])

  const clearAll = useCallback(() => {
    setMode('idle')
    setDraftVertices([])
    setRing(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [])

  /* --------------------------- Exportação ---------------------------- */
  const safeName = missionName.trim().replace(/[^\w\-]+/g, '-') || 'missao'
  const canExportKML = Boolean(ring && validation.valid)
  const canExportKMZ = Boolean(planOk && planOk.waypoints.length >= 2)

  const handleExportKML = () => {
    if (canExportKML) exportSimpleKML(ring, safeName)
  }

  const handleExportKMZ = () => {
    if (!canExportKMZ) return
    exportWPMLKmz({
      name: safeName,
      waypoints: planOk.waypoints,
      altitude: params.altitude,
      speed: params.speed,
      wpml,
      photoIntervalM: sensor.type === 'camera' ? interval : 0,
      triggerMode: params.triggerMode,
    })
  }

  /* ----------------------------- Layout ------------------------------ */
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div>
          <h1 className="text-base font-semibold tracking-tight">
            🛩️ DJI Mission Planner
          </h1>
          <p className="text-[11px] text-slate-500">
            Grelhas fotogramétricas / LiDAR · exportação KML &amp; WPML para DJI Pilot 2
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportKML}
            disabled={!canExportKML}
            title="Polígono 2D da área (KML padrão)"
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⬇ Exportar KML Simples
          </button>
          <button
            onClick={handleExportKMZ}
            disabled={!canExportKMZ}
            title="Missão completa DJI (wpmz/template.kml + waylines.wpml)"
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⬇ Exportar WPML Avançado (KMZ)
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
          onStartDraw={startDraw}
          onStartAnchor={startAnchor}
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
            plan={planOk}
            onMapClick={handleMapClick}
            onVertexDrag={handleVertexDrag}
            onAnchorDrag={handleAnchorDrag}
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
          />
        </main>
      </div>
    </div>
  )
}
