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

/*
 * CALIBRAÇÃO COM LOGS DE VOO (E3.3 — prevista para setembro de 2026).
 * Os logs reais devem produzir três valores medidos; cada um tem UM sítio
 * onde encaixa, para a calibração ser entrada de dados e não arqueologia:
 *
 * 1. TEMPO DE VIRAGEM medido (s/inversão): mediana de
 *    (tempo entre o fim de uma faixa e o início da seguinte) − (distância
 *    da ligação ÷ velocidade), sobre missões de grelha reais.
 *    → substitui TURN_TIME_S abaixo (afecta tempo estimado, blocos por
 *      bateria e squareSideForBattery).
 *
 * 2. AUTONOMIA REAL por combinação aeronave+payload (min): tempo de motor
 *    ligado até à reserva de regresso, por combinação (M300+P1, M300+
 *    Mapper+, M3E, M4T), com vento típico.
 *    → entra pela interface (campo de bateria, override por combinação —
 *      batteryByCombo, T1.4) e, se o valor por omissão da aeronave estiver
 *      sistematicamente errado, corrige-se `batteryMin` em
 *      src/data/drones.js (AIRCRAFT).
 *
 * 3. VELOCIDADE EFECTIVA em faixa (m/s): distância de faixa voada ÷ tempo
 *    em faixa, comparada com a velocidade programada. Se a razão medida
 *    for estável e < 1 (aceleração/desaceleração nos extremos), aplica-se
 *    como factor multiplicativo à velocidade nos DOIS modelos de tempo:
 *    flightTimeS em generateFlightLines e o `v` de splitIntoBlocks /
 *    squareSideForBattery. Overshoot (T2.2) reduz este efeito — medir com
 *    e sem overshoot se possível.
 *
 * Registar no commit de calibração: datas dos voos, combinação, nº de
 * faixas analisadas e os três valores com dispersão.
 */
const TURN_TIME_S = 3 // custo médio de cada inversão de sentido (a calibrar, ver acima)

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

// Search strategy (cost = in-polygon segment count, tie-broken by
// perpendicular span; coarse 5° sweep then ±4° at 1°) follows the approach
// taken by find_optimal_direction in dronnix-io/FlyPath. The implementation
// here is independent: a local planar frame in metres with the same scanline
// pairing primitive used by generateFlightLines (turf.lineIntersect +
// midpoint-in-polygon), rather than QGIS geometry.
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
 * 5. Ordena as passagens com decomposição celular boustrophedon (Choset &
 *    Pignon 1998; ver gridRoute.js): strips contíguas viram células visitadas
 *    em ordem de grafo, cada célula em ziguezague — num polígono convexo é a
 *    serpentina clássica; num côncavo as ligações nunca atravessam os vãos.
 * 6. Roda tudo de volta pelo ângulo simétrico, em torno do mesmo pivô.
 *
 * Devolve { area, lines, waypoints, stats } ou { error }.
 */
