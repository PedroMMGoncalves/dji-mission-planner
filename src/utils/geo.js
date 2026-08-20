import * as turf from '@turf/turf'
import { STRIP_OVERLAP_EPS_M, decomposeCells, orderCells } from './gridRoute.js'

/**
 * Utilitários geoespaciais do planeador de missões.
 *
 * Convenções:
 *  - "ring" = anel aberto de um polígono: [[lon, lat], ...] sem repetir o 1.º vértice.
 *  - Ângulos de linhas de voo e orientações são azimutes: graus a partir do
 *    Norte, no sentido horário (0° = linhas Norte-Sul, 90° = linhas Este-Oeste).
 *  - Todas as distâncias em metros; coordenadas em WGS84 (EPSG:4326).
 */

const M_PER_DEG_LAT = 110574 // metros por grau de latitude (aprox. WGS84)
const MAX_LINES = 2500 // trava de segurança contra espaçamentos minúsculos
const MIN_SEGMENT_M = 1 // segmentos mais curtos que isto são descartados
const TURN_TIME_S = 3 // custo médio de cada inversão de sentido

function metersPerDegLon(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180)
}

/** Fecha um anel aberto e devolve um Feature<Polygon> do Turf. */
export function ringToPolygon(ring) {
  return turf.polygon([[...ring, ring[0]]])
}

/**
 * Normalises the selected payload into a single "sensor" object:
 * { type: 'camera'|'lidar', sensorWidth, sensorHeight, focalLength, imageWidth, fov }
 * Catalog payloads carry their own optics/beam geometry; the CUSTOM payload
 * (type 'custom') reads them from the user-edited customSensor instead. A
 * lidar payload flies with its working FOV (effectiveFov) when one is set.
 */
export function resolveSensor(payload, customSensor) {
  if (payload.type === 'camera') {
    return {
      type: 'camera',
      sensorWidth: payload.sensorWidth,
      sensorHeight: payload.sensorHeight,
      focalLength: payload.focalLength,
      imageWidth: payload.imageWidth,
    }
  }
  if (payload.type === 'lidar') {
    return { type: 'lidar', fov: payload.effectiveFov ?? payload.fov }
  }
  if (customSensor.mode === 'lidar') {
    return { type: 'lidar', fov: customSensor.fov }
  }
  return {
    type: 'camera',
    sensorWidth: customSensor.sensorWidth,
    sensorHeight: customSensor.sensorHeight,
    focalLength: customSensor.focalLength,
    imageWidth: customSensor.imageWidth,
  }
}

/**
 * Pegada no chão (footprint) a uma dada altitude AGL.
 *
 * Câmara (modelo pin-hole):
 *   largura no chão = altitude × (dimensão do sensor / distância focal)
 *   - across = transversal à direção de voo (usa a largura do sensor)
 *   - along  = na direção de voo (usa a altura do sensor)
 *
 * LiDAR (por FOV): faixa = 2 × altitude × tan(FOV/2); não existe "along".
 */
export function computeFootprint(sensor, altitude) {
  if (sensor.type === 'lidar') {
    const fovRad = (sensor.fov * Math.PI) / 180
    return { across: 2 * altitude * Math.tan(fovRad / 2), along: null }
  }
  return {
    across: (altitude * sensor.sensorWidth) / sensor.focalLength,
    along: (altitude * sensor.sensorHeight) / sensor.focalLength,
  }
}

/**
 * GSD em cm/píxel (apenas câmaras). Com gimbal oblíquo o alcance ao centro
 * do quadro é o inclinado — altitude / sin(|pitch|) — pelo que a −60° o GSD
 * real é ~15% pior do que o nadir (R2.4). Abaixo de 20° de |pitch| o
 * conceito de GSD deixa de ser útil (quase-horizonte): devolve null e a
 * interface mostra n/a. O espaçamento e o intervalo de disparo continuam
 * nadir-based — decisão deliberada, documentada no cálculo do espaçamento.
 */
export function computeGSD(sensor, altitude, gimbalPitchDeg = -90) {
  if (sensor.type !== 'camera' || !sensor.imageWidth) return null
  const absPitch = Math.abs(gimbalPitchDeg)
  if (absPitch < 20) return null
  const slantRange = altitude / Math.sin((Math.min(90, absPitch) * Math.PI) / 180)
  return (sensor.sensorWidth * slantRange * 100) / (sensor.focalLength * sensor.imageWidth)
}

/** Distância entre faixas a partir da pegada transversal e da sobreposição lateral. */
export function lineSpacing(footprintAcross, sideOverlapPct) {
  return footprintAcross * (1 - sideOverlapPct / 100)
}

