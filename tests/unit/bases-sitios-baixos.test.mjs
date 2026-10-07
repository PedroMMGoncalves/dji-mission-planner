// "Propor bases" com relevo: com seguimento de terreno a altura relativa de
// um waypoint e AGL + terreno - cota da zona da base. Uma base proposta no
// alto de um cabeco deixava os blocos mais baixos com alturas relativas
// pequenas ou negativas. A proposta passa a preferir sitios baixos (gancho
// `site` de proposeBases, regra lowSiteRule de baseLayout.js).
import { describe, expect, test } from 'vitest'
import { proposeBases, computeTakeoffZone, distanceM } from '../../src/mission/takeoffZones.js'
import { layoutBlocks, lowSiteRule, proposeMoreBases } from '../../src/mission/baseLayout.js'
import { MIN_SAFE_REL_M } from '../../src/utils/terrain.js'
import { terrainRangeAlong } from '../../src/mission/clearance.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
/** ponto a x m para leste e y m para norte da origem */
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const square = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]

/** Bloco quadrado de lado s com uma serpentina E-W de faixas a 50 m. */
function blockAt(id, x, y, s = 400) {
  const lines = []
  for (let k = 0, yy = y + 25; yy < y + s; k++, yy += 50) {
    const a = em(x, yy)
    const b = em(x + s, yy)
    lines.push(k % 2 === 0 ? [a, b] : [b, a])
  }
  return { id, cellRing: square(x, y, s), lines, waypoints: lines.flat(), timeS: 600, transitS: 0 }
}

const G = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s))
/** Planície a 200 m com um cabeço de 150 m em (cx, cy). */
const hill =
  (cx, cy, h = 150, s = 60) =>
  (lon, lat) =>
    200 + h * G(xOf(lon), yOf(lat), cx, cy, s)

describe('proposeBases: gancho `site`', () => {
  // dois blocos lado a lado: o ponto médio da aresta comum é o candidato
  // mais perto dos dois centróides, e é lá que fica o cabeço
  const two = [
    { id: 1, ring: square(0, 0, 400) },
    { id: 2, ring: square(400, 0, 400) },
  ]

  test('sem gancho: o resultado de sempre (o ponto médio da aresta comum)', () => {
    const [b] = proposeBases(two, { vlosM: 1000, radiusM: 100 })
    expect(b.blockIds).toEqual([1, 2])
    expect(xOf(b.point[0])).toBeCloseTo(400, 3)
    expect(yOf(b.point[1])).toBeCloseTo(200, 3)
  })

  test('um sítio que um bloco não aceita não o cobre; fica o aceitável', () => {
    const near = (p) => Math.hypot(xOf(p[0]) - 400, yOf(p[1]) - 200) < 1
    const site = { score: (p) => (near(p) ? 500 : 0), accepts: (_id, s) => s < 100 }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(out.flatMap((b) => b.blockIds).sort()).toEqual([1, 2])
    expect(out.every((b) => !near(b.point) && b.siteOk)).toBe(true)
    expect(out).toHaveLength(1) // há outros candidatos que vêem os dois
  })

  test('entre candidatos que servem os mesmos blocos, o de menor custo', () => {
    // custo = x: todos aceites, e o mais a oeste dos que cobrem os dois
    const site = { score: (p) => xOf(p[0]), accepts: () => true }
    const [b] = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect([...b.blockIds].sort()).toEqual([1, 2])
    // os candidatos que vêem os dois blocos com o desempate das opções
    // iguais: nenhum com o mesmo par de blocos a oeste deste
    const pts = []
    for (const x of [0, 200, 400, 600, 800]) for (const y of [0, 200, 400]) pts.push(em(x, y))
    pts.push(em(200, 200), em(600, 200))
    const coversBoth = (p) =>
      two.every((k) => k.ring.every((v) => distanceM(p, v) + 100 <= 1000 + 1e-6))
    const west = Math.min(...pts.filter(coversBoth).map((p) => xOf(p[0])))
    expect(xOf(b.point[0])).toBeCloseTo(west, 3)
    expect(b.score).toBeCloseTo(west, 3)
  })

  test('nenhum sítio aceitável: o de menor custo, assinalado (siteOk false)', () => {
    const site = { score: (p) => yOf(p[1]), accepts: () => false }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(out.flatMap((b) => b.blockIds).sort()).toEqual([1, 2])
    expect(out.every((b) => b.siteOk === false && !b.outOfVlos)).toBe(true)
    // o mais baixo (y = 0) e, com o mesmo custo, o que serve mais blocos
    expect(out).toHaveLength(1)
    expect(yOf(out[0].point[1])).toBeCloseTo(0, 3)
  })

  test('sítios inutilizáveis (custo null) nunca cobrem, mas ficam como último recurso', () => {
    const site = { score: () => null, accepts: () => true }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(out.flatMap((b) => b.blockIds).sort()).toEqual([1, 2])
    expect(out.every((b) => b.siteOk === false)).toBe(true)
  })

  test('VLOS insuficiente continua a dar base própria fora do VLOS', () => {
    const site = { score: () => 0, accepts: () => true }
    const out = proposeBases(two, { vlosM: 300, radiusM: 100, site })
    expect(out).toHaveLength(2)
    expect(out.every((b) => b.outOfVlos)).toBe(true)
  })
})

