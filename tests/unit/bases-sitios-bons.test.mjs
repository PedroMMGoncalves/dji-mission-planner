// "Propor bases" com relevo: sitios planos ou altos com o radio livre.
// A pratica da equipa (LNEG, M300 RTK) e descolar de um sitio plano ou de
// um dos pontos mais altos, nunca de um baixo, por causa da ligacao radio
// (Mata de Vilar, Lousada: monte pequeno com arvores altas, sinal perdido
// com o drone do outro lado). A regra antiga dos sitios baixos (lowSiteRule)
// saiu; a nova esta em src/mission/baseSites.js e no gancho `site` de
// proposeBases.
import { describe, expect, test } from 'vitest'
import {
  computeTakeoffZone,
  distanceM,
  proposeBases,
  proposalSetup,
} from '../../src/mission/takeoffZones.js'
import { blockRing, layoutBlocks, proposeMoreBases } from '../../src/mission/baseLayout.js'
import {
  SITE_HIGHPOINTS_PER_BLOCK,
  SITE_MIN_ZONE_FRAC,
  SITE_RADIO_OK_FRAC,
  createBaseProposalRun,
  goodSiteRule,
  siteAccepts,
  siteEyes,
  siteInfo,
  siteViewOf,
  terrainHighPoints,
} from '../../src/mission/baseSites.js'
import { blockVisibility } from '../../src/mission/viewshed.js'
import { RADIO_CHECK } from '../../src/mission/viewshedPlan.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
/** ponto a x m para leste e y m para norte da origem */
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const square = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]
const near = (p, x, y, tol = 1) => Math.hypot(xOf(p[0]) - x, yOf(p[1]) - y) < tol

/** Bloco quadrado de lado s com uma serpentina E-W de faixas a 50 m. */
function blockAt(id, x, y, s = 300) {
  const lines = []
  for (let k = 0, yy = y + 25; yy < y + s; k++, yy += 50) {
    const a = em(x, yy)
    const b = em(x + s, yy)
    lines.push(k % 2 === 0 ? [a, b] : [b, a])
  }
  return { id, cellRing: square(x, y, s), lines, waypoints: lines.flat(), timeS: 600, transitS: 0 }
}

const G = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s))
/** Planície a 200 m com um monte de topo plano (raio r0) e encostas gaussianas. */
const plateau = (cx, cy, h, r0, s) => (lon, lat) => {
  const r = Math.hypot(xOf(lon) - cx, yOf(lat) - cy)
  return 200 + h * (r <= r0 ? 1 : Math.exp(-((r - r0) ** 2) / (2 * s * s)))
}
/** Cumeada norte-sul de h metros em x = cx (σ s), sobre a planície a 200 m. */
const ridge = (cx, h, s) => (lon) => 200 + h * Math.exp(-((xOf(lon) - cx) ** 2) / (2 * s * s))

/** A corrida inteira, de uma vez (as fatias não mudam o resultado). */
function runAll(args) {
  const run = createBaseProposalRun({ vlosM: 1000, defaultRadiusM: 100, altitudeM: 100, ...args })
  expect(run.step(() => false)).toBe(true)
  return run.result()
}
/** Bases novas com os seus blocos. */
const newBases = (res, mine = []) =>
  res.bases
    .filter((b) => !mine.includes(b))
    .map((b) => ({
      ...b,
      blocks: Object.entries(res.blockBase)
        .filter(([, v]) => v === b.id)
        .map(([k]) => Number(k)),
    }))
/** Rádio de um bloco visto de um ponto, numa bacia grosseira como a da proposta. */
function radioOf(point, block, elevationAt, { altitudeM = 100, obstacleM = 0, tf = false } = {}) {
  const info = siteInfo(point, { elevationAt })
  const ref = info ? info.refElev : elevationAt(point[0], point[1])
  const res = blockVisibility({
    eye: { point },
    blockRing: blockRing(block),
    droneElevAt: tf ? (lon, lat) => elevationAt(lon, lat) + altitudeM : () => ref + altitudeM,
    elevationAt,
    gridStepM: 25,
    fresnel: RADIO_CHECK,
    obstacleM,
  })
  return siteViewOf(res).radio
}

