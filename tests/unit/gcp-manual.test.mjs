/**
 * GCP arrastados no mapa: ficam no projecto pelo id do alvo
 * (gcpConfig.manual), a heurística continua a dar os outros, e um ficheiro
 * com lixo nesse campo abre sem ele.
 */
import { describe, expect, test } from 'vitest'
import { applyGcpManual, planGcps } from '../../src/utils/gcp.js'
import { normalizeProject, serializeProject } from '../../src/mission/project.js'
import { DEFAULT_GCP_CONFIG } from '../../src/mission/defaults.js'

const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-7.2 + x / mL, lat + y / 110574]
const ring = [em(0, 0), em(400, 0), em(400, 300), em(0, 300)]

describe('GCP movidos à mão', () => {
  test('o alvo arrastado fica onde o operador o pôs; os outros não mudam', () => {
    const base = planGcps(ring, 5)
    const moved = applyGcpManual(base, { [base[1].id]: em(10, 10) })
    expect(moved[1].point).toEqual(em(10, 10))
    expect(moved[1].manual).toBe(true)
    expect(moved[0].point).toEqual(base[0].point)
    expect(moved[0].manual).toBeUndefined()
    // sem entradas, a lista é a mesma
    expect(applyGcpManual(base, {})).toEqual(base)
    expect(applyGcpManual(base, null)).toBe(base)
  })

  test('o projecto guarda e lê os alvos; lixo e ids inválidos caem', () => {
    const state = {
      ring,
      gcpConfig: {
        ...DEFAULT_GCP_CONFIG,
        enabled: true,
        count: 5,
        manual: { 'GCP-02': em(10, 10) },
      },
    }
    const file = JSON.parse(JSON.stringify(serializeProject(state)))
    expect(file.gcpConfig.manual).toEqual({ 'GCP-02': em(10, 10) })
    const n = normalizeProject(file)
    expect(n.gcpConfig).toEqual({ enabled: true, count: 5, manual: { 'GCP-02': em(10, 10) } })
    const sujo = normalizeProject({
      version: 2,
      gcpConfig: {
        enabled: true,
        count: 3,
        manual: {
          'um id demasiado comprido para ser de um alvo': em(1, 1),
          'GCP-04': 'ali',
          'GCP-05': em(3, 3),
        },
      },
    })
    expect(sujo.gcpConfig.manual).toEqual({ 'GCP-05': em(3, 3) })
    // projecto anterior ao campo: abre sem ele (a omissão é do App)
    expect(
      normalizeProject({ version: 2, gcpConfig: { enabled: true, count: 4 } }).gcpConfig,
    ).toEqual({
      enabled: true,
      count: 4,
    })
  })
})
