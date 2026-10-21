/**
 * A sobreposição entre blocos no mapa: onde dois (ou mais) blocos voam a
 * mesma faixa (src/mission/blockOverlap.js), uma só linha às riscas nas
 * cores deles, com a espessura das cheias e cortes a 45°
 * (src/utils/stripes.js). As faixas de blocos vizinhos são colineares (a
 * mesma grelha), e no mapa via-se só uma linha por cima da outra.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { sharedStretches } from '../../src/mission/blockOverlap.js'
import { stripePolygons } from '../../src/utils/stripes.js'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../../src/utils/units.js'

// metros num plano local, à latitude de Lisboa
const lat0 = 38.7
const lon0 = -9.1
const mLon = metersPerDegLonSafe(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (p) => (p[0] - lon0) * mLon
const yOf = (p) => (p[1] - lat0) * M_PER_DEG_LAT
const faixa = (x0, x1, y = 0) => [em(x0, y), em(x1, y)]
const xs = (points) => points.map((p) => Math.round(xOf(p) * 100) / 100)
const comp = (points) =>
  Math.hypot(xOf(points[1]) - xOf(points[0]), yOf(points[1]) - yOf(points[0]))

describe('troços partilhados entre blocos', () => {
  test('dois blocos na mesma faixa: cheio, partilhado pelos dois, cheio', () => {
    const { solid, shared } = sharedStretches([
      { id: 1, lines: [faixa(0, 110)] },
      { id: 2, lines: [faixa(90, 200)] },
    ])
    expect(solid.get(1).map(xs)).toEqual([[0, 90]])
    expect(solid.get(2).map(xs)).toEqual([[110, 200]])
    expect(shared.map((s) => [xs(s.points), s.ids])).toEqual([
      [
        [90, 110],
        [1, 2],
      ],
    ])
  })

  test('faixas que só se tocam, ou a 5 m uma da outra, não se sobrepõem', () => {
    const toque = sharedStretches([
      { id: 1, lines: [faixa(0, 100)] },
      { id: 2, lines: [faixa(100, 200)] },
    ])
    expect(toque.shared).toEqual([])
    const lado = sharedStretches([
      { id: 1, lines: [faixa(0, 100, 0)] },
      { id: 2, lines: [faixa(0, 100, 5)] },
    ])
    expect(lado.shared).toEqual([])
    expect(lado.solid.get(2).map(xs)).toEqual([[0, 100]])
  })

  test('a cruzada (outra direcção) e o mesmo bloco duas vezes não contam', () => {
    const { solid, shared } = sharedStretches([
      { id: 1, lines: [faixa(0, 100), faixa(0, 100), [em(50, -50), em(50, 50)]] },
      { id: 2, lines: [[em(40, -50), em(40, 50)]] },
    ])
    expect(shared).toEqual([])
    expect(solid.get(1).length).toBe(2)
  })

  test('três blocos e linhas de vários pontos', () => {
    const { solid, shared } = sharedStretches([
      { id: 3, lines: [[em(0, 0), em(50, 0), em(120, 0)]] },
      { id: 1, lines: [faixa(100, 200)] },
      { id: 2, lines: [faixa(110, 150)] },
    ])
    expect(shared.map((s) => [xs(s.points), s.ids])).toEqual([
      [
        [100, 110],
        [1, 3],
      ],
      [
        [110, 120],
        [1, 2, 3],
      ],
      [
        [120, 150],
        [1, 2],
      ],
    ])
    expect(solid.get(3).map(xs)).toEqual([[0, 100]])
    expect(solid.get(2)).toEqual([])
    expect(sharedStretches(null).shared).toEqual([])
    expect(sharedStretches([{ id: 1, lines: [] }]).solid.get(1)).toBeUndefined()
  })

  test('propriedade: cada bloco continua a voar o mesmo comprimento', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 4 }),
            y: fc.constantFrom(0, 20, 40),
            a: fc.integer({ min: 0, max: 300 }),
            l: fc.integer({ min: 1, max: 200 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (segs) => {
          const ids = [...new Set(segs.map((s) => s.id))]
          const blocks = ids.map((id) => ({
            id,
            lines: segs.filter((s) => s.id === id).map((s) => faixa(s.a, s.a + s.l, s.y)),
          }))
          const { solid, shared } = sharedStretches(blocks)
          // o comprimento de cada bloco: a união das suas faixas, faixa a faixa
          const uniao = (id) => {
            let total = 0
            for (const y of [0, 20, 40]) {
              const iv = segs
                .filter((s) => s.id === id && s.y === y)
                .map((s) => [s.a, s.a + s.l])
                .sort((p, q) => p[0] - q[0])
              let cur = null
              for (const [a, b] of iv) {
                if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b)
                else {
                  if (cur) total += cur[1] - cur[0]
                  cur = [a, b]
                }
              }
              if (cur) total += cur[1] - cur[0]
            }
            return total
          }
          return ids.every((id) => {
            const cheio = (solid.get(id) ?? []).reduce((t, p) => t + comp(p), 0)
            const partilhado = shared
              .filter((s) => s.ids.includes(id))
              .reduce((t, s) => t + comp(s.points), 0)
            return Math.abs(cheio + partilhado - uniao(id)) < 0.05
          })
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('riscas a 45°', () => {
  const area = (pts) =>
    Math.abs(
      pts.reduce((a, p, i) => {
        const q = pts[(i + 1) % pts.length]
        return a + p[0] * q[1] - q[0] * p[1]
      }, 0) / 2,
    )

  test('cobrem a barra sem falhas nem sobreposições, à vez, com os topos direitos', () => {
    const riscas = stripePolygons([10, 20], [110, 20], { width: 4, stripe: 12 })
    const total = riscas.reduce((a, r) => a + area(r.points), 0)
    expect(total).toBeCloseTo(100 * 4, 6)
    // todas dentro da barra
    for (const r of riscas)
      for (const [x, y] of r.points) {
        expect(x).toBeGreaterThanOrEqual(10 - 1e-9)
        expect(x).toBeLessThanOrEqual(110 + 1e-9)
        expect(Math.abs(y - 20)).toBeLessThanOrEqual(2 + 1e-9)
      }
    // os índices seguidos (as cores à vez) e a primeira começa no início
    const idx = riscas.map((r) => r.index)
    expect(idx).toEqual(idx.map((_, i) => idx[0] + i))
    expect(Math.min(...riscas[0].points.map((p) => p[0]))).toBeCloseTo(10, 9)
  })

  test('as fronteiras entre riscas fazem 45° com a barra, em qualquer direcção', () => {
    const [p0, p1] = [
      [0, 0],
      [60, 80],
    ]
    const riscas = stripePolygons(p0, p1, { width: 6, stripe: 10 })
    const u = [0.6, 0.8]
    // uma risca do meio é um paralelogramo: as arestas que não seguem a
    // barra fazem 45° com ela
    const meio = riscas.find((r) => r.points.length === 4 && r.index === 4)
    const lados = meio.points
      .map((p, i) => {
        const q = meio.points[(i + 1) % 4]
        const d = [q[0] - p[0], q[1] - p[1]]
        const c = Math.abs(d[0] * u[0] + d[1] * u[1]) / Math.hypot(d[0], d[1])
        return Math.round((Math.acos(Math.min(1, c)) * 180) / Math.PI)
      })
      .sort((a, b) => a - b)
    expect(lados).toEqual([0, 0, 45, 45])
    expect(stripePolygons([0, 0], [0, 0], { width: 4, stripe: 12 })).toEqual([])
    expect(stripePolygons([0, 0], [10, 0], { width: 0, stripe: 12 })).toEqual([])
  })
})
