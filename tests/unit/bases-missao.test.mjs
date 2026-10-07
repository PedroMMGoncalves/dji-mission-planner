// Bases múltiplas na missão de área: alturas do seguimento de terreno por
// bloco (cota da zona da base de cada bloco), mosaico novo no plano (buracos
// por célula, ids estáveis), verificações de rota que não contam os troços
// entre blocos, preflight bloco a bloco e o ficheiro de projecto (bases,
// atribuições, migração da base única e das células do mosaico antigo).
import { describe, expect, test } from 'vitest'
import { planTerrainFollow } from '../../src/mission/terrainFollow.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { planBlocks } from '../../src/mission/blocks.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import { routeClearance } from '../../src/mission/clearance.js'
import { routeChecks } from '../../src/mission/uncertainty.js'
import { hasBlockers, preflightArea } from '../../src/mission/preflight.js'
import { computeZones, layoutBlocks } from '../../src/mission/baseLayout.js'
import { normalizeProject, serializeProject } from '../../src/mission/project.js'
import { normalizeEquipment, defaultEquipment } from '../../src/mission/equipment.js'
import { generateFlightPlan } from '../../src/utils/geo.js'
import preflightDict from '../../src/i18n/dict.preflight.js'
import basesDict from '../../src/i18n/dict.bases.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const xOf = (lon) => (lon + 9.14) * mLon
const opts = {
  spacingM: 50,
  angleDeg: 90,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 10,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
}

describe('mosaico novo no plano de área', () => {
  // área 1000 × 500 com um buraco inteiro dentro do primeiro quadrado
  const ring = [em(0, 0), em(1000, 0), em(1000, 500), em(0, 500)]
  const hole = [em(150, 150), em(300, 150), em(300, 300), em(150, 300)]
  const mosaic = buildSquareMosaic(ring, {
    holes: [hole],
    sideM: 500,
    orientationDeg: mosaicOrientationForLines(opts.angleDeg),
  })

  test('os buracos de cada célula vêm do mosaico; ids estáveis ao desactivar', () => {
    expect(mosaic.cells).toHaveLength(2)
    const withHole = mosaic.cells.findIndex((c) => c.holes.length === 1)
    expect(withHole).toBeGreaterThanOrEqual(0)
    // a célula sem o buraco desactivada: fica a outra, com o seu id
    const keep = [withHole]
    const plan = planArea(
      ring,
      keep.map((i) => mosaic.cells[i].ring),
      {
        ...opts,
        holes: [hole],
        cellHoles: keep.map((i) => mosaic.cells[i].holes),
      },
    )
    expect(plan.error).toBeUndefined()
    // as faixas não atravessam o buraco: nenhum waypoint dentro dele
    const inHole = plan.waypoints.some(([lon, lat]) => {
      const x = xOf(lon)
      const y = (lat - lat0) * 110574
      return x > 151 && x < 299 && y > 151 && y < 299
    })
    expect(inHole).toBe(false)
    const blocks = planBlocks(plan, {
      activeCells: keep.map((i) => mosaic.cells[i].ring),
      cellIds: keep.map((i) => i + 1),
      split: { mode: 'battery' },
    })
    expect(blocks.map((b) => b.id)).toEqual([withHole + 1])
    expect(blocks[0].cellRing).toEqual(mosaic.cells[withHole].ring)
  })
})

