/**
 * TERRAIN FOLLOW — modelo digital de terreno e adaptação das linhas de voo.
 *
 * Convenções (iguais às de geo.js):
 *  - Coordenadas em WGS84 (EPSG:4326), sempre na ordem [lon, lat].
 *  - Todas as distâncias e elevações em metros.
 *
 * Fonte de elevação: tiles "Terrarium" do dataset público da AWS
 * (elevation-tiles-prod), sem chave de API. Cada píxel do PNG codifica a
 * elevação nos canais RGB:
 *
 *     elevação_m = (R × 256 + G + B / 256) − 32768
 *
 * O esquema de tiles é o XYZ/Web Mercator habitual (z/x/y.png).
 *
 * Notas de arquitetura: só `loadTerrain` toca em APIs de browser
 * (fetch / createImageBitmap / canvas). Tudo o resto — descodificação,
 * projeção, simplificação de perfis e geração dos waypoints — é matemática
 * pura e corre em Node, o que permite testar `terrainFollowLines` com um
 * objeto `terrain` sintético (basta um `elevationAt(lon, lat)`).
 */

import { TERRARIUM_DATUM } from './verticalDatum.js'
import { M_PER_DEG_LAT, metersPerDegLon } from './units.js'

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const DEFAULT_TILE_SIZE = 256 // lado dos tiles Terrarium, em píxeis
const MAX_CONCURRENT_FETCHES = 8 // pedidos HTTP simultâneos
const MAX_TILES = 600 // trava de segurança contra bboxes/zooms absurdos
const MAX_FAIL_RATIO = 0.2 // acima de 20% de tiles em falha, desiste
const MIN_SAFE_REL_M = 20 // altura relativa mínima confortável (aviso)
const MAX_PROFILE_POINTS = 20000 // trava contra `stepM` minúsculos
const MIN_STEP_M = 1 // passo mínimo de densificação

/** Latitude limite do Web Mercator (a projeção diverge nos polos). */
const MERCATOR_MAX_LAT = 85.05112878

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

/* ------------------------------------------------------------------ *
 * 1) Descodificação Terrarium
 * ------------------------------------------------------------------ */

/**
 * Converte um píxel Terrarium (RGB) em elevação, em metros.
 * Função pura — é o núcleo testável de toda a leitura dos tiles.
 *
 * @param {number} r canal vermelho (0–255)
 * @param {number} g canal verde (0–255)
 * @param {number} b canal azul (0–255)
 * @returns {number} elevação em metros (pode ser negativa: batimetria)
 */
export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768
}

/* ------------------------------------------------------------------ *
 * 2) Projeção Web Mercator ↔ tiles/píxeis
 * ------------------------------------------------------------------ */

/**
 * Índices XYZ (inteiros) do tile que contém o ponto, no zoom dado.
 * Fórmula padrão do Web Mercator (esférico), com a latitude limitada aos
 * ±85.05112878° suportados pela projeção e os índices presos ao domínio
 * válido [0, 2^z − 1].
 *
 * @param {number} lon longitude em graus
 * @param {number} lat latitude em graus
 * @param {number} z nível de zoom
 * @returns {{x: number, y: number}}
 */
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z
  const px = lonLatToPixel(lon, lat, z, 1) // tileSize = 1 → coordenadas em tiles
  return {
    x: clamp(Math.floor(px.x), 0, n - 1),
    y: clamp(Math.floor(px.y), 0, n - 1),
  }
}

/**
 * Coordenadas de píxel GLOBAIS (fracionárias) no mosaico completo do zoom.
 * A origem é o canto noroeste do mundo; o mosaico tem 2^z × tileSize píxeis
 * de lado. A parte inteira dividida por `tileSize` dá o tile; o resto dá a
 * posição dentro do tile.
 *
 * @param {number} lon longitude em graus
 * @param {number} lat latitude em graus
 * @param {number} z nível de zoom
 * @param {number} [tileSize=256] lado do tile em píxeis
 * @returns {{x: number, y: number}}
 */