describe('proposeBases: gancho `site` (sítio, rádio e vista)', () => {
  // dois blocos lado a lado: o ponto médio da aresta comum é o candidato
  // mais perto dos dois centróides
  const two = [
    { id: 1, ring: square(0, 0, 400) },
    { id: 2, ring: square(400, 0, 400) },
  ]
  const flat = { elev: 200, reliefM: 0 }
  const clear = { radio: 1, visible: 1, n: 10 }

  test('sem gancho: o resultado de sempre (o ponto médio da aresta comum)', () => {
    const [b] = proposeBases(two, { vlosM: 1000, radiusM: 100 })
    expect(b.blockIds).toEqual([1, 2])
    expect(near(b.point, 400, 200, 1e-3)).toBe(true)
    expect(b.siteOk).toBe(true)
    expect(b.site).toBeNull()
  })

  test('um bloco com o rádio em risco não aceita o sítio; fica o de rádio livre', () => {
    const mid = (p) => near(p, 400, 200)
    const site = {
      info: () => flat,
      view: (p) => (mid(p) ? { radio: 0.9, visible: 1, n: 10 } : clear),
      accepts: siteAccepts,
    }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(out).toHaveLength(1) // há outros candidatos que vêem os dois
    expect(mid(out[0].point)).toBe(false)
    expect(out[0].siteOk).toBe(true)
    expect(out[0].site.radio).toBe(1)
  })

  test('limiar: 95 % dos pontos com o rádio livre chega', () => {
    expect(SITE_RADIO_OK_FRAC).toBe(0.95)
    expect(siteAccepts({ radio: 0.95, visible: 1, n: 20 })).toBe(true)
    expect(siteAccepts({ radio: 0.94, visible: 1, n: 20 })).toBe(false)
    expect(siteAccepts(null)).toBe(false)
  })

  test('pela ordem: rádio, vista, cota (o mais alto), desnível (o mais plano)', () => {
    // todos aceites; cada critério decide quando os anteriores empatam
    const pick = (info, view) =>
      proposeBases(two, { vlosM: 1000, radiusM: 100, site: { info, view, accepts: () => true } })
    // rádio: o de x maior tem mais rádio
    let [b] = pick(
      () => flat,
      (p) => ({ radio: 0.95 + xOf(p[0]) / 20000, visible: 1, n: 10 }),
    )
    const east = Math.max(
      ...proposalSetup(two, { vlosM: 1000, radiusM: 100 })
        .points.filter((p) =>
          two.every((k) => k.ring.every((v) => distanceM(p, v) + 100 <= 1000 + 1e-6)),
        )
        .map((p) => xOf(p[0])),
    )
    expect(xOf(b.point[0])).toBeCloseTo(east, 3)
    // vista: o rádio empata, a vista de y maior ganha
    ;[b] = pick(
      () => flat,
      (p) => ({ radio: 1, visible: 0.5 + yOf(p[1]) / 2000, n: 10 }),
    )
    expect(yOf(b.point[1])).toBeGreaterThan(399)
    // cota: rádio e vista empatam, o mais alto ganha mesmo longe
    ;[b] = pick(
      (p) => ({ elev: near(p, 0, 400) ? 260 : 200, reliefM: 5 }),
      () => clear,
    )
    expect(near(b.point, 0, 400)).toBe(true)
    expect(b.site.elev).toBe(260)
    // desnível: tudo empatado menos a zona, o mais plano ganha
    ;[b] = pick(
      (p) => ({ elev: 200, reliefM: near(p, 800, 0) ? 0 : 6 }),
      () => clear,
    )
    expect(near(b.point, 800, 0)).toBe(true)
    // e o rádio passa à frente da cota
    ;[b] = pick(
      (p) => ({ elev: near(p, 0, 400) ? 260 : 200, reliefM: 0 }),
      (p) => ({ radio: near(p, 0, 400) ? 0.96 : 1, visible: 1, n: 10 }),
    )
    expect(near(b.point, 0, 400)).toBe(false)
  })

  test('nenhum sítio aceite: o de melhor rádio, assinalado (siteOk false)', () => {
    const site = {
      info: () => flat,
      view: (p) => ({ radio: 0.5 + yOf(p[1]) / 1000, visible: 1, n: 10 }),
      accepts: () => false,
    }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(out.flatMap((b) => b.blockIds).sort()).toEqual([1, 2])
    expect(out.every((b) => b.siteOk === false && !b.outOfVlos)).toBe(true)
    expect(out).toHaveLength(1)
    expect(yOf(out[0].point[1])).toBeCloseTo(400, 3)
  })

  test('sítios inutilizáveis (info null) nunca cobrem, mas ficam como último recurso', () => {
    const site = { info: () => null, view: () => clear, accepts: () => true }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(out.flatMap((b) => b.blockIds).sort()).toEqual([1, 2])
    expect(out.every((b) => b.siteOk === false && b.site.elev === null)).toBe(true)
  })

  test('candidatos de fora (extraPoints) entram na proposta', () => {
    const hill = em(400, 520) // fora dos blocos, a norte
    const site = {
      info: (p) => ({ elev: near(p, 400, 520) ? 300 : 200, reliefM: 0 }),
      view: () => clear,
      accepts: () => true,
    }
    const out = proposeBases(two, { vlosM: 1000, radiusM: 100, site, extraPoints: [hill] })
    expect(out).toHaveLength(1)
    expect(near(out[0].point, 400, 520)).toBe(true)
    // sem eles, fica nos blocos
    const inside = proposeBases(two, { vlosM: 1000, radiusM: 100, site })
    expect(yOf(inside[0].point[1])).toBeLessThanOrEqual(400 + 1e-6)
  })

  test('VLOS insuficiente continua a dar base própria fora do VLOS', () => {
    const site = { info: () => flat, view: () => clear, accepts: () => true }
    const out = proposeBases(two, { vlosM: 300, radiusM: 100, site })
    expect(out).toHaveLength(2)
    expect(out.every((b) => b.outOfVlos)).toBe(true)
  })
})

