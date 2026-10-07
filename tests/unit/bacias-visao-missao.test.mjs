// Bacias de visao na missao de area: trabalhos por bloco com base (cota do
// drone do plano, chaves que so mudam com o que muda o resultado), corrida
// em fatias que retoma onde parou, resumos para o painel e a ficha, faixas
// para o mapa, itens do preflight e a altura dos olhos da Configuracao.
import { describe, it, expect } from 'vitest'
import {
  GLOBAL_TERRAIN_RESOLUTION_M,
  OBSTACLE_LIMITS_M,
  RADIO_CHECK,
  createViewshedRun,
  droneElevation,
  hiddenStrips,
  normalizeObstacleM,
  radioStrips,
  ringLabelPoint,
  viewSummary,
  viewshedJobs,
  viewshedTerrainModel,
  viewshedsByBlock,
} from '../../src/mission/viewshedPlan.js'
import {
  DEFAULT_ANTENNA_HEIGHT_M,
  DEFAULT_EYE_HEIGHT_M,
  blockVisibility,
} from '../../src/mission/viewshed.js'
import { normalizeProject, serializeProject } from '../../src/mission/project.js'
import { blockRing, computeZones, layoutBlocks } from '../../src/mission/baseLayout.js'
import { VIEWSHED_WARN_FRAC, preflightArea } from '../../src/mission/preflight.js'
import { baseFieldSheets } from '../../src/mission/fieldSheet.js'
import { summarizeBases } from '../../src/mission/baseLayout.js'
import { defaultEquipment, normalizeEquipment } from '../../src/mission/equipment.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon

/** Planicie a 150 m com uma cumeada norte-sul de 40 m (sigma 20 m) em x = 900 m. */
const ridge = (lon) => 150 + 40 * Math.exp(-((xOf(lon) - 900) ** 2) / 800)

/** Dois blocos de 250 m (x 1000..1250 e 1250..1500, y 1000..1250), serpentina simples. */
const blk = (id, x) => {
  const lines = [
    [em(x + 10, 1010), em(x + 240, 1010)],
    [em(x + 240, 1240), em(x + 10, 1240)],
  ]
  return {
    id,
    lines,
    waypoints: lines.flat(),
    cellRing: [em(x, 1000), em(x + 250, 1000), em(x + 250, 1250), em(x, 1250)],
    timeS: 300,
    transitS: 0,
  }
}
const blocks = [blk(1, 1000), blk(2, 1250)]
const A = { id: 'ba', label: 'A', point: em(650, 1125), radiusM: null }

function setup({ bases = [A], elevationAt = ridge, manual = {} } = {}) {
  const zones = computeZones(bases, { elevationAt, radiusM: 100, maxReliefM: 10 })
  const layout = layoutBlocks({ blocks, bases, zones, manual, vlosM: 1000, speed: 10, elevationAt })
  return { zones, layout }
}
const jobsFor = (layout, over = {}) =>
  viewshedJobs({
    blocks,
    layout,
    bases: over.bases ?? [A],
    altitudeM: 100,
    terrainFollow: false,
    terrainKey: 't1',
    resolutionM: 10,
    ...over,
  })
const runAll = (jobs, elevationAt = ridge) => {
  const run = createViewshedRun(jobs, { elevationAt, resolutionM: 10 })
  run.step(() => false)
  return run
}

