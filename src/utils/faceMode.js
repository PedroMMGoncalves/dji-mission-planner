import * as turf from '@turf/turf'
import { offsetPolylineMiter, pointPolylineDistance, resamplePolyline } from './corridor.js'
import { computeFootprint, computeGSD } from './geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from './units.js'

/** Fracção do afastamento abaixo da qual a linha afastada é recusada (M2-E3). */
export const STANDOFF_MIN_FRAC = 0.95

/**
 * Linha afastada de dM metros (positivo = à ESQUERDA do sentido do desenho)
 * de uma polilinha lon/lat, num referencial métrico local — turf.lineOffset
 * trabalha em graus e encolhe os desvios E-O por cos(lat), que a ~40° faz
 * de 25 m uns 19 m.
 *
 * A junta é a do corredor (offsetPolylineMiter): arco a |dM| exactos do
 * vértice do lado convexo, em que o rumo perpendicular à tangente aponta
 * ao próprio vértice, e esquadria do lado côncavo. A mitra de antes
 * disparava para 2,5·d e, acima de 132° de deflexão, caía num «bisel» que
 * punha o drone a 6–12 m de uma face a 25 m (M2-E3 da revisão da
 * matemática). O afastamento é o parâmetro de segurança: se alguma amostra
 * da linha afastada ficar a menos de STANDOFF_MIN_FRAC·|dM| da linha de
 * base — canto côncavo demasiado fechado, troço mais curto do que o
 * afastamento permite (um U voado por dentro) — devolve-se `null` e o
 * plano é recusado com `standoff-corner`.
 * @returns {number[][]|null} pontos lon/lat, ou null quando o afastamento não se garante
 */
function offsetPolyline(coords, dM) {
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length
  const kx = metersPerDegLon(lat0)
  const ky = M_PER_DEG_LAT
  const P = coords.map(([lon, lat]) => [lon * kx, lat * ky])
  const off = offsetPolylineMiter(P, dM)
  if (off.length < 2) return null
  const dense = resamplePolyline(off, Math.max(0.5, Math.abs(dM) / 10))
  if (!dense.truncated) {
    const limit = Math.abs(dM) * STANDOFF_MIN_FRAC
    for (const q of dense) if (pointPolylineDistance(q, P) < limit) return null
  }
  return off.map(([x, y]) => [x / kx, y / ky])
}

/** Valores iniciais da configuração de fachada (E1.1). */
export const DEFAULT_FACE_CONFIG = {
  baseline: null, // polilinha [[lon,lat],...] = pé da face
  heightM: 30,
  standoffM: 25,
  side: 'left',
  verticalOverlapPct: 70,
  horizontalOverlapPct: 70,
  gimbalPitch: 0,
  minClearanceM: 15,
  speedMS: 5, // velocidade de voo da fachada (P1) — parâmetro explícito
}

/**
 * E1.1: normaliza uma configuração de fachada guardada num projecto para o
 * formato corrente — campos em falta caem nos valores por omissão, números
 * são validados e limitados, lixo nunca rebenta (projectos antigos, sem o
 * campo, carregam com os defaults).
 */
export function normalizeFaceConfig(stored) {
  const d = { ...DEFAULT_FACE_CONFIG }
  if (!stored || typeof stored !== 'object') return d
  const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt)
  const baseline =
    Array.isArray(stored.baseline) &&
    stored.baseline.length >= 2 &&
    stored.baseline.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      ? stored.baseline.map((p) => [p[0], p[1]])
      : null
  return {
    baseline,
    heightM: num(stored.heightM, 2, 500, d.heightM),
    standoffM: num(stored.standoffM, 5, 200, d.standoffM),
    side: stored.side === 'right' ? 'right' : 'left',
    verticalOverlapPct: num(stored.verticalOverlapPct, 0, 95, d.verticalOverlapPct),
    horizontalOverlapPct: num(stored.horizontalOverlapPct, 0, 95, d.horizontalOverlapPct),
    gimbalPitch: num(stored.gimbalPitch, -90, 45, d.gimbalPitch),
    minClearanceM: num(stored.minClearanceM, 2, 100, d.minClearanceM),
    speedMS: num(stored.speedMS, 1, 10, d.speedMS),
  }
}