describe('seguimento de terreno com a cota de cada bloco', () => {
  // rampa para leste: 0,1 m por metro
  const terrain = { elevationAt: (lon) => 100 + 0.1 * xOf(lon) }
  const lines = [
    [em(0, 0), em(400, 0)],
    [em(400, 50), em(0, 50)],
    [em(600, 0), em(1000, 0)],
    [em(1000, 50), em(600, 50)],
  ]
  const plan = { lines, waypoints: lines.flat() }
  const blocks = [
    { id: 1, lines: lines.slice(0, 2), nadirLineLocal: null },
    { id: 2, lines: lines.slice(2), nadirLineLocal: null },
  ]

  test('alturas de cada bloco = AGL + terreno − cota da zona da sua base', () => {
    const r = planTerrainFollow(terrain, plan, {
      blocks,
      refElev: 100,
      agl: 60,
      toleranceM: 1,
      blockRefs: [100, 150],
    })
    expect(r.refElev).toBe(100)
    for (const [i, ref] of [
      [0, 100],
      [1, 150],
    ]) {
      const b = r.blocks3[i]
      expect(b.refElev).toBe(ref)
      for (const [lon, , h] of b.waypoints)
        expect(h).toBeCloseTo(60 + 0.1 * xOf(lon) + 100 - ref, 1)
    }
    // o mesmo bloco com a mesma cota é o do cálculo global (sem refazer)
    const same = planTerrainFollow(terrain, plan, { blocks, refElev: 100, agl: 60, toleranceM: 1 })
    expect(r.blocks3[0].waypoints).toEqual(same.blocks3[0].waypoints)
    // mesmos pontos, alturas deslocadas de 50 m
    expect(r.blocks3[1].waypoints.map((w) => w.slice(0, 2))).toEqual(
      same.blocks3[1].waypoints.map((w) => w.slice(0, 2)),
    )
    for (let k = 0; k < r.blocks3[1].waypoints.length; k++)
      expect(r.blocks3[1].waypoints[k][2]).toBeCloseTo(same.blocks3[1].waypoints[k][2] - 50, 6)
  })

  test('a exportação por blocos leva as alturas de cada bloco', () => {
    const r = planTerrainFollow(terrain, plan, {
      blocks,
      refElev: 100,
      agl: 60,
      toleranceM: 1,
      blockRefs: [100, 150],
    })
    const { blocks: out } = buildAreaExport({
      missionName: 'm',
      plan,
      terrainResult: r,
      blocks,
      spacingM: 50,
      sensorType: 'camera',
      altitude: 60,
      speed: 10,
      wpml: { droneEnumValue: 1, payloadEnumValue: 1, payloadPositionIndex: 0 },
      photoIntervalM: 20,
      triggerMode: 'distance',
      gimbalPitch: -90,
    })
    expect(out).toHaveLength(2)
    expect(out[1].waypoints[0][2]).toBeCloseTo(60 + 0.1 * 600 - 50, 1)
    expect(out[0].waypoints[0][2]).toBeCloseTo(60, 1)
  })

  test('altura relativa negativa (bloco abaixo da base) dá o aviso de sempre', () => {
    const r = planTerrainFollow(terrain, plan, {
      blocks,
      refElev: 100,
      agl: 30,
      blockRefs: [100, 400],
    })
    expect(r.warnings.some((w) => /Altura relativa mínima/.test(w))).toBe(true)
  })
})

describe('troços entre blocos não se voam', () => {
  // dois blocos a cotas diferentes; o troço que os liga nunca se voa (cada
  // bloco descola da sua base)
  const wps = [
    [...em(0, 0), 100],
    [...em(100, 0), 100],
    [...em(100, 200), 260],
    [...em(0, 200), 260],
  ]

  test('subida e folga ignoram o troço que começa um bloco', () => {
    const all = routeChecks(wps, { speed: 10, maxClimbMS: 5 })
    expect(all.climb.map((c) => c.at)).toEqual([2])
    expect(routeChecks(wps, { speed: 10, maxClimbMS: 5, breaks: [2] }).climb).toEqual([])
    // uma lomba de 250 m entre os dois blocos, debaixo só do troço não voado
    const elevationAt = (lon, lat) => {
      const y = (lat - lat0) * 110574
      return y > 60 && y < 140 ? 250 : 0
    }
    const flown = routeClearance(wps, { elevationAt, refElev: 0, breaks: [2] })
    expect(flown.minM).toBeCloseTo(100, 6)
    expect(routeClearance(wps, { elevationAt, refElev: 0 }).minM).toBeLessThan(0)
  })
})