describe('modelo de relevo das bacias', () => {
  it('global ~30 m, ou o MDT importado com o nome e a resolucao do ficheiro', () => {
    const elevationAt = () => 0
    expect(viewshedTerrainModel(null)).toBeNull()
    expect(viewshedTerrainModel({ source: 'file' })).toBeNull()
    expect(viewshedTerrainModel({ elevationAt, zoom: 12 })).toEqual({
      kind: 'global',
      label: null,
      resolutionM: GLOBAL_TERRAIN_RESOLUTION_M,
      surface: 'dtm',
      obstacleM: 0,
    })
    expect(GLOBAL_TERRAIN_RESOLUTION_M).toBe(30)
    const file = { elevationAt, source: 'file', label: 'mdt.tif', resolutionM: 0.5 }
    expect(viewshedTerrainModel(file)).toEqual({
      kind: 'file',
      label: 'mdt.tif',
      resolutionM: 0.5,
      surface: 'dtm',
      obstacleM: 0,
    })
    expect(viewshedTerrainModel({ elevationAt, source: 'file' })).toMatchObject({
      kind: 'file',
      label: null,
      resolutionM: 0,
    })
  })

  it('vegetacao e obstaculos: so com um MDT ou o global; um MDS importado ja os tem', () => {
    const elevationAt = () => 0
    const file = { elevationAt, source: 'file', label: 'f.tif', resolutionM: 1 }
    expect(viewshedTerrainModel(file, { obstacleM: 15 }).obstacleM).toBe(15)
    expect(viewshedTerrainModel(file, { surface: 'dsm', obstacleM: 15 })).toMatchObject({
      surface: 'dsm',
      obstacleM: 0,
    })
    // o global e sempre MDT, mesmo com a escolha do ficheiro em MDS
    expect(viewshedTerrainModel({ elevationAt }, { surface: 'dsm', obstacleM: 8 })).toMatchObject({
      kind: 'global',
      surface: 'dtm',
      obstacleM: 8,
    })
    expect(OBSTACLE_LIMITS_M).toEqual({ min: 0, max: 60 })
    expect(normalizeObstacleM(99)).toBe(60)
    expect(normalizeObstacleM(-3)).toBe(0)
    expect(normalizeObstacleM('12.3')).toBe(12.5)
    expect(normalizeObstacleM(null)).toBe(0)
    expect(normalizeObstacleM('x')).toBe(0)
  })

  it('o projecto guarda a vegetacao da missao (0 nos projectos anteriores)', () => {
    const saved = serializeProject({ missionName: 'm', obstacleHeightM: 12 })
    expect(saved.obstacleHeightM).toBe(12)
    expect(normalizeProject(JSON.parse(JSON.stringify(saved))).obstacleHeightM).toBe(12)
    expect(normalizeProject({ version: 2 }).obstacleHeightM).toBe(0)
    expect(normalizeProject({ version: 2, obstacleHeightM: 500 }).obstacleHeightM).toBe(60)
  })
})

describe('trabalhos por bloco', () => {
  it('um por bloco com base, pela ordem de voo; sem seguimento a cota da zona + altura', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout)
    expect(jobs.map((j) => [j.blockId, j.flightLabel, j.baseLabel])).toEqual([
      [1, 'A-1', 'A'],
      [2, 'A-2', 'A'],
    ])
    expect(layout.byBlock[1].refElev).toBeCloseTo(150, 3)
    for (const j of jobs) {
      expect(j.drone.mode).toBe('flat')
      expect(j.drone.elev).toBeCloseTo(250, 3)
      expect(j.eye).toBe(A.point)
      expect(j.ring).toEqual(blockRing(blocks[j.blockId - 1]))
    }
  })

  it('com seguimento de terreno: relevo + AGL; sem bases, sem layout ou sem altura: nenhum', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout, { terrainFollow: true })
    expect(jobs.every((j) => j.drone.mode === 'agl' && j.drone.agl === 100)).toBe(true)
    expect(jobsFor(null)).toEqual([])
    expect(jobsFor({ ...layout, hasBases: false })).toEqual([])
    expect(jobsFor(layout, { altitudeM: NaN })).toEqual([])
    expect(viewshedJobs({ blocks: [], layout, bases: [A], altitudeM: 100 })).toEqual([])
  })

  it('sem cota de referencia (sem relevo) e sem seguimento: o bloco fica de fora', () => {
    const layout = layoutBlocks({ blocks, bases: [A], vlosM: 1000 })
    expect(layout.byBlock[1].refElev).toBeNull()
    expect(jobsFor(layout)).toEqual([])
    // com seguimento de terreno a cota vem do relevo e nao da referencia
    expect(jobsFor(layout, { terrainFollow: true })).toHaveLength(2)
  })

  it('a chave so muda com o que muda o resultado', () => {
    const B = { id: 'bb', label: 'B', point: em(1600, 1125), radiusM: null }
    const { layout } = setup({ bases: [A, B], manual: { 1: 'ba', 2: 'bb' } })
    const keys = (over = {}) => jobsFor(layout, { bases: [A, B], ...over }).map((j) => j.key)
    const k0 = keys()
    expect(new Set(k0).size).toBe(2)
    expect(keys()).toEqual(k0)
    // mover B: so o bloco de B
    const B2 = { ...B, point: em(1610, 1125) }
    const { layout: L2 } = setup({ bases: [A, B2], manual: { 1: 'ba', 2: 'bb' } })
    const k1 = jobsFor(L2, { bases: [A, B2] }).map((j) => j.key)
    expect(k1[0]).toBe(k0[0])
    expect(k1[1]).not.toBe(k0[1])
    // altura, olhos, relevo, resolucao, modo: todos
    for (const over of [
      { altitudeM: 90 },
      { eyeHeightM: 2 },
      { terrainKey: 't2' },
      { resolutionM: 2 },
      { terrainFollow: true },
      { antennaHeightM: 2 },
      { obstacleM: 10 },
    ]) {
      const k = keys(over)
      expect(k[0]).not.toBe(k0[0])
      expect(k[1]).not.toBe(k0[1])
    }
  })

  it('cota do drone: constante sem seguimento, relevo + AGL com ele (null sem relevo)', () => {
    expect(droneElevation({ mode: 'flat', elev: 250 }, () => null)(0, 0)).toBe(250)
    const f = droneElevation({ mode: 'agl', agl: 80 }, (lon) => (lon > 0 ? null : 120))
    expect(f(-1, 0)).toBe(200)
    expect(f(1, 0)).toBeNull()
  })
})