/**
 * FACE MODE (T4.2) — serpentina vertical sobre uma face (sub)vertical:
 * afloramentos rochosos, taludes de pedreira, fachadas, estruturas.
 *
 * A `baseline` é a polilinha desenhada no mapa = pé da face. O plano gera
 * passagens horizontais a alturas crescentes, cada uma a seguir a baseline
 * afastada de `standoffM` para o lado escolhido; em cada waypoint o rumo é
 * perpendicular ao troço local (a apontar à face), o gimbal fica a
 * `gimbalPitch` (≈0° para faces verticais) e dispara-se uma foto — o
 * disparo por distância não conhece as mudanças de rumo, por isso os
 * waypoints são densificados com ações próprias (via T4.1).
 *
 * Segurança: o standoff NÃO é validado contra o terreno (a resolução do
 * Terrarium é inutilizável à escala de uma face) — a interface deve mostrar
 * esse aviso. As alturas exportam-se relativeToStartPoint: o ponto de
 * descolagem deve estar à cota do pé da face, ou as alturas ajustadas.
 *
 * Convenções: `side` é o lado da baseline (no sentido do desenho) onde o
 * drone voa — 'left' à esquerda de quem percorre a linha; a face fica do
 * lado oposto. Alturas em metros acima do pé da face.
 */