export function generateFlightLines(ring, options) {
  const {
    spacingM, angleDeg, bufferPct, photoIntervalM, speed, align,
    overshootM = 0, tieLine = false, photoMode = 'distance',
  } = options
  if (!ring || ring.length < 3 || !(spacingM > 0.05)) return null
  // B: foto por waypoint só com intervalo válido; caso contrário o modo é o
  // de distância (sem densificação, sem acções por waypoint)
  const perWaypointPhotos = photoMode === 'waypoint' && photoIntervalM > 0

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
    // Recuo mínimo para uma passagem nunca coincidir com a aresta da célula
    // (intersecção degenerada, ponto médio na fronteira): 0.1 m ou 10% da
    // altura da célula, o que for menor.
    const insetDeg = Math.min(0.1 / M_PER_DEG_LAT, (maxY - minY) * 0.1)
    // Intervalo SEMI-ABERTO [minY, maxY): um múltiplo global exactamente na
    // aresta partilhada pertence só à célula de cima — com a tolerância
    // simétrica antiga entrava nas duas células vizinhas e era voado duas
    // vezes, colado à fronteira.
    const kMin = Math.ceil((minY - align.yRef) / align.latStep - 1e-9)
    const kMax = Math.floor((maxY - align.yRef) / align.latStep - 1e-9)
    if (kMax < kMin) {
      // Célula mais estreita que o espaçamento: nenhum múltiplo global cai no
      // seu intervalo, logo a linha global mais próxima do centro fica, por
      // definição, FORA da célula — usá-la tal e qual deixava todas as filas
      // vazias e a célula sem cobertura (A1). Fixa-se essa linha ao bordo da
      // célula mais próximo da régua global, com um recuo mínimo para não
      // coincidir com a aresta (intersecção degenerada). Compromisso: o
      // desvio lateral face às células vizinhas é o menor possível
      // (≤ latStep/2, 10 m na geometria do caso de teste) e a sobreposição
      // lateral das passagens globais adjacentes cobre-o folgadamente; a
      // colinearidade mantém-se sempre que um múltiplo cai dentro da célula.
      const k = Math.round(((minY + maxY) / 2 - align.yRef) / align.latStep)
      const yGlobal = align.yRef + k * align.latStep
      ys = [Math.min(maxY - insetDeg, Math.max(minY + insetDeg, yGlobal))]
    } else {
      ys = []
      for (let k = kMin; k <= kMax; k++) {
        // um múltiplo na aresta inferior é recuado para dentro da célula
        ys.push(Math.max(minY + insetDeg, align.yRef + k * align.latStep))
      }
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
  //    (ver gridRoute.js). As strips contíguas viram células; a rota visita
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
  // B: núcleo (sem overshoot) de cada passagem, no referencial rodado — é o
  // troço densificado com fotos no modo foto-por-waypoint
  const cores = []
  for (let k = 0; k + 1 < routePts.length; k += 2) {
    let a = routePts[k]
    let b = routePts[k + 1]
    cores.push([a, b])
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
        if (lenM >= MIN_SEGMENT_M) {
          tieSegs.push({ ext: [[xMid, ya - dyOver], [xMid, yb + dyOver]], core: [[xMid, ya], [xMid, yb]] })
        }
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
        tieSegs.forEach((s) => {
          serpentine.push([s.ext[1], s.ext[0]])
          cores.push([s.core[1], s.core[0]])
        })
      } else {
        tieSegs.forEach((s) => {
          serpentine.push(s.ext)
          cores.push(s.core)
        })
      }
    }
  }

  // 6) Rodar de volta para o referencial geográfico
  const rotatedBack = turf.transformRotate(turf.multiLineString(serpentine), -delta, {
    pivot,
  })
  const lines = rotatedBack.geometry.coordinates

  // Waypoints: extremos de cada faixa, pela ordem de voo. No modo
  // foto-por-waypoint (B) o núcleo de cada passagem é densificado a passos
  // iguais ≤ intervalo (passPoints) e cada ponto leva uma acção takePhoto;
  // os extremos do overshoot continuam a ser waypoints, mas sem foto. Os
  // pontos do núcleo são rodados de volta com o mesmo pivô/ângulo das linhas,
  // pelo que os extremos coincidem bit a bit com os de `lines`.
  const waypoints = []
  let perLine = null
  let perWaypoint = null
  if (perWaypointPhotos && lines.length > 0) {
    perLine = []
    perWaypoint = []
    const coreRot = cores.map(([a, b]) => passPoints(a, b, photoIntervalM))
    const back = turf.transformRotate(turf.multiPoint(coreRot.flat()), -delta, { pivot })
    const corePts = back.geometry.coordinates
    let ci = 0
    lines.forEach((seg, i) => {
      const pts = corePts.slice(ci, ci + coreRot[i].length)
      ci += coreRot[i].length
      const start = waypoints.length
      if (overshootM > 0) waypoints.push(seg[0])
      pts.forEach((p) => {
        perWaypoint[waypoints.length] = { actions: ['takePhoto'] }
        waypoints.push(p)
      })
      if (overshootM > 0) waypoints.push(seg[1])
      perLine.push(waypoints.length - start)
    })
  } else {
    lines.forEach((seg) => {
      waypoints.push(seg[0], seg[1])
    })
  }

  // Estatísticas. O disparo por distância cobre a rota inteira, overshoot
  // incluído — photoCount é o total real; photoCountArea desconta o
  // overshoot (fotos úteis sobre a área) quando ele está ativo.
  let totalLineLengthM = 0
  let photoCount = 0
  let photoCountArea = 0
  lines.forEach((seg) => {
    const len = turf.distance(seg[0], seg[1], { units: 'meters' })
    totalLineLengthM += len
    if (photoIntervalM > 0 && !perWaypointPhotos) {
      photoCount += Math.floor(len / photoIntervalM) + 1
      const core = Math.max(0, len - 2 * overshootM)
      photoCountArea += Math.floor(core / photoIntervalM) + 1
    }
  })

  // B: no modo foto-por-waypoint, fotos = marcadores takePhoto
  if (perWaypoint) photoCount = perWaypoint.reduce((n) => n + 1, 0)

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
      // no modo foto-por-waypoint todas as fotos caem no núcleo da passagem
      photoCountArea: photoIntervalM > 0 && overshootM > 0 && !perWaypointPhotos ? photoCountArea : null,
      flightTimeS,
      areaHa: turf.area(basePoly) / 10000,
      bufferedAreaHa: turf.area(area) / 10000,
    },
    // B: só presentes no modo foto-por-waypoint — o modo distância devolve
    // exactamente o objecto de sempre
    ...(perLine ? { perLine, perWaypoint } : {}),
  }
}

