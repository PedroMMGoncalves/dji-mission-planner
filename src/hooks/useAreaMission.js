/**
 * Modo área, parte 2 — o plano sobre a geometria de useAreaGeometry: linhas
 * de voo (simples, dupla grelha, por célula), blocos numerados, GCPs,
 * alturas do terrain follow e as três exportações (KML da área, KML dos
 * GCPs, KMZ WPML único ou um por bloco). Corre depois de useTerrain, porque
 * as alturas dependem do relevo carregado. Toda a matemática está em
 * src/mission e src/utils; aqui só se liga estado a funções puras.
 */
import { useCallback, useMemo, useState } from 'react'
import { planArea } from '../mission/areaPlan.js'
import { planBlocks } from '../mission/blocks.js'
import { planTerrainFollow } from '../mission/terrainFollow.js'
import { buildAreaExport } from '../mission/areaExport.js'
import { downloadBlob, exportBlocksZip, exportSimpleKML, exportWPMLKmz } from '../utils/exporters.js'
import { buildGcpKML, gcpStats, planGcps, suggestedGcpCount } from '../utils/gcp.js'

export function useAreaMission({
  ring,
  validation,
  activeCells,
  basePoint,
  params,
  spacing,
  interval,
  speed,
  batteryMin,
  split,
  sensor,
  wpml,
  missionName,
  terrain,
  terrainFollow,
  terrainCovers,
  runExport,
  t,
}) {
  const [gcpConfig, setGcpConfig] = useState({ enabled: false, count: null }) // null = auto

  // B: disparo por waypoint só com câmara e intervalo válido; com LiDAR ou
  // sem óptica o plano fica no modo distância (e a opção não aparece)
  const photoMode =
    sensor.type === 'camera' && params.triggerMode === 'waypoint' && interval > 0
      ? 'waypoint'
      : 'distance'

  const plan = useMemo(() => {
    if (!ring || !validation.valid) return null
    const opts = {
      spacingM: spacing,
      angleDeg: params.angle,
      bufferPct: params.bufferPct,
      photoIntervalM: interval ?? 0,
      speed,
      crosshatch: params.crosshatch,
      includeNadir: Boolean(params.crosshatch && params.includeNadir),
      overshootM: Math.max(0, params.overshoot || 0),
      tieLine: Boolean(params.tieLine),
      photoMode,
    }
    // plano simples, ou um plano por célula com alinhamento global (src/mission/areaPlan.js)
    return planArea(ring, activeCells, opts)
  }, [photoMode, ring, validation.valid, spacing, params.angle, params.bufferPct, interval, speed, params.crosshatch, params.includeNadir, params.overshoot, params.tieLine, activeCells])

  const planOk = plan && !plan.error ? plan : null

  // Divisão em blocos de voo numerados: células da grelha, ou corte da
  // serpentina por área/bateria
  const blocks = useMemo(
    () => planBlocks(planOk, { activeCells, split, batteryMin, speed, spacingM: spacing, basePoint }),
    [planOk, activeCells, split, batteryMin, speed, spacing, basePoint],
  )

  // B: aviso brando — missões com milhares de waypoints importam lentamente
  // no Pilot 2; o limite duro do WPML (65535 índices) fica longe
  const waypointWarn = useMemo(() => {
    if (photoMode !== 'waypoint' || !planOk) return null
    const n = blocks?.length
      ? Math.max(...blocks.map((b) => b.waypoints.length))
      : planOk.waypoints.length
    return n > 2000 ? n : null
  }, [photoMode, planOk, blocks])

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
    // B: com foto por waypoint, a densificação do seguimento de terreno
    // reindexaria as acções de foto — erro explícito (e exportação bloqueada)
    // em vez de uma missão parcial com alturas planas ou fotos perdidas
    if (terrainFollow.enabled && photoMode === 'waypoint') return { error: t('cp.terrain.photoWaypoint') }
    if (!terrainFollow.enabled || !terrainCovers || !planOk?.lines?.length) return null
    try {
      const res = planTerrainFollow(terrain.data, planOk, {
        blocks,
        refPt: basePoint ?? planOk.waypoints[0],
        agl: params.altitude,
        toleranceM: terrainFollow.tolerance,
      })
      if (res.error === 'ref-outside-terrain') return { error: 'Referência fora do terreno carregado' }
      return res
    } catch (err) {
      return { error: err?.message ?? 'Falha no cálculo do terreno' }
    }
  }, [photoMode, t, terrainFollow, terrainCovers, terrain.data, planOk, blocks, basePoint, params.altitude])

  /* --------------------------- Exportação ---------------------------- */
  const safeName = missionName.trim().replace(/[^\w-]+/g, '-') || 'missao'
  const canExportKML = Boolean(ring && validation.valid)
  // B: seguir terreno + foto por waypoint é um erro explícito, não uma
  // exportação com alturas planas
  const canExportKMZ =
    Boolean(planOk && planOk.waypoints.length >= 2) && !(terrainFollow.enabled && photoMode === 'waypoint')

  const handleExportKML = useCallback(() => {
    if (canExportKML) runExport(() => exportSimpleKML(ring, safeName, basePoint, gcps, planOk?.lines ?? null))
  }, [canExportKML, runExport, ring, safeName, basePoint, gcps, planOk])

  const handleExportGcps = useCallback(() => {
    if (!gcps || gcps.length === 0) return
    downloadBlob(
      new Blob([buildGcpKML(gcps, `${safeName}-gcps`)], {
        type: 'application/vnd.google-earth.kml+xml',
      }),
      `${safeName}-gcps.kml`,
    )
  }, [gcps, safeName])

  const handleExportKMZ = useCallback(() => {
    if (!canExportKMZ) return
    // toda a montagem (nome com variantes, waypoints do terrain follow,
    // intervalos de disparo, blocos, marcador do gimbal nadir) é pura e
    // testada em src/mission/areaExport.js
    const { params: exportParams, blocks: exportBlocks } = buildAreaExport({
      missionName,
      plan: planOk,
      terrainResult,
      blocks,
      spacingM: spacing,
      photoMode,
      sensorType: sensor.type,
      altitude: params.altitude,
      speed,
      wpml,
      photoIntervalM: interval,
      triggerMode: params.triggerMode,
      gimbalPitch: params.gimbalPitch,
      crosshatch: params.crosshatch,
      includeNadir: params.includeNadir,
      tieLine: params.tieLine,
    })
    if (exportBlocks) runExport(() => exportBlocksZip(exportParams, exportBlocks))
    else runExport(() => exportWPMLKmz(exportParams))
  }, [
    canExportKMZ, missionName, planOk, terrainResult, blocks, spacing, photoMode, sensor.type,
    params.altitude, params.triggerMode, params.gimbalPitch, params.crosshatch, params.includeNadir,
    params.tieLine, speed, wpml, interval, runExport,
  ])

  return {
    gcpConfig,
    setGcpConfig,
    photoMode,
    plan,
    planOk,
    blocks,
    waypointWarn,
    gcpAutoCount,
    gcps,
    gcpInfo,
    terrainResult,
    canExportKML,
    canExportKMZ,
    handleExportKML,
    handleExportGcps,
    handleExportKMZ,
  }
}