describe('lowSiteRule: a proposta evita o cabeço', () => {
  const blocks = [blockAt(1, 0, 0), blockAt(2, 400, 0)]
  const elevationAt = hill(400, 200)

  test('sem a regra a base vai para o alto do cabeço e os blocos ficam com pouca altura', () => {
    const res = proposeMoreBases({ blocks, bases: [], vlosM: 1000 })
    const p = res.bases[0].point
    expect(Math.hypot(xOf(p[0]) - 400, yOf(p[1]) - 200)).toBeLessThan(1)
    const z = computeTakeoffZone(p, { elevationAt, radiusM: 100, maxReliefM: 10 })
    const min = terrainRangeAlong(blocks[0].waypoints, { elevationAt }).minM
    // 100 m AGL: menos de 20 m de altura relativa na parte baixa do bloco
    expect(100 + min - z.refElev).toBeLessThan(MIN_SAFE_REL_M)
  })

  test('com a regra: sítio baixo, todos os blocos com pelo menos 20 m relativos', () => {
    const site = lowSiteRule({ blocks, elevationAt, altitudeM: 100, radiusM: 100, maxReliefM: 10 })
    const res = proposeMoreBases({ blocks, bases: [], vlosM: 1000, site })
    expect(res.highSites).toBe(0)
    const L = layoutBlocks({ blocks, bases: res.bases, manual: res.blockBase, vlosM: 1000 })
    for (const b of blocks) {
      const base = res.bases.find((x) => x.id === L.byBlock[b.id].baseId)
      expect(L.byBlock[b.id].withinVlos).toBe(true)
      const p = base.point
      expect(Math.hypot(xOf(p[0]) - 400, yOf(p[1]) - 200)).toBeGreaterThan(100)
      const z = computeTakeoffZone(p, { elevationAt, radiusM: 100, maxReliefM: 10 })
      const min = terrainRangeAlong(b.waypoints, { elevationAt }).minM
      expect(100 + min - z.refElev).toBeGreaterThanOrEqual(MIN_SAFE_REL_M)
    }
  })

  test('um vale: entre sítios que servem os mesmos blocos, o mais baixo', () => {
    // encosta suave a subir para leste (2 %): todos aceitáveis a 100 m AGL
    const slope = (lon) => 200 + 0.02 * xOf(lon)
    const one = [blockAt(1, 0, 0)]
    const site = lowSiteRule({
      blocks: one,
      elevationAt: slope,
      altitudeM: 100,
      radiusM: 100,
      maxReliefM: 10,
    })
    const res = proposeMoreBases({ blocks: one, bases: [], vlosM: 1000, site })
    // o centróide (sem regra) daria 204 m; o lado oeste do bloco é mais baixo
    expect(xOf(res.bases[0].point[0])).toBeCloseTo(0, 3)
    const free = proposeMoreBases({ blocks: one, bases: [], vlosM: 1000 })
    expect(xOf(free.bases[0].point[0])).toBeCloseTo(200, 3)
  })

  test('sem sítio aceitável: propõe o mais baixo e conta-o', () => {
    // um poço de 150 m (raio 40 m) dentro do bloco, longe de todos os
    // candidatos (vértices, pontos médios, centróide): a 30 m de AGL nenhum
    // sítio deixa 20 m de altura relativa sobre o fundo; fica o mais baixo
    // da encosta (oeste) e o preflight fala
    const pit = (lon, lat) => {
      const x = xOf(lon)
      const y = yOf(lat)
      return Math.hypot(x - 100, y - 100) < 40 ? 50 : 200 + 0.01 * x
    }
    const one = [blockAt(1, 0, 0)]
    const site = lowSiteRule({
      blocks: one,
      elevationAt: pit,
      altitudeM: 30,
      radiusM: 100,
      maxReliefM: 10,
    })
    const res = proposeMoreBases({ blocks: one, bases: [], vlosM: 1000, site })
    expect(res.added).toBe(1)
    expect(res.highSites).toBe(1)
    expect(xOf(res.bases[0].point[0])).toBeCloseTo(0, 3)
    expect(yOf(res.bases[0].point[1])).toBeCloseTo(200, 3)
  })

  test('sem relevo ou sem altura não há regra', () => {
    expect(lowSiteRule({ blocks, elevationAt: null, altitudeM: 100 })).toBeNull()
    expect(lowSiteRule({ blocks, elevationAt, altitudeM: NaN })).toBeNull()
  })

  test('150 blocos com relevo em tempo útil', () => {
    const many = []
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 15; i++) many.push(blockAt(j * 15 + i + 1, i * 300, j * 300, 300))
    const rolling = (lon, lat) => {
      const x = xOf(lon)
      const y = yOf(lat)
      return 200 + 60 * Math.sin(x / 400) * Math.cos(y / 500) + 120 * G(x, y, 2200, 1500, 250)
    }
    const t0 = performance.now()
    const site = lowSiteRule({
      blocks: many,
      elevationAt: rolling,
      altitudeM: 60,
      radiusM: 100,
      maxReliefM: 10,
    })
    const res = proposeMoreBases({ blocks: many, bases: [], vlosM: 1000, site })
    const dt = performance.now() - t0
    expect(dt).toBeLessThan(3000)
    expect(Object.keys(res.blockBase)).toHaveLength(150)
  })
})