/**
 * LiDAR ground point density (T2.1), pts/m2:
 *   density = PRR / (speed x swath)
 * Use the single-return PRR as a conservative figure — multi-echo returns
 * raise it. In the side-overlap band two adjacent passes cover the same
 * ground, doubling the density. Returns { single, overlap } or null when
 * any input is missing/non-positive.
 */
export function lidarPointDensity({ prr, speed, swathM }) {
  if (!(prr > 0) || !(speed > 0) || !(swathM > 0)) return null
  const single = prr / (speed * swathM)
  return { single, overlap: 2 * single }
}

/** Distância entre disparos a partir da pegada longitudinal e da sobreposição frontal. */
export function photoInterval(footprintAlong, frontOverlapPct) {
  if (footprintAlong == null) return null
  return footprintAlong * (1 - frontOverlapPct / 100)
}

/**
 * Validação topológica com turf.kinks: deteta auto-interseções.
 * Devolve { valid, kinks: [[lon,lat], ...] }.
 */
export function validateRing(ring) {
  if (!ring || ring.length < 3) return { valid: false, kinks: [] }
  try {
    const kinks = turf.kinks(ringToPolygon(ring))
    return {
      valid: kinks.features.length === 0,
      kinks: kinks.features.map((f) => f.geometry.coordinates),
    }
  } catch {
    return { valid: false, kinks: [] }
  }
}

/**
 * Modo Ponto Central (Âncora): gera um retângulo perfeito centrado em
 * `center`, com `lengthM` ao longo do azimute `orientationDeg` e `widthM`
 * perpendicular. Construído em coordenadas locais (metros) e rodado com
 * turf.transformRotate em torno do centro.
 */
export function rectangleFromAnchor(center, lengthM, widthM, orientationDeg) {
  const [lon, lat] = center
  const mLon = metersPerDegLon(lat)
  const dx = lengthM / 2 / mLon
  const dy = widthM / 2 / M_PER_DEG_LAT
  // Retângulo não rodado: comprimento ao longo de Este-Oeste (azimute 90°)
  const corners = [
    [lon - dx, lat - dy],
    [lon + dx, lat - dy],
    [lon + dx, lat + dy],
    [lon - dx, lat + dy],
  ]
  const poly = turf.polygon([[...corners, corners[0]]])
  const rotated = turf.transformRotate(poly, orientationDeg - 90, { pivot: center })
  return rotated.geometry.coordinates[0].slice(0, 4)
}

/**
 * Grelha de blocos: replica o retângulo/quadrado da âncora em `cols` colunas
 * (ao longo do azimute de orientação) × `rows` linhas (perpendicular),
 * centrada no ponto âncora. As células vêm em ordem serpenteante (linha a
 * linha, invertendo o sentido das colunas) para minimizar o reposicionamento
 * entre blocos consecutivos — cada célula é um bloco de voo independente.
 *
 * Devolve { outline, cells }: anel exterior + anéis das células, por ordem de voo.
 */
export function gridFromAnchor(center, lengthM, widthM, orientationDeg, cols, rows) {
  const [lon, lat] = center
  const mLon = metersPerDegLon(lat)
  const totalL = lengthM * cols
  const totalW = widthM * rows

  const toRing = (x0, y0, x1, y1) => [
    [lon + x0 / mLon, lat + y0 / M_PER_DEG_LAT],
    [lon + x1 / mLon, lat + y0 / M_PER_DEG_LAT],
    [lon + x1 / mLon, lat + y1 / M_PER_DEG_LAT],
    [lon + x0 / mLon, lat + y1 / M_PER_DEG_LAT],
  ]
  const rotateRing = (ring) => {
    const poly = turf.polygon([[...ring, ring[0]]])
    const rotated = turf.transformRotate(poly, orientationDeg - 90, { pivot: center })
    return rotated.geometry.coordinates[0].slice(0, 4)
  }

  const cells = []
  for (let r = 0; r < rows; r++) {
    const colIdx = Array.from({ length: cols }, (_, c) => c)
    if (r % 2 === 1) colIdx.reverse()
    for (const c of colIdx) {
      const x0 = -totalL / 2 + c * lengthM
      const y0 = -totalW / 2 + r * widthM
      cells.push(rotateRing(toRing(x0, y0, x0 + lengthM, y0 + widthM)))
    }
  }

  return {
    outline: rotateRing(toRing(-totalL / 2, -totalW / 2, totalL / 2, totalW / 2)),
    cells,
  }
}

const MAX_TILES = 400 // trava contra mosaicos com células minúsculas