describe('corrida em fatias', () => {
  it('da o mesmo resultado que blockVisibility, bloco a bloco', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout)
    const run = runAll(jobs)
    expect(run.done()).toBe(true)
    for (const j of jobs) {
      const ref = blockVisibility({
        eye: {
          point: j.eye,
          heightM: DEFAULT_EYE_HEIGHT_M,
          antennaHeightM: DEFAULT_ANTENNA_HEIGHT_M,
        },
        blockRing: j.ring,
        droneElevAt: () => j.drone.elev,
        elevationAt: ridge,
        resolutionM: 10,
        fresnel: RADIO_CHECK,
      })
      // sem zonas o olho fica no ponto da base
      expect(run.results.get(j.key)).toEqual({
        ...ref,
        eye: { point: j.eye, shiftM: 0, bearingDeg: 0 },
      })
    }
  })

  it('cada fatia para quando lhe dizem, e retoma no mesmo ponto do mesmo bloco', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout)
    // relogio falso: cada leitura do relevo e um tique
    let clock = 0
    const elevationAt = (lon, lat) => {
      clock++
      return ridge(lon, lat)
    }
    const run = createViewshedRun(jobs, { elevationAt, resolutionM: 10 })
    const BUDGET = 200
    const slices = []
    let finished = false
    while (!finished) {
      const t0 = clock
      finished = run.step(() => clock - t0 >= BUDGET)
      slices.push(clock - t0)
      expect(slices.length).toBeLessThan(10000)
    }
    // um raio de ~860 m a passos de 10 m sao no maximo ~90 leituras (o radio le-o todo)
    expect(Math.max(...slices)).toBeLessThanOrEqual(BUDGET + 100)
    expect(slices.length).toBeGreaterThan(10)
    const ref = runAll(jobs)
    for (const j of jobs) expect(run.results.get(j.key)).toEqual(ref.results.get(j.key))
  })

  it('interrompida a meio fica so com os blocos acabados; base fora do relevo da erro', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout)
    const run = createViewshedRun(jobs, { elevationAt: ridge, resolutionM: 10 })
    let calls = 0
    expect(run.step(() => ++calls > 5)).toBe(false)
    expect(run.results.size).toBe(0)
    expect(run.done()).toBe(false)
    const out = runAll([{ ...jobs[0], key: 'fora', eye: em(99999, 0) }], (lon) =>
      xOf(lon) > 50000 ? null : 150,
    )
    expect(out.results.get('fora')).toEqual({ error: 'no-terrain' })
  })
})

