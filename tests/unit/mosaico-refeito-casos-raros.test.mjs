/**
 * Mosaico refeito, casos raros (src/mission/cellCarryOver.js e
 * mosaicLegacy.js): anéis fechados, células côncavas (em L, recortadas pela
 * área ou por um buraco), no sentido dos ponteiros do relógio ou com um
 * vértice a meio de uma aresta, células sem área, geometria degenerada (um
 * laço), listas em falta; e, nos projectos com o mosaico antigo, a base tão
 * longe que o trânsito sozinho passava o tempo útil, o buraco dentro de uma
 * célula nova e a grelha antiga que não se consegue refazer.
 */
import { describe, expect, test } from 'vitest'
import { carryOverCells, matchCells, sameArea } from '../../src/mission/cellCarryOver.js'
import {
  legacyDisabledForMosaic,
  legacyTileSide,
  translateLegacyDisabledTiles,
} from '../../src/mission/mosaicLegacy.js'
import { squareSideForBattery } from '../../src/utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const square = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]
const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]
/** L de braço `s`: o quadrado 2s × 2s sem o canto de cima à direita. */
const L = (x, y, s) => [
  em(x, y),
  em(x + 2 * s, y),
  em(x + 2 * s, y + s),
  em(x + s, y + s),
  em(x + s, y + 2 * s),
  em(x, y + 2 * s),
]
const fechado = (ring) => [...ring, ring[0]]
const area = square(0, 0, 1000)

describe('o mosaico refeito: formas que o mosaico produz', () => {
  test('anéis fechados (o fecho repetido) contam como abertos', () => {
    const args = {
      oldCells: [{ id: 1, ring: square(0, 0, 500) }],
      newCells: [{ id: 7, ring: square(0, 0, 250) }],
      disabled: [1],
      manual: { 1: 'b2' },
    }
    const aberto = carryOverCells({ ...args, oldRing: area, newRing: area })
    const comFecho = carryOverCells({
      oldRing: fechado(area),
      newRing: fechado(area),
      oldCells: [{ id: 1, ring: fechado(square(0, 0, 500)) }],
      newCells: [{ id: 7, ring: fechado(square(0, 0, 250)) }],
      disabled: [1],
      manual: { 1: 'b2' },
    })
    expect(comFecho).toEqual(aberto)
    expect(aberto).toEqual({ disabled: new Set([7]), manual: { 7: 'b2' }, lost: 0, sameArea: true })
  })

  test('célula antiga em L (côncava): cada quadrado novo herda pela área em comum', () => {
    const antigas = [{ id: 1, ring: L(0, 0, 250) }]
    const novas = [
      { id: 'a', ring: square(0, 0, 250) },
      { id: 'b', ring: square(250, 0, 250) },
      { id: 'c', ring: square(0, 250, 250) },
      // o canto que o L não tem
      { id: 'd', ring: square(250, 250, 250) },
      // meio dentro, meio fora do braço de baixo
      { id: 'e', ring: square(375, 0, 250) },
    ]
    expect(Object.fromEntries(matchCells(antigas, novas))).toEqual({
      a: '1',
      b: '1',
      c: '1',
      e: '1',
    })
    // só um terço da célula nova dentro do L: não herda
    const pouco = matchCells(antigas, [{ id: 'f', ring: square(420, 0, 250) }])
    expect(pouco.size).toBe(0)
  })

  test('as duas côncavas: a nova em L herda da antiga em L', () => {
    const antigas = [{ id: 1, ring: L(0, 0, 250) }]
    // outra forma em L (um vértice puxado), não uma cópia deslocada
    const puxado = L(0, 0, 250).map((p, i) => (i === 3 ? em(300, 300) : p))
    expect(Object.fromEntries(matchCells(antigas, [{ id: 'x', ring: puxado }]))).toEqual({
      x: '1',
    })
    // a área em L com um vértice puxado continua a ser a mesma área
    const r = sameArea(
      L(0, 0, 500),
      L(0, 0, 500).map((p, i) => (i === 3 ? em(600, 600) : p)),
    )
    expect(r).toEqual({ same: true, shift: [0, 0], fraction: 1 })
  })

  test('sentido dos ponteiros do relógio e vértice a meio de uma aresta: o mesmo resultado', () => {
    const antigas = [{ id: 1, ring: square(0, 0, 500) }]
    const novas = [{ id: 'a', ring: square(0, 0, 250) }]
    const horario = [{ id: 1, ring: [...square(0, 0, 500)].reverse() }]
    expect(matchCells(horario, novas)).toEqual(matchCells(antigas, novas))
    // o recorte pela área deixa vértices alinhados numa aresta
    const comMeio = [{ id: 1, ring: [em(0, 0), em(250, 0), em(500, 0), em(500, 500), em(0, 500)] }]
    expect(Object.fromEntries(matchCells(comMeio, novas))).toEqual({ a: '1' })
  })

  test('células novas sem área (pontos alinhados) ou com menos de três vértices não herdam', () => {
    const antigas = [{ id: 1, ring: square(0, 0, 500) }]
    const novas = [
      { id: 'linha', ring: [em(0, 0), em(100, 0), em(200, 0)] },
      { id: 'dois', ring: [em(0, 0), em(100, 100)] },
      { id: 'nada', ring: null },
      null,
    ]
    expect(matchCells(antigas, novas).size).toBe(0)
  })

  test('geometria degenerada (um laço): não rebenta, e não passa nada', () => {
    const laco = (x, y, s, dx = 0) => [em(x, y), em(x + s + dx, y + s), em(x + s, y), em(x, y + s)]
    expect(sameArea(laco(0, 0, 1000), laco(0, 0, 1000, 100))).toEqual({
      same: false,
      shift: [0, 0],
      fraction: 0,
    })
    expect(
      matchCells([{ id: 1, ring: laco(0, 0, 250) }], [{ id: 'y', ring: laco(0, 0, 250, 20) }]),
    ).toEqual(new Map())
  })

  test('listas em falta: nada a herdar, e as escolhas sem lista não contam', () => {
    expect(matchCells(null, [{ id: 'a', ring: square(0, 0, 250) }])).toEqual(new Map())
    expect(matchCells([{ id: 1, ring: square(0, 0, 250) }], null)).toEqual(new Map())
    // o deslocamento nulo é o mesmo que nenhum
    expect(
      matchCells([{ id: 1, ring: square(0, 0, 250) }], [{ id: 'a', ring: square(0, 0, 250) }], {
        shift: null,
      }),
    ).toEqual(new Map([['a', '1']]))
    const r = carryOverCells({
      oldRing: area,
      newRing: area,
      oldCells: [{ id: 1, ring: square(0, 0, 500) }],
      newCells: [{ id: 'a', ring: square(0, 0, 250) }],
      disabled: null,
      manual: null,
    })
    expect(r).toEqual({ disabled: new Set(), manual: {}, lost: 0, sameArea: true })
  })
})

