/**
 * O plano de uma missão de área a partir de um projecto normalizado
 * (normalizeProject): o mesmo motor da aplicação sem a interface — sensor,
 * pegada, espaçamento e intervalo, mosaico manual ou dimensionado pela
 * bateria, plano simples ou por célula e blocos de voo. Serve a ferramenta
 * planeado-vs-medido (tools/lib/planeado.mjs), as missões de referência
 * (docs/validacao/missoes/esperado.json) e a matriz de conformidade WPML;
 * o App faz o mesmo em useAreaGeometry e useAreaMission, memo a memo, com
 * os mesmos módulos (M3-T9).
 *
 * Fora do âmbito, por serem da interface: a tradução das células
 * desactivadas de um mosaico antigo (mosaicLegacy.js) e as atribuições
 * manuais de blocos a bases (blockBase), que não mudam o plano.
 */
import { AIRCRAFT, DEFAULT_CUSTOM_SENSOR, DEFAULT_SELECTION, PAYLOADS } from '../data/drones.js'
import { batteryMinFor } from '../data/drones.js'
import {
  bufferDistanceMeters,
  computeFootprint,
  computeGSD,
  lidarPointDensity,
  lineSpacing,
  normalizeTriggerMode,
  normalizeWaypointStops,
  resolveSensor,
  ringToPolygon,
  validateRing,
} from '../utils/geo.js'
import { planArea } from './areaPlan.js'
import { cellFitsBattery, squareSideWithBaseTransit } from './baseLayout.js'
import { DEFAULT_ZONE_RADIUS_M } from './takeoffZones.js'
import { planBlocks } from './blocks.js'
import { triggerInterval } from './triggerInterval.js'
import { DEFAULT_PARAMS, DEFAULT_SPLIT } from './defaults.js'
import { usableBatteryMin } from './preflight.js'
import { buildSquareMosaic, mosaicOrientationForLines } from './squareMosaic.js'

/**
 * @param {any} n projecto normalizado (normalizeProject), ou o que dele interessa
 * @param {{zoneRadiusM?: number}} [opts] raio da zona de descolagem do equipamento
 *   (o trânsito contado no lado do quadrado por bateria)
 */
