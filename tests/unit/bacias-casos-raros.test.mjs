/**
 * Bacias de visão, casos raros (src/mission/viewshed.js e viewshedPlan.js):
 * um bloco mais pequeno do que a grelha (fica o centróide), a curvatura
 * desligada, a fracção de Fresnel inválida, a base sem relevo a meio da
 * corrida (o erro fica nesse bloco e a corrida continua), os trabalhos com
 * alturas inválidas, sem a ordem dos voos, com blocos sem base ou sem anel,
 * e os resumos com campos em falta.
 */
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_ANTENNA_HEIGHT_M,
  DEFAULT_EYE_HEIGHT_M,
  baseViewsheds,
  blockVisibility,
} from '../../src/mission/viewshed.js'
import {
  createViewshedRun,
  gridStrips,
  ringLabelPoint,
  viewSummary,
  viewshedJobs,
  viewshedsByBlock,
  zoneEyePoints,
} from '../../src/mission/viewshedPlan.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const rect = (x0, x1, y0, y1) => [em(x0, y0), em(x1, y0), em(x1, y1), em(x0, y1)]
const flat = () => 100

describe('bacia de um bloco: formas e opções raras', () => {
  test('bloco mais pequeno do que a grelha: um só ponto, o centróide', () => {
    const r = blockVisibility({
      eye: { point: em(0, 0) },
      blockRing: rect(400, 410, 0, 10),
      droneElevAt: () => 200,
      elevationAt: flat,
      gridStepM: 25,
    })
    expect(r.total).toBe(1)
    expect(r.visibleFrac).toBe(1)
  })

  test('curvatura desligada: um drone baixo a 12 km volta a ver-se', () => {
    // planície a 100 m, olhos a 1,7 m, drone a 2 m do chão: com a Terra
    // curva (e a refracção normal) o chão a meio sobe ~2,5 m e tapa-o
    const args = {
      eye: { point: em(0, 0) },
      blockRing: rect(11990, 12010, 0, 20),
      droneElevAt: () => 102,
      elevationAt: flat,
      gridStepM: 25,
      stepM: 50,
    }
    expect(blockVisibility(args).visibleFrac).toBe(0)
    expect(blockVisibility({ ...args, curvature: false }).visibleFrac).toBe(1)
  })

  test('fracção de Fresnel inválida: a de omissão (60 %)', () => {
    const ridge = (lon) => (xOf(lon) > 290 && xOf(lon) < 310 ? 130 : 100)
    const args = {
      eye: { point: em(0, 0) },
      blockRing: rect(500, 560, 0, 60),
      droneElevAt: () => 150,
      elevationAt: ridge,
      gridStepM: 25,
    }
    const omissao = blockVisibility({ ...args, fresnel: { freqGHz: 2.4 } })
    const invalida = blockVisibility({ ...args, fresnel: { freqGHz: 2.4, fraction: -1 } })
    expect(invalida.radioFail).toBe(omissao.radioFail)
    expect(invalida.radioRisk).toEqual(omissao.radioRisk)
  })

  test('várias bases: sem cota do drone, sem base ou com a base sem ponto, o bloco fica de fora', () => {
    const bases = [
      { id: 'a', point: em(0, 0) },
      { id: 'b', point: null },
    ]
    const blocks = [
      { id: 1, ring: rect(300, 400, 0, 100) },
      { id: 2, waypoints: [em(300, 200), em(400, 200), em(400, 300)] },
      { id: 3, ring: rect(300, 400, 400, 500) },
    ]
    const r = baseViewsheds({
      bases,
      blocks,
      assignment: { 1: 'a', 2: { baseId: 'a' }, 3: 'b' },
      elevationAt: flat,
      droneElevAtFor: (block) => (block.id === 2 ? null : () => 200),
    })
    expect(Object.keys(r)).toEqual(['1'])
    expect(r[1].visibleFrac).toBe(1)
    expect(baseViewsheds({ bases, blocks, assignment: {}, elevationAt: flat })).toEqual({})
    expect(
      baseViewsheds({
        bases: null,
        blocks: null,
        assignment: {},
        elevationAt: flat,
        droneElevAtFor: () => () => 1,
      }),
    ).toEqual({})
  })
})

