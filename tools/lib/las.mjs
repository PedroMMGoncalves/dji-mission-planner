/**
 * Leitor mínimo de LAS 1.2–1.4 (formatos de ponto 0–10, sem compressão
 * LAZ): cabeçalho, contagem de pontos, limites e, se pedido, a densidade
 * de pontos dentro de um polígono em coordenadas do próprio ficheiro.
 * Só o que a ferramenta planeado-vs-medido precisa; nada de atributos.
 */

/** Lê o cabeçalho público. @param {Buffer|Uint8Array} buf */
export function readLasHeader(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const sig = String.fromCharCode(buf[0], buf[1], buf[2], buf[3])
  if (sig !== 'LASF') throw new Error('nao e um ficheiro LAS (assinatura LASF em falta)')
  const major = buf[24]
  const minor = buf[25]
  const headerSize = dv.getUint16(94, true)
  const offsetToPoints = dv.getUint32(96, true)
  const format = buf[104] & 0x3f // bit 7 = LAZ (compressao) nos ficheiros .laz
  const compressed = (buf[104] & 0x80) !== 0
  const recordLength = dv.getUint16(105, true)
  const legacyCount = dv.getUint32(107, true)
  const scale = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)]
  const offset = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)]
  const maxX = dv.getFloat64(179, true)
  const minX = dv.getFloat64(187, true)
  const maxY = dv.getFloat64(195, true)
  const minY = dv.getFloat64(203, true)
  const maxZ = dv.getFloat64(211, true)
  const minZ = dv.getFloat64(219, true)
  let count = legacyCount
  if (major === 1 && minor >= 4 && headerSize >= 375) {
    const big = dv.getBigUint64(247, true)
    if (big > 0n) count = Number(big)
  }
  if (compressed)
    throw new Error(
      'LAZ (comprimido) nao suportado: converta para LAS (ex.: laszip -i x.laz -o x.las)',
    )
  return {
    version: `${major}.${minor}`,
    format,
    recordLength,
    headerSize,
    offsetToPoints,
    count,
    scale,
    offset,
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
  }
}

/** Itera as coordenadas XYZ (em unidades do ficheiro) de todos os pontos. */
export function* iterLasPoints(buf, header = readLasHeader(buf)) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const { offsetToPoints: o, recordLength: r, count, scale, offset } = header
  for (let i = 0; i < count; i++) {
    const p = o + i * r
    if (p + 12 > buf.byteLength) break
    yield [
      dv.getInt32(p, true) * scale[0] + offset[0],
      dv.getInt32(p + 4, true) * scale[1] + offset[1],
      dv.getInt32(p + 8, true) * scale[2] + offset[2],
    ]
  }
}

/** Ponto dentro de um anel (ray casting), no plano XY do ficheiro. */
export function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Área de um anel (fórmula do cadarço), em unidades² do ficheiro. */
export function ringArea(ring) {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(s) / 2
}

/**
 * Densidade de pontos (pontos/m²) dentro de um anel em coordenadas
 * projectadas em metros (o mesmo CRS do LAS). Sem anel, usa os limites do
 * cabeçalho. Devolve também a distribuição por células de `cellM` metros
 * (mínimo, mediana), que é o que uma especificação LiDAR costuma pedir.
 */
export function lasDensity(buf, { ring = null, cellM = 10 } = {}) {
  const h = readLasHeader(buf)
  const cells = new Map()
  let inside = 0
  for (const [x, y] of iterLasPoints(buf, h)) {
    if (ring && !pointInRing(x, y, ring)) continue
    inside += 1
    const key = `${Math.floor(x / cellM)},${Math.floor(y / cellM)}`
    cells.set(key, (cells.get(key) ?? 0) + 1)
  }
  const areaM2 = ring
    ? ringArea(ring)
    : (h.bounds.maxX - h.bounds.minX) * (h.bounds.maxY - h.bounds.minY)
  // a distribuicao por celula so conta celulas inteiramente dentro da area:
  // uma celula cortada pela fronteira tem poucos pontos por ser pequena,
  // nao por a nuvem ser rala
  const interior = ([kx, ky]) => {
    if (!ring) return true
    const x0 = kx * cellM
    const y0 = ky * cellM
    return [
      [x0, y0],
      [x0 + cellM, y0],
      [x0 + cellM, y0 + cellM],
      [x0, y0 + cellM],
    ].every(([x, y]) => pointInRing(x, y, ring))
  }
  const perCell = [...cells.entries()]
    .filter(([key]) => interior(key.split(',').map(Number)))
    .map(([, n]) => n / (cellM * cellM))
    .sort((a, b) => a - b)
  const median = perCell.length ? perCell[Math.floor(perCell.length / 2)] : 0
  return {
    header: h,
    pointsInside: inside,
    areaM2,
    densityPerM2: areaM2 > 0 ? inside / areaM2 : 0,
    cellM,
    cellsWithPoints: perCell.length,
    cellDensityMin: perCell[0] ?? 0,
    cellDensityMedian: median,
  }
}
