/**
 * Pontos de inspecção (src/utils/inspect.js, useInspection): a ordem de
 * visita sugerida pelo vizinho mais próximo, a partir da base mais próxima
 * quando a há; o arrastar-e-largar da lista; e os waypoints que vão para o
 * exportador (altura à décima, rumo e pitch próprios, espera e foto por
 * ponto). Nenhuma das três altera a lista que recebe: o estado do hook só
 * muda com a lista nova.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import {
  inspectionToWaypoints,
  nearestNeighbourOrder,
  reorderList,
} from '../../src/utils/inspect.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const P = (label, x, y, extra = {}) => ({ id: label, label, point: em(x, y), ...extra })
const dist = (a, b) => turf.distance(a, b, { units: 'meters' })
const labels = (pts) => pts.map((p) => p.label).join(',')

describe('ordem de visita pelo vizinho mais próximo', () => {
  test('a partir da base: sempre o mais próximo ainda por visitar', () => {
    const pts = [P('P400', 400, 0), P('P0', 0, 0), P('P300', 300, 0), P('P100', 100, 0)]
    expect(labels(nearestNeighbourOrder(pts, em(-50, 0)))).toBe('P0,P100,P300,P400')
    // base do outro lado: a ordem inverte
    expect(labels(nearestNeighbourOrder(pts, em(450, 0)))).toBe('P400,P300,P100,P0')
    // a lista do hook fica como estava
    expect(labels(pts)).toBe('P400,P0,P300,P100')
  })

  test('sem base começa no primeiro ponto da lista', () => {
    const pts = [P('P200', 200, 0), P('P0', 0, 0), P('P250', 250, 0), P('P50', 50, 0)]
    expect(labels(nearestNeighbourOrder(pts))).toBe('P200,P250,P50,P0')
  })

  test('guloso, não óptimo: o vizinho mais próximo pode deixar um ponto para o fim', () => {
    // da base vai a A (30 m), depois a B (60 m); C, a 70 m da base para o
    // outro lado, fica para o fim: 30 + 60 + 160 m contra 70 + 100 + 60 m
    const pts = [P('C', -70, 0), P('A', 30, 0), P('B', 90, 0)]
    const ordem = nearestNeighbourOrder(pts, em(0, 0))
    expect(labels(ordem)).toBe('A,B,C')
    const comprimento = (lista) =>
      lista.reduce((s, p, i) => s + dist(i ? lista[i - 1].point : em(0, 0), p.point), 0)
    expect(comprimento(ordem)).toBeGreaterThan(comprimento([pts[0], pts[1], pts[2]]))
  })

  test('até dois pontos sem base: a mesma ordem, numa lista nova', () => {
    const dois = [P('B', 100, 0), P('A', 0, 0)]
    const r = nearestNeighbourOrder(dois)
    expect(r).toEqual(dois)
    expect(r).not.toBe(dois)
    expect(nearestNeighbourOrder([])).toEqual([])
    // com base, mesmo dois pontos se reordenam
    expect(labels(nearestNeighbourOrder(dois, em(-10, 0)))).toBe('A,B')
  })

  test('pontos no mesmo sítio ficam pela ordem da lista; sem lista, vazio', () => {
    const pts = [P('X', 50, 0), P('Y', 50, 0), P('Z', 0, 0)]
    expect(labels(nearestNeighbourOrder(pts, em(60, 0)))).toBe('X,Y,Z')
    expect(nearestNeighbourOrder(null)).toEqual([])
    expect(nearestNeighbourOrder(undefined, em(0, 0))).toEqual([])
  })

  test('propriedade: os mesmos pontos, e cada um o mais próximo do anterior entre os que faltavam', () => {
    const ponto = fc
      .tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 }))
      .map(([x, y]) => ({ point: em(x, y) }))
    fc.assert(
      fc.property(
        fc.array(ponto, { minLength: 3, maxLength: 9 }),
        fc.option(fc.integer({ min: -600, max: 600 }), { nil: null }),
        (pts, bx) => {
          const start = bx === null ? null : em(bx, 0)
          const r = nearestNeighbourOrder(pts, start)
          expect(r).toHaveLength(pts.length)
          expect(new Set(r)).toEqual(new Set(pts))
          let cursor = start ?? pts[0].point
          const faltam = new Set(pts)
          for (const p of r) {
            const melhor = Math.min(...[...faltam].map((q) => dist(cursor, q.point)))
            expect(dist(cursor, p.point)).toBeCloseTo(melhor, 9)
            faltam.delete(p)
            cursor = p.point
          }
        },
      ),
    )
  })
})

describe('arrastar e largar na lista', () => {
  test('move o elemento para a posição pedida, numa lista nova', () => {
    const lista = ['a', 'b', 'c', 'd']
    expect(reorderList(lista, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderList(lista, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(reorderList(lista, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(lista).toEqual(['a', 'b', 'c', 'd'])
  })

  test('índices inválidos ou iguais devolvem a mesma lista (o estado não muda)', () => {
    const lista = ['a', 'b', 'c']
    for (const [from, to] of [
      [1, 1],
      [0, 3],
      [3, 0],
      [-1, 0],
      [0, -1],
      [0.5, 1],
      [0, 1.5],
      ['0', 1],
      [0, Number.NaN],
      [null, 1],
    ])
      expect(reorderList(lista, from, to)).toBe(lista)
    expect(reorderList(null, 0, 1)).toEqual([])
    expect(reorderList('ab', 0, 1)).toEqual([])
  })

  test('propriedade: os mesmos elementos, o movido no destino, e o movimento inverso desfaz', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.integer(), { minLength: 2, maxLength: 12 })
          .chain((l) =>
            fc.tuple(
              fc.constant(l),
              fc.integer({ min: 0, max: l.length - 1 }),
              fc.integer({ min: 0, max: l.length - 1 }),
            ),
          ),
        ([lista, from, to]) => {
          const r = reorderList(lista, from, to)
          expect([...r].sort()).toEqual([...lista].sort())
          expect(r[to]).toBe(lista[from])
          expect(reorderList(r, to, from)).toEqual(lista)
        },
      ),
    )
  })
})

describe('pontos para o exportador', () => {
  test('altura à décima, 30 m sem altura; rumo e pitch 0 contam; sem foto, sem acção', () => {
    const { waypoints, perWaypoint } = inspectionToWaypoints([
      P('a', 0, 0, { heightM: 41.26, heading: 0, gimbalPitch: 0 }),
      P('b', 50, 0, { photo: false, heading: null, gimbalPitch: undefined }),
      P('c', 100, 0, { heightM: 12, hoverS: 2.5 }),
    ])
    expect(waypoints.map((w) => w[2])).toEqual([41.3, 30, 12])
    expect(waypoints[0].slice(0, 2)).toEqual(em(0, 0))
    expect(perWaypoint).toEqual([
      { heading: 0, gimbalPitch: 0, actions: ['takePhoto'] },
      { actions: [] },
      { hoverS: 2.5, actions: ['takePhoto'] },
    ])
  })

  test('espera de 0, negativa ou que não é número não entra', () => {
    const { perWaypoint } = inspectionToWaypoints(
      [0, -3, Number.NaN, '4', Number.POSITIVE_INFINITY].map((hoverS, i) =>
        P(`h${i}`, i * 10, 0, { hoverS }),
      ),
    )
    expect(perWaypoint.every((pw) => !('hoverS' in pw))).toBe(true)
  })

  test('um ponto sem coordenadas sai das duas listas, que ficam alinhadas', () => {
    const { waypoints, perWaypoint } = inspectionToWaypoints([
      P('a', 0, 0, { heading: 10 }),
      { id: 'sem', point: null, heading: 20 },
      P('c', 100, 0, { heading: 30 }),
    ])
    expect(waypoints).toHaveLength(2)
    expect(perWaypoint.map((pw) => pw.heading)).toEqual([10, 30])
    expect(inspectionToWaypoints(null)).toEqual({ waypoints: [], perWaypoint: [] })
    expect(inspectionToWaypoints(undefined)).toEqual({ waypoints: [], perWaypoint: [] })
  })
})