export function generateFacePlan(baseline, options) {
  const {
    sensor,
    faceHeightM,
    standoffM = 25,
    side = 'left',
    verticalOverlapPct = 70,
    horizontalOverlapPct = 70,
    gimbalPitch = 0,
    minHeightM = 5,
    speed = 3,
  } = options ?? {}

  if (!baseline || baseline.length < 2) return null
  if (!(faceHeightM > 0) || !(standoffM > 0)) return { error: 'invalid-dimensions' }
  if (!sensor || sensor.type !== 'camera' || !(sensor.focalLength > 0)) {
    return { error: 'camera-required' }
  }

  // pegada da imagem NA FACE à distância standoff (pin-hole). Com a câmara a
  // `gimbalPitch` (p) e meia-abertura vertical v = atan(sH/2f), a banda que
  // a imagem vê numa face vertical à distância d é
  // [h + d·tan(p − v), h + d·tan(p + v)]; nivelada, ±d·tan v = ±imgH/2. A
  // geometria era só a nivelada e o pitch ia apenas para o gimbal: a −20°
  // um M3E a 25 m deixava um terço do topo sem imagem com as estatísticas a
  // dizer «coberta» (M2-E2 da revisão da matemática).
  const fp = computeFootprint(sensor, standoffM)
  const imgW = fp.across
  const halfV = Math.atan(sensor.sensorHeight / (2 * sensor.focalLength))
  const pitchRad = (gimbalPitch * Math.PI) / 180
  if (Math.abs(pitchRad) + halfV >= Math.PI / 2 - 1e-9) return { error: 'pitch-too-steep' }
  // bordos da banda, em metros acima do centro da imagem (bottom < 0 < top)
  const bandBottom = standoffM * Math.tan(pitchRad - halfV)
  const bandTop = standoffM * Math.tan(pitchRad + halfV)
  const imgH = bandTop - bandBottom
  const vStep = imgH * (1 - verticalOverlapPct / 100)
  const hStep = imgW * (1 - horizontalOverlapPct / 100)
  if (!(vStep > 0.1) || !(hStep > 0.1)) return { error: 'overlap-too-high' }

  // alturas das passagens: centros de imagem tais que a banda vá do pé da
  // face (h + bandBottom = 0) ao topo (h + bandTop = H), distribuídos
  // uniformemente com passo ≤ vStep; passagem única centrada quando a face
  // cabe numa imagem.
  //
  // O piso de segurança `minHeightM` entra no INÍCIO do intervalo, não como
  // correcção da passagem mais baixa depois de a grelha estar feita: com
  // afastamentos curtos a imagem é estreita (a 5 m um M3E cobre ~2.7 m de
  // face) e o passo fica muito abaixo do piso, pelo que subir só a primeira
  // passagem punha-a ACIMA das seguintes — serpentina fora de ordem, passo
  // vertical negativo nas estatísticas e as restantes passagens na mesma
  // abaixo do piso. Aplicado ao intervalo, o piso vale para todas.
  const floorM = Math.max(0, minHeightM)
  let heights
  if (faceHeightM <= imgH) {
    heights = [Math.max(floorM, faceHeightM / 2 - (bandBottom + bandTop) / 2)]
  } else {
    const first = Math.max(-bandBottom, floorM)
    const last = faceHeightM - bandTop
    if (last <= first) {
      // o piso já está acima do centro da passagem de topo: uma só passagem
      heights = [first]
    } else {
      const n = Math.max(2, Math.ceil((last - first) / vStep) + 1)
      const step = (last - first) / (n - 1)
      heights = Array.from({ length: n }, (_, k) => first + k * step)
    }
  }
  // faixa no pé da face que nenhuma imagem apanha por causa do piso
  const uncoveredBottomM = Math.max(0, heights[0] + bandBottom)

  // linha afastada: standoff para o lado escolhido, em métrica local; null
  // quando um canto ou um troço curto não deixam manter o afastamento
  const offsetPts = offsetPolyline(baseline, side === 'left' ? standoffM : -standoffM)
  if (!offsetPts) return { error: 'standoff-corner' }
  const offset = turf.lineString(offsetPts)
  const offLenM = turf.length(offset, { units: 'meters' })
  if (!(offLenM > 0)) return null

  // amostragem ao longo da linha afastada, extremos incluídos, passo ≤ hStep
  const nPts = Math.max(2, Math.ceil(offLenM / hStep) + 1)
  const stepM = offLenM / (nPts - 1)
  const pts = Array.from(
    { length: nPts },
    (_, i) => turf.along(offset, i * stepM, { units: 'meters' }).geometry.coordinates,
  )

  // rumo por amostra: perpendicular à tangente local, a apontar à face
  // (lado oposto ao do afastamento)
  const headings = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(nPts - 1, i + 1)]
    const tangent = turf.bearing(a, b)
    const toFace = side === 'left' ? tangent + 90 : tangent - 90
    return ((Math.round(toFace) % 360) + 360) % 360
  })

  // serpentina vertical: cada passagem alterna o sentido; a subida entre
  // passagens acontece no mesmo ponto horizontal (viragem em altura)
  const waypoints = []
  const perWaypoint = []
  heights.forEach((h, k) => {
    const order = Array.from({ length: nPts }, (_, i) => i)
    if (k % 2 === 1) order.reverse()
    for (const i of order) {
      waypoints.push([pts[i][0], pts[i][1], Math.round(h * 10) / 10])
      perWaypoint.push({ heading: headings[i], gimbalPitch, actions: ['takePhoto'] })
    }
  })

  let pathLengthM = 0
  for (let i = 1; i < waypoints.length; i++) {
    const dxy = turf.distance(waypoints[i - 1], waypoints[i], { units: 'meters' })
    const dh = Math.abs((waypoints[i][2] ?? 0) - (waypoints[i - 1][2] ?? 0))
    pathLengthM += Math.hypot(dxy, dh)
  }

  return {
    waypoints,
    perWaypoint,
    offsetLine: pts,
    stats: {
      passCount: heights.length,
      pointsPerPass: nPts,
      waypointCount: waypoints.length,
      photoCount: waypoints.length,
      vStepM: heights.length > 1 ? heights[1] - heights[0] : null,
      hStepM: stepM,
      imageWidthM: imgW,
      // altura da banda vista na face (com a inclinação pedida)
      imageHeightM: imgH,
      bandBottomM: bandBottom,
      bandTopM: bandTop,
      minHeightM: floorM,
      uncoveredBottomM,
      // GSD no centro da imagem: a distância ao longo do eixo óptico
      gsdCm: computeGSD(sensor, standoffM / Math.cos(pitchRad)),
      standoffM,
      heights,
      pathLengthM,
      // paragem-e-disparo: ~2 s por waypoint além do deslocamento
      flightTimeS: speed > 0 ? pathLengthM / speed + waypoints.length * 2 : null,
    },
  }
}

