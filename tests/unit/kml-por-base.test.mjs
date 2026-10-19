/*
 * KML por base (seccao 7 da revisao da exportacao,
 * docs/REVISAO-EXPORTACAO-2026-10.md): um ZIP com uma pasta por base, um
 * KML por bloco so com o poligono (o que o Pilot 2 aceita para a missao de
 * mapeamento) e mapa/ com a base, a zona e os blocos dela.
 */
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, test } from 'vitest'
import { planArea } from '../../src/mission/areaPlan.js'
import { computeZones, layoutBlocks, summarizeBases } from '../../src/mission/baseLayout.js'
import { blockOutlines } from '../../src/mission/basesKml.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { blocksKmlByBase } from '../../src/mission/blocksKml.js'
import { baseFieldSheets } from '../../src/mission/fieldSheet.js'
import { flightFiles } from '../../src/mission/flightFiles.js'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import { buildFilesZip } from '../../src/utils/exporters.js'
import { parseAreaFile } from '../../src/utils/importArea.js'
import { childNamed, findAll, textOf } from '../../src/utils/xml.js'

// o leitor de KML usa o DOMParser do browser; em Node vem do xmldom, calado
globalThis.DOMParser = class extends DOMParser {
  constructor() {
    super({ onError: () => {} })
  }
}

const lat = 38.7
const mLon = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat + y / 110574]
const opts = {
  spacingM: 50,
  angleDeg: 90,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 10,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
}
const parse = (text) => new DOMParser().parseFromString(text, 'application/xml').documentElement
const coordsOf = (el) =>
  textOf(findAll(el, 'coordinates')[0])
    .trim()
    .split(/\s+/)
    .map((c) => c.split(',').slice(0, 2).map(Number))
const fakeFile = (name, content) => ({
  name,
  text: async () => content,
  arrayBuffer: async () => new TextEncoder().encode(content).buffer,
})

/** Mosaico de celulas quadradas com duas bases, A a oeste e B a leste. */
function fixture({ sideM = 500, widthM = 2000 } = {}) {
  const ring = [em(0, 0), em(widthM, 0), em(widthM, 500), em(0, 500)]
  const mosaic = buildSquareMosaic(ring, { sideM, orientationDeg: mosaicOrientationForLines(90) })
  const cells = mosaic.cells.map((c) => c.ring)
  const plan = planArea(ring, cells, opts)
  const blocks = planBlocks(plan, {
    activeCells: cells,
    cellIds: cells.map((_, i) => i + 1),
    split: { mode: 'battery' },
  })
  const elevationAt = () => 0
  const bases = [
    { id: 'b1', label: 'A', point: em(-50, 250), radiusM: null },
    { id: 'b2', label: 'B', point: em(widthM + 50, 250), radiusM: null },
  ]
  const zones = computeZones(bases, { elevationAt, radiusM: 100, maxReliefM: 10 })
  const layout = layoutBlocks({ blocks, bases, zones, vlosM: 1000, speed: 10, elevationAt })
  const rows = summarizeBases({ bases, zones, layout })
  const files = flightFiles({
    baseName: 'corta-norte_area',
    blockIds: blocks.map((b) => b.id),
    layout,
  })
  const sheets = baseFieldSheets({ rows, layout, blocks, files, vlosM: 1000 })
  return { ring, blocks, layout, files, sheets }
}

