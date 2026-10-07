// Exportação de uma área dividida em voos, base a base: nomes dos ficheiros
// pelo rótulo do voo (A-1, B-3), escolha de todos / de uma base / de um voo,
// ordem de voo dentro do ZIP, o KML de campo «Bases e blocos» e a ficha de
// campo de cada base (checklist e relatório).
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, test } from 'vitest'
import {
  areaExportName,
  exportChoices,
  flightDigits,
  baseFolder,
  flightFiles,
  flightToken,
  flightsArchiveName,
  selectFlights,
} from '../../src/mission/flightFiles.js'
import { baseFieldSheets, formatLatLon, mapLinks } from '../../src/mission/fieldSheet.js'
import {
  blockOutline,
  buildBasesKML,
  circleRing,
  defaultBasesT,
  kmlColor,
} from '../../src/mission/basesKml.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import { computeZones, layoutBlocks, summarizeBases } from '../../src/mission/baseLayout.js'
import { defaultEquipment } from '../../src/mission/equipment.js'
import { blockExportParams, buildBlocksZip } from '../../src/utils/exporters.js'
import { childNamed, findAll, localNameOf, textOf } from '../../src/utils/xml.js'
import { distanceM } from '../../src/mission/takeoffZones.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const wpml = { droneEnumValue: 60, payloadEnumValue: 50, payloadPositionIndex: 0 }

/* Área 2000 × 500 m em quatro quadrados de 500 m; base A a oeste, base B
   a leste; relevo plano a 0 m a oeste e 30 m a leste (a cota de cada zona) */
function fixture() {
  const ring = [em(0, 0), em(2000, 0), em(2000, 500), em(0, 500)]
  const mosaic = buildSquareMosaic(ring, {
    sideM: 500,
    orientationDeg: mosaicOrientationForLines(90),
  })
  const cells = mosaic.cells.map((c) => c.ring)
  const plan = planArea(ring, cells, {
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
  })
  const blocks = planBlocks(plan, {
    activeCells: cells,
    cellIds: cells.map((_, i) => i + 1),
    split: { mode: 'battery' },
  })
  const elevationAt = (lon) => ((lon + 9.14) * mLon > 1000 ? 30 : 0)
  const bases = [
    { id: 'b1', label: 'A', point: em(-50, 250), radiusM: null },
    { id: 'b2', label: 'B', point: em(2050, 250), radiusM: null },
  ]
  const zones = computeZones(bases, { elevationAt, radiusM: 100, maxReliefM: 10 })
  const layout = layoutBlocks({ blocks, bases, zones, vlosM: 1000, speed: 10, elevationAt })
  const rows = summarizeBases({ bases, zones, layout })
  return { ring, plan, blocks, bases, zones, layout, rows }
}

