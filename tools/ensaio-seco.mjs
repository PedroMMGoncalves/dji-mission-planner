#!/usr/bin/env node
/**
 * Ensaio a seco da cadeia de validacao: para R1 (camara) e L1 (LiDAR)
 * gera um voo sintetico a partir do proprio plano - fotos ao longo das
 * faixas ao intervalo previsto, nuvem LAS com densidade conhecida em
 * PT-TM06, registo de voo - corre a medicao (planeado-vs-medido) e a
 * avaliacao (relatorio-validacao) e escreve docs/validacao/ensaio-seco.md.
 * Nao e validacao: prova que a cadeia funciona e que um plano voado como
 * previsto passa nos criterios. Sai com 1 se nao passar.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import proj4 from 'proj4'
import { predictFromProject } from './lib/planeado.mjs'
import { writeLas } from '../tests/lib/las.mjs'
import { CRS_OPTIONS } from '../src/utils/importArea.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = mkdtempSync(join(tmpdir(), 'ensaio-seco-'))
const missoes = join(root, 'docs/validacao/missoes')

/** Fotos ao longo das faixas, ao intervalo planeado, altura relativa nominal. */
function fotos(pred, intervalM) {
  const lat0 = pred.ring[0][1]
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const rows = [
    'SourceFile,GPSLatitude,GPSLongitude,RelativeAltitude,DateTimeOriginal,GimbalPitchDegree',
  ]
  let t = 0
  pred.plan.lines.forEach((line, li) => {
    const a = line[0]
    const b = line[line.length - 1]
    const len = Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * 110574)
    const n = Math.max(1, Math.floor(len / intervalM))
    for (let k = 0; k <= n; k++) {
      const f = k / n
      const lon = a[0] + (b[0] - a[0]) * f
      const lat = a[1] + (b[1] - a[1]) * f
      const hh = String(Math.floor(t / 3600)).padStart(2, '0')
      const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
      const ss = String(Math.floor(t % 60)).padStart(2, '0')
      rows.push(
        `L${li}_${k}.JPG,${lat.toFixed(7)},${lon.toFixed(7)},+${pred.aglM.toFixed(1)},2026:09:15 ${hh}:${mm}:${ss},${pred.params.gimbalPitch}`,
      )
      t += intervalM / pred.speed
    }
    t += 3
  })
  return rows.join('\n')
}

/** Registo de voo: uma amostra por segundo ao longo da rota, a velocidade nominal. */
function registo(pred) {
  const rows = ['time(millisecond),latitude,longitude,height_above_takeoff(meters),speed(m/s)']
  const lat0 = pred.ring[0][1]
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const wps = pred.plan.waypoints
  let t = 0
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1]
    const b = wps[i]
    const len = Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * 110574)
    const n = Math.max(1, Math.round(len / pred.speed))
    for (let k = 0; k < n; k++) {
      const f = k / n
      rows.push(
        `${(t += 1000)},${a[1] + (b[1] - a[1]) * f},${a[0] + (b[0] - a[0]) * f},${pred.aglM},${pred.speed}`,
      )
    }
  }
  return rows.join('\n')
}

/** Nuvem LAS em PT-TM06 a cobrir a area com a densidade prevista. */
function nuvem(pred) {
  const def = CRS_OPTIONS.find((c) => c.code === 'EPSG:3763').def
  const ringP = pred.ring.map(([lon, lat]) => proj4(proj4.WGS84, def, [lon, lat]))
  const xs = ringP.map((p) => p[0])
  const ys = ringP.map((p) => p[1])
  const step = 1 / Math.sqrt(pred.densityPerM2)
  const pts = []
  for (let x = Math.min(...xs) - 5; x < Math.max(...xs) + 5; x += step)
    for (let y = Math.min(...ys) - 5; y < Math.max(...ys) + 5; y += step) pts.push([x, y, 200])
  return writeLas(pts)
}

const run = (args) =>
  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).toString()
const relatorios = []
for (const nome of ['R1-rectangulo-nadir', 'L1-lidar-mapper']) {
  const projecto = join(missoes, `${nome}.json`)
  const pred = predictFromProject(JSON.parse(readFileSync(projecto, 'utf8')))
  const args = [
    'tools/planeado-vs-medido.mjs',
    '--projecto',
    projecto,
    '--json',
    join(dir, `${nome}.json`),
    '--md',
    join(dir, `${nome}.md`),
  ]
  if (pred.intervalM) {
    writeFileSync(join(dir, `${nome}-fotos.csv`), fotos(pred, pred.intervalM))
    args.push('--fotos', join(dir, `${nome}-fotos.csv`))
  }
  writeFileSync(join(dir, `${nome}-voo.csv`), registo(pred))
  args.push('--log', join(dir, `${nome}-voo.csv`))
  if (pred.densityPerM2) {
    writeFileSync(join(dir, `${nome}.las`), nuvem(pred))
    args.push('--las', join(dir, `${nome}.las`), '--crs', 'EPSG:3763')
  }
  run(args)
  relatorios.push(`${nome.split('-')[0]}=${join(dir, `${nome}.json`)}`)
}
let code = 0
try {
  run([
    'tools/relatorio-validacao.mjs',
    '--saida',
    join(root, 'docs/validacao/ensaio-seco.md'),
    '--titulo',
    'Ensaio a seco da cadeia de validacao (dados sinteticos)',
    '--nota',
    'DADOS SINTETICOS gerados por tools/ensaio-seco.mjs a partir do proprio plano: prova que a medicao, a avaliacao e o relatorio funcionam, nao que a aeronave voa como previsto. Os resultados reais entram em docs/validacao/RELATORIO.md com os voos de Setembro de 2026.',
    ...relatorios,
  ])
} catch (err) {
  code = err.status ?? 1
}
console.log(readFileSync(join(root, 'docs/validacao/ensaio-seco.md'), 'utf8'))
process.exit(code)
