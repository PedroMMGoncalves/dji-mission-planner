import { fromBlob } from 'geotiff'
import proj4 from 'proj4'
import { CRS_OPTIONS } from './importArea.js'
import { M_PER_DEG_LAT, metersPerDegLon } from './units.js'

/**
 * MDT LOCAL — lê um GeoTIFF de Modelo Digital de Terreno do disco do
 * utilizador (ex.: MDT LiDAR da DGT a 50 cm / 2 m, em PT-TM06/EPSG:3763) e
 * expõe-no como fonte de elevação com o MESMO contrato de `loadTerrain`
 * (terrain.js): um objeto com `bbox` e `elevationAt(lon, lat)`, pelo que é
 * diretamente consumível por `terrainFollowLines`.
 *
 * Convenções (iguais às de geo.js / terrain.js):
 *  - Coordenadas de entrada/saída em WGS84 (EPSG:4326), ordem [lon, lat].
 *  - Todas as distâncias e elevações em metros.
 *
 * FICHEIROS DE VÁRIOS GB
 * ----------------------
 * Os MDT municipais podem ter dezenas de GB — ler o raster inteiro está fora
 * de questão. A estratégia é totalmente "preguiçosa":
 *
 *  1. `fromBlob(file)` cria uma fonte que lê o ficheiro por INTERVALOS de
 *     bytes (Blob.slice + FileReader). Nada é carregado à partida: só se leem
 *     os cabeçalhos/IFD.
 *  2. A área de levantamento (mais uma margem em metros) é projetada para o
 *     CRS do raster e convertida numa JANELA DE PÍXEIS.
 *  3. `image.readRasters({ window, width, height })` descarrega e descomprime
 *     APENAS os tiles/strips que intersetam essa janela, já reamostrados para
 *     um máximo de `maxDim` píxeis no lado maior.
 *
 * A grelha resultante fica em memória como `Float32Array` — no pior caso
 * 2048² × 4 B ≈ 16 MB — independentemente do tamanho do ficheiro original.
 *
 * Notas de arquitetura: a única dependência de APIs de browser é o
 * `FileReader` usado internamente pelo geotiff.js em `fromBlob`. Toda a
 * matemática (projeção, janela, interpolação) é pura.
 */

/** Códigos EPSG geográficos (graus) tratados diretamente como lon/lat. */
const GEOGRAPHIC_CODES = new Set([
  4326, // WGS 84
  4258, // ETRS89
  4979, // WGS 84 (3D)
  4937, // ETRS89 (3D)
])

/** Valor "indefinido" das GeoKeys do GeoTIFF (user-defined). */
const GEOKEY_UNDEFINED = 32767

const MAX_MAX_DIM = 8192 // trava superior para `maxDim` (8192² × 4 B ≈ 256 MB)
const DEFAULT_MAX_DIM = 2048
const EDGE_SAMPLES = 8 // pontos por aresta ao projetar bounding boxes

/** Sentinela típico de "sem dados" em bandas float (−3.4e38 e afins). */
const HUGE_SENTINEL = 1e30

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

/* ------------------------------------------------------------------ *
 * 1) CRS do raster
 * ------------------------------------------------------------------ */

/**
 * Descobre o CRS do GeoTIFF a partir das GeoKeys e devolve a definição proj4
 * correspondente. Reutiliza as defs de `CRS_OPTIONS` (importArea.js) para que
 * a importação de áreas e a de MDT falem exatamente a mesma linguagem.
 *
 * @param {Object} geoKeys `image.geoKeys`
 * @returns {{crsCode: string, geographic: boolean, def: string|null}}
 */
export function resolveRasterCrs(geoKeys) {
  const proj = Number(geoKeys?.ProjectedCSTypeGeoKey)
  const geog = Number(geoKeys?.GeographicTypeGeoKey)

  const usable = (c) => Number.isFinite(c) && c > 0 && c !== GEOKEY_UNDEFINED
  const code = usable(proj) ? proj : usable(geog) ? geog : null

  if (code === null) {
    throw new Error(
      'O GeoTIFF não indica o sistema de coordenadas (sem GeoKeys) — exporte o MDT em PT-TM06 (EPSG:3763)',
    )
  }

  // Graus: lon/lat direto, sem reprojeção (ETRS89 e WGS84 coincidem à escala
  // de trabalho de um MDT, com desvios muito abaixo da resolução da grelha).
  if (GEOGRAPHIC_CODES.has(code)) {
    return { crsCode: `EPSG:${code}`, geographic: true, def: null }
  }

  const option = CRS_OPTIONS.find((o) => o.code === `EPSG:${code}`)
  if (!option) {
    throw new Error(`CRS não suportado: EPSG:${code} — exporte o MDT em PT-TM06 (EPSG:3763)`)
  }
  return { crsCode: option.code, geographic: false, def: option.def }
}