/**
 * Lado do quadrado que uma bateria consegue voar.
 *
 * Modelo de tempo para um quadrado de lado L com espaçamento s e velocidade v:
 *   nº de faixas   n ≈ L/s + 1
 *   distância      ≈ n·L (faixas) + (n−1)·s (ligações) ≈ L²/s + L + …
 *   tempo          ≈ (L²/s + 2L)/v + n·TURN_TIME_S
 * Igualando ao tempo útil T = bateria × (1 − reserva) − trânsito e resolvendo
 * o polinómio quadrático em L:  (1/(s·v))·L² + (1/v + 2/v + T_turn/s)·L … → L.
 * O resultado é limitado por `maxSideM` (ex.: 500 m para conforto VLOS) e
 * arredondado para baixo à dezena de metros.
 */
export function squareSideForBattery({
  batteryMin,
  reservePct,
  speed,
  spacingM,
  transitS = 0,
  maxSideM = 500,
  passes = 1, // 2 = dupla grelha (crosshatch): o bloco é voado nas duas direções
}) {
  const v = speed > 0 ? speed : 10
  const s = Math.max(1, spacingM)
  const T = Math.max(
    60,
    (batteryMin * 60 * (1 - reservePct / 100) - transitS) / Math.max(1, passes),
  )
  const a = 1 / (s * v)
  const b = 2 / v + TURN_TIME_S / s
  const c = TURN_TIME_S - T
  const L = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  const capped = Math.min(L, Math.max(100, maxSideM))
  return Math.max(50, Math.floor(capped / 10) * 10)
}

/**
 * MOSAICO AUTOMÁTICO: cobre um polígono desenhado com quadrados de lado
 * `sizeM`, alinhados com o azimute `orientationDeg`. As células podem exceder
 * os limites do polígono (mantém-se qualquer célula que o interseta) — o
 * utilizador desativa depois as que não interessam, clicando no mapa.
 *
 * Algoritmo: roda o polígono por −orientação em torno do centróide (células
 * ficam alinhadas aos eixos no referencial rodado), gera a malha centrada na
 * bounding box, filtra por interseção com o polígono e roda as células de
 * volta. A numeração segue ordem serpenteante linha a linha.
 *
 * Devolve [anéis] das células candidatas, ou { error: 'too-many-cells' }.
 */
export function tilePolygonWithSquares(ring, sizeM, orientationDeg) {
  if (!ring || ring.length < 3 || !(sizeM >= 10)) return null
  const poly = ringToPolygon(ring)
  const pivot = turf.centroid(poly).geometry.coordinates
  const rotated = turf.transformRotate(poly, -orientationDeg, { pivot })

  const [minX, minY, maxX, maxY] = turf.bbox(rotated)
  const midLat = (minY + maxY) / 2
  const dLon = sizeM / metersPerDegLon(midLat)
  const dLat = sizeM / M_PER_DEG_LAT

  const cols = Math.max(1, Math.ceil((maxX - minX) / dLon))
  const rows = Math.max(1, Math.ceil((maxY - minY) / dLat))
  if (cols * rows > MAX_TILES) return { error: 'too-many-cells', count: cols * rows }

  // malha centrada na bbox, para margens simétricas
  const x0 = (minX + maxX) / 2 - (cols * dLon) / 2
  const y0 = (minY + maxY) / 2 - (rows * dLat) / 2

  const cells = []
  for (let r = 0; r < rows; r++) {
    const colIdx = Array.from({ length: cols }, (_, c) => c)
    if (r % 2 === 1) colIdx.reverse()
    for (const c of colIdx) {
      const cx0 = x0 + c * dLon
      const cy0 = y0 + r * dLat
      const cellRing = [
        [cx0, cy0],
        [cx0 + dLon, cy0],
        [cx0 + dLon, cy0 + dLat],
        [cx0, cy0 + dLat],
      ]
      const cellPoly = turf.polygon([[...cellRing, cellRing[0]]])
      if (!turf.booleanIntersects(cellPoly, rotated)) continue
      const back = turf.transformRotate(cellPoly, orientationDeg, { pivot })
      cells.push(back.geometry.coordinates[0].slice(0, 4))
    }
  }
  return cells
}

/**
 * Azimute (0–180°) da aresta mais longa do polígono — usado como direção de
 * referência para os atalhos "paralelas / perpendiculares / oblíquas" quando
 * a área foi desenhada à mão.
 */
export function longestEdgeBearing(ring) {
  if (!ring || ring.length < 3) return null
  let best = null
  let bestLen = -1
  const closed = [...ring, ring[0]]
  for (let i = 0; i < closed.length - 1; i++) {
    const len = turf.distance(closed[i], closed[i + 1], { units: 'meters' })
    if (len > bestLen) {
      bestLen = len
      best = turf.bearing(closed[i], closed[i + 1])
    }
  }
  return ((best % 180) + 180) % 180
}

