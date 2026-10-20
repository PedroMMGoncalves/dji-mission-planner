/**
 * Ficha de campo (src/mission/fieldSheet.js), o que useFieldSheets entrega à
 * checklist, ao relatório e aos KML: a ficha da rota única com a base
 * marcada (área sem blocos, corredor, circular), com a mesma forma das
 * fichas por base para tudo a mostrar da mesma maneira; a linha do dia
 * (todos os voos contra os conjuntos de baterias da equipa); as alturas do
 * KMZ de um voo; e os casos raros das fichas por base (bloco sem voo
 * atribuído ou sem tempo, sem ficheiro, bacias de visão sem relevo ou ainda
 * a calcular, altura de regresso de cada voo).
 */
import { describe, expect, test } from 'vitest'
import {
  baseFieldSheets,
  daySummary,
  formatLatLon,
  heightsOfWaypoints,
  mapLinks,
  singleRouteSheet,
} from '../../src/mission/fieldSheet.js'
import { buildBasesKML } from '../../src/mission/basesKml.js'
import { defaultEquipment, updateBattery } from '../../src/mission/equipment.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]

/** Equipamento com `count` conjuntos da bateria por omissão do M3E. */
const withSets = (count) => updateBattery(defaultEquipment(), 'M3E', 'padrao', { count })

/** O que useFieldSheets passa para a rota única de um corredor com base. */
const corridorArgs = (extra = {}) => ({
  label: 'A',
  color: '#38bdf8',
  point: em(-40, 10),
  radiusM: 100,
  requestedRadiusM: 100,
  refElev: 152.4,
  gainM: 6.2,
  flightS: 1140,
  transitS: 60,
  vlosM: 500,
  worstVlosM: 430,
  rthM: 80,
  takeoffM: 20,
  heights: { h1M: 100, hmaxM: 112 },
  usefulS: 1800,
  params: { altitudeM: 100, speedMS: 8, frontPct: 80, sidePct: 70, gsdCm: 2.7 },
  equipment: withSets(3),
  aircraftId: 'M3E',
  ...extra,
})

/** Bases e blocos feitos à mão, com a forma de summarizeBases e layoutBlocks. */
function baseFixture() {
  const rows = [
    { id: 'b1', label: 'A', color: '#f00', point: em(-50, 250), radiusM: 100, blockIds: [2, 1] },
    { id: 'b2', label: 'B', color: '#0f0', point: em(2050, 250), radiusM: 100, blockIds: [] },
    {
      id: 'b3',
      label: 'C',
      color: '#00f',
      point: em(900, -400),
      radiusM: 60,
      requestedRadiusM: 100,
      reduced: true,
      cause: { reliefM: 14, atM: 70 },
      refElev: Number.NaN,
      blockIds: [4, 3],
    },
  ]
  const layout = {
    hasBases: true,
    byBlock: {
      1: { flight: 2, flightLabel: 'A-2', transitS: 40, worstVlosM: 600, withinVlos: true },
      2: { flight: 1, flightLabel: 'A-1', transitS: 20, worstVlosM: 300, withinVlos: true },
      3: { flight: 3, flightLabel: 'C-3', transitS: 'x', worstVlosM: 1200, withinVlos: false },
      // o bloco 4 não tem voo atribuído no layout
    },
  }
  // o bloco 4 não está no plano; o 3 não tem tempo
  const blocks = [
    { id: 1, timeS: 600 },
    { id: 2, timeS: 500 },
    { id: 3, timeS: Number.NaN },
  ]
  const files = [
    { blockId: 1, file: 'm_A-2.kmz' },
    { blockId: 2, file: 'm_A-1.kmz' },
  ]
  return { rows, layout, blocks, files }
}

