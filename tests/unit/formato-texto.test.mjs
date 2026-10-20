/**
 * Formatação dos textos (src/i18n/format.js): o singular com 1 («1
 * necessário», e não «1 necessários») e um intervalo «a–b» que fica num só
 * valor quando as duas pontas, tal como se mostram, são iguais («150–150 m»
 * era o que a ficha dizia). E a guarda do dicionário: cada chave usada com
 * tCount tem a sua versão singular, com as mesmas variáveis ou menos, e
 * nenhum texto do dicionário leva um intervalo «{a}–{b}» que possa sair
 * com as duas pontas iguais.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import DICT, { translate } from '../../src/i18n.jsx'
import { missionExportLabel, rangeText, tCount } from '../../src/i18n/format.js'

const SRC = new URL('../../src/', import.meta.url).pathname
function sources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(js|jsx)$/.test(name)) out.push(p)
  }
  return out
}
const vars = (s) => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort()
const t = (key, v) => translate('pt', key, v)
const en = (key, v) => translate('en', key, v)

describe('intervalos «a–b»', () => {
  test('duas pontas diferentes ficam separadas; iguais ficam num só valor', () => {
    expect(rangeText(150, 180)).toBe('150–180')
    expect(rangeText(150, 150)).toBe('150')
  })

  test('comparam-se os valores como se mostram, depois do arredondamento', () => {
    expect(rangeText(149.6, 150.4, Math.round)).toBe('150')
    expect(rangeText(149.4, 150.4, Math.round)).toBe('149–150')
    expect(rangeText(2.691, 2.694, (v) => v.toFixed(2))).toBe('2.69')
    expect(rangeText(2.674, 2.704, (v) => v.toFixed(2))).toBe('2.67–2.70')
  })

  test('separador à escolha', () => {
    expect(rangeText(99.9, 100.1, (v) => v.toFixed(1), ' – ')).toBe('99.9 – 100.1')
    expect(rangeText(100.01, 100.04, (v) => v.toFixed(1), ' – ')).toBe('100.0')
  })

  test('as alturas da ficha: um só valor com a do 1.º waypoint igual à máxima', () => {
    expect(t('bases.sheet.heightsValue', { range: rangeText(150, 150, Math.round) })).toBe(
      '150 m (rel. à descolagem)',
    )
    expect(t('bases.sheet.heightsValue', { range: rangeText(150, 183.6, Math.round) })).toBe(
      '150–184 m (rel. à descolagem)',
    )
  })

  test('nenhum texto do dicionário leva um intervalo {a}–{b} fixo', () => {
    const fixos = Object.entries(DICT)
      .filter(([, v]) => /\{[a-zA-Z0-9_]+\}\s*[–-]\s*\{[a-zA-Z0-9_]+\}/.test(`${v.pt} ${v.en}`))
      .map(([k]) => k)
    expect(fixos).toEqual([])
  })
})

describe('nome da exportação da missão', () => {
  test('o nome do cabeçalho, com o que o clique escreve', () => {
    expect(missionExportLabel(t, 'kmz')).toBe('Exportar WPML Avançado (KMZ)')
    expect(missionExportLabel(t, 'zip')).toBe('Exportar WPML Avançado (ZIP)')
    expect(missionExportLabel(en, 'kmz')).toBe('Export Advanced WPML (KMZ)')
    expect(missionExportLabel(en, 'zip')).toBe('Export Advanced WPML (ZIP)')
    // sem indicação, um KMZ (face, órbita, circular)
    expect(missionExportLabel(t, null)).toBe('Exportar WPML Avançado (KMZ)')
  })

  test('os painéis dos modos já não têm nomes próprios para a mesma exportação', () => {
    for (const k of ['fp.export', 'op.exportSingle', 'ci.exportSingle', 'co.plan.export'])
      expect(DICT[k], k).toBeUndefined()
    expect(DICT['cards.summary.exportMission']).toBeUndefined()
    expect(DICT['cards.summary.exportMissionByBase']).toBeUndefined()
  })
})

describe('singular com 1', () => {
  test('1 escolhe a chave do singular, o resto a do plural', () => {
    expect(tCount(t, 'stats.setsNeeded', 1, { n: 1 })).toBe('1 necessário')
    expect(tCount(t, 'stats.setsNeeded', 2, { n: 2 })).toBe('2 necessários')
    expect(tCount(t, 'stats.setsNeeded', 0, { n: 0 })).toBe('0 necessários')
    expect(tCount(en, 'stats.setsVs', 1, { n: 1, s: 3 })).toBe('1 needed · 3 in the team')
    expect(tCount(en, 'stats.setsVs', 4, { n: 4, s: 3 })).toBe('4 needed · 3 in the team')
  })

  test('a ficha e a linha do dia com um voo', () => {
    expect(tCount(t, 'bases.sheet.setsUnknown', 1, { flights: 1 })).toBe(
      '1 necessário (conjuntos da equipa por definir na Configuração)',
    )
    expect(tCount(t, 'bases.sheet.setsKnown', 1, { flights: 1, sets: 2 })).toBe(
      '1 necessário · 2 na equipa',
    )
    expect(tCount(t, 'bases.sheet.day', 1, { flights: 1, sets: 1, team: 2 })).toBe(
      'Dia: 1 voo · conjuntos de baterias: 1 necessário · 2 na equipa',
    )
    expect(tCount(t, 'bases.sheet.day', 3, { flights: 3, sets: 3, team: 2 })).toBe(
      'Dia: 3 voos · conjuntos de baterias: 3 necessários · 2 na equipa',
    )
  })

  test('cada chave usada com tCount tem o singular, nas duas línguas, com as mesmas variáveis ou menos', () => {
    const usadas = new Set()
    for (const p of sources()) {
      const text = readFileSync(p, 'utf8')
      for (const m of text.matchAll(/\btCount\(\s*t,\s*'([^']+)'/g)) usadas.add(m[1])
    }
    expect(usadas.size).toBeGreaterThanOrEqual(6)
    for (const key of usadas) {
      expect(DICT[key], key).toBeTruthy()
      expect(DICT[`${key}One`], `${key}One`).toBeTruthy()
      for (const lang of ['pt', 'en']) {
        const plural = vars(DICT[key][lang])
        for (const v of vars(DICT[`${key}One`][lang]))
          expect(plural, `${key}One {${v}}`).toContain(v)
        // o singular nunca deixa o plural escrito: «1 necessário», não «1 necessários»
        expect(DICT[`${key}One`][lang]).not.toMatch(/necessários|needed\b.*\bflights\b|\bvoos\b/)
      }
    }
  })
})
