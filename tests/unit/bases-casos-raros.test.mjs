/**
 * Bases e blocos, casos raros (src/mission/baseLayout.js, bases.js,
 * takeoffZones.js e baseSites.js): blocos sem geometria, velocidade em
 * falta, blocos que nenhuma base serve com bases no projecto, cotas de
 * referência desconhecidas, a chave da disposição dos blocos, o «cabe numa
 * bateria» das tiras com prolongamento, fiada, paragens e margem, a zona de
 * descolagem com parâmetros inválidos, a consolidação das bases propostas
 * (um bloco sem sítio aceite junta-se a uma base que o vê com o rádio pelo
 * menos tão bom) e o progresso da proposta em fatias.
 */
import { describe, expect, test } from 'vitest'
import {
  applyProposal,
  blockLayoutKey,
  blockReferences,
  blockRing,
  blocksViewRoute,
  cellFitsBattery,
  computeZones,
  convexHull,
  layoutBlocks,
  proposalTargets,
  proposeMoreBases,
  squareSideWithBaseTransit,
  summarizeBases,
} from '../../src/mission/baseLayout.js'
import {
  addBase,
  assignBlockBase,
  baseColor,
  compareLabels,
  moveBase,
  normalizeBases,
  removeBase,
  setBaseRadius,
  sortedBases,
} from '../../src/mission/bases.js'
import {
  assignBlocksToBases,
  computeTakeoffZone,
  proposeBases,
} from '../../src/mission/takeoffZones.js'
import {
  SITE_HIGHPOINT_GRID_M,
  createBaseProposalRun,
  highPointsStepper,
  siteAccepts,
  siteViewOf,
  terrainHighPoints,
} from '../../src/mission/baseSites.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const square = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]

/** Bloco quadrado de lado s com uma serpentina E-W de faixas a 50 m. */
function blockAt(id, x, y, s = 300, timeS = 600) {
  const lines = []
  for (let k = 0, yy = y + 25; yy < y + s; k++, yy += 50) {
    const a = em(x, yy)
    const b = em(x + s, yy)
    lines.push(k % 2 === 0 ? [a, b] : [b, a])
  }
  return { id, cellRing: square(x, y, s), lines, waypoints: lines.flat(), timeS, transitS: 0 }
}