describe('a cumeada entre a base e o bloco de leste', () => {
  it('da planicie a oeste: o bloco de leste fica tapado em parte; do alto da cumeada, nada', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout)
    const { byBlock, ready, pending } = viewshedsByBlock(jobs, runAll(jobs).results)
    expect(ready).toBe(true)
    expect(pending).toBe(0)
    expect(byBlock[1].summary.hidden).toBe(0)
    expect(byBlock[1].summary.visiblePct).toBe(100)
    const s2 = byBlock[2].summary
    expect(s2.hiddenFrac).toBeGreaterThan(0.4)
    expect(s2.hiddenFrac).toBeLessThan(1)
    // tapado pela cumeada, a ~250 m da base
    expect(s2.blockedAtM).toBeGreaterThanOrEqual(230)
    expect(s2.blockedAtM).toBeLessThanOrEqual(260)
    // a orla da sombra, a vista mas com a cumeada na zona de Fresnel: radio em risco
    expect(s2.radioOnly).toBeGreaterThan(0)
    expect(s2.radioFail).toBeGreaterThanOrEqual(s2.hidden + s2.radioOnly)
    expect(s2.radioAtM).toBeGreaterThanOrEqual(230)
    expect(s2.radioAtM).toBeLessThanOrEqual(260)
    const firstShadow = Math.min(...byBlock[2].result.hidden.map((h) => xOf(h.point[0])))
    for (const q of byBlock[2].result.radioRisk)
      expect(xOf(q.point[0])).toBeLessThan(firstShadow + 26)
    // todos os pontos tapados estao a mais de ~600 m da base (a sombra)
    for (const h of byBlock[2].result.hidden) expect(xOf(h.point[0])).toBeGreaterThan(1250)

    const top = { ...A, point: em(900, 1125) }
    const { layout: L2 } = setup({ bases: [top] })
    const j2 = jobsFor(L2, { bases: [top] })
    const v2 = viewshedsByBlock(j2, runAll(j2).results)
    expect(
      Object.values(v2.byBlock).every((v) => v.summary.hidden === 0 && v.summary.radioFail === 0),
    ).toBe(true)
    // 10 m de vegetacao somados ao MDT: a sombra cresce para o bloco de oeste
    const veg = jobsFor(layout, { obstacleM: 10 })
    const run = createViewshedRun(veg, { elevationAt: ridge, resolutionM: 10, obstacleM: 10 })
    run.step(() => false)
    const v3 = viewshedsByBlock(veg, run.results)
    expect(v3.byBlock[1].summary.hidden).toBeGreaterThan(0)
    expect(v3.byBlock[2].summary.hidden).toBeGreaterThan(s2.hidden)
  })

  it('um bloco cujo trabalho mudou fica sem resultado ate ser recalculado', () => {
    const { layout } = setup()
    const jobs = jobsFor(layout)
    const results = runAll(jobs).results
    const moved = jobsFor(layout, { altitudeM: 120 })
    const v = viewshedsByBlock(moved, results)
    expect(v.pending).toBe(2)
    expect(v.ready).toBe(false)
    expect(v.byBlock[1].summary).toBeNull()
    expect(viewshedsByBlock([], results)).toEqual({ byBlock: {}, pending: 0, ready: false })
  })
})

