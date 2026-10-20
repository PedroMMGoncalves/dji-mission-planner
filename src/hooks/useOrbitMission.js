/**
 * Modo órbita: POI, níveis, plano, pré-visualização e exportação (única ou
 * um KMZ por nível). A geometria está em utils/orbit.js.
 */
import * as turf from '@turf/turf'
import { shotPitches } from '../mission/gimbal.js'
import { useCallback, useMemo, useState } from 'react'
import { nearestBase } from '../mission/bases.js'
import { DEFAULT_ORBIT_CONFIG, generateOrbitPlan, orbitLevelsToBlocks } from '../utils/orbit.js'
import { computeGSD } from '../utils/geo.js'
import { headingTicks } from '../utils/preview.js'
import { orbitExportParams } from '../mission/exportParams.js'
import { planForTakeoff } from '../mission/takeoffRef.js'
import { exportBlocksZip, exportWPMLKmz } from '../utils/exporters.js'

export function useOrbitMission({
  hw,
  missionMode,
  missionName,
  // acções de segurança da missão (src/mission/safety.js)
  safety = null,
  // bases do projecto: a órbita começa no rumo POI → base mais próxima
  bases = [],
  setMode,
  runExport,
}) {
  const { sensor, wpml } = hw
  const [orbitConfig, setOrbitConfig] = useState(() => ({ ...DEFAULT_ORBIT_CONFIG }))

  // A órbita começa no rumo do POI para a base mais próxima (M2-E13): com a
  // aproximação «safely» (sobe e segue a direito até ao 1.º waypoint),
  // começar sempre a norte punha a perna de aproximação a atravessar um
  // alvo alto quando a base está a sul. Sem base, a norte, como antes.
  const startBearingDeg = useMemo(() => {
    const base = orbitConfig.poi ? nearestBase(bases, [orbitConfig.poi]) : null
    if (!base?.point) return 0
    return ((Math.round(turf.bearing(orbitConfig.poi, base.point)) % 360) + 360) % 360
  }, [bases, orbitConfig.poi])

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
      capture: orbitConfig.capture,
      // várias inclinações: as escritas ou as por omissão, no intervalo do gimbal
      shots:
        orbitConfig.capture === 'multi'
          ? shotPitches(orbitConfig.multiPitches, wpml?.gimbalPitchRange)
          : null,
      hoverS: orbitConfig.hoverS,
      startBearingDeg,
    })
  }, [orbitConfig, sensor, startBearingDeg, wpml])

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

  // `takeoff` (takeoffReference): com a descolagem numa base, as alturas
  // saem relativas a ela; sem, como sempre (descolagem no chão do POI)
  const orbitParams = useCallback(
    (takeoff = null) =>
      orbitExportParams({
        missionName,
        plan: planForTakeoff(orbitPlan, takeoff),
        speed: orbitConfig.speedMS,
        wpml,
        sensorType: sensor.type,
        safety,
      }),
    [orbitPlan, missionName, orbitConfig.speedMS, wpml, sensor.type, safety],
  )

  const handleExportOrbitSingle = useCallback(
    (takeoff = null) => {
      if (!orbitPlan || orbitPlan.error) return
      runExport(() => exportWPMLKmz(orbitParams(takeoff)))
    },
    [orbitPlan, orbitParams, runExport],
  )

  const handleExportOrbitPerLevel = useCallback(
    (takeoff = null) => {
      if (!orbitPlan || orbitPlan.error) return
      // em video a gravacao e uma so, do primeiro ao ultimo ponto: fatiar a
      // espiral deixava os KMZ intermedios sem startRecord/stopRecord
      if (orbitPlan.stats.capture === 'video') return
      runExport(() =>
        exportBlocksZip(
          orbitParams(takeoff),
          orbitLevelsToBlocks(planForTakeoff(orbitPlan, takeoff)),
        ),
      )
    },
    [orbitPlan, orbitParams, runExport],
  )

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