describe('trabalhos das bacias por bloco', () => {
  const A = { id: 'ba', label: 'A', point: em(0, 0) }
  const blocks = [
    { id: 1, cellRing: rect(300, 500, 0, 200), waypoints: [] },
    { id: 2, ring: rect(500, 700, 0, 200) },
    { id: 3, waypoints: [em(0, 0)] },
    { id: 4, cellRing: rect(700, 900, 0, 200) },
  ]
  const layout = {
    hasBases: true,
    byBlock: {
      1: { baseId: 'ba', refElev: 100 },
      2: { baseId: 'ba', baseLabel: 'X', flightLabel: 'X-2', refElev: 100 },
      3: { baseId: 'ba', refElev: 100 },
      4: { baseId: 'zz', refElev: 100 },
    },
  }

  test('sem a ordem dos voos, a dos blocos; sem base, sem anel ou com a base em falta, fora', () => {
    const jobs = viewshedJobs({ blocks, layout, bases: [A], altitudeM: 80, terrainFollow: false })
    expect(jobs.map((j) => j.blockId)).toEqual([1, 2])
    // o anel dado pelo bloco é o usado; os rótulos em falta vêm da base e do id
    expect(jobs[1].ring).toBe(blocks[1].ring)
    expect(jobs[0]).toMatchObject({ baseLabel: 'A', flightLabel: '1' })
    expect(jobs[1]).toMatchObject({ baseLabel: 'X', flightLabel: 'X-2' })
    const semRotulo = viewshedJobs({
      blocks,
      layout,
      bases: [{ id: 'ba', point: em(0, 0) }],
      altitudeM: 80,
      terrainFollow: false,
    })
    expect(semRotulo[0].baseLabel).toBe('')
    expect(viewshedJobs({ blocks, layout, bases: null, altitudeM: 80 })).toEqual([])
  })

  test('alturas e vegetação inválidas: as de omissão (a mesma chave)', () => {
    const base = { blocks, layout, bases: [A], altitudeM: 80, terrainFollow: false }
    const omissao = viewshedJobs({
      ...base,
      eyeHeightM: DEFAULT_EYE_HEIGHT_M,
      antennaHeightM: DEFAULT_ANTENNA_HEIGHT_M,
      obstacleM: 0,
      resolutionM: 0,
    })
    const invalidas = viewshedJobs({
      ...base,
      eyeHeightM: Number.NaN,
      antennaHeightM: null,
      obstacleM: Number.NaN,
      resolutionM: undefined,
    })
    expect(invalidas.map((j) => j.key)).toEqual(omissao.map((j) => j.key))
  })

  test('a corrida: uma base sem relevo no ponto dá erro nesse bloco e segue para o seguinte', () => {
    // relevo só a leste de 150 m: o olho em (0, 0) não tem cota
    const elevationAt = (lon) => (xOf(lon) > 150 ? 100 : null)
    const B = { id: 'bb', label: 'B', point: em(450, 300) }
    const dois = {
      hasBases: true,
      order: [1, 2],
      byBlock: {
        1: { baseId: 'ba', refElev: 100 },
        2: { baseId: 'bb', refElev: 100 },
      },
    }
    const jobs = viewshedJobs({
      blocks: blocks.slice(0, 2),
      layout: dois,
      bases: [A, B],
      altitudeM: 80,
      terrainFollow: false,
    })
    const run = createViewshedRun(jobs, { elevationAt })
    expect(run.step(() => false)).toBe(true)
    expect(run.results.get(jobs[0].key)).toEqual({ error: 'no-terrain' })
    expect(run.results.get(jobs[1].key).total).toBeGreaterThan(0)
    const { byBlock, ready } = viewshedsByBlock(jobs, run.results)
    expect(ready).toBe(true)
    expect(byBlock[1].summary.status).toBe('no-terrain')
    expect(byBlock[2].summary.status).toBe('ok')
  })

  test('a corrida em fatias pára no erro e retoma', () => {
    const elevationAt = (lon) => (xOf(lon) > 150 ? 100 : null)
    const jobs = viewshedJobs({ blocks: blocks.slice(0, 1), layout, bases: [A], altitudeM: 80 })
    const run = createViewshedRun(jobs, { elevationAt })
    // um passo: o erro conta como trabalho acabado e a corrida acaba
    expect(run.step(() => true)).toBe(true)
    expect(run.done()).toBe(true)
  })
})

describe('resumos e desenho com campos em falta', () => {
  test('resultado mínimo: sem tapados nem rádio; sem pontos, fracções a zero', () => {
    expect(viewSummary({ total: 8 })).toMatchObject({
      status: 'ok',
      total: 8,
      hidden: 0,
      unknown: 0,
      hiddenFrac: 0,
      visiblePct: 100,
      radioFail: 0,
      radioOkPct: 100,
      radioOnly: 0,
      radioAtM: null,
      eye: null,
    })
    expect(viewSummary({})).toMatchObject({ total: 0, hiddenFrac: 0, radioOnlyFrac: 0 })
    // a distância a que o relevo tapa: mediana (dois pontos: a média) à dezena
    const s = viewSummary({
      total: 4,
      hidden: [{ blockedAtM: 302 }, { blockedAtM: 338 }],
      eye: { point: em(3, 0), shiftM: 3, bearingDeg: 90 },
    })
    expect(s.blockedAtM).toBe(320)
    // o olho a menos de 5 m da base conta como na base
    expect(s.eye).toBeNull()
  })

  test('listas em falta: nada a desenhar nem a resumir', () => {
    expect(viewshedsByBlock(null, null)).toEqual({ byBlock: {}, pending: 0, ready: false })
    expect(gridStrips(null, 25)).toEqual([])
    expect(ringLabelPoint(null)).toBeNull()
    expect(zoneEyePoints(null, 50)).toEqual([])
    // passo inválido: o de omissão (25 m)
    const strips = gridStrips([em(0, 0), em(25, 0)], Number.NaN)
    expect(strips).toHaveLength(1)
    const [[s, w], [n, e]] = strips[0]
    expect((n - s) * M_PER_DEG_LAT).toBeCloseTo(25, 6)
    expect(xOf(e) - xOf(w)).toBeCloseTo(50, 6)
    expect(yOf(s)).toBeCloseTo(-12.5, 6)
  })
})
