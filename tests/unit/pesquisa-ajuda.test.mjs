/*
 * A pesquisa da ajuda (src/utils/textSearch.js): os termos de uma pesquisa
 * e os intervalos onde aparecem, sem distinguir maiúsculas nem acentos, no
 * princípio de uma palavra. Os intervalos são do texto ORIGINAL (com
 * acentos), que é o que a janela realça; os termos juntam-se quando se tocam.
 */
import { describe, expect, test } from 'vitest'
import { findTerms, searchTerms } from '../../src/utils/textSearch.js'

describe('termos da pesquisa', () => {
  test('palavras sem acentos, em minúsculas e sem repetidos', () => {
    expect(searchTerms('RTH')).toEqual(['rth'])
    expect(searchTerms('  Segurança   ACÇÃO ')).toEqual(['seguranca', 'accao'])
    expect(searchTerms('base Base BASE')).toEqual(['base'])
    expect(searchTerms('Ctrl+Z')).toEqual(['ctrl+z'])
  })

  test('menos de duas letras não procura nada', () => {
    expect(searchTerms('')).toEqual([])
    expect(searchTerms(' z ')).toEqual([])
    expect(searchTerms(null)).toEqual([])
    expect(searchTerms(undefined)).toEqual([])
    // duas letras já procuram, mesmo separadas
    expect(searchTerms('a b')).toEqual(['a', 'b'])
  })
})

describe('onde aparecem', () => {
  test('sem maiúsculas nem acentos, com as posições do texto original', () => {
    const text = 'Acções de segurança: RTH no fim; o rth é o regresso.'
    const { ranges, counts } = findTerms(text, ['rth', 'seguranca', 'accoes'])
    expect(counts).toEqual([2, 1, 1])
    expect(ranges.map(([a, b]) => text.slice(a, b))).toEqual(['Acções', 'segurança', 'RTH', 'rth'])
  })

  test('só no princípio de uma palavra: «rth» não está em «Earth», «descola» está em «descolagem»', () => {
    const text = 'Google Earth; zona de descolagem; KMZ por voo (missao_area-tf_A-1.kmz)'
    const { ranges, counts } = findTerms(text, ['rth', 'descola', 'kmz', 'colagem'])
    expect(counts).toEqual([0, 1, 2, 0])
    expect(ranges.map(([a, b]) => text.slice(a, b))).toEqual(['descola', 'KMZ', 'kmz'])
  })

  test('um termo ausente conta zero e não acende nada', () => {
    const { ranges, counts } = findTerms('Exportar KMZ', ['kml', 'kmz'])
    expect(counts).toEqual([0, 1])
    expect(ranges).toEqual([[9, 12]])
  })

  test('termos que se sobrepõem ou se tocam ficam num só intervalo', () => {
    const text = 'zona de descolagem'
    const { ranges, counts } = findTerms(text, ['descola', 'desc', 'de'])
    expect(counts).toEqual([1, 1, 2])
    expect(ranges.map(([a, b]) => text.slice(a, b))).toEqual(['de', 'descola'])
    // encostados: «ab» + «-cd» em «ab-cd»
    expect(findTerms('ab-cd', ['ab', '-cd']).ranges).toEqual([[0, 5]])
  })

  test('um termo não se conta duas vezes dentro da mesma palavra', () => {
    expect(findTerms('aaaa', ['aa']).counts).toEqual([1])
    expect(findTerms('aaaa', ['aa']).ranges).toEqual([[0, 2]])
    expect(findTerms('aa aa', ['aa']).ranges).toEqual([
      [0, 2],
      [3, 5],
    ])
  })

  test('letras decompostas no texto contam como a letra sem acento', () => {
    const text = 'Configuração'
    const { ranges, counts } = findTerms(text, ['configuracao'])
    expect(counts).toEqual([1])
    expect(ranges).toEqual([[0, text.length]])
  })

  test('sem termos, ou com um termo vazio, não há intervalos', () => {
    expect(findTerms('qualquer texto', [])).toEqual({ ranges: [], counts: [] })
    expect(findTerms('qualquer texto', [''])).toEqual({ ranges: [], counts: [0] })
  })
})