/**
 * B: pontos de uma passagem a passos iguais ≤ `intervalM`: n = max(1,
 * ceil(len/intervalM)) passos de len/n, extremos incluídos (n+1 pontos).
 * Interpolação linear no referencial rodado (passagens horizontais ou
 * verticais, logo equidistantes em metros). É a regra que garante que duas
 * fotos consecutivas nunca ficam mais afastadas do que o intervalo calculado
 * da sobreposição frontal.
 */
export function passPoints(a, b, intervalM) {
  const lenM = turf.distance(a, b, { units: 'meters' })
  const n = intervalM > 0 ? Math.max(1, Math.ceil(lenM / intervalM - 1e-9)) : 1
  const pts = []
  for (let i = 0; i <= n; i++) {
    const f = i / n
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }
  return pts
}

/**
 * B: concatenação de `perLine`/`perWaypoint` de vários sub-planos voados em
 * sequência (dupla grelha, células): os índices de perWaypoint deslocam-se
 * pela contagem de waypoints dos sub-planos anteriores. Devolve {} quando
 * nenhum sub-plano traz acções por waypoint (modo distância intacto).
 */
export function concatPerWaypoint(parts) {
  if (!parts.some((p) => p?.perLine)) return {}
  const perLine = []
  const perWaypoint = []
  let offset = 0
  for (const p of parts) {
    perLine.push(...(p.perLine ?? p.lines.map(() => 2)))
    const pw = p.perWaypoint ?? []
    pw.forEach((e, i) => {
      perWaypoint[offset + i] = e
    })
    offset += p.waypoints.length
  }
  return { perLine, perWaypoint }
}

export const TRIGGER_MODES = ['distance', 'time', 'waypoint']

/** B: projectos antigos ou valores inválidos carregam em disparo por distância */
export function normalizeTriggerMode(value) {
  return TRIGGER_MODES.includes(value) ? value : 'distance'
}

/**
 * A1: composição dos planos por célula (grelha N×M / mosaico) num plano
 * único. Fail loud: o erro de qualquer célula propaga-se tal e qual; uma
 * célula SEM plano (null) devolve { error: 'cell-uncovered', cells: [...] }
 * com os índices 1-based — nunca uma missão silenciosamente mais curta do
 * que a área desenhada (era o comportamento do filter(Boolean) antigo).
 */