/* ------------------------------------------------------------------ *
 * 2) Projeção de bounding boxes
 * ------------------------------------------------------------------ */

/**
 * Projeta um retângulo de um CRS para outro amostrando as suas ARESTAS (e não
 * só os 4 cantos): as projeções cartográficas curvam as linhas, e com áreas
 * grandes o extremo pode cair a meio de uma aresta.
 *
 * @param {number[]} box [minA, minB, maxA, maxB] no CRS de origem
 * @param {(a: number, b: number) => number[]} project conversor de coordenadas
 * @param {number} [steps=EDGE_SAMPLES] pontos por aresta
 * @returns {number[]} [minX, minY, maxX, maxY] no CRS de destino
 */
export function projectBox(box, project, steps = EDGE_SAMPLES) {
  const [minA, minB, maxA, maxB] = box
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const push = (a, b) => {
    let out
    try {
      out = project(a, b)
    } catch {
      return // ponto fora do domínio da projeção: ignora-se
    }
    if (!out || !Number.isFinite(out[0]) || !Number.isFinite(out[1])) return
    if (out[0] < minX) minX = out[0]
    if (out[0] > maxX) maxX = out[0]
    if (out[1] < minY) minY = out[1]
    if (out[1] > maxY) maxY = out[1]
  }

  const n = Math.max(1, steps)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = minA + (maxA - minA) * t
    const b = minB + (maxB - minB) * t
    push(a, minB)
    push(a, maxB)
    push(minA, b)
    push(maxA, b)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error('Não foi possível projetar a área para o sistema de coordenadas do MDT')
  }
  return [minX, minY, maxX, maxY]
}

/* ------------------------------------------------------------------ *
 * 3) Leitura do MDT
 * ------------------------------------------------------------------ */

/**
 * Lê a janela de um MDT GeoTIFF local que cobre a área de levantamento.
 *
 * @param {Blob|File} file ficheiro .tif/.tiff escolhido pelo utilizador
 * @param {[number, number, number, number]} areaBbox [minLon, minLat, maxLon, maxLat] em WGS84
 * @param {{maxDim?: number, marginM?: number}} [options]
 *   `maxDim` — lado máximo (em píxeis) da grelha lida; `marginM` — margem, em
 *   metros, acrescentada à área antes de recortar (dá folga ao buffer do plano
 *   e ao ponto de descolagem).
 * @returns {Promise<{source: string, label: string, crsCode: string,
 *   bbox: number[], resolutionM: number, nativeResolutionM: number,
 *   width: number, height: number,
 *   elevationAt: (lon: number, lat: number) => number|null}>}
 */
