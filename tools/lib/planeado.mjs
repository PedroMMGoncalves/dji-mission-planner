/**
 * O que o plano previu, a partir do ficheiro de projecto (o mesmo motor da
 * aplicação, em src/mission/planFromProject.js: sensor, pegada, espaçamento,
 * intervalo, mosaico, plano de área, blocos, densidade LiDAR), e a
 * comparação com o que se mediu.
 */
import { planMissionFromProject } from '../../src/mission/planFromProject.js'
import { normalizeProject } from '../../src/mission/project.js'

/** Lê o projecto (v1/v2) e devolve o previsto para a missão de área. */
export function predictFromProject(json) {
  const n = normalizeProject(json)
  if (!n) throw new Error('ficheiro de projecto invalido (version 1 ou 2 em falta)')
  const p = planMissionFromProject(n)
  return {
    missionName: n.missionName ?? null,
    drone: p.drone,
    aircraftLabel: p.aircraft.label,
    payloadLabel: p.payload.label,
    imageSource: p.payload.imageSource ?? null,
    sensor: p.sensor,
    params: p.params,
    speed: p.speed,
    // tempo útil por voo (a reserva já descontada) e a reserva que o projecto declara
    batteryMin: p.batteryMin,
    reservePct: p.reservePct,
    ring: p.ring,
    basePoint: p.basePoint,
    footprint: p.footprint,
    spacingM: p.spacingM,
    intervalM: p.intervalM,
    gsdCm: p.gsdCm,
    aglM: p.aglM,
    plan: p.planOk,
    planError: p.planError,
    // blocos de voo (área, bateria ou mosaico) e o voo mais longo em fracção do tempo útil
    blocks: p.blocks,
    longestS: p.longestS,
    worstRatio: p.worstRatio,
    densityPerM2: p.densityPerM2,
    densityOverlapPerM2: p.densityOverlapPerM2,
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
