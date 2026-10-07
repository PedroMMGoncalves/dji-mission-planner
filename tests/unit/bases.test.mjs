// Bases múltiplas: a lista de bases do operador (src/mission/bases.js) e a
// ligação aos blocos (src/mission/baseLayout.js) — base de cada bloco, cota
// de referência da zona, trânsito no pior caso, numeração dos voos por base,
// proposta de bases que não mexe nas do operador e o lado do quadrado com o
// trânsito de uma base no canto do bloco. Mais a tradução das células
// desactivadas dos projectos com o mosaico antigo (mosaicLegacy.js).
import { describe, expect, test } from 'vitest'
import {
  addBase,
  assignBlockBase,
  blockClickTarget,
  baseColor,
  BASE_COLORS,
  compareLabels,
  legacyBases,
  moveBase,
  nearestBase,
  nextBaseLabel,
  normalizeBases,
  normalizeBlockBase,
  removeBase,
  setBaseRadius,
  sortedBases,
} from '../../src/mission/bases.js'
import {
  blockLayoutKey,
  blockReferences,
  blockRing,
  blocksViewRoute,
  cellFitsBattery,
  computeZones,
  convexHull,
  CORNER_TRANSIT_FACTOR,
  layoutBlocks,
  proposeMoreBases,
  squareSideWithBaseTransit,
  summarizeBases,
} from '../../src/mission/baseLayout.js'
import {
  legacyDisabledForMosaic,
  legacyTileSide,
  translateLegacyDisabledTiles,
} from '../../src/mission/mosaicLegacy.js'
import { buildSquareMosaic } from '../../src/mission/squareMosaic.js'
import { distanceM } from '../../src/mission/takeoffZones.js'
import { squareSideForBattery, tilePolygonWithSquares } from '../../src/utils/geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
/** ponto a x m para leste e y m para norte da origem */
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const square = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]

/** Bloco quadrado de lado s com uma serpentina E-W de faixas a 50 m. */
function blockAt(id, x, y, s = 500, timeS = 600) {
  const lines = []
  for (let k = 0, yy = y + 25; yy < y + s; k++, yy += 50) {
    const a = em(x, yy)
    const b = em(x + s, yy)
    lines.push(k % 2 === 0 ? [a, b] : [b, a])
  }
  return {
    id,
    cellRing: square(x, y, s),
    lines,
    waypoints: lines.flat(),
    timeS,
    transitS: 0,
  }
}