export async function loadDemFromFile(file, areaBbox, { maxDim = DEFAULT_MAX_DIM, marginM = 500 } = {}) {
  if (!file || typeof file.slice !== 'function') {
    throw new Error('Ficheiro de MDT inválido')
  }
  if (!Array.isArray(areaBbox) || areaBbox.length < 4 || !areaBbox.every((v) => Number.isFinite(v))) {
    throw new Error('Área de levantamento inválida para recortar o MDT')
  }

  const areaBox = [
    Math.min(areaBbox[0], areaBbox[2]),
    Math.min(areaBbox[1], areaBbox[3]),
    Math.max(areaBbox[0], areaBbox[2]),
    Math.max(areaBbox[1], areaBbox[3]),
  ]

  // 3.1) Abertura preguiçosa: só cabeçalhos, nenhum píxel
  let tiff
  try {
    tiff = await fromBlob(file)
  } catch (err) {
    throw new Error(`Não foi possível abrir o GeoTIFF: ${err?.message ?? 'formato inválido'}`)
  }

  let image
  try {
    image = await tiff.getImage(0) // primeira imagem = resolução máxima
  } catch (err) {
    throw new Error(`GeoTIFF ilegível: ${err?.message ?? 'sem imagens'}`)
  }

  const rasterWidth = image.getWidth()
  const rasterHeight = image.getHeight()
  if (!(rasterWidth > 0) || !(rasterHeight > 0)) {
    throw new Error('O GeoTIFF não tem píxeis')
  }

  // 3.2) Georreferenciação. Só se suportam rasters "north-up" (sem rotação):
  //      é o que produzem o GDAL/QGIS e os MDT oficiais.
  const transformation = image.fileDirectory?.ModelTransformation
  if (transformation && (Math.abs(transformation[1]) > 1e-12 || Math.abs(transformation[4]) > 1e-12)) {
    throw new Error('MDT com rotação não suportado — reexporte o raster sem rotação (north-up)')
  }

  let origin
  let resolution
  try {
    origin = image.getOrigin()
    resolution = image.getResolution()
  } catch {
    throw new Error('O GeoTIFF não está georreferenciado (sem origem/escala de píxel)')
  }
  const [originX, originY] = origin
  const [resX, resY] = resolution // resY é negativo em rasters north-up
  if (!Number.isFinite(resX) || !Number.isFinite(resY) || resX === 0 || resY === 0) {
    throw new Error('O GeoTIFF tem uma escala de píxel inválida')
  }

  const { crsCode, geographic, def } = resolveRasterCrs(image.geoKeys)

  // Conversores lon/lat ↔ CRS do raster (identidade se o raster for em graus)
  const converter = geographic ? null : proj4(proj4.WGS84, def)
  const toRaster = geographic ? (lon, lat) => [lon, lat] : (lon, lat) => converter.forward([lon, lat])
  const toWgs84 = geographic ? (x, y) => [x, y] : (x, y) => converter.inverse([x, y])

  // 3.3) Área + margem, no CRS do raster
  const wanted = projectBox(areaBox, toRaster)
  const midLat = (areaBox[1] + areaBox[3]) / 2
  const margin = Number.isFinite(marginM) && marginM > 0 ? marginM : 0
  const marginX = geographic ? margin / Math.max(1, metersPerDegLon(midLat)) : margin
  const marginY = geographic ? margin / M_PER_DEG_LAT : margin
  wanted[0] -= marginX
  wanted[1] -= marginY
  wanted[2] += marginX
  wanted[3] += marginY

  // 3.4) Interseção com a extensão do raster
  const extent = image.getBoundingBox()
  const cutMinX = Math.max(wanted[0], Math.min(extent[0], extent[2]))
  const cutMinY = Math.max(wanted[1], Math.min(extent[1], extent[3]))
  const cutMaxX = Math.min(wanted[2], Math.max(extent[0], extent[2]))
  const cutMaxY = Math.min(wanted[3], Math.max(extent[1], extent[3]))
  if (!(cutMaxX > cutMinX) || !(cutMaxY > cutMinY)) {
    throw new Error('O MDT não cobre a área de levantamento')
  }

  // 3.5) Janela de píxeis [x0, y0, x1, y1] (x1/y1 exclusivos)
  const pxA = (cutMinX - originX) / resX
  const pxB = (cutMaxX - originX) / resX
  const pyA = (cutMinY - originY) / resY
  const pyB = (cutMaxY - originY) / resY
  const x0 = clamp(Math.floor(Math.min(pxA, pxB)), 0, rasterWidth - 1)
  const x1 = clamp(Math.ceil(Math.max(pxA, pxB)), x0 + 1, rasterWidth)
  const y0 = clamp(Math.floor(Math.min(pyA, pyB)), 0, rasterHeight - 1)
  const y1 = clamp(Math.ceil(Math.max(pyA, pyB)), y0 + 1, rasterHeight)
  const winW = x1 - x0
  const winH = y1 - y0

  // 3.6) Reamostragem para ≤ maxDim no lado maior (mantendo a proporção).
  //      Vizinho mais próximo de propósito: preserva intactos os valores de
  //      "sem dados" (uma média bilinear contaminaria os píxeis vizinhos).
  const maxSide = clamp(Math.floor(maxDim) || DEFAULT_MAX_DIM, 1, MAX_MAX_DIM)
  const scale = Math.min(1, maxSide / Math.max(winW, winH))
  const outW = clamp(Math.round(winW * scale), 1, winW)
  const outH = clamp(Math.round(winH * scale), 1, winH)

  let rasters
  try {
    rasters = await image.readRasters({
      window: [x0, y0, x1, y1],
      samples: [0], // multi-banda → usa-se sempre a banda 0
      width: outW,
      height: outH,
      resampleMethod: 'nearest',
      interleave: false,
    })
  } catch (err) {
    throw new Error(`Falha ao ler os píxeis do MDT: ${err?.message ?? 'erro de descodificação'}`)
  }

  const band = Array.isArray(rasters) ? rasters[0] : rasters
  if (!band || typeof band.length !== 'number') {
    throw new Error('O MDT não devolveu dados na janela pedida')
  }
  const gridW = rasters.width ?? outW
  const gridH = rasters.height ?? outH
  if (band.length < gridW * gridH) {
    throw new Error('O MDT devolveu uma grelha incompleta')
  }

  // 3.7) Normalização para Float32Array, com nodata → NaN
  let nodata = null
  try {
    const nd = image.getGDALNoData()
    if (Number.isFinite(nd)) nodata = nd
  } catch {
    nodata = null
  }
  // Tolerância: o nodata vem do cabeçalho em dupla precisão e a banda pode ser
  // float32, pelo que a igualdade exata nem sempre se verifica.
  const ndTol = nodata === null ? 0 : Math.abs(nodata) * 1e-6 + 1e-6

  const grid = new Float32Array(gridW * gridH)
  let validCount = 0
  for (let i = 0; i < grid.length; i++) {
    const v = band[i]
    if (
      !Number.isFinite(v) ||
      Math.abs(v) >= HUGE_SENTINEL ||
      (nodata !== null && Math.abs(v - nodata) <= ndTol)
    ) {
      grid[i] = NaN
      continue
    }
    grid[i] = v
    validCount++
  }
  if (validCount === 0) {
    throw new Error('O MDT não tem valores de elevação válidos na área de levantamento')
  }

  // 3.8) Extensão efetiva da janela, em WGS84
  const winMinX = Math.min(originX + x0 * resX, originX + x1 * resX)
  const winMaxX = Math.max(originX + x0 * resX, originX + x1 * resX)
  const winMinY = Math.min(originY + y0 * resY, originY + y1 * resY)
  const winMaxY = Math.max(originY + y0 * resY, originY + y1 * resY)
  const bbox = projectBox([winMinX, winMinY, winMaxX, winMaxY], toWgs84)

  // 3.9) Resoluções em metros (aproximadas, se o raster for em graus)
  const bboxMidLat = (bbox[1] + bbox[3]) / 2
  const mPerUnitX = geographic ? metersPerDegLon(bboxMidLat) : 1
  const mPerUnitY = geographic ? M_PER_DEG_LAT : 1
  const nativeResolutionM = (Math.abs(resX) * mPerUnitX + Math.abs(resY) * mPerUnitY) / 2
  const stepX = winW / gridW // píxeis nativos por píxel da grelha lida
  const stepY = winH / gridH
  const resolutionM =
    (Math.abs(resX) * stepX * mPerUnitX + Math.abs(resY) * stepY * mPerUnitY) / 2

  /**
   * Elevação interpolada bilinearmente na grelha lida.
   *
   * O geotiff.js reamostra por vizinho mais próximo com `cx = round(relX · j)`,
   * ou seja, a amostra `j` da grelha lida corresponde ao CENTRO do píxel
   * nativo `x0 + relX·j`, isto é, à coordenada fracionária `x0 + relX·j + 0.5`.
   * A inversa dessa relação é o mapeamento usado aqui — quando não há
   * reamostragem (relX = 1) reduz-se ao habitual desvio de meio píxel.
   *
   * Vizinhos sem dados (NaN) são ignorados e os pesos renormalizados; sem
   * nenhum vizinho válido, devolve null (contrato igual ao de terrain.js).
   *
   * @param {number} lon longitude em graus (WGS84)
   * @param {number} lat latitude em graus (WGS84)
   * @returns {number|null} elevação em metros, ou null fora da janela/sem dados
   */
  const elevationAt = (lon, lat) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

    let xy
    try {
      xy = toRaster(lon, lat)
    } catch {
      return null
    }
    if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null

    // Coordenadas fracionárias no raster completo
    const pxFull = (xy[0] - originX) / resX
    const pyFull = (xy[1] - originY) / resY
    if (pxFull < x0 || pxFull > x1 || pyFull < y0 || pyFull > y1) return null

    // …e na grelha efetivamente lida
    const gx = (pxFull - x0 - 0.5) / stepX
    const gy = (pyFull - y0 - 0.5) / stepY
    const ix0 = Math.floor(gx)
    const iy0 = Math.floor(gy)
    const tx = gx - ix0
    const ty = gy - iy0

    let acc = 0
    let wsum = 0
    for (let dy = 0; dy < 2; dy++) {
      const wy = dy === 0 ? 1 - ty : ty
      if (wy <= 0) continue
      const iy = iy0 + dy
      if (iy < 0 || iy >= gridH) continue
      for (let dx = 0; dx < 2; dx++) {
        const w = wy * (dx === 0 ? 1 - tx : tx)
        if (w <= 0) continue
        const ix = ix0 + dx
        if (ix < 0 || ix >= gridW) continue
        const v = grid[iy * gridW + ix]
        if (!Number.isFinite(v)) continue
        acc += w * v
        wsum += w
      }
    }
    return wsum > 0 ? acc / wsum : null
  }

  return {
    source: 'file',
    label: /** @type {File} */ (file).name || 'MDT',
    crsCode,
    bbox,
    resolutionM,
    nativeResolutionM,
    width: gridW,
    height: gridH,
    elevationAt,
  }
}