describe('preflight bloco a bloco com bases', () => {
  const ring = [em(0, 0), em(1000, 0), em(1000, 500), em(0, 500)]
  const plan = generateFlightPlan(ring, opts)
  const blk = (id, x) => {
    const lines = [
      [em(x, 25), em(x + 500, 25)],
      [em(x + 500, 75), em(x, 75)],
    ]
    return {
      id,
      lines,
      waypoints: lines.flat(),
      cellRing: [em(x, 0), em(x + 500, 0), em(x + 500, 500), em(x, 500)],
      timeS: 600,
      transitS: 0,
    }
  }
  const blocks = [blk(1, 0), blk(2, 500)]
  const A = { id: 'ba', label: 'A', point: em(-10, -10), radiusM: null }
  const B = { id: 'bb', label: 'B', point: em(5000, 0), radiusM: null }
  const items = (layout, extra = {}) =>
    preflightArea({
      plan,
      blocks,
      photoMode: 'distance',
      terrainFollow: { enabled: false, tolerance: 5 },
      basePoint: A.point,
      baseDistance: null,
      speed: 10,
      batteryMin: 25,
      reservePct: 0,
      baseLayout: layout,
      vlosM: 1000,
      ...extra,
    })

  test('fora do alcance visual da sua base: aviso com o voo, o bloco, a base e a distância', () => {
    const L = layoutBlocks({ blocks, bases: [A, B], manual: { 2: 'bb' }, vlosM: 1000, speed: 10 })
    const out = items(L)
    const v = out.find((i) => i.code === 'block-vlos')
    expect(v).toMatchObject({
      level: 'warn',
      params: { flight: 'B-2', id: 2, base: 'B', vlos: 1000 },
    })
    expect(v.params.m).toBeGreaterThan(4000)
    // e o trânsito dessa base: só ele já passa os 25 min? 2 × ~4,6 km a 10 m/s = ~15 min, não
    expect(out.find((i) => i.code === 'battery-block-base')).toMatchObject({
      level: 'warn',
      params: { flight: 'B-2', id: 2, base: 'B' },
    })
    expect(out.some((i) => i.code === 'battery-block')).toBe(false)
  })

  test('trânsito que sozinho passa o tempo útil: bloqueio, como a base inalcançável', () => {
    const far = { ...B, point: em(50000, 0) }
    const L = layoutBlocks({ blocks, bases: [A, far], manual: { 2: 'bb' }, vlosM: 1000, speed: 10 })
    const out = items(L)
    expect(out.find((i) => i.code === 'block-base-unreachable')).toMatchObject({
      level: 'block',
      params: { flight: 'B-2', base: 'B' },
    })
    expect(hasBlockers(out)).toBe(true)
  })

  test('zona reduzida (nota), base fora do relevo (bloqueio), bloco sem base (bloqueio)', () => {
    // corta junto de A: 40 m de desnível a partir de 50 m
    const elevationAt = (lon, lat) => {
      const x = xOf(lon)
      if (x > 3000) return null
      return Math.hypot(x + 10, (lat - lat0) * 110574 + 10) >= 50 ? 60 : 100
    }
    const zones = computeZones([A, B], { elevationAt, radiusM: 100, maxReliefM: 10 })
    const L = layoutBlocks({
      blocks,
      bases: [A, B],
      zones,
      manual: { 2: 'bb' },
      vlosM: 10000,
      elevationAt,
    })
    const out = items(L)
    expect(out.find((i) => i.code === 'base-zone-reduced')).toMatchObject({
      level: 'info',
      params: { base: 'A', req: 100 },
    })
    expect(out.find((i) => i.code === 'base-zone-no-terrain')).toMatchObject({
      level: 'block',
      params: { base: 'B', flights: 'B-2' },
    })
    // um bloco sem base com bases no projecto (não devia acontecer)
    const orphan = { ...L, byBlock: { ...L.byBlock, 1: { ...L.byBlock[1], baseId: null } } }
    expect(items(orphan).find((i) => i.code === 'block-no-base')).toMatchObject({ level: 'block' })
  })

  test('todos os códigos novos têm mensagem em PT e EN, e os textos das bases também', () => {
    for (const code of [
      'block-vlos',
      'battery-block-base',
      'block-base-unreachable',
      'block-no-base',
      'base-zone-no-terrain',
      'base-zone-reduced',
    ]) {
      expect(preflightDict[`preflight.${code}`]?.pt, code).toBeTruthy()
      expect(preflightDict[`preflight.${code}`]?.en, code).toBeTruthy()
    }
    for (const [k, v] of Object.entries(basesDict)) {
      expect(v.pt, k).toBeTruthy()
      expect(v.en, k).toBeTruthy()
      // as mesmas variáveis nas duas línguas
      const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(vars(v.en), k).toEqual(vars(v.pt))
    }
  })
})

