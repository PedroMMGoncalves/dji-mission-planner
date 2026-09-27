/**
 * Modo corredor: configuração, plano, pré-visualização, desenho do eixo e
 * exportação. Estado e ligação à interface; a geometria está em
 * utils/corridor.js e os parâmetros de exportação em mission/exportParams.js.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  DEFAULT_CORRIDOR_CONFIG,
  corridorBufferRing,
  generateCorridorPlan,
} from '../utils/corridor.js'
import { corridorExportParams } from '../mission/exportParams.js'
import {
  baseToRouteM,
  bboxCovers,
  bboxOfPoints,
  planCorridorTerrain,
} from '../mission/corridorTerrain.js'
import { referenceElevation } from '../mission/reference.js'
import { exportWPMLKmz } from '../utils/exporters.js'

export function useCorridorMission({
  sensor,
  speedRange,
  altitude,
  sideOverlap,
  interval,
  missionMode,
  setMode,
  setDraftVertices,
  avisoObturador,
}) {
  const [corridorConfig, setCorridorConfig] = useState(DEFAULT_CORRIDOR_CONFIG)

  // A velocidade guardada pode exceder a aeronave (o painel aceita até
  // 25 m/s): o plano e a exportação usam sempre a versão limitada.
  const corridorSpeed = Math.min(speedRange.max, Math.max(speedRange.min, corridorConfig.speedMS))
  const corridorTriggerWarn = useMemo(
    () => avisoObturador(corridorSpeed),
    [avisoObturador, corridorSpeed],
  )

  const setCorridorParam = useCallback((key, value) => {
    setCorridorConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startCorridorDraw = useCallback(() => {
    setMode((m) => (m === 'corridor' ? 'idle' : 'corridor'))
    setDraftVertices([])
  }, [setMode, setDraftVertices])

  const handleFinishCorridor = useCallback(() => {
    setDraftVertices((draft) => {
      const EPS = 1e-6
      const clean = draft.filter(
        (v, i) =>
          i === 0 ||
          Math.abs(v[0] - draft[i - 1][0]) > EPS ||
          Math.abs(v[1] - draft[i - 1][1]) > EPS,
      )
      if (clean.length >= 2) {
        setCorridorConfig((c) => ({ ...c, centreline: clean }))
        setMode('idle')
        return []
      }
      return draft
    })
  }, [setMode, setDraftVertices])

  const clearCorridorAxis = useCallback(() => {
    setCorridorConfig((c) => ({ ...c, centreline: null }))
    setDraftVertices([])
    setMode('idle')
  }, [setMode, setDraftVertices])

  // Sem guarda de missionMode, tal como os planos de fachada e órbita: o
  // resumo do projecto agrega os planos que EXISTEM, seja qual for o
  // separador aberto. A pré-visualização é que depende do modo.
  const corridorPlan = useMemo(() => {
    if (!corridorConfig.centreline) return null
    return generateCorridorPlan(corridorConfig.centreline, {
      sensor,
      altitude,
      bufferM: corridorConfig.bufferM,
      sideOverlapPct: sideOverlap,
      photoIntervalM: interval ?? 0,
      speed: corridorSpeed,
      photoMode: corridorConfig.photoMode,
      simplifyM: corridorConfig.simplifyM,
      waypointStops: corridorConfig.waypointStops,
    })
  }, [corridorConfig, corridorSpeed, sensor, altitude, sideOverlap, interval])

  const corridorPreview = useMemo(() => {
    if (missionMode !== 'corridor') return null
    const axis = corridorConfig.centreline
    if (!axis || axis.length < 2) return null
    return {
      centreline: axis,
      buffer: corridorBufferRing(axis, corridorConfig.bufferM),
      passes: corridorPlan && !corridorPlan.error ? corridorPlan.lines : null,
    }
  }, [missionMode, corridorConfig.centreline, corridorConfig.bufferM, corridorPlan])

  // caixa do corredor para o relevo: a faixa coberta, antes de haver plano
  const corridorBbox = useMemo(
    () => bboxOfPoints(corridorBufferRing(corridorConfig.centreline, corridorConfig.bufferM)),
    [corridorConfig.centreline, corridorConfig.bufferM],
  )

  return {
    corridorConfig,
    setCorridorConfig,
    setCorridorParam,
    corridorSpeed,
    corridorTriggerWarn,
    corridorPlan,
    corridorBbox,
    corridorPreview,
    startCorridorDraw,
    handleFinishCorridor,
    clearCorridorAxis,
  }
}

// margem para a amostragem dos lados da faixa (±30 m) e para as ligações
const COVER_MARGIN_DEG = 0.001

/**
 * Corredor, parte 2 — depois do relevo: cobertura, cota de referência,
 * seguimento de terreno e exportação. Separado de useCorridorMission porque
 * o relevo a carregar depende da caixa do corredor (que sai da parte 1) e o
 * seguimento de terreno depende do relevo carregado.
 */