describe('blocos sem geometria e valores em falta', () => {
  test('invólucro: pontos alinhados saem; menos de três pontos ficam como estão', () => {
    const hull = convexHull([em(0, 0), em(50, 0), em(100, 0), em(100, 100), em(0, 100), em(50, 50)])
    expect(hull.map((p) => [Math.round(xOf(p[0])), Math.round(yOf(p[1]))]).sort()).toEqual(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ].sort(),
    )
    expect(convexHull(null)).toEqual([])
    expect(convexHull([em(0, 0), [Number.NaN, 1], em(10, 0)])).toEqual([em(0, 0), em(10, 0)])
    // um bloco sem célula nem waypoints não tem anel
    expect(blockRing({ id: 1 })).toEqual([])
    expect(blockRing(null)).toEqual([])
  })

  test('zonas: sem lista de bases, nenhuma; o raio da base antes do do equipamento', () => {
    const elevationAt = () => 100
    expect(computeZones(null, { elevationAt })).toEqual({})
    const z = computeZones(
      [
        { id: 'a', point: em(0, 0), radiusM: 40 },
        { id: 'b', point: em(500, 0), radiusM: null },
      ],
      { elevationAt, radiusM: 120, maxReliefM: 10 },
    )
    expect(z.a.radiusM).toBe(40)
    expect(z.b.radiusM).toBe(120)
  })

  test('bloco sem waypoints: sem trânsito; sem velocidade, o trânsito conta a 10 m/s', () => {
    const bases = [{ id: 'b1', label: 'A', point: em(-1000, 150), radiusM: null }]
    const blocks = [blockAt(1, 0, 0), { ...blockAt(2, 300, 0), waypoints: undefined }]
    const parado = layoutBlocks({ blocks, bases, vlosM: 2000, speed: 0 })
    const dez = layoutBlocks({ blocks, bases, vlosM: 2000, speed: 10 })
    expect(parado.byBlock[1].transitS).toBeCloseTo(dez.byBlock[1].transitS, 9)
    expect(parado.byBlock[1].transitS).toBeCloseTo(parado.byBlock[1].transitM / 10, 9)
    expect(parado.byBlock[2]).toMatchObject({ transitM: null, transitS: 0, baseId: 'b1' })
  })

  test('com bases, um bloco que nenhuma serve (sem geometria) fica «?-n», no fim', () => {
    const bases = [{ id: 'b1', label: 'A', point: em(-100, 150), radiusM: 60 }]
    const blocks = [blockAt(1, 0, 0), { id: 2, timeS: 60 }, blockAt(3, 300, 0)]
    const L = layoutBlocks({ blocks, bases, vlosM: 1000 })
    expect(L.order).toEqual([1, 3, 2])
    expect([1, 3, 2].map((id) => L.byBlock[id].flightLabel)).toEqual(['A-1', 'A-2', '?-3'])
    expect(L.byBlock[2]).toMatchObject({ baseId: null, withinVlos: true, worstVlosM: null })
    // a base com raio próprio: o pedido é o seu, e a ficha sabe que é próprio
    const [row] = summarizeBases({ bases, layout: L })
    expect(row).toMatchObject({ customRadius: true, requestedRadiusM: 60, radiusM: 60 })
    expect(row.blockIds).toEqual([1, 3])
  })

  test('cotas de referência: nenhuma conhecida, nenhuma referência; as que faltam não sobem', () => {
    const blocks = [blockAt(1, 0, 0), blockAt(2, 300, 0)]
    const semCota = { hasBases: true, byBlock: { 1: { refElev: null }, 2: {} } }
    expect(blockReferences(blocks, semCota)).toBeNull()
    expect(blockReferences(blocks, null)).toBeNull()
    expect(blockReferences([], semCota)).toBeNull()
    const refs = blockReferences(blocks, { hasBases: true, byBlock: { 1: { refElev: 130 } } })
    expect(refs).toEqual({ refs: [130, null], common: 130 })
    // na rota de visualização, o bloco sem cota fica na comum e o sem waypoints não entra
    const view = blocksViewRoute(
      [blocks[0], blocks[1], { id: 3 }],
      { ...refs, refs: [130, null, 150] },
      90,
    )
    const n0 = blocks[0].waypoints.length
    expect(view.waypoints).toHaveLength(n0 + blocks[1].waypoints.length)
    expect(view.waypoints.every((w) => w[2] === 90)).toBe(true)
    expect(view.breaks).toEqual([n0, n0 + blocks[1].waypoints.length])
    expect(view.perWaypoint).toBeNull()
  })
})

describe('chave da disposição dos blocos', () => {
  const cells = [square(0, 0, 250), square(250, 0, 250)]
  test('mosaico, grelha da âncora ou corte da serpentina; sem nada, vazia', () => {
    expect(blockLayoutKey({ tiles: cells })).toMatch(/^t2:/)
    expect(blockLayoutKey({ gridCells: cells })).toMatch(/^g2:/)
    const blocks = [blockAt(1, 0, 0), blockAt(2, 300, 0)]
    expect(blockLayoutKey({ blocks })).toMatch(/^s2:/)
    // a mesma disposição dá a mesma chave; outra disposição, outra
    expect(blockLayoutKey({ gridCells: cells })).toBe(blockLayoutKey({ gridCells: [...cells] }))
    expect(blockLayoutKey({ gridCells: cells })).not.toBe(
      blockLayoutKey({ gridCells: [square(10, 0, 250), cells[1]] }),
    )
    // o mosaico tem prioridade; blocos sem faixas ficam com «-»
    expect(blockLayoutKey({ tiles: cells, gridCells: cells })).toMatch(/^t2:/)
    expect(blockLayoutKey({ blocks: [{ id: 1 }] })).toBe('s1:-')
    expect(blockLayoutKey({})).toBe('')
    expect(blockLayoutKey({ tiles: [], gridCells: [], blocks: [] })).toBe('')
  })
})

