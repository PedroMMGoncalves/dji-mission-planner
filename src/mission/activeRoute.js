/**
 * A rota exportável do separador aberto, para a vista 3D, a folga ao solo,
 * os buracos do relevo e os trânsitos: waypoints [lon, lat, altura relativa]
 * e a cota de referência (o zero das alturas), por modo. Lógica pura que
 * vivia num useMemo do App.jsx (M3-C15).
 */
import { blocksViewRoute } from './baseLayout.js'

/**
 * @param {{missionMode: string,
 *   elevationAt?: ((lon: number, lat: number) => number|null)|null,
 *   facePlan?: any, faceBaseline?: number[][]|null,
 *   orbitPlan?: any, orbitPoi?: number[]|null,
 *   corridorPlan?: any, corridorReference?: any,
 *   circularPlan?: any, circularReference?: any,
 *   planOk?: any, terrainResult?: any, reference?: any,
 *   blockRefs?: {refs: (number|null)[], common: number}|null, blocks?: any[]|null,
 *   altitude: number}} c
 * @returns {{waypoints: number[][], refElev: number|null, refSource?: string|null,
 *   breaks?: number[]|null, perWaypoint?: any[]|null}|null}
 */
export function activeRoute(c) {
  const {
    missionMode,
    elevationAt = null,
    facePlan,
    faceBaseline,
    orbitPlan,
    orbitPoi,
    corridorPlan,
    corridorReference,
    circularPlan,
    circularReference,
    planOk,
    terrainResult,
    reference,
    blockRefs,
    blocks,
    altitude,
  } = c
  if (missionMode === 'face' && facePlan && !facePlan.error) {
    const foot = elevationAt?.(faceBaseline[0][0], faceBaseline[0][1])
    return { waypoints: facePlan.waypoints, refElev: Number.isFinite(foot) ? foot : 0 }
  }
  if (missionMode === 'orbit' && orbitPlan && !orbitPlan.error) {
    const ground = elevationAt?.(orbitPoi[0], orbitPoi[1])
    return { waypoints: orbitPlan.waypoints, refElev: Number.isFinite(ground) ? ground : 0 }
  }
  // Sem este ramo o modo corredor caía no plano de ÁREA: com um polígono
  // desenhado antes, a vista 3D e o perfil mostravam a grelha da área
  // enquanto o painel do corredor estava aberto — a missão errada.
  // Circular: alturas por ponto (planas ou do terreno) sobre a cota de
  // referência da área, a mesma cadeia do modo área
  if (missionMode === 'circular') {
    if (!circularPlan || circularPlan.error) return null
    return {
      waypoints: circularPlan.waypoints,
      refElev: circularReference?.elev ?? null,
      refSource: circularReference?.source ?? null,
    }
  }
  // Corredor: a mesma cadeia de referência da área (base com relevo, senão
  // a mínima debaixo da rota); antes era a cota do início do eixo
  if (missionMode === 'corridor') {
    if (!corridorPlan || corridorPlan.error) return null
    return {
      waypoints: corridorPlan.waypoints.map(([lon, lat, h]) => [lon, lat, h ?? altitude]),
      refElev: corridorReference?.elev ?? null,
      refSource: corridorReference?.source ?? null,
      // acções por waypoint (foto por waypoint), alinhadas com a rota
      perWaypoint: corridorPlan.perWaypoint ?? null,
    }
  }
  if (!planOk) return null
  const tfOk = terrainResult && !terrainResult.error
  // Bases múltiplas: cada bloco na cota da zona da sua base, exprimido na
  // comum (a mesma altitude absoluta); os troços entre blocos não se voam
  if (blockRefs && blocks?.length) {
    const src = tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks
    const vr = blocksViewRoute(src, blockRefs, altitude)
    return {
      waypoints: vr.waypoints,
      breaks: vr.breaks,
      refElev: blockRefs.common,
      refSource: 'bases',
      perWaypoint: vr.perWaypoint ?? null,
    }
  }
  const wps = tfOk
    ? terrainResult.waypoints
    : planOk.waypoints.map(([lon, lat]) => [lon, lat, altitude])
  // Cota de referência única (useAreaMission): base com relevo, senão a
  // mínima do relevo debaixo da rota. Antes caía em 0 com a base fora do
  // relevo e o perfil punha o voo debaixo da terra.
  const refElev = tfOk ? terrainResult.refElev : (reference?.elev ?? null)
  return {
    waypoints: wps,
    refElev,
    refSource: reference?.source ?? null,
    perWaypoint: (tfOk ? terrainResult.perWaypoint : planOk.perWaypoint) ?? null,
  }
}
