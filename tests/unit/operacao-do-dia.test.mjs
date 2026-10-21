/**
 * Operação do dia (src/mission/dayPlan.js): os voos pela ordem de voo, com a
 * ficha da sua base, e o que está feito, lido e escrito no registo de voos
 * da checklist de campo — feito é o voo com a «Hora fim». Marcar escreve a
 * hora na linha do voo e, sem ela, junta as linhas do plano como «Importar
 * blocos do plano»; o resto do registo e da checklist gravada fica como
 * estava, e a exportação JSON não muda enquanto o registo não muda.
 */
import { describe, expect, test } from 'vitest'
import { flightLogRows } from '../../src/data/checklist.js'
import {
  clockText,
  dayFlights,
  doneLabels,
  markFlightDone,
  savedChecklist,
  unmarkFlight,
  withFlightLog,
} from '../../src/mission/dayPlan.js'

// duas bases, A com dois voos e B com um, numeradas base a base (layoutBlocks)
const baseA = {
  id: 'a',
  label: 'A',
  color: '#38bdf8',
  flights: [
    {
      blockId: 2,
      flightLabel: 'A-1',
      flightS: 600,
      transitS: 60,
      totalS: 660,
      worstVlosM: 410.6,
      withinVlos: true,
      pctUseful: 37,
    },
    {
      blockId: 3,
      flightLabel: 'A-2',
      flightS: 700,
      transitS: 40,
      totalS: 740,
      worstVlosM: null,
      withinVlos: true,
      pctUseful: null,
    },
  ],
}
const baseB = {
  id: 'b',
  label: 'B',
  color: '#c2410c',
  flights: [
    {
      blockId: 1,
      flightLabel: 'B-3',
      flightS: 800,
      transitS: 0,
      totalS: 800,
      worstVlosM: 620,
      withinVlos: false,
      pctUseful: 44,
    },
  ],
}
const layout = {
  byBlock: {
    1: { flight: 3, flightLabel: 'B-3', transitS: 0 },
    2: { flight: 1, flightLabel: 'A-1', transitS: 60 },
    3: { flight: 2, flightLabel: 'A-2', transitS: 40 },
  },
}
const blocks = [
  { id: 1, areaHa: 25.04, lengthM: 6012, timeS: 800 },
  { id: 2, areaHa: 20.2, lengthM: 4980, timeS: 600 },
  { id: 3, areaHa: 24.9, lengthM: 5500, timeS: 700 },
]

describe('os voos do dia', () => {
  test('pela ordem de voo, cada um com a sua base e, do bloco, a área e o comprimento', () => {
    const f = dayFlights([baseB, baseA], layout, blocks)
    expect(f.map((x) => x.label)).toEqual(['A-1', 'A-2', 'B-3'])
    expect(f.map((x) => x.order)).toEqual([1, 2, 3])
    expect(f[0]).toMatchObject({
      blockId: 2,
      base: baseA,
      flightS: 600,
      transitS: 60,
      totalS: 660,
      pctUseful: 37,
      worstVlosM: 410.6,
      withinVlos: true,
      areaHa: 20.2,
      lengthM: 4980,
    })
    expect(f[1]).toMatchObject({ worstVlosM: null, pctUseful: null })
    expect(f[2]).toMatchObject({ base: baseB, withinVlos: false })
  })

  test('sem disposição, a ordem das fichas; sem bloco, sem área; números em falta a zero', () => {
    const f = dayFlights(
      [{ id: 'x', label: 'X', flights: [{ blockId: 9 }, { blockId: 8, flightLabel: 'X-2' }] }],
      null,
      null,
    )
    expect(f.map((x) => [x.label, x.order])).toEqual([
      ['9', 1],
      ['X-2', 2],
    ])
    expect(f[0]).toMatchObject({
      flightS: 0,
      transitS: 0,
      totalS: 0,
      pctUseful: null,
      worstVlosM: null,
      withinVlos: true,
      areaHa: null,
      lengthM: null,
    })
    expect(dayFlights(null, null, null)).toEqual([])
    expect(dayFlights([{ id: 'y', label: 'Y' }, null], layout, blocks)).toEqual([])
  })
})

describe('feito é o voo com a «Hora fim» no registo', () => {
  test('os rótulos das linhas com a hora de fim escrita (aparados)', () => {
    const rows = [
      { n: 'A-1', fim: '10:42' },
      { n: ' A-2 ', fim: ' 11:05 ' },
      { n: 'B-3', fim: '   ' },
      { n: '', fim: '12:00' },
      { n: 'C-4' },
      null,
    ]
    expect([...doneLabels(rows)]).toEqual(['A-1', 'A-2'])
    expect(doneLabels(null).size).toBe(0)
    expect(doneLabels({}).size).toBe(0)
  })
})

