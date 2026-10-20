/**
 * Fichas de campo: uma por base com a área dividida em blocos, ou a da rota
 * única com a base marcada (área sem blocos, corredor, circular), com os
 * parâmetros que o piloto confere no Pilot 2, a linha do dia contra os
 * conjuntos de baterias, e os KML que as levam (bases e blocos; KML por
 * base) com as notas do KML da área.
 */
import { useCallback, useMemo } from 'react'
import { buildBasesKML } from '../mission/basesKml.js'
import { blocksKmlByBase } from '../mission/blocksKml.js'
import {
  baseFieldSheets,
  daySummary,
  heightsOfWaypoints,
  singleRouteSheet,
} from '../mission/fieldSheet.js'
import {
  buildFilesZip,
  DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
  downloadBlob,
} from '../utils/exporters.js'
import { computeGSD } from '../utils/geo.js'

export function useFieldSheets({
  hw,
  areaParams,
  corridor,
  geom,
  corridorOnTerrain,
  area,
  circular,
  ops,
  viewshedState,
  baseActions,
  routeView,
  safetyChecks,
  missionMode,
  corridorBase,
  circularBase,
  t,
  runExport,
  missionName,
}) {
  const { drone, equipment, vlosM, sensor, missionBatteryType, batteryMin } = hw
  const { params, speed, spacing, gsd } = areaParams
  const { corridorSpeed, corridorFlight } = corridor
  const { ring, holes, importParts, gridCells, disabledTiles } = geom
  const { corridorReference } = corridorOnTerrain
  const {
    planOk,
    blocks,
    terrainResult,
    zones,
    baseLayout,
    refBase,
    flightFiles,
    exportBaseName,
    safeName: areaSafeName,
  } = area
  const { circularConfig, circularSpeed, circularFlight, circularReference } = circular
  const { perBlockBases, areaRouteOps, corridorRouteOps, circularRouteOps, modeStats } = ops
  const { viewTerrain, viewshedByBlock } = viewshedState
  const { baseRows } = baseActions
  const { view3d } = routeView
  const { rthInfo } = safetyChecks
  // os parâmetros que o piloto confere no Pilot 2, na ficha (M3-U10)
  // (no corredor, a altura e as sobreposições que o corredor usa: as suas ou as da área)
  const sheetParams = useMemo(
    () =>
      missionMode === 'corridor'
        ? {
            altitudeM: corridorFlight.altitude,
            speedMS: corridorSpeed,
            frontPct: corridorFlight.frontOverlap,
            sidePct: corridorFlight.sideOverlap,
            gsdCm: computeGSD(sensor, corridorFlight.altitude, -90),
          }
        : missionMode === 'circular'
          ? {
              altitudeM: circularFlight.altitude,
              speedMS: circularSpeed,
              frontPct: circularFlight.frontOverlap,
              sidePct: circularConfig.overlapPct,
              gsdCm: computeGSD(sensor, circularFlight.altitude, circularConfig.gimbalPitch),
            }
          : {
              altitudeM: params.altitude,
              speedMS: speed,
              frontPct: params.frontOverlap,
              sidePct: params.sideOverlap,
              gsdCm: Number.isFinite(gsd) ? gsd : null,
            },
    [
      missionMode,
      corridorFlight,
      corridorSpeed,
      circularFlight,
      circularSpeed,
      circularConfig.overlapPct,
      circularConfig.gimbalPitch,
      sensor,
      params.altitude,
      params.frontOverlap,
      params.sideOverlap,
      speed,
      gsd,
    ],
  )
  // a ficha de uma rota única com a base marcada (área sem blocos, corredor,
  // circular): a mesma forma das fichas por base, com um só voo (M3-U10)
  const singleSheet = useMemo(() => {
    if (perBlockBases) return null
    const pick =
      missionMode === 'area'
        ? {
            base: refBase,
            zone: refBase ? zones[refBase.id] : null,
            ops: areaRouteOps,
            timeS: planOk?.stats?.flightTimeS,
            file: `${exportBaseName}.kmz`,
          }
        : missionMode === 'corridor'
          ? {
              base: corridorBase,
              zone: corridorReference?.zone ?? null,
              ops: corridorRouteOps,
              timeS: modeStats?.flightTimeS,
              file: null,
            }
          : missionMode === 'circular'
            ? {
                base: circularBase,
                zone: circularReference?.zone ?? null,
                ops: circularRouteOps,
                timeS: modeStats?.flightTimeS,
                file: null,
              }
            : null
    if (!pick?.base?.point || !Number.isFinite(pick.timeS)) return null
    const z = pick.zone && !pick.zone.error ? pick.zone : null
    return singleRouteSheet({
      label: pick.base.label ?? 'A',
      color: pick.base.color ?? null,
      point: pick.base.point,
      radiusM: z?.radiusM ?? pick.base.radiusM ?? equipment.zoneRadiusM,
      requestedRadiusM: z?.requestedRadiusM ?? null,
      reduced: Boolean(z?.reduced),
      cause: z?.cause ?? null,
      noTerrain: Boolean(pick.zone?.error),
      refElev: z?.refElev ?? view3d?.refElev ?? null,
      gainM: z?.gainM ?? null,
      flightLabel: '1',
      file: pick.file,
      flightS: pick.timeS,
      transitS: pick.ops?.transitS ?? 0,
      vlosM,
      worstVlosM: pick.ops?.vlosWorstM ?? null,
      rthM: rthInfo?.maxM ?? null,
      takeoffM: rthInfo?.takeoffM ?? DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
      heights: heightsOfWaypoints(view3d?.waypoints, params.altitude),
      usefulS: batteryMin > 0 ? batteryMin * 60 : null,
      params: sheetParams,
      equipment,
      aircraftId: drone.aircraftId,
      batteryId: missionBatteryType.id,
      baseWord: t('bases.label', { label: '' }).trim(),
    })
  }, [
    perBlockBases,
    missionMode,
    refBase,
    zones,
    areaRouteOps,
    planOk,
    exportBaseName,
    corridorBase,
    corridorReference,
    corridorRouteOps,
    circularBase,
    circularReference,
    circularRouteOps,
    modeStats,
    equipment,
    view3d,
    vlosM,
    rthInfo,
    params.altitude,
    batteryMin,
    sheetParams,
    drone.aircraftId,
    missionBatteryType.id,
    t,
  ])
  // ficha de campo por base (checklist, relatório e KML «Bases e blocos»):
  // com a área dividida em blocos e bases marcadas, ou a rota única com base
  const fieldSheets = useMemo(
    () =>
      perBlockBases
        ? baseFieldSheets({
            rows: baseRows,
            layout: baseLayout,
            blocks,
            files: flightFiles,
            vlosM,
            equipment,
            aircraftId: drone.aircraftId,
            batteryId: missionBatteryType.id,
            baseWord: t('bases.label', { label: '' }).trim(),
            viewsheds: viewshedByBlock,
            viewTerrain,
            rthByFlight: rthInfo?.byFlight ?? null,
            takeoffM: rthInfo?.takeoffM ?? DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
            heightsOf: (id) => {
              const tfOk = terrainResult && !terrainResult.error
              const src = tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
              return heightsOfWaypoints(src?.find((b) => b.id === id)?.waypoints, params.altitude)
            },
            usefulS: batteryMin > 0 ? batteryMin * 60 : null,
            params: sheetParams,
          })
        : singleSheet
          ? [singleSheet]
          : [],
    [
      viewshedByBlock,
      viewTerrain,
      perBlockBases,
      baseRows,
      baseLayout,
      blocks,
      flightFiles,
      vlosM,
      equipment,
      drone.aircraftId,
      missionBatteryType.id,
      t,
      rthInfo,
      terrainResult,
      params.altitude,
      batteryMin,
      sheetParams,
      singleSheet,
    ],
  )
  // a linha do dia por cima das fichas: todos os voos contra os conjuntos da equipa
  const fieldSheetsDay = useMemo(
    () =>
      daySummary(fieldSheets, {
        equipment,
        aircraftId: drone.aircraftId,
        batteryId: missionBatteryType.id,
      }),
    [fieldSheets, equipment, drone.aircraftId, missionBatteryType.id],
  )
  // avisos do KML da área (K-B1, K-E1 e K-M8 da revisão da exportação): o
  // ficheiro para o Pilot 2 leva só o anel exterior da maior parte, com as
  // células desactivadas dentro; vão no título dos dois botões e no cartão 7
  const areaKmlNotes = useMemo(() => {
    const notes = []
    const nHoles = holes?.length ?? 0
    if (nHoles) notes.push(t(nHoles === 1 ? 'app.kmlHoleNote' : 'app.kmlHolesNote', { n: nHoles }))
    const parts = gridCells?.length > 1 ? gridCells.length : (importParts?.length ?? 0)
    if (parts > 1) notes.push(t('app.kmlPartsNote', { n: parts }))
    const off = disabledTiles?.size ?? 0
    if (off) notes.push(t(off === 1 ? 'app.kmlCellNote' : 'app.kmlCellsNote', { n: off }))
    return notes
  }, [holes, gridCells, importParts, disabledTiles, t])
  const exportKmlTitle = [t('app.exportKmlTitle'), ...areaKmlNotes].join(' ')

  const handleExportBasesKml = useCallback(() => {
    if (!fieldSheets.length) return
    runExport(() => {
      const kml = buildBasesKML(
        {
          name: missionName.trim() || areaSafeName,
          sheets: fieldSheets,
          blocks,
          layout: baseLayout,
          files: flightFiles,
          // contornos exactos dos blocos de faixas: área ∩ faixa das linhas
          spacingM: spacing,
          area: ring ? { ring, holes } : null,
        },
        t,
      )
      downloadBlob(
        new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
        `${areaSafeName}_bases.kml`,
      )
    })
  }, [
    fieldSheets,
    runExport,
    missionName,
    areaSafeName,
    blocks,
    baseLayout,
    flightFiles,
    spacing,
    ring,
    holes,
    t,
  ])

  // KML por base (secção 7 da revisão da exportação): um ZIP com uma pasta
  // por base, um KML por bloco só com o polígono (a missão de mapeamento do
  // Pilot 2, que calcula a rota dele) e mapa/ com a base; sem preflight,
  // como os outros KML
  const handleExportKmlByBase = useCallback(() => {
    if (!fieldSheets.length || !blocks?.length) return
    runExport(async () => {
      const { entries } = blocksKmlByBase(
        {
          missionName: missionName.trim() || areaSafeName,
          blocks,
          layout: baseLayout,
          sheets: fieldSheets,
          files: flightFiles,
          spacingM: spacing,
          area: ring ? { ring, holes } : null,
        },
        t,
      )
      downloadBlob(await buildFilesZip(entries), `${exportBaseName}_kml-por-base.zip`)
    })
  }, [
    fieldSheets,
    blocks,
    runExport,
    missionName,
    areaSafeName,
    baseLayout,
    flightFiles,
    spacing,
    ring,
    holes,
    t,
    exportBaseName,
  ])

  return {
    fieldSheets,
    fieldSheetsDay,
    areaKmlNotes,
    exportKmlTitle,
    handleExportBasesKml,
    handleExportKmlByBase,
  }
}