describe('siteInfo: sítio utilizável', () => {
  test('plano: zona inteira, cota e desnível', () => {
    const info = siteInfo(em(0, 0), { elevationAt: () => 150, radiusM: 100, maxReliefM: 10 })
    expect(info).toMatchObject({ elev: 150, refElev: 150, reliefM: 0, radiusM: 100 })
  })

  test('zona reduzida abaixo de metade do raio pedido: inutilizável', () => {
    expect(SITE_MIN_ZONE_FRAC).toBe(0.5)
    // encosta: 10 m de desnível ao fim de 50 m (raio 100 m)
    const slope = (k) => (lon) => 200 + k * xOf(lon)
    const steep = siteInfo(em(0, 0), { elevationAt: slope(0.15), radiusM: 100, maxReliefM: 10 })
    expect(steep).toBeNull()
    const z = computeTakeoffZone(em(0, 0), { elevationAt: slope(0.15), radiusM: 100 })
    expect(z.radiusM).toBeLessThan(50)
    // mais suave: reduzida, mas a mais de metade — serve
    const gentle = siteInfo(em(0, 0), { elevationAt: slope(0.08), radiusM: 100, maxReliefM: 10 })
    expect(gentle).not.toBeNull()
    expect(gentle.radiusM).toBeGreaterThanOrEqual(50)
    expect(gentle.radiusM).toBeLessThan(100)
  })

  test('sem relevo no ponto: inutilizável', () => {
    expect(siteInfo(em(0, 0), { elevationAt: () => null })).toBeNull()
    expect(siteInfo(em(0, 0), { elevationAt: null })).toBeNull()
  })
})