export function planMissionFromProject(n, { zoneRadiusM = DEFAULT_ZONE_RADIUS_M } = {}) {
  const drone = n.drone ?? { ...DEFAULT_SELECTION }
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  if (!aircraft || !payload)
    throw new Error(`hardware desconhecido: ${drone.aircraftId}/${drone.payloadId}`)
  const tuning = n.payloadTuning?.[drone.payloadId]?.effectiveFov
  const activePayload =
    payload.type === 'lidar' && tuning ? { ...payload, effectiveFov: tuning } : payload
  const sensor = resolveSensor(activePayload, { ...DEFAULT_CUSTOM_SENSOR, ...(n.custom ?? {}) })
  const params = {
    ...DEFAULT_PARAMS,
    ...(n.params ?? {}),
    triggerMode: normalizeTriggerMode(n.params?.triggerMode),
    waypointStops: normalizeWaypointStops(n.params?.waypointStops),
  }
  const split = { ...DEFAULT_SPLIT, ...(n.split ?? {}) }
  const range = aircraft.speedRange ?? { min: 1, max: 20 }
  const speed = Math.min(range.max, Math.max(range.min, params.speed))
  const footprint = computeFootprint(sensor, params.altitude)
  const spacingM =
    params.spacingMode === 'manual'
      ? Math.max(1, params.manualSpacing)
      : lineSpacing(footprint.across, params.sideOverlap)
  // o mesmo intervalo efectivo da aplicação: automático, ou o escrito à mão
  const intervalM = triggerInterval({
    footprintAlong: footprint.along,
    frontOverlapPct: params.frontOverlap,
    triggerMode: params.triggerMode,
    intervalMode: sensor.type === 'camera' ? params.intervalMode : 'auto',
    manualIntervalM: params.manualIntervalM,
    manualIntervalS: params.manualIntervalS,
    speed,
  }).intervalM
  const gsdPitch = params.crosshatch && params.includeNadir ? -90 : params.gimbalPitch
  const gsdCm = computeGSD(sensor, params.altitude, gsdPitch)
  const photoMode =
    sensor.type === 'camera' && params.triggerMode === 'waypoint' && intervalM > 0
      ? 'waypoint'
      : 'distance'
  // bateria da missão: o tempo útil do projecto (a reserva já descontada,
  // project.js); sem ele, o nominal do equipamento para a combinação
  const usefulMin = n.battery?.usefulMin
  const batteryMin =
    Number.isFinite(usefulMin) && usefulMin > 0
      ? usefulMin
      : batteryMinFor(aircraft, drone.payloadId, n.batteryByCombo ?? {})
  const reservePct = Number.isFinite(split.reservePct) ? split.reservePct : 0
  const ring = n.ring ?? null
  const holes = Array.isArray(n.holes) ? n.holes : []
  const valid = ring ? validateRing(ring, holes).valid : false

  /* --------- mosaico: manual ('tiles') ou dimensionado pela bateria --------- */
  const passes = params.crosshatch ? (params.includeNadir ? 3 : 2) : 1
  const overshootM = Math.max(0, params.overshoot || 0)
  const tieLine = Boolean(params.tieLine)
  const bufferPct = Math.max(0, params.bufferPct || 0)
  // foto por waypoint com paragem em todos: uma paragem a cada intervalo
  const stopEveryM =
    params.waypointStops === 'all' && photoMode === 'waypoint' && intervalM > 0 ? intervalM : 0
  const gridCells = Array.isArray(n.cells) && n.cells.length ? n.cells : null
  let mosaic = null
  let tileSide = null
  if (valid && !gridCells && (split.mode === 'tiles' || split.mode === 'battery')) {
    let side = split.tileSize
    let fits = null
    const bufferM = bufferPct > 0 ? bufferDistanceMeters(ringToPolygon(ring, holes), bufferPct) : 0
    if (split.mode === 'battery') {
      const opts = {
        batteryMin,
        reservePct,
        speed,
        spacingM,
        maxSideM: split.maxSide,
        passes,
        stopEveryM,
        overshootM,
        tieLine,
        bufferPct,
        bufferM,
      }
      side = squareSideWithBaseTransit(opts, { zoneRadiusM }).side
      fits = cellFitsBattery({
        usableS: batteryMin > 0 ? batteryMin * 60 * (1 - reservePct / 100) : 0,
        spacingM,
        speed,
        passes,
        stopEveryM,
        lineAngleDeg: params.angle,
        zoneRadiusM,
        overshootM,
        tieLine,
        bufferPct,
        bufferM,
      })
    }
    const orientationDeg =
      split.tileOrientationAuto === false
        ? split.tileOrientation
        : mosaicOrientationForLines(params.angle)
    mosaic = buildSquareMosaic(ring, { holes, sideM: side, orientationDeg, fits })
    tileSide = side
  }
  const mosaicCells = Array.isArray(mosaic?.cells) ? mosaic.cells : null
  const disabled = n.disabledTiles instanceof Set ? n.disabledTiles : new Set(n.disabledTiles ?? [])
  let activeCells = null
  let activeCellIds = null
  let activeCellHoles = null
  if (gridCells) activeCells = gridCells
  else if (mosaicCells) {
    const kept = mosaicCells.map((c, i) => ({ c, i })).filter(({ i }) => !disabled.has(i))
    if (kept.length) {
      activeCells = kept.map(({ c }) => c.ring)
      activeCellIds = kept.map(({ i }) => i + 1)
      activeCellHoles = kept.map(({ c }) => c.holes ?? [])
    }
  }

  /* ------------------------------- plano -------------------------------- */
  const plan = valid
    ? planArea(ring, activeCells, {
        spacingM,
        angleDeg: params.angle,
        bufferPct: params.bufferPct,
        photoIntervalM: intervalM ?? 0,
        speed,
        crosshatch: params.crosshatch,
        includeNadir: Boolean(params.crosshatch && params.includeNadir),
        overshootM,
        tieLine,
        photoMode,
        holes,
        cellHoles: activeCellHoles,
        waypointStops: params.waypointStops,
      })
    : ring
      ? { error: 'invalid-ring' }
      : null
  const planOk = plan && !plan.error ? plan : null
  const blocks = planOk
    ? planBlocks(planOk, {
        activeCells,
        cellIds: activeCellIds,
        cellHoles: activeCellHoles,
        split,
        batteryMin,
        speed,
        spacingM,
        waypointStops: params.waypointStops,
        overshootM,
      })
    : null
  // o voo mais longo (bloco, ou a rota inteira) em fracção do tempo útil:
  // acima de 1 não cabe numa bateria
  const usableS = usableBatteryMin(batteryMin, reservePct) * 60
  const longestS = blocks?.length
    ? Math.max(...blocks.map((b) => b.timeS))
    : (planOk?.stats?.flightTimeS ?? null)
  const worstRatio = longestS != null && usableS > 0 ? longestS / usableS : null
  const density =
    sensor.type === 'lidar' && payload.maxPrr
      ? lidarPointDensity({ prr: payload.maxPrr, speed, swathM: footprint.across })
      : null
  return {
    drone,
    aircraft,
    payload,
    sensor,
    params,
    split,
    speed,
    batteryMin,
    reservePct,
    usableS,
    ring,
    holes,
    basePoint: n.bases?.[0]?.point ?? null,
    footprint,
    spacingM,
    intervalM,
    gsdCm,
    aglM: params.altitude,
    photoMode,
    mosaic,
    tileSide,
    activeCells,
    plan,
    planOk,
    planError: plan?.error ?? null,
    blocks,
    longestS,
    worstRatio,
    densityPerM2: density?.single ?? null,
    densityOverlapPerM2: density?.overlap ?? null,
  }
}