describe('bases: lista do operador', () => {
  test('rótulos A, B, C...; um rótulo retirado volta a ser usado; ids nunca repetem', () => {
    let { bases } = addBase([], em(0, 0))
    bases = addBase(bases, em(100, 0)).bases
    bases = addBase(bases, em(200, 0)).bases
    expect(bases.map((b) => b.label)).toEqual(['A', 'B', 'C'])
    expect(bases.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    const removed = removeBase(bases, { 1: 'b2', 2: 'b1' }, 'b2')
    expect(removed.bases.map((b) => b.label)).toEqual(['A', 'C'])
    // as atribuições à base retirada caem (o bloco volta à automática)
    expect(removed.blockBase).toEqual({ 2: 'b1' })
    const again = addBase(removed.bases, em(300, 0))
    expect(again.base.label).toBe('B')
    expect(again.base.id).toBe('b4')
    expect(nextBaseLabel([])).toBe('A')
    expect(addBase([], [NaN, 1]).base).toBeNull()
  })

  test('ordem dos rótulos: A..Z antes de AA', () => {
    const order = sortedBases([{ label: 'AA' }, { label: 'B' }, { label: 'A' }, { label: 'Z' }])
    expect(order.map((b) => b.label)).toEqual(['A', 'B', 'Z', 'AA'])
    expect(compareLabels('B', 'AA')).toBeLessThan(0)
  })

  test('mover e raio: só a base pedida muda; raio limitado a 0-500, vazio = do equipamento', () => {
    const bases = [
      { id: 'b1', label: 'A', point: em(0, 0), radiusM: null },
      { id: 'b2', label: 'B', point: em(10, 0), radiusM: null },
    ]
    const moved = moveBase(bases, 'b2', em(50, 50))
    expect(moved[0]).toBe(bases[0])
    expect(moved[1].point).toEqual(em(50, 50))
    expect(moveBase(bases, 'b2', [NaN, 0])).toBe(bases)
    expect(setBaseRadius(bases, 'b1', 9999)[0].radiusM).toBe(500)
    expect(setBaseRadius(bases, 'b1', -3)[0].radiusM).toBe(0)
    expect(setBaseRadius(bases, 'b1', null)[0].radiusM).toBeNull()
  })

  test('clicar num bloco: a base escolhida, senão a seguinte pela ordem dos rótulos', () => {
    const bases = [
      { id: 'x', label: 'B', point: em(0, 0) },
      { id: 'y', label: 'A', point: em(0, 0) },
      { id: 'z', label: 'C', point: em(0, 0) },
    ]
    expect(assignBlockBase({}, 4, bases, { baseId: 'z' })).toEqual({ 4: 'z' })
    // A (y) → B (x) → C (z) → A (y)
    expect(assignBlockBase({}, 4, bases, { currentBaseId: 'y' })[4]).toBe('x')
    expect(assignBlockBase({}, 4, bases, { currentBaseId: 'x' })[4]).toBe('z')
    expect(assignBlockBase({}, 4, bases, { currentBaseId: 'z' })[4]).toBe('y')
    // sem base corrente: a primeira
    expect(assignBlockBase({ 1: 'x' }, 4, bases)).toEqual({ 1: 'x', 4: 'y' })
    expect(assignBlockBase({ 1: 'x' }, 4, [])).toEqual({ 1: 'x' })
  })

  test('ficheiro de projecto: lixo descartado, ids e rótulos repetidos refeitos', () => {
    const bases = normalizeBases([
      { id: 'b1', label: 'a', point: em(0, 0), radiusM: 80 },
      { id: 'b1', label: 'A', point: em(1, 0) },
      { label: 'B', point: [500, 0] },
      'x',
      { id: 'q', point: em(2, 0), radiusM: 'zz' },
    ])
    expect(bases.map((b) => [b.id, b.label, b.radiusM])).toEqual([
      ['b1', 'A', 80],
      ['b2', 'B', null],
      ['q', 'C', null],
    ])
    expect(normalizeBases('x')).toEqual([])
    expect(normalizeBlockBase({ 1: 'b1', 2: 'nada', x: 'b1', 0: 'b1', 7: 'q' }, bases)).toEqual({
      1: 'b1',
      7: 'q',
    })
    expect(normalizeBlockBase([1], bases)).toEqual({})
  })

  test('projecto antigo: a base única passa a base A, sem raio próprio', () => {
    expect(legacyBases(em(5, 5))).toEqual([
      { id: 'b1', label: 'A', point: em(5, 5), radiusM: null },
    ])
    expect(legacyBases(null)).toEqual([])
    expect(legacyBases('x')).toEqual([])
  })

  test('modos de rota única: a base mais próxima da rota; com uma só base, ela', () => {
    const a = { id: 'a', label: 'A', point: em(0, 0) }
    const b = { id: 'b', label: 'B', point: em(5000, 0) }
    const route = [em(4000, 0), em(4500, 100)]
    expect(nearestBase([a, b], route)).toBe(b)
    expect(nearestBase([a], route)).toBe(a)
    // sem rota: a primeira pela ordem dos rótulos
    expect(nearestBase([b, a], null)).toBe(a)
    expect(nearestBase([], route)).toBeNull()
  })

  test('cores das bases: distintas e alternando claras e escuras', () => {
    expect(new Set(BASE_COLORS).size).toBe(BASE_COLORS.length)
    const lum = (hex) => {
      const n = parseInt(hex.slice(1), 16)
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
    }
    for (let i = 0; i + 1 < BASE_COLORS.length; i++) {
      // luminosidade alterna: vizinhas na ordem distinguem-se sem cor
      expect(Math.abs(lum(BASE_COLORS[i]) - lum(BASE_COLORS[i + 1]))).toBeGreaterThan(40)
    }
    expect(baseColor(BASE_COLORS.length)).toBe(BASE_COLORS[0])
  })
})

describe('baseLayout: blocos, bases e voos', () => {
  // 2×2 blocos de 500 m; base A a sudoeste, B a nordeste
  const blocks = [blockAt(1, 0, 0), blockAt(2, 500, 0), blockAt(3, 0, 500), blockAt(4, 500, 500)]
  const A = { id: 'ba', label: 'A', point: em(-20, -20), radiusM: null }
  const B = { id: 'bb', label: 'B', point: em(1020, 1020), radiusM: null }

  test('invólucro convexo: os cantos, sem pontos colineares', () => {
    const hull = convexHull([em(0, 0), em(50, 0), em(100, 0), em(100, 100), em(0, 100), em(50, 50)])
    expect(hull).toHaveLength(4)
    const ring = blockRing(blocks[0])
    expect(ring).toHaveLength(4)
  })

  test('cada bloco na base de menor alcance no pior caso; manual respeitado', () => {
    const L = layoutBlocks({ blocks, bases: [B, A], vlosM: 1000, speed: 10 })
    expect(L.hasBases).toBe(true)
    expect(L.byBlock[1].baseId).toBe('ba')
    expect(L.byBlock[4].baseId).toBe('bb')
    // canto oposto do bloco 1 visto de A: √(520² + 520²) + 100 m de zona
    expect(L.byBlock[1].worstVlosM).toBeCloseTo(Math.hypot(520, 520) + 100, -1)
    expect(L.byBlock[1].withinVlos).toBe(true)
    const manual = layoutBlocks({ blocks, bases: [A, B], manual: { 1: 'bb' }, vlosM: 1000 })
    expect(manual.byBlock[1]).toMatchObject({ baseId: 'bb', manual: true, withinVlos: false })
  })

  test('voos numerados base a base, pela ordem dos rótulos e do mosaico', () => {
    const L = layoutBlocks({
      blocks,
      bases: [B, A],
      manual: { 2: 'bb', 3: 'ba' },
      vlosM: 1000,
    })
    // A: 1 e 3; B: 2 e 4
    expect(L.order).toEqual([1, 3, 2, 4])
    expect(L.order.map((id) => L.byBlock[id].flightLabel)).toEqual(['A-1', 'A-2', 'B-3', 'B-4'])
    expect(L.bases.map((b) => [b.label, b.flights])).toEqual([
      ['A', ['A-1', 'A-2']],
      ['B', ['B-3', 'B-4']],
    ])
    // os ids não mudam (são os das exportações)
    expect(L.byBlock[2].id).toBe(2)
    // cor da base: a da posição do rótulo
    expect(L.byBlock[1].color).toBe(baseColor(0))
    expect(L.byBlock[2].color).toBe(baseColor(1))
  })

  test('sem bases: só a numeração, 1..n, sem base nem referência', () => {
    const L = layoutBlocks({ blocks: [blocks[2], blocks[0]], vlosM: 1000 })
    expect(L.hasBases).toBe(false)
    expect(L.order).toEqual([1, 3])
    expect(L.byBlock[3]).toMatchObject({ flightLabel: '2', baseId: null, refElev: null })
    expect(blockReferences(blocks, L)).toBeNull()
    expect(layoutBlocks({ blocks: [], vlosM: 1 })).toBeNull()
  })

  test('trânsito no pior caso: ida ao primeiro waypoint e volta do último, com o raio', () => {
    const L = layoutBlocks({ blocks, bases: [A], vlosM: 5000, speed: 10 })
    const b = blocks[3]
    const want =
      distanceM(A.point, b.waypoints[0]) +
      100 +
      distanceM(A.point, b.waypoints[b.waypoints.length - 1]) +
      100
    expect(L.byBlock[4].transitM).toBeCloseTo(want, 6)
    expect(L.byBlock[4].transitS).toBeCloseTo(want / 10, 6)
  })

  test('cota de referência: a mínima da zona da base; base fora do relevo cai na do bloco', () => {
    // rampa para leste: 0,1 m/m; a base B no fim alto
    const elevationAt = (lon) => {
      const x = xOf(lon)
      return x > 1500 ? null : 100 + 0.1 * x
    }
    const zones = computeZones([A, B], { elevationAt, radiusM: 100, maxReliefM: 50 })
    expect(zones.ba.refElev).toBeCloseTo(100 + 0.1 * -120, 0)
    expect(zones.bb.refElev).toBeCloseTo(100 + 0.1 * 920, 0)
    const L = layoutBlocks({ blocks, bases: [A, B], zones, vlosM: 1000, elevationAt })
    expect(L.byBlock[1]).toMatchObject({ refSource: 'zone', refElev: zones.ba.refElev })
    expect(L.byBlock[4]).toMatchObject({ refSource: 'zone', refElev: zones.bb.refElev })
    const refs = blockReferences(blocks, L)
    expect(refs.common).toBe(Math.min(zones.ba.refElev, zones.bb.refElev))
    // base B fora do relevo: os seus blocos ficam na mínima de cada bloco
    const far = { ...B, point: em(3000, 3000) }
    const z2 = computeZones([A, far], { elevationAt, radiusM: 100, maxReliefM: 50 })
    expect(z2.bb.error).toBe('no-terrain')
    const L2 = layoutBlocks({
      blocks,
      bases: [A, far],
      zones: z2,
      manual: { 4: 'bb' },
      vlosM: 5000,
      elevationAt,
    })
    expect(L2.byBlock[4]).toMatchObject({ baseNoTerrain: true, refSource: 'block-min' })
    expect(L2.byBlock[4].refElev).toBeCloseTo(100 + 0.1 * 500, 0)
    expect(L2.bases.find((b) => b.id === 'bb').noTerrain).toBe(true)
    // sem relevo nenhum: sem zonas
    expect(computeZones([A], { elevationAt: null })).toEqual({})
  })

  test('rota de visualização: alturas na cota comum e os troços entre blocos marcados', () => {
    const two = [
      { id: 1, waypoints: [em(0, 0), em(100, 0)] },
      { id: 2, waypoints: [em(0, 50, 0), [...em(100, 50), 80]] },
    ]
    const vr = blocksViewRoute(two, { refs: [150, 170], common: 150 }, 100)
    expect(vr.breaks).toEqual([2])
    expect(vr.waypoints.map((w) => w[2])).toEqual([100, 100, 120, 100])
  })

  test('proposta: só para os blocos sem base que os veja; as do operador ficam', () => {
    const many = []
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) many.push(blockAt(i * 3 + j + 1, i * 500, j * 500))
    const mine = { id: 'b1', label: 'A', point: em(500, 500), radiusM: null }
    const res = proposeMoreBases({ blocks: many, bases: [mine], vlosM: 1000 })
    expect(res.bases[0]).toBe(mine)
    expect(res.added).toBeGreaterThan(0)
    expect(res.bases.map((b) => b.label)).toEqual(
      ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, res.bases.length),
    )
    const L = layoutBlocks({ blocks: many, bases: res.bases, manual: res.blockBase, vlosM: 1000 })
    expect(many.every((b) => L.byBlock[b.id].baseId && L.byBlock[b.id].withinVlos)).toBe(true)
    // os blocos que A já via não foram tirados a A nem fixados à mão
    const seenByA = layoutBlocks({ blocks: many, bases: [mine], vlosM: 1000 })
    for (const b of many)
      if (seenByA.byBlock[b.id].withinVlos) expect(res.blockBase[b.id]).toBeUndefined()
    // as novas pela ordem do mosaico: a 1.ª proposta serve o bloco de menor id
    const firstNew = res.bases[1].id
    const firstIds = Object.entries(res.blockBase)
      .filter(([, v]) => v === firstNew)
      .map(([k]) => Number(k))
    const otherIds = Object.entries(res.blockBase)
      .filter(([, v]) => v !== firstNew)
      .map(([k]) => Number(k))
    expect(Math.min(...firstIds)).toBeLessThan(Math.min(...otherIds))
    // nada a propor: tudo igual
    const none = proposeMoreBases({
      blocks: many,
      bases: res.bases,
      manual: res.blockBase,
      vlosM: 1000,
    })
    expect(none.added).toBe(0)
    expect(none.bases).toBe(res.bases)
  })

  test('proposta: máximo de voos por base', () => {
    const many = []
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) many.push(blockAt(i * 4 + j + 1, i * 300, j * 300, 300))
    const free = proposeMoreBases({ blocks: many, bases: [], vlosM: 1000 })
    const capped = proposeMoreBases({ blocks: many, bases: [], vlosM: 1000, maxBlocksPerBase: 2 })
    const perBase = (r) => {
      const n = {}
      for (const v of Object.values(r.blockBase)) n[v] = (n[v] ?? 0) + 1
      return Object.values(n)
    }
    expect(Math.max(...perBase(free))).toBeGreaterThan(2)
    expect(Math.max(...perBase(capped))).toBeLessThanOrEqual(2)
    expect(Object.keys(capped.blockBase)).toHaveLength(16)
  })

  test('resumo das bases: zona, reduzida e porquê, ganho e voos', () => {
    // corta: fundo 40 m abaixo a 60 m da base A
    const elevationAt = (lon, lat) => {
      const d = distanceM(A.point, [lon, lat])
      return d >= 55 ? 60 : 100
    }
    const zones = computeZones([A, B], { elevationAt, radiusM: 100, maxReliefM: 10 })
    const L = layoutBlocks({ blocks, bases: [A, B], zones, vlosM: 2000, elevationAt })
    const rows = summarizeBases({ bases: [B, A], zones, layout: L, defaultRadiusM: 100 })
    expect(rows.map((r) => r.label)).toEqual(['A', 'B'])
    expect(rows[0]).toMatchObject({
      reduced: true,
      radiusM: 50,
      requestedRadiusM: 100,
      refElev: 100,
    })
    expect(rows[0].cause.atM).toBe(60)
    expect(rows[0].flights.length + rows[1].flights.length).toBe(4)
    const noTerrain = summarizeBases({ bases: [A], zones: {}, defaultRadiusM: 100 })
    expect(noTerrain[0]).toMatchObject({ refElev: null, radiusM: 100, blockIds: [] })
  })

  test('chave da disposição: muda com o mosaico, não com a desactivação nem com as bases', () => {
    const tiles = [square(0, 0, 100), square(100, 0, 100)]
    const k = blockLayoutKey({ tiles, blocks })
    expect(blockLayoutKey({ tiles, blocks: blocks.slice(1) })).toBe(k)
    expect(blockLayoutKey({ tiles: [square(5, 0, 100), tiles[1]] })).not.toBe(k)
    expect(blockLayoutKey({ blocks })).toMatch(/^s4:/)
    expect(blockLayoutKey({})).toBe('')
  })
})

