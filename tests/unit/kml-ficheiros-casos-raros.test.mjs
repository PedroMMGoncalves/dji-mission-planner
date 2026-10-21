/**
 * KML de campo, nomes dos ficheiros e trânsitos, casos raros
 * (src/mission/basesKml.js, blocksKml.js, flightFiles.js, transitLegs.js):
 * a zona reduzida e a base fora do relevo na ficha do KML, uma ficha sem
 * ponto, uma base sem cor; blocos de faixas com linhas de 0 m, de uma só
 * linha ou fora da área; o mapa de uma base sem blocos; voos sem rótulo e
 * com a mesma ordem; o ZIP de uma base sem rótulo utilizável; e as pernas
 * de trânsito de um só bloco e as alturas de regresso sem altitude.
 */
import { describe, expect, test } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { XMLValidator } from 'fast-xml-parser'
import { blockOutlines, buildBasesKML } from '../../src/mission/basesKml.js'
import { blocksKmlByBase } from '../../src/mission/blocksKml.js'
import {
  exportChoices,
  flightFiles,
  flightToken,
  flightsArchiveName,
} from '../../src/mission/flightFiles.js'
import { rthByFlight, transitLegs } from '../../src/mission/transitLegs.js'
import { defaultRthHeightM } from '../../src/utils/exporters.js'
import { M_PER_DEG_LAT } from '../../src/utils/units.js'
import { childNamed, findAll, textOf } from '../../src/utils/xml.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]

/** Ficha de base mínima, com a forma de baseFieldSheets. */
const sheet = (extra = {}) => ({
  id: 'b1',
  label: 'A',
  color: '#38bdf8',
  point: em(-50, 100),
  coords: '38.700000, -9.140000',
  radiusM: 100,
  requestedRadiusM: 100,
  reduced: false,
  cause: null,
  refElev: 120,
  gainM: 4,
  flights: [{ flightLabel: 'A-1', totalS: 600, file: 'm_A-1.kmz' }],
  ...extra,
})
const descricoes = (kml) =>
  findAll(new DOMParser().parseFromString(kml, 'application/xml').documentElement, 'Placemark').map(
    (p) => textOf(childNamed(p, 'description')),
  )

describe('a ficha da base no KML «Bases e blocos»', () => {
  test('zona reduzida: o raio efectivo, o pedido e porquê', () => {
    const kml = buildBasesKML({
      name: 'm',
      sheets: [sheet({ reduced: true, radiusM: 60, cause: { reliefM: 14.2, atM: 70 } })],
      blocks: [],
      layout: null,
    })
    expect(XMLValidator.validate(kml)).toBe(true)
    const [base, zona] = descricoes(kml)
    const texto = 'descolar até 60 m do ponto (reduzida de 100 m: 14 m de desnível a 70 m)'
    expect(base).toContain(texto)
    expect(zona).toContain(texto)
    expect(kml).toContain('<name>Zona A (60 m)</name>')
    // sem a causa (zona de um projecto antigo), zeros e não «undefined»
    const semCausa = buildBasesKML({
      name: 'm',
      sheets: [sheet({ reduced: true, radiusM: 60 })],
      blocks: [],
      layout: null,
    })
    expect(descricoes(semCausa)[0]).toContain('(reduzida de 100 m: 0 m de desnível a 0 m)')
  })

  test('base fora do relevo: cota desconhecida, dita; sem ganho: 0', () => {
    const [fora] = descricoes(
      buildBasesKML({ name: 'm', sheets: [sheet({ refElev: null })], blocks: [], layout: null }),
    )
    expect(fora).toContain('fora do relevo carregado: cota de referência desconhecida')
    const [semGanho] = descricoes(
      buildBasesKML({ name: 'm', sheets: [sheet({ gainM: null })], blocks: [], layout: null }),
    )
    expect(semGanho).toContain('cota de referência 120 m · voo entre 0 e +0 m acima do planeado')
  })

  test('ficha sem ponto fica de fora; base sem cor com o estilo branco; sem fichas, só o documento', () => {
    const kml = buildBasesKML({
      name: 'm',
      sheets: [sheet({ point: null }), sheet({ id: 'b2', label: 'B', color: null })],
      blocks: [],
      layout: null,
    })
    expect(kml).not.toContain('<name>Base A</name>')
    expect(kml).toContain('<name>Base B</name>')
    expect(kml).toContain('<Style id="base-ffffff">')
    const vazio = buildBasesKML({ name: 'm', sheets: null, blocks: null, layout: null })
    expect(XMLValidator.validate(vazio)).toBe(true)
    expect(vazio).not.toContain('<Placemark>')
  })
})

