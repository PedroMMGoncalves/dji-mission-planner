/**
 * O preflight do separador aberto: uma só lista, calculada a partir do mesmo
 * estado que a exportação usa (src/mission/preflightFor.js), com o que só o
 * App junta — os rótulos dos voos, o erro do plano traduzido, o ganho da
 * zona e a altura acima do solo, o alcance do gimbal, a incerteza propagada,
 * as verificações da rota e o obturador da órbita. Os bloqueios desactivam
 * a exportação (exportBlocked).
 */
import { useMemo } from 'react'
import { aglCapWarning, positioningError } from '../data/drones.js'
import { isVerifiedFlight } from '../data/validation.js'
import { bboxCovers, bboxOfPoints } from '../mission/corridorTerrain.js'
import { gimbalRangeViolation } from '../mission/gimbal.js'
import { hasBlockers } from '../mission/preflight.js'
import { preflightFor } from '../mission/preflightFor.js'
import {
  motionBlur,
  routeChecks,
  terrainReliefRange,
  uncertaintyIntervals,
} from '../mission/uncertainty.js'
import { terrainErrorText } from '../utils/appError.js'

export function usePreflight({
  hw,
  areaParams,
  corridor,
  orbit,
  face,
  inspect,
  geom,
  terrainState,
  corridorOnTerrain,
  area,
  circular,
  ops,
  viewshedState,
  routeView,
  safetyChecks,
  t,
  missionMode,
  corridorBase,
  circularBase,
  dsmLoaded,
  faceClearance,
}) {
  const { drone, aircraft, payload, vlosM, sensor, batteryMin } = hw
  const { params, speed, spacing, interval, gsdPitch, gsd, triggerWarn, avisoIntervalo } =
    areaParams
  const { corridorConfig, corridorSpeed, corridorTriggerWarn } = corridor
  const { orbitConfig, orbitPlan } = orbit
  const { faceConfig, facePlan } = face
  const { inspectPoints } = inspect
  const { split } = geom
  const { terrain, terrainFollow, handleLoadTerrain, terrainCovers } = terrainState
  const {
    corridorRoute: corridorPlan,
    corridorTerrain,
    corridorReference,
    corridorCovers,
    corridorBaseDistance,
  } = corridorOnTerrain
  const { photoMode, plan, planOk, blocks, terrainResult, reference, zones, baseLayout, refBase } =
    area
  const {
    circularConfig,
    circularSpeed,
    circularTriggerWarn,
    circularPlan,
    circularReference,
    circularTerrain,
    circularCovers,
  } = circular
  const {
    areaBasePoint,
    perBlockBases,
    areaBaseDistance,
    areaRouteOps,
    corridorRouteOps,
    circularRouteOps,
    circularBaseDistance,
  } = ops
  const { viewshedByBlock } = viewshedState
  const { faceTakeoff, orbitTakeoff, view3d } = routeView
  const { clearance, terrainHoles, transitClearanceInfo, rthInfo } = safetyChecks
  // Rótulo do voo de cada bloco (o do mapa e do ficheiro): um só
  // identificador visível no cartão, no preflight e nas fichas (M3-U4)
  const blockFlightLabels = useMemo(() => {
    const out = {}
    for (const [id, info] of Object.entries(baseLayout?.byBlock ?? {}))
      if (info?.flightLabel) out[id] = info.flightLabel
    return out
  }, [baseLayout])
  // o voo a que um índice da rota de verificação pertence (os blocos seguem-se
  // pela ordem da rota; os cortes em `breaks`)
  const flightOfIndex = useMemo(() => {
    if (!view3d?.breaks?.length || !blocks?.length) return null
    const starts = [0, ...view3d.breaks]
    const withWps = blocks.filter((b) => b.waypoints?.length > 0)
    return (i) => {
      let k = 0
      while (k + 1 < starts.length && i >= starts[k + 1]) k += 1
      const b = withWps[k]
      return b ? (blockFlightLabels[b.id] ?? String(b.id)) : null
    }
  }, [view3d, blocks, blockFlightLabels])

  // A mensagem traduzida do erro do plano, para o preflight não mostrar o
  // código em bruto (M3-U8): a mesma que o painel do modo já mostra
  const planErrorText = useMemo(() => {
    const tr = (key, vars) => {
      const msg = t(key, vars)
      return msg === key ? null : msg
    }
    if (missionMode === 'area') {
      const code = plan?.error
      if (!code) return null
      if (code === 'too-many-lines') return tr('cp.area.tooManyLines')
      return tr(`cp.area.planError.${code}`, { cells: (plan?.errorCells ?? []).join(', ') })
    }
    if (missionMode === 'corridor')
      return corridorPlan?.error ? tr(`co.err.${corridorPlan.error}`) : null
    if (missionMode === 'circular')
      return circularPlan?.error ? tr(`ci.err.${circularPlan.error}`) : null
    if (missionMode === 'face') return facePlan?.error ? tr(`fp.error.${facePlan.error}`) : null
    return orbitPlan?.error ? tr(`orb.err.${orbitPlan.error}`) : null
  }, [missionMode, plan, corridorPlan, circularPlan, facePlan, orbitPlan, t])

  // Ganho da zona de descolagem (§4.1): o voo real fica entre 0 e +ganho
  // acima do planeado, e isso conta para o tecto AGL do payload e para a
  // nota dos 120 m (M2-T8)
  const zoneGainM = useMemo(() => {
    const gainOf = (z) => (z && !z.error && Number.isFinite(z.gainM) ? z.gainM : 0)
    if (missionMode === 'corridor') return gainOf(corridorReference?.zone)
    if (missionMode === 'circular') return gainOf(circularReference?.zone)
    if (missionMode !== 'area') return 0
    if (perBlockBases) return Math.max(0, ...Object.values(zones ?? {}).map(gainOf))
    return gainOf(refBase ? zones[refBase.id] : null)
  }, [missionMode, corridorReference, circularReference, perBlockBases, zones, refBase])

  // Maior altura acima do solo da rota exportável, sobre o relevo, com o
  // ganho da zona. Só para a nota da categoria aberta (120 m): a altura é
  // decisão do operador e nada é cortado nem bloqueado.
  const aglMaxM = Number.isFinite(clearance?.maxM) ? clearance.maxM + zoneGainM : null

  // O relevo cobre a rota que sairia no KMZ do separador aberto? Sem isto
  // não há exportação: as alturas são relativas à descolagem e só o relevo
  // diz a que altura do chão se voa (o preflight diz o que falta).
  const terrainRoute = useMemo(() => {
    const box = bboxOfPoints(view3d?.waypoints)
    const covered =
      terrain.status === 'ready' && Boolean(box) && bboxCovers(terrain.data?.bbox, box)
    return {
      covered,
      status: terrain.status,
      source: terrain.data?.source ?? null,
      // o texto traduzido: o preflight só o mostra
      error: terrain.error ? terrainErrorText(terrain.error, t) : null,
      fromFile: Boolean(terrain.fromFile),
    }
  }, [view3d, terrain, t])

  // Inclinacao do gimbal pedida fora do que o payload alcanca (a exportacao
  // recorta; aqui avisa-se do valor pedido), no modo activo e nos pontos de
  // inspeccao que tenham pitch proprio
  const gimbal = useMemo(() => {
    const pitches =
      missionMode === 'face'
        ? [faceConfig.gimbalPitch]
        : missionMode === 'orbit'
          ? (orbitPlan?.perWaypoint ?? []).map((w) => w.gimbalPitch)
          : missionMode === 'corridor'
            ? [-90]
            : missionMode === 'circular'
              ? [circularConfig.gimbalPitch]
              : [params.gimbalPitch]
    for (const p of inspectPoints ?? []) if (p?.gimbalPitch != null) pitches.push(p.gimbalPitch)
    return gimbalRangeViolation(pitches, payload.gimbalPitch ?? null)
  }, [
    missionMode,
    faceConfig.gimbalPitch,
    orbitPlan,
    circularConfig.gimbalPitch,
    params.gimbalPitch,
    inspectPoints,
    payload,
  ])

  // Teto operacional AGL do payload (T1.3), ex.: LiDAR limitado a 100 m
  const aglWarn = useMemo(
    () =>
      aglCapWarning(payload, params.altitude, {
        terrainFollowActive: Boolean(
          terrainFollow.enabled && terrainResult && !terrainResult.error,
        ),
        toleranceM: terrainFollow.tolerance,
        // a subida do corredor com terreno transversal e o ganho da zona
        routeMaxAglM: clearance?.maxM ?? null,
        gainM: zoneGainM,
      }),
    [payload, params.altitude, terrainFollow, terrainResult, clearance, zoneGainM],
  )

  /* ------------------------ Incerteza propagada ----------------------- */
  // Intervalos [pior, melhor] de AGL, GSD e sobreposicoes com o erro de
  // posicionamento (GNSS ou RTK) e o relevo dentro da area (ou a tolerancia
  // do seguimento); arrastamento por movimento; rota exportada segmento a
  // segmento. Tudo puro em src/mission/uncertainty.js.
  const posError = useMemo(
    () => positioningError(aircraft, drone.rtk === true),
    [aircraft, drone.rtk],
  )
  const relief = useMemo(() => {
    if (!planOk || terrain.status !== 'ready' || !terrain.data?.elevationAt) return null
    return terrainReliefRange(
      planOk.waypoints,
      terrain.data.elevationAt,
      areaBasePoint ?? planOk.waypoints[0],
    )
  }, [planOk, terrain, areaBasePoint])
  const tfActive = Boolean(terrainFollow.enabled && terrainResult && !terrainResult.error)
  const uncertainty = useMemo(
    () =>
      planOk && sensor.type === 'camera'
        ? uncertaintyIntervals({
            sensor,
            altitude: params.altitude,
            gimbalPitch: gsdPitch,
            spacing,
            interval,
            posError,
            relief,
            terrainFollow: tfActive,
            toleranceM: terrainFollow.tolerance,
          })
        : null,
    [
      planOk,
      sensor,
      params.altitude,
      gsdPitch,
      spacing,
      interval,
      posError,
      relief,
      tfActive,
      terrainFollow.tolerance,
    ],
  )
  const blur = useMemo(() => (gsd != null ? motionBlur({ speed, gsdCm: gsd }) : null), [speed, gsd])
  // Sobre a geometria que sai no KMZ do modo activo (view3d), e nao so na
  // area: a orbita, a fachada, o corredor e a inspeccao ficavam sem nenhuma
  // verificacao de rota, e foi na orbita que apareceu o troco inexecutavel.
  const route = useMemo(() => {
    if (!view3d?.waypoints?.length) return null
    const v =
      missionMode === 'orbit'
        ? orbitConfig.speedMS
        : missionMode === 'circular'
          ? circularSpeed
          : speed
    return routeChecks(view3d.waypoints, {
      speed: v,
      maxClimbMS: aircraft.maxClimbMS ?? 5,
      // as descidas contra a velocidade de descida da aeronave (M2-T13)
      maxDescentMS: aircraft.maxDescentMS ?? aircraft.maxClimbMS ?? 5,
      breaks: view3d.breaks ?? null,
    })
  }, [
    view3d,
    missionMode,
    orbitConfig.speedMS,
    circularSpeed,
    speed,
    aircraft.maxClimbMS,
    aircraft.maxDescentMS,
  ])

  // Obturador na órbita (M2-E6): a corda voada entre fotos contra o
  // intervalo mínimo do payload — o circular já avisava, a órbita não
  const orbitTriggerWarn = useMemo(() => {
    const s = orbitPlan && !orbitPlan.error ? orbitPlan.stats : null
    if (!s || s.capture === 'video' || !(s.pointsPerOrbit > 0)) return null
    return avisoIntervalo(2 * s.radiusM * Math.sin(Math.PI / s.pointsPerOrbit), orbitConfig.speedMS)
  }, [orbitPlan, orbitConfig.speedMS, avisoIntervalo])

  /* ----------------------------- Preflight ---------------------------- */
  // Uma só lista, calculada a partir do mesmo estado que a exportação usa
  // (src/mission/preflight.js). Os bloqueios desactivam o botão do KMZ.
  // o erro do seguimento de terreno é um código (M3-C8); o preflight mostra-o
  // na língua da interface
  const terrainResultForPreflight = useMemo(() => {
    if (!terrainResult?.error) return terrainResult
    const key = `cp.terrain.err.${terrainResult.error}`
    const msg = t(key, { msg: terrainResult.detail ?? '' })
    return { ...terrainResult, error: msg === key ? String(terrainResult.error) : msg }
  }, [terrainResult, t])
  // primeiro voo de uma combinação aeronave + payload + modo sem KMZ confirmado
  // na matriz (M3-U19): o preflight lembra o que confirmar
  const unverified = useMemo(() => {
    if (
      isVerifiedFlight({
        aircraftId: drone.aircraftId,
        payloadId: drone.payloadId,
        mode: missionMode,
      })
    )
      return null
    return { aircraft: aircraft.label, payload: payload.label, mode: t(`mode.${missionMode}`) }
  }, [drone.aircraftId, drone.payloadId, missionMode, aircraft, payload, t])
  const preflight = useMemo(
    () =>
      preflightFor(missionMode, {
        plan,
        blocks,
        photoMode,
        waypointStops: params.waypointStops,
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
        reservePct: split.reservePct,
        aglWarn,
        triggerWarn,
        terrainDatum: terrain.data?.verticalDatum ?? null,
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
        routePoints: view3d?.waypoints ?? null,
        flightOfIndex,
        rthHeightM: rthInfo?.maxM ?? null,
        unverified,
        corridorPlan,
        corridorTriggerWarn,
        corridorPhotoMode: corridorConfig.photoMode,
        corridorWaypointStops: corridorConfig.waypointStops,
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
        faceTakeoff,
        orbitTakeoff,
      }),
    [
      missionMode,
      plan,
      blocks,
      photoMode,
      params.waypointStops,
      corridorConfig.photoMode,
      corridorConfig.waypointStops,
      terrainFollow,
      terrainCovers,
      terrainResultForPreflight,
      areaBasePoint,
      areaBaseDistance,
      perBlockBases,
      baseLayout,
      viewshedByBlock,
      refBase,
      zones,
      vlosM,
      corridorBase,
      circularBase,
      circularBaseDistance,
      speed,
      batteryMin,
      split.reservePct,
      aglWarn,
      triggerWarn,
      corridorPlan,
      corridorTriggerWarn,
      corridorTerrain,
      corridorReference,
      corridorCovers,
      corridorBaseDistance,
      corridorSpeed,
      circularPlan,
      circularTriggerWarn,
      circularReference,
      circularTerrain,
      circularCovers,
      circularSpeed,
      facePlan,
      orbitPlan,
      faceTakeoff,
      orbitTakeoff,
      terrain.data,
      clearance,
      reference,
      gimbal,
      uncertainty,
      blur,
      route,
      aglMaxM,
      terrainRoute,
      terrainHoles,
      transitClearanceInfo,
      orbitTriggerWarn,
      areaRouteOps,
      planErrorText,
      blockFlightLabels,
      flightOfIndex,
      rthInfo,
      view3d,
      dsmLoaded,
      faceClearance,
      unverified,
      corridorRouteOps,
      circularRouteOps,
    ],
  )
  const exportBlocked = hasBlockers(preflight)
  // sem relevo sobre a rota, o próprio item do preflight descarrega o global
  const terrainActions = useMemo(() => {
    const a = { label: t('cp.terrain.downloadGlobal'), onClick: handleLoadTerrain }
    return {
      'terrain-missing': a,
      'terrain-download-error': a,
      'terrain-file-outside': a,
      'terrain-file-error': a,
    }
  }, [t, handleLoadTerrain])

  return {
    preflight,
    aglWarn,
    uncertainty,
    blur,
    orbitTriggerWarn,
    exportBlocked,
    terrainActions,
  }
}