describe('terrainHighPoints: os altos do relevo à volta dos blocos', () => {
  const rings = [square(0, 0, 300)]

  test('o topo de um monte fora dos blocos, dentro do VLOS', () => {
    const hill = plateau(-400, 150, 60, 90, 100)
    const pts = terrainHighPoints({ rings, elevationAt: hill, vlosM: 1000, radiusM: 100 })
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.length).toBeLessThanOrEqual(SITE_HIGHPOINTS_PER_BLOCK)
    // o mais alto está no topo plano
    const top = pts.reduce((a, b) => (hill(...b) > hill(...a) ? b : a))
    expect(hill(...top)).toBeCloseTo(260, 6)
    expect(near(top, -400, 150, 90)).toBe(true)
  })

  test('limitados por bloco, afastados entre si e só os que vêem o bloco', () => {
    const flat = () => 200
    const grid = []
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) grid.push(square(i * 300, j * 300, 300))
    const pts = terrainHighPoints({ rings: grid, elevationAt: flat, vlosM: 1000, radiusM: 100 })
    expect(pts.length).toBeLessThanOrEqual(grid.length * SITE_HIGHPOINTS_PER_BLOCK)
    for (const p of pts)
      expect(grid.some((r) => Math.max(...r.map((v) => distanceM(p, v))) + 100 <= 1000 + 2)).toBe(
        true,
      )
    // determinístico, e os nós alinhados a 100 m não dependem da caixa
    const again = terrainHighPoints({ rings: grid, elevationAt: flat, vlosM: 1000, radiusM: 100 })
    expect(again).toEqual(pts)
  })

  test('uma crista íngreme mais alta não tira o lugar a um alto plano', () => {
    // cumeada estreita a 280 m (sem zona de descolagem) e um topo plano a
    // 230 m, os dois a oeste do bloco: sem `usable` os lugares vão para a
    // crista; com ele, o topo plano entra
    const ground = (lon, lat) =>
      Math.max(ridge(-200, 80, 45)(lon), plateau(-500, 150, 30, 100, 60)(lon, lat))
    const usable = (p) => siteInfo(p, { elevationAt: ground }) !== null
    const args = { rings, elevationAt: ground, vlosM: 1000, radiusM: 100 }
    const onTop = (pts) => pts.some((p) => ground(...p) > 229 && near(p, -500, 150, 100))
    expect(onTop(terrainHighPoints(args))).toBe(false)
    const pts = terrainHighPoints({ ...args, usable })
    expect(onTop(pts)).toBe(true)
    expect(pts.every(usable)).toBe(true)
  })

  test('sem relevo, nada', () => {
    expect(terrainHighPoints({ rings, elevationAt: () => null, vlosM: 1000 })).toEqual([])
    expect(terrainHighPoints({ rings, elevationAt: null, vlosM: 1000 })).toEqual([])
  })
})

