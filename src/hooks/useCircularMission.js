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
  circlePhotoSpacingM,
  circularBlocks,
  generateCircularPlan,
  overlapAdvice,
} from '../utils/circular.js'
import { circularExportParams } from '../mission/exportParams.js'
import { bboxCovers, bboxOfPoints } from '../mission/corridorTerrain.js'
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
  basePoint,
  batteryMin,
  reservePct,
  missionMode,
  runExport,
  // (intervaloM, velocidade) → aviso do obturador ou null
  avisoIntervalo,
}) {
  const [circularConfig, setCircularConfig] = useState(() => ({ ...DEFAULT_CIRCULAR_CONFIG }))

  const setCircularParam = useCallback((key, value) => {
    setCircularConfig((c) => ({ ...c, [key]: value }))
  }, [])

  // a velocidade guardada limita-se à aeronave, como no corredor
  const circularSpeed = Math.min(speedRange.max, Math.max(speedRange.min, circularConfig.speedMS))

  // A missão circular só existe quando foi criada (abrir o separador liga
  // `enabled`): usa o polígono da área e, sem isto, qualquer área dava uma
  // missão circular que o resumo do projecto somava. Criada, conta no resumo
  // seja qual for o separador aberto, como as outras.
  const active = circularConfig.enabled || missionMode === 'circular'
  const planFlat = useMemo(() => {
    if (!active || !ring || !validation?.valid) return null
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
    active,
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

  // O obturador acompanha a distância entre fotos AO LONGO DO CÍRCULO (a
  // corda entre pontos), não o intervalo das grelhas da área
  const circularTriggerWarn = useMemo(() => {
    if (!planFlatOk || sensor.type !== 'camera') return null
    const spacing = circlePhotoSpacingM(planFlatOk.stats)
    return spacing ? avisoIntervalo(spacing, circularSpeed) : null
  }, [planFlatOk, sensor.type, avisoIntervalo, circularSpeed])

  const circularAdvice = useMemo(
    () =>
      active && ring && validation?.valid
        ? overlapAdvice(ring, {
            radiusM: circularConfig.radiusM,
            overlapPct: circularConfig.overlapPct,
            angleDeg: circularConfig.angleDeg,
          })
        : null,
    [
      active,
      ring,
      validation?.valid,
      circularConfig.radiusM,
      circularConfig.overlapPct,
      circularConfig.angleDeg,
    ],
  )

  // O relevo cobre os CÍRCULOS, e não só a área: os círculos saem da área
  // até um raio. Margem para os pontos exactamente no bordo.
  const circularCovers = useMemo(() => {
    if (terrain.status !== 'ready' || !planFlatOk) return false
    const b = bboxOfPoints(planFlatOk.waypoints)
    const m = 0.0005
    return Boolean(b) && bboxCovers(terrain.data?.bbox, [b[0] - m, b[1] - m, b[2] + m, b[3] + m])
  }, [terrain, planFlatOk])

  // Cota de referência única (src/mission/reference.js): base com relevo,
  // senão a mínima do relevo debaixo da rota
  const circularReference = useMemo(() => {
    const elevationAt = terrain.data?.elevationAt
    if (typeof elevationAt !== 'function' || !planFlatOk) return null
    return referenceElevation({ elevationAt, basePoint, waypoints: planFlatOk.waypoints })
  }, [terrain.data, basePoint, planFlatOk])

  // Seguimento de terreno por ponto: os índices das acções não mudam. Pedido
  // e impossível é um ERRO (o preflight bloqueia), nunca alturas planas.
  const terrainResult = useMemo(() => {
    if (!terrainFollow?.enabled || !planFlatOk) return null
    if (!circularCovers) return { error: 'terrain-not-loaded' }
    const elevationAt = terrain.data?.elevationAt
    if (typeof elevationAt !== 'function') return { error: 'terrain-not-loaded' }
    return applyCircularTerrain(planFlatOk, {
      elevationAt,
      refElev: circularReference?.elev ?? null,
      agl: altitude,
      speed: circularSpeed,
    })
  }, [
    terrainFollow,
    circularCovers,
    planFlatOk,
    terrain.data,
    circularReference,
    altitude,
    circularSpeed,
  ])

  // o plano que sai no KMZ: alturas do terreno quando há, e as estatísticas
  // da rota 3D correspondente
  const tfOk = terrainResult && !terrainResult.error ? terrainResult : null
  const circularPlan = useMemo(() => {
    if (!planFlat) return null
    if (!planFlatOk || !tfOk) return planFlat
    return {
      ...planFlatOk,
      waypoints: tfOk.waypoints,
      stats: {
        ...planFlatOk.stats,
        pathLengthM: tfOk.pathLengthM,
        flightTimeS: tfOk.flightTimeS,
        path3D: true,
        terrainMissing: tfOk.missing,
      },
    }
  }, [planFlat, planFlatOk, tfOk])
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
        terrainOk: Boolean(tfOk),
        altitude,
        speed: circularSpeed,
        wpml,
        sensorType: sensor.type,
      }),
    [missionName, circularPlanOk, tfOk, altitude, circularSpeed, wpml, sensor.type],
  )

  // seguimento de terreno pedido e sem resultado: não sai nada com alturas planas
  const tfBlocked = Boolean(terrainFollow?.enabled && !tfOk)
  const handleExportCircularSingle = useCallback(() => {
    if (!circularPlanOk || tfBlocked) return
    runExport(() => exportWPMLKmz(exportParams()))
  }, [circularPlanOk, tfBlocked, exportParams, runExport])

  const handleExportCircularBlocks = useCallback(() => {
    if (!circularPlanOk || tfBlocked || blocks.length < 2) return
    runExport(() => exportBlocksZip(exportParams(), blocks))
  }, [circularPlanOk, tfBlocked, blocks, exportParams, runExport])

  // abrir o separador cria a missão; retirá-la tira-a do projecto e do resumo
  const enableCircular = useCallback(() => {
    setCircularConfig((c) => (c.enabled ? c : { ...c, enabled: true }))
  }, [])
  const removeCircular = useCallback(() => {
    setCircularConfig((c) => ({ ...c, enabled: false }))
  }, [])

  return {
    circularConfig,
    setCircularConfig,
    setCircularParam,
    circularSpeed,
    circularTriggerWarn,
    circularPlan,
    circularAdvice,
    circularReference,
    circularTerrain: terrainResult,
    circularCovers,
    enableCircular,
    removeCircular,
    circularBlocks: blocks,
    circularUsableMin: usableMin,
    circularPreview,
    circularMaxCircles: MAX_CIRCLES,
    handleExportCircularSingle,
    handleExportCircularBlocks,
  }
}
