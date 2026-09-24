/**
 * Modo circular («circlegrammetry»): grelha de círculos sobre o polígono da
 * área, com a câmara oblíqua apontada ao centro de cada círculo. Reutiliza a
 * área desenhada (useAreaGeometry), o relevo carregado e a cota de
 * referência da área; a geometria está em utils/circular.js e os
 * parâmetros de exportação em mission/exportParams.js.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  DEFAULT_CIRCULAR_CONFIG,
  MAX_CIRCLES,
  applyCircularTerrain,
  circularBlocks,
  generateCircularPlan,
  overlapAdvice,
} from '../utils/circular.js'
import { circularExportParams } from '../mission/exportParams.js'
import { referenceElevation } from '../mission/reference.js'
import { usableBatteryMin } from '../mission/preflight.js'
import { exportBlocksZip, exportWPMLKmz } from '../utils/exporters.js'

export function useCircularMission({
  ring,
  holes = null,
  validation,
  sensor,
  altitude,
  frontOverlap,
  speedRange,
  missionName,
  wpml,
  terrain,
  terrainFollow,
  terrainCovers,
  basePoint,
  batteryMin,
  reservePct,
  missionMode,
  runExport,
  avisoObturador,
}) {
  const [circularConfig, setCircularConfig] = useState(() => ({ ...DEFAULT_CIRCULAR_CONFIG }))

  const setCircularParam = useCallback((key, value) => {
    setCircularConfig((c) => ({ ...c, [key]: value }))
  }, [])

  // a velocidade guardada limita-se à aeronave, como no corredor
  const circularSpeed = Math.min(speedRange.max, Math.max(speedRange.min, circularConfig.speedMS))
  const circularTriggerWarn = useMemo(
    () => avisoObturador(circularSpeed),
    [avisoObturador, circularSpeed],
  )

  // Sem guarda de missionMode: o resumo do projecto agrega os planos que
  // existem. A pré-visualização é que depende do separador aberto.
  const planFlat = useMemo(() => {
    if (!ring || !validation?.valid) return null
    return generateCircularPlan(ring, {
      sensor: sensor.type === 'camera' ? sensor : null,
      radiusM: circularConfig.radiusM,
      overlapPct: circularConfig.overlapPct,
      altitude,
      gimbalPitch: circularConfig.gimbalPitch,
      frontOverlapPct: frontOverlap,
      speed: circularSpeed,
      angleDeg: circularConfig.angleDeg,
      holes,
    })
  }, [
    ring,
    holes,
    validation?.valid,
    sensor,
    circularConfig,
    altitude,
    frontOverlap,
    circularSpeed,
  ])
  const planFlatOk = planFlat && !planFlat.error ? planFlat : null

  const circularAdvice = useMemo(
    () =>
      ring && validation?.valid
        ? overlapAdvice(ring, {
            radiusM: circularConfig.radiusM,
            overlapPct: circularConfig.overlapPct,
            angleDeg: circularConfig.angleDeg,
          })
        : null,
    [
      ring,
      validation?.valid,
      circularConfig.radiusM,
      circularConfig.overlapPct,
      circularConfig.angleDeg,
    ],
  )

  // Cota de referência única (src/mission/reference.js): base com relevo,
  // senão a mínima do relevo debaixo da rota
  const circularReference = useMemo(() => {
    const elevationAt = terrain.data?.elevationAt
    if (typeof elevationAt !== 'function' || !planFlatOk) return null
    return referenceElevation({ elevationAt, basePoint, waypoints: planFlatOk.waypoints })
  }, [terrain.data, basePoint, planFlatOk])

  // Seguimento de terreno por ponto: os índices das acções não mudam
  const terrainResult = useMemo(() => {
    if (!terrainFollow?.enabled || !terrainCovers || !planFlatOk) return null
    const elevationAt = terrain.data?.elevationAt
    if (typeof elevationAt !== 'function' || !Number.isFinite(circularReference?.elev)) return null
    return applyCircularTerrain(planFlatOk, {
      elevationAt,
      refElev: circularReference.elev,
      agl: altitude,
      speed: circularSpeed,
    })
  }, [
    terrainFollow,
    terrainCovers,
    planFlatOk,
    terrain.data,
    circularReference,
    altitude,
    circularSpeed,
  ])

  // o plano que sai no KMZ: alturas do terreno quando há, e as estatísticas
  // da rota 3D correspondente
  const circularPlan = useMemo(() => {
    if (!planFlat) return null
    if (!planFlatOk || !terrainResult) return planFlat
    return {
      ...planFlatOk,
      waypoints: terrainResult.waypoints,
      stats: {
        ...planFlatOk.stats,
        pathLengthM: terrainResult.pathLengthM,
        flightTimeS: terrainResult.flightTimeS,
        path3D: true,
        terrainMissing: terrainResult.missing,
      },
    }
  }, [planFlat, planFlatOk, terrainResult])
  const circularPlanOk = circularPlan && !circularPlan.error ? circularPlan : null

  const usableMin = usableBatteryMin(batteryMin, reservePct)
  const blocks = useMemo(
    () =>
      circularPlanOk
        ? circularBlocks(circularPlanOk, circularPlanOk.waypoints, {
            usableS: usableMin != null ? usableMin * 60 : null,
            speed: circularSpeed,
          })
        : [],
    [circularPlanOk, usableMin, circularSpeed],
  )

  const circularPreview = useMemo(() => {
    if (missionMode !== 'circular' || !circularPlanOk) return null
    return {
      radiusM: circularPlanOk.stats.radiusM,
      circles: circularPlanOk.circles.map((c) => ({ centre: c.centre, clockwise: c.clockwise })),
      path: circularPlanOk.waypoints,
    }
  }, [missionMode, circularPlanOk])

  const exportParams = useCallback(
    () =>
      circularExportParams({
        missionName,
        plan: circularPlanOk,
        waypoints: circularPlanOk.waypoints,
        terrainOk: Boolean(terrainResult),
        altitude,
        speed: circularSpeed,
        wpml,
        sensorType: sensor.type,
      }),
    [missionName, circularPlanOk, terrainResult, altitude, circularSpeed, wpml, sensor.type],
  )

  const handleExportCircularSingle = useCallback(() => {
    if (!circularPlanOk) return
    runExport(() => exportWPMLKmz(exportParams()))
  }, [circularPlanOk, exportParams, runExport])

  const handleExportCircularBlocks = useCallback(() => {
    if (!circularPlanOk || blocks.length < 2) return
    runExport(() => exportBlocksZip(exportParams(), blocks))
  }, [circularPlanOk, blocks, exportParams, runExport])

  return {
    circularConfig,
    setCircularConfig,
    setCircularParam,
    circularSpeed,
    circularTriggerWarn,
    circularPlan,
    circularAdvice,
    circularReference,
    circularBlocks: blocks,
    circularUsableMin: usableMin,
    circularPreview,
    circularMaxCircles: MAX_CIRCLES,
    handleExportCircularSingle,
    handleExportCircularBlocks,
  }
}