// Ported from dronnix-io/FlyPath (GPL-3.0), grid_planner.py
// find_optimal_direction/_best_angle/_flight_cost, adapted: QGIS geometry
// replaced by a local planar frame in metres + the same scanline pairing
// primitive used by generateFlightLines (turf.lineIntersect + midpoint-in-
// polygon).
/**
 * Direção de voo (0–179°) que minimiza o tempo estimado de missão para a
 * forma real do polígono. O comprimento total das faixas é ~área/espaçamento
 * seja qual for a direção, por isso o tempo é dominado pelo número de
 * passagens e viragens: escolhe-se a direção com MENOS troços de faixa
 * dentro do polígono (uma concavidade que parte uma passagem em pedaços
 * conta), com desempate pelo menor vão perpendicular. Pesquisa grosso-fino
 * (5° em 0–179, depois ±4° a 1°) com um passo de varrimento único, limitado
 * a ~200 scanlines, para os totais serem comparáveis entre ângulos.
 */
export function findOptimalDirection(ring, spacingM) {
  if (!ring || ring.length < 3) return null
  const spacing = spacingM > 0 ? spacingM : 1

  // referencial planar local em metros, centrado no anel
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length
  const lon0 = ring[0][0]
  const mLon = metersPerDegLon(lat0)
  const pts = ring.map(([lon, lat]) => [(lon - lon0) * mLon, (lat - lat0) * M_PER_DEG_LAT])
  const poly = turf.polygon([[...pts, pts[0]]])

  const xs = pts.map((p) => p[0])
  const ys2 = pts.map((p) => p[1])
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys2) - Math.min(...ys2))
  if (!(diag > 0)) return null
  const step = diag / spacing <= 200 ? spacing : diag / 200

  const flightCost = (deg) => {
    // azimute CW a partir do Norte, num referencial x=Este / y=Norte:
    // as passagens correm ao longo de v=(sin, cos) e o varrimento das
    // scanlines avança ao longo de u=(cos, -sin), como no gerador
    const rad = (deg * Math.PI) / 180
    const ux = Math.cos(rad)
    const uy = -Math.sin(rad) // eixo do espaçamento (perpendicular às faixas)
    const vx = Math.sin(rad)
    const vy = Math.cos(rad) // eixo das passagens
    const tv = pts.map(([x, y]) => x * ux + y * uy)
    const sv = pts.map(([x, y]) => x * vx + y * vy)
    const tMin = Math.min(...tv)
    const tMax = Math.max(...tv)
    const span = tMax - tMin
    const a0 = Math.min(...sv) - step
    const a1 = Math.max(...sv) + step

    let segCount = 0
    for (let t = tMin + step / 2; t <= tMax; t += step) {
      const line = turf.lineString([
        [a0 * vx + t * ux, a0 * vy + t * uy],
        [a1 * vx + t * ux, a1 * vy + t * uy],
      ])
      const crossings = turf.lineIntersect(line, poly).features
        .map((f) => f.geometry.coordinates[0] * vx + f.geometry.coordinates[1] * vy)
        .sort((a, b) => a - b)
        .filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9)
      let k = 0
      while (k < crossings.length - 1) {
        const sMid = (crossings[k] + crossings[k + 1]) / 2
        const mid = turf.point([sMid * vx + t * ux, sMid * vy + t * uy])
        if (turf.booleanPointInPolygon(mid, poly)) {
          segCount += 1
          k += 2
        } else {
          k += 1
        }
      }
    }
    return [segCount, span]
  }

  const bestAngle = (angles) => {
    let best = 0
    let bestCost = null
    for (const deg of angles) {
      const c = flightCost(deg)
      if (bestCost == null || c[0] < bestCost[0] || (c[0] === bestCost[0] && c[1] < bestCost[1])) {
        bestCost = c
        best = deg
      }
    }
    return best
  }

  const coarse = bestAngle(Array.from({ length: 36 }, (_, i) => i * 5))
  const fine = bestAngle(Array.from({ length: 9 }, (_, i) => (((coarse - 4 + i) % 180) + 180) % 180))
  return fine % 180
}

/**
 * Distância (m) de um ponto (ex.: base do operador) ao polígono:
 * 0 se estiver dentro; caso contrário, distância mínima ao contorno.
 */
export function distanceToArea(point, ring) {
  if (!point || !ring || ring.length < 3) return null
  const poly = ringToPolygon(ring)
  if (turf.booleanPointInPolygon(turf.point(point), poly)) return 0
  return turf.pointToLineDistance(turf.point(point), turf.lineString([...ring, ring[0]]), {
    units: 'meters',
  })
}