describe('ficha da rota única com base (área sem blocos, corredor, circular)', () => {
  test('um voo com o tempo, o trânsito, o ficheiro e as alturas do KMZ', () => {
    const s = singleRouteSheet(corridorArgs({ file: 'corta_corredor.kmz' }))
    expect(s).toMatchObject({
      id: 'single',
      label: 'A',
      color: '#38bdf8',
      coords: formatLatLon(em(-40, 10)),
      radiusM: 100,
      reduced: false,
      noTerrain: false,
      refElev: 152.4,
      gainM: 6.2,
      rthM: 80,
      takeoffM: 20,
      usefulS: 1800,
      totalS: 1200,
      vlosM: 500,
      worstVlosM: 430,
      viewTerrain: null,
      viewPending: false,
    })
    expect(s.links).toEqual(mapLinks(em(-40, 10), 'Base A'))
    expect(s.links.geo).toMatch(/\(Base%20A\)$/)
    expect(s.flights).toEqual([
      {
        blockId: 1,
        flightLabel: '1',
        file: 'corta_corredor.kmz',
        flightS: 1140,
        transitS: 60,
        totalS: 1200,
        worstVlosM: 430,
        withinVlos: true,
        view: null,
        rthM: 80,
        h1M: 100,
        hmaxM: 112,
        // 1200 s de 1800 s úteis
        pctUseful: 67,
      },
    ])
    // um voo contra três conjuntos
    expect(s.sets).toEqual({ flights: 1, sets: 3, short: false })
    expect(s.params.gsdCm).toBe(2.7)
  })

  test('a mesma forma das fichas por base: os mesmos campos na ficha e no voo', () => {
    const { rows, layout, blocks, files } = baseFixture()
    const [porBase] = baseFieldSheets({ rows, layout, blocks, files, vlosM: 500 })
    const unica = singleRouteSheet(corridorArgs())
    expect(Object.keys(unica).sort()).toEqual(Object.keys(porBase).sort())
    expect(Object.keys(unica.flights[0]).sort()).toEqual(Object.keys(porBase.flights[0]).sort())
  })

  test('o KML «Bases e blocos» leva a ficha da rota única, sem blocos nem layout', () => {
    const s = singleRouteSheet(corridorArgs({ file: 'corta_corredor.kmz' }))
    const kml = buildBasesKML({ name: 'corta', sheets: [s], blocks: null, layout: null })
    expect(kml).toContain('<name>Base A</name>')
    expect(kml).toContain('voo 1: 20 min com deslocação · corta_corredor.kmz')
    expect(kml).toContain('cota de referência 152 m · voo entre 0 e +6 m acima do planeado')
    expect(kml).toContain('descolar até 100 m do ponto')
  })

  test('fora do alcance visual só quando o pior ponto passa o alcance; sem um dos dois, dentro', () => {
    const fora = singleRouteSheet(corridorArgs({ worstVlosM: 720 }))
    expect(fora.flights[0].withinVlos).toBe(false)
    expect(fora.worstVlosM).toBe(720)
    // no limite ainda se vê
    expect(singleRouteSheet(corridorArgs({ worstVlosM: 500 })).flights[0].withinVlos).toBe(true)
    // sem alcance conhecido, ou sem o pior ponto, não se avisa
    expect(singleRouteSheet(corridorArgs({ vlosM: null })).flights[0].withinVlos).toBe(true)
    const semPior = singleRouteSheet(corridorArgs({ worstVlosM: Number.NaN }))
    expect(semPior.flights[0]).toMatchObject({ worstVlosM: null, withinVlos: true })
    expect(semPior.worstVlosM).toBeNull()
  })

  test('percentagem do tempo útil: arredondada, e nula sem bateria útil', () => {
    expect(singleRouteSheet(corridorArgs({ usefulS: 1250 })).flights[0].pctUseful).toBe(96)
    for (const usefulS of [null, 0, -60, Number.POSITIVE_INFINITY])
      expect(singleRouteSheet(corridorArgs({ usefulS })).flights[0].pctUseful).toBeNull()
    expect(singleRouteSheet(corridorArgs({ usefulS: null })).usefulS).toBeNull()
    expect(singleRouteSheet(corridorArgs({ usefulS: Number.NaN })).usefulS).toBeNull()
  })

  test('números que não o são: tempos a 0, o resto a null; sem ponto não há ficha', () => {
    const s = singleRouteSheet(
      corridorArgs({
        flightS: Number.NaN,
        transitS: null,
        refElev: Number.NaN,
        gainM: '6',
        rthM: null,
        takeoffM: Number.POSITIVE_INFINITY,
        heights: { h1M: '100', hmaxM: Number.NaN },
        params: undefined,
        reduced: 1,
        noTerrain: 'sim',
      }),
    )
    expect(s.totalS).toBe(0)
    expect(s.flights[0]).toMatchObject({
      flightS: 0,
      transitS: 0,
      totalS: 0,
      rthM: null,
      h1M: null,
      hmaxM: null,
      pctUseful: 0,
    })
    expect(s).toMatchObject({
      refElev: null,
      gainM: null,
      rthM: null,
      takeoffM: null,
      params: null,
      reduced: true,
      noTerrain: true,
    })
    for (const point of [null, undefined, [], [Number.NaN, 38.7], [-9.14], ['-9.14', '38.7']])
      expect(singleRouteSheet(corridorArgs({ point }))).toBeNull()
  })

  test('a palavra antes do rótulo vem da interface; os valores por omissão de um voo «1» na base A', () => {
    const en = singleRouteSheet({ point: em(0, 0), baseWord: 'Site' })
    expect(en.links.geo).toMatch(/\(Site%20A\)$/)
    expect(en).toMatchObject({ label: 'A', color: null, radiusM: null, cause: null })
    expect(en.flights[0]).toMatchObject({ flightLabel: '1', file: null, totalS: 0 })
    // sem equipamento: os conjuntos da equipa são desconhecidos
    expect(en.sets).toEqual({ flights: 1, sets: null, short: false })
    // sem rótulo, o marcador da aplicação de mapas fica sem nome
    expect(mapLinks([-9.14, 38.7])).toEqual({
      https: 'https://www.google.com/maps/search/?api=1&query=38.700000,-9.140000',
      geo: 'geo:38.700000,-9.140000?q=38.700000,-9.140000',
    })
  })

  test('conjuntos de baterias: um voo e nenhum conjunto na equipa falta', () => {
    expect(singleRouteSheet(corridorArgs({ equipment: withSets(0) })).sets).toEqual({
      flights: 1,
      sets: 0,
      short: true,
    })
    // a bateria escolhida para a missão, não a por omissão
    const m300 = updateBattery(defaultEquipment(), 'M300RTK', 'TB65', { count: 2 })
    const s = singleRouteSheet(corridorArgs({ equipment: m300, aircraftId: 'M300RTK' }))
    expect(s.sets.sets).toBeNull()
    const tb65 = singleRouteSheet(
      corridorArgs({ equipment: m300, aircraftId: 'M300RTK', batteryId: 'TB65' }),
    )
    expect(tb65.sets).toEqual({ flights: 1, sets: 2, short: false })
  })
})

