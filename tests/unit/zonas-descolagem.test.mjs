// Zonas de descolagem: cada base e um circulo (descola-se a 20-100 m do
// ponto marcado). Cota de referencia = minima da zona, raio reduzido quando a
// zona apanha uma corta, VLOS e transito medidos do pior ponto da zona, e a
// proposta/atribuicao de bases para varios blocos.
import { describe, it, expect } from 'vitest'
import {
  assignBlocksToBases,
  baseLabel,
  blockWorstTransitM,
  blockWorstVlosM,
  computeTakeoffZone,
  distanceM,
  proposeBases,
  worstDistanceM,
} from '../../src/mission/takeoffZones.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
/** ponto a x m para leste e y m para norte da origem */
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const base = em(0, 0)

describe('computeTakeoffZone', () => {
  it('terreno plano: raio completo, desnivel 0, ganho 0', () => {
    const z = computeTakeoffZone(base, { elevationAt: () => 250 })
    expect(z).toMatchObject({
      requestedRadiusM: 100,
      radiusM: 100,
      reduced: false,
      refElev: 250,
      maxElev: 250,
      reliefM: 0,
      gainM: 0,
      cause: null,
    })
  })

  it('encosta uniforme: raio reduzido ao valor analitico e referencia na minima', () => {
    // 0,08 m/m para leste: desnivel num circulo de raio r = 2*0,08*r ≤ 10 -> r ≤ 62,5
    const elevationAt = (lon) => 200 + 0.08 * xOf(lon)
    const z = computeTakeoffZone(base, { elevationAt })
    expect(z.reduced).toBe(true)
    expect(z.radiusM).toBe(60)
    expect(z.refElev).toBeCloseTo(200 - 0.08 * 60, 3)
    expect(z.maxElev).toBeCloseTo(200 + 0.08 * 60, 3)
    expect(z.gainM).toBeCloseTo(9.6, 3)
    expect(z.reliefM).toBeLessThanOrEqual(10)
    expect(z.cause.atM).toBe(70)
    expect(z.cause.reliefM).toBeCloseTo(11.2, 3)
  })

  it('degrau de 40 m a 60 m para leste: raio abaixo de 60 e causa perto de 60 m', () => {
    const elevationAt = (lon) => (xOf(lon) > 59.9 ? 160 : 200)
    const z = computeTakeoffZone(base, { elevationAt })
    expect(z.radiusM).toBeLessThan(60)
    expect(z.radiusM).toBe(50)
    expect(z.refElev).toBe(200)
    expect(z.gainM).toBe(0)
    expect(z.cause.atM).toBeGreaterThanOrEqual(60)
    expect(z.cause.atM).toBeLessThanOrEqual(70)
    expect(z.cause.reliefM).toBeCloseTo(40, 6)
  })

  it('sem relevo no centro devolve erro', () => {
    expect(computeTakeoffZone(base, { elevationAt: () => null })).toEqual({ error: 'no-terrain' })
    expect(computeTakeoffZone(base, { elevationAt: null })).toEqual({ error: 'no-terrain' })
  })

  it('manchas sem dados sao ignoradas', () => {
    // sem dados a norte de 30 m; o resto plano
    const elevationAt = (lon, lat) => (yOf(lat) > 30 ? null : 120)
    const z = computeTakeoffZone(base, { elevationAt })
    expect(z.radiusM).toBe(100)
    expect(z.refElev).toBe(120)
    expect(z.gainM).toBe(0)
  })

  it('raio nao multiplo do passo e limite de desnivel configuravel', () => {
    const elevationAt = (lon) => 100 + 0.1 * xOf(lon)
    const z = computeTakeoffZone(base, { elevationAt, radiusM: 45, maxReliefM: 20 })
    expect(z.radiusM).toBe(45)
    expect(z.reduced).toBe(false)
    expect(z.gainM).toBeCloseTo(9, 3)
    // tudo a mais de 10 m: zona reduzida a 0 (so o centro)
    const z0 = computeTakeoffZone(base, { elevationAt: (lon) => 100 + 2 * xOf(lon) })
    expect(z0.radiusM).toBe(0)
    expect(z0.refElev).toBe(100)
    expect(z0.cause.atM).toBe(10)
  })
})

