/**
 * Escritor mínimo de shapefile (polígonos, tipo 5) para os ficheiros reais
 * dos testes (M3-T12): .shp, .shx, .dbf e, opcionalmente, .prj, num ZIP como
 * o QGIS exporta. Segue a especificação ESRI de 1998 (cabeçalho de 100
 * bytes, inteiros big-endian no cabeçalho dos registos, little-endian no
 * conteúdo); o leitor da aplicação é o shpjs.
 */
import JSZip from 'jszip'

/** Anel com o sentido horário (o exterior num shapefile). */
function clockwise(ring) {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++)
    a += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
  return a > 0 ? ring : [...ring].reverse()
}

/**
 * @param {Array<{ring: number[][], props: Record<string, string>}>} features anéis fechados [[x, y], ...]
 * @param {string[]} fields nomes dos campos de texto (até 10 caracteres)
 * @param {{date?: Date}} [opts] data do .dbf (fixa nos ficheiros de teste, para serem reprodutíveis)
 */
export function writeShapefile(features, fields = ['nome'], { date = new Date() } = {}) {
  const rings = features.map((f) => clockwise(f.ring))
  const bbox = [Infinity, Infinity, -Infinity, -Infinity]
  for (const r of rings)
    for (const [x, y] of r) {
      bbox[0] = Math.min(bbox[0], x)
      bbox[1] = Math.min(bbox[1], y)
      bbox[2] = Math.max(bbox[2], x)
      bbox[3] = Math.max(bbox[3], y)
    }
  const records = rings.map((r) => {
    const n = r.length
    const len = 4 + 32 + 4 + 4 + 4 + 16 * n // tipo, bbox, numParts, numPoints, parts[1], pontos
    const b = Buffer.alloc(len)
    let o = 0
    b.writeInt32LE(5, o)
    o += 4
    const rb = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of r) {
      rb[0] = Math.min(rb[0], x)
      rb[1] = Math.min(rb[1], y)
      rb[2] = Math.max(rb[2], x)
      rb[3] = Math.max(rb[3], y)
    }
    for (const v of rb) {
      b.writeDoubleLE(v, o)
      o += 8
    }
    b.writeInt32LE(1, o)
    o += 4
    b.writeInt32LE(n, o)
    o += 4
    b.writeInt32LE(0, o)
    o += 4
    for (const [x, y] of r) {
      b.writeDoubleLE(x, o)
      b.writeDoubleLE(y, o + 8)
      o += 16
    }
    return b
  })
  const header = (lengthWords) => {
    const h = Buffer.alloc(100)
    h.writeInt32BE(9994, 0)
    h.writeInt32BE(lengthWords, 24)
    h.writeInt32LE(1000, 28)
    h.writeInt32LE(5, 32)
    bbox.forEach((v, i) => h.writeDoubleLE(v, 36 + 8 * i))
    return h
  }
  // .shp
  const shpParts = []
  const shxParts = []
  let offsetWords = 50
  records.forEach((rec, i) => {
    const rh = Buffer.alloc(8)
    rh.writeInt32BE(i + 1, 0)
    rh.writeInt32BE(rec.length / 2, 4)
    shpParts.push(rh, rec)
    const ix = Buffer.alloc(8)
    ix.writeInt32BE(offsetWords, 0)
    ix.writeInt32BE(rec.length / 2, 4)
    shxParts.push(ix)
    offsetWords += 4 + rec.length / 2
  })
  const shp = Buffer.concat([header(offsetWords), ...shpParts])
  const shx = Buffer.concat([header(50 + 4 * records.length), ...shxParts])
  // .dbf (dBASE III: campos de texto de 32 caracteres)
  const FIELD_LEN = 32
  const headerLen = 32 + 32 * fields.length + 1
  const recordLen = 1 + FIELD_LEN * fields.length
  const dbfHeader = Buffer.alloc(headerLen)
  dbfHeader[0] = 0x03
  dbfHeader[1] = date.getUTCFullYear() - 1900
  dbfHeader[2] = date.getUTCMonth() + 1
  dbfHeader[3] = date.getUTCDate()
  dbfHeader.writeInt32LE(features.length, 4)
  dbfHeader.writeInt16LE(headerLen, 8)
  dbfHeader.writeInt16LE(recordLen, 10)
  fields.forEach((name, i) => {
    const d = Buffer.alloc(32)
    d.write(name.slice(0, 10), 0, 'ascii')
    d.write('C', 11, 'ascii')
    d[16] = FIELD_LEN
    d[17] = 0
    d.copy(dbfHeader, 32 + 32 * i)
  })
  dbfHeader[headerLen - 1] = 0x0d
  const dbfRecords = features.map((f) => {
    const r = Buffer.alloc(recordLen, 0x20)
    fields.forEach((name, i) => {
      r.write(String(f.props?.[name] ?? '').slice(0, FIELD_LEN), 1 + FIELD_LEN * i, 'latin1')
    })
    return r
  })
  const dbf = Buffer.concat([dbfHeader, ...dbfRecords, Buffer.from([0x1a])])
  return { shp, shx, dbf }
}

/** O WKT (ESRI) do PT-TM06 / EPSG:3763, como o QGIS o escreve no .prj. */
export const PRJ_PT_TM06 =
  'PROJCS["ETRS_1989_Portugal_TM06",GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-8.133108333333334],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",39.66825833333333],UNIT["Meter",1.0]]'

/**
 * O ZIP de um shapefile (como «Exportar → Guardar como ESRI Shapefile» e um
 * zip da pasta): `stem.shp`, `.shx`, `.dbf` e, com `prj`, `.prj`.
 * @returns {Promise<Buffer>}
 */
export async function shapefileZip(
  stem,
  features,
  { prj = null, fields = ['nome'], date = new Date() } = {},
) {
  const { shp, shx, dbf } = writeShapefile(features, fields, { date })
  const zip = new JSZip()
  zip.file(`${stem}.shp`, shp, { date })
  zip.file(`${stem}.shx`, shx, { date })
  zip.file(`${stem}.dbf`, dbf, { date })
  if (prj) zip.file(`${stem}.prj`, prj, { date })
  return zip.generateAsync({ type: 'nodebuffer' })
}
