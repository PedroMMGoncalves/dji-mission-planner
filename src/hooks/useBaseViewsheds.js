/**
 * Bacias de visão dos blocos com bases: o modelo do relevo (MDT, ou MDS com
 * a vegetação somada), os trabalhos de cada bloco visto dos olhos do
 * operador no ponto da sua base (src/mission/viewshedPlan.js) e o cálculo
 * em fatias (useViewsheds), só na área dividida em blocos com bases e com
 * relevo sobre ela.
 */
import { useMemo } from 'react'
import { terrainIdentity, useViewsheds } from './useViewsheds.js'
import { viewshedJobs, viewshedTerrainModel } from '../mission/viewshedPlan.js'

export function useBaseViewsheds({
  bases,
  missionMode,
  perBlockBases,
  terrain,
  terrainCovers,
  demSurface,
  obstacleM,
  terrainFollow,
  terrainResult,
  blocks,
  baseLayout,
  zones,
  params,
  equipment,
}) {
  // Bacias de visão: cada bloco visto dos olhos do operador no ponto da sua
  // base (src/mission/viewshedPlan.js), na área dividida em blocos com bases
  // e relevo sobre a área. A cota do drone é a do KMZ: com seguimento de
  // terreno relevo + AGL, sem ele a cota da zona do bloco + altura. Calculado
  // em fatias, depois de uma pausa nas edições (useViewsheds).
  const viewshedOn =
    missionMode === 'area' && perBlockBases && terrain.status === 'ready' && terrainCovers
  const viewTerrain = useMemo(
    () =>
      viewshedOn
        ? viewshedTerrainModel(terrain.data, {
            surface: terrain.data?.source === 'file' ? demSurface : 'dtm',
            obstacleM,
          })
        : null,
    [viewshedOn, terrain.data, demSurface, obstacleM],
  )
  const viewshedTf = Boolean(terrainFollow.enabled && terrainResult && !terrainResult.error)
  const viewJobs = useMemo(
    () =>
      viewshedOn && viewTerrain
        ? viewshedJobs({
            blocks,
            layout: baseLayout,
            bases,
            zones,
            altitudeM: params.altitude,
            terrainFollow: viewshedTf,
            terrainKey: terrainIdentity(terrain.data),
            eyeHeightM: equipment.eyeHeightM,
            antennaHeightM: equipment.antennaHeightM,
            obstacleM: viewTerrain.obstacleM,
            resolutionM: viewTerrain.resolutionM,
          })
        : [],
    [
      viewshedOn,
      viewTerrain,
      blocks,
      baseLayout,
      bases,
      zones,
      params.altitude,
      viewshedTf,
      terrain.data,
      equipment.eyeHeightM,
      equipment.antennaHeightM,
    ],
  )
  const viewsheds = useViewsheds({
    jobs: viewJobs,
    elevationAt: viewshedOn ? (terrain.data?.elevationAt ?? null) : null,
    eyeHeightM: equipment.eyeHeightM,
    antennaHeightM: equipment.antennaHeightM,
    obstacleM: viewTerrain?.obstacleM ?? 0,
    resolutionM: viewTerrain?.resolutionM ?? 0,
  })
  const viewshedByBlock = viewJobs.length ? viewsheds.byBlock : null

  return {
    viewTerrain,
    viewshedTf,
    viewsheds,
    viewshedByBlock,
  }
}