describe('projecto: bases, atribuições e migrações', () => {
  test('a base única antiga abre como base A', () => {
    const n = normalizeProject({ version: 2, basePoint: em(5, 5) })
    expect(n.bases).toEqual([{ id: 'b1', label: 'A', point: em(5, 5), radiusM: null }])
    expect(n.blockBase).toEqual({})
    // e quando há bases, a base única antiga já não conta
    const both = normalizeProject({
      version: 2,
      basePoint: em(5, 5),
      bases: [{ id: 'k', label: 'B', point: em(9, 9) }],
      blockBase: { 2: 'k', 3: 'zz' },
    })
    expect(both.bases).toEqual([{ id: 'k', label: 'B', point: em(9, 9), radiusM: null }])
    expect(both.blockBase).toEqual({ 2: 'k' })
  })

  test('mosaico antigo com células desactivadas: traduzidas ao abrir; o novo guarda a geração', () => {
    const old = normalizeProject({
      version: 2,
      split: { mode: 'tiles', tileSize: 250, tileOrientation: 30 },
      basePoint: em(1, 1),
      disabledTiles: [0, 3],
    })
    // índices da grelha antiga: não valem no mosaico novo
    expect(old.disabledTiles.size).toBe(0)
    expect([...old.legacyMosaic.disabled]).toEqual([0, 3])
    expect(old.legacyMosaic.basePoint).toEqual(em(1, 1))
    expect(old.legacyMosaic.tileOrientation).toBe(30)
    // mosaico manual antigo: mantém a orientação guardada
    expect(old.split).toMatchObject({ tileOrientationAuto: false, mosaic: 2 })
    // divisão por bateria antiga: sem orientação na interface, passa a seguir as faixas
    const bat = normalizeProject({ version: 2, split: { mode: 'battery' }, disabledTiles: [] })
    expect(bat.split.tileOrientationAuto).toBe(true)
    expect(bat.legacyMosaic).toBeUndefined()
    // projecto novo: os índices valem tal como estão
    const now = normalizeProject(
      JSON.parse(
        JSON.stringify(
          serializeProject({
            split: { mode: 'tiles', tileSize: 250, tileOrientationAuto: true },
            disabledTiles: new Set([1]),
            bases: [],
            blockBase: {},
          }),
        ),
      ),
    )
    expect([...now.disabledTiles]).toEqual([1])
    expect(now.legacyMosaic).toBeUndefined()
  })

  test('equipamento: máximo de voos por base, 0 = sem limite, inteiro 0-50', () => {
    expect(defaultEquipment().maxFlightsPerBase).toBe(0)
    expect(normalizeEquipment({ maxFlightsPerBase: 3.6 }).maxFlightsPerBase).toBe(4)
    expect(normalizeEquipment({ maxFlightsPerBase: 999 }).maxFlightsPerBase).toBe(50)
    expect(normalizeEquipment({ maxFlightsPerBase: -2 }).maxFlightsPerBase).toBe(0)
    expect(normalizeEquipment({ maxFlightsPerBase: 'x' }).maxFlightsPerBase).toBe(0)
  })
})