describe('cabe numa bateria? (fusão das tiras do mosaico)', () => {
  const base = { usableS: 20 * 60, spacingM: 40, speed: 8, lineAngleDeg: 0, zoneRadiusM: 100 }
  const sq = (s) => [em(0, 0), em(s, 0), em(s, s), em(0, s)]

  test('prolongamento, fiada de amarração, paragens e margem custam tempo', () => {
    const { side } = squareSideWithBaseTransit(
      { batteryMin: 20, speed: 8, spacingM: 40, maxSideM: 5000 },
      { zoneRadiusM: 100 },
    )
    const cabe = (extra) => cellFitsBattery({ ...base, ...extra })(sq(side), side * side)
    expect(cabe({})).toBe(true)
    expect(cabe({ overshootM: 60 })).toBe(false)
    expect(cabe({ tieLine: true })).toBe(false)
    expect(cabe({ stopEveryM: 10 })).toBe(false)
    expect(cabe({ bufferPct: 30 })).toBe(false)
    expect(cabe({ bufferM: 40 })).toBe(false)
    expect(cabe({ passes: 2 })).toBe(false)
    // valores sem sentido não contam
    expect(cabe({ overshootM: -5, bufferPct: -10, bufferM: Number.NaN })).toBe(true)
  })

  test('sem velocidade conta a 10 m/s; raio da zona inválido conta 0; anel inválido não cabe', () => {
    const at10 = cellFitsBattery({ ...base, speed: 10 })
    const at0 = cellFitsBattery({ ...base, speed: 0 })
    for (const s of [300, 400, 500, 600, 700])
      expect(at0(sq(s), s * s), `lado ${s}`).toBe(at10(sq(s), s * s))
    const semZona = cellFitsBattery({ ...base, zoneRadiusM: 0 })
    const invalida = cellFitsBattery({ ...base, zoneRadiusM: Number.NaN })
    for (const s of [400, 500, 600, 700, 800])
      expect(invalida(sq(s), s * s), `lado ${s}`).toBe(semZona(sq(s), s * s))
    expect(at10(null, 1)).toBe(false)
    expect(at10([em(0, 0), em(1, 1)], 1)).toBe(false)
  })

  test('o lado da bateria, sem velocidade e sem zona, como com 10 m/s e raio 0', () => {
    const opts = { batteryMin: 20, spacingM: 40, maxSideM: 5000 }
    expect(squareSideWithBaseTransit({ ...opts, speed: 0 }, { zoneRadiusM: 100 })).toEqual(
      squareSideWithBaseTransit({ ...opts, speed: 10 }, { zoneRadiusM: 100 }),
    )
    expect(squareSideWithBaseTransit({ ...opts, speed: 8 }, { zoneRadiusM: -1 })).toEqual(
      squareSideWithBaseTransit({ ...opts, speed: 8 }, { zoneRadiusM: 0 }),
    )
  })

  test('sem margem: o quadrado da bateria cabe e um 20 % maior não, com as outras opções', () => {
    for (const overshootM of [0, 30])
      for (const tieLine of [false, true])
        for (const passes of [1, 2])
          for (const stopEveryM of [0, 25]) {
            const extra = { overshootM, tieLine, passes, stopEveryM }
            const { side } = squareSideWithBaseTransit(
              { batteryMin: 20, speed: 8, spacingM: 40, maxSideM: 5000, ...extra },
              { zoneRadiusM: 100 },
            )
            const fits = cellFitsBattery({ ...base, ...extra })
            const k = JSON.stringify(extra)
            expect(fits(sq(side), side * side), k).toBe(true)
            expect(fits(sq(side * 1.2), side * side * 1.44), k).toBe(false)
          }
  })

  // Com margem os dois modelos não concordam: squareSideWithBaseTransit conta
  // o trânsito de canto sobre o lado da célula, (2r + (1+√2)·L)/v, e
  // cellFitsBattery sobre o lado voado, alargado pela margem (L + 2·bM). Com
  // a base num canto da célula, o pior trânsito anda por (1+√2)·(L + bM): um
  // conta (1+√2)·bM/v a menos, o outro a mais (10 s com 25 m de margem a
  // 6 m/s). O quadrado que o mosaico dimensiona para a bateria (390 m, com
  // faixas a 40 m) é assim recusado pelo teste de fusão das tiras.
  const comMargem = { bufferM: 25, speed: 6 }
  const ladoComMargem = () =>
    squareSideWithBaseTransit(
      { batteryMin: 20, spacingM: 40, maxSideM: 5000, ...comMargem },
      { zoneRadiusM: 100 },
    ).side

  test('com margem: o lado da bateria é menor (a célula voada é a alargada)', () => {
    const sem = squareSideWithBaseTransit(
      { batteryMin: 20, spacingM: 40, maxSideM: 5000, speed: 6 },
      { zoneRadiusM: 100 },
    ).side
    expect(ladoComMargem()).toBe(390)
    expect(ladoComMargem()).toBeLessThan(sem)
  })

  test.fails(
    'com margem: o quadrado da bateria também cabe (modelos de trânsito por alinhar)',
    () => {
      const side = ladoComMargem()
      expect(cellFitsBattery({ ...base, ...comMargem })(sq(side), side * side)).toBe(true)
    },
  )
})

