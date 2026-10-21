/**
 * Duas funções puras da pré-visualização que só o smoke via: o preenchimento
 * dos buracos da grelha de relevo do 3D (src/utils/terrainGrid.js), por
 * propriedades — os conhecidos não mudam, cada passagem preenche uma camada
 * à volta dos dados e os preenchidos ficam entre os extremos conhecidos; o
 * que fica mais longe do que o número de passagens, ou tudo quando não há
 * dados, fica na cota de recurso —; e os traços de rumo do mapa (src/utils/preview.js): o
 * comprimento e a direcção, o corte à primeira passagem e os waypoints sem
 * rumo.
 */
import * as turf from '@turf/turf'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { headingTicks } from '../../src/utils/preview.js'
import { fillTerrainGaps } from '../../src/utils/terrainGrid.js'

describe('buracos na grelha de relevo do 3D', () => {
  test('propriedade: até tantas camadas quantas as colunas, entre os extremos conhecidos; mais longe, a cota de recurso', () => {
    const grelha = fc
      .record({ row: fc.integer({ min: 1, max: 9 }), rows: fc.integer({ min: 1, max: 9 }) })
      .chain(({ row, rows }) =>
        fc.record({
          row: fc.constant(row),
          z: fc.array(fc.double({ min: -50, max: 3000, noNaN: true }), {
            minLength: row * rows,
            maxLength: row * rows,
          }),
          known: fc.array(fc.boolean(), { minLength: row * rows, maxLength: row * rows }),
        }),
      )
    fc.assert(
      fc.property(grelha, ({ row, z, known }) => {
        fc.pre(known.some(Boolean))
        const zz = Float64Array.from(z)
        const k = Uint8Array.from(known, Number)
        fillTerrainGaps(zz, k, row, -9999)
        const conhecidos = z.filter((_, i) => known[i])
        const lo = Math.min(...conhecidos)
        const hi = Math.max(...conhecidos)
        // camada de cada vértice: a distância, em passos na grelha, ao dado mais perto
        const camada = (i) =>
          Math.min(
            ...known.flatMap((kj, j) =>
              kj
                ? [
                    Math.abs((i % row) - (j % row)) +
                      Math.abs(Math.floor(i / row) - Math.floor(j / row)),
                  ]
                : [],
            ),
          )
        zz.forEach((v, i) => {
          if (known[i]) expect(v).toBe(z[i])
          else if (camada(i) <= row) {
            // uma passagem por camada, até tantas quantas as colunas
            expect(v).toBeGreaterThanOrEqual(lo - 1e-9)
            expect(v).toBeLessThanOrEqual(hi + 1e-9)
          } else expect(v).toBe(-9999)
        })
      }),
      { numRuns: 200 },
    )
  })

  test('um buraco isolado fica na média dos quatro vizinhos; sem dados nenhuns, a cota de recurso', () => {
    // 3 × 3 com o centro em falta
    const z = Float64Array.from([0, 10, 0, 20, 0, 40, 0, 30, 0])
    const k = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1])
    fillTerrainGaps(z, k, 3, -1)
    expect(z[4]).toBe(25)
    const vazio = new Float64Array(6)
    fillTerrainGaps(vazio, new Uint8Array(6), 3, 250)
    expect([...vazio]).toEqual([250, 250, 250, 250, 250, 250])
    // nada em falta: nada muda
    const cheio = Float64Array.from([1, 2])
    fillTerrainGaps(cheio, Uint8Array.from([1, 1]), 2, 0)
    expect([...cheio]).toEqual([1, 2])
  })
})

describe('traços de rumo no mapa', () => {
  const wps = [
    [-8, 39.5, 10],
    [-7.999, 39.5, 10],
    [-7.998, 39.5, 10],
  ]

  test('um traço por waypoint com rumo, do tamanho e na direcção pedidos', () => {
    const t = headingTicks(wps, [{ heading: 90 }, { heading: 350 }, { heading: 180 }], {
      lengthM: 10,
    })
    expect(t).toHaveLength(3)
    for (const [from, to] of t) {
      expect(turf.distance(from, to, { units: 'meters' })).toBeCloseTo(10, 6)
    }
    expect(t[0][0]).toEqual([-8, 39.5])
    expect(turf.bearing(t[0][0], t[0][1])).toBeCloseTo(90, 3)
    // 350° sai como −10° (o turf quer [−180, 180])
    expect(turf.bearing(t[1][0], t[1][1])).toBeCloseTo(-10, 3)
    expect(Math.abs(turf.bearing(t[2][0], t[2][1]))).toBeCloseTo(180, 3)
  })

  test('corte à primeira passagem, waypoints sem rumo de fora, entradas que não são listas', () => {
    expect(headingTicks(wps, [{ heading: 0 }, {}, { heading: 0 }], { limit: 2 })).toHaveLength(1)
    expect(headingTicks(wps, [null, { heading: 0 }], { limit: 99 })).toHaveLength(1)
    expect(headingTicks(null, [])).toEqual([])
    expect(headingTicks(wps, null)).toEqual([])
    // por omissão, 8 m
    const [[a, b]] = headingTicks(wps.slice(0, 1), [{ heading: 45 }])
    expect(turf.distance(a, b, { units: 'meters' })).toBeCloseTo(8, 6)
  })
})
