/**
 * Prepara o GeoJSON dos municípios (derivado da CAOP) para uso na app:
 * simplifica a geometria, reduz a precisão das coordenadas e calcula o
 * ponto de etiqueta de cada município. Corre uma vez:
 *   node prepare-caop.mjs <infile> <outfile>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import * as turf from '@turf/turf'

const [, , inFile, outFile] = process.argv
const raw = JSON.parse(readFileSync(inFile, 'utf8'))
console.log('features:', raw.features.length)
console.log('props exemplo:', JSON.stringify(raw.features[0].properties))

const round = (n) => Math.round(n * 1e4) / 1e4 // ~11 m — suficiente para 1:100k

// "VILA NOVA DE GAIA" → "Vila Nova de Gaia"
const MINOR = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o'])
function titleCasePt(s) {
  return s
    .toLocaleLowerCase('pt')
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt') + w.slice(1)))
    .join(' ')
}

const out = { type: 'FeatureCollection', features: [] }
for (const f of raw.features) {
  const p = f.properties
  const name =
    p.Concelho ||
    p.concelho ||
    p.CONCELHO ||
    p.NAME_2 ||
    p.name ||
    p.Municipio ||
    p.municipio ||
    p.MUNICIPIO ||
    p.des_simpli ||
    p.Des_Simpli ||
    'sem nome'
  let simplified
  try {
    simplified = turf.simplify(f, { tolerance: 0.002, highQuality: false, mutate: false })
  } catch {
    simplified = f
  }
  const geom = simplified.geometry
  const roundCoords = (c) => (Array.isArray(c[0]) ? c.map(roundCoords) : [round(c[0]), round(c[1])])
  geom.coordinates = roundCoords(geom.coordinates)
  let label
  try {
    label = turf.pointOnFeature(simplified).geometry.coordinates.map(round)
  } catch {
    label = turf.centroid(simplified).geometry.coordinates.map(round)
  }
  out.features.push({
    type: 'Feature',
    properties: { n: titleCasePt(name), lp: label },
    geometry: geom,
  })
}

writeFileSync(outFile, JSON.stringify(out))
console.log('out features:', out.features.length)
console.log('out size:', JSON.stringify(out).length, 'bytes')
