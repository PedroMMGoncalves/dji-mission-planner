import * as turf from '@turf/turf'
import {
  computeFootprint,
  computeGSD,
  longestEdgeBearing,
  ringToPolygon,
  routeStats,
} from './geo.js'

/**
 * MODO CIRCULAR («circlegrammetry»): a área coberta por uma grelha de
 * círculos sobrepostos, cada um voado com a câmara oblíqua apontada ao seu
 * centro. Geometria de Bilodeau, Esau, MacDonald e Farooque (ISPRS Open J.
 * Photogramm. Remote Sens. 18, 2025), tal como o UgCS a planeia:
 *
 *  - raio R fixo, altura independente do raio, pitch do gimbal fixo;
 *  - sobreposição p entre círculos vizinhos -> passo entre centros
 *    s = 2R(1 - p); grelha de ceil(L/s) x ceil(W/s) centros, centrada na
 *    caixa da área alinhada com a aresta mais longa, a sair da fronteira;
 *  - uma fiada voada de cada vez, em serpentina; o sentido de rotação
 *    alterna por fiada (horário numa, anti-horário na seguinte);
 *  - cada círculo entra pelo ponto virado ao círculo anterior, dá a volta
 *    completa e sai pelo mesmo ponto para o círculo seguinte: a ligação
 *    entre círculos da mesma fiada mede exactamente s.
 *
 * Em cada waypoint o rumo aponta ao centro e dispara-se uma fotografia; o
 * ponto de fecho repete a posição de entrada sem foto. Alturas relativas ao
 * ponto de descolagem, como o resto da app; o seguimento de terreno é
 * aplicado por waypoint (applyCircularTerrain), sem densificação, para as
 * acções de foto não mudarem de índice.
 */

export const DEFAULT_CIRCULAR_CONFIG = {
  radiusM: 30, // raio recomendado pelo UgCS e usado no estudo
  overlapPct: 50, // sobreposição entre círculos vizinhos (50 % recomendado)
  gimbalPitch: -45, // 45 graus, o valor do estudo; o UgCS aceita 45 a 70
  speedMS: 8,
  angleDeg: null, // null = fiadas alinhadas com a aresta mais longa da área
}

/** Tecto de círculos por missão: acima disto o KMZ fica enorme e o plano lento. */
export const MAX_CIRCLES = 400
/** Pontos por círculo: mínimo para a curva ficar redonda, máximo por sanidade. */
export const MIN_POINTS_PER_CIRCLE = 12
export const MAX_POINTS_PER_CIRCLE = 120

const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt)

/** Normaliza uma configuração guardada num projecto: campos em falta e lixo caem nos defaults. */
export function normalizeCircularConfig(stored) {
  const d = { ...DEFAULT_CIRCULAR_CONFIG }
  if (!stored || typeof stored !== 'object') return d
  return {
    radiusM: num(stored.radiusM, 5, 500, d.radiusM),
    overlapPct: num(stored.overlapPct, 0, 90, d.overlapPct),
    gimbalPitch: num(stored.gimbalPitch, -90, -20, d.gimbalPitch),
    speedMS: num(stored.speedMS, 1, 15, d.speedMS),
    angleDeg: Number.isFinite(stored.angleDeg) ? ((stored.angleDeg % 180) + 180) % 180 : null,
  }
}

/* --------------------------- referencial local -------------------------- */

// metros por grau no elipsoide WGS84 à latitude dada (série clássica,
// erro < 1 cm/km); a constante esférica dava 0,7 % de erro a 40° N
const mPerDegLat = (lat) => {
  const f = (lat * Math.PI) / 180
  return 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f)
}
const mPerDegLon = (lat) => {
  const f = (lat * Math.PI) / 180
  return 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f)
}

/** Referencial em metros centrado em `origin`, com o eixo u ao longo do rumo `angleDeg`. */
function localFrame(origin, angleDeg) {
  const th = (angleDeg * Math.PI) / 180
  const sin = Math.sin(th)
  const cos = Math.cos(th)
  const kx = mPerDegLon(origin[1])
  const ky = mPerDegLat(origin[1])
  const toUV = ([lon, lat]) => {
    const dx = (lon - origin[0]) * kx
    const dy = (lat - origin[1]) * ky
    return [dx * sin + dy * cos, dx * cos - dy * sin]
  }
  const toLonLat = ([u, v]) => {
    const dx = u * sin + v * cos
    const dy = u * cos - v * sin
    return [origin[0] + dx / kx, origin[1] + dy / ky]
  }
  return { toUV, toLonLat }
}

