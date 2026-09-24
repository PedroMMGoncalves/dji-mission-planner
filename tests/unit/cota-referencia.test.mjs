// Cota de referencia das alturas relativas: base → primeiro waypoint → nenhuma,
// nunca 0 (uma base fora do relevo punha o voo debaixo da terra no perfil).
import { describe, it, expect } from 'vitest'
import { referenceElevation } from '../../src/mission/reference.js'
import { routeClearance } from '../../src/mission/clearance.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-9.14 + x / mLon, lat0 + y / 110574] : [-9.14 + x / mLon, lat0 + y / 110574, z]
// relevo: 100 m a leste de x=0, sem dados a oeste (x<0)
const elevationAt = (lon) => {
  const x = (lon + 9.14) * mLon
  return x < 0 ? null : 100 + 0.1 * x
}

describe('referenceElevation', () => {
  it('usa a cota da base quando existe', () => {
    const r = referenceElevation({ elevationAt, basePoint: em(100, 0), waypoints: [em(0, 0)] })
    expect(r.elev).toBeCloseTo(110, 6)
    expect(r.source).toBe('base')
  })
  it('sem base cai no primeiro waypoint, e diz que foi esse', () => {
    const r = referenceElevation({ elevationAt, basePoint: null, waypoints: [em(50, 0)] })
    expect(r.elev).toBeCloseTo(105, 6)
    expect(r.source).toBe('waypoint')
  })
  it('base fora do relevo: primeiro waypoint, marcado como recurso — nunca 0', () => {
    const r = referenceElevation({ elevationAt, basePoint: em(-5000, 0), waypoints: [em(50, 0)] })
    expect(r.elev).toBeCloseTo(105, 6)
    expect(r.source).toBe('waypoint-fallback')
  })
  it('sem relevo em lado nenhum devolve null, nao 0', () => {
    const r = referenceElevation({ elevationAt, basePoint: em(-1, 0), waypoints: [em(-2, 0)] })
    expect(r).toEqual({ elev: null, source: null })
    expect(
      referenceElevation({ elevationAt: null, basePoint: em(1, 0), waypoints: [] }).elev,
    ).toBeNull()
  })
})

describe('routeClearance', () => {
  const wps = [em(0, 0, 80), em(1000, 0, 80)] // relevo sobe 100 m ao longo da faixa
  it('encontra a pior folga ao longo do segmento, nao so nos waypoints', () => {
    const r = routeClearance(wps, { elevationAt, refElev: 100 })
    // absoluta 180 m; terreno vai de 100 a 200 → pior folga -20 m no fim
    expect(r.minM).toBeCloseTo(-20, 0)
    expect(r.at.index).toBe(1)
    expect(r.samples).toBeGreaterThan(10)
  })
  it('com a referencia certa a folga e positiva', () => {
    const r = routeClearance(wps, { elevationAt, refElev: 200 })
    expect(r.minM).toBeCloseTo(80, 0)
  })
  it('sem dados de relevo devolve null', () => {
    expect(
      routeClearance([em(-500, 0, 80), em(-100, 0, 80)], { elevationAt, refElev: 100 }),
    ).toBeNull()
    expect(routeClearance(wps, { elevationAt, refElev: NaN })).toBeNull()
    expect(routeClearance([], { elevationAt, refElev: 100 })).toBeNull()
  })
  it('respeita o limite de amostras em rotas enormes', () => {
    const longa = [em(0, 0, 80), em(200000, 0, 80)]
    const r = routeClearance(longa, { elevationAt, refElev: 100, maxSamples: 500 })
    expect(r.samples).toBeLessThanOrEqual(500)
  })
})