describe('lado do quadrado com o trânsito de uma base no canto', () => {
  const opts = { batteryMin: 25, reservePct: 0, speed: 10, spacingM: 60, maxSideM: 2000 }

  test('o maior lado à dezena em que voo + trânsito de canto cabem no tempo útil', () => {
    const { side, transitS } = squareSideWithBaseTransit(opts, { zoneRadiusM: 100 })
    const noTransit = squareSideForBattery({ ...opts, transitS: 0 })
    expect(side).toBeLessThan(noTransit)
    expect(transitS).toBeCloseTo((200 + CORNER_TRANSIT_FACTOR * side) / 10, 9)
    expect(squareSideForBattery({ ...opts, transitS })).toBeGreaterThanOrEqual(side)
    // 10 m mais já não cabe
    const t2 = (200 + CORNER_TRANSIT_FACTOR * (side + 10)) / 10
    expect(squareSideForBattery({ ...opts, transitS: t2 })).toBeLessThan(side + 10)
  })

  test('lado limitado pelo tecto (VLOS): o trânsito não o muda', () => {
    const capped = { ...opts, maxSideM: 500 }
    expect(squareSideWithBaseTransit(capped, { zoneRadiusM: 100 }).side).toBe(500)
  })

  test('não depende de onde estão as bases (só do raio da zona)', () => {
    const a = squareSideWithBaseTransit(opts, { zoneRadiusM: 100 }).side
    const b = squareSideWithBaseTransit(opts, { zoneRadiusM: 300 }).side
    expect(b).toBeLessThanOrEqual(a)
  })

  test('fusão de tiras: o conjunto tem de caber numa bateria', () => {
    const { side } = squareSideWithBaseTransit(opts, { zoneRadiusM: 100 })
    const fits = cellFitsBattery({
      usableS: 25 * 60,
      spacingM: 60,
      speed: 10,
      lineAngleDeg: 90,
      zoneRadiusM: 100,
    })
    expect(fits(square(0, 0, side), side * side)).toBe(true)
    // um quadrado com mais 25 % já não cabe quando o lado é o da bateria
    const big = [em(0, 0), em(side * 1.25, 0), em(side * 1.25, side), em(0, side)]
    expect(fits(big, 1.25 * side * side)).toBe(false)
    // sem bateria não há limite
    expect(cellFitsBattery({ usableS: 0, spacingM: 60, speed: 10 })(big, 1e9)).toBe(true)
  })
})