describe('projectos com o mosaico antigo', () => {
  const ring = rect(0, 0, 1500, 700)
  const args = {
    split: { mode: 'battery', maxSide: 2000 },
    ring,
    batteryMin: 20,
    speed: 10,
    spacingM: 40,
  }

  test('base tão longe que o trânsito sozinho passava o tempo útil: o lado sem trânsito', () => {
    const semBase = legacyTileSide(args)
    // 7 km de ida e volta a 10 m/s = 1400 s > 1200 s úteis
    expect(legacyTileSide({ ...args, basePoint: em(-7000, 350) })).toBe(semBase)
    // velocidade em falta: o trânsito conta a 10 m/s
    expect(legacyTileSide({ ...args, speed: 0, basePoint: em(-1000, 350) })).toBe(
      squareSideForBattery({
        batteryMin: 20,
        speed: 0,
        spacingM: 40,
        maxSideM: 2000,
        transitS: 200,
      }),
    )
    // sem modo de bateria nem divisão: o lado manual, ou nenhum
    expect(legacyTileSide({ split: null })).toBeUndefined()
  })

  test('o buraco de uma célula nova não conta na sua área', () => {
    // a metade oeste da célula nova estava desactivada: metade, desactiva-se
    const antigas = [rect(0, 0, 250, 500), rect(250, 0, 250, 500)]
    const nova = { ring: square(0, 0, 500) }
    expect([...translateLegacyDisabledTiles(antigas, [0], [nova])]).toEqual([0])
    // com um buraco a oeste, a parte desactivada que conta é menos de metade
    const buracoOeste = { ...nova, holes: [rect(50, 100, 150, 300)] }
    expect(translateLegacyDisabledTiles(antigas, [0], [buracoOeste]).size).toBe(0)
    // com um buraco a leste, passa de metade
    const buracoLeste = { ...nova, holes: [rect(300, 100, 150, 300)] }
    expect([...translateLegacyDisabledTiles(antigas, [0], [buracoLeste])]).toEqual([0])
  })

  test('índices de fora da grelha, células novas sem área e listas em falta', () => {
    const antigas = [square(0, 0, 250)]
    const novas = [{ ring: square(0, 0, 250) }, { ring: [em(0, 0), em(10, 0), em(20, 0)] }, {}]
    expect([...translateLegacyDisabledTiles(antigas, [0, 5, -1], novas)]).toEqual([0])
    expect(translateLegacyDisabledTiles(antigas, null, novas).size).toBe(0)
    expect(translateLegacyDisabledTiles(null, [0], novas).size).toBe(0)
    expect(translateLegacyDisabledTiles(antigas, [0], null).size).toBe(0)
  })

  test('grelha antiga que não se refaz (lado abaixo de 10 m, ou células a mais): nada a traduzir', () => {
    const novas = [{ ring: square(0, 0, 250) }]
    const base = { ring, disabled: [0], newCells: novas }
    expect(legacyDisabledForMosaic({ ...base, split: { mode: 'tiles', tileSize: 5 } }).size).toBe(0)
    expect(legacyDisabledForMosaic({ ...base, split: { mode: 'tiles', tileSize: 10 } }).size).toBe(
      0,
    )
    // sem orientação gravada, a grelha antiga é a de 0°
    const semOrientacao = legacyDisabledForMosaic({
      ...base,
      split: { mode: 'tiles', tileSize: 250 },
    })
    const zero = legacyDisabledForMosaic({
      ...base,
      split: { mode: 'tiles', tileSize: 250, tileOrientation: 0 },
    })
    expect([...semOrientacao]).toEqual([...zero])
  })
})
