/**
 * Registo de voos da checklist de campo (src/data/checklist.js): «Importar
 * blocos do plano» escreve o tempo previsto na coluna «Previsto (min)» e
 * deixa «Duração (min)» — o tempo voado — para o piloto. Antes escrevia o
 * previsto na duração, e o registo exportado ou impresso mostrava tempos
 * planeados como se tivessem sido voados.
 */
import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { flightLogRows, mergeFlightLog, missingPlanRows } from '../../src/data/checklist.js'

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

  // guarda estrutural, como no smoke test: nos dados (COLS_VOO, a ordem das
  // chaves de cada linha gravada e exportada) a coluna «Previsto (min)» está
  // logo antes de «Duração (min)», e as linhas gravadas (também de antes
  // desta coluna) abrem com todas as colunas preenchidas
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

  // no ecrã e na impressão (ORDEM_VOO, o desenho de Outubro de 2026) o que vem
  // do plano — voo, área e previsto — fica antes do que se preenche no campo,
  // e a hora de início antes da de fim e da duração voada; são as mesmas
  // colunas dos dados, nenhuma a mais nem a menos
  test('ChecklistPage: a tabela mostra primeiro o plano e depois o campo, com as colunas todas', () => {
    const src = readFileSync(
      new URL('../../src/components/ChecklistPage.jsx', import.meta.url),
      'utf8',
    )
    const lista = (re) => [...(re.exec(src)?.[1] ?? '').matchAll(/key: '([a-z]+)'|'([a-z]+)'/g)]
    const dados = lista(/const COLS_VOO = \[([\s\S]*?)\n\]/).map((m) => m[1])
    const ordem = lista(/const ORDEM_VOO = \[([\s\S]*?)\]/).map((m) => m[2])
    expect(ordem).toEqual([
      'n',
      'area',
      'previsto',
      'inicio',
      'fim',
      'duracao',
      'baterias',
      'imagens',
      'sensor',
      'meteo',
      'obs',
    ])
    expect([...ordem].sort()).toEqual([...dados].sort())
    expect(dados).toHaveLength(11)
  })
})

/*
 * O registo de voos tem dois escritores na mesma chave: a checklist e o
 * planeador («Operação do dia»), que marca um voo feito escrevendo a «Hora
 * fim» na linha do voo (`n`) e, sem ela, junta antes as linhas do plano que
 * faltam, como «Importar blocos do plano». Com a checklist aberta noutro
 * separador, a gravação seguinte dela escrevia por cima das marcas.
 */
const vazia = (n = '') => ({
  _id: `id-${n || 'x'}`,
  n,
  inicio: '',
  fim: '',
  previsto: '',
  duracao: '',
  baterias: '',
  area: '',
  imagens: '',
  sensor: '',
  meteo: '',
  obs: '',
})
const linha = (n, extra = {}) => ({ ...vazia(n), ...extra })
// o escritor do planeador, como o coordenador o descreve (a hora na primeira
// linha do voo; sem ela, as linhas do plano que faltam, sem as vazias)
function marcarNoPlaneador(rows, label, time, planRows) {
  const tem = (n) => rows.some((r) => String(r.n ?? '').trim() === n)
  let next = rows
  if (!tem(label)) {
    const cheia = (r) =>
      Object.entries(r).some(([k, v]) => k !== '_id' && String(v ?? '').trim() !== '')
    next = [...rows.filter(cheia), ...planRows.filter((p) => !tem(p.n))]
    if (!next.some((r) => r.n === label)) next.push({ n: label })
  }
  let feito = false
  return next.map((r) => {
    if (feito || r.n !== label) return r
    feito = true
    return { ...r, fim: time }
  })
}
const plano = flightLogRows(blocks, byBlock)
const marcaNova = (l) => ({ ...vazia(), ...l, _id: 'novo' })

