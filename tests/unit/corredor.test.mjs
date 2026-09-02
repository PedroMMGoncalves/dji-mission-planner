/**
 * Invariantes do corredor sob entradas aleatórias. Os exemplos das suites
 * históricas fixam casos conhecidos; aqui o fast-check procura os que
 * ninguém escreveu — eixos tortos, desvios grandes, larguras estranhas.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import {
  generateCorridorPlan,
  offsetRuns,
  passOffsets,
  pointPolylineDistance,
} from '../../src/utils/corridor.js'
import { computeFootprint, resolveSensor } from '../../src/utils/geo.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const toLL = ([x, y]) => [-9.14 + x / mLon, lat0 + y / 110574]
const toM = ([lon, lat]) => [(lon + 9.14) * mLon, (lat - lat0) * 110574]

/** Eixo suave em metros: x sempre a crescer, y em passeio aleatório. */
const eixoSuave = fc
  .array(
    fc.record({ dx: fc.integer({ min: 60, max: 250 }), dy: fc.integer({ min: -40, max: 40 }) }),
    { minLength: 2, maxLength: 12 },
  )
  .map((passos) => {
    const pts = [[0, 0]]
    for (const { dx, dy } of passos)
      pts.push([pts[pts.length - 1][0] + dx, pts[pts.length - 1][1] + dy])
    return pts
  })

describe('passOffsets', () => {
  test('simétricos, ordenados, nunca mais afastados do que o espaçamento e a cobrir a berma', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 3000, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        (half, spacing, across) => {
          const o = passOffsets(half, spacing, across)
          if (!Array.isArray(o)) return typeof o.count === 'number' // recusa acima da alocação
          for (let i = 0; i < o.length; i++)
            expect(Math.abs(o[i] + o[o.length - 1 - i])).toBeLessThan(1e-6)
          for (let i = 1; i < o.length; i++)
            expect(o[i] - o[i - 1]).toBeLessThanOrEqual(spacing + 1e-9)
          expect(Math.max(...o) + across / 2).toBeGreaterThanOrEqual(
            Math.min(half, 0) + (o.length === 1 ? 0 : half) - 1e-9,
          )
          return true
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('offsetRuns', () => {
  test('todo o ponto de um troço dista |desvio| do eixo, dentro da tolerância', () => {
    fc.assert(
      fc.property(
        eixoSuave,
        fc.integer({ min: -120, max: 120 }).filter((d) => Math.abs(d) >= 5),
        (axis, offset) => {
          const runs = offsetRuns(axis, offset, 2)
          const tol = Math.max(0.25, Math.abs(offset) * 0.01)
          for (const run of runs) {
            expect(run.length).toBeGreaterThanOrEqual(2)
            for (const q of run) {
              const d = pointPolylineDistance(q, axis)
              expect(d).toBeGreaterThanOrEqual(Math.abs(offset) - tol - 1e-9)
              expect(d).toBeLessThanOrEqual(Math.abs(offset) + tol + 1e-9)
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  test('um eixo recto dá exactamente um troço, do princípio ao fim', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 5, max: 150 }),
        (len, offset) => {
          const runs = offsetRuns(
            [
              [0, 0],
              [len, 0],
            ],
            offset,
            2,
          )
          expect(runs).toHaveLength(1)
          expect(Math.abs(runs[0][0][0])).toBeLessThan(1e-6)
          expect(Math.abs(runs[0][runs[0].length - 1][0] - len)).toBeLessThan(1e-6)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('generateCorridorPlan', () => {
  test('nenhuma perna de voo sai da faixa pedida, medida no interior dos segmentos', () => {
    fc.assert(
      fc.property(
        eixoSuave,
        fc.integer({ min: 20, max: 200 }),
        fc.integer({ min: 60, max: 120 }),
        fc.integer({ min: 50, max: 80 }),
        (axisM, bufferM, altitude, sideOverlapPct) => {
          const plan = generateCorridorPlan(axisM.map(toLL), {
            sensor,
            altitude,
            bufferM,
            sideOverlapPct,
            photoIntervalM: 20,
            speed: 8,
          })
          if (!plan || plan.error) return true // recusa explícita é um resultado válido
          const across = computeFootprint(sensor, altitude).across
          const limite = bufferM + across / 2 + Math.max(0.5, bufferM * 0.02)
          for (const line of plan.lines) {
            const pts = line.map(toM)
            for (let i = 1; i < pts.length; i++) {
              for (let s = 0; s <= 10; s++) {
                const t = s / 10
                const q = [
                  pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
                  pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
                ]
                expect(pointPolylineDistance(q, axisM)).toBeLessThanOrEqual(limite)
              }
            }
          }
          expect(plan.stats.passCount).toBe(plan.stats.offsets.length)
          expect(plan.stats.runCount).toBeGreaterThanOrEqual(
            plan.stats.passCount - plan.stats.droppedPasses,
          )
          expect(plan.stats.runCount).toBe(plan.lines.length)
        },
      ),
      { numRuns: 60 },
    )
  })
})