describe('resumo, faixas e rotulo', () => {
  const hiddenAt = (n, d = 300) =>
    Array.from({ length: n }, (_, i) => ({ point: em(i * 25, 0), blockedAtM: d + i }))

  it('percentagens inteiras sem arredondar um ponto tapado para 0 %', () => {
    const s = viewSummary({ total: 1000, hidden: hiddenAt(1, 423), unknown: 3, gridStepM: 25 })
    expect(s).toMatchObject({ status: 'ok', hidden: 1, hiddenPct: 1, visiblePct: 99, unknown: 3 })
    expect(s.blockedAtM).toBe(420)
    const all = viewSummary({ total: 4, hidden: hiddenAt(4, 100), unknown: 0 })
    expect(all.hiddenPct).toBe(100)
    expect(all.visiblePct).toBe(0)
    // mediana das distancias: 100, 101, 102, 103 -> 101,5 -> 100
    expect(all.blockedAtM).toBe(100)
    const none = viewSummary({ total: 10, hidden: [], unknown: 10 })
    expect(none).toMatchObject({ hidden: 0, hiddenPct: 0, visiblePct: 100, blockedAtM: null })
    // radio: os pontos a vista em risco a parte, e todos os em risco
    const radio = viewSummary({
      total: 200,
      hidden: hiddenAt(10),
      radioRisk: [
        { point: em(0, 0), atM: 251 },
        { point: em(25, 0), atM: 262 },
        { point: em(50, 0), atM: 270 },
      ],
      radioFail: 13,
      unknown: 0,
    })
    expect(radio).toMatchObject({
      radioOnly: 3,
      radioOnlyPct: 2,
      radioFail: 13,
      radioOkPct: 93,
      radioAtM: 260,
    })
    expect(radio.radioOnlyFrac).toBeCloseTo(0.015, 9)
    // sem radio no resultado, campos a zero
    expect(viewSummary({ total: 10, hidden: [], unknown: 0 })).toMatchObject({
      radioOnly: 0,
      radioFail: 0,
      radioOkPct: 100,
      radioAtM: null,
    })
    expect(viewSummary({ error: 'no-terrain' }).status).toBe('no-terrain')
    expect(viewSummary(null)).toBeNull()
  })

  it('pontos seguidos numa linha da grelha sao uma so faixa; um buraco parte-a', () => {
    const g = 25
    const row = (y, xs) => xs.map((x) => ({ point: em(x, y), blockedAtM: 300 }))
    const res = {
      gridStepM: g,
      hidden: [...row(0, [0, 25, 50, 75]), ...row(25, [0, 25, 100, 125, 150])],
    }
    const strips = hiddenStrips(res)
    expect(strips).toHaveLength(3)
    const width = (s) => (s[1][1] - s[0][1]) * mLon
    const height = (s) => (s[1][0] - s[0][0]) * M_PER_DEG_LAT
    const sorted = strips.map((s) => [width(s), height(s)]).sort((a, b) => b[0] - a[0])
    expect(sorted[0][0]).toBeCloseTo(100, 0)
    expect(sorted[1][0]).toBeCloseTo(75, 0)
    expect(sorted[2][0]).toBeCloseTo(50, 0)
    for (const [, h] of sorted) expect(h).toBeCloseTo(25, 3)
    expect(hiddenStrips({ hidden: [] })).toEqual([])
    expect(hiddenStrips(null)).toEqual([])
    // as do radio: os pontos de radioRisk
    expect(
      radioStrips({ gridStepM: g, radioRisk: res.hidden.map((h) => ({ point: h.point, atM: 1 })) }),
    ).toEqual(strips)
    expect(radioStrips({ hidden: res.hidden })).toEqual([])
  })

  it('rotulo no centroide dos vertices', () => {
    const p = ringLabelPoint([em(0, 0), em(100, 0), em(100, 100), em(0, 100)])
    expect(xOf(p[0])).toBeCloseTo(50, 6)
    expect(ringLabelPoint([])).toBeNull()
  })
})

describe('preflight das bacias de visao', () => {
  const { layout } = setup()
  const plan = { waypoints: blocks.flatMap((b) => b.waypoints), lines: [], stats: {} }
  const view = (id, total, hidden, unknown = 0, radioOnly = 0) => {
    const res = {
      total,
      hidden: Array.from({ length: hidden }, () => ({ point: em(1400, 1100), blockedAtM: 420 })),
      unknown,
      gridStepM: 25,
      radioRisk: Array.from({ length: radioOnly }, () => ({ point: em(1300, 1100), atM: 310 })),
      radioFail: hidden + radioOnly,
    }
    return {
      blockId: id,
      baseLabel: 'A',
      flightLabel: layout.byBlock[id].flightLabel,
      result: res,
      summary: viewSummary(res),
    }
  }
  const items = (viewsheds) =>
    preflightArea({
      plan,
      blocks,
      photoMode: 'distance',
      terrainFollow: { enabled: false, tolerance: 5 },
      basePoint: A.point,
      speed: 10,
      batteryMin: 25,
      reservePct: 0,
      baseLayout: layout,
      vlosM: 1000,
      viewsheds,
    }).filter((i) => i.code.startsWith('block-viewshed') || i.code.startsWith('block-radio'))

  it('limiar de 5 %: aviso a partir dele, nota abaixo, com o voo, a base e a distancia', () => {
    expect(VIEWSHED_WARN_FRAC).toBe(0.05)
    const out = items({ 1: view(1, 100, 18), 2: view(2, 100, 3) })
    expect(out).toEqual([
      {
        level: 'warn',
        code: 'block-viewshed',
        params: { flight: 'A-1', id: 1, base: 'A', pct: 18, m: 420 },
      },
      {
        level: 'info',
        code: 'block-viewshed-minor',
        params: { flight: 'A-2', id: 2, base: 'A', pct: 3, m: 420 },
      },
    ])
    // exactamente 5 %: aviso
    expect(items({ 1: view(1, 100, 5) })[0].level).toBe('warn')
  })

  it('radio: a parte a vista com o rigor da zona de Fresnel, pela mesma regra e com a causa', () => {
    // a vista e com o radio em risco em 12 %: so o aviso do radio
    expect(items({ 1: view(1, 100, 0, 0, 12) })).toEqual([
      {
        level: 'warn',
        code: 'block-radio',
        params: { flight: 'A-1', id: 1, base: 'A', pct: 12, m: 310 },
      },
    ])
    // 3 %: nota
    expect(items({ 1: view(1, 100, 0, 0, 3) })[0]).toMatchObject({
      level: 'info',
      code: 'block-radio-minor',
    })
    // tapado e com a orla em risco: um item por causa
    expect(items({ 2: view(2, 100, 20, 0, 6) }).map((i) => [i.level, i.code])).toEqual([
      ['warn', 'block-viewshed'],
      ['warn', 'block-radio'],
    ])
    // so tapados (o radio desses ja e o da vista): nada do radio
    expect(items({ 2: view(2, 100, 20) }).map((i) => i.code)).toEqual(['block-viewshed'])
  })

  it('nada sem pontos tapados (tambem so desconhecidos), a calcular ou sem relevo', () => {
    expect(items({ 1: view(1, 100, 0, 40), 2: view(2, 100, 0) })).toEqual([])
    expect(items({ 1: { ...view(1, 100, 30), result: null, summary: null } })).toEqual([])
    expect(
      items({ 1: { ...view(1, 1, 0), summary: viewSummary({ error: 'no-terrain' }) } }),
    ).toEqual([])
    expect(items(null)).toEqual([])
  })
})

