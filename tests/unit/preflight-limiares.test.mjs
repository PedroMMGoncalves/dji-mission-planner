// M3-T5 da revisao do codigo: os limiares de seguranca testados na fronteira
// — uma mutacao de «< 0» para «< -10», de 15 para 14 m, de 20 % no VLOS, do
// RTH minimo ou da altura de descolagem passava em tudo.
import { describe, it, expect } from 'vitest'
import { CLEARANCE_WARN_M, preflightArea } from '../../src/mission/preflight.js'
import { transitClearance } from '../../src/mission/clearance.js'
import {
  DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
  MAX_RTH_HEIGHT_M,
  defaultRthHeightM,
} from '../../src/utils/exporters.js'
import { assignBlocksToBases, blockWorstVlosM } from '../../src/mission/takeoffZones.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-9.14 + x / mLon, lat0 + y / 110574] : [-9.14 + x / mLon, lat0 + y / 110574, z]
const plan = { waypoints: [em(0, 0), em(100, 0)], stats: { flightTimeS: 60 } }
const base = () => ({ plan, blocks: null, photoMode: 'distance', batteryMin: 30, reservePct: 0 })
const codes = (items) => items.map((i) => i.code)
const transit = (minM) => ({
  minM,
  at: { leg: 'out' },
  outHeightM: 50,
  backHeightM: 100,
  flight: null,
})

describe('folga do transito base <-> rota', () => {
  it('-0,1 m bloqueia; 0 e 14,9 m avisam; 15 m nada', () => {
    expect(codes(preflightArea({ ...base(), transitClearance: transit(-0.1) }))).toContain(
      'transit-collision',
    )
    for (const m of [0, 14.9]) {
      const c = codes(preflightArea({ ...base(), transitClearance: transit(m) }))
      expect(c).not.toContain('transit-collision')
      expect(c).toContain('transit-low')
    }
    const limpo = codes(preflightArea({ ...base(), transitClearance: transit(15) }))
    expect(limpo).not.toContain('transit-collision')
    expect(limpo).not.toContain('transit-low')
    expect(CLEARANCE_WARN_M).toBe(15)
  })
})

describe('folga ao solo da rota', () => {
  const com = (minM) => codes(preflightArea({ ...base(), clearance: { minM, maxM: 200 } }))
  it('-0,1 m bloqueia; 0 e 14,9 m avisam; 15 m nada', () => {
    expect(com(-0.1)).toContain('terrain-collision')
    expect(com(0)).toContain('clearance-low')
    expect(com(0)).not.toContain('terrain-collision')
    expect(com(14.9)).toContain('clearance-low')
    expect(com(15)).not.toContain('clearance-low')
    expect(com(15)).not.toContain('terrain-collision')
  })
})

describe('alcance visual (VLOS) de um bloco', () => {
  // base na origem, zona de 100 m; bloco de 400 x 300 m a leste
  const ring = [em(500, -150), em(900, -150), em(900, 150), em(500, 150)]
  const bases = [{ id: 'a', point: em(0, 0), radiusM: 100 }]
  it('um metro aquem do pior caso ve o bloco inteiro; um metro alem, nao', () => {
    const worst = blockWorstVlosM({ point: em(0, 0), radiusM: 100 }, ring)
    expect(worst).toBeGreaterThan(900)
    const dentro = assignBlocksToBases([{ id: 1, ring }], bases, { vlosM: worst + 1 })
    expect(dentro[1].withinVlos).toBe(true)
    const igual = assignBlocksToBases([{ id: 1, ring }], bases, { vlosM: worst })
    expect(igual[1].withinVlos).toBe(true)
    const fora = assignBlocksToBases([{ id: 1, ring }], bases, { vlosM: worst - 1 })
    expect(fora[1].withinVlos).toBe(false)
    expect(fora[1].worstVlosM).toBeCloseTo(worst, 6)
  })
})

describe('altura de regresso (RTH) e de descolagem escritas no KMZ', () => {
  it('RTH: tecto + 20 m, nunca abaixo de 100 nem acima do maximo', () => {
    expect(defaultRthHeightM(40)).toBe(100)
    expect(defaultRthHeightM(80)).toBe(100)
    expect(defaultRthHeightM(80.1)).toBe(101)
    expect(defaultRthHeightM(90)).toBe(110)
    expect(defaultRthHeightM(NaN)).toBe(100)
    expect(defaultRthHeightM(10000)).toBe(MAX_RTH_HEIGHT_M)
  })
  it('a subida de descolagem e 30 m, e manda quando o 1.o waypoint e mais baixo', () => {
    expect(DEFAULT_TAKEOFF_SECURITY_HEIGHT_M).toBe(30)
    const rota = (h) => [em(100, 0, h), em(200, 0, h)]
    const opts = { elevationAt: () => 0, refElev: 0, takeOffSecurityHeightM: 30, rthHeightM: 100 }
    expect(transitClearance(em(0, 0), rota(29.9), opts).outHeightM).toBe(30)
    expect(transitClearance(em(0, 0), rota(30.1), opts).outHeightM).toBeCloseTo(30.1, 9)
  })
})
