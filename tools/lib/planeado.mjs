/**
 * O que o plano previu, a partir do ficheiro de projecto (o mesmo motor da
 * aplicação: sensor, pegada, espaçamento, intervalo, plano de área,
 * densidade LiDAR), e a comparação com o que se mediu.
 */
import { AIRCRAFT, PAYLOADS, batteryMinFor } from '../../src/data/drones.js'
import {
  computeFootprint,
  computeGSD,
  lidarPointDensity,
  lineSpacing,
  photoInterval,
  resolveSensor,
} from '../../src/utils/geo.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { normalizeProject } from '../../src/mission/project.js'
import { DEFAULT_PARAMS, DEFAULT_SPLIT } from '../../src/mission/defaults.js'

/** Lê o projecto (v1/v2) e devolve o previsto para a missão de área. */
export function predictFromProject(json) {
  const n = normalizeProject(json)
  if (!n) throw new Error('ficheiro de projecto invalido (version 1 ou 2 em falta)')
  const drone = n.drone ?? { aircraftId: 'M3E', payloadId: 'M3E_WIDE' }
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  if (!aircraft || !payload)
    throw new Error(`hardware desconhecido: ${drone.aircraftId}/${drone.payloadId}`)
  const tuning = n.payloadTuning?.[drone.payloadId]?.effectiveFov
  const activePayload =
    payload.type === 'lidar' && tuning ? { ...payload, effectiveFov: tuning } : payload
  const sensor = resolveSensor(activePayload, n.custom ?? {})
  const params = { ...DEFAULT_PARAMS, ...(n.params ?? {}) }
  const split = { ...DEFAULT_SPLIT, ...(n.split ?? {}) }
  const range = aircraft.speedRange ?? { min: 1, max: 20 }
  const speed = Math.min(range.max, Math.max(range.min, params.speed))
  const footprint = computeFootprint(sensor, params.altitude)
  const spacingM =
    params.spacingMode === 'manual'
      ? Math.max(1, params.manualSpacing)
      : lineSpacing(footprint.across, params.sideOverlap)
  const intervalM = photoInterval(footprint.along, params.frontOverlap)
  const gsdPitch = params.crosshatch && params.includeNadir ? -90 : params.gimbalPitch
  const gsdCm = computeGSD(sensor, params.altitude, gsdPitch)
  const photoMode =
    sensor.type === 'camera' && params.triggerMode === 'waypoint' && intervalM > 0
      ? 'waypoint'
      : 'distance'
  const plan = n.ring
    ? planArea(n.ring, null, {
        spacingM,
        angleDeg: params.angle,
        bufferPct: params.bufferPct,
        photoIntervalM: intervalM ?? 0,
        speed,
        crosshatch: params.crosshatch,
        includeNadir: Boolean(params.crosshatch && params.includeNadir),
        overshootM: Math.max(0, params.overshoot || 0),
        tieLine: Boolean(params.tieLine),
        photoMode,
      })
    : null
  const density =
    sensor.type === 'lidar' && payload.maxPrr
      ? lidarPointDensity({ prr: payload.maxPrr, speed, swathM: footprint.across })
      : null
  return {
    missionName: n.missionName ?? null,
    drone,
    aircraftLabel: aircraft.label,
    payloadLabel: payload.label,
    imageSource: payload.imageSource ?? null,
    sensor,
    params,
    speed,
    batteryMin: batteryMinFor(aircraft, drone.payloadId, n.batteryByCombo ?? {}),
    reservePct: split.reservePct,
    ring: n.ring ?? null,
    basePoint: n.basePoint ?? null,
    footprint,
    spacingM,
    intervalM,
    gsdCm,
    aglM: params.altitude,
    plan: plan && !plan.error ? plan : null,
    planError: plan?.error ?? null,
    densityPerM2: density?.single ?? null,
    densityOverlapPerM2: density?.overlap ?? null,
  }
}

const dev = (planned, measured) =>
  planned != null && measured != null && planned !== 0
    ? (100 * (measured - planned)) / Math.abs(planned)
    : null

/**
 * Linhas da tabela planeado / medido / desvio. `measured` junta o que
 * saiu das fotos, do LAS e do registo de voo (qualquer um pode faltar).
 */