export function useCorridorRoute({
  corridorPlan: planFlat,
  corridorConfig,
  corridorSpeed,
  terrain,
  terrainFollow,
  basePoint,
  altitude,
  interval,
  missionName,
  wpml,
  sensorType,
  runExport,
}) {
  const planOk = planFlat && !planFlat.error ? planFlat : null

  // o relevo carregado cobre a rota (com margem para os lados da faixa)?
  const corridorCovers = useMemo(() => {
    if (terrain.status !== 'ready' || !planOk) return false
    const b = bboxOfPoints(planOk.waypoints)
    if (!b) return false
    const m = COVER_MARGIN_DEG
    return bboxCovers(terrain.data?.bbox, [b[0] - m, b[1] - m, b[2] + m, b[3] + m])
  }, [terrain, planOk])

  // Cota de referência única (src/mission/reference.js), como na área: base
  // com relevo, senão a mínima do relevo debaixo da rota
  const corridorReference = useMemo(() => {
    const elevationAt = terrain.data?.elevationAt
    if (!corridorCovers || typeof elevationAt !== 'function') return null
    return referenceElevation({ elevationAt, basePoint, waypoints: planOk.waypoints })
  }, [corridorCovers, terrain.data, basePoint, planOk])

  const corridorTerrain = useMemo(() => {
    if (!terrainFollow?.enabled || !planOk) return null
    if (!corridorCovers) return { error: 'terrain-not-loaded' }
    try {
      return planCorridorTerrain(terrain.data, planOk, {
        refElev: corridorReference?.elev ?? null,
        agl: altitude,
        toleranceM: terrainFollow.tolerance,
        speed: corridorSpeed,
        waypointStops: corridorConfig.waypointStops,
      })
    } catch (err) {
      return { error: err?.message ?? 'terrain-failed' }
    }
  }, [
    terrainFollow,
    planOk,
    corridorCovers,
    terrain.data,
    corridorReference,
    altitude,
    corridorSpeed,
    corridorConfig.waypointStops,
  ])
  const tfOk = corridorTerrain && !corridorTerrain.error ? corridorTerrain : null

  // o plano que sai no KMZ e que o resto da app mostra: alturas do terreno
  // quando as há, e a rota 3D correspondente nas estatísticas
  const corridorRoute = useMemo(() => {
    if (!planFlat || !planOk || !tfOk) return planFlat
    return {
      ...planOk,
      waypoints: tfOk.waypoints,
      stats: {
        ...planOk.stats,
        waypointCount: tfOk.waypoints.length,
        pathLengthM: tfOk.pathLengthM,
        flightTimeS: tfOk.flightTimeS,
        path3D: true,
      },
    }
  }, [planFlat, planOk, tfOk])

  const corridorBaseDistance = useMemo(
    () => (planOk ? baseToRouteM(basePoint, planOk.waypoints) : null),
    [basePoint, planOk],
  )

  const handleExportCorridor = useCallback(() => {
    if (!planOk) return
    // seguimento de terreno pedido e impossível: o preflight bloqueia, e
    // aqui também não sai nada com alturas planas
    if (terrainFollow?.enabled && !tfOk) return
    runExport(() =>
      exportWPMLKmz(
        corridorExportParams({
          missionName,
          plan: planOk,
          photoMode: corridorConfig.photoMode,
          altitude,
          speed: corridorSpeed,
          wpml,
          photoIntervalM: interval,
          sensorType,
          waypointStops: corridorConfig.waypointStops,
          terrainResult: tfOk,
        }),
      ),
    )
  }, [
    planOk,
    terrainFollow,
    tfOk,
    corridorConfig.photoMode,
    corridorConfig.waypointStops,
    corridorSpeed,
    missionName,
    altitude,
    wpml,
    interval,
    sensorType,
    runExport,
  ])

  return {
    corridorRoute,
    corridorTerrain,
    corridorReference,
    corridorCovers,
    corridorBaseDistance,
    handleExportCorridor,
  }
}
