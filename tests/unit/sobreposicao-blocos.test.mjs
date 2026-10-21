/**
 * A sobreposição entre blocos no mapa (src/mission/blockOverlap.js): os
 * troços das linhas de um bloco que passam por cima da célula de outro bloco
 * desenham-se a tracejado. O buffer e os prolongamentos das faixas entram no
 * vizinho, e no mapa via-se só uma linha por cima da outra.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { blockLinePieces, ringBox, splitByCells } from '../../src/mission/blockOverlap.js'

const quadrado = (x0, y0, lado = 1) => [
  [x0, y0],
  [x0 + lado, y0],
  [x0 + lado, y0 + lado],
  [x0, y0 + lado],
  [x0, y0],
]
const celula = (x0, y0, lado) => ({ ring: quadrado(x0, y0, lado) })

describe('sobreposição entre blocos', () => {
  test('a caixa de um anel', () => {
    expect(ringBox(quadrado(2, -1, 3))).toEqual([2, -1, 5, 2])
  })

  test('uma linha que entra no vizinho: o troço dentro dele é sobreposição', () => {
    // a célula do bloco vai de x = 0 a 1; a do vizinho de 1 a 2; a linha
    // prolonga-se até 1,25
    const partes = splitByCells(
      [
        [0.1, 0.5],
        [1.25, 0.5],
      ],
      [celula(1, 0, 1)],
    )
    expect(partes).toEqual([
      {
        points: [
          [0.1, 0.5],
          [1, 0.5],
        ],
        overlap: false,
      },
      {
        points: [
          [1, 0.5],
          [1.25, 0.5],
        ],
        overlap: true,
      },
    ])
  })

  test('uma linha que atravessa o vizinho e sai do outro lado: três troços', () => {
    const partes = splitByCells(
      [
        [-0.5, 0.5],
        [2.5, 0.5],
      ],
      [celula(0, 0, 2)],
    )
    expect(partes.map((p) => p.overlap)).toEqual([false, true, false])
    expect(partes.map((p) => p.points.map((q) => q[0]))).toEqual([
      [-0.5, 0],
      [0, 2],
      [2, 2.5],
    ])
  })

  test('uma linha que não toca nenhuma célula, ou só lhe toca na aresta, volta inteira', () => {
    const linha = [
      [0, 0.5],
      [1, 0.5],
    ]
    // longe: a caixa nem toca
    expect(splitByCells(linha, [celula(5, 5, 1)])).toEqual([{ points: linha, overlap: false }])
    // ao longo da aresta de baixo do vizinho (paralela, colinear): não entra
    const rente = [
      [1, 0],
      [2, 0],
    ]
    expect(splitByCells(rente, [celula(1, 0, 1)])).toEqual([{ points: rente, overlap: false }])
  })

  test('uma linha de vários pontos junta os troços seguidos do mesmo tipo', () => {
    const partes = splitByCells(
      [
        [0.2, 0.5],
        [0.6, 0.5],
        [1.4, 0.5],
        [1.8, 0.5],
      ],
      [celula(1, 0, 1)],
    )
    expect(partes).toEqual([
      {
        points: [
          [0.2, 0.5],
          [0.6, 0.5],
          [1, 0.5],
        ],
        overlap: false,
      },
      {
        points: [
          [1, 0.5],
          [1.4, 0.5],
          [1.8, 0.5],
        ],
        overlap: true,
      },
    ])
  })

  test('por bloco: cada linha contra as células dos outros, nunca contra a sua', () => {
    const blocos = [
      {
        id: 1,
        cellRing: quadrado(0, 0, 1),
        lines: [
          [
            [-0.1, 0.5],
            [1.2, 0.5],
          ],
        ],
      },
      {
        id: 2,
        cellRing: quadrado(1, 0, 1),
        lines: [
          [
            [0.9, 0.25],
            [2.1, 0.25],
          ],
        ],
      },
    ]
    const porBloco = blockLinePieces(blocos)
    expect(porBloco.get(1)[0].map((p) => p.overlap)).toEqual([false, true])
    expect(porBloco.get(2)[0].map((p) => p.overlap)).toEqual([true, false])
    // sem células (a divisão por faixas) ou com um só bloco, as linhas inteiras
    const faixas = blocos.map(({ cellRing: _c, ...b }) => b)
    expect(blockLinePieces(faixas).get(1)).toEqual([
      [{ points: faixas[0].lines[0], overlap: false }],
    ])
    expect(blockLinePieces([blocos[0]]).get(1)).toEqual([
      [{ points: blocos[0].lines[0], overlap: false }],
    ])
    expect(blockLinePieces(null).size).toBe(0)
  })

  test('propriedade: os troços refazem a linha, pela ordem, e cada um está onde diz', () => {
    const coord = fc.double({ min: -3, max: 3, noNaN: true })
    const ponto = fc.tuple(coord, coord)
    fc.assert(
      fc.property(
        fc.array(ponto, { minLength: 2, maxLength: 5 }),
        fc.array(fc.tuple(coord, coord, fc.double({ min: 0.2, max: 2, noNaN: true })), {
          maxLength: 4,
        }),
        (linha, quadrados) => {
          const outros = quadrados.map(([x, y, l]) => celula(x, y, l))
          const partes = splitByCells(linha, outros)
          const perto = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
          // começa e acaba nos pontos da linha, e cada troço começa onde o anterior acabou
          if (partes.length === 0) return linha.every((p) => perto(p, linha[0]))
          if (!perto(partes[0].points[0], linha[0])) return false
          if (!perto(partes.at(-1).points.at(-1), linha.at(-1))) return false
          for (let i = 1; i < partes.length; i += 1) {
            if (!perto(partes[i].points[0], partes[i - 1].points.at(-1))) return false
            // troços seguidos do mesmo tipo juntam-se
            if (partes[i].overlap === partes[i - 1].overlap) return false
          }
          // o comprimento total é o da linha
          const comp = (pts) =>
            pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)
          const total = partes.reduce((s, p) => s + comp(p.points), 0)
          if (Math.abs(total - comp(linha)) >= 1e-9) return false
          // cada pedaço de cada troço está dentro de um vizinho se e só se o
          // troço é de sobreposição (o meio de cada pedaço, longe das arestas)
          const dentro = ([x, y]) =>
            quadrados.some(([x0, y0, l]) => x > x0 && x < x0 + l && y > y0 && y < y0 + l)
          const rente = ([x, y]) =>
            quadrados.some(
              ([x0, y0, l]) =>
                (Math.min(Math.abs(x - x0), Math.abs(x - x0 - l)) < 1e-9 &&
                  y >= y0 - 1e-9 &&
                  y <= y0 + l + 1e-9) ||
                (Math.min(Math.abs(y - y0), Math.abs(y - y0 - l)) < 1e-9 &&
                  x >= x0 - 1e-9 &&
                  x <= x0 + l + 1e-9),
            )
          return partes.every(({ points, overlap }) =>
            points.slice(1).every((b, i) => {
              const a = points[i]
              const meio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
              return rente(meio) || dentro(meio) === overlap
            }),
          )
        },
      ),
      { numRuns: 300 },
    )
  })
})