/**
 * Grelha de centros para a área: passo s = 2R(1 - p), caixa alinhada com
 * `angleDeg` (ou a aresta mais longa), grelha centrada e a sair da
 * fronteira. Devolve os centros pela ORDEM DE VOO (fiadas em serpentina),
 * com o sentido de rotação de cada um, e a extensão para fora da área em
 * cada eixo (o «overshoot» que o artigo mede).
 */
export function circularGrid(ring, { radiusM, overlapPct, angleDeg = null }) {
  if (!ring || ring.length < 3) return { error: 'invalid-area' }
  if (!(radiusM > 0)) return { error: 'invalid-radius' }
  const p = num(overlapPct, 0, 90, 0) / 100
  const stepM = 2 * radiusM * (1 - p)
  const angle = Number.isFinite(angleDeg) ? angleDeg : (longestEdgeBearing(ring) ?? 0)
  const origin = turf.centroid(ringToPolygon(ring)).geometry.coordinates
  const { toUV, toLonLat } = localFrame(origin, angle)
  const uv = ring.map(toUV)
  const us = uv.map((q) => q[0])
  const vs = uv.map((q) => q[1])
  const uMin = Math.min(...us)
  const uMax = Math.max(...us)
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const lengthM = uMax - uMin
  const widthM = vMax - vMin
  // N = ceil(L / s) x ceil(W / s), a fórmula (2) do artigo; uma área mais
  // estreita do que um passo leva uma fiada
  const cols = Math.max(1, Math.ceil(lengthM / stepM - 1e-9))
  const rows = Math.max(1, Math.ceil(widthM / stepM - 1e-9))
  const count = cols * rows
  if (count > MAX_CIRCLES) return { error: 'too-many-circles', count, cols, rows }
  const u0 = (uMin + uMax) / 2 - ((cols - 1) * stepM) / 2
  const v0 = (vMin + vMax) / 2 - ((rows - 1) * stepM) / 2
  const centres = []
  for (let j = 0; j < rows; j++) {
    const clockwise = j % 2 === 0
    for (let k = 0; k < cols; k++) {
      // serpentina: fiadas ímpares voadas ao contrário
      const i = clockwise ? k : cols - 1 - k
      centres.push({
        lonLat: toLonLat([u0 + i * stepM, v0 + j * stepM]),
        col: i,
        row: j,
        clockwise,
      })
    }
  }
  // até onde os círculos saem da caixa da área, de cada lado
  const extensionAlongM = Math.max(0, ((cols - 1) * stepM) / 2 + radiusM - lengthM / 2)
  const extensionAcrossM = Math.max(0, ((rows - 1) * stepM) / 2 + radiusM - widthM / 2)
  return {
    centres,
    cols,
    rows,
    count,
    stepM,
    angleDeg: angle,
    lengthM,
    widthM,
    extensionAlongM,
    extensionAcrossM,
  }
}

/**
 * O tempo sobe em degraus com a sobreposição (cada círculo a mais é um
 * degrau) e, dentro de um degrau, mais sobreposição significa menos
 * extensão para fora da área. Daí a regra do artigo: escolher a maior
 * sobreposição que não acrescenta um círculo. Devolve, para o raio dado, o
 * intervalo de sobreposições que mantém o número de círculos actual.
 */
export function overlapAdvice(ring, { radiusM, overlapPct, angleDeg = null }) {
  const g = circularGrid(ring, { radiusM, overlapPct, angleDeg })
  if (g.error) return null
  const D = 2 * radiusM
  // mesmo número de colunas enquanto s >= L / cols  <=>  p <= 1 - L / (D cols)
  const maxByCols = 1 - g.lengthM / (D * g.cols)
  const maxByRows = 1 - g.widthM / (D * g.rows)
  const maxPct = Math.max(0, Math.floor(100 * Math.min(maxByCols, maxByRows)))
  // menos círculos abaixo de: s > L / (cols - 1)  <=>  p < 1 - L / (D (cols - 1))
  const minByCols = g.cols > 1 ? 1 - g.lengthM / (D * (g.cols - 1)) : -Infinity
  const minByRows = g.rows > 1 ? 1 - g.widthM / (D * (g.rows - 1)) : -Infinity
  const minRaw = Math.max(minByCols, minByRows)
  const minPct = Number.isFinite(minRaw) ? Math.max(0, Math.ceil(100 * minRaw)) : 0
  return { count: g.count, cols: g.cols, rows: g.rows, minPct, maxPct: Math.max(minPct, maxPct) }
}