describe('KML por base: pastas, nomes e ordem', () => {
  test('uma pasta por base, um KML por bloco pela ordem de voo, e o mapa de cada base', () => {
    const fx = fixture()
    const { entries, warnings } = blocksKmlByBase({
      missionName: 'corta norte',
      blocks: fx.blocks,
      layout: fx.layout,
      sheets: fx.sheets,
      files: fx.files,
    })
    expect(warnings).toEqual([])
    expect(entries.map((e) => e.path)).toEqual([
      'base-A/corta-norte_poligono_A-1.kml',
      'base-A/corta-norte_poligono_A-2.kml',
      'base-B/corta-norte_poligono_B-3.kml',
      'base-B/corta-norte_poligono_B-4.kml',
      'base-A/mapa/corta-norte_mapa_base-A.kml',
      'base-B/mapa/corta-norte_mapa_base-B.kml',
    ])
    expect(entries.map((e) => e.blockId)).toEqual([1, 2, 3, 4, null, null])
    expect(entries.map((e) => e.baseLabel)).toEqual(['A', 'A', 'B', 'B', 'A', 'B'])
  })

  test('com 10 voos ou mais o numero leva zeros, como nos KMZ', () => {
    const fx = fixture({ sideM: 250 })
    expect(fx.blocks.length).toBeGreaterThanOrEqual(10)
    const { entries } = blocksKmlByBase({ missionName: 'm', blocks: fx.blocks, layout: fx.layout })
    const blocos = entries.filter((e) => e.blockId != null)
    expect(blocos).toHaveLength(fx.blocks.length)
    for (const e of blocos) expect(e.path).toMatch(/^base-[AB]\/m_poligono_[AB]-\d{2}\.kml$/)
    // sem fichas nao ha mapa
    expect(entries.filter((e) => e.blockId == null)).toEqual([])
  })

  test('sem layout nem bases: pela ordem dos ids, em sem-base/', () => {
    const fx = fixture()
    const { entries } = blocksKmlByBase({
      missionName: 'Évora (2026)',
      blocks: fx.blocks,
      layout: null,
    })
    expect(entries.map((e) => e.path)).toEqual([
      'sem-base/Evora-2026_poligono_1.kml',
      'sem-base/Evora-2026_poligono_2.kml',
      'sem-base/Evora-2026_poligono_3.kml',
      'sem-base/Evora-2026_poligono_4.kml',
    ])
    expect(blocksKmlByBase({ missionName: 'm', blocks: [], layout: null })).toEqual({
      entries: [],
      warnings: [],
    })
  })
})