/**
 * Expansão (buffer) exterior: a distância do buffer é uma percentagem da
 * dimensão característica da área, L = √área. Com pct = 10, cada lado avança
 * 5% de L para fora, ou seja, a largura total da zona cresce ~10%.
 */
export function bufferDistanceMeters(polygon, pct) {
  return (pct / 100) * (Math.sqrt(turf.area(polygon)) / 2)
}

/**
 * Alinhamento global das linhas entre células (grelha/mosaico): calcula um
 * referencial partilhado — pivô, passo em latitude e latitude de referência —
 * a partir do contorno exterior. Todas as células planeadas com este
 * alinhamento posicionam as scanlines em múltiplos exatos do espaçamento
 * relativamente à mesma origem, pelo que as faixas de células adjacentes são
 * colineares e têm continuidade visual e fotogramétrica.
 */
export function computeAlignment(outlineRing, spacingM, angleDeg) {
  if (!outlineRing || outlineRing.length < 3 || !(spacingM > 0.05)) return null
  const poly = ringToPolygon(outlineRing)
  const pivot = turf.centroid(poly).geometry.coordinates
  const delta = 90 - angleDeg
  const rotated = turf.transformRotate(poly, delta, { pivot })
  const [minX, minY, , maxY] = turf.bbox(rotated)
  const heightM = turf.distance([minX, minY], [minX, maxY], { units: 'meters' })
  if (!(heightM > 0)) return null
  return {
    pivot,
    latStep: ((maxY - minY) * spacingM) / heightM,
    yRef: pivot[1], // o pivô é invariante na rotação
  }
}

/**
 * ALGORITMO DE GERAÇÃO DA GRELHA DE VOO
 * -------------------------------------
 * 1. Aplica o buffer exterior (turf.buffer) se pct > 0.
 * 2. Roda a área por (90° − ângulo) em torno do centróide (turf.transformRotate),
 *    de modo a que as futuras linhas de voo fiquem horizontais no referencial rodado.
 * 3. Gera "scanlines" horizontais espaçadas de `spacingM`, centradas verticalmente
 *    na bounding box da área rodada.
 * 4. Interseta cada scanline com o polígono (turf.lineIntersect), ordena os pontos
 *    de cruzamento por longitude e empareha-os; o ponto médio de cada par é testado
 *    com turf.booleanPointInPolygon para reter apenas os troços interiores
 *    (funciona também com polígonos côncavos → várias faixas por linha).
 * 5. Ordena as passagens com decomposição celular boustrophedon (gridRoute.js,
 *    portado do FlyPath): strips contíguas viram células visitadas em ordem de
 *    grafo, cada célula em ziguezague — num polígono convexo é a serpentina
 *    clássica; num côncavo as ligações nunca atravessam os vãos da área.
 * 6. Roda tudo de volta pelo ângulo simétrico, em torno do mesmo pivô.
 *
 * Devolve { area, lines, waypoints, stats } ou { error }.
 */
