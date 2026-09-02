// Escritor de GeoTIFF sintetico partilhado pelo teste de E/S e pelo E2E.

/**
 * GeoTIFF FLOAT32 sintético, montado byte a byte.
 *
 * Porquê à mão: o `writeArrayBuffer` do geotiff.js escreve sempre amostras de
 * 8 bits (ignora o BitsPerSample pedido), e um MDT real — o LiDAR da DGT, por
 * exemplo — é float32 com sentinela de "sem dados" muito fora de [0, 255].
 * Com um raster de 8 bits o −9999 daria a volta para 241 e o caminho do
 * nodata nunca seria exercitado. São ~40 linhas de TIFF sem compressão, com
 * uma só strip; se estiverem erradas, o geotiff.js recusa-se a ler e o teste
 * falha de imediato — não há como passarem despercebidas.
 */
export const TIFF_TYPE = { ASCII: 2, SHORT: 3, LONG: 4, DOUBLE: 12 }
export const GEO_KEY_ID = {
  GTModelTypeGeoKey: 1024,
  GeographicTypeGeoKey: 2048,
  ProjectedCSTypeGeoKey: 3072,
}

export function makeFloatTiff({
  width,
  height,
  valueAt,
  originX,
  originY,
  scale,
  geoKeys,
  nodata,
  transform = null,
}) {
  const px = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) px[y * width + x] = valueAt(x, y)
  }

  // directório de GeoKeys: cabeçalho (versão, revisão, nº de chaves) + 4 shorts por chave
  const keys = Object.entries(geoKeys)
    .map(([name, v]) => [GEO_KEY_ID[name], v])
    .sort((a, b) => a[0] - b[0])
  const keyDir = [1, 1, 0, keys.length]
  for (const [id, v] of keys) keyDir.push(id, 0, 1, v)

  const nodataStr = nodata == null ? null : `${nodata}\0`
  const entries = [
    [256, TIFF_TYPE.LONG, 1, width], // ImageWidth
    [257, TIFF_TYPE.LONG, 1, height], // ImageLength
    [258, TIFF_TYPE.SHORT, 1, 32], // BitsPerSample
    [259, TIFF_TYPE.SHORT, 1, 1], // Compression: nenhuma
    [262, TIFF_TYPE.SHORT, 1, 1], // PhotometricInterpretation
    [273, TIFF_TYPE.LONG, 1, 'PIXELS'], // StripOffsets (resolvido no fim)
    [277, TIFF_TYPE.SHORT, 1, 1], // SamplesPerPixel
    [278, TIFF_TYPE.LONG, 1, height], // RowsPerStrip: uma só strip
    [279, TIFF_TYPE.LONG, 1, width * height * 4], // StripByteCounts
    [339, TIFF_TYPE.SHORT, 1, 3], // SampleFormat: vírgula flutuante IEEE
    // georreferenciação: matriz 4x4 quando é dada (permite rotação), senão
    // o par escala + ponto de amarração dos rasters north-up
    ...(transform
      ? [[34264, TIFF_TYPE.DOUBLE, 16, transform]] // ModelTransformation
      : [
          [33550, TIFF_TYPE.DOUBLE, 3, [scale, scale, 0]], // ModelPixelScale
          [33922, TIFF_TYPE.DOUBLE, 6, [0, 0, 0, originX, originY, 0]], // ModelTiepoint
        ]),
    [34735, TIFF_TYPE.SHORT, keyDir.length, keyDir], // GeoKeyDirectory
  ]
  if (nodataStr) entries.push([42113, TIFF_TYPE.ASCII, nodataStr.length, nodataStr])
  entries.sort((a, b) => a[0] - b[0]) // o TIFF exige as entradas por ordem de tag

  const ifdOffset = 8
  let cursor = ifdOffset + 2 + entries.length * 12 + 4
  const blocks = []
  const offsets = new Map()
  const place = (bytes) => {
    const at = cursor
    blocks.push({ at, bytes })
    cursor += bytes.length
    return at
  }
  // valores que não cabem nos 4 bytes da entrada vão para fora dela
  for (const [tag, type, count, value] of entries) {
    if (type === TIFF_TYPE.DOUBLE) {
      const b = new Uint8Array(count * 8)
      const dv = new DataView(b.buffer)
      value.forEach((v, i) => dv.setFloat64(i * 8, v, true))
      offsets.set(tag, place(b))
    } else if (type === TIFF_TYPE.SHORT && count > 2) {
      const b = new Uint8Array(count * 2)
      const dv = new DataView(b.buffer)
      value.forEach((v, i) => dv.setUint16(i * 2, v, true))
      offsets.set(tag, place(b))
    } else if (type === TIFF_TYPE.ASCII) {
      offsets.set(tag, place(Uint8Array.from([...value], (c) => c.charCodeAt(0))))
    }
  }

  const pixelOffset = cursor + (cursor % 4 ? 4 - (cursor % 4) : 0)
  const out = new Uint8Array(pixelOffset + px.byteLength)
  const dv = new DataView(out.buffer)
  dv.setUint16(0, 0x4949, true) // "II": little-endian
  dv.setUint16(2, 42, true)
  dv.setUint32(4, ifdOffset, true)
  dv.setUint16(ifdOffset, entries.length, true)
  entries.forEach(([tag, type, count, value], i) => {
    const at = ifdOffset + 2 + i * 12
    dv.setUint16(at, tag, true)
    dv.setUint16(at + 2, type, true)
    dv.setUint32(at + 4, count, true)
    if (offsets.has(tag)) dv.setUint32(at + 8, offsets.get(tag), true)
    else if (value === 'PIXELS') dv.setUint32(at + 8, pixelOffset, true)
    else if (type === TIFF_TYPE.SHORT) dv.setUint16(at + 8, value, true)
    else dv.setUint32(at + 8, value, true)
  })
  for (const { at, bytes } of blocks) out.set(bytes, at)
  out.set(new Uint8Array(px.buffer), pixelOffset)
  return new Blob([out])
}
