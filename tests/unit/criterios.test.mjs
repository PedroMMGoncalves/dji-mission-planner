/**
 * Criterios de aceitacao da validacao de campo (tools/lib/criterios.mjs).
 */
import { describe, expect, test } from 'vitest'
import { CRITERIOS, avaliar, resumo } from '../../tools/lib/criterios.mjs'

describe('criterios de aceitacao', () => {
  test('absoluto ou relativo, o que cumprir; GNSS e RTK com tolerancias diferentes', () => {
    expect(avaliar({ key: 'agl', planned: 80, measured: 82.5 }).status).toBe('ok')
    expect(avaliar({ key: 'agl', planned: 80, measured: 84 }).status).toBe('falha')
    expect(avaliar({ key: 'agl', planned: 80, measured: 80.4 }, { rtk: true }).status).toBe('ok')
    expect(avaliar({ key: 'agl', planned: 80, measured: 81 }, { rtk: true }).status).toBe('falha')
    expect(avaliar({ key: 'gsd', planned: 2, measured: 2.09 }).status).toBe('ok')
    expect(avaliar({ key: 'gsd', planned: 2, measured: 2.2 }).status).toBe('falha')
    expect(avaliar({ key: 'front', planned: 80, measured: 75 }).status).toBe('ok')
    expect(avaliar({ key: 'front', planned: 80, measured: 74 }).status).toBe('falha')
    expect(avaliar({ key: 'lines', planned: 8, measured: 8 }).status).toBe('ok')
    expect(avaliar({ key: 'lines', planned: 8, measured: 9 }).status).toBe('falha')
  })

  test('sem criterio ou sem medicao e n/a e nao conta', () => {
    expect(avaliar({ key: 'inside', planned: 10, measured: 9 }).status).toBe('n/a')
    expect(avaliar({ key: 'gsd', planned: 2, measured: null }).status).toBe('n/a')
    const r = resumo([
      { key: 'gsd', planned: 2, measured: 2.05 },
      { key: 'inside', planned: 10, measured: 9 },
    ])
    expect(r.testadas).toBe(1)
    expect(r.passa).toBe(true)
    expect(resumo([{ key: 'inside', planned: 1, measured: 1 }]).passa).toBe(false) // nada avaliado nao passa
    expect(resumo([{ key: 'gsd', planned: 2, measured: 3 }]).falhas).toHaveLength(1)
    expect(Object.keys(CRITERIOS)).toContain('density')
  })
})
