/*
 * KML «Bases e blocos» depois da revisao da exportacao
 * (docs/REVISAO-EXPORTACAO-2026-10.md): contornos exactos dos blocos de
 * faixas (K-E2), rotulo dentro do contorno (K-M6) e buracos das celulas
 * (K-M7). As pastas por base, a ligacao de navegacao e a pasta sem-base
 * estao em voos-exportacao.test.mjs.
 */
import * as turf from '@turf/turf'
import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, test } from 'vitest'
import { planArea } from '../../src/mission/areaPlan.js'
import { blockOutline, blockOutlines, buildBasesKML } from '../../src/mission/basesKml.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { childNamed, findAll, textOf } from '../../src/utils/xml.js'

const lat = 38.7
const mLon = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat + y / 110574]
const ha = (f) => (f ? turf.area(f) / 1e4 : 0)
const poly = (p) => turf.polygon([p.ring, ...p.holes])
const closed = (ring) => [...ring, ring[0]]
const opts = {
  spacingM: 50,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 10,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
}
const rect = [em(0, 0), em(1200, 0), em(1200, 800), em(0, 800)]
// um U: o rectangulo sem o rebaixo [400, 800] x [300, 800]
const U = [
  em(0, 0),
  em(1200, 0),
  em(1200, 800),
  em(800, 800),
  em(800, 300),
  em(400, 300),
  em(400, 800),
  em(0, 800),
]

/** Blocos do corte por faixas (split «area») de uma area com as linhas a angleDeg. */
function stripBlocks(ring, angleDeg) {
  const plan = planArea(ring, null, { ...opts, angleDeg })
  const blocks = planBlocks(plan, {
    split: { mode: 'area', maxAreaHa: 16 },
    spacingM: 50,
    speed: 10,
  })
  expect(blocks.length).toBeGreaterThanOrEqual(5)
  return blocks
}

/** Cobertura, sobreposicao e parte fora da area das pecas, em ha. */
function medir(polys, ring) {
  const area = turf.polygon([closed(ring)])
  const union = polys.length > 1 ? turf.union(turf.featureCollection(polys)) : polys[0]
  let outside = 0
  for (const p of polys) outside += ha(turf.difference(turf.featureCollection([p, area])))
  let overlap = 0
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++)
      overlap += ha(turf.intersect(turf.featureCollection([polys[i], polys[j]])))
  return { area: ha(area), union: ha(union), outside, overlap }
}

