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
import {
  areaExportName,
  flightFiles,
  baseFolder,
  flightsArchiveName,
  selectFlights,
} from '../mission/flightFiles.js'
import {
  blockExportParams,
  downloadBlob,
  exportBlocksZip,
  exportAreaKML,
  exportWPMLKmz,
} from '../utils/exporters.js'
import { stripRouteStats } from '../utils/geo.js'
import { referenceElevation } from '../mission/reference.js'
import {
  blockLayoutKey,
  blockReferences,
  blockRing,
  computeZones,
  layoutBlocks,
} from '../mission/baseLayout.js'
import { carryOverCells } from '../mission/cellCarryOver.js'
import { nearestBase } from '../mission/bases.js'
import { buildGcpKML, gcpStats, planGcps, suggestedGcpCount } from '../utils/gcp.js'
import { DEFAULT_GCP_CONFIG } from '../mission/defaults.js'

/** Mapa vazio estável (as atribuições de outra disposição de blocos não valem). */
const NO_MAP = Object.freeze({})

/**
 * Bases múltiplas (`bases`, `blockBaseState`): cada bloco tem a sua base e
 * as alturas referem-se à zona dela (src/mission/baseLayout.js). As
 * atribuições manuais guardam a disposição de blocos em que foram feitas
 * (`blockBaseState.key`, null = adoptar a actual, ao abrir um projecto; as
 * células, `cells`, e o contorno da área, `ring`): refeito o mosaico, a
 * grelha ou o corte, passam para os blocos novos por sobreposição
 * (src/mission/cellCarryOver.js), e as que não passam são contadas
 * (`manualLost`) para o painel o dizer.
 */