describe('marcar e desmarcar', () => {
  const planRows = flightLogRows(blocks, layout.byBlock)

  test('sem registo: as linhas do plano, como «Importar blocos do plano», e a hora no voo', () => {
    const rows = markFlightDone(undefined, 'A-2', '10:42', planRows)
    expect(rows).toEqual([
      { n: 'A-1', area: '20.2', previsto: '11', duracao: '' },
      { n: 'A-2', area: '24.9', previsto: '12', duracao: '', fim: '10:42' },
      { n: 'B-3', area: '25.0', previsto: '13', duracao: '' },
    ])
    expect([...doneLabels(rows)]).toEqual(['A-2'])
  })

  test('as linhas vazias da checklist nova saem, as escritas ficam à frente', () => {
    const blank = { _id: 'r1', n: '', inicio: '', fim: '', obs: '' }
    const note = { _id: 'r2', n: '', obs: 'vento forte' }
    const rows = markFlightDone([blank, note, { ...blank, _id: 'r3' }], 'A-1', '09:15', planRows)
    expect(rows.map((r) => r.n)).toEqual(['', 'A-1', 'A-2', 'B-3'])
    expect(rows[0]).toBe(note)
    expect(rows[1].fim).toBe('09:15')
  })

  test('com a linha do voo, só ela muda; as outras são as mesmas', () => {
    const before = [
      { _id: 'x', n: 'A-1', inicio: '09:00', fim: '', obs: 'ok' },
      { _id: 'y', n: 'A-2', fim: '' },
    ]
    const rows = markFlightDone(before, 'A-1', '09:14', planRows)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ _id: 'x', n: 'A-1', inicio: '09:00', fim: '09:14', obs: 'ok' })
    expect(rows[1]).toBe(before[1])
    // a primeira linha do voo, quando está repetida
    const twice = markFlightDone([...before, { n: 'A-1', fim: '' }], 'A-1', '09:20', [])
    expect(twice.filter((r) => r.fim === '09:20')).toHaveLength(1)
    expect(twice[2].fim).toBe('')
  })

  test('um voo já feito não muda (a hora escrita fica)', () => {
    const before = [{ n: 'A-1', fim: '08:59' }]
    expect(markFlightDone(before, 'A-1', '10:00', planRows)).toBe(before)
  })

  test('com o registo de outro plano, juntam-se só os voos que faltam', () => {
    const before = [{ n: 'A-1', fim: '08:00' }]
    const rows = markFlightDone(before, 'B-3', '10:00', planRows)
    expect(rows.map((r) => [r.n, r.fim ?? ''])).toEqual([
      ['A-1', '08:00'],
      ['A-2', ''],
      ['B-3', '10:00'],
    ])
  })

  test('um voo que nem o plano tem fica numa linha só com o rótulo e a hora', () => {
    expect(markFlightDone([], 'Z-9', '13:00')).toEqual([{ n: 'Z-9', fim: '13:00' }])
    expect(markFlightDone(null, 'Z-9', '13:00', null)).toEqual([{ n: 'Z-9', fim: '13:00' }])
  })

  test('desmarcar apaga a hora de fim das linhas do voo e deixa o resto', () => {
    const rows = [
      { n: 'A-1', inicio: '09:00', fim: '09:14' },
      { n: 'A-2', fim: '10:00' },
      { n: 'A-1', fim: '09:30' },
      { n: 'B-3', fim: '' },
    ]
    const after = unmarkFlight(rows, 'A-1')
    expect(after.map((r) => r.fim)).toEqual(['', '10:00', '', ''])
    expect(after[0].inicio).toBe('09:00')
    expect(after[1]).toBe(rows[1])
    expect(after[3]).toBe(rows[3])
    expect(doneLabels(after).has('A-1')).toBe(false)
    expect(unmarkFlight(undefined, 'A-1')).toEqual([])
  })

  test('a hora como o piloto a escreve: HH:MM, hora local', () => {
    expect(clockText(new Date(2026, 9, 21, 7, 5))).toBe('07:05')
    expect(clockText(new Date(2026, 9, 21, 16, 42, 59))).toBe('16:42')
  })
})

describe('a checklist gravada', () => {
  test('a da missão; senão a antiga, quando é desta missão ou não tem nome', () => {
    const own = { missionName: 'norte', voos: [] }
    const legacy = { missao: { missao: 'norte' }, voos: [{ n: '1' }] }
    expect(savedChecklist(own, legacy, 'norte')).toBe(own)
    expect(savedChecklist(null, legacy, 'norte')).toBe(legacy)
    expect(savedChecklist(null, { voos: [] }, 'norte')).toEqual({ voos: [] })
    expect(savedChecklist(null, { missionName: 'norte', voos: [] }, 'norte')).toEqual({
      missionName: 'norte',
      voos: [],
    })
    expect(savedChecklist(null, legacy, 'sul')).toBeNull()
    expect(savedChecklist(null, null, 'sul')).toBeNull()
    expect(savedChecklist('x', 'y', 'sul')).toBeNull()
  })

  test('grava-se com o registo novo, nos mesmos lugares, e o resto como estava', () => {
    const saved = {
      missionName: 'norte',
      savedAt: '2026-10-20',
      checked: { 'pre.0.0': true },
      missao: { operador: 'P' },
      voos: [],
      gcps: [{ n: '1' }],
      notas: { anomalias: '' },
    }
    const rows = [{ n: 'A-1', fim: '10:00' }]
    const out = withFlightLog(saved, 'norte', rows, '2026-10-21')
    expect(Object.keys(out)).toEqual(Object.keys(saved))
    expect(out).toEqual({ ...saved, savedAt: '2026-10-21', voos: rows })
    // sem nada gravado: só o nome, a data e o registo (a checklist completa o resto)
    expect(withFlightLog(null, 'sul', rows, '2026-10-21')).toEqual({
      missionName: 'sul',
      savedAt: '2026-10-21',
      voos: rows,
    })
    expect(JSON.stringify(withFlightLog('x', 'sul', [], 'd'))).toBe(
      '{"missionName":"sul","savedAt":"d","voos":[]}',
    )
  })
})