describe('createBaseProposalRun: bons sítios para as bases', () => {
  const two = [blockAt(1, 0, 0), blockAt(2, 600, 0)]

  test('monte com os blocos nas encostas: a base vai para o topo plano, não para baixo', () => {
    // topo plano a 280 m (raio 100 m) entre os dois blocos; sem relevo a
    // proposta de sempre fica num ponto da encosta (x = 300 m)
    const hill = plateau(450, 150, 80, 100, 120)
    const free = proposeMoreBases({ blocks: two, bases: [], vlosM: 1000 })
    expect(newBases(free)).toHaveLength(1)
    expect(siteInfo(free.bases[0].point, { elevationAt: hill })).toBeNull() // encosta: sem zona
    for (const tf of [false, true]) {
      const res = runAll({ blocks: two, terrain: { elevationAt: hill }, terrainFollow: tf })
      const [b, ...rest] = newBases(res)
      expect(rest).toHaveLength(0)
      expect(b.blocks.sort()).toEqual([1, 2])
      expect(hill(...b.point)).toBeCloseTo(280, 3)
      expect(near(b.point, 450, 150, 100)).toBe(true)
      expect(res.poorSites).toBe(0)
      for (const k of two) expect(radioOf(b.point, k, hill, { tf })).toBe(1)
    }
  })

  test('cumeada entre um sítio baixo e um bloco: ganha o sítio com o rádio livre', () => {
    // cumeada de 60 m (σ 25 m) em x = 450 m entre os blocos: um sítio de um
    // lado vê os dois dentro do VLOS, mas o rádio para o outro bloco passa
    // pela cumeada; a proposta põe uma base de cada lado
    const rg = ridge(450, 60, 25)
    const free = proposeMoreBases({ blocks: two, bases: [], vlosM: 1000 })
    expect(newBases(free)).toHaveLength(1)
    const p0 = free.bases[0].point
    const far = xOf(p0[0]) < 450 ? two[1] : two[0]
    expect(radioOf(p0, far, rg)).toBeLessThan(SITE_RADIO_OK_FRAC)

    const res = runAll({ blocks: two, terrain: { elevationAt: rg } })
    const bs = newBases(res)
    expect(bs).toHaveLength(2)
    expect(res.poorSites).toBe(0)
    for (const b of bs) {
      expect(b.blocks).toHaveLength(1)
      const blk = two.find((k) => k.id === b.blocks[0])
      // do mesmo lado da cumeada que o seu bloco
      expect(Math.sign(xOf(b.point[0]) - 450)).toBe(blk.id === 1 ? -1 : 1)
      expect(radioOf(b.point, blk, rg)).toBeGreaterThanOrEqual(SITE_RADIO_OK_FRAC)
    }
  })

  test('com a mesma vista, o plano ganha ao inclinado (mesma cota)', () => {
    // dois altos à mesma cota (230 m) nos cantos do bloco: uma mesa plana
    // em (0, 0) e um cone (15 %) em (300, 300); os dois vêem o bloco todo
    const mesaCone = (lon, lat) => {
      const x = xOf(lon)
      const y = yOf(lat)
      const rm = Math.hypot(x, y)
      const rc = Math.hypot(x - 300, y - 300)
      const m = rm <= 120 ? 230 : Math.max(200, 230 - 0.3 * (rm - 120))
      return Math.max(m, Math.max(200, 230 - 0.15 * rc))
    }
    const one = [blockAt(1, 0, 0)]
    const cone = siteInfo(em(300, 300), { elevationAt: mesaCone })
    const mesa = siteInfo(em(0, 0), { elevationAt: mesaCone })
    expect(cone.elev).toBeCloseTo(mesa.elev, 6)
    expect(cone.reliefM).toBeGreaterThan(5)
    expect(radioOf(em(300, 300), one[0], mesaCone)).toBe(1)
    expect(radioOf(em(0, 0), one[0], mesaCone)).toBe(1)
    const [b] = newBases(runAll({ blocks: one, terrain: { elevationAt: mesaCone } }))
    expect(mesaCone(...b.point)).toBeCloseTo(230, 6)
    expect(siteInfo(b.point, { elevationAt: mesaCone }).reliefM).toBeLessThan(1)
    expect(near(b.point, 0, 0, 125)).toBe(true)
  })

  test('vegetação num cabeço arborizado: deixa de servir e a base desce para o bloco', () => {
    // cabeço de topo plano a 240 m (raio 60 m) a oeste do bloco, candidato
    // dado de fora (o seu centro); sem árvores é o mais alto com o rádio
    // livre; com 10 m de árvores (MDT), o arvoredo do próprio topo, para lá
    // da clareira de 30 m, entra na zona de Fresnel para a metade longe do
    // bloco — o caso de Mata de Vilar
    const knoll = plateau(-300, 150, 40, 60, 80)
    const one = [blockAt(1, 0, 0)]
    const top = em(-300, 150)
    const propose = (obstacleM) =>
      proposeMoreBases({
        blocks: one,
        bases: [],
        vlosM: 1000,
        extraPoints: [top],
        site: goodSiteRule({
          elevationAt: knoll,
          altitudeM: 120,
          obstacleM,
          rings: new Map(one.map((b) => [b.id, blockRing(b)])),
        }),
      })
    const bare = propose(0)
    expect(near(bare.bases[0].point, -300, 150)).toBe(true)
    expect(bare.poorSites).toBe(0)
    const wooded = propose(10)
    const p = wooded.bases[0].point
    expect(near(p, -300, 150, 150)).toBe(false)
    expect(xOf(p[0])).toBeGreaterThanOrEqual(-1e-6) // no bloco
    expect(wooded.poorSites).toBe(0)
    expect(radioOf(top, one[0], knoll, { altitudeM: 120, obstacleM: 10 })).toBeLessThan(
      SITE_RADIO_OK_FRAC,
    )
    expect(radioOf(p, one[0], knoll, { altitudeM: 120, obstacleM: 10 })).toBeGreaterThanOrEqual(
      SITE_RADIO_OK_FRAC,
    )
  })

  test('nenhum sítio com o rádio livre: propõe o melhor e conta-o', () => {
    // cumeada alta no meio do bloco: nenhum sítio vê os dois lados
    const wall = ridge(150, 120, 15)
    const res = runAll({ blocks: [blockAt(1, 0, 0)], terrain: { elevationAt: wall } })
    expect(res.added).toBe(1)
    expect(res.poorSites).toBe(1)
  })

  test('as bases do operador não se mexem e os blocos que já vêem ficam com elas', () => {
    const hill = plateau(450, 150, 80, 100, 120)
    const blocks = [...two, blockAt(3, 3000, 0)]
    const mine = { id: 'm1', label: 'A', point: em(-500, 150), radiusM: null }
    const manual = { 2: 'm1' }
    const res = runAll({ blocks, bases: [mine], manual, terrain: { elevationAt: hill } })
    expect(res.bases[0]).toBe(mine)
    expect(res.bases[0].point).toEqual(em(-500, 150))
    expect(res.blockBase[2]).toBe('m1') // a atribuição manual fica
    // A vê o bloco 1 inteiro: não é proposto; o 3 (longe) tem base nova
    expect(res.blockBase[1]).toBeUndefined()
    const added = newBases(res, [mine])
    expect(added.flatMap((b) => b.blocks)).toEqual([3])
    // nada a propor: tudo igual
    const none = runAll({
      blocks,
      bases: res.bases,
      manual: res.blockBase,
      terrain: { elevationAt: hill },
    })
    expect(none.added).toBe(0)
    expect(none.bases).toBe(res.bases)
  })

  test('sem relevo: a proposta de sempre', () => {
    const blocks = []
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) blocks.push(blockAt(i * 3 + j + 1, i * 500, j * 500, 400))
    const res = runAll({ blocks, terrain: null })
    const free = proposeMoreBases({ blocks, bases: [], vlosM: 1000 })
    expect(res.blockBase).toEqual(free.blockBase)
    expect(res.bases.map((b) => b.point)).toEqual(free.bases.map((b) => b.point))
  })

  test('determinístico: as fatias não mudam o resultado, igual ao cálculo de uma vez', () => {
    const rolling = (lon, lat) => {
      const x = xOf(lon)
      const y = yOf(lat)
      return 200 + 50 * Math.sin(x / 300) * Math.cos(y / 400) + 90 * G(x, y, 900, 700, 200)
    }
    const blocks = []
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 4; i++) blocks.push(blockAt(j * 4 + i + 1, i * 400, j * 400, 400))
    const args = { blocks, terrain: { elevationAt: rolling, obstacleM: 5 }, terrainFollow: true }
    const once = runAll(args)
    const run = createBaseProposalRun({ vlosM: 1000, defaultRadiusM: 100, altitudeM: 100, ...args })
    let n = 0
    while (!run.step(() => true)) n++ // um passo pequeno de cada vez
    expect(n).toBeGreaterThan(100)
    expect(run.result()).toEqual(once)
    // o mesmo que proposeMoreBases com a regra e os altos, sem fatias
    const rings = blocks.map((b) => blockRing(b))
    const sync = proposeMoreBases({
      blocks,
      bases: [],
      vlosM: 1000,
      extraPoints: terrainHighPoints({
        rings,
        elevationAt: rolling,
        vlosM: 1000,
        radiusM: 100,
        usable: (p) => siteInfo(p, { elevationAt: rolling }) !== null,
      }),
      site: goodSiteRule({
        elevationAt: rolling,
        altitudeM: 100,
        terrainFollow: true,
        obstacleM: 5,
        rings: new Map(blocks.map((b, i) => [b.id, rings[i]])),
      }),
    })
    expect(sync).toEqual(once)
  })

  test('desempenho: 9 e 150 blocos sem passos longos, todos com base dentro do VLOS', () => {
    const rolling = (lon, lat) => {
      const x = xOf(lon)
      const y = yOf(lat)
      return 200 + 60 * Math.sin(x / 400) * Math.cos(y / 500) + 120 * G(x, y, 2200, 1500, 250)
    }
    const nine = []
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) nine.push(blockAt(j * 3 + i + 1, i * 660, j * 660, 660))
    const many = []
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 15; i++) many.push(blockAt(j * 15 + i + 1, i * 300, j * 300, 300))
    for (const blocks of [nine, many]) {
      const run = createBaseProposalRun({
        blocks,
        vlosM: 1000,
        defaultRadiusM: 100,
        altitudeM: 100,
        terrain: { elevationAt: rolling },
      })
      let longest = 0
      let total = 0
      for (;;) {
        const t0 = performance.now()
        const done = run.step(() => performance.now() - t0 >= 12)
        const dt = performance.now() - t0
        longest = Math.max(longest, dt)
        total += dt
        if (done) break
      }
      // fatias de 12 ms: nenhum passo indivisível passa os 50 ms de uma tarefa
      expect(longest).toBeLessThan(50)
      expect(total).toBeLessThan(blocks.length > 100 ? 4000 : 1000)
      const res = run.result()
      expect(Object.keys(res.blockBase)).toHaveLength(blocks.length)
      const L = layoutBlocks({ blocks, bases: res.bases, manual: res.blockBase, vlosM: 1000 })
      expect(blocks.every((b) => L.byBlock[b.id].withinVlos)).toBe(true)
    }
  })
})