export function lonLatToPixel(lon, lat, z, tileSize = DEFAULT_TILE_SIZE) {
  const scale = 2 ** z * tileSize
  const latC = clamp(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT)
  const latRad = (latC * Math.PI) / 180
  // Math.asinh(Math.tan(φ)) é a forma numericamente estável de
  // ln(tan(φ) + sec(φ)), a ordenada de Mercator.
  const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2
  return {
    x: ((lon + 180) / 360) * scale,
    y: y * scale,
  }
}

/* ------------------------------------------------------------------ *
 * 3) Carregamento dos tiles (browser)
 * ------------------------------------------------------------------ */

/** Canvas fora do DOM se possível; senão, um <canvas> normal. */
function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return null
}

/** Descarrega um PNG e devolve { data, width, height } com os píxeis RGBA. */
async function fetchTilePixels(url, doFetch) {
  const res = await doFetch(url)
  if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : '?'} em ${url}`)
  const blob = await res.blob()
  // CRÍTICO: sem estas opções o browser pode aplicar conversão de espaço de
  // cor / alfa pré-multiplicado ao PNG — um desvio de ±1 no canal R equivale
  // a ±256 m de elevação (picos em cone no relevo).
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  try {
    const { width, height } = bitmap
    const canvas = createCanvas(width, height)
    if (!canvas) throw new Error('canvas indisponível neste ambiente')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('contexto 2d indisponível')
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, width, height)
    // Descodifica já para metros (Float32) e remove picos residuais
    const elev = new Float32Array(width * height)
    const d = img.data
    for (let i = 0, p = 0; p < elev.length; i += 4, p++) {
      elev[p] = decodeTerrarium(d[i], d[i + 1], d[i + 2])
    }
    despikeElevations(elev, width, height)
    return { elev, width, height }
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close()
  }
}

/**
 * Remove picos isolados (outliers) numa grelha de elevações, in-place:
 * um píxel que difira mais de `thresholdM` da mediana dos seus vizinhos 3×3
 * é substituído por essa mediana. Cristas e vales reais têm suporte espacial
 * e não são afetados; erros pontuais de descodificação/dados desaparecem.
 */
export function despikeElevations(elev, width, height, thresholdM = 150) {
  const orig = Float32Array.from(elev)
  const viz = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      viz.length = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          if (dx === 0 && dy === 0) continue
          viz.push(orig[ny * width + nx])
        }
      }
      if (viz.length < 3) continue
      const i = y * width + x
      // um valor real (crista, esporão) tem pelo menos 2 vizinhos ao seu
      // nível; um erro pontual de descodificação não tem nenhum
      let suporte = 0
      for (const v of viz) if (Math.abs(v - orig[i]) <= thresholdM) suporte++
      if (suporte >= 2) continue
      viz.sort((a, b) => a - b)
      const mediana = viz[Math.floor(viz.length / 2)]
      if (Math.abs(orig[i] - mediana) > thresholdM) elev[i] = mediana
    }
  }
  return elev
}

/**
 * Executa `worker` sobre `items` com, no máximo, `limit` tarefas em voo.
 * Pool simples de "runners" que consomem um contador partilhado — evita
 * disparar centenas de pedidos de uma vez.
 */
async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Descarrega o modelo de terreno que cobre a bbox e devolve um amostrador.
 *
 * Cobre o intervalo de tiles da bbox com **1 tile de margem** em todas as
 * direções (dá folga à interpolação e a buffers/expansões da área). Os PNGs
 * são descarregados em paralelo (limite de ~8 pedidos), convertidos em
 * `Uint8ClampedArray` (ImageData) e guardados num `Map` indexado por "x/y" —
 * a amostragem passa a ser aritmética pura, sem alocações.
 *
 * Tolerância a falhas: tiles isolados que falhem ficam simplesmente em falta
 * (`elevationAt` devolve `null` nessas zonas); se falharem mais de 20% dos
 * tiles, considera-se que o modelo não é utilizável e lança-se um erro.
 *
 * @param {[number, number, number, number]} bbox [minLon, minLat, maxLon, maxLat]
 * @param {{ zoom?: number, fetchImpl?: typeof fetch, urlTemplate?: string }} [options]
 * @returns {Promise<{zoom: number, bbox: number[], tileCount: number, tileSize: number,
 *   failedCount: number, verticalDatum: object, elevationAt: (lon: number, lat: number) => number|null}>}
 */
export async function loadTerrain(
  bbox,
  { zoom = 12, fetchImpl = fetch, urlTemplate = TERRARIUM_URL } = {},
) {
  if (!Array.isArray(bbox) || bbox.length < 4 || !bbox.every((v) => Number.isFinite(v))) {
    throw new Error('bbox inválida para o modelo de terreno')
  }
  const z = clamp(Math.round(zoom), 0, 15)

  // `fetch` desligado do objeto global rebenta em vários browsers
  // ("Illegal invocation") — reassociar ao globalThis resolve.
  const doFetch =
    typeof fetchImpl === 'function'
      ? fetchImpl === globalThis.fetch
        ? globalThis.fetch.bind(globalThis)
        : fetchImpl
      : null
  if (!doFetch) throw new Error('fetch indisponível para descarregar o terreno')
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap indisponível para descodificar o terreno')
  }

  const minLon = Math.min(bbox[0], bbox[2])
  const maxLon = Math.max(bbox[0], bbox[2])
  const minLat = Math.min(bbox[1], bbox[3])
  const maxLat = Math.max(bbox[1], bbox[3])

  // Cantos NO e SE → intervalo de tiles, com 1 tile de margem
  const nw = lonLatToTile(minLon, maxLat, z)
  const se = lonLatToTile(maxLon, minLat, z)
  const n = 2 ** z
  const x0 = clamp(Math.min(nw.x, se.x) - 1, 0, n - 1)
  const x1 = clamp(Math.max(nw.x, se.x) + 1, 0, n - 1)
  const y0 = clamp(Math.min(nw.y, se.y) - 1, 0, n - 1)
  const y1 = clamp(Math.max(nw.y, se.y) + 1, 0, n - 1)

  const wanted = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) wanted.push({ x, y })
  }
  if (wanted.length > MAX_TILES) {
    throw new Error('Área demasiado grande para o modelo de terreno — reduza o zoom ou a área')
  }

  const tiles = new Map()
  let failed = 0
  let tileSize = DEFAULT_TILE_SIZE

  await runPool(wanted, MAX_CONCURRENT_FETCHES, async ({ x, y }) => {
    const url = urlTemplate
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
    try {
      const px = await fetchTilePixels(url, doFetch)
      tiles.set(`${x}/${y}`, px)
      if (px.width > 0) tileSize = px.width
    } catch {
      failed++ // tile isolado em falta: a zona fica sem dados
    }
  })

  if (wanted.length === 0 || failed > wanted.length * MAX_FAIL_RATIO) {
    throw new Error('Falha ao descarregar o modelo de terreno')
  }

  /** Elevação de um píxel global (inteiro), ou null se o tile não existir. */
  const samplePixel = (gx, gy) => {
    const tx = Math.floor(gx / tileSize)
    const ty = Math.floor(gy / tileSize)
    const tile = tiles.get(`${tx}/${ty}`)
    if (!tile) return null
    const lx = clamp(gx - tx * tileSize, 0, tile.width - 1)
    const ly = clamp(gy - ty * tileSize, 0, tile.height - 1)
    return tile.elev[ly * tile.width + lx]
  }

  /**
   * Elevação interpolada bilinearmente entre os 4 píxeis vizinhos.
   * Os píxeis são amostrados no seu centro, daí o desvio de meio píxel.
   * Vizinhos em falta (tile não descarregado) são ignorados e os pesos
   * renormalizados; sem nenhum vizinho válido, devolve null.
   */
  const elevationAt = (lon, lat) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    const p = lonLatToPixel(lon, lat, z, tileSize)
    const fx = p.x - 0.5
    const fy = p.y - 0.5
    const gx0 = Math.floor(fx)
    const gy0 = Math.floor(fy)
    const tx = fx - gx0
    const ty = fy - gy0

    let acc = 0
    let wsum = 0
    for (let dy = 0; dy < 2; dy++) {
      const wy = dy === 0 ? 1 - ty : ty
      if (wy <= 0) continue
      for (let dx = 0; dx < 2; dx++) {
        const w = wy * (dx === 0 ? 1 - tx : tx)
        if (w <= 0) continue
        const v = samplePixel(gx0 + dx, gy0 + dy)
        if (v === null) continue
        acc += w * v
        wsum += w
      }
    }
    return wsum > 0 ? acc / wsum : null
  }

  return {
    zoom: z,
    bbox: [minLon, minLat, maxLon, maxLat],
    tileCount: tiles.size,
    tileSize,
    failedCount: failed,
    verticalDatum: TERRARIUM_DATUM,
    elevationAt,
  }
}

/* ------------------------------------------------------------------ *
 * 4) Simplificação do perfil (Douglas-Peucker 1D)
 * ------------------------------------------------------------------ */

/**
 * Douglas-Peucker a uma dimensão sobre um perfil `[{ distM, value }]`.
 *
 * Ao contrário do DP clássico (distância perpendicular a uma reta 2D), aqui
 * o que interessa é o desvio VERTICAL: mantém-se o conjunto mínimo de pontos
 * tal que a interpolação linear entre eles nunca se afasta mais de
 * `toleranceM` do perfil original. É exatamente o critério de um "terrain
 * follow" — poucos waypoints, sem que o drone se desvie do relevo.
 *
 * Implementação iterativa (pilha explícita) para não estourar a stack em
 * perfis longos.
 *
 * @param {Array<{distM: number, value: number}>} points perfil, com distM crescente
 * @param {number} toleranceM tolerância vertical em metros (0 → mantém tudo)
 * @returns {number[]} índices retidos, ordenados, incluindo sempre 0 e o último
 */
export function simplifyProfile(points, toleranceM) {
  if (!Array.isArray(points) || points.length === 0) return []
  const n = points.length
  if (n <= 2) return n === 1 ? [0] : [0, 1]

  const tol = Number.isFinite(toleranceM) && toleranceM > 0 ? toleranceM : 0
  if (tol === 0) return Array.from({ length: n }, (_, i) => i)

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1

  const stack = [[0, n - 1]]
  while (stack.length > 0) {
    const [i0, i1] = stack.pop()
    if (i1 <= i0 + 1) continue

    const d0 = points[i0].distM
    const v0 = points[i0].value
    const dd = points[i1].distM - d0
    // Segmento degenerado (distâncias iguais) → compara-se só em altura
    const slope = Math.abs(dd) > 1e-9 ? (points[i1].value - v0) / dd : 0

    let worst = -1
    let worstIdx = -1
    for (let i = i0 + 1; i < i1; i++) {
      const predicted = v0 + slope * (points[i].distM - d0)
      const dev = Math.abs(points[i].value - predicted)
      if (Number.isFinite(dev) && dev > worst) {
        worst = dev
        worstIdx = i
      }
    }

    if (worstIdx >= 0 && worst > tol) {
      keep[worstIdx] = 1
      stack.push([i0, worstIdx], [worstIdx, i1])
    }
  }

  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i)
  return out
}

/* ------------------------------------------------------------------ *
 * 5) Terrain follow sobre as linhas de voo
 * ------------------------------------------------------------------ */

/** Comprimento aproximado de um segmento curto (metros por grau locais). */
function segmentLengthM(a, b) {
  const midLat = (a[1] + b[1]) / 2
  const dx = (b[0] - a[0]) * metersPerDegLon(midLat)
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

/**
 * TERRAIN FOLLOW — converte linhas de voo planas em waypoints com altura
 * relativa ao ponto de descolagem, seguindo o relevo.
 *
 * Para cada segmento (já em ordem de voo, serpentina) — e também para a
 * LIGAÇÃO recta que a serpentina voa do fim de um segmento ao início do
 * seguinte; os pontos dessa ligação contam para o segmento a que conduzem em
 * `perLine` e ficam registados à parte em `perLink`:
 *  1. densifica a cada `stepM` metros (interpolação linear em lon/lat — os
 *     segmentos têm poucos km, o erro face à geodésica é desprezável);
 *  2. amostra `terrain.elevationAt` em cada ponto do perfil;
 *  3. simplifica o perfil com Douglas-Peucker 1D e tolerância `toleranceM`;
 *  4. os pontos retidos tornam-se waypoints `[lon, lat, alturaRel]`, com
 *     `alturaRel = agl + (elev − refElev)` arredondada a 0.1 m.
 *
 * `refElev` é a elevação do ponto de descolagem: as alturas exportadas são
 * relativas a ele (é assim que o DJI interpreta os waypoints "relative to
 * take-off point"). Pontos sem dados de elevação herdam a última elevação
 * válida (ou `refElev`, se ainda não houver nenhuma).
 *
 * @param {{verticalDatum: object, elevationAt: (lon: number, lat: number) => number|null}} terrain
 * @param {Array<Array<[number, number]>>} lines segmentos [[lonA,latA],[lonB,latB]]
 * @param {{agl?: number, refElev?: number, toleranceM?: number, stepM?: number}} [options]
 * @returns {{waypoints: Array<[number, number, number]>, perLine: number[],
 *   perLink: number[], elevMin: number|null, elevMax: number|null, warnings: string[]}}
 */
export function terrainFollowLines(
  terrain,
  lines,
  { agl, refElev, toleranceM = 5, stepM = 40 } = {},
) {
  const waypoints = []
  const perLine = []
  const perLink = []
  const warnings = []

  const empty = { waypoints, perLine, perLink, elevMin: null, elevMax: null, warnings }
  if (!Array.isArray(lines) || lines.length === 0) return empty

  const sampler = typeof terrain?.elevationAt === 'function' ? terrain.elevationAt : null
  const ref = Number.isFinite(refElev) ? refElev : 0
  const height = Number.isFinite(agl) ? agl : 0
  const tol = Number.isFinite(toleranceM) && toleranceM > 0 ? toleranceM : 0
  const step = Number.isFinite(stepM) && stepM > 0 ? Math.max(MIN_STEP_M, stepM) : 40

  let elevMin = Infinity
  let elevMax = -Infinity
  let minRel = Infinity
  let noDataCount = 0
  let sampleCount = 0
  let lastValid = null

  // Perfil de um troço recto a→b: densifica, amostra o relevo, simplifica e
  // devolve os waypoints retidos [lon, lat, alturaRel], extremos incluídos.
  const profileWaypoints = (a, b) => {
    // 1) Densificação a cada `step` metros
    const lenM = segmentLengthM(a, b)
    let nSteps = lenM > 0 ? Math.max(1, Math.ceil(lenM / step)) : 0
    if (nSteps + 1 > MAX_PROFILE_POINTS) nSteps = MAX_PROFILE_POINTS - 1

    const profile = []
    const coords = []
    for (let i = 0; i <= nSteps; i++) {
      const t = nSteps === 0 ? 0 : i / nSteps
      const lon = a[0] + (b[0] - a[0]) * t
      const lat = a[1] + (b[1] - a[1]) * t

      // 2) Amostragem do terreno
      let elev = sampler ? sampler(lon, lat) : null
      sampleCount++
      if (Number.isFinite(elev)) {
        lastValid = elev
        if (elev < elevMin) elevMin = elev
        if (elev > elevMax) elevMax = elev
      } else {
        noDataCount++
        elev = lastValid !== null ? lastValid : ref
      }

      coords.push([lon, lat])
      profile.push({ distM: t * lenM, value: elev })
    }

    // 3) Simplificação + 4) waypoints
    const out = []
    for (const idx of simplifyProfile(profile, tol)) {
      const rel = Math.round((height + (profile[idx].value - ref)) * 10) / 10
      if (rel < minRel) minRel = rel
      out.push([coords[idx][0], coords[idx][1], rel])
    }
    return out
  }

  let prevEnd = null
  for (const seg of lines) {
    if (!Array.isArray(seg) || seg.length < 2) {
      perLine.push(0)
      perLink.push(0)
      continue
    }
    const a = seg[0]
    const b = seg[1]
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      ![a[0], a[1], b[0], b[1]].every(Number.isFinite)
    ) {
      perLine.push(0)
      perLink.push(0)
      continue
    }

    // 0) A LIGAÇÃO desde o fim da linha anterior. A serpentina voa do fim de
    //    uma linha ao início da seguinte em linha recta, com a altura
    //    interpolada entre os dois extremos — e só as LINHAS eram amostradas.
    //    Num polígono convexo a ligação mede o espaçamento e o relevo mal
    //    muda; num polígono côncavo, entre as duas passagens da dupla grelha
    //    ou entre células, pode ter mais de um quilómetro e cruzar uma
    //    encosta que nenhuma linha viu. Num U com uma colina de 120 m no
    //    entalhe, a ligação de 1,15 km entre duas linhas N-S passava a 17,8 m
    //    do solo com 100 m de AGL pedidos, sem aviso. Amostra-se a ligação
    //    com as mesmas regras das linhas e inserem-se os pontos interiores
    //    que a tolerância exigir (os extremos já são waypoints). Contam para
    //    a linha a que conduzem, para `perLine` continuar a somar tudo, e
    //    ficam à parte em `perLink` para quem exporta por blocos os deitar
    //    fora: cada bloco arranca da base, não do fim do bloco anterior.
    let linkCount = 0
    if (prevEnd) {
      const link = profileWaypoints(prevEnd, a).slice(1, -1)
      waypoints.push(...link)
      linkCount = link.length
    }

    const kept = profileWaypoints(a, b)
    waypoints.push(...kept)
    perLine.push(linkCount + kept.length)
    perLink.push(linkCount)
    prevEnd = b
  }

  // Avisos operacionais
  if (Number.isFinite(minRel) && minRel < MIN_SAFE_REL_M) {
    warnings.push(
      `Altura relativa mínima de ${minRel.toFixed(1)} m (abaixo dos ${MIN_SAFE_REL_M} m recomendados face ao ponto de descolagem) — verifique o relevo e obstáculos.`,
    )
  }
  if (noDataCount > 0) {
    warnings.push(
      `Sem dados de terreno em ${noDataCount} de ${sampleCount} pontos amostrados — nessas zonas foi usada a última elevação válida.`,
    )
  }

  return {
    waypoints,
    perLine,
    perLink,
    elevMin: Number.isFinite(elevMin) ? elevMin : null,
    elevMax: Number.isFinite(elevMax) ? elevMax : null,
    warnings,
  }
}

/** Resolve um sistema linear 3x3 por eliminação gaussiana (ou null). */
function solve3(A, B) {
  const M = A.map((row, i) => [...row, B[i]])
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}

/**
 * T4.5: ajusta um plano médio z = a·x + b·y + c ao terreno dentro da bbox da
 * área (amostragem n×n do DEM, mínimos quadrados em metros locais) e devolve
 * a inclinação média, o azimute descendente e a direção das curvas de nível.
 * Serve o painel de sugestões para encostas íngremes voadas com a grelha
 * nadir + terrain follow: linhas ao longo das curvas de nível e gimbal
 * ≈ −(90 − inclinação). São sugestões, não automação.
 */
export function fitSlopePlane(terrainData, ring, { n = 12 } = {}) {
  if (!terrainData?.elevationAt || !ring || ring.length < 3) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const lat0 = (minY + maxY) / 2
  const mLon = metersPerDegLon(lat0)
  const mLat = M_PER_DEG_LAT

  let sx = 0
  let sy = 0
  let sz = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let sxz = 0
  let syz = 0
  let m = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lon = minX + ((i + 0.5) / n) * (maxX - minX)
      const lat = minY + ((j + 0.5) / n) * (maxY - minY)
      const z = terrainData.elevationAt(lon, lat)
      if (!Number.isFinite(z)) continue
      const x = (lon - minX) * mLon
      const y = (lat - minY) * mLat
      sx += x
      sy += y
      sz += z
      sxx += x * x
      syy += y * y
      sxy += x * y
      sxz += x * z
      syz += y * z
      m += 1
    }
  }
  if (m < 8) return null
  const sol = solve3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, m],
    ],
    [sxz, syz, sz],
  )
  if (!sol) return null
  const [a, b] = sol
  const slopeDeg = (Math.atan(Math.hypot(a, b)) * 180) / Math.PI
  // x=Este, y=Norte: azimute = atan2(componente E, componente N); o declive
  // desce ao longo de −∇z = (−a, −b)
  const downhillAzimuthDeg = ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360
  const contourAzimuthDeg = (downhillAzimuthDeg + 90) % 180
  return { slopeDeg, downhillAzimuthDeg, contourAzimuthDeg, samples: m }
}
