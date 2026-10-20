/**
 * Concluir um desenho (src/mission/draft.js, finishDraft): o polígono da
 * área, o eixo do corredor e a linha de base da fachada fecham com o
 * duplo-clique, que deixa no fim um vértice repetido (o 2.º clique). Os
 * vértices quase-duplicados consecutivos saem e o desenho só se aceita com
 * o mínimo de vértices: 3 no polígono (useAreaGeometry), 2 numa linha
 * (useCorridorMission, useFaceMission).
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { finishDraft } from '../../src/mission/draft.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const EPS = 1e-6
const near = (a, b) => Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS

describe('concluir um desenho', () => {
  test('polígono fechado com duplo-clique: o 2.º clique sai e ficam os três vértices', () => {
    const [a, b, c] = [em(0, 0), em(100, 0), em(100, 80)]
    const draft = [a, b, c, [c[0] + 4e-7, c[1] - 3e-7]]
    expect(finishDraft(draft, 3)).toEqual({ ok: true, clean: [a, b, c] })
    // o desenho do hook não muda: só se lê
    expect(draft).toHaveLength(4)
  })

  test('dois vértices e o duplo-clique: não chegam a polígono, chegam a eixo', () => {
    const [a, b] = [em(0, 0), em(250, 40)]
    const draft = [a, b, [...b]]
    expect(finishDraft(draft, 3)).toEqual({ ok: false, clean: [a, b] })
    expect(finishDraft(draft, 2)).toEqual({ ok: true, clean: [a, b] })
    // um só clique repetido não é um eixo
    expect(finishDraft([a, [...a]], 2)).toEqual({ ok: false, clean: [a] })
  })

  test('tolerância: até eps nas duas coordenadas é o mesmo clique; acima, num só eixo, é outro vértice', () => {
    const o = [-9.14, 38.7]
    expect(finishDraft([o, [o[0] + EPS, o[1] - EPS]], 1).clean).toEqual([o])
    expect(finishDraft([o, [o[0] + 1.5e-6, o[1]]], 1).clean).toHaveLength(2)
    expect(finishDraft([o, [o[0], o[1] - 1.5e-6]], 1).clean).toHaveLength(2)
    // eps maior: 5 m a leste (~5,8e-5 graus) passam a ser o mesmo clique
    const cinco = em(5, 0)
    expect(finishDraft([em(0, 0), cinco], 2).ok).toBe(true)
    expect(finishDraft([em(0, 0), cinco], 2, 1e-4)).toEqual({ ok: false, clean: [em(0, 0)] })
  })

  test('só os consecutivos: voltar ao primeiro vértice não o apaga', () => {
    const [a, b, c] = [em(0, 0), em(100, 0), em(50, 90)]
    expect(finishDraft([a, b, c, [...a]], 3)).toEqual({ ok: true, clean: [a, b, c, a] })
  })

  test('sem desenho: nada para concluir', () => {
    for (const d of [null, undefined, 'abc', { 0: [1, 2] }, []])
      expect(finishDraft(d, 2)).toEqual({ ok: false, clean: [] })
    // o mínimo é o do chamador
    expect(finishDraft([], 0)).toEqual({ ok: true, clean: [] })
  })

  test('três cliques no mesmo sítio, o 2.º para um lado e o 3.º para o outro: um só vértice', () => {
    // comparar com o vértice anterior do desenho, e não com o último que
    // ficou, deixava dois vértices a 2 cm um do outro, e o corredor aceitava
    // esse eixo de um só ponto
    const a = em(0, 0)
    const draft = [a, [a[0] + 9e-7, a[1]], [a[0] - 2e-7, a[1]]]
    expect(finishDraft(draft, 2)).toEqual({ ok: false, clean: [a] })
  })

  test('propriedade: o resultado é o desenho sem os cliques repetidos, sem quase-duplicados seguidos', () => {
    // cliques à volta de poucos sítios, com tremores abaixo e acima da tolerância
    const site = fc.constantFrom(em(0, 0), em(80, 0), em(80, 60))
    const jitter = fc.constantFrom(0, 4e-7, -4e-7, 9e-7, -9e-7, 2e-6, -2e-6)
    const click = fc.tuple(site, jitter, jitter).map(([s, dx, dy]) => [s[0] + dx, s[1] + dy])
    fc.assert(
      fc.property(
        fc.array(click, { maxLength: 12 }),
        fc.integer({ min: 0, max: 4 }),
        (pts, min) => {
          const { ok, clean } = finishDraft(pts, min)
          expect(ok).toBe(clean.length >= min)
          // o primeiro clique fica sempre; os outros pela ordem do desenho
          expect(clean[0]).toBe(pts[0])
          let j = -1
          for (const v of clean) {
            const k = pts.indexOf(v, j + 1)
            expect(k).toBeGreaterThan(j)
            j = k
          }
          // nenhum par seguido a menos de eps nas duas coordenadas
          for (let i = 1; i < clean.length; i++) expect(near(clean[i - 1], clean[i])).toBe(false)
          // e cada clique que saiu estava a menos de eps do último que ficou
          let last = null
          for (const v of pts) {
            if (clean.includes(v)) last = v
            else expect(near(last, v)).toBe(true)
          }
        },
      ),
    )
  })
})