describe('zona de descolagem com parâmetros inválidos', () => {
  // encosta a 10 %: 1 m por cada 10 m para leste
  const slope = (lon) => 100 + xOf(lon) / 10

  test('raio inválido: só o ponto; passo e azimutes inválidos: os de omissão', () => {
    const p = em(0, 0)
    const z = computeTakeoffZone(p, { elevationAt: slope, radiusM: Number.NaN })
    expect(z).toMatchObject({ requestedRadiusM: 0, radiusM: 0, reduced: false, refElev: 100 })
    const omissao = computeTakeoffZone(p, { elevationAt: slope, radiusM: 50, maxReliefM: 100 })
    const invalidos = computeTakeoffZone(p, {
      elevationAt: slope,
      radiusM: 50,
      maxReliefM: 100,
      ringStepM: -1,
      bearings: 0,
    })
    expect(invalidos).toEqual(omissao)
    // desnível máximo inválido: sem limite, a zona fica com o raio pedido
    const semLimite = computeTakeoffZone(p, { elevationAt: slope, radiusM: 200, maxReliefM: -5 })
    expect(semLimite).toMatchObject({ radiusM: 200, reduced: false, cause: null })
    expect(semLimite.reliefM).toBeCloseTo(40, 0)
  })

  test('atribuição: sem bases, nada; blocos inválidos saltam; escolha para base que já não existe', () => {
    const blocks = [{ id: 1, ring: square(0, 0, 300) }, { id: 2, ring: [em(0, 0)] }, null]
    expect(assignBlocksToBases(blocks, null, { vlosM: 1000 })).toEqual({})
    expect(assignBlocksToBases(null, [{ id: 'a', point: em(0, 0) }], { vlosM: 1000 })).toEqual({})
    const r = assignBlocksToBases(blocks, [{ id: 'a', point: em(-50, 0) }], {
      vlosM: 1000,
      manual: { 1: 'zz' },
    })
    expect(Object.keys(r)).toEqual(['1'])
    expect(r[1]).toMatchObject({ baseId: 'a', manual: false, withinVlos: true })
  })
})