export function composeCellPlans(ring, perCell, { photoIntervalM = 0, overshootM = 0, photoMode = 'distance' } = {}) {
  const failed = perCell.find((p) => p?.error)
  if (failed) return failed
  const missing = perCell.map((p, i) => (p ? null : i + 1)).filter((i) => i != null)
  if (missing.length > 0) return { error: 'cell-uncovered', cells: missing }
  if (perCell.length === 0) return null
  const sum = (f) => perCell.reduce((acc, p) => acc + (f(p.stats) ?? 0), 0)
  return {
    area: ringToPolygon(ring),
    lines: perCell.flatMap((p) => p.lines),
    waypoints: perCell.flatMap((p) => p.waypoints),
    ...concatPerWaypoint(perCell),
    cellPlans: perCell,
    stats: {
      lineCount: sum((s) => s.lineCount),
      waypointCount: sum((s) => s.waypointCount),
      totalLineLengthM: sum((s) => s.totalLineLengthM),
      pathLengthM: sum((s) => s.pathLengthM),
      photoCount: photoIntervalM > 0 ? sum((s) => s.photoCount) : null,
      photoCountArea: photoIntervalM > 0 && overshootM > 0 && photoMode !== 'waypoint' ? sum((s) => s.photoCountArea) : null,
      flightTimeS: sum((s) => s.flightTimeS),
      areaHa: sum((s) => s.areaHa),
      bufferedAreaHa: sum((s) => s.bufferedAreaHa),
    },
  }
}

/**
 * Dupla grelha (crosshatch) para reconstrução 3D: gera a grelha normal e uma
 * segunda perpendicular (+90°), voadas em sequência. `align2` é o alinhamento
 * global da direção perpendicular (para células). Com `includeNadir` (R2.10)
 * acrescenta uma TERCEIRA passagem na direção da primeira grelha, voada no
 * fim — a passagem nadir para o produto orto; o pitch −90 é aplicado na
 * exportação a partir de `nadirStartLine`/`nadirStartWaypoint`. As
 * estatísticas somam todas as passagens, incluindo as ligações entre elas.
 */
export function generateFlightPlan(ring, options, generate = generateFlightLines) {
  // `generate` é injectável apenas para o smoke test forçar sub-planos
  // nulos; em produção é sempre generateFlightLines
  const p1 = generate(ring, options)
  if (!options.crosshatch || !p1 || p1.error) return p1

  const p2 = generate(ring, {
    ...options,
    angleDeg: (options.angleDeg + 90) % 360,
    align: options.align2 ?? null,
    tieLine: false, // a fiada de amarração só acompanha a primeira grelha
  })
  // A2: sem segunda grelha não há dupla grelha — erro explícito, nunca a
  // degradação silenciosa para uma grelha única que aqui existia
  if (!p2) return { error: 'crosshatch-failed' }
  if (p2.error) return p2

  const parts = [p1, p2]
  if (options.includeNadir) {
    const p3 = generate(ring, { ...options, tieLine: false })
    if (!p3) return { error: 'nadir-failed' }
    if (p3.error) return p3
    parts.push(p3)
  }

  const v = options.speed > 0 ? options.speed : 10
  let linkM = 0
  for (let i = 1; i < parts.length; i++) {
    linkM += turf.distance(
      parts[i - 1].waypoints[parts[i - 1].waypoints.length - 1],
      parts[i].waypoints[0],
      { units: 'meters' },
    )
  }
  const sum = (f) => parts.reduce((acc, p) => acc + (f(p.stats) ?? 0), 0)
  const nadir = parts.length === 3
  return {
    area: p1.area,
    lines: parts.flatMap((p) => p.lines),
    waypoints: parts.flatMap((p) => p.waypoints),
    ...concatPerWaypoint(parts),
    nadirStartLine: nadir ? p1.stats.lineCount + p2.stats.lineCount : null,
    nadirStartWaypoint: nadir ? p1.stats.waypointCount + p2.stats.waypointCount : null,
    stats: {
      lineCount: sum((s) => s.lineCount),
      waypointCount: sum((s) => s.waypointCount),
      totalLineLengthM: sum((s) => s.totalLineLengthM),
      pathLengthM: sum((s) => s.pathLengthM) + linkM,
      photoCount: parts.some((p) => p.stats.photoCount != null) ? sum((s) => s.photoCount) : null,
      photoCountArea: parts.some((p) => p.stats.photoCountArea != null)
        ? sum((s) => s.photoCountArea)
        : null,
      flightTimeS: parts.every((p) => p.stats.flightTimeS != null)
        ? sum((s) => s.flightTimeS) + linkM / v
        : null,
      areaHa: p1.stats.areaHa,
      bufferedAreaHa: p1.stats.bufferedAreaHa,
    },
  }
}

