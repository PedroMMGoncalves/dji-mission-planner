/**
 * Resumo operacional do painel de estatisticas (src/mission/opsSummary.js):
 * voos, bases, baterias, voo mais longo contra o tempo util e tempo total.
 */
import { describe, expect, test } from 'vitest'
import { OPS_NEAR_FRAC, opsSummary } from '../../src/mission/opsSummary.js'

describe('resumo operacional', () => {
  test('voos com transito por bloco: o mais longo, o total e o nivel', () => {
    const r = opsSummary({
      blocks: [
        { id: 1, timeS: 1200 },
        { id: 2, timeS: 1300 },
        { id: 3, timeS: 600 },
      ],
      byBlock: {
        1: { flightLabel: 'A-1', transitS: 60 },
        2: { flightLabel: 'A-2', transitS: 100 },
        3: { flightLabel: 'B-3', transitS: 40 },
      },
      usefulMin: 25,
      bases: 2,
      sets: { sets: 2, short: true },
    })
    expect(r.flights).toBe(3)
    expect(r.bases).toBe(2)
    expect(r.longest).toEqual({ label: 'A-2', timeS: 1400 })
    expect(r.totalS).toBe(1260 + 1400 + 640)
    expect(r.usefulS).toBe(1500)
    expect(r.level).toBe('near') // 1400/1500 = 0,93
    expect(r.sets).toBe(2)
    expect(r.short).toBe(true)
  })

  test('niveis: ok abaixo de 90 %, perto acima, acima de 100 % passa', () => {
    const lvl = (t) => opsSummary({ singleTimeS: t, usefulMin: 10 }).level
    expect(lvl(600 * OPS_NEAR_FRAC - 1)).toBe('ok')
    expect(lvl(600 * OPS_NEAR_FRAC + 1)).toBe('near')
    expect(lvl(601)).toBe('over')
  })

  test('missao sem divisao: um voo com o transito da base', () => {
    const r = opsSummary({ singleTimeS: 900, singleTransitS: 120, usefulMin: 25 })
    expect(r.flights).toBe(1)
    expect(r.longest.timeS).toBe(1020)
    expect(r.longest.label).toBeNull()
    expect(r.totalS).toBe(1020)
  })

  test('o transito do bloco cai para o do proprio bloco, e sem tempo util nao ha nivel', () => {
    const r = opsSummary({ blocks: [{ id: 7, timeS: 100, transitS: 50 }] })
    expect(r.longest.timeS).toBe(150)
    expect(r.usefulS).toBeNull()
    expect(r.longestFrac).toBeNull()
    expect(r.level).toBe('ok')
    expect(r.sets).toBeNull()
    expect(r.short).toBe(false)
  })

  test('sem plano nao ha resumo', () => {
    expect(opsSummary({})).toBeNull()
    expect(opsSummary({ blocks: [], singleTimeS: null })).toBeNull()
  })
})