describe('linha do dia: todos os voos contra os conjuntos da equipa', () => {
  const sheets = [{ flights: [{}, {}] }, { flights: [{}] }, { flights: [] }, {}]

  test('soma os voos das fichas e compara com os conjuntos', () => {
    const eq = (n) => ({ equipment: withSets(n), aircraftId: 'M3E' })
    expect(daySummary(sheets, eq(2))).toEqual({ flights: 3, sets: 2, short: true })
    expect(daySummary(sheets, eq(3))).toEqual({ flights: 3, sets: 3, short: false })
    // conjuntos desconhecidos: nunca falta
    expect(daySummary(sheets, { aircraftId: 'M3E' })).toEqual({
      flights: 3,
      sets: null,
      short: false,
    })
    expect(daySummary(sheets)).toEqual({ flights: 3, sets: null, short: false })
  })

  test('a ficha da rota única conta um voo', () => {
    const s = singleRouteSheet(corridorArgs())
    expect(daySummary([s], { equipment: withSets(0), aircraftId: 'M3E' })).toEqual({
      flights: 1,
      sets: 0,
      short: true,
    })
  })

  test('sem voos não há linha', () => {
    for (const s of [[], null, undefined, [{ flights: [] }], [{}]]) expect(daySummary(s)).toBeNull()
  })
})

