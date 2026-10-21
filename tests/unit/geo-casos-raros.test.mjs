/**
 * Geometria do plano (src/utils/geo.js), casos raros: o tempo de um quadrado
 * do mosaico (a dica «≈ N min» da grelha) é o inverso exacto do lado por
 * bateria, com prolongamento, fiada, paragens, passagens e margem; a
 * direcção óptima das faixas num rectângulo rodado e num polígono sem área;
 * a célula mais estreita do que o espaçamento (a faixa encostada ao bordo,
 * A1); o anel partido; e o sensor de um payload próprio.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { planArea } from '../../src/mission/areaPlan.js'
import {
  findOptimalDirection,
  resolveSensor,
  squareFlightTimeS,
  squareSideForBattery,
  translateRing,
  validateRing,
} from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const yOf = (lat) => (lat - lat0) * 110574

describe('tempo de um quadrado do mosaico', () => {
  test('propriedade: o quadrado da bateria cabe nela, e 10 m mais já não', () => {
    const opcoes = fc.record({
      speed: fc.integer({ min: 3, max: 15 }),
      spacingM: fc.integer({ min: 10, max: 100 }),
      passes: fc.integer({ min: 1, max: 3 }),
      stopEveryM: fc.constantFrom(0, 20, 45),
      overshootM: fc.constantFrom(0, 15, 40),
      tieLine: fc.boolean(),
      margem: fc.constantFrom({}, { bufferM: 20 }, { bufferPct: 15 }),
    })
    fc.assert(
      fc.property(opcoes, fc.integer({ min: 10, max: 40 }), ({ margem, ...o }, batteryMin) => {
        const opts = { ...o, ...margem }
        const lado = squareSideForBattery({ batteryMin, maxSideM: 1e6, ...opts })
        fc.pre(lado > 50)
        const util = Math.max(60 * o.passes, batteryMin * 60)
        expect(squareFlightTimeS(lado, opts)).toBeLessThanOrEqual(util + 1e-6)
        expect(squareFlightTimeS(lado + 10, opts)).toBeGreaterThan(util)
      }),
    )
  })

  test('cresce com o lado e com cada extra; sem lado, zero; sem velocidade, a 10 m/s', () => {
    const base = { speed: 8, spacingM: 40 }
    const t = (extra, lado = 250) => squareFlightTimeS(lado, { ...base, ...extra })
    expect(t({}, 300)).toBeGreaterThan(t({}))
    for (const extra of [
      { passes: 2 },
      { stopEveryM: 20 },
      { overshootM: 30 },
      { tieLine: true },
      { bufferM: 25 },
      { bufferPct: 10 },
    ])
      expect(t(extra), JSON.stringify(extra)).toBeGreaterThan(t({}))
    expect(t({}, 0)).toBe(0)
    expect(t({}, Number.NaN)).toBe(0)
    expect(squareFlightTimeS(250, { speed: 0, spacingM: 40 })).toBe(
      squareFlightTimeS(250, { speed: 10, spacingM: 40 }),
    )
  })
})

describe('direcção óptima das faixas', () => {
  /** Rectângulo comprido (900 × 200 m) com o lado maior no azimute `az`. */
  const rodado = (az) => {
    const r = (az * Math.PI) / 180
    const ao = [Math.sin(r), Math.cos(r)]
    const at = [Math.cos(r), -Math.sin(r)]
    const p = (s, t) => em(s * ao[0] + t * at[0], s * ao[1] + t * at[1])
    return [p(0, 0), p(900, 0), p(900, 200), p(0, 200)]
  }

  test('num rectângulo comprido, ao longo do lado maior (menos viragens)', () => {
    for (const az of [0, 30, 75, 120, 165]) {
      const d = findOptimalDirection(rodado(az), 40)
      const erro = Math.abs(((d - az + 90) % 180) - 90)
      expect(erro, `azimute ${az}`).toBeLessThanOrEqual(1)
    }
  })

  test('polígono sem área, ou com menos de três vértices: nenhuma', () => {
    expect(findOptimalDirection([em(0, 0), em(0, 0), em(0, 0)], 40)).toBeNull()
    expect(findOptimalDirection([em(0, 0), em(10, 0)], 40)).toBeNull()
    expect(findOptimalDirection(null, 40)).toBeNull()
    // espaçamento inválido: conta 1 m, e a resposta é a mesma
    expect(findOptimalDirection(rodado(30), 0)).toBe(findOptimalDirection(rodado(30), 1))
  })
})

describe('célula mais estreita do que o espaçamento (A1)', () => {
  test('nenhuma faixa global cai nela: fica uma, encostada ao bordo mais perto da régua', () => {
    const ring = [em(0, 0), em(600, 0), em(600, 225), em(0, 225)]
    const cells = [
      [em(0, 0), em(600, 0), em(600, 210), em(0, 210)],
      [em(0, 210), em(600, 210), em(600, 225), em(0, 225)],
    ]
    const plano = planArea(ring, cells, {
      spacingM: 40,
      angleDeg: 90,
      bufferPct: 0,
      photoIntervalM: 20,
      speed: 8,
    })
    expect(plano.error).toBeUndefined()
    const [larga, estreita] = plano.cellPlans
    const ys = (p) => p.lines.map((l) => yOf(l[0][1]))
    // as faixas da célula larga seguem a régua global (de ~40 em ~40 m)
    expect(ys(larga).length).toBeGreaterThan(4)
    // a estreita (210 a 225 m) tem uma só faixa, dentro dela, no terço de
    // baixo, junto ao bordo mais perto da faixa global (~207 m, que fica fora)
    expect(ys(estreita)).toHaveLength(1)
    expect(ys(estreita)[0]).toBeGreaterThan(210)
    expect(ys(estreita)[0]).toBeLessThan(215)
  })
})

describe('anéis e sensores', () => {
  test('anel com um vértice nulo: inválido, sem rebentar; menos de três: inválido', () => {
    expect(validateRing([null, em(0, 0), em(100, 0), em(100, 100)])).toEqual({
      valid: false,
      kinks: [],
    })
    expect(validateRing([em(0, 0), em(1, 1)])).toEqual({ valid: false, kinks: [] })
    expect(validateRing(null)).toEqual({ valid: false, kinks: [] })
    // translação de algo que não é anel: devolvido tal qual
    expect(translateRing(null, 1, 1)).toBeNull()
  })

  test('payload próprio: a câmara ou o LiDAR do editor', () => {
    const custom = { ...DEFAULT_CUSTOM_SENSOR, mode: 'camera', focalLength: 24, imageWidth: 6000 }
    expect(resolveSensor(PAYLOADS.CUSTOM, custom)).toEqual({
      type: 'camera',
      sensorWidth: custom.sensorWidth,
      sensorHeight: custom.sensorHeight,
      focalLength: 24,
      imageWidth: 6000,
    })
    expect(resolveSensor(PAYLOADS.CUSTOM, { ...custom, mode: 'lidar', fov: 70 })).toEqual({
      type: 'lidar',
      fov: 70,
    })
  })
})
