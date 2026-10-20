/**
 * O preflight do separador aberto (M3-C15): escolhe o motor (preflightArea
 * para a área, preflightPlan para os outros modos) e monta o contexto de
 * cada um a partir do estado do App — os campos comuns (folga, buracos,
 * trânsitos, RTH, textos) e os de cada modo (plano, referência, base,
 * terreno, avisos). Lógica pura que vivia num useMemo com 57 dependências.
 */
import { preflightArea, preflightPlan } from './preflight.js'

/**
 * @param {string} missionMode 'area' | 'corridor' | 'circular' | 'face' | 'orbit'
 * @param {Record<string, any>} s o estado que o preflight lê (ver o App)
 * @returns {Array<{level: 'block'|'warn'|'info', code: string, params: object}>}
 */
export function preflightFor(missionMode, s) {
  const {
    plan,
    blocks,
    photoMode,
    waypointStops,
    terrainFollow,
    terrainCovers,
    terrainResultForPreflight,
    areaBasePoint,
    perBlockBases,
    areaBaseDistance,
    areaRouteOps,
    baseLayout,
    viewshedByBlock,
    refBase,
    zones,
    vlosM,
    speed,
    batteryMin,
    reservePct,
    aglWarn,
    triggerWarn,
    terrainDatum,
    uncertainty,
    blur,
    route,
    clearance,
    terrainHoles,
    transitClearanceInfo,
    reference,
    gimbal,
    aglMaxM,
    terrainRoute,
    planErrorText,
    blockFlightLabels,
    routePoints,
    flightOfIndex,
    rthHeightM,
    unverified,
    corridorPlan,
    corridorTriggerWarn,
    corridorPhotoMode,
    corridorWaypointStops,
    corridorCovers,
    corridorTerrain,
    corridorReference,
    corridorBase,
    corridorBaseDistance,
    corridorRouteOps,
    corridorSpeed,
    circularPlan,
    circularTriggerWarn,
    circularCovers,
    circularTerrain,
    circularReference,
    circularBase,
    circularBaseDistance,
    circularRouteOps,
    circularSpeed,
    facePlan,
    dsmLoaded,
    faceClearance,
    orbitPlan,
    orbitTriggerWarn,
  } = s
  if (missionMode === 'area') {
    return preflightArea({
      plan,
      blocks,
      photoMode,
      waypointStops,
      terrainFollow,
      terrainCovers,
      terrainResult: terrainResultForPreflight,
      basePoint: areaBasePoint,
      // com blocos e bases, o alcance e o trânsito vão bloco a bloco
      baseDistance: perBlockBases ? null : areaBaseDistance,
      baseTransitS: areaRouteOps?.transitS ?? null,
      routeVlosM: areaRouteOps?.vlosWorstM ?? null,
      baseLayout: perBlockBases ? baseLayout : null,
      viewsheds: perBlockBases ? viewshedByBlock : null,
      refZone:
        !perBlockBases && refBase && zones[refBase.id] && !zones[refBase.id].error
          ? { label: refBase.label, zone: zones[refBase.id] }
          : null,
      vlosM,
      speed,
      batteryMin,
      reservePct,
      aglWarn,
      triggerWarn,
      terrainDatum,
      uncertainty,
      blur,
      route,
      clearance,
      terrainHoles,
      transitClearance: transitClearanceInfo,
      reference,
      gimbal,
      aglMaxM,
      terrainRoute,
      planErrorText,
      blockFlightLabels,
      routePoints,
      flightOfIndex,
      rthHeightM,
      unverified,
    })
  }
  const other = {
    batteryMin,
    reservePct,
    clearance,
    terrainHoles,
    transitClearance: transitClearanceInfo,
    route,
    gimbal,
    aglMaxM,
    terrainRoute,
    planErrorText,
    routePoints,
    rthHeightM,
    unverified,
  }
  if (missionMode === 'corridor')
    return preflightPlan({
      ...other,
      plan: corridorPlan,
      aglWarn,
      triggerWarn: corridorTriggerWarn,
      photoMode: corridorPhotoMode,
      waypointStops: corridorWaypointStops,
      terrainFollow,
      terrainCovers: corridorCovers,
      terrainResult: corridorTerrain,
      reference: corridorReference,
      basePoint: corridorBase?.point ?? null,
      baseDistance: corridorBaseDistance,
      baseTransitS: corridorRouteOps?.transitS ?? null,
      routeVlosM: corridorRouteOps?.vlosWorstM ?? null,
      vlosM,
      refZone: corridorReference?.zone
        ? { label: corridorBase?.label ?? '', zone: corridorReference.zone }
        : null,
      speed: corridorSpeed,
      // passagens sem cobertura (a curva mais apertada do que a distância
      // ao eixo): só o painel as dizia (M3-U1)
      corridorDropped: corridorPlan?.stats?.droppedPasses ?? 0,
    })
  if (missionMode === 'circular')
    return preflightPlan({
      ...other,
      plan: circularPlan,
      aglWarn,
      triggerWarn: circularTriggerWarn,
      terrainFollow,
      terrainCovers: circularCovers,
      terrainResult: circularTerrain,
      reference: circularReference,
      basePoint: circularBase?.point ?? null,
      baseDistance: circularBaseDistance,
      baseTransitS: circularRouteOps?.transitS ?? null,
      routeVlosM: circularRouteOps?.vlosWorstM ?? null,
      vlosM,
      refZone: circularReference?.zone
        ? { label: circularBase?.label ?? '', zone: circularReference.zone }
        : null,
      speed: circularSpeed,
    })
  if (missionMode === 'face')
    // a folga ao DSM e a sua verificação, que só o painel mostrava (M3-U1)
    return preflightPlan({
      ...other,
      plan: facePlan,
      faceClearance: facePlan && !facePlan.error && dsmLoaded ? faceClearance : null,
      faceDsmLoaded: facePlan && !facePlan.error ? dsmLoaded : null,
    })
  return preflightPlan({ ...other, plan: orbitPlan, triggerWarn: orbitTriggerWarn })
}