describe('ficha de campo com as bacias de visao', () => {
  it('por voo a parte visivel e a distancia; o relevo usado; a calcular', () => {
    const { layout, zones } = setup()
    const rows = summarizeBases({ bases: [A], zones, layout })
    const jobs = jobsFor(layout)
    const { byBlock } = viewshedsByBlock(jobs, runAll(jobs).results)
    const terrain = { kind: 'file', label: 'cumeada.tif', resolutionM: 10 }
    const [s] = baseFieldSheets({
      rows,
      layout,
      blocks,
      vlosM: 1000,
      viewsheds: byBlock,
      viewTerrain: terrain,
    })
    expect(s.viewTerrain).toBe(terrain)
    expect(s.viewPending).toBe(false)
    expect(s.flights[0].view).toMatchObject({ visiblePct: 100, hidden: 0 })
    expect(s.flights[1].view.visiblePct).toBeLessThan(60)
    expect(s.flights[1].view.blockedAtM).toBeGreaterThanOrEqual(230)
    expect(s.flights[1].view.blockedAtM).toBeLessThanOrEqual(260)
    expect(s.flights[1].view.radioOnly).toBeGreaterThan(0)
    // um voo ainda a calcular
    const half = viewshedsByBlock(jobsFor(layout, { altitudeM: 110 }), new Map()).byBlock
    const [p] = baseFieldSheets({
      rows,
      layout,
      blocks,
      vlosM: 1000,
      viewsheds: half,
      viewTerrain: terrain,
    })
    expect(p.viewPending).toBe(true)
    expect(p.flights.every((f) => f.view === null)).toBe(true)
    // sem bacias: nada sobre elas
    const [n] = baseFieldSheets({ rows, layout, blocks, vlosM: 1000 })
    expect(n.viewTerrain).toBeNull()
    expect(n.flights[0].view).toBeNull()
  })
})

describe('altura do comando (antena) na Configuracao', () => {
  it('1,5 m por omissao (a mesma das bacias), limitada a 1-5 m, a decima', () => {
    expect(defaultEquipment().antennaHeightM).toBe(1.5)
    expect(defaultEquipment().antennaHeightM).toBe(DEFAULT_ANTENNA_HEIGHT_M)
    expect(normalizeEquipment({ antennaHeightM: 0 }).antennaHeightM).toBe(1)
    expect(normalizeEquipment({ antennaHeightM: 9 }).antennaHeightM).toBe(5)
    expect(normalizeEquipment({ antennaHeightM: 2.04 }).antennaHeightM).toBe(2)
    expect(normalizeEquipment({ antennaHeightM: null }).antennaHeightM).toBe(1.5)
  })
})