export function generateFlightLines(ring, options) {
  const {
    spacingM, angleDeg, bufferPct, photoIntervalM, speed, align,
    overshootM = 0, tieLine = false,
  } = options
  if (!ring || ring.length < 3 || !(spacingM > 0.05)) return null

  const basePoly = ringToPolygon(ring)

  // 1) Buffer exterior
  let area = basePoly
  if (bufferPct > 0) {
    const dist = bufferDistanceMeters(basePoly, bufferPct)
    const buffered = turf.buffer(basePoly, dist, { units: 'meters' })
    if (buffered) area = buffered
  }

  // 2) Rodar a área para o referencial das linhas. Com `align`, o pivô é
  //    partilhado por todas as células para garantir faixas colineares.
  const pivot = align?.pivot ?? turf.centroid(area).geometry.coordinates
  const delta = 90 - angleDeg
  const rotated = turf.transformRotate(area, delta, { pivot })

  const [minX, minY, maxX, maxY] = turf.bbox(rotated)
  const heightM = turf.distance([minX, minY], [minX, maxY], { units: 'meters' })
  if (!(heightM > 0)) return null

  // 3) Posições das scanlines: centradas na bbox (área única) ou em múltiplos
  //    exatos do espaçamento a partir da referência global (células alinhadas)
  let ys
  if (align) {
    const kMin = Math.ceil((minY - align.yRef) / align.latStep - 1e-9)
    const kMax = Math.floor((maxY - align.yRef) / align.latStep + 1e-9)
    if (kMax < kMin) {
      // célula mais estreita que o espaçamento: usa a linha global mais próxima
      const k = Math.round(((minY + maxY) / 2 - align.yRef) / align.latStep)
      ys = [align.yRef + k * align.latStep]
    } else {
      ys = []
      for (let k = kMin; k <= kMax; k++) ys.push(align.yRef + k * align.latStep)
    }
  } else {
    const nLines = Math.max(1, Math.floor(heightM / spacingM) + 1)
    if (nLines > MAX_LINES) return { error: 'too-many-lines', nLines }
    const latStep = ((maxY - minY) * spacingM) / heightM
    const y0 = (minY + maxY) / 2 - ((nLines - 1) / 2) * latStep
    ys = Array.from({ length: nLines }, (_, i) => y0 + i * latStep)
  }
  if (ys.length > MAX_LINES) return { error: 'too-many-lines', nLines: ys.length }

  const padX = (maxX - minX) * 0.1 + 1e-6

  // 4) Interseção e emparelhamento dos cruzamentos. Cada linha vira
  //    [y, [[xLo, xHi], ...]] — as linhas vazias também entram, porque um
  //    vão a toda a largura quebra a conectividade entre strips.
  const rows = []
  for (const y of ys) {
    const scanline = turf.lineString([
      [minX - padX, y],
      [maxX + padX, y],
    ])

    const crossings = turf.lineIntersect(scanline, rotated).features
      .map((f) => f.geometry.coordinates[0])
      .sort((a, b) => a - b)
      .filter((x, idx, arr) => idx === 0 || x - arr[idx - 1] > 1e-10)

    const segments = []
    let k = 0
    while (k < crossings.length - 1) {
      const xa = crossings[k]
      const xb = crossings[k + 1]
      const mid = turf.point([(xa + xb) / 2, y])
      if (turf.booleanPointInPolygon(mid, rotated)) {
        const lenM = turf.distance([xa, y], [xb, y], { units: 'meters' })
        if (lenM >= MIN_SEGMENT_M) segments.push([xa, xb])
        k += 2
      } else {
        k += 1
      }
    }
    rows.push([y, segments])
  }

  if (rows.every(([, segs]) => segs.length === 0)) return null

  // 5) Ordenação côncava-segura (T3.1): decomposição celular boustrophedon
  //    portada do FlyPath. As strips contíguas viram células; a rota visita
  //    as células em ordem de grafo, pelo que as ligações entre passagens
  //    seguem a "espinha" da área e nunca atravessam um vão. Num polígono
  //    convexo o resultado é exatamente a serpentina antiga.
  const midLatRot = (minY + maxY) / 2
  const { cells, adjacency } = decomposeCells(rows, STRIP_OVERLAP_EPS_M / metersPerDegLon(midLatRot))
  const routePts = orderCells(cells, adjacency, metersPerDegLon(midLatRot) / M_PER_DEG_LAT)

  // Overshoot (T2.2): cada passagem é prolongada nos dois extremos ao longo
  // da direção de voo, já com o sentido escolhido pela rota — as viragens
  // ficam fora da área e os dados dentro dela são captados estáveis.
  const serpentine = []
  for (let k = 0; k + 1 < routePts.length; k += 2) {
    let a = routePts[k]
    let b = routePts[k + 1]
    if (overshootM > 0) {
      const dxOver = overshootM / metersPerDegLon(a[1])
      if (a[0] <= b[0]) {
        a = [a[0] - dxOver, a[1]]
        b = [b[0] + dxOver, b[1]]
      } else {
        a = [a[0] + dxOver, a[1]]
        b = [b[0] - dxOver, b[1]]
      }
    }
    serpentine.push([a, b])
  }

  // 5b) Fiada de amarração perpendicular (T2.3): uma passagem extra a meio
  // do bloco, perpendicular às faixas (vertical no referencial rodado) e
  // voada em último lugar — cruza todas as fiadas para o ajuste de strips
  // LiDAR no pós-processamento. Recebe o mesmo overshoot das faixas.
  if (tieLine) {
    const xMid = (minX + maxX) / 2
    const padY = (maxY - minY) * 0.1 + 1e-6
    const vline = turf.lineString([
      [xMid, minY - padY],
      [xMid, maxY + padY],
    ])
    const yCross = turf.lineIntersect(vline, rotated).features
      .map((f) => f.geometry.coordinates[1])
      .sort((a, b) => a - b)
      .filter((v, idx, arr) => idx === 0 || v - arr[idx - 1] > 1e-10)
    const dyOver = overshootM > 0 ? overshootM / M_PER_DEG_LAT : 0
    const tieSegs = []
    let q = 0
    while (q < yCross.length - 1) {
      const ya = yCross[q]
      const yb = yCross[q + 1]
      const midTie = turf.point([xMid, (ya + yb) / 2])
      if (turf.booleanPointInPolygon(midTie, rotated)) {
        const lenM = turf.distance([xMid, ya], [xMid, yb], { units: 'meters' })
        if (lenM >= MIN_SEGMENT_M) tieSegs.push([[xMid, ya - dyOver], [xMid, yb + dyOver]])
        q += 2
      } else {
        q += 1
      }
    }
    if (tieSegs.length > 0) {
      // começa no extremo mais próximo do fim da última faixa voada
      const lastY = serpentine.length > 0 ? serpentine[serpentine.length - 1][1][1] : minY
      if (Math.abs(lastY - maxY) < Math.abs(lastY - minY)) {
        tieSegs.reverse()
        tieSegs.forEach((s) => serpentine.push([s[1], s[0]]))
      } else {
        tieSegs.forEach((s) => serpentine.push(s))
      }
    }
  }

  // 6) Rodar de volta para o referencial geográfico
  const rotatedBack = turf.transformRotate(turf.multiLineString(serpentine), -delta, {
    pivot,
  })
  const lines = rotatedBack.geometry.coordinates

  // Waypoints: extremos de cada faixa, pela ordem de voo
  const waypoints = []
  lines.forEach((seg) => {
    waypoints.push(seg[0], seg[1])
  })

  // Estatísticas. O disparo por distância cobre a rota inteira, overshoot
  // incluído — photoCount é o total real; photoCountArea desconta o
  // overshoot (fotos úteis sobre a área) quando ele está ativo.
  let totalLineLengthM = 0
  let photoCount = 0
  let photoCountArea = 0
  lines.forEach((seg) => {
    const len = turf.distance(seg[0], seg[1], { units: 'meters' })
    totalLineLengthM += len
    if (photoIntervalM > 0) {
      photoCount += Math.floor(len / photoIntervalM) + 1
      const core = Math.max(0, len - 2 * overshootM)
      photoCountArea += Math.floor(core / photoIntervalM) + 1
    }
  })

  let pathLengthM = 0
  for (let i = 1; i < waypoints.length; i++) {
    pathLengthM += turf.distance(waypoints[i - 1], waypoints[i], { units: 'meters' })
  }

  const flightTimeS =
    speed > 0 ? pathLengthM / speed + lines.length * TURN_TIME_S : null

  return {
    area,
    lines,
    waypoints,
    stats: {
      lineCount: lines.length,
      waypointCount: waypoints.length,
      totalLineLengthM,
      pathLengthM,
      photoCount: photoIntervalM > 0 ? photoCount : null,
      photoCountArea: photoIntervalM > 0 && overshootM > 0 ? photoCountArea : null,
      flightTimeS,
      areaHa: turf.area(basePoly) / 10000,
      bufferedAreaHa: turf.area(area) / 10000,
    },
  }
}