describe('alturas do KMZ de um voo', () => {
  test('a do 1.º waypoint e a máxima, relativas à descolagem', () => {
    const wps = [
      [-9.14, 38.7, 100],
      [-9.13, 38.7, 131.4],
      [-9.12, 38.7, 118],
    ]
    expect(heightsOfWaypoints(wps)).toEqual({ h1M: 100, hmaxM: 131.4 })
  })

  test('waypoints sem altura (rota 2D) levam a altura do plano', () => {
    const wps = [
      [-9.14, 38.7],
      [-9.13, 38.7, 110],
      [-9.12, 38.7, Number.NaN],
    ]
    expect(heightsOfWaypoints(wps, 90)).toEqual({ h1M: 90, hmaxM: 110 })
    expect(heightsOfWaypoints(wps.slice(0, 1), 90)).toEqual({ h1M: 90, hmaxM: 90 })
    // sem a altura do plano, os que não a têm não contam
    expect(heightsOfWaypoints(wps)).toEqual({ h1M: 110, hmaxM: 110 })
  })

  test('sem alturas nenhumas: null (a ficha mostra «—»)', () => {
    expect(heightsOfWaypoints(null)).toBeNull()
    expect(heightsOfWaypoints(undefined, 100)).toBeNull()
    expect(heightsOfWaypoints([], 100)).toBeNull()
    expect(heightsOfWaypoints([[-9.14, 38.7], null])).toBeNull()
    expect(heightsOfWaypoints([[-9.14, 38.7]], Number.NaN)).toBeNull()
  })
})

