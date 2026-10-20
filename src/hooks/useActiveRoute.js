/**
 * A rota que sairia no KMZ do separador aberto (src/mission/activeRoute.js),
 * com a descolagem da face e da órbita numa base do projecto; dela saem a
 * vista 3D (com a cor de cada voo), as fotos no mapa e no 3D, a caixa que o
 * relevo tem de cobrir e os blocos do perfil de elevação. As verificações
 * de segurança sobre esta rota ficam no App.
 */
import { useEffect, useMemo } from 'react'
import { activeRoute } from '../mission/activeRoute.js'
import { takeoffReference } from '../mission/takeoffRef.js'
import { photoPositions2d, photosAtWaypoints, photosOnRoute } from '../mission/photoPoints.js'
import { blockRing } from '../mission/baseLayout.js'
import { bboxOfPoints } from '../mission/corridorTerrain.js'

export function useActiveRoute({
  hw,
  basesState,
  areaParams,
  corridor,
  orbit,
  face,
  terrainState,
  corridorOnTerrain,
  area,
  circular,
  missionMode,
  setRouteBox,
}) {
  const { zoneConfig } = hw
  const { bases } = basesState
  const { params } = areaParams
  const { corridorFlight, corridorConfig, corridorPreview } = corridor
  const { orbitPlan, orbitConfig } = orbit
  const { facePlan, faceConfig } = face
  const { terrain } = terrainState
  const { corridorRoute: corridorPlan, corridorReference } = corridorOnTerrain
  const { planOk, terrainResult, reference, blockRefs, blocks, baseLayout, photoPoints } = area
  const { circularPlan, circularReference } = circular

  // E1.4: a vista 3D cobre o modo activo — grelha (com terrain follow),
  // passagens de fachada empilhadas ou anéis de órbita às suas alturas.
  // refElev ancora as alturas relativas: pé da face / solo do POI / base.
  // Descolagem da face e da órbita: no chão do alvo (como sempre) ou numa
  // base do projecto, com as alturas convertidas pela diferença de cotas
  const faceTakeoff = useMemo(
    () =>
      takeoffReference({
        baseId: faceConfig.takeoffBaseId,
        bases,
        targetPoint: faceConfig.baseline?.[0] ?? null,
        elevationAt: terrain.status === 'ready' ? (terrain.data?.elevationAt ?? null) : null,
        zoneConfig,
      }),
    [faceConfig.takeoffBaseId, faceConfig.baseline, bases, terrain, zoneConfig],
  )
  const orbitTakeoff = useMemo(
    () =>
      takeoffReference({
        baseId: orbitConfig.takeoffBaseId,
        bases,
        targetPoint: orbitConfig.poi,
        elevationAt: terrain.status === 'ready' ? (terrain.data?.elevationAt ?? null) : null,
        zoneConfig,
      }),
    [orbitConfig.takeoffBaseId, orbitConfig.poi, bases, terrain, zoneConfig],
  )

  const view3d = useMemo(
    () =>
      activeRoute({
        missionMode,
        elevationAt: terrain.status === 'ready' ? terrain.data?.elevationAt : null,
        facePlan,
        faceBaseline: faceConfig.baseline,
        orbitPlan,
        orbitPoi: orbitConfig.poi,
        corridorPlan,
        corridorReference,
        circularPlan,
        circularReference,
        planOk,
        terrainResult,
        reference,
        blockRefs,
        blocks,
        altitude: params.altitude,
        corridorAltitude: corridorFlight.altitude,
        faceTakeoff,
        orbitTakeoff,
      }),
    [
      missionMode,
      facePlan,
      faceConfig.baseline,
      orbitPlan,
      orbitConfig.poi,
      corridorPlan,
      corridorReference,
      circularPlan,
      circularReference,
      planOk,
      terrainResult,
      terrain,
      reference,
      blockRefs,
      blocks,
      params.altitude,
      corridorFlight.altitude,
      faceTakeoff,
      orbitTakeoff,
    ],
  )

  // Onde a aeronave dispara, sobre a rota 3D (área, blocos e corredor): por
  // distância ou por tempo, os pontos do mapa à altura do troço mais próximo;
  // por waypoint, os waypoints com acção de foto
  const photos3d = useMemo(() => {
    if (!view3d?.waypoints?.length) return null
    if (missionMode === 'area') {
      if (params.triggerMode === 'waypoint') {
        return photosAtWaypoints(view3d.waypoints, view3d.perWaypoint)
      }
      return photoPoints?.length
        ? photosOnRoute(photoPoints, view3d.waypoints, { breaks: view3d.breaks ?? null })
        : null
    }
    if (missionMode === 'corridor') {
      if (corridorConfig.photoMode === 'waypoint') {
        return photosAtWaypoints(view3d.waypoints, view3d.perWaypoint)
      }
      const pts = corridorPreview?.photos
      return pts?.length ? photosOnRoute(pts, view3d.waypoints) : null
    }
    // fachada, órbita e circular: fotos por waypoint (as acções do plano)
    return photosAtWaypoints(view3d.waypoints, view3d.perWaypoint)
  }, [
    view3d,
    missionMode,
    params.triggerMode,
    photoPoints,
    corridorConfig.photoMode,
    corridorPreview,
  ])

  // Onde saem as fotos, no mapa: na área, os pontos por distância ou por
  // tempo, ou com foto por waypoint os waypoints com a acção de foto; na
  // fachada, na órbita e no circular, também os waypoints com a acção de
  // foto (o corredor calcula as suas na pré-visualização)
  const mapPhotoPoints = useMemo(() => {
    if (missionMode === 'area') {
      if (params.triggerMode !== 'waypoint') return photoPoints
      // por waypoint, os waypoints com a acção de foto (os mesmos do 3D)
      if (!view3d?.waypoints?.length) return null
      const pts = photoPositions2d(photosAtWaypoints(view3d.waypoints, view3d.perWaypoint))
      return pts.length ? pts : null
    }
    if (missionMode === 'corridor') return corridorPreview?.photos ?? null
    const plan =
      missionMode === 'face'
        ? facePlan
        : missionMode === 'orbit'
          ? orbitPlan
          : missionMode === 'circular'
            ? circularPlan
            : null
    if (!plan || plan.error) return null
    const pts = photoPositions2d(photosAtWaypoints(plan.waypoints, plan.perWaypoint))
    return pts.length ? pts : null
  }, [
    missionMode,
    params.triggerMode,
    photoPoints,
    view3d,
    corridorPreview,
    facePlan,
    orbitPlan,
    circularPlan,
  ])

  // Vista 3D com bases: a cor de cada voo (a da sua base, como no mapa),
  // pela ordem dos troços de view3d, e o contorno e o rótulo de cada bloco
  const view3dColors = useMemo(() => {
    if (missionMode !== 'area' || view3d?.refSource !== 'bases' || !baseLayout?.hasBases)
      return null
    const tfOk = terrainResult && !terrainResult.error
    const src = tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
    if (!src?.length) return null
    const colorOf = (id) => baseLayout.byBlock[id]?.color ?? null
    return {
      // um troço por bloco com waypoints (os vazios não abrem troço)
      pieces: src.filter((b) => b.waypoints?.length > 0).map((b) => colorOf(b.id)),
      blocks: (blocks ?? []).map((b) => ({
        ring: b.cellRing ?? blockRing(b),
        color: colorOf(b.id),
        label: baseLayout.byBlock[b.id]?.flightLabel ?? '',
      })),
    }
  }, [missionMode, view3d, baseLayout, terrainResult, blocks])

  // A caixa da rota exportável volta ao App (setRouteBox), que no render
  // seguinte a junta à caixa do relevo a carregar: a rota sai da geometria
  // (círculos que passam o contorno, margem da área) e é ela que o relevo
  // tem de cobrir. É o único ciclo entre o relevo e a rota; arredondada a
  // ~10 m, não muda com as alturas do terreno e o ciclo pára.
  const view3dBoxKey = useMemo(() => {
    const b = bboxOfPoints(view3d?.waypoints)
    return b ? b.map((v) => v.toFixed(4)).join(',') : ''
  }, [view3d])
  useEffect(() => {
    const box = view3dBoxKey ? view3dBoxKey.split(',').map(Number) : null
    setRouteBox((r) =>
      r.mode === missionMode && String(r.box) === String(box) ? r : { mode: missionMode, box },
    )
  }, [view3dBoxKey, missionMode, setRouteBox])

  // blocos do perfil de elevação, memorizados (M3-C8): mapeados no render
  // eram um objecto novo em cada render do App e o perfil refazia-se sempre
  const profileBlocks = useMemo(() => {
    if (missionMode !== 'area') return null
    const tf3 = terrainResult && !terrainResult.error && terrainResult.blocks3
    if (blockRefs && blocks?.length) {
      return (tf3 || blocks).map((b, i) => {
        const info = baseLayout?.byBlock[b.id]
        const r = blockRefs.refs[i] ?? blockRefs.common
        return {
          id: b.id,
          label: info?.flightLabel || `B${String(b.id).padStart(2, '0')}`,
          refElev: r,
          reference: { elev: r, source: 'zone', base: info?.baseLabel ?? '' },
          waypoints: b.waypoints.map(([lon, lat, h]) => [
            lon,
            lat,
            Number.isFinite(h) ? h : params.altitude,
          ]),
        }
      })
    }
    if (tf3) return tf3.map((b) => ({ id: b.id, waypoints: b.waypoints }))
    return (
      blocks?.map((b) => ({
        id: b.id,
        waypoints: b.waypoints.map(([lon, lat]) => [lon, lat, params.altitude]),
      })) ?? null
    )
  }, [missionMode, terrainResult, blockRefs, blocks, baseLayout, params.altitude])

  return {
    faceTakeoff,
    orbitTakeoff,
    view3d,
    photos3d,
    mapPhotoPoints,
    view3dColors,
    profileBlocks,
  }
}