export function useAreaMission({
  ring,
  holes = null,
  validation,
  activeCells,
  activeCellIds = null,
  activeCellHoles = null,
  tiles = null,
  gridCells = null,
  bases = [],
  blockBaseState = { key: null, map: {}, cells: null, ring: null, lost: 0 },
  zoneConfig = { radiusM: 100, maxReliefM: 10 },
  vlosM = 500,
  params,
  spacing,
  interval,
  speed,
  batteryMin,
  split,
  sensor,
  wpml,
  // acções de segurança da missão (src/mission/safety.js)
  safety = null,
  missionName,
  terrain,
  terrainFollow,
  terrainCovers,
  runExport,
  t,
}) {
  const [gcpConfig, setGcpConfig] = useState(() => ({ ...DEFAULT_GCP_CONFIG }))

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
      holes,
      // buracos de cada célula do mosaico, já recortados (buildSquareMosaic)
      cellHoles: activeCellHoles,
      waypointStops: params.waypointStops,
    }
    // plano simples, ou um plano por célula com alinhamento global (src/mission/areaPlan.js)
    return planArea(ring, activeCells, opts)
  }, [
    activeCellHoles,
    photoMode,
    ring,
    holes,
    validation.valid,
    spacing,
    params.angle,
    params.bufferPct,
    interval,
    speed,
    params.crosshatch,
    params.includeNadir,
    params.overshoot,
    params.tieLine,
    params.waypointStops,
    activeCells,
  ])

  const planOk = plan && !plan.error ? plan : null

  // Divisão em blocos de voo numerados: células da grelha, ou corte da
  // serpentina por área/bateria
  // (o trânsito de cada bloco vem da sua base, em layoutBlocks)
  const blocks = useMemo(
    () =>
      planBlocks(planOk, {
        activeCells,
        cellIds: activeCellIds,
        split,
        batteryMin,
        speed,
        spacingM: spacing,
        waypointStops: params.waypointStops,
      }),
    [planOk, activeCells, activeCellIds, split, batteryMin, speed, spacing, params.waypointStops],
  )

  /* ---------------- Bases: zonas, atribuição, voos -------------------- */
  const elevationAt = terrain.data?.elevationAt ?? null
  const zones = useMemo(
    () =>
      computeZones(bases, {
        elevationAt: typeof elevationAt === 'function' ? elevationAt : null,
        radiusM: zoneConfig.radiusM,
        maxReliefM: zoneConfig.maxReliefM,
      }),
    [bases, elevationAt, zoneConfig.radiusM, zoneConfig.maxReliefM],
  )
  const layoutKey = blockLayoutKey({ tiles, gridCells, blocks })
  // células da disposição de agora, com o id do bloco de cada uma: as do
  // mosaico (todas, também as desactivadas) e da grelha (posição + 1), ou o
  // contorno de cada bloco do corte da serpentina
  const layoutCells = useMemo(() => {
    if (Array.isArray(tiles) && tiles.length) return tiles.map((r, i) => ({ id: i + 1, ring: r }))
    if (Array.isArray(gridCells) && gridCells.length)
      return gridCells.map((r, i) => ({ id: i + 1, ring: r }))
    if (Array.isArray(blocks) && blocks.length)
      return blocks.map((b) => ({ id: b.id, ring: blockRing(b) }))
    return null
  }, [tiles, gridCells, blocks])
  // atribuições manuais para os blocos de agora: as guardadas, se são desta
  // disposição; senão as que passam por sobreposição; sem blocos, nenhuma
  const manualCarry = useMemo(() => {
    const st = blockBaseState
    if (st.key === null || st.key === layoutKey)
      return { map: st.map ?? NO_MAP, lost: st.lost ?? 0 }
    if (!layoutKey) return { map: NO_MAP, lost: st.lost ?? 0 }
    const res = carryOverCells({
      oldRing: st.ring,
      newRing: ring,
      oldCells: st.cells,
      newCells: layoutCells,
      manual: st.map,
    })
    return { map: res.manual, lost: res.lost }
  }, [blockBaseState, layoutKey, layoutCells, ring])
  const blockBase = manualCarry.map
  const baseLayout = useMemo(
    () =>
      layoutBlocks({
        blocks,
        bases,
        zones,
        manual: blockBase,
        vlosM,
        defaultRadiusM: zoneConfig.radiusM,
        speed,
        elevationAt: typeof elevationAt === 'function' ? elevationAt : null,
      }),
    [blocks, bases, zones, blockBase, vlosM, zoneConfig.radiusM, speed, elevationAt],
  )
  // cotas de referência por bloco (null sem bases ou sem relevo)
  const blockRefs = useMemo(() => blockReferences(blocks, baseLayout), [blocks, baseLayout])
  // base de referência quando a missão sai numa só rota: a mais próxima dela
  const refBase = useMemo(
    () => (bases.length ? nearestBase(bases, planOk?.waypoints ?? ring) : null),
    [bases, planOk, ring],
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
      return planGcps(ring, gcpConfig.count ?? gcpAutoCount, { holes })
    } catch {
      return null
    }
  }, [gcpConfig, ring, holes, validation.valid, gcpAutoCount])

  const gcpInfo = useMemo(
    () => (gcps && gcps.length > 0 ? gcpStats(ring, gcps) : null),
    [gcps, ring],
  )

  /* ------------- Cota de referencia das alturas relativas ------------- */
  // Uma so, para o perfil, o 3D, a folga ao solo e o seguimento de terreno:
  // base com relevo, senao a minima do relevo debaixo da rota (nunca 0, nunca
  // o primeiro waypoint - ver src/mission/reference.js).
  // Com bases, a zona: cada bloco na da sua base (a comum é a mais baixa,
  // para o 3D e o perfil) e uma rota única na da base de referência — a
  // cota mínima da zona, o lado seguro (takeoffZones.js).
  const reference = useMemo(() => {
    if (typeof elevationAt !== 'function' || !planOk?.waypoints?.length) return null
    const area = referenceElevation({ elevationAt, basePoint: null, waypoints: planOk.waypoints })
    if (blockRefs) return { ...area, elev: blockRefs.common, source: 'bases', baseOutside: false }
    if (refBase) {
      const z = zones[refBase.id]
      if (z && !z.error)
        return { ...area, elev: z.refElev, source: 'base', baseOutside: false, zone: z }
      // fora do relevo: a mínima da área, e o aviso de sempre
      return referenceElevation({
        elevationAt,
        basePoint: refBase.point,
        waypoints: planOk.waypoints,
      })
    }
    return area
  }, [elevationAt, planOk, blockRefs, refBase, zones])

  /* ------------- Terrain follow: alturas por waypoint ----------------- */
  const terrainResult = useMemo(() => {
    // B: com foto por waypoint, a densificação do seguimento de terreno
    // reindexaria as acções de foto — erro explícito (e exportação bloqueada)
    // em vez de uma missão parcial com alturas planas ou fotos perdidas
    if (terrainFollow.enabled && photoMode === 'waypoint')
      return { error: t('cp.terrain.photoWaypoint') }
    if (!terrainFollow.enabled || !terrainCovers || !planOk?.lines?.length) return null
    try {
      const res = planTerrainFollow(terrain.data, planOk, {
        blocks,
        refElev: reference?.elev ?? null,
        agl: params.altitude,
        toleranceM: terrainFollow.tolerance,
        // cada bloco com a cota da zona da sua base
        blockRefs: blockRefs?.refs ?? null,
      })
      if (res.error === 'ref-outside-terrain')
        return { error: 'Referência fora do terreno carregado' }
      return res
    } catch (err) {
      return { error: err?.message ?? 'Falha no cálculo do terreno' }
    }
  }, [
    photoMode,
    t,
    terrainFollow,
    terrainCovers,
    terrain.data,
    planOk,
    blocks,
    reference,
    blockRefs,
    params.altitude,
  ])

  // Com seguimento de terreno os waypoints levam altura e a rota real e a
  // 3D — e e essa que o Pilot 2 escreve em `wpml:distance`. Sem esta
  // correccao o comprimento sai curto ate ~2 % em terreno acidentado, e o
  // erro e sempre optimista: menos rota, menos tempo, menos baterias. A
  // geometria nao muda; so as estatisticas mostradas e usadas no preflight.
  const planRoute = useMemo(() => {
    const wps = terrainResult && !terrainResult.error ? terrainResult.waypoints : null
    if (!planOk || !wps?.length) return plan
    // com 'all' conta também as paragens nos vértices do terreno
    const { pathLengthM, flightTimeS } = stripRouteStats(wps, {
      speed,
      lineCount: planOk.lines.length,
      perLine: terrainResult.perLine,
      waypointStops: params.waypointStops,
    })
    return { ...planOk, stats: { ...planOk.stats, pathLengthM, flightTimeS, path3D: true } }
  }, [plan, planOk, terrainResult, speed, params.waypointStops])
  const planRouteOk = planRoute && !planRoute.error ? planRoute : null

  /* --------------------------- Exportação ---------------------------- */
  const safeName = missionName.trim().replace(/[^\w-]+/g, '-') || 'missao'
  const canExportKML = Boolean(ring && validation.valid)
  // B: seguir terreno + foto por waypoint é um erro explícito, não uma
  // exportação com alturas planas
  const canExportKMZ =
    Boolean(planOk && planOk.waypoints.length >= 2) &&
    !(terrainFollow.enabled && photoMode === 'waypoint')

  const handleExportKML = useCallback(() => {
    if (canExportKML)
      // Area-only: e o ficheiro que o Pilot 2 aceita para definir a area, e
      // e esse o caso de uso. O ponto de base, os GCPs e as faixas ficam de
      // fora de proposito (os GCPs tem exportacao propria).
      runExport(() => exportAreaKML(ring, safeName, { holes }))
  }, [canExportKML, runExport, ring, holes, safeName])

  const handleExportGcps = useCallback(() => {
    if (!gcps || gcps.length === 0) return
    downloadBlob(
      new Blob([buildGcpKML(gcps, `${safeName}-gcps`)], {
        type: 'application/vnd.google-earth.kml+xml',
      }),
      `${safeName}-gcps.kml`,
    )
  }, [gcps, safeName])

  // Voos pela ordem de voo e o nome do KMZ de cada um (o mesmo que a
  // exportação escreve): para o painel das bases, a checklist e o KML
  const terrainOk = Boolean(terrainResult && !terrainResult.error)
  const exportBaseName = areaExportName({
    missionName,
    crosshatch: params.crosshatch,
    includeNadir: params.includeNadir,
    tieLine: params.tieLine,
    terrainOk,
  })
  const flightFileList = useMemo(
    () =>
      blocks && blocks.length > 1
        ? flightFiles({
            baseName: exportBaseName,
            blockIds: blocks.map((b) => b.id),
            layout: baseLayout,
          })
        : [],
    [blocks, exportBaseName, baseLayout],
  )

  /**
   * Exporta a missão: um KMZ sem divisão; com blocos, a escolha `sel` —
   * todos os voos (ZIP `_voos`), os de uma base (ZIP `_base-B`) ou um voo
   * (KMZ `_A-1`), sempre pela ordem de voo (src/mission/flightFiles.js).
   * @param {import('../mission/flightFiles.js').FlightSelection} [sel]
   */
  const handleExportFlights = useCallback(
    (sel = { kind: 'all' }) => {
      if (!canExportKMZ) return
      // toda a montagem (nome com variantes, waypoints do terrain follow,
      // intervalos de disparo, blocos pela ordem de voo, marcador do gimbal
      // nadir) é pura e testada em src/mission/areaExport.js
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
        waypointStops: params.waypointStops,
        layout: baseLayout,
        safety,
      })
      if (!exportBlocks) {
        runExport(() => exportWPMLKmz(exportParams))
        return
      }
      const chosen = selectFlights(exportBlocks, sel)
      if (chosen.length === 0) return
      if (sel?.kind === 'flight') {
        runExport(() => exportWPMLKmz(blockExportParams(exportParams, chosen[0])))
        return
      }
      // por base: uma pasta por base (cada piloto leva as das suas bases)
      const byBase = { folderOf: (b) => baseFolder(b.baseLabel) }
      if (sel?.kind === 'both') {
        // o cabeçalho com bases: os dois ZIP, soltos e por base
        runExport(async () => {
          await exportBlocksZip(exportParams, chosen, flightsArchiveName(exportParams.name, sel))
          await exportBlocksZip(
            exportParams,
            chosen,
            flightsArchiveName(exportParams.name, { kind: 'byBase' }),
            byBase,
          )
        })
        return
      }
      const zipName = flightsArchiveName(exportParams.name, sel, chosen[0].baseLabel)
      runExport(() =>
        exportBlocksZip(exportParams, chosen, zipName, sel?.kind === 'byBase' ? byBase : {}),
      )
    },
    [
      canExportKMZ,
      missionName,
      planOk,
      terrainResult,
      blocks,
      spacing,
      photoMode,
      sensor.type,
      params.altitude,
      params.triggerMode,
      params.gimbalPitch,
      params.crosshatch,
      params.includeNadir,
      params.tieLine,
      params.waypointStops,
      speed,
      wpml,
      interval,
      runExport,
      baseLayout,
      safety,
    ],
  )

  // o botão do cabeçalho: a missão inteira (todos os voos); com bases, os
  // dois ZIP (todos soltos e numa pasta por base)
  const hasBases = Boolean(baseLayout?.hasBases && blocks?.length)
  const handleExportKMZ = useCallback(
    () => handleExportFlights({ kind: hasBases ? 'both' : 'all' }),
    [handleExportFlights, hasBases],
  )

  return {
    gcpConfig,
    setGcpConfig,
    photoMode,
    plan: planRoute,
    planOk: planRouteOk,
    blocks,
    waypointWarn,
    gcpAutoCount,
    gcps,
    gcpInfo,
    terrainResult,
    reference,
    zones,
    baseLayout,
    blockRefs,
    refBase,
    layoutKey,
    layoutCells,
    blockBase,
    manualLost: manualCarry.lost,
    canExportKML,
    canExportKMZ,
    handleExportKML,
    handleExportGcps,
    handleExportKMZ,
    handleExportFlights,
    flightFiles: flightFileList,
    exportBaseName,
    safeName,
  }
}
