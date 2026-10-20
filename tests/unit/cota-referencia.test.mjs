// Cota de referencia das alturas relativas: base -> minima do relevo debaixo
// da rota -> nenhuma. Nunca 0 nem o primeiro waypoint: a minima e a unica
// escolha em que descolar em qualquer ponto da area poe o drone mais alto, e
// nunca mais baixo, do que o planeado.
import { describe, it, expect } from 'vitest'
import { referenceElevation } from '../../src/mission/reference.js'
import {
  routeClearance,
  terrainHolesAlong,
  terrainRangeAlong,
  transitClearance,
} from '../../src/mission/clearance.js'

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
  it('M2-T1: conta as amostras sem relevo em vez de as saltar em silencio', () => {
    // relevo so ate x = 500: a segunda metade da rota e um buraco
    const r = routeClearance(wps, { elevationAt, refElev: 200 })
    expect(r.noData).toBe(0)
    const buraco = (lon, lat) => ((lon + 9.14) * mLon > 500 ? null : elevationAt(lon, lat))
    const h = routeClearance(wps, { elevationAt: buraco, refElev: 200 })
    expect(h.noData).toBeGreaterThan(5)
    expect(h.samples).toBeGreaterThan(5)
  })
})

describe('M2-T1: buracos do relevo debaixo da rota', () => {
  const wps = [em(0, 0, 80), em(1000, 0, 80)]
  it('sem buracos: so amostras com dados', () => {
    const r = terrainHolesAlong(wps, { elevationAt })
    expect(r.noData).toBe(0)
    expect(r.at).toBeNull()
    expect(r.samples).toBeGreaterThan(10)
  })
  it('um buraco a meio: conta-o e diz onde comeca', () => {
    const buraco = (lon, lat) => {
      const x = (lon + 9.14) * mLon
      return x > 400 && x < 600 ? null : elevationAt(lon, lat)
    }
    const r = terrainHolesAlong(wps, { elevationAt: buraco })
    expect(r.noData).toBeGreaterThan(2)
    expect((r.at.lon + 9.14) * mLon).toBeGreaterThan(399)
    expect((r.at.lon + 9.14) * mLon).toBeLessThan(620)
    expect(r.at.index).toBe(1)
  })
  it('sem relevo ou sem rota devolve null', () => {
    expect(terrainHolesAlong(wps, { elevationAt: null })).toBeNull()
    expect(terrainHolesAlong([], { elevationAt })).toBeNull()
  })
})

describe('M2-T3: folga dos transitos entre a base e a rota', () => {
  // base a x = -400 (cota 100), lomba de 230 m em x = -200, area a x >= 0
  // (cota 150); AGL 60 sobre a cota da area => 1.o waypoint a 110 m acima
  // da base: o transito «safely» faz-se a 110 m, 20 m abaixo do topo
  const lomba = (lon) => {
    const x = (lon + 9.14) * mLon
    if (x >= 0) return 150
    if (x <= -400) return 100
    const t = (x + 400) / 400
    return 100 + 130 * Math.sin(Math.PI * t) + 50 * t
  }
  const elev = (lon) => lomba(lon)
  const base = em(-400, 0)
  const rota = [em(0, 0, 110), em(600, 0, 110)]
  it('ida: a altura do 1.o waypoint (maior do que a de seguranca) e a lomba entra no relevo', () => {
    const r = transitClearance(base, rota, {
      elevationAt: elev,
      refElev: 100,
      takeOffSecurityHeightM: 30,
      rthHeightM: 100,
    })
    expect(r.outHeightM).toBe(110)
    expect(r.at.leg).toBe('out')
    // cota maxima da lomba ~ 100 + 130 + 25 = 255 a meio: 210 - 255 < 0
    expect(r.minM).toBeLessThan(-20)
    expect(r.noData).toBe(0)
  })
  it('regresso: a maior entre a altura do ultimo waypoint e a de RTH', () => {
    const alto = transitClearance(base, rota, {
      elevationAt: elev,
      refElev: 100,
      takeOffSecurityHeightM: 30,
      rthHeightM: 200,
    })
    expect(alto.backHeightM).toBe(200)
    // a ida continua a mandar (110 m): o pior ponto e o da ida
    expect(alto.at.leg).toBe('out')
    const plano = transitClearance(base, rota, {
      elevationAt: () => 100,
      refElev: 100,
      takeOffSecurityHeightM: 30,
      rthHeightM: 100,
    })
    expect(plano.minM).toBeCloseTo(110, 6)
  })
  it('a altura de seguranca manda quando o 1.o waypoint e mais baixo', () => {
    const baixa = [em(0, 0, 10), em(600, 0, 10)]
    const r = transitClearance(base, baixa, {
      elevationAt: () => 100,
      refElev: 100,
      takeOffSecurityHeightM: 30,
      rthHeightM: 100,
    })
    expect(r.outHeightM).toBe(30)
    expect(r.backHeightM).toBe(100)
  })
  it('sem base, sem rota ou sem relevo devolve null', () => {
    expect(transitClearance(null, rota, { elevationAt: elev, refElev: 100 })).toBeNull()
    expect(transitClearance(base, [], { elevationAt: elev, refElev: 100 })).toBeNull()
    expect(transitClearance(base, rota, { elevationAt: () => null, refElev: 100 })).toBeNull()
  })
})

describe('M3-T10: baseZoneFor (a zona da base do corredor e do circular)', () => {
  // patamar a 200 m num raio de 40 m à volta da base, 196 m à volta: a cota
  // de referência é a mínima da zona (196) e o ganho 4 m
  const lat0 = 38.7
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const base = [-9.14, lat0]
  const dist = (lon, lat) => Math.hypot((lon + 9.14) * mLon, (lat - lat0) * 110574)
  const patamar = (lon, lat) => (dist(lon, lat) <= 40 ? 200 : 196)
  const zoneConfig = { radiusM: 100, maxReliefM: 10 }
  it('cota mínima da zona e ganho', async () => {
    const { baseZoneFor } = await import('../../src/mission/reference.js')
    const z = baseZoneFor(base, { elevationAt: patamar, zoneConfig })
    expect(z).not.toBeNull()
    expect(z.refElev).toBe(196)
    expect(z.gainM).toBe(4)
    expect(z.radiusM).toBe(100)
    // o raio próprio da base manda sobre o da configuração
    expect(baseZoneFor(base, { elevationAt: patamar, zoneConfig, baseRadiusM: 30 }).radiusM).toBe(
      30,
    )
  })
  it('sem configuração, sem relevo ou sem base, nada', async () => {
    const { baseZoneFor } = await import('../../src/mission/reference.js')
    expect(baseZoneFor(base, { elevationAt: patamar, zoneConfig: null })).toBeNull()
    expect(baseZoneFor(base, { elevationAt: null, zoneConfig })).toBeNull()
    expect(baseZoneFor(null, { elevationAt: patamar, zoneConfig })).toBeNull()
    expect(baseZoneFor(base, { elevationAt: () => null, zoneConfig })).toBeNull()
  })
})