/* ----------------------------- plano de voo ----------------------------- */

/**
 * @param {number[][]} ring polígono da área [[lon, lat], ...]
 * @param {object} opts
 * @param {any} [opts.sensor] sensor resolvido (resolveSensor) ou null
 * @param {number} opts.radiusM raio dos círculos
 * @param {number} opts.overlapPct sobreposição entre círculos vizinhos (%)
 * @param {number} opts.altitude altura relativa de voo (m)
 * @param {number} [opts.gimbalPitch=-45] pitch do gimbal, fixo em todos os pontos
 * @param {number} [opts.frontOverlapPct=80] sobreposição entre fotos consecutivas ao longo do círculo
 * @param {number} [opts.speed=8] velocidade (m/s)
 * @param {number|null} [opts.angleDeg=null] rumo das fiadas; null = aresta mais longa
 * @param {number[][][]|null} [opts.holes=null] anéis interiores (só para a área em ha)
 */
export function generateCircularPlan(ring, opts) {
  const {
    sensor = null,
    radiusM,
    overlapPct,
    altitude,
    gimbalPitch = -45,
    frontOverlapPct = 80,
    speed = 8,
    angleDeg = null,
    holes = null,
  } = opts ?? {}
  if (!ring || ring.length < 3) return { error: 'invalid-area' }
  if (!(radiusM > 0)) return { error: 'invalid-radius' }
  if (!(altitude > 0)) return { error: 'invalid-altitude' }
  const grid = circularGrid(ring, { radiusM, overlapPct, angleDeg })
  if (grid.error) return grid

  // Fotos por círculo: a pegada transversal à distância do eixo óptico
  // (altura / sin|pitch|) vezes (1 - sobreposição frontal), como na órbita.
  // Sem câmara, 24 por volta.
  const pitchRad = (Math.abs(num(gimbalPitch, -90, -20, -45)) * Math.PI) / 180
  const rangeM = altitude / Math.sin(pitchRad)
  const fp = sensor?.type === 'camera' ? computeFootprint(sensor, rangeM) : null
  const chordM = fp
    ? Math.max(1, fp.across * (1 - frontOverlapPct / 100))
    : (2 * Math.PI * radiusM) / 24
  const nPts = Math.min(
    MAX_POINTS_PER_CIRCLE,
    Math.max(MIN_POINTS_PER_CIRCLE, Math.ceil((2 * Math.PI * radiusM) / chordM)),
  )
  const pitch = Math.round(num(gimbalPitch, -90, -20, -45))
  const h = Math.round(altitude * 10) / 10

  const waypoints = []
  const perWaypoint = []
  const circles = []
  const norm = (b) => ((b % 360) + 360) % 360
  grid.centres.forEach((c, k) => {
    const centre = c.lonLat
    // entrada virada ao círculo anterior; o primeiro entra pelo lado oposto
    // ao segundo, para a ligação ao longo da fiada medir sempre um passo
    let entry = 0
    if (k > 0) entry = turf.bearing(centre, grid.centres[k - 1].lonLat)
    else if (grid.centres.length > 1) entry = turf.bearing(centre, grid.centres[1].lonLat) + 180
    const step = (c.clockwise ? 360 : -360) / nPts
    const start = waypoints.length
    for (let i = 0; i <= nPts; i++) {
      const brg = norm(entry + (i % nPts) * step)
      const pos = turf.destination(centre, radiusM, brg > 180 ? brg - 360 : brg, {
        units: 'meters',
      }).geometry.coordinates
      const heading = norm(Math.round(turf.bearing(pos, centre)))
      waypoints.push([pos[0], pos[1], h])
      // o ponto de fecho (i === nPts) repete a entrada sem fotografia
      perWaypoint.push({ heading, gimbalPitch: pitch, actions: i < nPts ? ['takePhoto'] : [] })
    }
    circles.push({
      index: k + 1,
      centre,
      row: c.row,
      col: c.col,
      clockwise: c.clockwise,
      start,
      count: nPts + 1,
    })
  })

  // uma inversão à saída e outra à entrada de cada ligação entre círculos
  const { pathLengthM, flightTimeS } = routeStats(waypoints, {
    speed,
    turns: 2 * (circles.length - 1),
  })
  let areaHa = 0
  try {
    areaHa = turf.area(ringToPolygon(ring, holes)) / 1e4
  } catch {
    areaHa = turf.area(ringToPolygon(ring)) / 1e4
  }
  return {
    waypoints,
    perWaypoint,
    circles,
    turnMode: 'toPointAndPassWithContinuityCurvature',
    stats: {
      circleCount: circles.length,
      cols: grid.cols,
      rows: grid.rows,
      pointsPerCircle: nPts,
      waypointCount: waypoints.length,
      photoCount: circles.length * nPts,
      radiusM,
      overlapPct: num(overlapPct, 0, 90, 0),
      stepM: grid.stepM,
      angleDeg: grid.angleDeg,
      extensionAlongM: grid.extensionAlongM,
      extensionAcrossM: grid.extensionAcrossM,
      gimbalPitch: pitch,
      rangeM,
      chordM,
      gsdCm: sensor?.type === 'camera' ? computeGSD(sensor, altitude, pitch) : null,
      areaHa,
      pathLengthM,
      flightTimeS,
    },
  }
}

