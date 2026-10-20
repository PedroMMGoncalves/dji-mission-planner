/**
 * As contas da operação, por separador: a base de referência de cada rota
 * única e a sua distância, o trânsito e o alcance visual de cada rota e de
 * cada voo do corredor (do pior ponto da zona da base), os voos contra os
 * conjuntos de baterias, os números do painel de métricas e o resumo do
 * projecto quando coexistem vários planos.
 */
import { useCallback, useMemo } from 'react'
import { convexHull } from '../mission/baseLayout.js'
import { flightsVsSets } from '../mission/equipment.js'
import { opsSummary } from '../mission/opsSummary.js'
import { blockWorstTransitM, blockWorstVlosM } from '../mission/takeoffZones.js'
import { aggregatePlans, distanceToArea } from '../utils/geo.js'

export function useMissionOps({
  hw,
  basesState,
  areaParams,
  corridor,
  orbit,
  face,
  geom,
  corridorOnTerrain,
  area,
  circular,
  corridorBase,
  circularBase,
  missionMode,
}) {
  const { drone, equipment, missionBatteryType, batteryMin } = hw
  const { bases } = basesState
  const { speed } = areaParams
  const { corridorSpeed } = corridor
  const { orbitPlan } = orbit
  const { facePlan } = face
  const { ring, split } = geom
  const { corridorRoute: corridorPlan } = corridorOnTerrain
  const { planOk, blocks, zones, baseLayout, refBase } = area
  const { circularSpeed, circularPlan, circularBlocks } = circular
  // Base de referência da área numa rota única (a mais próxima dela) e a
  // sua distância; com blocos, cada bloco tem a sua (baseLayout)
  const areaBasePoint = refBase?.point ?? null
  const perBlockBases = Boolean(baseLayout?.hasBases && blocks?.length)
  const areaBaseDistance = useMemo(
    () => (areaBasePoint && ring ? distanceToArea(areaBasePoint, ring) : null),
    [areaBasePoint, ring],
  )
  // Trânsito e alcance visual das rotas únicas (M2-T4/G5): do pior ponto da
  // zona da base de referência ao 1.º waypoint e do último de volta, e o
  // vértice mais afastado da rota — a régua dos blocos; a distância à
  // fronteira da área dava 0 com a base dentro e o VLOS não era verificado
  const routeOpsFor = useCallback(
    (base, waypoints, v) => {
      if (!base || !Array.isArray(waypoints) || waypoints.length === 0) return null
      const z = zones[base.id]
      const zone =
        z && !z.error ? z : { point: base.point, radiusM: base.radiusM ?? equipment.zoneRadiusM }
      const transitM = blockWorstTransitM(zone, waypoints[0], waypoints[waypoints.length - 1])
      return {
        transitM,
        transitS: v > 0 ? transitM / v : 0,
        vlosWorstM: blockWorstVlosM(zone, convexHull(waypoints)),
      }
    },
    [zones, equipment.zoneRadiusM],
  )
  const areaRouteOps = useMemo(
    () => (perBlockBases ? null : routeOpsFor(refBase, planOk?.waypoints, speed)),
    [perBlockBases, routeOpsFor, refBase, planOk, speed],
  )
  // Corredor partido em voos: cada voo com a base mais próxima do seu troço
  // (src/mission/corridorFlights.js), o seu tempo e o seu trânsito
  const corridorFlightOps = useMemo(() => {
    const flights = corridorPlan && !corridorPlan.error ? corridorPlan.flights : null
    if (!flights?.length) return null
    return flights.map((f) => ({
      label: f.label,
      timeS: f.route?.stats?.flightTimeS ?? 0,
      ops: routeOpsFor(f.base, f.route?.waypoints, corridorSpeed),
    }))
  }, [routeOpsFor, corridorPlan, corridorSpeed])
  const corridorRouteOps = useMemo(() => {
    if (!corridorFlightOps)
      return routeOpsFor(
        corridorBase,
        corridorPlan && !corridorPlan.error ? corridorPlan.waypoints : null,
        corridorSpeed,
      )
    // vários voos, cada um medido da sua base (a rota junta, da base mais
    // próxima do corredor, dava trânsitos e um alcance que nenhum voo tem):
    // o pior de cada medida, e o voo mais longo com o seu próprio trânsito
    const ok = corridorFlightOps.map((f) => f.ops).filter(Boolean)
    if (ok.length === 0) return null
    return {
      transitM: Math.max(...ok.map((o) => o.transitM)),
      transitS: Math.max(...ok.map((o) => o.transitS)),
      vlosWorstM: Math.max(...ok.map((o) => o.vlosWorstM)),
      worstFlightS: Math.max(...corridorFlightOps.map((f) => f.timeS + (f.ops?.transitS ?? 0))),
    }
  }, [corridorFlightOps, routeOpsFor, corridorBase, corridorPlan, corridorSpeed])
  const circularRouteOps = useMemo(
    () =>
      routeOpsFor(
        circularBase,
        circularPlan && !circularPlan.error ? circularPlan.waypoints : null,
        circularSpeed,
      ),
    [routeOpsFor, circularBase, circularPlan, circularSpeed],
  )
  const circularBaseDistance = useMemo(
    () => (circularBase && ring ? distanceToArea(circularBase.point, ring) : null),
    [circularBase, ring],
  )

  // voos contra os conjuntos de baterias que a equipa tem — o aviso só
  // aparece com a contagem conhecida
  const setsCheck = blocks?.length
    ? flightsVsSets(equipment, drone.aircraftId, missionBatteryType.id, blocks.length)
    : null
  const circularSetsCheck =
    circularBlocks?.length > 1
      ? flightsVsSets(equipment, drone.aircraftId, missionBatteryType.id, circularBlocks.length)
      : null

  // Painel de estatísticas: os números do separador aberto (antes o
  // corredor, a fachada e a órbita mostravam os da área) e o resumo
  // operacional — voos, bases, baterias, voo mais longo e tempo total
  const modeStats = useMemo(() => {
    const ok = (p) => (p && !p.error ? (p.stats ?? null) : null)
    if (missionMode === 'circular') return ok(circularPlan)
    if (missionMode === 'corridor') return ok(corridorPlan)
    if (missionMode === 'face') return ok(facePlan)
    if (missionMode === 'orbit') return ok(orbitPlan)
    return planOk?.stats ?? null
  }, [missionMode, circularPlan, corridorPlan, facePlan, orbitPlan, planOk])
  const statsOps = useMemo(() => {
    const transit = (d, v) => (d > 0 && v > 0 ? (2 * d) / v : 0)
    const flightsOf = (n) =>
      flightsVsSets(equipment, drone.aircraftId, missionBatteryType.id, Math.max(1, n))
    // uma rota única acima do tempo útil são vários voos (M2-G6: contava
    // sempre 1 contra os conjuntos)
    const usefulS = batteryMin > 0 ? batteryMin * 60 : null
    const singleFlights = (timeS, transitS) =>
      usefulS && Number.isFinite(timeS)
        ? Math.max(1, Math.ceil((timeS + (transitS || 0)) / usefulS))
        : 1
    if (missionMode === 'area') {
      const n = blocks?.length ?? 0
      const transitS = areaRouteOps?.transitS ?? transit(areaBaseDistance, speed)
      return opsSummary({
        blocks: n ? blocks : null,
        byBlock: baseLayout?.byBlock ?? null,
        singleTimeS: planOk?.stats?.flightTimeS ?? null,
        singleTransitS: transitS,
        usefulMin: batteryMin,
        bases: bases.length,
        sets: flightsOf(n || singleFlights(planOk?.stats?.flightTimeS, transitS)),
      })
    }
    if (missionMode === 'circular') {
      const n = circularBlocks?.length > 1 ? circularBlocks.length : 0
      const transitS = circularRouteOps?.transitS ?? transit(circularBaseDistance, circularSpeed)
      return opsSummary({
        blocks: n
          ? circularBlocks.map((b, i) => ({ id: i + 1, timeS: b.timeS, transitS: b.transitS ?? 0 }))
          : null,
        singleTimeS: modeStats?.flightTimeS ?? null,
        singleTransitS: transitS,
        usefulMin: batteryMin,
        bases: bases.length,
        sets: flightsOf(n || singleFlights(modeStats?.flightTimeS, transitS)),
      })
    }
    if (missionMode === 'corridor' && corridorFlightOps) {
      // partido em voos: cada voo com o seu trânsito, contra o tempo útil
      return opsSummary({
        blocks: corridorFlightOps.map((f, i) => ({
          id: i + 1,
          timeS: f.timeS,
          transitS: f.ops?.transitS ?? 0,
        })),
        byBlock: Object.fromEntries(
          corridorFlightOps.map((f, i) => [i + 1, { flightLabel: f.label }]),
        ),
        usefulMin: batteryMin,
        bases: bases.length,
        sets: flightsOf(corridorFlightOps.length),
      })
    }
    const transitS = missionMode === 'corridor' ? (corridorRouteOps?.transitS ?? 0) : 0
    return opsSummary({
      singleTimeS: modeStats?.flightTimeS ?? null,
      singleTransitS: transitS,
      usefulMin: batteryMin,
      bases: bases.length,
      sets: flightsOf(singleFlights(modeStats?.flightTimeS, transitS)),
    })
  }, [
    missionMode,
    blocks,
    baseLayout,
    planOk,
    areaBaseDistance,
    areaRouteOps,
    corridorRouteOps,
    corridorFlightOps,
    circularRouteOps,
    speed,
    batteryMin,
    bases.length,
    circularBlocks,
    modeStats,
    circularBaseDistance,
    circularSpeed,
    equipment,
    drone.aircraftId,
    missionBatteryType.id,
  ])

  // E3.2: agregado do projecto quando coexistem varios planos
  const projectSummary = useMemo(
    () =>
      aggregatePlans(
        [
          // a área com os seus voos (cada bloco com o trânsito da sua base)
          // ou o trânsito da rota única; as outras rotas únicas com o seu
          // (M2-G6: as baterias eram contadas sem trânsito e sem blocos)
          planOk?.stats
            ? {
                ...planOk.stats,
                transitS: areaRouteOps?.transitS ?? 0,
                blocks: blocks?.length
                  ? blocks.map((b) => ({
                      timeS: b.timeS,
                      transitS: baseLayout?.byBlock?.[b.id]?.transitS ?? b.transitS ?? 0,
                    }))
                  : null,
              }
            : null,
          facePlan && !facePlan.error ? facePlan.stats : null,
          orbitPlan && !orbitPlan.error ? orbitPlan.stats : null,
          // O corredor entrou depois e ficou de fora desta lista: um projecto
          // com corredor mostrava menos planos, menos tempo e menos baterias
          // do que tem, e e daqui que sai o pack que vai para o campo.
          corridorPlan && !corridorPlan.error
            ? {
                ...corridorPlan.stats,
                transitS: corridorRouteOps?.transitS ?? 0,
                // partido em voos, uma bateria (ou mais) por voo
                blocks: corridorFlightOps
                  ? corridorFlightOps.map((f) => ({
                      timeS: f.timeS,
                      transitS: f.ops?.transitS ?? 0,
                    }))
                  : null,
              }
            : null,
          circularPlan && !circularPlan.error
            ? {
                ...circularPlan.stats,
                transitS: circularRouteOps?.transitS ?? 0,
                blocks:
                  circularBlocks?.length > 1
                    ? circularBlocks.map((b) => ({ timeS: b.timeS, transitS: b.transitS ?? 0 }))
                    : null,
              }
            : null,
        ],
        { batteryMin, reservePct: split.reservePct },
      ),
    [
      planOk,
      blocks,
      baseLayout,
      areaRouteOps,
      facePlan,
      orbitPlan,
      corridorPlan,
      corridorRouteOps,
      corridorFlightOps,
      circularPlan,
      circularRouteOps,
      circularBlocks,
      batteryMin,
      split.reservePct,
    ],
  )

  return {
    areaBasePoint,
    perBlockBases,
    areaBaseDistance,
    areaRouteOps,
    corridorRouteOps,
    circularRouteOps,
    circularBaseDistance,
    setsCheck,
    circularSetsCheck,
    modeStats,
    statsOps,
    projectSummary,
  }
}