describe('fichas por base: casos raros', () => {
  test('só as bases com voos, os voos pela ordem de voo; bloco sem voo atribuído pelo id', () => {
    const { rows, layout, blocks, files } = baseFixture()
    const sheets = baseFieldSheets({ rows, layout, blocks, files, vlosM: 500 })
    expect(sheets.map((s) => s.label)).toEqual(['A', 'C'])
    const [a, c] = sheets
    expect(a.flights.map((f) => [f.flightLabel, f.file, f.totalS])).toEqual([
      ['A-1', 'm_A-1.kmz', 520],
      ['A-2', 'm_A-2.kmz', 640],
    ])
    expect(a.totalS).toBe(1160)
    expect(a.worstVlosM).toBe(600)
    // C: o 3 sem tempo nem trânsito válidos e fora do alcance; o 4 sem nada no layout
    expect(c.flights.map((f) => f.blockId)).toEqual([3, 4])
    expect(c.flights[0]).toMatchObject({
      flightLabel: 'C-3',
      flightS: 0,
      transitS: 0,
      totalS: 0,
      worstVlosM: 1200,
      withinVlos: false,
      file: null,
    })
    expect(c.flights[1]).toMatchObject({
      flightLabel: '4',
      flightS: 0,
      transitS: 0,
      worstVlosM: null,
      withinVlos: true,
      file: null,
    })
    expect(c.worstVlosM).toBe(1200)
    expect(c).toMatchObject({
      reduced: true,
      cause: { reliefM: 14, atM: 70 },
      refElev: null,
      gainM: null,
      requestedRadiusM: 100,
      radiusM: 60,
    })
    // a ordem de voo não depende da ordem da lista da base
    const [c2] = baseFieldSheets({
      rows: [{ ...rows[2], blockIds: [3, 4] }],
      layout,
      blocks,
      vlosM: 500,
    })
    expect(c2.flights.map((f) => f.blockId)).toEqual([3, 4])
    // só o bloco sem voo atribuído: sem pior distância à base
    const [d] = baseFieldSheets({
      rows: [{ ...rows[2], blockIds: [4] }],
      layout,
      blocks,
      vlosM: 500,
    })
    expect(d.worstVlosM).toBeNull()
    // sem a altura de regresso, a descolagem e as alturas: nada inventado
    expect(a).toMatchObject({ rthM: null, takeoffM: null, usefulS: null, params: null })
    expect(a.flights.every((f) => f.rthM === null && f.h1M === null && f.pctUseful === null)).toBe(
      true,
    )
  })

  test('altura de regresso de cada voo e a maior da base; alturas do KMZ e tempo útil', () => {
    const { rows, layout, blocks, files } = baseFixture()
    const [a, c] = baseFieldSheets({
      rows,
      layout,
      blocks,
      files,
      vlosM: 500,
      rthByFlight: [
        { flight: 'A-1', rthM: 80 },
        { flight: 'A-2', rthM: 95 },
        { flight: 'C-3', rthM: Number.NaN },
      ],
      takeoffM: 20,
      heightsOf: (id) => (id === 1 ? { h1M: 100, hmaxM: 140 } : id === 2 ? { h1M: 100 } : null),
      usefulS: 1500,
      params: { altitudeM: 100 },
    })
    expect(a.flights.map((f) => [f.flightLabel, f.rthM, f.h1M, f.hmaxM, f.pctUseful])).toEqual([
      ['A-1', 80, 100, null, 35],
      ['A-2', 95, 100, 140, 43],
    ])
    expect(a).toMatchObject({ rthM: 95, takeoffM: 20, usefulS: 1500, params: { altitudeM: 100 } })
    // a altura de regresso do C-3 não é um número; o 4 não tem entrada
    expect(c.flights.map((f) => f.rthM)).toEqual([null, null])
    expect(c.rthM).toBeNull()
    // um voo sem tempo ocupa 0 % do útil
    expect(c.flights[0].pctUseful).toBe(0)
  })

  test('bacias de visão: só os resumos calculados com relevo; a base espera enquanto falta um voo', () => {
    const { rows, layout, blocks, files } = baseFixture()
    const summary = { status: 'ok', visiblePct: 82, hidden: 3, blockedAtM: 420, radioOnly: 0 }
    const viewsheds = {
      1: { summary },
      2: { summary: { status: 'no-terrain' } },
      // o 3 ainda a calcular; o 4 sem bacia
      3: {},
    }
    const terrain = { kind: 'global', resolutionM: 30 }
    const [a, c] = baseFieldSheets({
      rows,
      layout,
      blocks,
      files,
      vlosM: 500,
      viewsheds,
      viewTerrain: terrain,
    })
    expect(a.flights.map((f) => f.view)).toEqual([null, summary])
    expect(a.viewPending).toBe(false)
    expect(a.viewTerrain).toBe(terrain)
    expect(c.flights.map((f) => f.view)).toEqual([null, null])
    expect(c.viewPending).toBe(true)
    // sem bacias, o relevo delas não se mostra
    const [semBacias] = baseFieldSheets({ rows, layout, blocks, vlosM: 500, viewTerrain: terrain })
    expect(semBacias.viewTerrain).toBeNull()
  })

  test('sem bases, sem blocos ou sem linhas: nenhuma ficha', () => {
    const { rows, layout, blocks } = baseFixture()
    expect(baseFieldSheets({ rows, layout: null, blocks, vlosM: 500 })).toEqual([])
    expect(baseFieldSheets({ rows, layout, blocks: null, vlosM: 500 })).toEqual([])
    expect(baseFieldSheets({ rows, layout, blocks: [], vlosM: 500 })).toEqual([])
    expect(baseFieldSheets({ rows: null, layout, blocks, vlosM: 500 })).toEqual([])
    // linhas sem a lista de blocos (summarizeBases sem layout) ficam de fora
    expect(
      baseFieldSheets({ rows: [{ id: 'x', label: 'X' }], layout, blocks, vlosM: 500 }),
    ).toEqual([])
    // sem a lista de ficheiros, nenhum voo tem ficheiro
    const [a] = baseFieldSheets({ rows, layout, blocks, files: null, vlosM: 500 })
    expect(a.flights.map((f) => f.file)).toEqual([null, null])
  })
})