/**
 * R2.8: verificação de folga de um plano de fachada contra um DSM LOCAL
 * (GeoTIFF via demFile.js — `elevationAt(lon, lat)` injetável). NUNCA usar
 * tiles Terrarium aqui: a resolução é inutilizável à escala de uma face;
 * sem DSM local o chamador mantém o aviso "standoff não verificado".
 *
 * Por waypoint (a resolução dos pontos de foto):
 *  - folga VERTICAL = cota absoluta do drone (pé da face + altura da
 *    passagem) − DSM na posição do drone;
 *  - folga HORIZONTAL = distância, ao longo do rumo da câmara, até à
 *    primeira amostra (a 1/4, 1/2 e 3/4 do standoff) cuja superfície chega
 *    à cota do drone — a face a abaular para dentro do corredor.
 * `footElevM` é a cota do pé da face; por omissão usa o DSM na posição do
 * primeiro waypoint com dados (corredor ao nível do pé).
 *
 * Devolve { ok, passes, minVerticalM, minHorizontalM, minClearanceM,
 * samples } com a lista de passagens (1-based) com folga abaixo do mínimo,
 * ou null quando o DSM não tem dados na zona (aviso de não-verificado).
 */
export function checkFaceClearance(plan, elevationAt, options = {}) {
  const { footElevM = null, minClearanceM = 15 } = options
  if (!plan?.waypoints?.length || typeof elevationAt !== 'function') return null
  const standoffM = options.standoffM ?? plan.stats?.standoffM ?? 25
  const pointsPerPass = plan.stats?.pointsPerPass ?? plan.waypoints.length

  let foot = footElevM
  if (foot == null) {
    for (const w of plan.waypoints) {
      const z = elevationAt(w[0], w[1])
      if (Number.isFinite(z)) {
        foot = z
        break
      }
    }
  }
  if (!Number.isFinite(foot)) return null

  let sampled = 0
  let minVertical = Infinity
  let minHorizontal = standoffM
  const flagged = new Set()

  plan.waypoints.forEach((w, i) => {
    const droneAbs = foot + (w[2] ?? 0)
    const pass = Math.floor(i / pointsPerPass) + 1

    const zHere = elevationAt(w[0], w[1])
    if (Number.isFinite(zHere)) {
      sampled += 1
      const vertical = droneAbs - zHere
      if (vertical < minVertical) minVertical = vertical
      if (vertical < minClearanceM) flagged.add(pass)
    }

    const heading = plan.perWaypoint?.[i]?.heading
    if (heading != null && standoffM > 0) {
      for (let k = 1; k <= 3; k++) {
        const d = (k / 4) * standoffM
        const p = turf.destination(turf.point([w[0], w[1]]), d, ((heading + 540) % 360) - 180, {
          units: 'meters',
        }).geometry.coordinates
        const z = elevationAt(p[0], p[1])
        if (!Number.isFinite(z)) continue
        sampled += 1
        if (z >= droneAbs) {
          if (d < minHorizontal) minHorizontal = d
          if (d < minClearanceM) flagged.add(pass)
          break
        }
      }
    }
  })

  if (sampled === 0) return null
  const passes = [...flagged].sort((a, b) => a - b)
  return {
    ok: passes.length === 0,
    passes,
    minVerticalM: Number.isFinite(minVertical) ? minVertical : null,
    minHorizontalM: minHorizontal,
    minClearanceM,
    samples: sampled,
  }
}
