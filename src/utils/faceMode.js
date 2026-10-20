import * as turf from '@turf/turf'
import { offsetPolylineMiter, pointPolylineDistance, resamplePolyline } from './corridor.js'
import { computeFootprint, computeGSD } from './geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from './units.js'
import { SHOT_TIME_S } from '../mission/gimbal.js'

/** Fracção do afastamento abaixo da qual a linha afastada é recusada (M2-E3). */
export const STANDOFF_MIN_FRAC = 0.95

/**
 * Espaçamento mínimo entre as fotografias que rodam o rumo num canto: o
 * dobro dos 0,5 m que a DJI exige entre waypoints seguidos.
 */
export const CORNER_MIN_SPACING_M = 1

/**
 * Passo mínimo da amostragem, ao longo da linha afastada e entre passagens:
 * uma sobreposição de 95 % a 5 m pedia fotografias a 0,35 m, e uma face
 * baixa com imagens altas duas passagens quase à mesma altura, abaixo dos
 * 0,5 m que a DJI exige entre waypoints seguidos.
 */
export const MIN_SAMPLE_STEP_M = 0.6

/** Distância mínima, em linha recta, entre fotografias seguidas (10 % acima dos 0,5 m da DJI). */
export const MIN_PHOTO_GAP_M = 0.55

/**
 * As fotografias de uma passagem com `minGap` ou mais entre seguidas, em
 * linha recta. Do lado de dentro de um canto agudo, duas posições a um passo
 * ao longo da linha afastada ficam muito mais perto em linha recta, de um
 * lado e do outro do vértice da esquadria (0,06 m num V de 10° a 5 m de
 * afastamento). Cada grupo de posições seguidas mais perto do que `minGap`
 * passa a uma só: a ponta da passagem, se o grupo a tiver, senão a que tem o
 * rumo mais perto da média dos rumos à volta do grupo — num canto côncavo, a
 * que fica junto ao vértice a olhar para o fundo do canto. Só se tiram
 * posições, todas na linha afastada: nenhuma se aproxima da face.
 * @param {number[][]} pts posições [lon, lat], pela ordem do voo
 * @param {number[]} headings rumo (graus) em cada posição
 * @param {number} minGap distância mínima (m)
 * @returns {{pts: number[][], headings: number[]}}
 */
export function spacePhotos(pts, headings, minGap) {
  const idx = pts.map((_, i) => i)
  const near = (a, b) => turf.distance(a, b, { units: 'meters' }) < minGap
  const rad = (j) => (headings[idx[j]] * Math.PI) / 180
  let k = 0
  while (k < idx.length - 1) {
    if (!near(pts[idx[k]], pts[idx[k + 1]])) {
      k++
      continue
    }
    // o grupo idx[k..e]: cada posição perto da seguinte
    let e = k + 1
    while (e + 1 < idx.length && near(pts[idx[e]], pts[idx[e + 1]])) e++
    let keep = k
    if (e === idx.length - 1 && k > 0) keep = e
    else if (k > 0) {
      // média circular dos rumos das vizinhas do grupo
      const a = rad(k - 1)
      const b = rad(e + 1)
      const mean = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b))
      const off = (j) => Math.abs(Math.atan2(Math.sin(rad(j) - mean), Math.cos(rad(j) - mean)))
      for (let j = k + 1; j <= e; j++) if (off(j) < off(keep)) keep = j
    }
    idx.splice(k, e - k + 1, idx[keep])
    // a que ficou pode estar perto da anterior: volta uma posição atrás
    k = Math.max(0, k - 1)
  }
  return { pts: idx.map((i) => pts[i]), headings: idx.map((i) => headings[i]) }
}

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

/**
 * Prolonga as duas pontas de uma polilinha lon/lat de `d` metros, na
 * direcção do troço da ponta (o primeiro e o último vértice afastam-se).
 */
