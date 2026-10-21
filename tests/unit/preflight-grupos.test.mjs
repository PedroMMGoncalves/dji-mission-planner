/**
 * Preflight agrupado para o ecrã (src/mission/preflightGroups.js): os
 * níveis pela ordem bloqueios, avisos, notas; os itens do mesmo código numa
 * tabela, do pior para o melhor; e, contra o dicionário, que cada tabela
 * mostra todos os números das frases que substitui e nenhum que lá não
 * esteja.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import DICT from '../../src/i18n.jsx'
import {
  GROUP_MIN,
  PREFLIGHT_COLUMNS,
  PREFLIGHT_LEVELS,
  PREFLIGHT_TABLES,
  groupPreflight,
} from '../../src/mission/preflightGroups.js'
import { preflightArea } from '../../src/mission/preflight.js'
import { layoutBlocks } from '../../src/mission/baseLayout.js'
import { generateFlightPlan } from '../../src/utils/geo.js'

const it = (level, code, params = {}) => ({ level, code, params })
const zone = (base, drop) =>
  it('warn', 'base-zone-drop', { base, r: 50, req: 100, relief: 12, at: 60, drop })

describe('groupPreflight', () => {
  test('três níveis, sempre pela mesma ordem, com as contagens', () => {
    const out = groupPreflight([
      it('info', 'heights-relative'),
      it('warn', 'blur', { px: '1.6', cm: '2.0' }),
      it('block', 'terrain-missing'),
      it('warn', 'clearance-low', { m: 8 }),
    ])
    expect(PREFLIGHT_LEVELS).toEqual(['block', 'warn', 'info'])
    expect(out.map((s) => [s.level, s.count])).toEqual([
      ['block', 1],
      ['warn', 2],
      ['info', 1],
    ])
    // sem grupos: os itens pela ordem do preflight, dentro de cada nível
    expect(out[1].entries.map((e) => e.kind === 'item' && e.item.code)).toEqual([
      'blur',
      'clearance-low',
    ])
  })

  test('níveis vazios ficam, com zero; o que não é lista conta como lista vazia', () => {
    expect(groupPreflight([]).map((s) => s.count)).toEqual([0, 0, 0])
    expect(groupPreflight(null).every((s) => s.entries.length === 0)).toBe(true)
    // um item sem nível (não devia acontecer) não entra em nenhum
    expect(groupPreflight([null, it('x', 'y')]).map((s) => s.count)).toEqual([0, 0, 0])
  })

  test('um só item de um código com tabela fica com a sua frase (sem grupo)', () => {
    const [, warn] = groupPreflight([zone('A', 1), it('warn', 'blur')])
    expect(warn.entries.map((e) => e.kind)).toEqual(['item', 'item'])
    expect(GROUP_MIN).toBe(2)
  })

  test('dois ou mais do mesmo código: um grupo no lugar do primeiro, do pior para o melhor', () => {
    const items = [
      it('warn', 'blur'),
      zone('A', 1),
      zone('B', 2),
      it('warn', 'clearance-low', { m: 9 }),
      zone('C', 11),
      zone('E', 1),
    ]
    const [, warn] = groupPreflight(items)
    expect(warn.count).toBe(6)
    expect(
      warn.entries.map((e) => (e.kind === 'group' ? `${e.code}×${e.items.length}` : e.item.code)),
    ).toEqual(['blur', 'base-zone-drop×4', 'clearance-low'])
    const g = warn.entries[1]
    expect(g).toMatchObject({ kind: 'group', level: 'warn', note: true })
    expect(g.cols).toEqual(['base', 'zone', 'relief', 'drop'])
    // o maior desvio primeiro; nos empates, a ordem das bases
    expect(g.items.map((i) => i.params.base)).toEqual(['C', 'B', 'A', 'E'])
    // a lista de entrada não muda
    expect(items.map((i) => i.params.base).filter(Boolean)).toEqual(['A', 'B', 'C', 'E'])
  })

  test('sem número para ordenar, o item vai para o fim; sem `sort`, fica a ordem do preflight', () => {
    const [, warn] = groupPreflight([
      it('warn', 'block-vlos', { flight: 'A-1', m: 1200 }),
      { level: 'warn', code: 'block-vlos' },
      it('warn', 'block-vlos', { flight: 'A-3', m: 'x' }),
      it('warn', 'block-vlos', { flight: 'A-2', m: 1500 }),
    ])
    expect(warn.entries[0].items.map((i) => i.params?.flight ?? null)).toEqual([
      'A-2',
      'A-1',
      null,
      'A-3',
    ])
    const [block] = groupPreflight([
      it('block', 'base-zone-no-terrain', { base: 'C', flights: 'C-5' }),
      it('block', 'base-zone-no-terrain', { base: 'A', flights: 'A-1, A-2' }),
    ])
    expect(block.entries[0]).toMatchObject({ kind: 'group', note: true })
    expect(block.entries[0].items.map((i) => i.params.base)).toEqual(['C', 'A'])
    // as notas mais leves não têm parte comum
    const [, , info] = groupPreflight([
      it('info', 'block-radio-minor', { flight: 'A-1', base: 'A', pct: 2, m: 300 }),
      it('info', 'block-radio-minor', { flight: 'A-2', base: 'A', pct: 3, m: 250 }),
    ])
    expect(info.entries[0]).toMatchObject({ kind: 'group', note: false })
    expect(info.entries[0].items.map((i) => i.params.flight)).toEqual(['A-2', 'A-1'])
  })

  test('códigos repetidos sem tabela não se juntam', () => {
    const [block] = groupPreflight([it('block', 'plan-error'), it('block', 'plan-error')])
    expect(block.entries.map((e) => e.kind)).toEqual(['item', 'item'])
  })

  test('o mesmo código em níveis diferentes fica em cada nível', () => {
    const out = groupPreflight([
      it('warn', 'block-viewshed', { flight: 'A-1', pct: 20 }),
      it('info', 'block-viewshed', { flight: 'A-2', pct: 3 }),
    ])
    expect(out[1].entries[0].kind).toBe('item')
    expect(out[2].entries[0].kind).toBe('item')
  })
})

describe('com o preflight de verdade', () => {
  const lat0 = 38.7
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
  const opts = {
    spacingM: 40,
    angleDeg: 90,
    bufferPct: 0,
    photoIntervalM: 20,
    speed: 8,
    overshootM: 0,
    tieLine: false,
    photoMode: 'distance',
    crosshatch: false,
    includeNadir: false,
  }
  const plan = generateFlightPlan([em(0, 0), em(1000, 0), em(1000, 500), em(0, 500)], opts)
  const blk = (id, x) => {
    const lines = [
      [em(x, 25), em(x + 500, 25)],
      [em(x + 500, 75), em(x, 75)],
    ]
    return {
      id,
      lines,
      waypoints: lines.flat(),
      cellRing: [em(x, 0), em(x + 500, 0), em(x + 500, 500), em(x, 500)],
      timeS: 600,
      transitS: 0,
    }
  }

  test('dois voos longe da sua base: uma tabela do alcance visual e outra da bateria', () => {
    const blocks = [blk(1, 0), blk(2, 500)]
    const B = { id: 'bb', label: 'B', point: em(5000, 0), radiusM: null }
    const A = { id: 'ba', label: 'A', point: em(-10, -10), radiusM: null }
    const layout = layoutBlocks({
      blocks,
      bases: [A, B],
      manual: { 1: 'bb', 2: 'bb' },
      vlosM: 1000,
      speed: 10,
    })
    const items = preflightArea({
      plan,
      blocks,
      photoMode: 'distance',
      terrainFollow: { enabled: false, tolerance: 5 },
      basePoint: A.point,
      baseDistance: null,
      speed: 10,
      batteryMin: 25,
      reservePct: 0,
      baseLayout: layout,
      vlosM: 1000,
    })
    const [, warn] = groupPreflight(items)
    const groups = warn.entries.filter((e) => e.kind === 'group')
    expect(groups.map((g) => g.code)).toEqual(['block-vlos', 'battery-block-base'])
    expect(groups[0].items.map((i) => i.params.base)).toEqual(['B', 'B'])
    // nenhum item se perde nem se repete
    const n = (s) => s.entries.reduce((k, e) => k + (e.kind === 'group' ? e.items.length : 1), 0)
    expect(groupPreflight(items).reduce((k, s) => k + n(s), 0)).toBe(items.length)
  })
})

describe('as tabelas contra o dicionário', () => {
  const vars = (s) => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1])
  const src = readFileSync(new URL('../../src/mission/preflight.js', import.meta.url), 'utf8')

  test('cada código com tabela existe no preflight e tem título, nota e colunas em PT e EN', () => {
    for (const [code, table] of Object.entries(PREFLIGHT_TABLES)) {
      expect(src, code).toContain(`'${code}'`)
      for (const lang of ['pt', 'en']) {
        expect(vars(DICT[`preflight.group.${code}`]?.[lang]), `${code} ${lang}`).toEqual(['count'])
        if (table.note) expect(DICT[`preflight.groupNote.${code}`]?.[lang], code).toBeTruthy()
        else expect(DICT[`preflight.groupNote.${code}`], code).toBeUndefined()
        for (const col of table.cols) {
          expect(DICT[`preflight.col.${col}`]?.[lang], col).toBeTruthy()
          expect(DICT[`preflight.cell.${col}`]?.[lang], col).toBeTruthy()
          expect(PREFLIGHT_COLUMNS[col], col).toMatch(/^(left|right)$/)
        }
      }
    }
  })

  test('cada tabela mostra todos os números da frase que substitui, e só esses', () => {
    for (const [code, table] of Object.entries(PREFLIGHT_TABLES)) {
      for (const lang of ['pt', 'en']) {
        const frase = new Set(vars(DICT[`preflight.${code}`][lang]))
        const nota = table.note ? vars(DICT[`preflight.groupNote.${code}`][lang]) : []
        const celulas = table.cols.flatMap((c) => vars(DICT[`preflight.cell.${c}`][lang]))
        const mostrados = new Set([...nota, ...celulas])
        expect(
          [...frase].filter((v) => !mostrados.has(v)),
          `${code} ${lang}: em falta`,
        ).toEqual([])
        expect(
          [...mostrados].filter((v) => !frase.has(v)),
          `${code} ${lang}: a mais`,
        ).toEqual([])
      }
      // a ordenação é por um número da frase
      if (table.sort) expect(vars(DICT[`preflight.${code}`].pt), code).toContain(table.sort)
    }
  })
})