describe('proposta de bases', () => {
  const flat = { elev: 200, reliefM: 0 }
  // o bloco 3 não aceita sítio nenhum (rádio a 50 % em toda a parte)
  const site = {
    info: () => flat,
    view: (_p, id) =>
      id === 3 ? { radio: 0.5, visible: 1, n: 10 } : { radio: 1, visible: 1, n: 10 },
    accepts: siteAccepts,
  }
  const fila = (gap) => [
    { id: 1, ring: square(0, 0, 400) },
    { id: 2, ring: square(400, 0, 400) },
    { id: 3, ring: square(800 + gap, 0, 400) },
  ]

  test('bloco sem sítio aceite que uma base já escolhida vê: junta-se a ela', () => {
    const out = proposeBases(fila(0), { vlosM: 1000, radiusM: 100, site })
    expect(out).toHaveLength(1)
    expect(out[0].blockIds).toEqual([1, 2, 3])
    expect(out[0].siteOk).toBe(false)
    // o rádio do sítio é o médio dos três blocos
    expect(out[0].site.radio).toBeCloseTo(2.5 / 3, 9)
  })

  test('longe de mais para essa base: fica com a sua, assinalada', () => {
    const out = proposeBases(fila(300), { vlosM: 1000, radiusM: 100, site })
    expect(out.map((b) => [b.blockIds, b.siteOk])).toEqual([
      [[1, 2], true],
      [[3], false],
    ])
    expect(Math.round(xOf(out[1].point[0]))).toBeGreaterThan(1100)
  })

  test('alvos, propostas e listas em falta', () => {
    expect(proposalTargets({ blocks: null, vlosM: 1000 })).toEqual([])
    expect(proposalTargets({ blocks: [blockAt(1, 0, 0)], vlosM: 0 })).toEqual([])
    // sem nada a propor, as atribuições ficam (também sem lista)
    const nada = proposeMoreBases({ blocks: [], bases: [], manual: null, vlosM: 1000 })
    expect(nada).toEqual({ bases: [], blockBase: {}, added: 0, outOfVlos: 0, poorSites: 0 })
    const r = applyProposal({ bases: null, manual: null, proposal: null })
    expect(r).toEqual({ bases: [], blockBase: {}, added: 0, outOfVlos: 0, poorSites: 0 })
    // uma proposta num ponto inválido não cria base
    const bad = applyProposal({
      bases: [],
      proposal: [{ point: [Number.NaN, 0], blockIds: [1], outOfVlos: false, siteOk: true }],
    })
    expect(bad.bases).toEqual([])
    expect(bad.blockBase).toEqual({})
    // o limite de voos por base chega à proposta
    const blocks = [blockAt(1, 0, 0), blockAt(2, 300, 0), blockAt(3, 600, 0)]
    const um = proposeMoreBases({ blocks, bases: [], vlosM: 2000, maxBlocksPerBase: 1 })
    expect(um.added).toBe(3)
  })

  test('regra de sítio sem «accepts» aceita qualquer vista; sem «view», nenhuma', () => {
    const dois = fila(0).slice(0, 2)
    const vista = { radio: 0.2, visible: 0.3, n: 10 }
    const tudo = proposeBases(dois, {
      vlosM: 1000,
      radiusM: 100,
      site: { info: () => flat, view: () => vista },
    })
    expect(tudo.map((b) => [b.blockIds, b.siteOk])).toEqual([[[1, 2], true]])
    const nada = proposeBases(dois, { vlosM: 1000, radiusM: 100, site: { info: () => flat } })
    expect(nada.every((b) => b.siteOk === false)).toBe(true)
    expect(nada.flatMap((b) => b.blockIds).sort()).toEqual([1, 2])
    // sem vista de nenhum bloco, o rádio e a vista do sítio contam zero
    expect(nada[0].site).toEqual({ elev: 200, reliefM: 0, radio: 0, visible: 0 })
  })

  test('em fatias, o progresso nunca recua e acaba em 1', () => {
    const hill = (lon, lat) => 200 + 30 * Math.exp(-((xOf(lon) - 300) ** 2 + yOf(lat) ** 2) / 2e5)
    const run = createBaseProposalRun({
      blocks: [blockAt(1, 0, 0), blockAt(2, 300, 0)],
      vlosM: 1000,
      defaultRadiusM: 100,
      altitudeM: 100,
      terrain: { elevationAt: hill },
    })
    const seen = [run.progress()]
    expect(run.result()).toBeNull()
    while (!run.step(() => true)) seen.push(run.progress())
    seen.push(run.progress())
    expect(seen[0]).toBeCloseTo(0.02, 9)
    expect(seen.at(-1)).toBe(1)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(seen.some((p) => p > 0.1 && p < 0.98)).toBe(true)
    expect(run.done()).toBe(true)
    expect(run.result().added).toBeGreaterThan(0)
  })
})