/**
 * Dupla grelha (crosshatch) para reconstrução 3D: gera a grelha normal e uma
 * segunda perpendicular (+90°), voadas em sequência. `align2` é o alinhamento
 * global da direção perpendicular (para células). As estatísticas somam as
 * duas passagens, incluindo a ligação entre o fim da primeira e o início da
 * segunda.
 */
export function generateFlightPlan(ring, options) {
  const p1 = generateFlightLines(ring, options)
  if (!options.crosshatch || !p1 || p1.error) return p1

  const p2 = generateFlightLines(ring, {
    ...options,
    angleDeg: (options.angleDeg + 90) % 360,
    align: options.align2 ?? null,
    tieLine: false, // a fiada de amarração só acompanha a primeira grelha
  })
  if (!p2 || p2.error) return p2?.error ? p2 : p1

  const linkM = turf.distance(
    p1.waypoints[p1.waypoints.length - 1],
    p2.waypoints[0],
    { units: 'meters' },
  )
  const v = options.speed > 0 ? options.speed : 10
  const s1 = p1.stats
  const s2 = p2.stats
  return {
    area: p1.area,
    lines: [...p1.lines, ...p2.lines],
    waypoints: [...p1.waypoints, ...p2.waypoints],
    stats: {
      lineCount: s1.lineCount + s2.lineCount,
      waypointCount: s1.waypointCount + s2.waypointCount,
      totalLineLengthM: s1.totalLineLengthM + s2.totalLineLengthM,
      pathLengthM: s1.pathLengthM + s2.pathLengthM + linkM,
      photoCount:
        s1.photoCount != null || s2.photoCount != null
          ? (s1.photoCount ?? 0) + (s2.photoCount ?? 0)
          : null,
      photoCountArea:
        s1.photoCountArea != null || s2.photoCountArea != null
          ? (s1.photoCountArea ?? 0) + (s2.photoCountArea ?? 0)
          : null,
      flightTimeS:
        s1.flightTimeS != null && s2.flightTimeS != null
          ? s1.flightTimeS + s2.flightTimeS + linkM / v
          : null,
      areaHa: s1.areaHa,
      bufferedAreaHa: s1.bufferedAreaHa,
    },
  }
}