export function compare(pred, { photos = null, las = null, log = null } = {}) {
  const rows = []
  const add = (key, label, planned, measured, unit, note = '') =>
    rows.push({ key, label, planned, measured, unit, deviationPct: dev(planned, measured), note })
  if (photos && !photos.error) {
    add('agl', 'Altura AGL (mediana das fotos)', pred.aglM, photos.aglM, 'm')
    add('gsd', 'GSD', pred.gsdCm, photos.gsdCm, 'cm/px')
    add('interval', 'Intervalo entre fotos', pred.intervalM, photos.intervalM, 'm')
    add('front', 'Sobreposicao frontal', pred.params.frontOverlap, photos.frontOverlapPct, '%')
    add('spacing', 'Espacamento entre faixas', pred.spacingM, photos.spacingM, 'm')
    add('side', 'Sobreposicao lateral', pred.params.sideOverlap, photos.sideOverlapPct, '%')
    add('lines', 'Faixas', pred.plan?.stats?.lineCount ?? null, photos.lines, '')
    add('photos', 'Fotos', pred.plan?.stats?.photoCount ?? null, photos.count, '')
    if (photos.insideRing != null) {
      add(
        'inside',
        'Fotos dentro da area',
        photos.count,
        photos.insideRing,
        '',
        'planeado = todas as fotos',
      )
    }
    add(
      'duration',
      'Duracao (primeira a ultima foto)',
      pred.plan?.stats?.flightTimeS ?? null,
      photos.durationS,
      's',
    )
  }
  if (las) {
    add(
      'density',
      'Densidade de pontos (retorno unico)',
      pred.densityPerM2,
      las.densityPerM2,
      'pts/m2',
    )
    add(
      'densityMin',
      'Densidade minima por celula',
      pred.densityPerM2,
      las.cellDensityMin,
      'pts/m2',
      `celulas de ${las.cellM} m`,
    )
  }
  if (log && !log.error) {
    add(
      'logDuration',
      'Duracao do voo (registo)',
      pred.plan?.stats?.flightTimeS ?? null,
      log.durationS,
      's',
    )
    add('logSpeed', 'Velocidade media em movimento', pred.speed, log.meanSpeedMS, 'm/s')
    add('logHeight', 'Altura maxima acima da descolagem', pred.aglM, log.maxHeightM, 'm')
    add('logDist', 'Distancia maxima a base', null, log.maxDistM, 'm')
  }
  return rows
}

const fmt = (v, unit) => {
  if (v == null) return '-'
  const n = Number.isInteger(v)
    ? String(v)
    : Math.abs(v) >= 100
      ? v.toFixed(0)
      : Math.abs(v) >= 10
        ? v.toFixed(1)
        : v.toFixed(2)
  return unit ? `${n} ${unit}` : n
}

/** Relatório em Markdown. */
export function renderMarkdown(pred, rows, sources) {
  const out = []
  out.push(`# Planeado vs medido: ${pred.missionName ?? 'missao'}`)
  out.push('')
  out.push(`- Hardware: ${pred.aircraftLabel} + ${pred.payloadLabel}`)
  out.push(
    `- Plano: ${pred.aglM} m AGL, ${pred.speed} m/s, ${pred.params.frontOverlap}/${pred.params.sideOverlap} % de sobreposicao, gimbal ${pred.params.gimbalPitch} deg${pred.params.crosshatch ? ', dupla grelha' : ''}`,
  )
  if (pred.planError) out.push(`- Plano de area com erro: ${pred.planError}`)
  for (const s of sources) out.push(`- Fonte: ${s}`)
  out.push('')
  out.push('| Grandeza | Planeado | Medido | Desvio |')
  out.push('|---|---:|---:|---:|')
  for (const r of rows) {
    const d =
      r.deviationPct == null
        ? '-'
        : `${r.deviationPct > 0 ? '+' : ''}${r.deviationPct.toFixed(1)} %`
    out.push(
      `| ${r.label}${r.note ? ` (${r.note})` : ''} | ${fmt(r.planned, r.unit)} | ${fmt(r.measured, r.unit)} | ${d} |`,
    )
  }
  out.push('')
  out.push(
    'Desvio = (medido - planeado) / |planeado|. Sobreposicoes medidas com a pegada a altura AGL mediana das fotos; faixas separadas onde o salto entre fotos consecutivas excede 2,5 x o intervalo mediano.',
  )
  return out.join('\n')
}
