// Mosaico refeito (angulo das faixas, lado, orientacao, tempo util, edicao
// da area): as atribuicoes manuais e as celulas desactivadas passam para as
// celulas novas por sobreposicao (src/mission/cellCarryOver.js); com a area
// substituida por outra, nada passa, e o que se perdeu e contado.
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import {
  CARRY_MIN_FRACTION,
  SAME_AREA_MIN_FRACTION,
  areaShift,
  carryOverCells,
  matchCells,
  sameArea,
} from '../../src/mission/cellCarryOver.js'
import { buildSquareMosaic } from '../../src/mission/squareMosaic.js'
import { ringToPolygon } from '../../src/utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const square = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]
const grid = (n, s, ox = 0, oy = 0, first = 1) => {
  const out = []
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      out.push({ id: first + j * n + i, ring: square(ox + i * s, oy + j * s, s) })
  return out
}
const area = [em(0, 0), em(1000, 0), em(1000, 1000), em(0, 1000)]

describe('mesma área?', () => {
  test('constantes: metade da célula, metade da menor área', () => {
    expect(CARRY_MIN_FRACTION).toBe(0.5)
    expect(SAME_AREA_MIN_FRACTION).toBe(0.5)
  })

  test('vértice arrastado ou área aumentada: a mesma área', () => {
    const bigger = [em(0, 0), em(3000, 0), em(3000, 1000), em(0, 1000)]
    expect(sameArea(area, bigger).same).toBe(true)
    expect(sameArea(bigger, area).same).toBe(true)
    const dragged = [em(0, 0), em(1300, -200), em(1000, 1000), em(0, 1000)]
    expect(sameArea(area, dragged).same).toBe(true)
  })

  test('área desenhada noutro sítio, ou com pouca sobreposição: outra área', () => {
    const away = area.map(([x, y]) => [x + 0.2, y + 0.1]).slice(0, 3) // triângulo longe
    expect(sameArea(area, away).same).toBe(false)
    // 30 % da menor em comum (outra forma: não é a mesma área movida)
    const other = [em(700, 0), em(1900, 0), em(1900, 1000), em(700, 1000)]
    const r = sameArea(area, other)
    expect(r.fraction).toBeCloseTo(0.3, 2)
    expect(r.same).toBe(false)
    // 60 % em comum: a mesma área, editada
    const edited = [em(400, 0), em(1600, 0), em(1600, 1000), em(400, 1000)]
    expect(sameArea(area, edited).same).toBe(true)
  })

  test('área movida inteira (a pega de mover): a mesma, com o deslocamento', () => {
    const d = [5000 / mLon, -3000 / M_PER_DEG_LAT]
    const moved = area.map(([x, y]) => [x + d[0], y + d[1]])
    const shift = areaShift(area, moved)
    expect(shift[0]).toBeCloseTo(d[0], 12)
    expect(shift[1]).toBeCloseTo(d[1], 12)
    const r = sameArea(area, moved)
    expect(r.same).toBe(true)
    expect(r.shift[0]).toBeCloseTo(d[0], 12)
    // um vértice fora do deslocamento comum (> 1 m) já não é translação
    const bent = moved.map((p, i) => (i === 2 ? [p[0] + 5 / mLon, p[1]] : p))
    expect(areaShift(area, bent)).toBeNull()
  })

  test('anéis inválidos: outra área', () => {
    expect(sameArea(null, area).same).toBe(false)
    expect(sameArea(area, [em(0, 0)]).same).toBe(false)
  })
})