describe('registo de voos: o que o planeador gravou entra na checklist aberta', () => {
  test('a hora marcada no planeador entra na linha do voo; o resto da linha e as edicoes da pagina ficam', () => {
    const base = [linha('A-1', { baterias: 'B1' }), linha('A-2')]
    const gravado = marcarNoPlaneador(base, 'A-2', '10:42', plano)
    // a página entretanto escreveu o sensor do A-1 (ainda por gravar)
    const local = [linha('A-1', { baterias: 'B1', sensor: 'P1' }), linha('A-2')]
    const junto = mergeFlightLog(local, gravado, base, marcaNova)
    expect(junto).toEqual([
      linha('A-1', { baterias: 'B1', sensor: 'P1' }),
      linha('A-2', { fim: '10:42' }),
    ])
    // a linha que não mudou é a mesma
    expect(junto[0]).toBe(local[0])
  })

  test('sem linha do voo: as linhas do plano que o planeador juntou entram no fim, e saem as vazias', () => {
    const base = [linha(), linha(), linha()]
    const gravado = marcarNoPlaneador(base, 'A-2', '09:15', plano)
    const local = [linha('', { obs: 'vento forte' }), linha(), linha()]
    const junto = mergeFlightLog(local, gravado, base, marcaNova)
    expect(junto.map((l) => [l.n, l.fim, l.obs])).toEqual([
      ['', '', 'vento forte'],
      ['A-1', '', ''],
      ['A-2', '09:15', ''],
      ['B-3', '', ''],
    ])
    // as linhas novas com as colunas todas (o que a página faz delas)
    expect(Object.keys(junto[2])).toEqual(Object.keys(vazia()))
    expect(junto[2]._id).toBe('novo')
    expect(junto[2].previsto).toBe('19')
  })

  test('a hora escrita dos dois lados e diferente: fica a da pagina', () => {
    const base = [linha('A-1')]
    const gravado = [linha('A-1', { fim: '10:07' })]
    const local = [linha('A-1', { fim: '10:05' })]
    expect(mergeFlightLog(local, gravado, base)).toBe(local)
  })

  test('uma hora que a pagina apagou nao volta; desmarcada no planeador, sai da pagina', () => {
    const base = [linha('A-1', { fim: '10:00' }), linha('A-2', { fim: '11:00' })]
    // a página apagou a hora do A-1 (para a reescrever); o gravado ainda a tem
    const local = [linha('A-1'), linha('A-2', { fim: '11:00' })]
    expect(mergeFlightLog(local, base, base)).toBe(local)
    // o planeador desmarcou o A-2: a página ainda tinha a hora da base, sai
    const desmarcado = [base[0], { ...base[1], fim: '' }]
    expect(mergeFlightLog(local, desmarcado, base).map((l) => l.fim)).toEqual(['', ''])
    // com a hora mudada na página, fica a da página
    const mudada = [linha('A-1'), linha('A-2', { fim: '11:05' })]
    expect(mergeFlightLog(mudada, desmarcado, base)).toBe(mudada)
  })

  test('uma linha que a pagina apagou nao volta, a menos que o planeador lhe escreva uma hora nova', () => {
    const base = [linha('A-1'), linha('A-2')]
    const local = [linha('A-1')]
    expect(mergeFlightLog(local, base, base)).toBe(local)
    const marcado = marcarNoPlaneador(base, 'A-2', '12:00', plano)
    const junto = mergeFlightLog(local, marcado, base, marcaNova)
    expect(junto.map((l) => [l.n, l.fim])).toEqual([
      ['A-1', ''],
      ['A-2', '12:00'],
    ])
  })

  test('nada gravado, ou o gravado igual ao conhecido: o registo da pagina, o mesmo array', () => {
    const local = [linha('A-1', { fim: '10:00' })]
    expect(mergeFlightLog(local, null, local)).toBe(local)
    expect(mergeFlightLog(local, undefined, null)).toBe(local)
    expect(mergeFlightLog(local, local, local)).toBe(local)
    expect(mergeFlightLog(null, local, null)).toBe(null)
    // sem base (a página abriu da chave antiga): o que o gravado tem a mais entra
    expect(mergeFlightLog([linha('A-1')], [linha('A-1', { fim: '10:00' })], null)[0].fim).toBe(
      '10:00',
    )
    // linhas gravadas sem rótulo não se juntam (não há como as emparelhar)
    expect(mergeFlightLog(local, [linha('', { obs: 'x' })], [])).toBe(local)
  })

  const rotulos = ['A-1', 'A-2', 'B-3', ' A-2 ', '']
  const horas = ['', '10:00', '10:05', '11:30']
  const linhaArb = fc
    .record({
      n: fc.constantFrom(...rotulos),
      fim: fc.constantFrom(...horas),
      baterias: fc.constantFrom('', 'B1', 'B2'),
    })
    .map((r) => linha(r.n, r))
  const registo = fc.array(linhaArb, { maxLength: 6 })
  const rot = (l) => String(l.n ?? '').trim()
  const fimDe = (l) => String(l.fim ?? '').trim()
  const primeira = (rows, n) => rows.find((l) => rot(l) === n)
  const marcada = (l) => ({ ...l, _nova: true })

  test('propriedade: repetir a fusao nao muda mais nada', () => {
    fc.assert(
      fc.property(registo, registo, registo, (local, gravado, base) => {
        const uma = mergeFlightLog(local, gravado, base)
        expect(mergeFlightLog(uma, gravado, base)).toBe(uma)
      }),
      { numRuns: 300 },
    )
  })

  test('propriedade: nada do que a pagina escreveu se perde, e a hora so muda pelas regras', () => {
    fc.assert(
      fc.property(registo, registo, registo, (local, gravado, base) => {
        const junto = mergeFlightLog(local, gravado, base, marcada)
        const vindas = junto.filter((l) => !l._nova)
        const juntou = vindas.length < junto.length
        // as linhas da página, pela mesma ordem (sem as vazias, se se juntaram linhas)
        const cheia = (l) =>
          Object.entries(l).some(([k, v]) => k !== '_id' && String(v ?? '').trim() !== '')
        const esperadas = juntou ? local.filter(cheia) : local
        expect(vindas).toHaveLength(esperadas.length)
        vindas.forEach((l, i) => {
          const o = esperadas[i]
          expect({ ...l, fim: '' }).toEqual({ ...o, fim: '' })
          if (l.fim === o.fim) return
          const n = rot(o)
          const g = primeira(gravado, n)
          const b = primeira(base, n)
          // só a primeira linha do voo muda
          expect(primeira(local, n)).toBe(o)
          if (fimDe(o) === '') expect(l.fim).toBe(g.fim)
          else {
            // desmarcado no planeador, e a página ainda tinha a hora da base
            expect(l.fim).toBe('')
            expect(fimDe(g)).toBe('')
            expect(fimDe(o)).toBe(fimDe(b))
          }
        })
      }),
      { numRuns: 300 },
    )
  })

  test('propriedade: uma hora nova no gravado fica na pagina (a dela ou a da pagina)', () => {
    fc.assert(
      fc.property(registo, registo, registo, (local, gravado, base) => {
        const junto = mergeFlightLog(local, gravado, base)
        const vistos = new Set()
        for (const g of gravado) {
          const n = rot(g)
          if (!n || vistos.has(n)) continue
          vistos.add(n)
          const b = primeira(base, n)
          const hg = fimDe(g)
          if (!hg || hg === (b ? fimDe(b) : '')) continue
          expect(fimDe(primeira(junto, n))).not.toBe('')
        }
      }),
      { numRuns: 300 },
    )
  })

  test('propriedade: com o gravado igual ao conhecido, nada muda', () => {
    fc.assert(
      fc.property(registo, registo, (local, base) => {
        expect(mergeFlightLog(local, base, base)).toBe(local)
      }),
      { numRuns: 200 },
    )
  })
})