describe('altura dos olhos na Configuracao', () => {
  it('1,7 m por omissao (a mesma das bacias), limitada a 1-5 m, a decima', () => {
    expect(defaultEquipment().eyeHeightM).toBe(1.7)
    expect(defaultEquipment().eyeHeightM).toBe(DEFAULT_EYE_HEIGHT_M)
    expect(normalizeEquipment({ eyeHeightM: 0.2 }).eyeHeightM).toBe(1)
    expect(normalizeEquipment({ eyeHeightM: 12 }).eyeHeightM).toBe(5)
    expect(normalizeEquipment({ eyeHeightM: '2.46' }).eyeHeightM).toBe(2.5)
    expect(normalizeEquipment({ eyeHeightM: 'x' }).eyeHeightM).toBe(1.7)
    expect(normalizeEquipment({}).eyeHeightM).toBe(1.7)
  })
})

describe('olho no melhor ponto da zona', () => {
  // alto convexo: patamar a 300 m ate x = 100 m, depois encosta de 60 % ate
  // aos 150 m; o bloco la em baixo (x 400..650), drone a 40 m do solo. Do
  // ponto da base (x = 0) o ombro tapa o bloco; da beira do patamar ve-se.
  const hill = (lon) => Math.max(150, 300 - 0.6 * Math.max(0, xOf(lon) - 100))
  const low = {
    id: 9,
    waypoints: [em(410, 10), em(640, 10), em(640, 240), em(410, 240)],
    cellRing: [em(400, 0), em(650, 0), em(650, 250), em(400, 250)],
  }
  const B = { id: 'bb', label: 'B', point: em(0, 125), radiusM: null }
  const zones = computeZones([B], { elevationAt: hill, radiusM: 100, maxReliefM: 10 })
  const layout = layoutBlocks({
    blocks: [low],
    bases: [B],
    zones,
    vlosM: 1000,
    speed: 10,
    elevationAt: hill,
  })
  const jobs = (z) =>
    viewshedJobs({
      blocks: [low],
      layout,
      bases: [B],
      zones: z,
      altitudeM: 40,
      terrainFollow: true,
      terrainKey: 'h',
      resolutionM: 10,
    })
  const run = (js) => {
    const r = createViewshedRun(js, { elevationAt: hill, resolutionM: 10 })
    r.step(() => false)
    return r.results.get(js[0].key)
  }

  it('do ponto da base o ombro tapa; da beira do patamar ve-se o bloco', () => {
    expect(zones.bb.radiusM).toBeGreaterThan(90)
    const fixed = run(jobs({}))
    expect(fixed.visibleFrac).toBeLessThan(0.5)
    expect(viewSummary(fixed).eye).toBeNull()
    const best = run(jobs(zones))
    expect(best.visibleFrac).toBe(1)
    // o olho foi para leste, ate a beira da zona
    expect(best.eye.shiftM).toBeGreaterThan(60)
    expect(best.eye.shiftM).toBeLessThanOrEqual(zones.bb.radiusM + 1)
    expect(best.eye.bearingDeg).toBeGreaterThan(45)
    expect(best.eye.bearingDeg).toBeLessThan(135)
    expect(viewSummary(best).eye).toEqual(best.eye)
  })

  it('a chave muda com o raio da zona', () => {
    expect(jobs(zones)[0].key).not.toBe(jobs({})[0].key)
  })

  it('com vegetacao somada ao relevo o olho fica no ponto da base', () => {
    expect(jobs(zones)[0].eyeRadiusM).toBeGreaterThan(90)
    const js = viewshedJobs({
      blocks: [low],
      layout,
      bases: [B],
      zones,
      altitudeM: 40,
      terrainFollow: true,
      terrainKey: 'h',
      resolutionM: 10,
      obstacleM: 10,
    })
    expect(js[0].eyeRadiusM).toBe(0)
  })

  it('em fatias da o mesmo que de uma vez', () => {
    const js = jobs(zones)
    const r = createViewshedRun(js, { elevationAt: hill, resolutionM: 10 })
    let n = 0
    while (!r.step(() => true)) n++
    expect(n).toBeGreaterThan(5)
    expect(r.results.get(js[0].key)).toEqual(run(js))
  })
})