describe('contornos dos blocos de faixas', () => {
  const area = { ring: rect(0, 0, 600, 400) }

  test('uma só linha: o rectângulo de ± meio espaçamento à volta dela', () => {
    const [peca] = blockOutlines(
      { lines: [[em(100, 200), em(500, 200)]], waypoints: [] },
      {
        spacingM: 40,
      },
    )
    // meio espaçamento e 1 % do espaçamento de folga (as fendas entre faixas)
    const meio = em(0, 200)[1]
    const ys = peca.ring.map((p) => (p[1] - meio) * M_PER_DEG_LAT)
    expect(Math.max(...ys)).toBeCloseTo(20.4, 6)
    expect(Math.min(...ys)).toBeCloseTo(-20.4, 6)
    expect(peca.holes).toEqual([])
  })

  test('linhas de 0 m: o invólucro da rota; sem rota, nenhum contorno', () => {
    const parado = [em(100, 200), em(100, 200)]
    const wps = [em(100, 100), em(300, 100), em(300, 300)]
    const [peca] = blockOutlines({ lines: [parado], waypoints: wps }, { spacingM: 40 })
    expect(peca.ring).toHaveLength(4)
    expect(blockOutlines({ lines: [parado], waypoints: [] }, { spacingM: 40 })).toEqual([])
  })

  test('faixas fora da área: nenhum contorno, e o KML por base avisa', () => {
    const fora = { id: 7, lines: [[em(1000, 200), em(1400, 200)]], waypoints: [] }
    expect(blockOutlines(fora, { spacingM: 40, area })).toEqual([])
    const { entries, warnings } = blocksKmlByBase({
      missionName: 'corta',
      blocks: [fora],
      layout: null,
      spacingM: 40,
      area,
    })
    expect(entries).toEqual([])
    expect(warnings).toEqual([{ code: 'no-outline', blockId: 7, label: '7' }])
  })

  test('o mapa de uma base sem blocos não entra no ZIP; sem fichas, só os polígonos', () => {
    const bloco = { id: 1, cellRing: rect(0, 0, 300, 400), waypoints: [] }
    const layout = {
      byBlock: { 1: { flight: 1, flightLabel: 'A-1', baseId: 'b1', baseLabel: 'A' } },
    }
    const { entries } = blocksKmlByBase({
      missionName: 'corta',
      blocks: [bloco],
      layout,
      sheets: [sheet(), sheet({ id: 'b2', label: 'B' })],
    })
    expect(entries.map((e) => e.path)).toEqual([
      'base-A/corta_poligono_A-1.kml',
      'base-A/mapa/corta_mapa_base-A.kml',
    ])
    const semFichas = blocksKmlByBase({
      missionName: 'corta',
      blocks: [bloco],
      layout,
      sheets: null,
    })
    expect(semFichas.entries.map((e) => e.path)).toEqual(['base-A/corta_poligono_A-1.kml'])
    expect(blocksKmlByBase({ missionName: 'corta', blocks: null, layout })).toEqual({
      entries: [],
      warnings: [],
    })
  })
})

describe('nomes dos ficheiros dos voos', () => {
  test('rótulo em falta ou só com símbolos: «voo»', () => {
    expect(flightToken(null)).toBe('voo')
    expect(flightToken('  ')).toBe('voo')
    expect(flightToken('#!')).toBe('voo')
  })

  test('mesma ordem de voo: desempata o id do bloco', () => {
    // o bloco 2 não tem voo no layout (conta o id, 2); o 5 é o voo 2
    const layout = {
      byBlock: { 5: { flight: 2, flightLabel: 'A-2', baseId: 'b1', baseLabel: 'A' } },
    }
    const f = flightFiles({ baseName: 'm', blockIds: [5, 2], layout })
    expect(f.map((x) => [x.blockId, x.name])).toEqual([
      [2, 'm_2'],
      [5, 'm_A-2'],
    ])
  })

  test('ZIP de uma base sem rótulo utilizável; escolhas sem listas', () => {
    expect(flightsArchiveName('m', { kind: 'base', baseId: 'b1' }, null)).toBe('m_base-x')
    expect(flightsArchiveName('m', { kind: 'base', baseId: 'b1' }, '??')).toBe('m_base-x')
    expect(exportChoices(null, null)).toEqual({ flights: [], bases: [] })
    const files = flightFiles({ baseName: 'm', blockIds: [1] })
    expect(exportChoices(files, null)).toEqual({ flights: files, bases: [] })
  })
})

describe('pernas de trânsito e alturas de regresso', () => {
  const view3d = {
    waypoints: [[...em(0, 0), 100], [...em(300, 0)], [...em(300, 50), 110]],
    refElev: 150,
    refSource: 'bases',
  }

  test('um só bloco com base, sem cortes: a rota toda, na cota da sua zona', () => {
    const legs = transitLegs({
      view3d,
      perBlock: true,
      blocks: [{ id: 1, waypoints: view3d.waypoints }],
      baseLayout: { byBlock: { 1: { baseId: 'b1', flightLabel: 'A-1' } } },
      bases: [{ id: 'b1', point: em(-50, 0) }],
      blockRefs: { refs: [140] },
    })
    expect(legs).toHaveLength(1)
    // 10 m mais alto na zona da base (150 − 140); o waypoint sem altura conta 0
    expect(legs[0].waypoints.map((w) => w[2])).toEqual([110, 10, 120])
    expect(legs[0]).toMatchObject({ flight: 'A-1', refElev: 140 })
  })

  test('sem lista de bases, nenhuma perna por bloco; sem rota, nenhuma', () => {
    expect(
      transitLegs({
        view3d,
        perBlock: true,
        blocks: [{ id: 1, waypoints: view3d.waypoints }],
        baseLayout: { byBlock: { 1: { baseId: 'b1' } } },
        bases: null,
        blockRefs: { refs: [140] },
      }),
    ).toEqual([])
    expect(transitLegs({ view3d: { waypoints: [], refElev: 1 }, basePoint: em(0, 0) })).toEqual([])
    expect(transitLegs({ view3d: { ...view3d, refElev: null }, basePoint: em(0, 0) })).toEqual([])
  })

  test('regresso: sem altitude, o tecto da rota; sem pernas, nada', () => {
    const [r] = rthByFlight(
      [
        {
          waypoints: [
            [0, 0, 80],
            [0, 0],
            [0, 0, 95],
          ],
        },
      ],
      {
        altitudeM: Number.NaN,
      },
    )
    expect(r).toEqual({ flight: null, ceilingM: 95, rthM: defaultRthHeightM(95) })
    expect(rthByFlight([{ flight: 'A-1' }], { altitudeM: 100 })).toEqual([
      { flight: 'A-1', ceilingM: 100, rthM: defaultRthHeightM(100) },
    ])
    expect(rthByFlight(null)).toEqual([])
  })
})