describe('pior caso da zona', () => {
  const zone = { point: base, radiusM: 100 }

  it('distancia no pior caso = distancia ao centro + raio', () => {
    expect(worstDistanceM(zone, em(500, 0))).toBeCloseTo(600, -1)
    expect(worstDistanceM({ point: base }, em(0, 300))).toBeCloseTo(300, -1)
    expect(worstDistanceM({ point: base, radiusM: 0 }, em(0, 300))).toBeCloseTo(300, -1)
  })

  it('VLOS do bloco: vertice mais afastado + raio', () => {
    const ring = [em(300, 0), em(700, 0), em(700, 300), em(300, 300)]
    expect(blockWorstVlosM(zone, ring)).toBeCloseTo(Math.hypot(700, 300) + 100, -1)
    // anel fechado da o mesmo
    expect(blockWorstVlosM(zone, [...ring, ring[0]])).toBeCloseTo(blockWorstVlosM(zone, ring), 9)
  })

  it('transito: ida ao primeiro waypoint e volta do ultimo, cada um com o raio', () => {
    const t = blockWorstTransitM(zone, em(400, 0), em(0, 300))
    expect(t).toBeCloseTo(400 + 100 + 300 + 100, -1)
  })

  it('aceita uma zona calculada', () => {
    const z = computeTakeoffZone(base, { elevationAt: () => 10, radiusM: 50 })
    expect(worstDistanceM(z, em(200, 0))).toBeCloseTo(250, -1)
  })

  it('distanceM coincide com a escala local a curta distancia', () => {
    expect(distanceM(em(0, 0), em(1000, 0)) / 1000).toBeCloseTo(1, 2)
  })
})

/** grelha de n x n quadrados de lado s, a partir da origem */
function grid(n, s, ox = 0, oy = 0) {
  const blocks = []
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = ox + i * s
      const y = oy + j * s
      blocks.push({
        id: j * n + i + 1,
        ring: [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)],
      })
    }
  return blocks
}

describe('proposeBases', () => {
  const blocks = grid(3, 660)

  it('grelha 3x3 de 660 m, VLOS 1000: tudo coberto, no maximo 5 bases', () => {
    const bases = proposeBases(blocks, { vlosM: 1000, radiusM: 100 })
    expect(bases.length).toBeLessThanOrEqual(5)
    expect(bases.map((b) => b.id)).toEqual(['A', 'B', 'C', 'D', 'E'].slice(0, bases.length))
    const all = bases.flatMap((b) => b.blockIds).sort((a, b) => a - b)
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const b of bases) {
      expect(b.outOfVlos).toBe(false)
      for (const id of b.blockIds) {
        const ring = blocks.find((k) => k.id === id).ring
        expect(blockWorstVlosM({ point: b.point, radiusM: 100 }, ring)).toBeLessThanOrEqual(1000)
      }
    }
  })

  it('o canto comum a quatro quadrados nao os cobre (660*sqrt(2)+100 > 1000)', () => {
    const corner = em(660, 660)
    for (const id of [1, 2, 4, 5]) {
      const ring = blocks.find((k) => k.id === id).ring
      expect(blockWorstVlosM({ point: corner, radiusM: 100 }, ring)).toBeGreaterThan(1000)
    }
    const bases = proposeBases(blocks, { vlosM: 1000, radiusM: 100 })
    expect(bases.every((b) => b.blockIds.length <= 2)).toBe(true)
  })

  it('5 bases tambem noutras latitudes e deslocamentos (sem depender de ruido numerico)', () => {
    for (const [ox, oy] of [
      [0, 0],
      [123.4, -987.6],
      [-5000, 3000],
    ]) {
      const bases = proposeBases(grid(3, 660, ox, oy), { vlosM: 1000, radiusM: 100 })
      expect(bases.length).toBe(5)
    }
  })

  it('VLOS 500: nenhum quadrado e coberto, uma base por bloco fora do VLOS', () => {
    const bases = proposeBases(blocks, { vlosM: 500, radiusM: 100 })
    expect(bases).toHaveLength(9)
    expect(bases.every((b) => b.outOfVlos && b.blockIds.length === 1)).toBe(true)
    const b1 = bases.find((b) => b.blockIds[0] === 1)
    expect(xOf(b1.point[0])).toBeCloseTo(330, 3)
    expect(yOf(b1.point[1])).toBeCloseTo(330, 3)
  })

  it('respeita o maximo de blocos por base', () => {
    const small = grid(4, 200)
    const free = proposeBases(small, { vlosM: 1000, radiusM: 100 })
    expect(free).toHaveLength(1)
    const capped = proposeBases(small, { vlosM: 1000, radiusM: 100, maxBlocksPerBase: 4 })
    expect(capped).toHaveLength(4)
    expect(capped.every((b) => b.blockIds.length <= 4)).toBe(true)
  })

  it('150 blocos em tempo util', () => {
    const many = []
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 15; i++) {
        const x = i * 300
        const y = j * 300
        many.push({
          id: `b${j}-${i}`,
          ring: [em(x, y), em(x + 300, y), em(x + 300, y + 300), em(x, y + 300)],
        })
      }
    const t0 = performance.now()
    const bases = proposeBases(many, { vlosM: 1000, radiusM: 100 })
    const dt = performance.now() - t0
    expect(dt).toBeLessThan(2000)
    expect(new Set(bases.flatMap((b) => b.blockIds)).size).toBe(150)
    expect(bases.every((b) => !b.outOfVlos)).toBe(true)
  })

  it('entradas vazias', () => {
    expect(proposeBases([], { vlosM: 1000 })).toEqual([])
    expect(proposeBases(blocks, { vlosM: 0 })).toEqual([])
  })

  it('rotulos A..Z, AA, AB', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(baseLabel)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
    ])
  })
})