describe('nomes dos ficheiros dos voos', () => {
  test('nome base: missão, tipo e variantes, como sempre', () => {
    expect(areaExportName({ missionName: 'Corta Norte', terrainOk: true })).toBe(
      'Corta-Norte_area-tf',
    )
    expect(
      areaExportName({ missionName: 'm', crosshatch: true, includeNadir: true, tieLine: true }),
    ).toBe('m_area-crosshatch-nadir-tie')
    // nadir só conta com a dupla grelha
    expect(areaExportName({ missionName: 'm', includeNadir: true })).toBe('m_area')
  })

  test('rótulo do voo: seguro para o Pilot 2, número com os algarismos pedidos', () => {
    expect(flightToken('A-1')).toBe('A-1')
    expect(flightToken('A-1', 2)).toBe('A-01')
    expect(flightToken('AB-12', 3)).toBe('AB-012')
    expect(flightToken('7', 2)).toBe('07')
    // voo sem base (o preflight bloqueia): sem '?' no nome do ficheiro
    expect(flightToken('?-3')).toBe('x-3')
    expect(flightToken('a b/c')).toBe('a-b-c')
    expect(flightToken('')).toBe('voo')
    expect(flightDigits(9)).toBe(1)
    expect(flightDigits(10)).toBe(2)
    expect(flightDigits(0)).toBe(1)
  })

  test('flightFiles: ordem de voo, rótulo no nome, únicos', () => {
    const { blocks, layout } = fixture()
    const files = flightFiles({
      baseName: 'corta-norte_area-tf',
      blockIds: blocks.map((b) => b.id),
      layout,
    })
    expect(files.map((f) => f.flightLabel)).toEqual(['A-1', 'A-2', 'B-3', 'B-4'])
    expect(files.map((f) => f.file)).toEqual([
      'corta-norte_area-tf_A-1.kmz',
      'corta-norte_area-tf_A-2.kmz',
      'corta-norte_area-tf_B-3.kmz',
      'corta-norte_area-tf_B-4.kmz',
    ])
    expect(files.map((f) => f.blockId)).toEqual(layout.order)
    expect(files.map((f) => f.baseLabel)).toEqual(['A', 'A', 'B', 'B'])
    for (const f of files) expect(f.name).toMatch(/^[\w-]+$/)
  })

  test('com 10 voos ou mais o número leva zeros (a lista do Pilot 2 sai pela ordem de voo)', () => {
    const byBlock = {}
    for (let i = 1; i <= 12; i++)
      byBlock[i] = {
        flight: i,
        flightLabel: `${i <= 9 ? 'A' : 'B'}-${i}`,
        baseId: i <= 9 ? 'a' : 'b',
        baseLabel: i <= 9 ? 'A' : 'B',
      }
    const files = flightFiles({
      baseName: 'm',
      blockIds: Object.keys(byBlock).map(Number).reverse(),
      layout: { byBlock },
    })
    const names = files.map((f) => f.name)
    expect(names[0]).toBe('m_A-01')
    expect(names[9]).toBe('m_B-10')
    expect([...names].sort()).toEqual(names)
    // o rótulo do mapa não muda
    expect(files[0].flightLabel).toBe('A-1')
  })

  test('sem layout: ordem e número pelo id; nomes repetidos ganham o id do bloco', () => {
    const files = flightFiles({ baseName: 'm', blockIds: [3, 1, 2] })
    expect(files.map((f) => f.name)).toEqual(['m_1', 'm_2', 'm_3'])
    const dup = flightFiles({
      baseName: 'm',
      blockIds: [1, 2],
      layout: {
        byBlock: { 1: { flight: 1, flightLabel: 'A-1' }, 2: { flight: 2, flightLabel: 'A-1' } },
      },
    })
    expect(dup.map((f) => f.name)).toEqual(['m_A-1', 'm_A-1-b2'])
    expect(flightFiles({ baseName: 'm', blockIds: [] })).toEqual([])
  })

  test('escolha: todos, os de uma base, um voo; nome do ZIP', () => {
    const { blocks, layout, rows } = fixture()
    const files = flightFiles({ baseName: 'm', blockIds: blocks.map((b) => b.id), layout })
    expect(selectFlights(files, { kind: 'all' })).toEqual(files)
    expect(selectFlights(files, null)).toEqual(files)
    const b = selectFlights(files, { kind: 'base', baseId: 'b2' })
    expect(b.map((f) => f.flightLabel)).toEqual(['B-3', 'B-4'])
    const one = selectFlights(files, { kind: 'flight', blockId: files[2].blockId })
    expect(one).toEqual([files[2]])
    // blocos da exportação (id em vez de blockId)
    expect(selectFlights([{ id: 5 }, { id: 6 }], { kind: 'flight', blockId: 6 })).toEqual([
      { id: 6 },
    ])
    expect(selectFlights(files, { kind: 'base', baseId: 'zz' })).toEqual([])
    expect(selectFlights(files, { kind: 'outro' })).toEqual([])
    expect(flightsArchiveName('m_area-tf', { kind: 'all' })).toBe('m_area-tf_voos')
    expect(flightsArchiveName('m_area-tf', { kind: 'base', baseId: 'b2' }, 'B')).toBe(
      'm_area-tf_base-B',
    )
    const choices = exportChoices(files, rows)
    expect(choices.bases.map((x) => [x.label, x.files.map((f) => f.flightLabel)])).toEqual([
      ['A', ['A-1', 'A-2']],
      ['B', ['B-3', 'B-4']],
    ])
  })
})