/**
 * DIVISÃO EM BLOCOS DE VOO
 * ------------------------
 * Segue o modelo dos planeadores profissionais (UgCS "Large Projects",
 * DroneDeploy multi-flight): a grelha global mantém-se alinhada e é cortada
 * em grupos de faixas contíguas, pela ordem de voo em serpentina. Cada bloco
 * fecha quando o "orçamento" é atingido:
 *
 *  - modo 'area':    orçamento = área máxima por bloco (ha); a área coberta
 *                    por cada faixa ≈ comprimento × espaçamento.
 *  - modo 'battery': orçamento = tempo útil de voo
 *                    = duração da bateria × (1 − reserva/100)
 *                    − trânsito ida+volta à base (se a base estiver marcada).
 *                    A reserva por defeito é 30% (regressar com 30%).
 *
 * Como os blocos partilham faixas adjacentes da MESMA grelha, a sobreposição
 * lateral fotográfica entre blocos mantém-se — não são precisas margens
 * extra para o processamento fotogramétrico.
 *
 * Devolve [{ id, lines, waypoints, timeS, transitS, areaHa, lengthM }, ...]
 */
export function splitIntoBlocks(plan, options) {
  const { mode, maxAreaHa, batteryMin, reservePct, speed, spacingM, basePoint } = options
  if (!plan || !plan.lines || plan.lines.length === 0 || mode === 'none') return null

  const v = speed > 0 ? speed : 10
  const budget =
    mode === 'area'
      ? Math.max(0.5, maxAreaHa) * 10000 // m²
      : Math.max(60, batteryMin * 60 * (1 - reservePct / 100)) // s úteis

  const transitFor = (firstPoint) => {
    if (mode !== 'battery' || !basePoint) return 0
    return (2 * turf.distance(basePoint, firstPoint, { units: 'meters' })) / v
  }

  const blocks = []
  let cur = null

  const openBlock = (firstPoint) => {
    cur = {
      lines: [],
      cost: 0,
      transitS: transitFor(firstPoint),
      areaM2: 0,
      lengthM: 0,
      timeS: 0,
    }
    blocks.push(cur)
  }

  let prevEnd = null
  plan.lines.forEach((seg) => {
    const lenM = turf.distance(seg[0], seg[1], { units: 'meters' })
    const connM = prevEnd ? turf.distance(prevEnd, seg[0], { units: 'meters' }) : 0
    // Cost used by the fits-check below. The connection from the previous
    // line is deliberately excluded: if the line is evicted it opens a new
    // block where that connection is never flown, and if it stays the single
    // extra hop (~spacing/v) is covered by the battery reserve. cur.cost does
    // accumulate flown connections, so the budget overshoot is bounded by one
    // connection per block.
    const lineCost =
      mode === 'area' ? lenM * spacingM : lenM / v + TURN_TIME_S

    if (!cur) openBlock(seg[0])
    const fits =
      mode === 'area'
        ? cur.cost + lineCost <= budget
        : cur.cost + lineCost + cur.transitS <= budget

    if (!fits && cur.lines.length > 0) {
      cur = null
      openBlock(seg[0])
    }
    // (uma faixa isolada que exceda o orçamento entra sozinha no bloco)
    cur.lines.push(seg)
    cur.cost += mode === 'area' ? lenM * spacingM : lenM / v + TURN_TIME_S + (cur.lines.length > 1 ? connM / v : 0)
    cur.areaM2 += lenM * spacingM
    cur.lengthM += lenM
    prevEnd = seg[1]
  })

  return blocks.map((b, i) => {
    const waypoints = []
    b.lines.forEach((seg) => waypoints.push(seg[0], seg[1]))
    let pathM = 0
    for (let k = 1; k < waypoints.length; k++) {
      pathM += turf.distance(waypoints[k - 1], waypoints[k], { units: 'meters' })
    }
    return {
      id: i + 1,
      lines: b.lines,
      waypoints,
      areaHa: b.areaM2 / 10000,
      lengthM: b.lengthM,
      transitS: b.transitS,
      timeS: pathM / v + b.lines.length * TURN_TIME_S + b.transitS,
    }
  })
}