describe('assignBlocksToBases', () => {
  const blocks = grid(3, 660)
  const bases = [
    { id: 'A', point: em(330, 660) }, // aresta entre os blocos 1 e 4
    { id: 'B', point: em(1650, 1650) }, // centro do bloco 9
  ]

  it('cada bloco vai para a base mais proxima que o ve dentro do VLOS', () => {
    const r = assignBlocksToBases(blocks, bases, { vlosM: 1000 })
    expect(r[1]).toMatchObject({ baseId: 'A', withinVlos: true, manual: false })
    expect(r[4]).toMatchObject({ baseId: 'A', withinVlos: true })
    expect(r[9]).toMatchObject({ baseId: 'B', withinVlos: true })
    expect(r[9].worstVlosM).toBeCloseTo(Math.hypot(330, 330) + 100, -1)
    // bloco 3 (canto SE): nenhuma base o ve inteiro -> a mais proxima, fora do VLOS
    expect(r[3].withinVlos).toBe(false)
  })

  it('mantem as escolhas manuais e reporta o VLOS', () => {
    const r = assignBlocksToBases(blocks, bases, { vlosM: 1000, manual: { 1: 'B', 9: 'X' } })
    expect(r[1]).toMatchObject({ baseId: 'B', manual: true, withinVlos: false })
    expect(r[1].worstVlosM).toBeGreaterThan(1000)
    // base manual inexistente: atribuicao automatica
    expect(r[9]).toMatchObject({ baseId: 'B', manual: false, withinVlos: true })
  })

  it('cada base pode ter o seu raio (zona reduzida)', () => {
    const r = assignBlocksToBases(blocks, [{ id: 'A', point: em(330, 330), radiusM: 0 }], {
      vlosM: 1000,
    })
    expect(r[1].worstVlosM).toBeCloseTo(Math.hypot(330, 330), -1)
    const r2 = assignBlocksToBases(blocks, [{ id: 'A', point: em(330, 330) }], { vlosM: 1000 })
    expect(r2[1].worstVlosM).toBeCloseTo(Math.hypot(330, 330) + 100, -1)
    expect(assignBlocksToBases(blocks, [], { vlosM: 1000 })).toEqual({})
  })
})