/**
 * R2.10: para planos com grelha nadir no fim, devolve por bloco o índice
 * LOCAL da linha onde o nadir começa: null (bloco sem linhas nadir), 0
 * (bloco inteiramente nadir) ou 0<k<n (misto — rodar o gimbal a −90 no
 * primeiro waypoint dessa linha). `blockLineCounts` pela ordem de voo.
 */
export function nadirLineLocalPerBlock(blockLineCounts, nadirStartLine) {
  if (nadirStartLine == null) return blockLineCounts.map(() => null)
  let global = 0
  return blockLineCounts.map((count) => {
    const local = nadirStartLine - global
    global += count
    if (local >= count) return null
    return Math.max(0, local)
  })
}

/**
 * E3.2: agregado do projecto quando coexistem vários planos (área, fachada,
 * órbita): soma tempo e fotos e estima as baterias somando POR PLANO
 * (missões separadas não partilham a bateria a meio), com o tempo útil
 * = bateria × (1 − reserva). Devolve null sem planos válidos.
 */
export function aggregatePlans(statsList, { batteryMin, reservePct = 30 } = {}) {
  const valid = (statsList ?? []).filter((s) => s && Number.isFinite(s.flightTimeS))
  if (valid.length === 0) return null
  const usefulS = batteryMin > 0 ? batteryMin * 60 * (1 - reservePct / 100) : null
  let flightTimeS = 0
  let photoCount = 0
  let batteries = 0
  for (const s of valid) {
    flightTimeS += s.flightTimeS
    photoCount += s.photoCount ?? 0
    if (usefulS) batteries += Math.max(1, Math.ceil(s.flightTimeS / usefulS))
  }
  return {
    plans: valid.length,
    flightTimeS,
    photoCount,
    batteries: usefulS ? batteries : null,
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

  const openBlock = (firstPoint, startLine) => {
    cur = {
      lines: [],
      startLine,
      cost: 0,
      transitS: transitFor(firstPoint),
      areaM2: 0,
      lengthM: 0,
      timeS: 0,
    }
    blocks.push(cur)
  }

  let prevEnd = null
  plan.lines.forEach((seg, li) => {
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

    if (!cur) openBlock(seg[0], li)
    const fits =
      mode === 'area'
        ? cur.cost + lineCost <= budget
        : cur.cost + lineCost + cur.transitS <= budget

    if (!fits && cur.lines.length > 0) {
      cur = null
      openBlock(seg[0], li)
    }
    // (uma faixa isolada que exceda o orçamento entra sozinha no bloco)
    cur.lines.push(seg)
    cur.cost += mode === 'area' ? lenM * spacingM : lenM / v + TURN_TIME_S + (cur.lines.length > 1 ? connM / v : 0)
    cur.areaM2 += lenM * spacingM
    cur.lengthM += lenM
    prevEnd = seg[1]
  })

  // B: offsets dos waypoints por linha (2 por linha sem densificação)
  const perLineAll = plan.perLine ?? plan.lines.map(() => 2)
  const offsets = [0]
  perLineAll.forEach((n) => offsets.push(offsets[offsets.length - 1] + n))
  return blocks.map((b, i) => {
    let waypoints = []
    let extra = {}
    if (plan.perLine) {
      // fatiar os waypoints densificados e os marcadores de foto do plano
      const from = offsets[b.startLine]
      const to = offsets[b.startLine + b.lines.length]
      waypoints = plan.waypoints.slice(from, to)
      const perWaypoint = []
      for (let k = from; k < to; k++) {
        if (plan.perWaypoint?.[k]) perWaypoint[k - from] = plan.perWaypoint[k]
      }
      extra = { perLine: plan.perLine.slice(b.startLine, b.startLine + b.lines.length), perWaypoint }
    } else {
      b.lines.forEach((seg) => waypoints.push(seg[0], seg[1]))
    }
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
      ...extra,
    }
  })
}
