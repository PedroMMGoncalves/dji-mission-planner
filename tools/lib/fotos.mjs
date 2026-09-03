/**
 * Fotos de um voo real: leitura dos metadados (CSV do exiftool ou EXIF/XMP
 * dos JPEG) e medição do que o plano previu — intervalo entre fotos,
 * espaçamento entre faixas, sobreposições, altura AGL, GSD, fotos dentro
 * da área e duração. Puro; a única E/S está em readPhotosFromDir.
 */
import { computeFootprint, computeGSD } from '../../src/utils/geo.js'
import { pointInRing } from './las.mjs'

const num = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  // "38 deg 42' 0.00\" N" (exiftool sem -n) ou "+100.20" (XMP DJI)
  const dms = s.match(
    /^(-?\d+(?:\.\d+)?)\s*deg\s*(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)"?\s*([NSEW])?$/i,
  )
  if (dms) {
    const sign = /[SW]/i.test(dms[4] ?? '') ? -1 : 1
    return sign * (Number(dms[1]) + Number(dms[2]) / 60 + Number(dms[3]) / 3600)
  }
  const n = Number(s.replace(/[^0-9eE+.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** "2026:09:15 10:22:33" (+ subsegundos opcionais) → ms desde a época; null se ilegível. */
export function parseExifDate(v, subsec) {
  if (v instanceof Date) return v.getTime()
  if (!v) return null
  const m = String(v).match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/)
  if (!m) return null
  const ms = m[7] ? Number(`0.${m[7]}`) * 1000 : subsec != null ? Number(`0.${subsec}`) * 1000 : 0
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + ms
}

const pick = (row, ...names) => {
  for (const n of names) {
    const k = Object.keys(row).find(
      (key) => key.replace(/^.*:/, '').toLowerCase() === n.toLowerCase(),
    )
    if (k != null && row[k] !== '' && row[k] != null) return row[k]
  }
  return null
}

/** Uma linha de metadados (de qualquer fonte) → registo normalizado. */
export function normalizePhoto(row) {
  return {
    file: pick(row, 'SourceFile', 'FileName', 'file') ?? '',
    lat: num(pick(row, 'GPSLatitude', 'latitude', 'lat')),
    lon: num(pick(row, 'GPSLongitude', 'longitude', 'lon')),
    altGps: num(pick(row, 'GPSAltitude', 'altitude')),
    altRel: num(pick(row, 'RelativeAltitude', 'RelativeAltitudeM', 'altRel')),
    time: parseExifDate(
      pick(row, 'DateTimeOriginal', 'CreateDate', 'time'),
      pick(row, 'SubSecTimeOriginal'),
    ),
    focalMm: num(pick(row, 'FocalLength', 'focal')),
    imageWidth: num(pick(row, 'ImageWidth', 'ExifImageWidth', 'width')),
    gimbalPitch: num(pick(row, 'GimbalPitchDegree', 'GimbalPitch', 'pitch')),
    // XMP drone-dji:ImageSource (WideCamera, InfraredCamera, ZoomCamera...);
    // null when the file does not say
    source: pick(row, 'ImageSource', 'source') ?? null,
  }
}

/**
 * Aeronaves com varias camaras (M4T) escrevem um ficheiro por lente com as
 * mesmas coordenadas e o mesmo instante; medidos juntos, duplicam as fotos
 * e reduzem o intervalo a metade. Quando ha mais do que uma origem, fica so
 * a preferida (o `imageSource` do payload planeado) ou, sem preferencia, a
 * mais numerosa. Devolve as fotos retidas, as origens vistas e quantas
 * foram postas de parte.
 */
export function selectPhotoSource(rows, preferred = null) {
  const bySource = new Map()
  for (const r of rows) {
    const k = r.source ?? ''
    bySource.set(k, (bySource.get(k) ?? 0) + 1)
  }
  const sources = [...bySource.keys()].filter((k) => k !== '')
  if (sources.length <= 1) return { rows, sources, kept: sources[0] ?? null, dropped: 0 }
  const kept =
    preferred && bySource.has(preferred)
      ? preferred
      : sources.reduce((a, b) => (bySource.get(b) > bySource.get(a) ? b : a))
  const out = rows.filter((r) => (r.source ?? '') === kept)
  return { rows: out, sources, kept, dropped: rows.length - out.length }
}

/** CSV do exiftool (`exiftool -csv -n ...`) → registos com coordenadas. */
export function parsePhotoCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []
  const split = (l) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (ch === '"') {
        if (q && l[i + 1] === '"') {
          cur += '"' // aspa dobrada dentro de um campo entre aspas
          i++
        } else q = !q
      } else if (ch === ',' && !q) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const header = split(lines[0])
  return lines
    .slice(1)
    .map((l) => {
      const cells = split(l)
      const row = {}
      header.forEach((h, i) => (row[h] = cells[i] ?? ''))
      return normalizePhoto(row)
    })
    .filter((p) => p.lat != null && p.lon != null)
}

/** JPEG de uma pasta → registos via exifr (EXIF + XMP DJI). */
export async function readPhotosFromDir(dir) {
  const { readdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const exifr = (await import('exifr')).default
  const files = (await readdir(dir)).filter((f) => /\.jpe?g$/i.test(f)).sort()
  const out = []
  for (const f of files) {
    const tags = await exifr
      .parse(join(dir, f), { gps: true, xmp: true, tiff: true, exif: true })
      .catch(() => null)
    if (!tags) continue
    out.push(
      normalizePhoto({
        SourceFile: f,
        GPSLatitude: tags.latitude,
        GPSLongitude: tags.longitude,
        GPSAltitude: tags.GPSAltitude,
        RelativeAltitude: tags.RelativeAltitude ?? tags['drone-dji:RelativeAltitude'],
        DateTimeOriginal: tags.DateTimeOriginal,
        SubSecTimeOriginal: tags.SubSecTimeOriginal,
        FocalLength: tags.FocalLength,
        ExifImageWidth: tags.ExifImageWidth ?? tags.ImageWidth,
        GimbalPitchDegree: tags.GimbalPitchDegree ?? tags['drone-dji:GimbalPitchDegree'],
        ImageSource: tags.ImageSource ?? tags['drone-dji:ImageSource'],
      }),
    )
  }
  return out.filter((p) => p.lat != null && p.lon != null)
}

const median = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Referencial métrico local (equirectangular) em torno da latitude média. */
function localFrame(rows) {
  const lat0 = rows.reduce((s, r) => s + r.lat, 0) / rows.length
  const mLat = 110574
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  return (r) => [r.lon * mLon, r.lat * mLat]
}

/** Direcção principal (PCA 2D) e centróide de um conjunto de pontos. */
function axisOf(pts) {
  const n = pts.length
  const cx = pts.reduce((s, p) => s + p[0], 0) / n
  const cy = pts.reduce((s, p) => s + p[1], 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const [x, y] of pts) {
    sxx += (x - cx) ** 2
    sxy += (x - cx) * (y - cy)
    syy += (y - cy) ** 2
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { c: [cx, cy], dir: [Math.cos(theta), Math.sin(theta)] }
}

/**
 * Mede o voo a partir das fotos. `sensor` é o do plano (resolveSensor);
 * `ring` (opcional) conta as fotos dentro da área; `breakFactor` separa as
 * faixas quando o salto entre fotos consecutivas excede esse múltiplo do
 * intervalo mediano.
 */
export function measurePhotos(rows, { sensor, ring = null, breakFactor = 2.5 } = {}) {
  const photos = rows
    .filter((r) => r.lat != null && r.lon != null)
    .slice()
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || String(a.file).localeCompare(String(b.file)))
  if (photos.length < 2)
    return { count: photos.length, error: 'menos de duas fotos com coordenadas' }
  const toXY = localFrame(photos)
  const xy = photos.map(toXY)
  const steps = []
  for (let i = 1; i < xy.length; i++)
    steps.push(Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]))
  const stepMed = median(steps)
  // Faixas: um passo e "ao longo da faixa" quando segue o eixo dominante
  // (media circular dos rumos dobrados, invariante ao sentido) dentro de
  // 30 graus e nao excede breakFactor x o passo mediano; qualquer outro
  // passo e uma ligacao e abre uma faixa nova. So o comprimento nao chega:
  // com 80/70 % de sobreposicao a ligacao mede so 2 x o intervalo.
  const vec = []
  for (let i = 1; i < xy.length; i++) vec.push([xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]])
  let sx = 0
  let sy = 0
  for (const [dx, dy] of vec) {
    const a = Math.atan2(dy, dx)
    sx += Math.cos(2 * a)
    sy += Math.sin(2 * a)
  }
  const axis = 0.5 * Math.atan2(sy, sx)
  const along = (dx, dy) => {
    let d = Math.abs(Math.atan2(dy, dx) - axis) % Math.PI
    if (d > Math.PI / 2) d = Math.PI - d
    return d < Math.PI / 6
  }
  const lines = [[0]]
  for (let i = 1; i < xy.length; i++) {
    const [dx, dy] = vec[i - 1]
    if (steps[i - 1] > breakFactor * stepMed || !along(dx, dy)) lines.push([i])
    else lines[lines.length - 1].push(i)
  }
  const inLineSteps = []
  lines.forEach((idx) => {
    for (let k = 1; k < idx.length; k++) inLineSteps.push(steps[idx[k] - 1])
  })
  const intervalM = median(inLineSteps)
  const strips = lines.filter((idx) => idx.length >= 3).map((idx) => axisOf(idx.map((i) => xy[i])))
  const spacings = []
  for (let i = 1; i < strips.length; i++) {
    const a = strips[i - 1]
    const b = strips[i]
    const nx = -a.dir[1]
    const ny = a.dir[0]
    spacings.push(Math.abs((b.c[0] - a.c[0]) * nx + (b.c[1] - a.c[1]) * ny))
  }
  const spacingM = median(spacings)
  const aglM = median(photos.map((p) => p.altRel))
  const pitch = median(photos.map((p) => p.gimbalPitch)) ?? -90
  const fp = sensor && aglM != null ? computeFootprint(sensor, aglM) : null
  const frontOverlapPct = fp?.along && intervalM != null ? 100 * (1 - intervalM / fp.along) : null
  const sideOverlapPct = fp?.across && spacingM != null ? 100 * (1 - spacingM / fp.across) : null
  const gsdCm = sensor && aglM != null ? computeGSD(sensor, aglM, pitch) : null
  const inside = ring ? photos.filter((p) => pointInRing(p.lon, p.lat, ring)).length : null
  const times = photos.map((p) => p.time).filter((t) => t != null)
  const durationS = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 1000 : null
  return {
    count: photos.length,
    lines: lines.length,
    intervalM,
    spacingM,
    aglM,
    gimbalPitch: pitch,
    frontOverlapPct,
    sideOverlapPct,
    gsdCm,
    insideRing: inside,
    durationS,
    focalMm: median(photos.map((p) => p.focalMm)),
    imageWidth: median(photos.map((p) => p.imageWidth)),
  }
}