describe('exportação dos voos (buildAreaExport + ZIP)', () => {
  const exportOf = ({ plan, blocks, layout }) =>
    buildAreaExport({
      missionName: 'corta norte',
      plan,
      blocks,
      spacingM: 50,
      sensorType: 'camera',
      altitude: 100,
      speed: 10,
      wpml,
      photoIntervalM: 20,
      triggerMode: 'distance',
      gimbalPitch: -90,
      layout,
    })

  test('com bases: blocos pela ordem de voo, cada um com o nome do seu voo', () => {
    const fx = fixture()
    const { params, blocks } = exportOf(fx)
    expect(params.name).toBe('corta-norte_area')
    expect(blocks.map((b) => b.name)).toEqual([
      'corta-norte_area_A-1',
      'corta-norte_area_A-2',
      'corta-norte_area_B-3',
      'corta-norte_area_B-4',
    ])
    expect(blocks.map((b) => b.id)).toEqual(fx.layout.order)
    expect(blocks.map((b) => b.baseLabel)).toEqual(['A', 'A', 'B', 'B'])
    // o nome é também o título da missão no KMZ (o que o Pilot 2 mostra)
    expect(blockExportParams(params, blocks[2]).name).toBe('corta-norte_area_B-3')
  })

  test('sem layout: ordem do plano e o nome antigo pelo id (órbita e circular)', () => {
    const fx = fixture()
    const { params, blocks } = exportOf({ ...fx, layout: null })
    expect(blocks.every((b) => b.name === undefined)).toBe(true)
    expect(blockExportParams(params, blocks[0]).name).toBe(`corta-norte_area_b01`)
  })

  test('ZIP de uma base: só os voos dela, pela ordem de voo, título = nome do ficheiro', async () => {
    const fx = fixture()
    const { params, blocks } = exportOf(fx)
    const chosen = selectFlights(blocks, { kind: 'base', baseId: 'b2' })
    const zip = await JSZip.loadAsync(await (await buildBlocksZip(params, chosen)).arrayBuffer())
    const names = Object.keys(zip.files)
    expect(names).toEqual(['corta-norte_area_B-3.kmz', 'corta-norte_area_B-4.kmz'])
    for (const n of names) {
      const kmz = await JSZip.loadAsync(await zip.file(n).async('arraybuffer'))
      const tpl = new DOMParser().parseFromString(
        await kmz.file('wpmz/template.kml').async('string'),
        'application/xml',
      )
      const folder = findAll(tpl.documentElement, 'Folder')[0]
      expect(textOf(childNamed(folder, 'name'))).toBe(n.replace(/\.kmz$/, ''))
    }
  })

  test('ZIP por base: todos os voos, uma pasta por base, título = nome do ficheiro', async () => {
    const fx = fixture()
    const { params, blocks } = exportOf(fx)
    const chosen = selectFlights(blocks, { kind: 'byBase' })
    expect(chosen).toHaveLength(blocks.length)
    const zip = await JSZip.loadAsync(
      await (
        await buildBlocksZip(params, chosen, { folderOf: (b) => baseFolder(b.baseLabel) })
      ).arrayBuffer(),
    )
    const names = Object.keys(zip.files).filter((n) => n.endsWith('.kmz'))
    expect(names).toHaveLength(blocks.length)
    for (const n of names) {
      const m = /^base-([A-Z]+)\/corta-norte_area_([A-Z]+)-\d+\.kmz$/.exec(n)
      expect(m && m[1]).toBe(m && m[2])
      const kmz = await JSZip.loadAsync(await zip.file(n).async('arraybuffer'))
      const tpl = await kmz.file('wpmz/template.kml').async('string')
      expect(tpl).toContain(
        `<name>${n
          .split('/')
          .pop()
          .replace(/\.kmz$/, '')}</name>`,
      )
    }
    expect(names.filter((n) => n.startsWith('base-B/'))).toEqual([
      'base-B/corta-norte_area_B-3.kmz',
      'base-B/corta-norte_area_B-4.kmz',
    ])
    expect(flightsArchiveName('m_area-tf', { kind: 'byBase' })).toBe('m_area-tf_voos-por-base')
    expect(flightsArchiveName('m_area-tf', { kind: 'both' })).toBe('m_area-tf_voos')
    expect(baseFolder('AB')).toBe('base-AB')
    expect(baseFolder('')).toBeNull()
  })

  test('nomes repetidos dentro do ZIP são recusados', async () => {
    const fx = fixture()
    const { params, blocks } = exportOf(fx)
    await expect(
      buildBlocksZip(params, [blocks[0], { ...blocks[1], name: blocks[0].name }]),
    ).rejects.toThrow()
  })
})

