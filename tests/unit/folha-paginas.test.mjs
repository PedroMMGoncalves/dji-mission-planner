/**
 * As páginas da folha A4 de uma base (src/utils/sheetPages.js): uma página
 * tal como está, ou com a letra reduzida até 0,75; com mais voos, páginas de
 * propósito, com os blocos inteiros e as tabelas partidas entre linhas. Uma
 * base com 20 voos imprimia-se em duas páginas cortadas a meio de um bloco,
 * com o rodapé a dizer «(1 de 1)».
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { paginateSheet } from '../../src/utils/sheetPages.js'

const O = { cap: 1000, gap: 8, footer: 50, cont: 30 }
const linhas = (n, h = 40) => Array.from({ length: n }, () => h)
const tabela = (id, n, head = 40, h = 40) => ({ id, h: head + n * h, head, rows: linhas(n, h) })

describe('folha A4 da base: páginas', () => {
  test('cabe numa página: letra normal; um pouco maior: a letra reduz-se até 0,75', () => {
    expect(paginateSheet([{ id: 'a', h: 400 }, tabela('t', 5)], O)).toEqual({
      zoom: 1,
      pages: null,
    })
    // 300 + 300 + 440 + 200 + 4 intervalos + rodapé = 1322: 0,75
    const blocos = [{ id: 'a', h: 300 }, { id: 'b', h: 300 }, tabela('t', 10), { id: 'c', h: 200 }]
    expect(paginateSheet(blocos, O)).toEqual({ zoom: 0.75, pages: null })
    expect(paginateSheet([], O)).toEqual({ zoom: 1, pages: null })
  })

  test('com mais voos, páginas de propósito: a tabela parte-se entre linhas e o resto segue', () => {
    const blocos = [{ id: 'a', h: 300 }, { id: 'b', h: 300 }, tabela('t', 20), { id: 'c', h: 200 }]
    expect(paginateSheet(blocos, O)).toEqual({
      zoom: 1,
      pages: [
        [{ id: 'a' }, { id: 'b' }, { id: 't', from: 0, to: 7 }],
        [{ id: 't', from: 7, to: 20 }, { id: 'c' }],
      ],
    })
  })

  test('o cabeçalho da tabela não fica sozinho no fim da página, e um bloco grande fica sozinho', () => {
    const o = { ...O, minZoom: 0.95 }
    expect(paginateSheet([{ id: 'a', h: 900 }, tabela('t', 2)], o).pages).toEqual([
      [{ id: 'a' }],
      [{ id: 't', from: 0, to: 2 }],
    ])
    expect(
      paginateSheet(
        [
          { id: 'x', h: 2000 },
          { id: 'y', h: 100 },
        ],
        O,
      ).pages,
    ).toEqual([[{ id: 'x' }], [{ id: 'y' }]])
    // uma tabela sem cabeçalho parte-se só pelas linhas
    expect(paginateSheet([{ id: 't', h: 1400, rows: [700, 700] }], O).pages).toEqual([
      [{ id: 't', from: 0, to: 1 }],
      [{ id: 't', from: 1, to: 2 }],
    ])
    // uma linha maior do que a página vai sozinha, e a tabela continua na seguinte
    expect(paginateSheet([{ id: 't', h: 2100, head: 40, rows: [40, 1980, 40] }], O).pages).toEqual([
      [{ id: 't', from: 0, to: 1 }],
      [{ id: 't', from: 1, to: 2 }],
      [{ id: 't', from: 2, to: 3 }],
    ])
  })

  test('propriedade: os blocos todos, pela ordem, as linhas uma vez cada, e cada página cabe', () => {
    const bloco = fc.oneof(
      fc.integer({ min: 20, max: 420 }).map((h) => ({ h })),
      fc
        .record({
          head: fc.integer({ min: 20, max: 60 }),
          rows: fc.array(fc.integer({ min: 20, max: 70 }), { minLength: 1, maxLength: 30 }),
        })
        .map(({ head, rows }) => ({ head, rows, h: head + rows.reduce((a, b) => a + b, 0) })),
    )
    fc.assert(
      fc.property(
        fc.array(bloco, { maxLength: 9 }),
        fc.integer({ min: 0, max: 16 }),
        fc.integer({ min: 20, max: 90 }),
        fc.integer({ min: 0, max: 40 }),
        (bs, gap, footer, cont) => {
          const blocks = bs.map((b, i) => ({ ...b, id: `b${i}` }))
          const o = { cap: 1036, gap, footer, cont }
          const { zoom, pages } = paginateSheet(blocks, o)
          const total = blocks.reduce((a, b) => a + b.h, 0) + gap * blocks.length + footer
          if (!pages) {
            expect(zoom).toBeGreaterThanOrEqual(0.75)
            expect(zoom).toBeLessThanOrEqual(1)
            if (zoom === 1) expect(total).toBeLessThanOrEqual(1036)
            return
          }
          expect(zoom).toBe(1)
          // a ordem e as linhas
          const pecas = pages.flat()
          let k = 0
          for (const b of blocks) {
            if (!b.rows) {
              expect(pecas[k++]).toEqual({ id: b.id })
              continue
            }
            let de = 0
            while (de < b.rows.length) {
              const p = pecas[k++]
              expect(p.id).toBe(b.id)
              expect(p.from).toBe(de)
              expect(p.to).toBeGreaterThan(de)
              de = p.to
            }
            expect(de).toBe(b.rows.length)
          }
          expect(k).toBe(pecas.length)
          // cada página cabe até ao rodapé, ou leva uma só peça (maior do que a página)
          const altura = (p) => {
            const b = blocks.find((x) => x.id === p.id)
            if (!b.rows) return b.h
            return b.head + b.rows.slice(p.from, p.to).reduce((a, c) => a + c, 0)
          }
          pages.forEach((pg, i) => {
            expect(pg.length).toBeGreaterThan(0)
            let h = i > 0 ? cont : 0
            for (const p of pg) h += (h > 0 ? gap : 0) + altura(p)
            if (pg.length > 1) expect(h).toBeLessThanOrEqual(1036 - gap - footer)
          })
        },
      ),
      { numRuns: 300 },
    )
  })
})