describe('células novas herdam da antiga que cobre metade delas', () => {
  test('lado mais pequeno: cada quadrado novo herda do antigo onde está', () => {
    const old = grid(2, 500) // ids 1..4
    const neu = grid(4, 250) // ids 1..16
    const res = carryOverCells({
      oldRing: area,
      newRing: area,
      oldCells: old,
      newCells: neu,
      disabled: [2],
      manual: { 1: 'b1', 4: 'b2' },
    })
    expect(res.sameArea).toBe(true)
    expect(res.lost).toBe(0)
    // a célula antiga 1 (0..500, 0..500) cobre as novas 1, 2, 5, 6
    expect(
      Object.entries(res.manual)
        .filter(([, v]) => v === 'b1')
        .map(([k]) => Number(k)),
    ).toEqual([1, 2, 5, 6])
    expect(
      Object.entries(res.manual)
        .filter(([, v]) => v === 'b2')
        .map(([k]) => Number(k)),
    ).toEqual([11, 12, 15, 16])
    expect([...res.disabled].sort((a, b) => a - b)).toEqual([3, 4, 7, 8])
  })

  test('lado maior: nenhuma antiga cobre metade de uma nova; perdidas e contadas', () => {
    const old = grid(4, 250)
    const neu = grid(2, 500)
    const res = carryOverCells({
      oldRing: area,
      newRing: area,
      oldCells: old,
      newCells: neu,
      disabled: [1],
      manual: { 1: 'b1', 2: 'b1', 16: 'b2' },
    })
    expect(res.manual).toEqual({})
    expect(res.disabled.size).toBe(0)
    expect(res.lost).toBe(3)
  })

  test('grelha deslocada um pouco: herda a que cobre mais de metade', () => {
    const old = grid(2, 500)
    const neu = grid(2, 500, 120, -80)
    const res = carryOverCells({
      oldRing: area,
      newRing: area,
      oldCells: old,
      newCells: neu,
      manual: { 1: 'b1', 2: 'b2', 3: 'b3', 4: 'b4' },
    })
    expect(res.manual).toEqual({ 1: 'b1', 2: 'b2', 3: 'b3', 4: 'b4' })
    expect(res.lost).toBe(0)
  })

  test('mosaico real rodado (ângulo das faixas): só herda quem fica meio dentro', () => {
    const ring = [em(0, 0), em(1500, 0), em(1500, 1100), em(0, 1100)]
    const a = buildSquareMosaic(ring, { sideM: 250, orientationDeg: 0 })
    const b = buildSquareMosaic(ring, { sideM: 250, orientationDeg: 20 })
    const oldCells = a.cells.map((c, i) => ({ id: i + 1, ring: c.ring }))
    const newCells = b.cells.map((c, i) => ({ id: i + 1, ring: c.ring }))
    const manual = Object.fromEntries(oldCells.map((c) => [String(c.id), `b${(c.id % 3) + 1}`]))
    const res = carryOverCells({ oldRing: ring, newRing: ring, oldCells, newCells, manual })
    expect(Object.keys(res.manual).length).toBeGreaterThan(0)
    expect(res.lost).toBeGreaterThan(0)
    // verificação independente com o turf: cada herança tem uma antiga que
    // cobre pelo menos metade, com a base dessa antiga
    const poly = (r) => ringToPolygon(r)
    for (const cell of newCells) {
      const A = turf.area(poly(cell.ring))
      const cover = oldCells.map((o) => {
        const x = turf.intersect(turf.featureCollection([poly(cell.ring), poly(o.ring)]))
        return { o, f: x ? turf.area(x) / A : 0 }
      })
      const best = cover.reduce((m, c) => (c.f > m.f ? c : m))
      if (best.f >= 0.51) expect(res.manual[String(cell.id)]).toBe(manual[String(best.o.id)])
      if (best.f <= 0.49) expect(res.manual[String(cell.id)]).toBeUndefined()
    }
    // perdidas = antigas que nenhuma nova herdou
    const heirs = matchCells(oldCells, newCells)
    const inherited = new Set(heirs.values())
    expect(res.lost).toBe(oldCells.filter((o) => !inherited.has(String(o.id))).length)
  })

  test('área substituída por outra (pouca sobreposição): nada passa, tudo contado', () => {
    const old = grid(2, 500)
    const other = [em(800, 0), em(1800, 0), em(1800, 1100), em(800, 1100)]
    const neu = grid(2, 500, 800, 0)
    const res = carryOverCells({
      oldRing: area,
      newRing: other,
      oldCells: old,
      newCells: neu,
      disabled: [2],
      manual: { 2: 'b1', 4: 'b2' },
    })
    // a célula antiga 2 (500..1000) cobre metade da nova 1 (800..1300)? não
    // interessa: a área é outra (20 % em comum) e nada passa
    expect(res.sameArea).toBe(false)
    expect(res.manual).toEqual({})
    expect(res.disabled.size).toBe(0)
    expect(res.lost).toBe(2)
  })

  test('área movida inteira: tudo passa pelo mesmo índice', () => {
    const d = [4000 / mLon, 2500 / M_PER_DEG_LAT]
    const mv = (r) => r.map(([x, y]) => [x + d[0], y + d[1]])
    const old = grid(2, 500)
    const neu = old.map((c) => ({ id: c.id, ring: mv(c.ring) }))
    const res = carryOverCells({
      oldRing: area,
      newRing: mv(area),
      oldCells: old,
      newCells: neu,
      disabled: [3],
      manual: { 1: 'b1', 3: 'b2' },
    })
    expect(res.manual).toEqual({ 1: 'b1', 3: 'b2' })
    expect([...res.disabled]).toEqual([3])
    expect(res.lost).toBe(0)
  })

  test('atribuições a células que não existiam no mosaico antigo não contam', () => {
    const res = carryOverCells({
      oldRing: area,
      newRing: area,
      oldCells: grid(2, 500),
      newCells: grid(2, 500),
      manual: { 99: 'b1' },
    })
    expect(res.lost).toBe(0)
    expect(res.manual).toEqual({})
  })

  test('sem células antigas: nada a herdar, nada contado', () => {
    const res = carryOverCells({
      oldRing: null,
      newRing: area,
      oldCells: null,
      newCells: grid(2, 500),
      manual: { 1: 'b1' },
    })
    expect(res.manual).toEqual({})
    expect(res.lost).toBe(0) // não havia células antigas a que a atribuição se referisse
  })

  test('~150 células todas atribuídas em tempo útil', () => {
    const ring = [em(0, 0), em(4500, 0), em(4500, 3000), em(0, 3000)]
    const a = buildSquareMosaic(ring, { sideM: 300, orientationDeg: 0 })
    const b = buildSquareMosaic(ring, { sideM: 290, orientationDeg: 5 })
    const oldCells = a.cells.map((c, i) => ({ id: i + 1, ring: c.ring }))
    const newCells = b.cells.map((c, i) => ({ id: i + 1, ring: c.ring }))
    expect(oldCells.length).toBeGreaterThan(140)
    const manual = Object.fromEntries(oldCells.map((c) => [String(c.id), 'b1']))
    const t0 = performance.now()
    const res = carryOverCells({ oldRing: ring, newRing: ring, oldCells, newCells, manual })
    expect(performance.now() - t0).toBeLessThan(500)
    expect(Object.keys(res.manual).length).toBeGreaterThan(newCells.length / 2)
  })
})