function extendPolylineEnds(pts, d) {
  const out = pts.map((p) => [p[0], p[1]])
  const n = out.length
  if (n < 2 || !(d > 0)) return out
  const km = d / 1000
  out[0] = turf.destination(out[0], km, turf.bearing(out[1], out[0]), {
    units: 'kilometers',
  }).geometry.coordinates
  out[n - 1] = turf.destination(out[n - 1], km, turf.bearing(out[n - 2], out[n - 1]), {
    units: 'kilometers',
  }).geometry.coordinates
  return out
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
  // prolongamento nas pontas: meia largura de imagem para lá de cada ponta
  // da face, como no corredor (M2-E12); desligável junto a outras paredes
  extendEnds: true,
  hoverS: 0, // espera em cada foto, antes de disparar (acção hover do WPML)
  // 'single': uma foto por ponto, com `gimbalPitch`; 'multi': várias
  // inclinações com paragem, uma foto por inclinação (beirados, varandas)
  capture: 'single',
  // inclinações do 'multi' (null = por omissão: −45°, 0° e o limite de cima
  // do gimbal menos 5°; src/mission/gimbal.js)
  multiPitches: null,
  // descolagem: null = no pé da face (como sempre); o id de uma base do
  // projecto = alturas convertidas pela diferença de cotas (takeoffRef.js)
  takeoffBaseId: null,
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
    extendEnds: typeof stored.extendEnds === 'boolean' ? stored.extendEnds : d.extendEnds,
    hoverS: num(stored.hoverS, 0, 60, d.hoverS),
    capture: stored.capture === 'multi' ? 'multi' : 'single',
    multiPitches:
      Array.isArray(stored.multiPitches) && stored.multiPitches.some(Number.isFinite)
        ? stored.multiPitches
            .filter(Number.isFinite)
            .slice(0, 5)
            .map((v) => Math.max(-120, Math.min(60, v)))
        : null,
    takeoffBaseId:
      typeof stored.takeoffBaseId === 'string' && stored.takeoffBaseId
        ? stored.takeoffBaseId
        : null,
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
    // meia largura de imagem para lá de cada ponta da face (M2-E12 no corredor)
    extendEnds = false,
    // espera em cada foto, em segundos (acção hover antes do disparo)
    hoverS = 0,
    // várias inclinações (com paragem): uma foto por inclinação em cada
    // ponto (shotPitches); null = uma foto com `gimbalPitch`
    shots = null,
  } = options ?? {}
  const shotList = Array.isArray(shots) && shots.length ? shots : null

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
    // as alturas saem arredondadas a 0,1 m: o passo entre passagens fica
    // 0,1 m acima do mínimo, para o arredondamento não o levar abaixo
    const minVStep = MIN_SAMPLE_STEP_M + 0.1
    if (last - first < minVStep) {
      // o piso já está acima do centro da passagem de topo (ou quase): uma
      // só passagem; duas mais perto faziam dois waypoints seguidos quase no
      // mesmo ponto, na viragem em altura
      heights = [first]
    } else {
      const n = Math.max(
        2,
        Math.min(Math.ceil((last - first) / vStep) + 1, Math.floor((last - first) / minVStep) + 1),
      )
      const step = (last - first) / (n - 1)
      heights = Array.from({ length: n }, (_, k) => first + k * step)
    }
  }
  // faixa no pé da face que nenhuma imagem apanha por causa do piso
  const uncoveredBottomM = Math.max(0, heights[0] + bandBottom)

  // linha afastada: standoff para o lado escolhido, em métrica local; null
  // quando um canto ou um troço curto não deixam manter o afastamento
  const offsetRaw = offsetPolyline(baseline, side === 'left' ? standoffM : -standoffM)
  if (!offsetRaw) return { error: 'standoff-corner' }
  // Prolongamento nas pontas: a primeira e a última foto ficavam centradas
  // na ponta da face, e a ponta era vista por uma só imagem; meia largura de
  // imagem para lá de cada ponta, na direcção do troço, dá-lhe a sobreposição
  // do resto da face (o defeito que o M2-E12 corrigiu no corredor)
  const extM = extendEnds ? imgW / 2 : 0
  const offsetPts = extM > 0 ? extendPolylineEnds(offsetRaw, extM) : offsetRaw
  const offset = turf.lineString(offsetPts)
  const offLenM = turf.length(offset, { units: 'meters' })
  if (!(offLenM > 0)) return null
  // do lado de dentro de um canto agudo com troços curtos, as duas linhas
  // afastadas cruzam-se e a esquadria deixa um coto que não cobre a face
  // (num V de 135° com troços de 60 m e 25 m de afastamento, 0,2 m): duas
  // fotografias quase no mesmo ponto, que a DJI recusa
  if (offLenM < CORNER_MIN_SPACING_M) return { error: 'standoff-corner' }

  // amostragem ao longo da linha afastada, extremos incluídos, passo ≤ hStep
  // e nunca abaixo de MIN_SAMPLE_STEP_M (offLenM ≥ 1 m: duas amostras, pelo menos)
  const nPts = Math.max(
    2,
    Math.min(Math.ceil(offLenM / hStep) + 1, Math.floor(offLenM / MIN_SAMPLE_STEP_M) + 1),
  )
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

  // Cantos (M2-E11): entre duas amostras cujo rumo salta mais do que a
  // abertura horizontal útil, HFOV · (1 − sobreposição) — um canto da face,
  // ou um arco apertado —, inserem-se fotografias ENTRE as duas amostras, ao
  // longo da linha afastada, com o rumo a rodar em passos até esse limite,
  // para a face junto ao vértice não ficar vista só de esguelha. Do lado de
  // fora de um canto a linha afastada já é um arco à volta da aresta, ao
  // afastamento exacto (offsetPolylineMiter), e as fotografias ficam nesse
  // arco; do lado de dentro a rotação reparte-se pelo troço antes e depois
  // do vértice da esquadria, que corta o canto a afastar-se das duas faces.
  // Nunca no mesmo ponto: iam todas para o ponto da amostra seguinte, e
  // waypoints seguidos a menos de 0,5 m (o mínimo da DJI) faziam o preflight
  // bloquear a exportação de qualquer face com cantos. Quando o troço entre
  // as duas amostras não deixa CORNER_MIN_SPACING_M entre fotografias, faz-se
  // o número de passos que cabe (cada passo roda um pouco mais).
  const hfovDeg = (2 * Math.atan(sensor.sensorWidth / (2 * sensor.focalLength)) * 180) / Math.PI
  const maxStepDeg = Math.max(5, hfovDeg * (1 - horizontalOverlapPct / 100))
  const maxStepsBySpacing = Math.max(1, Math.floor(stepM / CORNER_MIN_SPACING_M))
  const samplePts = []
  const sampleHeadings = []
  for (let i = 0; i < nPts; i++) {
    samplePts.push(pts[i])
    sampleHeadings.push(headings[i])
    if (i + 1 >= nPts) break
    let delta = headings[i + 1] - headings[i]
    while (delta > 180) delta -= 360
    while (delta < -180) delta += 360
    const steps = Math.min(Math.ceil(Math.abs(delta) / maxStepDeg), maxStepsBySpacing)
    for (let k = 1; k < steps; k++) {
      const s = (i + k / steps) * stepM
      samplePts.push(turf.along(offset, s, { units: 'meters' }).geometry.coordinates)
      sampleHeadings.push(((Math.round(headings[i] + (delta * k) / steps) % 360) + 360) % 360)
    }
  }
  // Ao longo da linha as fotografias ficam a um passo umas das outras, mas
  // do lado de dentro de um canto agudo a distância em linha recta através
  // do vértice da esquadria é muito menor (num V de 150° a 5 m de
  // afastamento, 0,2 m): a DJI recusava a rota e o preflight bloqueava a
  // exportação. Nunca a menos de 0,9 m (ou de 90 % do passo, se este for
  // mais curto), e nunca abaixo de MIN_PHOTO_GAP_M.
  const minGap = Math.max(MIN_PHOTO_GAP_M, 0.9 * Math.min(CORNER_MIN_SPACING_M, stepM))
  const spaced = spacePhotos(samplePts, sampleHeadings, minGap)
  if (spaced.pts.length < 2) return { error: 'standoff-corner' }
  const nPhotos = spaced.pts.length

  // serpentina vertical: cada passagem alterna o sentido; a subida entre
  // passagens acontece no mesmo ponto horizontal (viragem em altura)
  const waypoints = []
  const perWaypoint = []
  heights.forEach((h, k) => {
    const order = Array.from({ length: nPhotos }, (_, i) => i)
    if (k % 2 === 1) order.reverse()
    for (const i of order) {
      waypoints.push([spaced.pts[i][0], spaced.pts[i][1], Math.round(h * 10) / 10])
      perWaypoint.push({
        heading: spaced.headings[i],
        gimbalPitch: shotList ? shotList[0] : gimbalPitch,
        ...(shotList ? { shots: shotList } : {}),
        ...(hoverS > 0 ? { hoverS } : {}),
        actions: ['takePhoto'],
      })
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
      pointsPerPass: nPhotos,
      // amostras ao longo da linha (sem as fotografias extra dos cantos)
      samplesPerPass: nPts,
      waypointCount: waypoints.length,
      photoCount: waypoints.length * (shotList ? shotList.length : 1),
      shotsPerPoint: shotList ? shotList.length : null,
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
      // 2 s por foto (paragem e disparo) mais a espera pedida em cada uma
      // paragem e disparo (2 s), a espera e, com várias inclinações, cada
      // uma (rodar o gimbal e disparar)
      flightTimeS:
        speed > 0
          ? pathLengthM / speed +
            waypoints.length * (2 + hoverS + (shotList ? SHOT_TIME_S * shotList.length : 0))
          : null,
      // prolongamento aplicado em cada ponta (m)
      endExtensionM: extM,
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
  // A folga vertical compara-se com o que o plano pode cumprir: a passagem
  // mais baixa fica em max(imgH/2, piso), em regra abaixo dos 15 m da folga
  // horizontal, e em solo plano saía sempre a vermelho (M2-E4). Marca-se só
  // quando o solo debaixo do drone sobe acima do pé da face (meio metro).
  const lowestPass = plan.stats?.heights?.[0]
  const verticalLimit = Number.isFinite(lowestPass)
    ? Math.min(minClearanceM, Math.max(0, lowestPass - 0.5))
    : minClearanceM

  plan.waypoints.forEach((w, i) => {
    const droneAbs = foot + (w[2] ?? 0)
    const pass = Math.floor(i / pointsPerPass) + 1

    const zHere = elevationAt(w[0], w[1])
    if (Number.isFinite(zHere)) {
      sampled += 1
      const vertical = droneAbs - zHere
      if (vertical < minVertical) minVertical = vertical
      if (vertical < verticalLimit) flagged.add(pass)
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
