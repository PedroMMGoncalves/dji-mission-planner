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
  corridorRouteWithTerrain,
  planCorridorTerrain,
} from '../mission/corridorTerrain.js'
import { baseZoneFor, referenceElevation } from '../mission/reference.js'
import { exportWPMLKmz } from '../utils/exporters.js'
import { finishDraft } from '../mission/draft.js'
import { corridorPhotoPoints, photoPositions2d, photosAtWaypoints } from '../mission/photoPoints.js'
import { computeFootprint, photoInterval } from '../utils/geo.js'
import { corridorFlightRoutes, planCorridorFlights } from '../mission/corridorFlights.js'
import { exportBlocksZip } from '../utils/exporters.js'

/** Cores dos voos de um corredor partido (as dos blocos da área). */
const FLIGHT_COLORS = ['#fde047', '#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c4b5fd']

export function useCorridorMission({
  sensor,
  speedRange,
  // altura e sobreposições do separador Área: valem quando o corredor não
  // tem as suas (corridorConfig.ownParams)
  altitude: areaAltitude,
  frontOverlap: areaFrontOverlap,
  sideOverlap: areaSideOverlap,
  missionMode,
  setMode,
  setDraftVertices,
  draftVertices = [],
  // (intervaloM, velocidade) → aviso do obturador ou null
  avisoIntervalo,
  // tempo útil por voo (min), para a divisão em voos por bateria
  usableMin = null,
}) {
  const [corridorConfig, setCorridorConfig] = useState(DEFAULT_CORRIDOR_CONFIG)

  // A velocidade guardada pode exceder a aeronave (o painel aceita até
  // 25 m/s): o plano e a exportação usam sempre a versão limitada.
  const corridorSpeed = Math.min(speedRange.max, Math.max(speedRange.min, corridorConfig.speedMS))
  // altura, sobreposições e intervalo de disparo do corredor: os próprios ou
  // os da área; o intervalo é sempre o automático (pegada × (1 − frontal))
  const own = corridorConfig.ownParams === true
  const altitude = own ? corridorConfig.altitude : areaAltitude
  const frontOverlap = own ? corridorConfig.frontOverlap : areaFrontOverlap
  const sideOverlap = own ? corridorConfig.sideOverlap : areaSideOverlap
  const interval = useMemo(
    () => photoInterval(computeFootprint(sensor, altitude).along, frontOverlap),
    [sensor, altitude, frontOverlap],
  )
  const corridorFlight = useMemo(
    () => ({ own, altitude, frontOverlap, sideOverlap, interval }),
    [own, altitude, frontOverlap, sideOverlap, interval],
  )
  const corridorTriggerWarn = useMemo(
    () => avisoIntervalo(interval, corridorSpeed),
    [avisoIntervalo, interval, corridorSpeed],
  )

  const setCorridorParam = useCallback((key, value) => {
    setCorridorConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startCorridorDraw = useCallback(() => {
    setMode((m) => (m === 'corridor' ? 'idle' : 'corridor'))
    setDraftVertices([])
  }, [setMode, setDraftVertices])

  const handleFinishCorridor = useCallback(() => {
    const { ok, clean } = finishDraft(draftVertices, 2)
    if (!ok) return
    setCorridorConfig((c) => ({ ...c, centreline: clean }))
    setMode('idle')
    setDraftVertices([])
  }, [draftVertices, setMode, setDraftVertices])

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

  // Divisão em voos por bateria: troços do eixo, cada um com o seu plano;
  // `flights` só com mais de um voo, `error` quando não cabe
  const corridorSplit = useMemo(() => {
    if (corridorConfig.split !== 'battery' || !corridorConfig.centreline) return null
    const r = planCorridorFlights(
      corridorConfig.centreline,
      {
        sensor,
        altitude,
        bufferM: corridorConfig.bufferM,
        sideOverlapPct: sideOverlap,
        photoIntervalM: interval ?? 0,
        speed: corridorSpeed,
        photoMode: corridorConfig.photoMode,
        simplifyM: corridorConfig.simplifyM,
        waypointStops: corridorConfig.waypointStops,
      },
      { usableS: usableMin > 0 ? usableMin * 60 : null },
    )
    if (r.error) return { flights: null, error: r.error }
    return { flights: r.flights.length > 1 ? r.flights : null, error: null }
  }, [corridorConfig, corridorSpeed, sensor, altitude, sideOverlap, interval, usableMin])

  const corridorPreview = useMemo(() => {
    if (missionMode !== 'corridor') return null
    const axis = corridorConfig.centreline
    if (!axis || axis.length < 2) return null
    const planOk = corridorPlan && !corridorPlan.error ? corridorPlan : null
    // com vários voos, as passagens e as fotos de cada um (na cor do voo)
    const flights = corridorSplit?.flights ?? null
    if (flights) {
      return {
        centreline: axis,
        buffer: corridorBufferRing(axis, corridorConfig.bufferM),
        passes: null,
        pieces: flights.map((f, i) => ({
          label: f.label,
          passes: f.plan.lines,
          color: FLIGHT_COLORS[i % FLIGHT_COLORS.length],
          start: f.plan.waypoints[0] ?? null,
        })),
        photos: flights.flatMap((f) =>
          corridorConfig.photoMode === 'waypoint'
            ? photoPositions2d(photosAtWaypoints(f.plan.waypoints, f.plan.perWaypoint))
            : interval > 0
              ? corridorPhotoPoints(f.plan, interval)
              : [],
        ),
      }
    }
    return {
      centreline: axis,
      buffer: corridorBufferRing(axis, corridorConfig.bufferM),
      passes: planOk ? planOk.lines : null,
      // fotos por distância, com os grupos de disparo da exportação; por
      // waypoint, os waypoints com a acção de foto
      photos: !planOk
        ? null
        : corridorConfig.photoMode === 'waypoint'
          ? photoPositions2d(photosAtWaypoints(planOk.waypoints, planOk.perWaypoint))
          : interval > 0
            ? corridorPhotoPoints(planOk, interval)
            : null,
    }
  }, [
    missionMode,
    corridorConfig.centreline,
    corridorConfig.bufferM,
    corridorConfig.photoMode,
    corridorPlan,
    corridorSplit,
    interval,
  ])

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
    corridorFlight,
    corridorSplit,
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
  // zona de descolagem da base (radius/maxRelief do equipamento): a cota de
  // referência é a mínima da zona, como na área
  zoneConfig = null,
  baseRadiusM = null,
  altitude,
  interval,
  missionName,
  wpml,
  // acções de segurança da missão (src/mission/safety.js)
  safety = null,
  sensorType,
  runExport,
  // divisão em voos (parte 1) e as bases do projecto: cada voo com a sua
  corridorSplit = null,
  bases = [],
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
    const ref = referenceElevation({ elevationAt, basePoint, waypoints: planOk.waypoints })
    // a cota do PONTO da base baixava o voo até ao desnível da zona quando se
    // descolava na mínima dela (M2-T6): a mínima da zona, como a área
    const zone = baseZoneFor(basePoint, { elevationAt, zoneConfig, baseRadiusM })
    return zone ? { ...ref, elev: zone.refElev, source: 'base', baseOutside: false, zone } : ref
  }, [corridorCovers, terrain.data, basePoint, planOk, zoneConfig, baseRadiusM])

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

  // Vários voos: cada um com a sua base, referência e seguimento de terreno,
  // e a rota de todos junta (src/mission/corridorFlights.js)
  const split = useMemo(() => {
    const flights = corridorSplit?.flights
    if (!flights || !planOk) return null
    return corridorFlightRoutes(flights, {
      bases,
      elevationAt: corridorCovers ? terrain.data?.elevationAt : null,
      zoneConfig,
      terrainFollow,
      terrainData: corridorCovers ? terrain.data : null,
      altitude,
      speed: corridorSpeed,
      waypointStops: corridorConfig.waypointStops,
    })
  }, [
    corridorSplit,
    planOk,
    bases,
    corridorCovers,
    terrain,
    zoneConfig,
    terrainFollow,
    altitude,
    corridorSpeed,
    corridorConfig.waypointStops,
  ])

  // o plano que sai no KMZ e que o resto da app mostra: alturas do terreno
  // quando as há, com as acções por waypoint reindexadas, e a rota 3D
  // correspondente nas estatísticas; com vários voos, a rota junta (com
  // `breaks`) e as estatísticas somadas
  const corridorRoute = useMemo(() => {
    if (!split) return corridorRouteWithTerrain(planFlat, planOk, tfOk)
    const times = split.routes.map((r) => r.route.stats?.flightTimeS ?? 0)
    const sum = (k) => split.routes.reduce((n, r) => n + (r.route.stats?.[k] ?? 0), 0)
    return {
      ...planOk,
      waypoints: split.combined.waypoints,
      perWaypoint: split.combined.perWaypoint,
      breaks: split.combined.breaks,
      flights: split.routes,
      stats: {
        ...planOk.stats,
        waypointCount: split.combined.waypoints.length,
        pathLengthM: sum('pathLengthM'),
        flightTimeS: sum('flightTimeS'),
        photoCount: planOk.stats.photoCount != null ? sum('photoCount') : null,
        flightCount: split.routes.length,
        longestFlightS: Math.max(...times),
        path3D: Boolean(tfOk) || split.routes.some((r) => r.route.stats?.path3D),
      },
    }
  }, [split, planFlat, planOk, tfOk])

  const corridorBaseDistance = useMemo(() => {
    if (!planOk) return null
    if (!split) return baseToRouteM(basePoint, planOk.waypoints)
    // o voo mais longe da sua base
    const d = split.routes
      .map((r) => (r.base ? baseToRouteM(r.base.point, r.plan.waypoints) : null))
      .filter((v) => Number.isFinite(v))
    return d.length ? Math.max(...d) : null
  }, [basePoint, planOk, split])

  // com vários voos: a referência comum (a menor) e o seguimento de terreno
  // de todos (o primeiro erro, ou o relevo de todos)
  const splitReference = useMemo(() => {
    if (!split) return null
    const refs = split.routes.map((r) => r.reference).filter(Boolean)
    if (refs.length === 0 || !Number.isFinite(split.combined.refElev)) return null
    const fin = (k, f) => {
      const v = refs.map((r) => r[k]).filter((x) => Number.isFinite(x))
      return v.length ? f(...v) : null
    }
    const tMin = fin('terrainMin', Math.min)
    const tMax = fin('terrainMax', Math.max)
    return {
      elev: split.combined.refElev,
      source: refs.every((r) => r.source === 'base') ? 'base' : 'area-min',
      baseOutside: refs.some((r) => r.baseOutside),
      terrainMin: tMin,
      terrainMax: tMax,
      reliefM: tMin != null && tMax != null ? tMax - tMin : null,
      // cada voo tem a sua zona (em flights); não há uma zona comum
      zone: null,
    }
  }, [split])
  const splitTerrain = useMemo(() => {
    if (!split || !terrainFollow?.enabled) return null
    const bad = split.routes.find((r) => r.terrain?.error)
    if (bad) return { error: bad.terrain.error }
    const tfs = split.routes.map((r) => r.terrain).filter(Boolean)
    if (tfs.length === 0) return null
    return {
      waypoints: split.combined.waypoints,
      refElev: split.combined.refElev,
      elevMin: Math.min(...tfs.map((x) => x.elevMin)),
      elevMax: Math.max(...tfs.map((x) => x.elevMax)),
      warnings: tfs.flatMap((x) => x.warnings ?? []),
    }
  }, [split, terrainFollow])

  const handleExportCorridor = useCallback(() => {
    if (!planOk) return
    // vários voos: um KMZ por voo, num ZIP, cada um com a sua referência
    if (split) {
      if (terrainFollow?.enabled && split.routes.some((r) => !r.terrain || r.terrain.error)) return
      const perFlight = split.routes.map((r) =>
        corridorExportParams({
          missionName: `${missionName}_${r.label}`,
          plan: r.plan,
          photoMode: corridorConfig.photoMode,
          altitude,
          speed: corridorSpeed,
          wpml,
          photoIntervalM: interval,
          sensorType,
          waypointStops: corridorConfig.waypointStops,
          terrainResult: r.terrain && !r.terrain.error ? r.terrain : null,
          safety,
        }),
      )
      const blocks = perFlight.map((p, i) => ({
        id: i + 1,
        name: p.name,
        waypoints: p.waypoints,
        perWaypoint: p.perWaypoint ?? null,
        triggerRanges: p.triggerRanges ?? null,
        passThrough: p.passThrough ?? null,
        durationS: p.durationS ?? null,
      }))
      runExport(() => exportBlocksZip(perFlight[0], blocks, `${missionName}_corridor_voos`))
      return
    }
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
          safety,
        }),
      ),
    )
  }, [
    planOk,
    split,
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
    safety,
    runExport,
  ])

  return {
    corridorRoute,
    // com vários voos, o seguimento e a referência de todos
    corridorTerrain: split ? splitTerrain : corridorTerrain,
    corridorReference: split ? splitReference : corridorReference,
    corridorCovers,
    corridorBaseDistance,
    handleExportCorridor,
  }
}