describe('KML por base: cada ficheiro', () => {
  test('o KML de um bloco: 1 Document, 1 Placemark, 1 Polygon e mais nada; o nome e o do ficheiro', () => {
    const fx = fixture()
    const { entries } = blocksKmlByBase({
      missionName: 'corta norte',
      blocks: fx.blocks,
      layout: fx.layout,
    })
    for (const e of entries) {
      expect(XMLValidator.validate(e.text)).toBe(true)
      const root = parse(e.text)
      expect(findAll(root, 'Document')).toHaveLength(1)
      expect(findAll(root, 'Placemark')).toHaveLength(1)
      expect(findAll(root, 'Polygon')).toHaveLength(1)
      for (const tag of [
        'Folder',
        'Style',
        'Point',
        'LineString',
        'innerBoundaryIs',
        'description',
      ])
        expect(findAll(root, tag), tag).toHaveLength(0)
      const stem = e.path
        .split('/')
        .pop()
        .replace(/\.kml$/, '')
      expect(textOf(childNamed(findAll(root, 'Document')[0], 'name'))).toBe(stem)
      expect(textOf(childNamed(findAll(root, 'Placemark')[0], 'name'))).toBe(stem)
      // os vertices sao os da celula, fechada
      const cell = fx.blocks.find((b) => b.id === e.blockId).cellRing
      const ring = coordsOf(root)
      expect(ring).toHaveLength(cell.length + 1)
      ring.slice(0, -1).forEach((p, i) => {
        expect(p[0]).toBeCloseTo(cell[i][0], 7)
        expect(p[1]).toBeCloseTo(cell[i][1], 7)
      })
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
  })

  test('ida e volta: o leitor de areas devolve o mesmo poligono, sem buracos nem partes a mais', async () => {
    const fx = fixture()
    const { entries } = blocksKmlByBase({ missionName: 'm', blocks: fx.blocks, layout: fx.layout })
    const e = entries[2]
    const r = await parseAreaFile(fakeFile(e.path.split('/').pop(), e.text))
    expect(r.parts).toHaveLength(1)
    expect(r.holes).toEqual([])
    const cell = fx.blocks.find((b) => b.id === e.blockId).cellRing
    const lido = r.ring[0][0] === r.ring[r.ring.length - 1][0] ? r.ring.slice(0, -1) : r.ring
    expect(lido).toHaveLength(cell.length)
    lido.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(cell[i][0], 7)
      expect(p[1]).toBeCloseTo(cell[i][1], 7)
    })
  })

  test('o mapa de uma base so tem a base, a zona e os blocos dela, com a ligacao de navegacao', () => {
    const fx = fixture()
    const { entries } = blocksKmlByBase({
      missionName: 'corta norte',
      blocks: fx.blocks,
      layout: fx.layout,
      sheets: fx.sheets,
      files: fx.files,
    })
    const mapaB = entries.find((e) => e.path === 'base-B/mapa/corta-norte_mapa_base-B.kml')
    const root = parse(mapaB.text)
    const folders = findAll(root, 'Folder')
    expect(folders.map((f) => textOf(childNamed(f, 'name')))).toEqual(['Base B'])
    const names = findAll(folders[0], 'Placemark').map((p) => textOf(childNamed(p, 'name')))
    expect(names).toEqual(['Base B', 'Zona B (100 m)', 'B-3', 'B-4'])
    expect(textOf(childNamed(findAll(root, 'Document')[0], 'name'))).toBe('corta norte — B')
    expect(mapaB.text).toContain('google.com/maps/search/')
    expect(mapaB.text).toContain('corta-norte_area_B-3.kmz')
  })

  test('buracos de uma celula: o KML vai sem eles e ha um aviso; um bloco sem contorno avisa e nao sai', () => {
    const fx = fixture()
    const hole = [em(100, 100), em(200, 100), em(200, 200), em(100, 200)]
    const blocks = fx.blocks.map((b) => (b.id === 1 ? { ...b, cellHoles: [hole] } : b))
    blocks.push({ id: 9, waypoints: [em(0, 0)] })
    const { entries, warnings } = blocksKmlByBase({ missionName: 'm', blocks, layout: fx.layout })
    expect(warnings).toEqual([
      { code: 'holes', blockId: 1, label: 'A-1', n: 1 },
      { code: 'no-outline', blockId: 9, label: '9' },
    ])
    expect(entries.map((e) => e.blockId)).toEqual([1, 2, 3, 4])
    expect(entries[0].text).not.toContain('innerBoundaryIs')
    expect(blockOutlines(blocks[0])[0].holes).toHaveLength(1)
  })

  test('faixas num U: o bloco com duas pecas da dois KML, a e b, cada um com um so poligono', () => {
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
    const plan = planArea(U, null, opts)
    const blocks = planBlocks(plan, {
      split: { mode: 'area', maxAreaHa: 16 },
      spacingM: 50,
      speed: 10,
    })
    const area = { ring: U }
    const { entries, warnings } = blocksKmlByBase({
      missionName: 'u',
      blocks,
      layout: null,
      spacingM: 50,
      area,
    })
    expect(warnings).toEqual([])
    const nPieces = blocks.reduce((s, b) => s + blockOutlines(b, { spacingM: 50, area }).length, 0)
    expect(nPieces).toBeGreaterThan(blocks.length)
    expect(entries).toHaveLength(nPieces)
    const duplo = blocks.find((b) => blockOutlines(b, { spacingM: 50, area }).length === 2)
    const dele = entries.filter((e) => e.blockId === duplo.id).map((e) => e.path)
    expect(dele).toEqual([
      `sem-base/u_poligono_${duplo.id}a.kml`,
      `sem-base/u_poligono_${duplo.id}b.kml`,
    ])
    for (const e of entries) {
      expect(findAll(parse(e.text), 'Polygon')).toHaveLength(1)
      expect(e.text).not.toContain('innerBoundaryIs')
    }
  })
})

describe('ZIP de ficheiros', () => {
  test('as entradas pela ordem dada; um caminho repetido e recusado', async () => {
    const fx = fixture()
    const { entries } = blocksKmlByBase({
      missionName: 'm',
      blocks: fx.blocks,
      layout: fx.layout,
      sheets: fx.sheets,
      files: fx.files,
    })
    const zip = await JSZip.loadAsync(await (await buildFilesZip(entries)).arrayBuffer())
    const paths = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    expect(paths).toEqual(entries.map((e) => e.path))
    expect(await zip.file(entries[2].path).async('string')).toBe(entries[2].text)
    await expect(
      buildFilesZip([entries[0], { ...entries[1], path: entries[0].path }]),
    ).rejects.toMatchObject({
      code: 'duplicate-file-name',
    })
  })
})
