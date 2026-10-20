/**
 * O preflight do separador aberto (src/mission/preflightFor.js, M3-C15):
 * cada modo lê o SEU plano e ignora os dos outros — antes, com o painel do
 * corredor aberto, o preflight da área era o que mandava na exportação.
 */
import { describe, expect, test } from 'vitest'
import { preflightFor } from '../../src/mission/preflightFor.js'

const P = {
  waypoints: [
    [-7.2, 40.4, 100],
    [-7.199, 40.4, 100],
  ],
  lines: [
    [
      [-7.2, 40.4],
      [-7.199, 40.4],
    ],
  ],
  stats: { flightTimeS: 100, pathLengthM: 100, photoCount: 5 },
}
const ctx = {
  batteryMin: 20,
  reservePct: 0,
  speed: 8,
  corridorSpeed: 8,
  circularSpeed: 8,
  vlosM: 500,
}
const codes = (items) => items.map((i) => i.code)
const MODOS = [
  ['area', 'plan'],
  ['corridor', 'corridorPlan'],
  ['circular', 'circularPlan'],
  ['face', 'facePlan'],
  ['orbit', 'orbitPlan'],
]

describe('preflight por modo', () => {
  test('sem plano nenhum, todos os modos bloqueiam com no-plan', () => {
    for (const [modo] of MODOS) {
      const items = preflightFor(modo, {})
      expect(
        items.filter((i) => i.level === 'block').map((i) => i.code),
        modo,
      ).toEqual(['no-plan'])
    }
  })

  test('cada modo lê o seu plano; o plano de outro modo não conta', () => {
    for (const [modo, chave] of MODOS) {
      expect(codes(preflightFor(modo, { ...ctx, [chave]: P })), modo).not.toContain('no-plan')
      for (const [outro, outraChave] of MODOS) {
        if (outro === modo) continue
        expect(
          codes(preflightFor(modo, { ...ctx, [outraChave]: P })),
          `${modo}←${outro}`,
        ).toContain('no-plan')
      }
    }
  })

  test('os campos de cada modo chegam ao motor: a base e a combinação sem voo', () => {
    const base = [-7.2, 40.4]
    const semBase = preflightFor('corridor', { ...ctx, corridorPlan: P })
    expect(codes(semBase)).toContain('no-base')
    const comBase = preflightFor('corridor', {
      ...ctx,
      corridorPlan: P,
      corridorBase: { point: base, label: 'A' },
      corridorBaseDistance: 10,
    })
    expect(codes(comBase)).not.toContain('no-base')
    // a combinação sem voo confirmado (M3-U19) chega a todos os modos
    const semVoo = { aircraft: 'M300 RTK', payload: 'P1', mode: 'Órbita' }
    const comAviso = preflightFor('orbit', { ...ctx, orbitPlan: P, unverified: semVoo })
    expect(codes(comAviso).some((c) => c.includes('unverified'))).toBe(true)
    expect(
      codes(preflightFor('orbit', { ...ctx, orbitPlan: P })).some((c) => c.includes('unverified')),
    ).toBe(false)
  })
})