describe('ficha de campo por base', () => {
  test('coordenadas, ligações, zona, cota, voos com trânsito e ficheiros, baterias', () => {
    const { blocks, layout, rows } = fixture()
    const files = flightFiles({ baseName: 'm_area', blockIds: blocks.map((b) => b.id), layout })
    const eq = defaultEquipment()
    const sheets = baseFieldSheets({
      rows,
      layout,
      blocks,
      files,
      vlosM: 1000,
      equipment: eq,
      aircraftId: 'M300RTK',
    })
    expect(sheets.map((s) => s.label)).toEqual(['A', 'B'])
    const b = sheets[1]
    expect(b.coords).toBe(formatLatLon(rows[1].point))
    expect(b.coords).toMatch(/^38\.\d{6}, -9\.\d{6}$/)
    expect(b.links.https).toContain(`query=${rows[1].point[1].toFixed(6)},`)
    expect(b.links.geo).toMatch(/^geo:38\.\d{6},-9\.\d{6}\?q=.*\(Base%20B\)$/)
    expect(b.refElev).toBe(30)
    expect(b.radiusM).toBe(100)
    expect(b.flights.map((f) => [f.flightLabel, f.file])).toEqual([
      ['B-3', 'm_area_B-3.kmz'],
      ['B-4', 'm_area_B-4.kmz'],
    ])
    for (const f of b.flights) {
      expect(f.transitS).toBeGreaterThan(0)
      expect(f.totalS).toBeCloseTo(f.flightS + f.transitS, 6)
      expect(f.worstVlosM).toBeGreaterThan(0)
    }
    expect(b.totalS).toBeCloseTo(
      b.flights.reduce((s, f) => s + f.totalS, 0),
      6,
    )
    expect(b.worstVlosM).toBe(Math.max(...b.flights.map((f) => f.worstVlosM)))
    expect(b.sets.flights).toBe(2)
    expect(b.vlosM).toBe(1000)
    // sem bases não há fichas
    expect(baseFieldSheets({ rows, layout: { ...layout, hasBases: false }, blocks })).toEqual([])
    expect(formatLatLon(null)).toBe('')
    expect(mapLinks([NaN, 1])).toBeNull()
  })
})

