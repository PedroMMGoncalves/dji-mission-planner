/**
 * Registo de voos da checklist de campo (src/data/checklist.js): «Importar
 * blocos do plano» escreve o tempo previsto na coluna «Previsto (min)» e
 * deixa «Duração (min)» — o tempo voado — para o piloto. Antes escrevia o
 * previsto na duração, e o registo exportado ou impresso mostrava tempos
 * planeados como se tivessem sido voados.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { flightLogRows } from '../../src/data/checklist.js'

const blocks = [
  { id: 1, areaHa: 20.24, timeS: 900 },
  { id: 2, areaHa: 24.9, timeS: 1080 },
  { id: 3, areaHa: 25.01, timeS: 1140 },
]
const byBlock = {
  1: { flight: 3, flightLabel: 'B-3', transitS: 120 },
  2: { flight: 1, flightLabel: 'A-1', transitS: 60 },
  3: { flight: 2, flightLabel: 'A-2', transitS: 0 },
}

describe('registo de voos: importar blocos do plano', () => {
  test('pela ordem de voo, com o rotulo, a area e o previsto com o transito; a duracao em branco', () => {
    expect(flightLogRows(blocks, byBlock)).toEqual([
      { n: 'A-1', area: '24.9', previsto: '19', duracao: '' },
      { n: 'A-2', area: '25.0', previsto: '19', duracao: '' },
      { n: 'B-3', area: '20.2', previsto: '17', duracao: '' },
    ])
  })

  test('sem rotulos de voo: o id do bloco, e sem tempo nem area fica em branco', () => {
    expect(flightLogRows([{ id: 2 }, { id: 1, timeS: 59 }])).toEqual([
      { n: '1', area: '', previsto: '1', duracao: '' },
      { n: '2', area: '', previsto: '', duracao: '' },
    ])
    expect(flightLogRows([])).toEqual([])
    expect(flightLogRows(null)).toEqual([])
  })

  test('nunca escreve o previsto na duracao', () => {
    for (const r of flightLogRows(blocks, byBlock)) {
      expect(r.duracao).toBe('')
      expect(r.previsto).toMatch(/^\d+$/)
    }
  })

  // guarda estrutural, como no smoke test: a coluna «Previsto (min)» está
  // logo antes de «Duração (min)» na tabela, e as linhas gravadas (também
  // de antes desta coluna) abrem com todas as colunas preenchidas
  test('ChecklistPage: a coluna Previsto antes da Duracao, e as linhas gravadas com todas as colunas', () => {
    const src = readFileSync(
      new URL('../../src/components/ChecklistPage.jsx', import.meta.url),
      'utf8',
    )
    const cols = [...src.matchAll(/\{ key: '([a-z]+)', label: bi\('([^']+)', '([^']+)'\)/g)].map(
      (m) => [m[1], m[2], m[3]],
    )
    const i = cols.findIndex((c) => c[0] === 'previsto')
    expect(i).toBeGreaterThan(0)
    expect(cols[i]).toEqual(['previsto', 'Previsto (min)', 'Planned (min)'])
    expect(cols[i + 1]).toEqual(['duracao', 'Duração (min)', 'Duration (min)'])
    expect(src).toMatch(/guardado\.voos\.map\(\(l\) => \(\{ \.\.\.linhaVazia\(COLS_VOO\), \.\.\.l/)
  })
})