describe('mosaico antigo: células desactivadas traduzidas para o mosaico novo', () => {
  const ring = [em(0, 0), em(1000, 0), em(1000, 700), em(0, 700)]

  test('lado antigo: o manual, ou o da bateria com o trânsito da base única', () => {
    expect(legacyTileSide({ split: { mode: 'tiles', tileSize: 250 } })).toBe(250)
    const args = {
      split: { mode: 'battery', maxSide: 2000 },
      ring,
      batteryMin: 20,
      speed: 10,
      spacingM: 40,
    }
    const noBase = legacyTileSide(args)
    expect(noBase).toBe(
      squareSideForBattery({ batteryMin: 20, speed: 10, spacingM: 40, maxSideM: 2000 }),
    )
    // base a 1 km da área: trânsito de 200 s descontado, como antes
    expect(legacyTileSide({ ...args, basePoint: em(-1000, 350) })).toBe(
      squareSideForBattery({
        batteryMin: 20,
        speed: 10,
        spacingM: 40,
        maxSideM: 2000,
        transitS: 200,
      }),
    )
  })

  test('uma célula nova fica desactivada quando pelo menos metade dela estava desactivada', () => {
    const old = tilePolygonWithSquares(ring, 250, 0)
    // a coluna mais a oeste da grelha antiga, desactivada
    const minX = Math.min(...old.map((c) => Math.min(...c.map((p) => xOf(p[0])))))
    const west = old
      .map((c, i) => ({ i, x: Math.min(...c.map((p) => xOf(p[0]))) }))
      .filter((c) => c.x < minX + 1)
      .map((c) => c.i)
    expect(west.length).toBeGreaterThan(1)
    const mosaic = buildSquareMosaic(ring, { sideM: 250, orientationDeg: 0 })
    const off = translateLegacyDisabledTiles(old, west, mosaic.cells)
    expect(off.size).toBeGreaterThan(0)
    for (const i of off) {
      const xs = mosaic.cells[i].ring.map((p) => xOf(p[0]))
      expect(Math.min(...xs)).toBeLessThan(250)
    }
    // nada desactivado: nada a traduzir
    expect(translateLegacyDisabledTiles(old, [], mosaic.cells).size).toBe(0)
    // a função completa refaz a grelha antiga a partir do projecto
    const full = legacyDisabledForMosaic({
      ring,
      split: { mode: 'tiles', tileSize: 250, tileOrientation: 0 },
      disabled: west,
      newCells: mosaic.cells,
    })
    expect([...full]).toEqual([...off])
  })
})

describe('clique num bloco com uma base seleccionada', () => {
  test('vai para a base seleccionada; se já é dela, nada; sem selecção, nada', () => {
    expect(blockClickTarget('b2', 'b1')).toBe('b2')
    expect(blockClickTarget('b2', null)).toBe('b2')
    // um segundo clique nunca passa o bloco para a base seguinte
    expect(blockClickTarget('b2', 'b2')).toBeNull()
    expect(blockClickTarget(null, 'b1')).toBeNull()
    expect(blockClickTarget(undefined, 'b1')).toBeNull()
  })
})
