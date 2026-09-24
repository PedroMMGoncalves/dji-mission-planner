// Cota de referencia das alturas relativas: base -> minima do relevo debaixo
// da rota -> nenhuma. Nunca 0 nem o primeiro waypoint: a minima e a unica
// escolha em que descolar em qualquer ponto da area poe o drone mais alto, e
// nunca mais baixo, do que o planeado.
import { describe, it, expect } from 'vitest'
import { referenceElevation } from '../../src/mission/reference.js'
import { routeClearance, terrainRangeAlong } from '../../src/mission/clearance.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-9.14 + x / mLon, lat0 + y / 110574] : [-9.14 + x / mLon, lat0 + y / 110574, z]
// relevo: 100 m em x=0 a subir 0,1 m/m para leste; sem dados a oeste (x<0)
const elevationAt = (lon) => {
  const x = (lon + 9.14) * mLon
  return x < 0 ? null : 100 + 0.1 * x
}
const rota = [em(50, 0), em(1000, 0)] // relevo de 105 a 200 m debaixo da rota

describe('referenceElevation', () => {
  it('usa a cota da base quando a base tem relevo', () => {
    const r = referenceElevation({ elevationAt, basePoint: em(100, 0), waypoints: rota })
    expect(r.elev).toBeCloseTo(110, 6)
    expect(r.source).toBe('base')
    expect(r.baseOutside).toBe(false)
  })
  it('sem base assume a MINIMA do relevo debaixo da rota, nao o primeiro waypoint', () => {
    const r = referenceElevation({
      elevationAt,
      basePoint: null,
      waypoints: rota.slice().reverse(),
    })
    // o primeiro waypoint (x=1000) esta a 200 m; a minima da rota e 105 m
    expect(r.elev).toBeCloseTo(105, 1)
    expect(r.source).toBe('area-min')
    expect(r.reliefM).toBeCloseTo(95, 1)
  })
  it('base fora do relevo: minima da area, marcada como base fora - nunca 0', () => {
    const r = referenceElevation({ elevationAt, basePoint: em(-5000, 0), waypoints: rota })
    expect(r.elev).toBeCloseTo(105, 1)
    expect(r.source).toBe('area-min')
    expect(r.baseOutside).toBe(true)
  })
  it('sem relevo em lado nenhum devolve null, nao 0', () => {
    const r = referenceElevation({
      elevationAt,
      basePoint: em(-1, 0),
      waypoints: [em(-2, 0), em(-3, 0)],
    })
    expect(r.elev).toBeNull()
    expect(r.source).toBeNull()
    expect(
      referenceElevation({ elevationAt: null, basePoint: em(1, 0), waypoints: rota }).elev,
    ).toBeNull()
  })
  it('a minima e o lado seguro: descolar em qualquer ponto da area sobe a rota', () => {
    const r = referenceElevation({ elevationAt, basePoint: null, waypoints: rota })
    for (const x of [50, 300, 1000])
      expect(elevationAt(em(x, 0)[0]) - r.elev).toBeGreaterThanOrEqual(-1e-6)
  })
})

describe('terrainRangeAlong', () => {
  it('amostra ao longo dos segmentos, nao so nos waypoints', () => {
    const g = terrainRangeAlong(rota, { elevationAt })
    expect(g.minM).toBeCloseTo(105, 1)
    expect(g.maxM).toBeCloseTo(200, 1)
    expect(g.samples).toBeGreaterThan(10)
  })
  it('sem dados devolve null', () => {
    expect(terrainRangeAlong([em(-500, 0), em(-100, 0)], { elevationAt })).toBeNull()
  })
})

describe('routeClearance', () => {
  const wps = [em(0, 0, 80), em(1000, 0, 80)]
  it('encontra a pior folga ao longo do segmento, nao so nos waypoints', () => {
    const r = routeClearance(wps, { elevationAt, refElev: 100 })
    expect(r.minM).toBeCloseTo(-20, 0)
    expect(r.at.index).toBe(1)
    expect(r.samples).toBeGreaterThan(10)
  })
  it('com a referencia certa a folga e positiva', () => {
    expect(routeClearance(wps, { elevationAt, refElev: 200 }).minM).toBeCloseTo(80, 0)
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
    expect(
      routeClearance(longa, { elevationAt, refElev: 100, maxSamples: 500 }).samples,
    ).toBeLessThanOrEqual(500)
  })
})
