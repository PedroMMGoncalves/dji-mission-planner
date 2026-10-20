/**
 * Verificações de segurança sobre a rota que sairia no KMZ do separador
 * aberto (useActiveRoute): a pior folga ao solo, os buracos do relevo
 * debaixo dela, as pernas de trânsito base <-> rota com a sua folga, e a
 * altura de regresso (RTH) e de descolagem que o KMZ escreve, por voo. O
 * preflight (usePreflight) bloqueia com elas.
 */
import { useMemo } from 'react'
import { routeClearance, terrainHolesAlong } from '../mission/clearance.js'
import { rthByFlight, transitLegs, worstTransit } from '../mission/transitLegs.js'
import { DEFAULT_TAKEOFF_SECURITY_HEIGHT_M, defaultRthHeightM } from '../utils/exporters.js'

export function useRouteChecks({
  terrain,
  view3d,
  bases,
  terrainResult,
  missionMode,
  areaBasePoint,
  corridorBase,
  circularBase,
  perBlockBases,
  blocks,
  baseLayout,
  blockRefs,
  safety,
  params,
}) {
  // Pior folga ao solo da rota que sairia no KMZ, sobre o relevo carregado.
  // E daqui que o preflight bloqueia uma rota que entra no terreno.
  const clearance = useMemo(() => {
    const elevationAt = terrain.status === 'ready' ? terrain.data?.elevationAt : null
    if (!elevationAt || !view3d?.waypoints?.length || !Number.isFinite(view3d.refElev)) return null
    // a amostragem à resolução do relevo (≤ 10 m), não aos 40 m do perfil,
    // que a folga validava contra si próprio (M2-T2)
    const res = terrain.data?.resolutionM
    return routeClearance(view3d.waypoints, {
      elevationAt,
      refElev: view3d.refElev,
      breaks: view3d.breaks ?? null,
      stepM: Math.min(10, Math.max(1, (Number.isFinite(res) && res > 0 ? res : 30) / 2)),
    })
  }, [terrain, view3d])

  // Buracos do relevo debaixo da rota exportável (M2-T1 da revisão da
  // matemática): tiles em falta ou zonas sem dados do MDT dentro da caixa
  // carregada, que o seguimento de terreno atravessava à cota do último
  // ponto válido e a folga ao solo saltava. O preflight bloqueia.
  const terrainHoles = useMemo(() => {
    const elevationAt = terrain.status === 'ready' ? terrain.data?.elevationAt : null
    if (!elevationAt || !view3d?.waypoints?.length) return null
    return terrainHolesAlong(view3d.waypoints, { elevationAt, breaks: view3d.breaks ?? null })
  }, [terrain, view3d])

  // Folga ao solo dos trânsitos base ↔ rota (M2-T3): com `flyToWaylineMode`
  // «safely» a aeronave sobe à altura do 1.º waypoint (ou à de segurança da
  // descolagem) e voa a direito até ele; no fim regressa à altura de RTH.
  // Com bases, cada voo descola da sua base, às alturas relativas à cota da
  // zona dela (a rota do 3D está na cota comum); o pior voo manda.
  const transitLegsInfo = useMemo(() => {
    if (!view3d?.waypoints?.length || !Number.isFinite(view3d.refElev)) return []
    const tfOk = terrainResult && !terrainResult.error
    const basePoint =
      missionMode === 'area'
        ? areaBasePoint
        : missionMode === 'corridor'
          ? (corridorBase?.point ?? null)
          : missionMode === 'circular'
            ? (circularBase?.point ?? null)
            : null
    return transitLegs({
      view3d,
      perBlock: missionMode === 'area' && perBlockBases && view3d.refSource === 'bases',
      blocks: tfOk && terrainResult.blocks3 ? terrainResult.blocks3 : blocks,
      baseLayout,
      bases,
      blockRefs,
      basePoint,
    })
  }, [
    view3d,
    missionMode,
    perBlockBases,
    blocks,
    terrainResult,
    baseLayout,
    bases,
    blockRefs,
    areaBasePoint,
    corridorBase,
    circularBase,
  ])
  const transitClearanceInfo = useMemo(() => {
    const elevationAt = terrain.status === 'ready' ? terrain.data?.elevationAt : null
    if (!elevationAt || transitLegsInfo.length === 0) return null
    // as alturas escritas pelo piloto (acções de segurança), senão as omissões
    const takeOffSecurityHeightM =
      safety.takeOffSecurityHeightM ?? DEFAULT_TAKEOFF_SECURITY_HEIGHT_M
    const rthFixed = safety.rthHeightM
    return worstTransit(transitLegsInfo, {
      elevationAt,
      takeOffSecurityHeightM,
      rthHeightOf: (tecto) => (Number.isFinite(rthFixed) ? rthFixed : defaultRthHeightM(tecto)),
    })
  }, [terrain, transitLegsInfo, safety.takeOffSecurityHeightM, safety.rthHeightM])

  // Altura de regresso (RTH) e subida de descolagem que o KMZ escreve
  // (M3-U3): por voo com bases (cada um no seu KMZ), senão da rota inteira;
  // nenhum ecrã as mostrava e a checklist mandava «confirmar o RTH».
  const rthInfo = useMemo(() => {
    const legs = transitLegsInfo.length
      ? transitLegsInfo
      : view3d?.waypoints?.length
        ? [{ flight: null, waypoints: view3d.waypoints }]
        : []
    if (legs.length === 0) return null
    const altitudeM = missionMode === 'area' ? params.altitude : 0
    const byFlight = rthByFlight(legs, { altitudeM, rthHeightM: safety.rthHeightM })
    const values = byFlight.map((r) => r.rthM)
    return {
      minM: Math.min(...values),
      maxM: Math.max(...values),
      takeoffM: safety.takeOffSecurityHeightM ?? DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
      // escritas pelo piloto (true) ou automáticas
      rthManual: Number.isFinite(safety.rthHeightM),
      takeoffManual: Number.isFinite(safety.takeOffSecurityHeightM),
      byFlight,
    }
  }, [
    transitLegsInfo,
    view3d,
    missionMode,
    params.altitude,
    safety.rthHeightM,
    safety.takeOffSecurityHeightM,
  ])

  return {
    clearance,
    terrainHoles,
    transitClearanceInfo,
    rthInfo,
  }
}