describe('KML «Bases e blocos»', () => {
  const build = (over = {}) => {
    const { blocks, layout, rows } = fixture()
    const files = flightFiles({ baseName: 'm_area', blockIds: blocks.map((b) => b.id), layout })
    const sheets = baseFieldSheets({ rows, layout, blocks, files, vlosM: 1000 })
    return {
      kml: buildBasesKML({ name: 'Corta <Norte> & "Sul"', sheets, blocks, layout, files, ...over }),
      sheets,
      blocks,
    }
  }

  test('XML bem formado, nome escapado, três pastas', () => {
    const { kml } = build()
    expect(XMLValidator.validate(kml)).toBe(true)
    const doc = new DOMParser().parseFromString(kml, 'application/xml')
    const document = findAll(doc.documentElement, 'Document')[0]
    expect(textOf(childNamed(document, 'name'))).toBe('Corta <Norte> & "Sul"')
    const folders = findAll(doc.documentElement, 'Folder').map((f) => textOf(childNamed(f, 'name')))
    expect(folders).toEqual(['Bases', 'Zonas de descolagem', 'Blocos (voos)'])
  })

  test('bases com o rótulo e a ficha; zonas com o raio efectivo; blocos com o voo', () => {
    const { kml, sheets } = build()
    const doc = new DOMParser().parseFromString(kml, 'application/xml')
    const [basesF, zonesF, blocksF] = findAll(doc.documentElement, 'Folder')
    const pm = (f) => findAll(f, 'Placemark')
    expect(pm(basesF).map((p) => textOf(childNamed(p, 'name')))).toEqual(['Base A', 'Base B'])
    // a descrição é HTML: depois de lida como XML fica com <br/> e o texto
    const descB = textOf(childNamed(pm(basesF)[1], 'description'))
    expect(descB).toContain('descolar até 100 m do ponto')
    expect(descB).toContain('cota de referência 30 m')
    expect(descB).toContain('m_area_B-3.kmz')
    expect(descB).toContain('<br/>')
    // zona: círculo à volta da base com o raio efectivo
    expect(pm(zonesF).map((p) => textOf(childNamed(p, 'name')))).toEqual([
      'Zona A (100 m)',
      'Zona B (100 m)',
    ])
    const ring = textOf(findAll(pm(zonesF)[1], 'coordinates')[0])
      .split(/\s+/)
      .map((c) => c.split(',').map(Number))
    for (const p of ring) expect(distanceM(sheets[1].point, p)).toBeCloseTo(100, -0.5)
    // blocos pela ordem de voo, com o rótulo num ponto e o contorno
    const blocks = pm(blocksF)
    expect(blocks.map((p) => textOf(childNamed(p, 'name')))).toEqual(['A-1', 'A-2', 'B-3', 'B-4'])
    for (const p of blocks) {
      const geoms = findAll(p, 'MultiGeometry')[0]
      expect(geoms).toBeTruthy()
      const kinds = [...findAll(geoms, 'Point'), ...findAll(geoms, 'Polygon')].map(localNameOf)
      expect(kinds).toEqual(['Point', 'Polygon'])
    }
  })

  test('cores KML, círculo, contorno do bloco e tradutor', () => {
    expect(kmlColor('#38bdf8')).toBe('fff8bd38')
    expect(kmlColor('#C2410C', '33')).toBe('330c41c2')
    expect(kmlColor('xx')).toBe('ffffffff')
    expect(circleRing([0, 0], 0)).toEqual([])
    const c = circleRing(em(0, 0), 50, 8)
    expect(c).toHaveLength(9)
    expect(c[0]).toEqual(c[8])
    // bloco sem célula: o invólucro da rota, fechado
    const out = blockOutline({ waypoints: [em(0, 0), em(100, 0), em(100, 100), em(0, 100)] })
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual(out[4])
    expect(blockOutline({ waypoints: [em(0, 0)] })).toEqual([])
    expect(defaultBasesT('bases.label', { label: 'C' })).toBe('Base C')
    expect(defaultBasesT('chave.em.falta')).toBe('chave.em.falta')
  })

  test('tradutor da interface (EN) passa para o ficheiro', () => {
    const { blocks, layout, rows } = fixture()
    const sheets = baseFieldSheets({ rows, layout, blocks, vlosM: 1000 })
    const kml = buildBasesKML({ name: 'm', sheets, blocks, layout }, (k, v) =>
      k === 'bases.kml.basesFolder' ? 'Bases (EN)' : defaultBasesT(k, v),
    )
    expect(kml).toContain('<name>Bases (EN)</name>')
  })
})
