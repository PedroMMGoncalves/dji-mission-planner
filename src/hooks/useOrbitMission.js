/**
 * Modo órbita: POI, níveis, plano, pré-visualização e exportação (única ou
 * um KMZ por nível). A geometria está em utils/orbit.js.
 */
import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_ORBIT_CONFIG, generateOrbitPlan, orbitLevelsToBlocks } from '../utils/orbit.js'
import { computeGSD } from '../utils/geo.js'
import { headingTicks } from '../utils/preview.js'
import { orbitExportParams } from '../mission/exportParams.js'
import { exportBlocksZip, exportWPMLKmz } from '../utils/exporters.js'

export function useOrbitMission({ sensor, missionMode, missionName, wpml, setMode, runExport }) {
  const [orbitConfig, setOrbitConfig] = useState(() => ({ ...DEFAULT_ORBIT_CONFIG }))

  const setOrbitParam = useCallback((key, value) => {
    setOrbitConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startOrbitPoi = useCallback(() => {
    setMode((m) => (m === 'orbit' ? 'idle' : 'orbit'))
  }, [setMode])

  const clearOrbitPoi = useCallback(() => {
    setOrbitConfig((c) => ({ ...c, poi: null }))
    setMode('idle')
  }, [setMode])

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

  const orbitParams = useCallback(
    () =>
      orbitExportParams({
        missionName,
        plan: orbitPlan,
        speed: orbitConfig.speedMS,
        wpml,
        sensorType: sensor.type,
      }),
    [orbitPlan, missionName, orbitConfig.speedMS, wpml, sensor.type],
  )

  const handleExportOrbitSingle = useCallback(() => {
    if (!orbitPlan || orbitPlan.error) return
    runExport(() => exportWPMLKmz(orbitParams()))
  }, [orbitPlan, orbitParams, runExport])

  const handleExportOrbitPerLevel = useCallback(() => {
    if (!orbitPlan || orbitPlan.error) return
    runExport(() => exportBlocksZip(orbitParams(), orbitLevelsToBlocks(orbitPlan)))
  }, [orbitPlan, orbitParams, runExport])

  return {
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
  }
}