/**
 * Seguimento de terreno por waypoint: altura = AGL + (cota do ponto - cota
 * de referência). Sem densificação, para os índices das acções de foto
 * ficarem iguais. Pontos fora do relevo mantêm a AGL. Devolve os waypoints
 * novos e as estatísticas de rota em 3D (comprimento e tempo).
 */
export function applyCircularTerrain(plan, { elevationAt, refElev, agl, speed }) {
  if (!plan?.waypoints?.length || typeof elevationAt !== 'function' || !Number.isFinite(refElev))
    return null
  let missing = 0
  const waypoints = plan.waypoints.map(([lon, lat]) => {
    const e = elevationAt(lon, lat)
    if (!Number.isFinite(e)) {
      missing += 1
      return [lon, lat, agl]
    }
    return [lon, lat, Math.round((agl + e - refElev) * 10) / 10]
  })
  const { pathLengthM, flightTimeS } = routeStats(waypoints, {
    speed,
    turns: 2 * ((plan.circles?.length ?? 1) - 1),
  })
  return { waypoints, missing, pathLengthM, flightTimeS }
}

/**
 * Blocos por círculos inteiros: o bloco fecha quando o círculo seguinte
 * não cabe no tempo útil da bateria. Cada bloco leva os waypoints e o
 * perWaypoint da sua fatia, e a duração própria. Sem tempo útil, um bloco.
 */
export function circularBlocks(plan, waypoints, { usableS = null, speed }) {
  if (!plan?.circles?.length) return []
  const wps = waypoints ?? plan.waypoints
  const timeOf = (from, to) => routeStats(wps.slice(from, to), { speed, turns: 0 }).flightTimeS ?? 0
  const blocks = []
  let cur = null
  const close = () => {
    if (!cur) return
    const slice = wps.slice(cur.start, cur.end)
    const r = routeStats(slice, { speed, turns: 2 * (cur.circles.length - 1) })
    blocks.push({
      id: blocks.length + 1,
      waypoints: slice,
      perWaypoint: plan.perWaypoint.slice(cur.start, cur.end),
      circles: cur.circles,
      lengthM: r.pathLengthM,
      timeS: r.flightTimeS ?? 0,
      durationS: r.flightTimeS ?? null,
    })
    cur = null
  }
  for (const c of plan.circles) {
    const end = c.start + c.count
    // tempo do círculo mais a ligação que o precede quando já há bloco aberto
    const addS = cur ? timeOf(cur.end - 1, end) : timeOf(c.start, end)
    if (cur && usableS != null && cur.timeS + addS > usableS) close()
    if (!cur) cur = { start: c.start, end, circles: [c.index], timeS: timeOf(c.start, end) }
    else {
      cur.end = end
      cur.circles.push(c.index)
      cur.timeS += addS
    }
  }
  close()
  return blocks
}