describe('registo de voos: importar depois de marcar no planeador', () => {
  test('so as linhas do plano dos voos que ainda nao tem linha', () => {
    const marcado = marcarNoPlaneador([linha(), linha(), linha()], 'A-2', '09:15', plano)
    expect(missingPlanRows(marcado, plano)).toEqual([])
    expect(missingPlanRows([linha('A-1', { fim: '10:00' })], plano).map((l) => l.n)).toEqual([
      'A-2',
      'B-3',
    ])
    // o rótulo conta aparado; um registo vazio recebe o plano todo
    expect(missingPlanRows([linha(' B-3 ')], plano).map((l) => l.n)).toEqual(['A-1', 'A-2'])
    expect(missingPlanRows([], plano)).toEqual(plano)
    expect(missingPlanRows(null, plano)).toEqual(plano)
    expect(missingPlanRows([linha('A-1')], null)).toEqual([])
  })

  test('ChecklistPage: o botao junta so as linhas que faltam, e o planeador le a chave exportada', () => {
    const src = readFileSync(
      new URL('../../src/components/ChecklistPage.jsx', import.meta.url),
      'utf8',
    )
    expect(src).toMatch(/return \[\.\.\.preenchidas, \.\.\.missingPlanRows\(preenchidas, novas\)\]/)
    expect(src).toMatch(/^export const STORAGE_KEY = 'dji-mission-planner:checklist:v1'$/m)
    expect(src).toMatch(/^export function checklistStorageKey\(missionName\)/m)
  })
})
