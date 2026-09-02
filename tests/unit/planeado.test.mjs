/**
 * Ferramenta planeado-vs-medido (tools/): com um voo sintetico gerado a
 * partir do proprio plano, as medicoes tem de reproduzir o planeado; com
 * um voo desviado, o desvio tem de aparecer no relatorio.
 */
import { describe, expect, test } from 'vitest'
import { predictFromProject, compare, renderMarkdown } from '../../tools/lib/planeado.mjs'
import { measurePhotos, parsePhotoCsv, parseExifDate } from '../../tools/lib/fotos.mjs'
import { lasDensity } from '../../tools/lib/las.mjs'
import { measureFlightLog, parseFlightLog } from '../../tools/lib/voo.mjs'
import { writeLas } from '../lib/las.mjs'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const project = () => ({
  version: 2,
  missionName: 'sintetico',
  drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' },
  params: {
    altitude: 80,
    speed: 8,
    frontOverlap: 80,
    sideOverlap: 70,
    angle: 90,
    gimbalPitch: -90,
  },
  ring: [em(0, 0), em(400, 0), em(400, 300), em(0, 300)],
  basePoint: em(-30, -30),
})

/** Fotos sinteticas ao longo das linhas do plano, a cada `intervalM`. */
function syntheticPhotos(pred, { intervalM, aglM, spacingScale = 1 }) {
  const rows = []
  let t = Date.UTC(2026, 8, 15, 10, 0, 0)
  const toXY = ([lon, lat]) => [(lon + 9.14) * mLon, (lat - lat0) * 110574]
  pred.plan.lines.forEach((line, li) => {
    const a = toXY(line[0])
    const b = toXY(line[line.length - 1])
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.floor(len / intervalM)
    for (let k = 0; k <= n; k++) {
      const f = k / Math.max(1, n)
      const x = a[0] + (b[0] - a[0]) * f
      const y = (a[1] + (b[1] - a[1]) * f) * spacingScale
      t += (intervalM / 8) * 1000
      rows.push({
        lat: lat0 + y / 110574,
        lon: -9.14 + x / mLon,
        altRel: aglM,
        time: t,
        gimbalPitch: -90,
        file: `L${li}_${k}`,
      })
    }
  })
  return rows
}

describe('planeado-vs-medido', () => {
  const pred = predictFromProject(project())

  test('o previsto sai do mesmo motor da aplicacao', () => {
    expect(pred.plan).toBeTruthy()
    expect(pred.gsdCm).toBeGreaterThan(0)
    expect(pred.intervalM).toBeGreaterThan(0)
    expect(pred.spacingM).toBeGreaterThan(pred.intervalM)
    expect(pred.batteryMin).toBeGreaterThan(0)
  })

  test('um voo igual ao plano mede as sobreposicoes e o GSD planeados', () => {
    const rows = syntheticPhotos(pred, { intervalM: pred.intervalM, aglM: pred.aglM })
    const m = measurePhotos(rows, { sensor: pred.sensor, ring: pred.ring })
    expect(m.error).toBeUndefined()
    expect(m.lines).toBe(pred.plan.stats.lineCount)
    expect(Math.abs(m.frontOverlapPct - 80)).toBeLessThan(2)
    expect(Math.abs(m.sideOverlapPct - 70)).toBeLessThan(2)
    expect(Math.abs(m.gsdCm - pred.gsdCm)).toBeLessThan(0.01)
    // as fotos dos extremos de cada faixa caem exactamente na fronteira do poligono
    expect(m.count - m.insideRing).toBeLessThanOrEqual(m.lines)
    const table = compare(pred, { photos: m })
    const side = table.find((r) => r.key === 'side')
    expect(Math.abs(side.deviationPct)).toBeLessThan(3)
    expect(renderMarkdown(pred, table, ['teste'])).toContain('| Sobreposicao lateral |')
  })

  test('um voo mais alto e com faixas mais afastadas mostra o desvio', () => {
    const rows = syntheticPhotos(pred, {
      intervalM: pred.intervalM * 1.3,
      aglM: pred.aglM * 1.1,
      spacingScale: 1.2,
    })
    const m = measurePhotos(rows, { sensor: pred.sensor, ring: pred.ring })
    const table = compare(pred, { photos: m })
    const byKey = Object.fromEntries(table.map((r) => [r.key, r]))
    expect(byKey.agl.deviationPct).toBeCloseTo(10, 0)
    expect(byKey.gsd.measured).toBeGreaterThan(pred.gsdCm)
    // intervalo 30 % maior a 10 % mais de altura: sobreposicao frontal cai
    expect(byKey.front.measured).toBeLessThan(78)
    expect(byKey.side.measured).toBeLessThan(69)
  })

  test('CSV do exiftool: numeros, DMS e datas EXIF', () => {
    const csv = [
      'SourceFile,GPSLatitude,GPSLongitude,RelativeAltitude,DateTimeOriginal,FocalLength,ImageWidth,GimbalPitchDegree',
      'a.JPG,38.7,-9.14,+80.10,2026:09:15 10:00:00,12.29,5280,-90.0',
      `b.JPG,"38 deg 42' 0.36"" N","9 deg 8' 24.00"" W",+80.00,2026:09:15 10:00:03,12.29,5280,-90.0`,
    ].join('\n')
    const rows = parsePhotoCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[1].lat).toBeCloseTo(38.7001, 4)
    expect(rows[1].lon).toBeCloseTo(-9.14, 4)
    expect(rows[0].altRel).toBe(80.1)
    expect(rows[1].time - rows[0].time).toBe(3000)
    expect(parseExifDate('2026:09:15 10:00:00.250')).toBe(Date.UTC(2026, 8, 15, 10, 0, 0, 250))
  })

  test('LAS sintetico: densidade dentro da area e por celula', () => {
    const pts = []
    for (let x = 0; x < 200; x += 0.5) for (let y = 0; y < 100; y += 0.25) pts.push([x, y, 50])
    const d = lasDensity(writeLas(pts), {
      ring: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      cellM: 10,
    })
    expect(d.header.version).toBe('1.2')
    expect(d.pointsInside).toBe(200 * 400) // metade dos pontos (x < 100)
    expect(d.densityPerM2).toBeCloseTo(8, 0)
    expect(d.cellDensityMin).toBeCloseTo(8, 0)
    const table = compare({ ...pred, densityPerM2: 10 }, { las: d })
    expect(table.find((r) => r.key === 'density').deviationPct).toBeCloseTo(-20, 0)
  })

  test('registo de voo CSV (Airdata): duracao, velocidade e distancia a base', () => {
    const csv = ['time(millisecond),latitude,longitude,height_above_takeoff(meters),speed(m/s)']
    for (let i = 0; i <= 60; i++)
      csv.push(
        `${i * 1000},${lat0 + (i * 2) / 110574},-9.14,${i < 10 ? i * 8 : 80},${i < 10 ? 0.2 : 8}`,
      )
    const log = measureFlightLog(parseFlightLog(csv.join('\n')), { basePoint: [-9.14, lat0] })
    expect(log.durationS).toBe(60)
    expect(log.meanSpeedMS).toBeCloseTo(8, 5)
    expect(log.maxHeightM).toBe(80)
    expect(log.maxDistM).toBeCloseTo(120, 0)
    const row = compare(pred, { log }).find((r) => r.key === 'logSpeed')
    expect(row.deviationPct).toBeCloseTo(0, 5)
  })
})
