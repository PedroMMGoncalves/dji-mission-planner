#!/usr/bin/env node
/**
 * Planeado vs medido: compara o que o planeador previu (ficheiro de
 * projecto) com o que o voo produziu — fotos (EXIF/XMP ou CSV do
 * exiftool), nuvem LAS e registo de voo — e escreve um relatorio.
 *
 *   node tools/planeado-vs-medido.mjs --projecto missao-projeto.json \
 *     [--fotos pasta-ou-csv] [--las nuvem.las --crs EPSG:3763] \
 *     [--log voo.csv] [--md relatorio.md] [--json relatorio.json]
 *
 * CSV das fotos: exiftool -csv -n -GPSLatitude -GPSLongitude -GPSAltitude \
 *   -RelativeAltitude -DateTimeOriginal -SubSecTimeOriginal -FocalLength \
 *   -ImageWidth -GimbalPitchDegree pasta/*.JPG > fotos.csv
 * O LAS tem de estar em metros; --crs aceita um codigo de CRS_OPTIONS
 * (EPSG:3763, EPSG:25829, EPSG:32629, ...) ou uma definicao proj4.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import proj4 from 'proj4'
import { CRS_OPTIONS } from '../src/utils/importArea.js'
import { measurePhotos, parsePhotoCsv, readPhotosFromDir } from './lib/fotos.mjs'
import { lasDensity } from './lib/las.mjs'
import { measureFlightLog, parseFlightLog } from './lib/voo.mjs'
import { compare, predictFromProject, renderMarkdown } from './lib/planeado.mjs'

function args(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      o[k] = v
    }
  }
  return o
}

const a = args(process.argv.slice(2))
if (!a.projecto || a.help) {
  console.error(
    'uso: planeado-vs-medido --projecto p.json [--fotos dir|csv] [--las f.las --crs EPSG:3763] [--log voo.csv] [--md out.md] [--json out.json]',
  )
  process.exit(a.help ? 0 : 2)
}

const pred = predictFromProject(JSON.parse(await readFile(a.projecto, 'utf8')))
const sources = [`projecto ${a.projecto}`]
let photos = null
if (a.fotos) {
  const s = await stat(a.fotos)
  const rows = s.isDirectory()
    ? await readPhotosFromDir(a.fotos)
    : parsePhotoCsv(await readFile(a.fotos, 'utf8'))
  photos = measurePhotos(rows, { sensor: pred.sensor, ring: pred.ring })
  sources.push(`${rows.length} fotos de ${a.fotos}`)
}
let las = null
if (a.las) {
  let ringLas = null
  if (pred.ring) {
    const crs = a.crs ? (CRS_OPTIONS.find((c) => c.code === a.crs)?.def ?? a.crs) : null
    if (!crs) {
      console.error(
        '--las precisa de --crs (codigo EPSG de CRS_OPTIONS ou definicao proj4) para projectar a area',
      )
      process.exit(2)
    }
    ringLas = pred.ring.map(([lon, lat]) => proj4(proj4.WGS84, crs, [lon, lat]))
  }
  las = lasDensity(await readFile(a.las), { ring: ringLas })
  sources.push(`LAS ${a.las} (${las.header.count} pontos, ${las.pointsInside} dentro da area)`)
}
let log = null
if (a.log) {
  log = measureFlightLog(parseFlightLog(await readFile(a.log, 'utf8')), {
    basePoint: pred.basePoint,
  })
  sources.push(`registo de voo ${a.log}`)
}
const rows = compare(pred, { photos, las, log })
const md = renderMarkdown(pred, rows, sources)
if (a.md) await writeFile(a.md, md + '\n')
if (a.json)
  await writeFile(
    a.json,
    JSON.stringify(
      {
        predicted: { ...pred, plan: undefined, sensor: pred.sensor },
        photos,
        las: las && { ...las, header: las.header },
        log,
        rows,
      },
      null,
      2,
    ),
  )
if (!a.md || a.print) console.log(md)
