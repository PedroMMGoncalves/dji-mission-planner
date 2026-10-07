// «Juntar a esta base» (src/mission/baseLayout.js, gatherToBase): os blocos
// que a base vê inteiros dentro do VLOS passam para ela, os outros ficam, e
// as bases que ficam sem voos por causa disso saem.
import { describe, expect, test } from 'vitest'
import { gatherToBase, layoutBlocks } from '../../src/mission/baseLayout.js'

const lat0 = 40.93
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-7.1 + x / mLon, lat0 + y / 110574]
const square = (x0, y0, s) => [em(x0, y0), em(x0 + s, y0), em(x0 + s, y0 + s), em(x0, y0 + s)]

// quatro blocos de 300 m em linha (x 0..1200); o alto A no canto comum dos
// dois primeiros, B e C mais à direita, cada um a servir os seus
const blocks = [0, 1, 2, 3].map((i) => ({
  id: i + 1,
  cellRing: square(i * 300, 0, 300),
  waypoints: [],
}))
const bases = [
  { id: 'b1', label: 'A', point: em(300, 150), radiusM: 50 },
  { id: 'b2', label: 'B', point: em(650, 150), radiusM: 50 },
  { id: 'b3', label: 'C', point: em(1050, 150), radiusM: 50 },
]
const manual = { 1: 'b1', 2: 'b2', 3: 'b2', 4: 'b3' }
const args = { blocks, bases, manual, vlosM: 800, defaultRadiusM: 100 }

describe('juntar a esta base', () => {
  test('os blocos dentro do VLOS passam para a base; os outros ficam', () => {
    const r = gatherToBase({ ...args, baseId: 'b1' })
    // pior caso do bloco 3 (x 600..900) visto de A: canto a ~618 m + 50 m de raio
    expect(r.kept).toBe(1)
    expect(r.joined).toBe(2)
    expect(r.tooFar).toBe(1)
    expect(r.nearestFarM).toBeGreaterThan(800)
    expect(r.blockBase).toMatchObject({ 1: 'b1', 2: 'b1', 3: 'b1', 4: 'b3' })
    // B ficou sem voos e sai; C fica
    expect(r.removed).toEqual(['B'])
    expect(r.bases.map((b) => b.id)).toEqual(['b1', 'b3'])
    const lay = layoutBlocks({ ...args, bases: r.bases, manual: r.blockBase })
    expect(lay.byBlock[3].baseId).toBe('b1')
    expect(lay.byBlock[3].withinVlos).toBe(true)
  })

  test('uma base que ja nao tinha voos nao sai', () => {
    const extra = [...bases, { id: 'b4', label: 'D', point: em(2000, 2000), radiusM: 50 }]
    const r = gatherToBase({ ...args, bases: extra, baseId: 'b1' })
    expect(r.removed).toEqual(['B'])
    expect(r.bases.some((b) => b.id === 'b4')).toBe(true)
  })

  test('base que nao existe ou sem VLOS: nada', () => {
    expect(gatherToBase({ ...args, baseId: 'zz' })).toBeNull()
    expect(gatherToBase({ ...args, vlosM: 0, baseId: 'b1' })).toBeNull()
  })

  test('o raio da zona calculada manda sobre o pedido', () => {
    // zona reduzida a 10 m (junto a uma corta): o bloco 4 continua longe,
    // mas o pior caso desce 40 m
    const far = gatherToBase({ ...args, baseId: 'b1' }).nearestFarM
    const near = gatherToBase({
      ...args,
      zones: { b1: { radiusM: 10, refElev: 900 } },
      baseId: 'b1',
    }).nearestFarM
    expect(far - near).toBeCloseTo(40, 3)
  })
})
