/**
 * Enquadramento da área no mapa (src/utils/mapFit.js): ao importar uma área
 * ou abrir um projecto, o mapa ajusta-se a ela por baixo da barra de
 * desenho e à esquerda do cartão das métricas aberto, como no ecrã
 * desenhado, em vez de ao centro com o cartão por cima da parte direita da
 * missão. Sem nada por cima fica a margem simétrica de sempre (60 px), e o
 * espaço livre nunca fica abaixo de metade do mapa.
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import { fitPadding } from '../../src/utils/mapFit.js'

/** O mapa do E2E (janela de 1500 × 950): à direita do painel, sob o cabeçalho. */
const MAPA = { left: 424, top: 103, right: 1500, bottom: 950 }
const BARRA = { left: 496, top: 119, right: 1029, bottom: 165 }
const CARTAO = { left: 1196, top: 119, right: 1484, bottom: 698 }

describe('margens do enquadramento', () => {
  test('sem nada por cima, a margem de sempre dos quatro lados', () => {
    expect(fitPadding(MAPA)).toEqual({ paddingTopLeft: [60, 60], paddingBottomRight: [60, 60] })
    expect(fitPadding(MAPA, { top: null, right: null })).toEqual(fitPadding(MAPA))
  })

  test('por baixo da barra de desenho e à esquerda do cartão aberto, com folga', () => {
    // 165 − 103 + 16 = 78 em cima; 1500 − 1196 + 16 = 320 à direita
    expect(fitPadding(MAPA, { top: BARRA, right: CARTAO })).toEqual({
      paddingTopLeft: [60, 78],
      paddingBottomRight: [320, 60],
    })
    expect(fitPadding(MAPA, { top: BARRA })).toEqual({
      paddingTopLeft: [60, 78],
      paddingBottomRight: [60, 60],
    })
  })

  test('o que fica perto da borda não baixa a margem de base', () => {
    const baixa = { ...BARRA, bottom: 120 }
    const estreito = { ...CARTAO, left: 1480 }
    expect(fitPadding(MAPA, { top: baixa, right: estreito })).toEqual(fitPadding(MAPA))
  })

  test('num mapa estreito o cartão aberto não deixa a área minúscula', () => {
    // janela de 1024: 600 px de mapa; o cartão pedia 320, fica em 240 (metade livre)
    const mapa = { left: 424, top: 103, right: 1024, bottom: 768 }
    const cartao = { left: 720, top: 173, right: 1008, bottom: 700 }
    const { paddingTopLeft, paddingBottomRight } = fitPadding(mapa, { right: cartao })
    expect(paddingBottomRight[0]).toBe(240)
    expect(600 - paddingTopLeft[0] - paddingBottomRight[0]).toBe(300)
  })

  test('margens e folga à escolha', () => {
    expect(fitPadding(MAPA, { top: BARRA, right: CARTAO }, { margin: 24, gap: 8 })).toEqual({
      paddingTopLeft: [24, 70],
      paddingBottomRight: [312, 24],
    })
  })

  test('qualquer mapa e quaisquer cartões: margens >= a de base e metade do mapa livre', () => {
    const lado = fc.integer({ min: 240, max: 4000 })
    fc.assert(
      fc.property(
        lado,
        lado,
        fc.option(fc.integer({ min: 0, max: 4000 })),
        fc.option(fc.integer({ min: 0, max: 4000 })),
        (w, h, baixo, esquerda) => {
          const mapa = { left: 100, top: 50, right: 100 + w, bottom: 50 + h }
          const top = baixo == null ? null : { left: 0, top: 0, right: 0, bottom: 50 + baixo }
          const right =
            esquerda == null ? null : { left: 100 + esquerda, top: 0, right: 0, bottom: 0 }
          const { paddingTopLeft: tl, paddingBottomRight: br } = fitPadding(mapa, { top, right })
          return (
            [...tl, ...br].every((v) => v >= 60) &&
            w - tl[0] - br[0] >= w / 2 - 1e-9 &&
            h - tl[1] - br[1] >= h / 2 - 1e-9
          )
        },
      ),
    )
  })
})