describe('lista de bases: entradas em falta', () => {
  test('cores dão a volta, também com índices negativos; rótulos iguais empatam', () => {
    expect(baseColor(8)).toBe(baseColor(0))
    expect(baseColor(-1)).toBe(baseColor(7))
    expect(baseColor(undefined)).toBe(baseColor(0))
    expect(compareLabels('B', 'B')).toBe(0)
    expect(compareLabels(null, undefined)).toBe(0)
    expect(compareLabels('Z', 'AA')).toBeLessThan(0)
  })

  test('sem lista: as operações devolvem listas vazias, nunca rebentam', () => {
    expect(sortedBases(null)).toEqual([])
    const { bases, base } = addBase(null, em(0, 0))
    expect(base).toMatchObject({ id: 'b1', label: 'A', radiusM: null })
    expect(bases).toEqual([base])
    expect(addBase(null, [200, 0])).toEqual({ bases: [], base: null })
    expect(moveBase(null, 'b1', em(1, 1))).toEqual([])
    expect(setBaseRadius(null, 'b1', 50)).toEqual([])
    expect(removeBase(null, null, 'b1')).toEqual({ bases: [], blockBase: {} })
    expect(assignBlockBase(null, 3, [])).toEqual({})
    expect(assignBlockBase(null, 3, [base])).toEqual({ 3: 'b1' })
  })

  test('ids de outros formatos não contam para o id novo; ids que não são texto são refeitos', () => {
    const lidas = normalizeBases([
      { id: 'casa', label: 'A', point: em(0, 0) },
      { id: 7, label: 'B', point: em(100, 0) },
      { id: 'b3', label: 'C', point: em(200, 0) },
    ])
    expect(lidas.map((b) => b.id)).toEqual(['casa', 'b1', 'b3'])
    expect(addBase(lidas, em(300, 0)).base.id).toBe('b4')
  })
})

describe('sítios das bases: entradas raras', () => {
  const hill = (lon, lat) =>
    200 + 30 * Math.exp(-((xOf(lon) - 150) ** 2 + (yOf(lat) - 150) ** 2) / 2e4)
  const rings = [square(0, 0, 300)]

  test('vista de um bloco sem resultado, com erro ou sem pontos: nenhuma; contagens em falta', () => {
    expect(siteViewOf(null)).toBeNull()
    expect(siteViewOf({ error: 'no-terrain', total: 10 })).toBeNull()
    expect(siteViewOf({ total: 0 })).toBeNull()
    expect(siteViewOf({ total: 20 })).toEqual({ radio: 1, visible: 0, n: 20 })
    expect(siteViewOf({ total: 20, radioFail: 5, visibleFrac: 0.9 })).toEqual({
      radio: 0.75,
      visible: 0.9,
      n: 20,
    })
  })

  test('altos do relevo: a grelha engrossa acima do máximo de nós; grelha inválida, a de omissão', () => {
    const fino = highPointsStepper({
      rings,
      elevationAt: hill,
      vlosM: 1000,
      gridM: 10,
      maxNodes: 1000,
    })
    expect(fino.gridM).toBeGreaterThan(10)
    expect(fino.gridM % 10).toBe(0)
    const invalida = highPointsStepper({ rings, elevationAt: hill, vlosM: 1000, gridM: -1 })
    expect(invalida.gridM).toBe(SITE_HIGHPOINT_GRID_M)
    // o alto do monte (o nó da grelha mais perto do cimo) está entre os escolhidos
    const altos = terrainHighPoints({
      rings,
      elevationAt: hill,
      vlosM: 1000,
      marginM: 0,
      gridM: 50,
    })
    expect(altos.some((p) => Math.hypot(xOf(p[0]) - 150, yOf(p[1]) - 150) < 25)).toBe(true)
  })

  test('anéis fechados contam como abertos; relevo com buracos não dá altos onde não há relevo', () => {
    const args = { elevationAt: hill, vlosM: 1000, marginM: 100, gridM: 50 }
    expect(terrainHighPoints({ ...args, rings: [[...rings[0], rings[0][0]]] })).toEqual(
      terrainHighPoints({ ...args, rings }),
    )
    const metade = (lon, lat) => (xOf(lon) < 160 ? hill(lon, lat) : null)
    const altos = terrainHighPoints({ ...args, rings, elevationAt: metade })
    expect(altos.length).toBeGreaterThan(0)
    expect(altos.every((p) => xOf(p[0]) < 160)).toBe(true)
  })

  test('sem blocos, sem relevo ou sem VLOS: nenhum alto, e o passo acaba logo', () => {
    for (const a of [
      { rings: null, elevationAt: hill, vlosM: 1000 },
      { rings: [[em(0, 0), em(10, 0)]], elevationAt: hill, vlosM: 1000 },
      { rings, elevationAt: null, vlosM: 1000 },
      { rings, elevationAt: hill, vlosM: 0 },
    ]) {
      const s = highPointsStepper(a)
      expect(s.total).toBe(0)
      expect(s.next()).toBe(true)
      expect(s.result()).toEqual([])
    }
  })
})
