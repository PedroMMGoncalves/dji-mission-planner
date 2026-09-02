/**
 * Invariantes do seguimento de terreno e do disparo por intervalos.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { simplifyProfile, terrainFollowLines } from '../../src/utils/terrain.js'
import { triggerRangesForLines } from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const toM = ([lon, lat]) => [(lon + 9.14) * mLon, (lat - lat0) * 110574]

describe('simplifyProfile', () => {
  test('mantém os extremos e nunca se afasta mais do que a tolerância do perfil original', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 500, noNaN: true }), { minLength: 2, maxLength: 200 }),
        fc.double({ min: 0.5, max: 20, noNaN: true }),
        (values, tol) => {
          const points = values.map((value, i) => ({ distM: i * 40, value }))
          const kept = simplifyProfile(points, tol)
          expect(kept[0]).toBe(0)
          expect(kept[kept.length - 1]).toBe(points.length - 1)
          for (let k = 1; k < kept.length; k++) {
            expect(kept[k]).toBeGreaterThan(kept[k - 1])
            const a = points[kept[k - 1]]
            const b = points[kept[k]]
            for (let i = kept[k - 1]; i <= kept[k]; i++) {
              const t = (points[i].distM - a.distM) / (b.distM - a.distM)
              expect(
                Math.abs(a.value + (b.value - a.value) * t - points[i].value),
              ).toBeLessThanOrEqual(tol + 1e-9)
            }
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})

/** Relevo aleatório: rampa + colinas largas (σ ≥ 150 m, para a amostragem a
 *  40 m não deixar escapar mais do que ~1,5 m entre amostras). */
const relevo = fc
  .record({
    rampa: fc.double({ min: -0.1, max: 0.1, noNaN: true }),
    colinas: fc.array(
      fc.record({
        cx: fc.integer({ min: -200, max: 1700 }),
        cy: fc.integer({ min: -200, max: 1700 }),
        a: fc.integer({ min: 0, max: 150 }),
        s: fc.integer({ min: 150, max: 500 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  })
  .map(
    ({ rampa, colinas }) =>
      (x, y) =>
        200 +
        rampa * x +
        colinas.reduce(
          (z, c) => z + c.a * Math.exp(-((x - c.cx) ** 2 + (y - c.cy) ** 2) / (2 * c.s * c.s)),
          0,
        ),
  )

/** Serpentina de 2 a 5 linhas E-O afastadas entre 40 e 600 m. */
const serpentina = fc
  .record({
    n: fc.integer({ min: 2, max: 5 }),
    len: fc.integer({ min: 300, max: 1500 }),
    gap: fc.integer({ min: 40, max: 600 }),
  })
  .map(({ n, len, gap }) =>
    Array.from({ length: n }, (_, i) =>
      i % 2 === 0 ? [em(0, i * gap), em(len, i * gap)] : [em(len, i * gap), em(0, i * gap)],
    ),
  )

describe('terrainFollowLines', () => {
  test('a rota inteira, ligações incluídas, fica acima de AGL − tolerância', () => {
    fc.assert(
      fc.property(relevo, serpentina, fc.integer({ min: 50, max: 120 }), (ground, lines, agl) => {
        const terrain = { elevationAt: (lon, lat) => ground(...toM([lon, lat])) }
        const ref = ground(...toM(lines[0][0]))
        const tf = terrainFollowLines(terrain, lines, {
          agl,
          refElev: ref,
          toleranceM: 5,
          stepM: 40,
        })
        expect(tf.perLine.reduce((a, b) => a + b, 0)).toBe(tf.waypoints.length)
        expect(tf.perLink[0]).toBe(0)
        expect(tf.perLink).toHaveLength(lines.length)
        for (let i = 1; i < tf.waypoints.length; i++) {
          const [x0, y0] = toM(tf.waypoints[i - 1])
          const [x1, y1] = toM(tf.waypoints[i])
          const h0 = tf.waypoints[i - 1][2]
          const h1 = tf.waypoints[i][2]
          const passos = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10))
          for (let s = 0; s <= passos; s++) {
            const t = s / passos
            const folga = ref + h0 + (h1 - h0) * t - ground(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
            expect(folga).toBeGreaterThanOrEqual(agl - 5 - 2)
          }
        }
      }),
      { numRuns: 80 },
    )
  })
})

describe('triggerRangesForLines', () => {
  const cenario = fc
    .array(
      fc.record({
        gap: fc.integer({ min: 20, max: 800 }),
        perLine: fc.integer({ min: 1, max: 6 }),
        perLink: fc.integer({ min: 0, max: 3 }),
      }),
      { minLength: 1, maxLength: 8 },
    )
    .map((linhas) => {
      const lines = []
      const perLine = []
      const perLink = []
      let y = 0
      linhas.forEach(({ gap, perLine: n, perLink: k }, i) => {
        y += i === 0 ? 0 : gap
        lines.push(i % 2 === 0 ? [em(0, y), em(500, y)] : [em(500, y), em(0, y)])
        perLine.push(n)
        perLink.push(i === 0 ? 0 : Math.min(k, n - 1))
      })
      return { lines, perLine, perLink }
    })

  test('intervalos crescentes, sem sobreposição, dentro da rota; os pontos de ligação ficam de fora quando há quebra', () => {
    fc.assert(
      fc.property(
        cenario,
        fc.integer({ min: 30, max: 900 }),
        ({ lines, perLine, perLink }, maxLinkM) => {
          const total = perLine.reduce((a, b) => a + b, 0)
          const ranges = triggerRangesForLines(lines, perLine, perLink, { maxLinkM })
          let prevEnd = -1
          for (const [s, e] of ranges) {
            expect(s).toBeGreaterThan(prevEnd)
            expect(e).toBeGreaterThanOrEqual(s)
            expect(e).toBeLessThan(total)
            prevEnd = e
          }
          // sem limite: um só intervalo com tudo
          expect(triggerRangesForLines(lines, perLine, perLink, {})).toEqual([[0, total - 1]])
          // os índices dos pontos de ligação de uma linha que abre intervalo não pertencem a nenhum intervalo
          let idx = 0
          lines.forEach((seg, i) => {
            const abre = ranges.some(([s]) => s === idx + perLink[i]) && perLink[i] > 0
            if (abre)
              for (let k = idx; k < idx + perLink[i]; k++)
                expect(ranges.some(([s, e]) => k >= s && k <= e)).toBe(false)
            idx += perLine[i]
          })
        },
      ),
      { numRuns: 300 },
    )
  })
})
