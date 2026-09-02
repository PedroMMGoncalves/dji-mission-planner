/**
 * Grelha de área sob polígonos e orientações aleatórias: as faixas ficam
 * dentro da área (com a folga do espaçamento), alternam de sentido e os
 * waypoints são os extremos das faixas, pela ordem de voo.
 */
import * as turf from '@turf/turf'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { generateFlightLines } from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]

/** Rectângulo rodado, 200–1500 m de lado. */
const rectangulo = fc
  .record({
    w: fc.integer({ min: 200, max: 1500 }),
    h: fc.integer({ min: 200, max: 1500 }),
    rot: fc.integer({ min: 0, max: 179 }),
  })
  .map(({ w, h, rot }) => {
    const a = (rot * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => em(x * c - y * s, x * s + y * c))
  })

describe('generateFlightLines', () => {
  test('faixas dentro da área alargada, sentido alternado, waypoints = extremos das faixas', () => {
    fc.assert(
      fc.property(rectangulo, fc.integer({ min: 20, max: 100 }), fc.integer({ min: 0, max: 179 }), (ring, spacingM, angleDeg) => {
        const plan = generateFlightLines(ring, {
          spacingM, angleDeg, bufferPct: 0, photoIntervalM: 20, speed: 8, overshootM: 0, tieLine: false, photoMode: 'distance',
        })
        if (!plan || plan.error) return true
        expect(plan.lines.length).toBeGreaterThanOrEqual(1)
        const area = turf.buffer(turf.polygon([[...ring, ring[0]]]), spacingM + 2, { units: 'meters' })
        for (const [a, b] of plan.lines) {
          expect(turf.booleanPointInPolygon(turf.point(a), area)).toBe(true)
          expect(turf.booleanPointInPolygon(turf.point(b), area)).toBe(true)
        }
        expect(plan.waypoints).toEqual(plan.lines.flat())
        for (let i = 1; i < plan.lines.length; i++) {
          const [a0, a1] = plan.lines[i - 1]
          const [b0, b1] = plan.lines[i]
          const da = [a1[0] - a0[0], a1[1] - a0[1]]
          const db = [b1[0] - b0[0], b1[1] - b0[1]]
          expect(da[0] * db[0] + da[1] * db[1]).toBeLessThan(0)
        }
      }),
      { numRuns: 150 },
    )
  })
})
