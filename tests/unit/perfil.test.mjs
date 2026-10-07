import { describe, test, expect } from 'vitest'
import { buildProfile } from '../../src/mission/elevationProfile.js'

// Relevo plano a 100 m com um monte de 300 m entre lon 0.004 e 0.006: os
// dois voos ficam de um lado e do outro, e só o salto entre eles o cruza.
const terrain = {
  elevationAt: (lon) => (lon > 0.004 && lon < 0.006 ? 300 : 100),
}
const voo1 = [
  [0, 0, 50],
  [0.003, 0, 50],
]
const voo2 = [
  [0.007, 0, 50],
  [0.01, 0, 50],
]

describe('perfil de elevação: rota de varios voos', () => {
  test('sem saltos marcados, o troço entre voos conta como voado', () => {
    const p = buildProfile([...voo1, ...voo2], terrain, 100)
    expect(p.aglMin).toBeLessThan(0)
  })

  test('com saltos, a folga e o percurso so contam o que se voa', () => {
    const p = buildProfile([...voo1, ...voo2], terrain, 100, [2])
    expect(p.aglMin).toBeCloseTo(50, 6)
    expect(p.aglMax).toBeCloseTo(50, 6)
    const um = buildProfile(voo1, terrain, 100).totalM
    expect(p.totalM).toBeCloseTo(2 * um, 3)
    // a linha de voo recomeça no segundo voo e o terreno abre uma falha
    expect(p.nodes.filter((n) => n.gap)).toHaveLength(1)
    expect(p.nodes.findIndex((n) => n.gap)).toBe(2)
    expect(p.samples.some((s) => s.ground == null)).toBe(true)
  })

  test('um salto num ponto invalido passa para o ponto valido seguinte', () => {
    const p = buildProfile([...voo1, [NaN, 0, 50], ...voo2], terrain, 100, [2])
    expect(p.aglMin).toBeCloseTo(50, 6)
    expect(p.wpCount).toBe(4)
  })

  test('um salto no primeiro ponto nao abre falha', () => {
    const p = buildProfile(voo1, terrain, 100, [0])
    expect(p.nodes.some((n) => n.gap)).toBe(false)
  })
})
