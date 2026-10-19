/**
 * Grelha de área sob polígonos e orientações aleatórias: as faixas ficam
 * dentro da área (com a folga do espaçamento), os waypoints são os extremos
 * das faixas pela ordem de voo, e as ligações entre faixas nunca somam mais
 * do que a serpentina simples. A alternância estrita de sentido só se exige
 * com as faixas paralelas a uma aresta: quando as faixas cortam as arestas
 * compridas de um rectângulo num ângulo raso, as cordas deslocam-se centenas
 * de metros de fila para fila e a rota mais curta (a programação dinâmica
 * de gridRoute.js, M2-G3) repete o sentido numa fila — 549 m de ligação ali
 * contra 521 m noutra, o mesmo total; a CI apanhou um caso destes com a
 * alternância fixa como propriedade.
 */
import * as turf from '@turf/turf'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { generateFlightLines } from '../../src/utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lat0 = 38.7
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const dist = (a, b) => turf.distance(a, b, { units: 'meters' })

/** Rectângulo rodado, 200–1500 m de lado, com a sua rotação. */
const rectanguloRodado = fc
  .record({
    w: fc.integer({ min: 200, max: 1500 }),
    h: fc.integer({ min: 200, max: 1500 }),
    rot: fc.integer({ min: 0, max: 179 }),
  })
  .map(({ w, h, rot }) => {
    const a = (rot * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    const ring = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => em(x * c - y * s, x * s + y * c))
    return { ring, rot }
  })

const opcoes = (spacingM, angleDeg) => ({
  spacingM,
  angleDeg,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 8,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
})

/** Soma das ligações (fim de uma faixa → início da seguinte) de uma rota. */
const ligacoes = (lines) => {
  let total = 0
  for (let i = 1; i < lines.length; i++) total += dist(lines[i - 1][1], lines[i][0])
  return total
}

/** A serpentina simples sobre as mesmas faixas: alterna a partir do sentido da primeira. */
const serpentina = (lines, primeiraInvertida) =>
  lines.map(([a, b], i) => ((i % 2 === 0) !== primeiraInvertida ? [a, b] : [b, a]))

describe('generateFlightLines', () => {
  test('faixas dentro da área alargada, waypoints = extremos, ligações nunca acima da serpentina', () => {
    fc.assert(
      fc.property(
        rectanguloRodado,
        fc.integer({ min: 20, max: 100 }),
        fc.integer({ min: 0, max: 179 }),
        ({ ring }, spacingM, angleDeg) => {
          const plan = generateFlightLines(ring, opcoes(spacingM, angleDeg))
          if (!plan || plan.error) return true
          expect(plan.lines.length).toBeGreaterThanOrEqual(1)
          const area = turf.buffer(turf.polygon([[...ring, ring[0]]]), spacingM + 2, {
            units: 'meters',
          })
          for (const [a, b] of plan.lines) {
            expect(turf.booleanPointInPolygon(turf.point(a), area)).toBe(true)
            expect(turf.booleanPointInPolygon(turf.point(b), area)).toBe(true)
          }
          expect(plan.waypoints).toEqual(plan.lines.flat())
          // a rota escolhida nunca liga mais do que a serpentina simples
          // (qualquer das duas), que a programação dinâmica também avalia
          const melhorSerpentina = Math.min(
            ligacoes(serpentina(plan.lines, false)),
            ligacoes(serpentina(plan.lines, true)),
          )
          expect(ligacoes(plan.lines)).toBeLessThanOrEqual(melhorSerpentina + 0.05)
        },
      ),
      { numRuns: 150 },
    )
  })

  test('faixas paralelas a uma aresta: sentido alternado e ligações de um espaçamento', () => {
    fc.assert(
      fc.property(
        rectanguloRodado,
        fc.integer({ min: 20, max: 100 }),
        fc.boolean(),
        ({ ring, rot }, spacingM, transversal) => {
          // as arestas do rectângulo têm azimute 90 − rot (e o perpendicular)
          const angleDeg = (((90 - rot + (transversal ? 90 : 0)) % 180) + 180) % 180
          const plan = generateFlightLines(ring, opcoes(spacingM, angleDeg))
          if (!plan || plan.error) return true
          for (let i = 1; i < plan.lines.length; i++) {
            const [a0, a1] = plan.lines[i - 1]
            const [b0, b1] = plan.lines[i]
            const da = [a1[0] - a0[0], a1[1] - a0[1]]
            const db = [b1[0] - b0[0], b1[1] - b0[1]]
            expect(da[0] * db[0] + da[1] * db[1]).toBeLessThan(0)
            expect(dist(a1, b0)).toBeLessThan(spacingM + 0.5)
          }
        },
      ),
      { numRuns: 150 },
    )
  })

  test('o caso da CI: rectângulo de 200 x 711 m cortado a 11 graus das arestas compridas', () => {
    const ring = [
      [-9.140646586215079, 38.6967166603456],
      [-9.138361653974279, 38.696937090724184],
      [-9.139353413784923, 38.703283339654405],
      [-9.141638346025722, 38.70306290927582],
    ]
    const plan = generateFlightLines(ring, opcoes(99, 4))
    expect(plan.error).toBeUndefined()
    expect(plan.lines).toHaveLength(4)
    // as cordas deslocam-se ~500 m por fila: a rota mais curta (751 m de
    // ligações) repete o sentido entre as duas faixas do meio; alternar ali
    // custava o mesmo total
    const total = ligacoes(plan.lines)
    expect(total).toBeLessThan(760)
    expect(total).toBeLessThanOrEqual(
      Math.min(ligacoes(serpentina(plan.lines, false)), ligacoes(serpentina(plan.lines, true))) +
        0.05,
    )
  })
})