describe('proposta: um sitio, uma base; e consolidacao', () => {
  const row = [
    { id: 'b1', ring: square(0, 0, 300) },
    { id: 'b2', ring: square(300, 0, 300) },
    { id: 'b3', ring: square(600, 0, 300) },
  ]
  const P = [300, 150] // meio da aresta comum a b1 e b2
  const atP = (p) => near(p, P[0], P[1])
  const flatInfo = () => ({ elev: 300, reliefM: 1 })

  test('um bloco sem sitio aceite vai para a base que ja esta no melhor sitio, sem a duplicar', () => {
    // P aceita b1 e b2; ninguem aceita b3, mas P e o melhor que o ve
    const site = {
      info: flatInfo,
      view: (p, id) =>
        id === 'b3'
          ? { radio: atP(p) ? 0.8 : 0.5, visible: 1, n: 10 }
          : atP(p)
            ? { radio: 1, visible: 1, n: 10 }
            : { radio: 0.5, visible: 1, n: 10 },
      accepts: siteAccepts,
    }
    const out = proposeBases(row, { vlosM: 1000, radiusM: 100, site })
    const keys = out.map((b) => b.point.map((v) => v.toFixed(7)).join())
    expect(new Set(keys).size).toBe(keys.length) // nunca duas bases no mesmo ponto
    expect(out).toHaveLength(1)
    expect(atP(out[0].point)).toBe(true)
    expect(out[0].blockIds.sort()).toEqual(['b1', 'b2', 'b3'])
    expect(out[0].siteOk).toBe(false) // leva um bloco sem sitio aceite: o preflight fala
  })

  test('consolidacao: uma base cujos blocos outra aceita desaparece', () => {
    // dois sitios aceitam tudo o que veem; a gulosa escolhe primeiro o que
    // cobre mais, e a base que sobrar com blocos que essa tambem aceita sai
    const site = {
      info: flatInfo,
      view: () => ({ radio: 1, visible: 1, n: 10 }),
      accepts: siteAccepts,
    }
    const out = proposeBases(row, { vlosM: 1000, radiusM: 100, site })
    expect(out).toHaveLength(1)
    expect(out[0].blockIds).toHaveLength(3)
  })
})

describe('proposta: olhos na zona do candidato', () => {
  test('o ponto e 8 na beira da zona; so o ponto com vegetacao ou sem zona', () => {
    const p = em(0, 0)
    const eyes = siteEyes(p, { radiusM: 100 }, {})
    expect(eyes).toHaveLength(9)
    expect(eyes[0]).toEqual(p)
    for (const e of eyes.slice(1)) expect(Math.hypot(xOf(e[0]), yOf(e[1]))).toBeCloseTo(100, 0)
    expect(siteEyes(p, { radiusM: 100 }, { obstacleM: 10 })).toEqual([p])
    expect(siteEyes(p, null, {})).toEqual([p])
  })
})