describe('K-E2: contornos dos blocos de faixas = area ∩ faixa das linhas', () => {
  for (const angleDeg of [0, 90]) {
    test(`rectangulo, linhas a ${angleDeg}°: uma peca por bloco, a area toda, sem sobreposicoes`, () => {
      const blocks = stripBlocks(rect, angleDeg)
      const pieces = blocks.map((b) => blockOutlines(b, { spacingM: 50, area: { ring: rect } }))
      for (const p of pieces) expect(p).toHaveLength(1)
      const m = medir(pieces.flat().map(poly), rect)
      expect(m.area).toBeCloseTo(96.4, 0)
      expect(m.union / m.area).toBeGreaterThan(0.97)
      expect(m.outside / m.area).toBeLessThan(0.001)
      // a folga de 1 % do espacamento entre faixas vizinhas
      expect(m.overlap / m.area).toBeLessThan(0.03)
      // antes: o involucro convexo da rota deixava ~1/3 da area fora
      const hull = medir(blocks.flatMap((b) => blockOutlines(b)).map(poly), rect)
      expect(hull.union / hull.area).toBeLessThan(0.7)
    })
  }

  test('U, linhas E-O: um bloco com segmentos nos dois bracos da duas pecas, tudo dentro da area', () => {
    const blocks = stripBlocks(U, 90)
    const pieces = blocks.map((b) => blockOutlines(b, { spacingM: 50, area: { ring: U } }))
    expect(pieces.some((p) => p.length === 2)).toBe(true)
    expect(pieces.every((p) => p.length >= 1 && p.length <= 2)).toBe(true)
    // a maior peca vem primeiro (leva o rotulo)
    for (const p of pieces.filter((p) => p.length === 2))
      expect(ha(poly(p[0]))).toBeGreaterThanOrEqual(ha(poly(p[1])))
    const m = medir(pieces.flat().map(poly), U)
    expect(m.area).toBeCloseTo(76.3, 0)
    expect(m.union / m.area).toBeGreaterThan(0.95)
    expect(m.outside / m.area).toBeLessThan(0.001)
    expect(m.overlap / m.area).toBeLessThan(0.03)
    // o involucro cobria o rebaixo, que nao e area
    const hull = medir(blocks.flatMap((b) => blockOutlines(b)).map(poly), U)
    expect(hull.outside / hull.area).toBeGreaterThan(0.05)
  })

  test('a area com buraco recorta o contorno; sem espacamento ou sem linhas fica o involucro', () => {
    const blocks = stripBlocks(rect, 90)
    const hole = [em(500, 300), em(700, 300), em(700, 500), em(500, 500)]
    const comBuraco = blocks.map((b) =>
      blockOutlines(b, { spacingM: 50, area: { ring: rect, holes: [hole] } }),
    )
    const m = medir(comBuraco.flat().map(poly), rect)
    // 4 ha do buraco a menos
    expect(m.union).toBeLessThan(96.4 - 3.5)
    const holeF = turf.polygon([closed(hole)])
    for (const p of comBuraco.flat())
      expect(ha(turf.intersect(turf.featureCollection([poly(p), holeF])))).toBeLessThan(0.01)
    expect(blockOutlines(blocks[0])).toEqual([{ ring: blockOutline(blocks[0]), holes: [] }])
    expect(blockOutlines({ ...blocks[0], lines: [] }, { spacingM: 50 })).toEqual([
      { ring: blockOutline(blocks[0]), holes: [] },
    ])
    expect(blockOutlines({ waypoints: [em(0, 0)] }, { spacingM: 50 })).toEqual([])
  })

  test('no KML cada peca e um Placemark do bloco e so a maior leva o ponto do rotulo', () => {
    const blocks = stripBlocks(U, 90)
    const kml = buildBasesKML({
      name: 'u',
      sheets: [],
      blocks,
      layout: { byBlock: {} },
      spacingM: 50,
      area: { ring: U },
    })
    const doc = new DOMParser().parseFromString(kml, 'application/xml')
    const pms = findAll(doc.documentElement, 'Placemark')
    const nPieces = blocks
      .map((b) => blockOutlines(b, { spacingM: 50, area: { ring: U } }).length)
      .reduce((s, n) => s + n, 0)
    expect(nPieces).toBeGreaterThan(blocks.length)
    expect(pms).toHaveLength(nPieces)
    expect(pms.filter((p) => findAll(p, 'Point').length > 0)).toHaveLength(blocks.length)
    expect(pms.filter((p) => findAll(p, 'Polygon').length > 0)).toHaveLength(nPieces)
    const folders = findAll(doc.documentElement, 'Folder').map((f) => textOf(childNamed(f, 'name')))
    expect(folders).toEqual(['Blocos sem base'])
  })
})

describe('K-M6 e K-M7: rotulo dentro de uma celula concava e buracos da celula', () => {
  const kmlOf = (block) =>
    new DOMParser().parseFromString(
      buildBasesKML({ name: 'c', sheets: [], blocks: [block], layout: { byBlock: {} } }),
      'application/xml',
    )
  const coordsOf = (el) =>
    textOf(findAll(el, 'coordinates')[0])
      .trim()
      .split(/\s+/)
      .map((c) => c.split(',').slice(0, 2).map(Number))

  test('o ponto do rotulo fica dentro do U (a media dos vertices cai no rebaixo)', () => {
    const doc = kmlOf({ id: 1, cellRing: U, waypoints: U })
    const pm = findAll(doc.documentElement, 'Placemark')[0]
    const point = coordsOf(findAll(pm, 'Point')[0])[0]
    const uF = turf.polygon([closed(U)])
    expect(turf.booleanPointInPolygon(turf.point(point), uF)).toBe(true)
    const media = [
      U.reduce((s, p) => s + p[0], 0) / U.length,
      U.reduce((s, p) => s + p[1], 0) / U.length,
    ]
    expect(turf.booleanPointInPolygon(turf.point(media), uF)).toBe(false)
  })

  test('os buracos da celula vao em innerBoundaryIs, fechados', () => {
    const hole = [em(500, 300), em(700, 300), em(700, 500), em(500, 500)]
    expect(blockOutlines({ cellRing: rect, cellHoles: [hole], waypoints: rect })).toEqual([
      { ring: closed(rect), holes: [closed(hole)] },
    ])
    const doc = kmlOf({ id: 1, cellRing: rect, cellHoles: [hole], waypoints: rect })
    const polygon = findAll(doc.documentElement, 'Polygon')[0]
    expect(findAll(polygon, 'outerBoundaryIs')).toHaveLength(1)
    const inner = findAll(polygon, 'innerBoundaryIs')
    expect(inner).toHaveLength(1)
    expect(coordsOf(inner[0])).toHaveLength(5)
    // um buraco degenerado fica de fora
    expect(
      blockOutlines({ cellRing: rect, cellHoles: [[em(1, 1)]], waypoints: rect })[0].holes,
    ).toEqual([])
  })
})
