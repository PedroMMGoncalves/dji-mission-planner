import * as turf from '@turf/turf'

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

function metersPerDegLon(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180)
}

/** Fecha um anel aberto e devolve um Feature<Polygon> do Turf. */
export function ringToPolygon(ring) {
  return turf.polygon([[...ring, ring[0]]])
}

/**
 * Normaliza o perfil selecionado num objeto "sensor" único:
 * { type: 'camera'|'lidar', sensorWidth, sensorHeight, focalLength, imageWidth, fov }
 */
export function resolveSensor(profile, customSensor) {
  if (profile.type !== 'custom') {
    return {
      type: 'camera',
      sensorWidth: profile.sensorWidth,
      sensorHeight: profile.sensorHeight,
      focalLength: profile.focalLength,
      imageWidth: profile.imageWidth,
    }
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

/** GSD em cm/píxel (apenas câmaras). */
export function computeGSD(sensor, altitude) {
  if (sensor.type !== 'camera' || !sensor.imageWidth) return null
  return (sensor.sensorWidth * altitude * 100) / (sensor.focalLength * sensor.imageWidth)
}

/** Distância entre faixas a partir da pegada transversal e da sobreposição lateral. */
export function lineSpacing(footprintAcross, sideOverlapPct) {
  return footprintAcross * (1 - sideOverlapPct / 100)
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
 * 5. Ordena as linhas em serpentina (ziguezague): linhas alternadas invertem o sentido.
 * 6. Roda tudo de volta pelo ângulo simétrico, em torno do mesmo pivô.
 *
 * Devolve { area, lines, waypoints, stats } ou { error }.
 */
export function generateFlightLines(ring, options) {
  const { spacingM, angleDeg, bufferPct, photoIntervalM, speed } = options
  if (!ring || ring.length < 3 || !(spacingM > 0.05)) return null

  const basePoly = ringToPolygon(ring)

  // 1) Buffer exterior
  let area = basePoly
  if (bufferPct > 0) {
    const dist = bufferDistanceMeters(basePoly, bufferPct)
    const buffered = turf.buffer(basePoly, dist, { units: 'meters' })
    if (buffered) area = buffered
  }

  // 2) Rodar a área para o referencial das linhas
  const pivot = turf.centroid(area).geometry.coordinates
  const delta = 90 - angleDeg
  const rotated = turf.transformRotate(area, delta, { pivot })

  const [minX, minY, maxX, maxY] = turf.bbox(rotated)
  const heightM = turf.distance([minX, minY], [minX, maxY], { units: 'meters' })
  if (!(heightM > 0)) return null

  const nLines = Math.max(1, Math.floor(heightM / spacingM) + 1)
  if (nLines > MAX_LINES) return { error: 'too-many-lines', nLines }

  // 3) Scanlines horizontais, com espaçamento exato e centradas na bbox
  const latStep = ((maxY - minY) * spacingM) / heightM
  const y0 = (minY + maxY) / 2 - ((nLines - 1) / 2) * latStep
  const padX = (maxX - minX) * 0.1 + 1e-6

  const rowsOfSegments = []
  for (let i = 0; i < nLines; i++) {
    const y = y0 + i * latStep
    const scanline = turf.lineString([
      [minX - padX, y],
      [maxX + padX, y],
    ])

    // 4) Interseção e emparelhamento dos cruzamentos
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
        if (lenM >= MIN_SEGMENT_M) segments.push([[xa, y], [xb, y]])
        k += 2
      } else {
        k += 1
      }
    }
    if (segments.length > 0) rowsOfSegments.push(segments)
  }

  if (rowsOfSegments.length === 0) return null

  // 5) Ordenação em serpentina (ziguezague)
  const serpentine = []
  rowsOfSegments.forEach((segments, rowIdx) => {
    if (rowIdx % 2 === 0) {
      segments.forEach((s) => serpentine.push(s))
    } else {
      segments
        .slice()
        .reverse()
        .forEach((s) => serpentine.push([s[1], s[0]]))
    }
  })

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

  // Estatísticas
  let totalLineLengthM = 0
  let photoCount = 0
  lines.forEach((seg) => {
    const len = turf.distance(seg[0], seg[1], { units: 'meters' })
    totalLineLengthM += len
    if (photoIntervalM > 0) photoCount += Math.floor(len / photoIntervalM) + 1
  })

  let pathLengthM = 0
  for (let i = 1; i < waypoints.length; i++) {
    pathLengthM += turf.distance(waypoints[i - 1], waypoints[i], { units: 'meters' })
  }

  const TURN_TIME_S = 3 // custo médio de cada inversão de sentido
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
      flightTimeS,
      areaHa: turf.area(basePoly) / 10000,
      bufferedAreaHa: turf.area(area) / 10000,
    },
  }
}
