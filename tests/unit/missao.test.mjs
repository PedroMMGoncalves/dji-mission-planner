/**
 * Lógica de missão que vivia no App.jsx e só o browser conseguia apanhar:
 * reagrupamento dos waypoints do terrain follow por bloco e montagem da
 * exportação de área (variantes no nome, intervalos de disparo, marcador do
 * gimbal da grelha nadir, blocos).
 */
import { describe, expect, test } from 'vitest'
import { planTerrainFollow, regroupTerrainBlocks } from '../../src/mission/terrainFollow.js'
import { buildAreaExport, nadirMarkerIndex, withNadirPitch } from '../../src/mission/areaExport.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const wpml = { droneEnumValue: 77, payloadEnumValue: 66, payloadPositionIndex: 0 }

describe('regroupTerrainBlocks', () => {
  // 4 linhas; a linha 1 tem 1 ponto de ligação, a linha 2 tem 2
  const res = {
    waypoints: Array.from({ length: 11 }, (_, i) => [i, i, i]),
    perLine: [2, 3, 4, 2],
    perLink: [0, 1, 2, 0],
  }
  const linha = (i) => [[i, 0], [i, 1]]

  test('a ligação que antecede a primeira linha de um bloco é retirada; as outras ficam', () => {
    const [b0, b1] = regroupTerrainBlocks(res, [
      { id: 1, lines: [linha(0), linha(1)], nadirLineLocal: null },
      { id: 2, lines: [linha(2), linha(3)], nadirLineLocal: null },
    ])
    expect(b0.waypoints.map((w) => w[0])).toEqual([0, 1, 2, 3, 4]) // ligação da linha 1 mantida (é voada)
    expect(b0.perLine).toEqual([2, 3])
    expect(b0.perLink).toEqual([0, 1])
    expect(b1.waypoints.map((w) => w[0])).toEqual([7, 8, 9, 10]) // 5 e 6 eram a ligação para a linha 2
    expect(b1.perLine).toEqual([2, 2])
    expect(b1.perLink).toEqual([0, 0])
    expect(b1.nadirMarkerAt).toBeNull()
  })

  test('o marcador nadir cai no primeiro waypoint da grelha, depois da ligação', () => {
    const [b] = regroupTerrainBlocks(res, [{ id: 1, lines: [linha(0), linha(1), linha(2)], nadirLineLocal: 2 }])
    // linhas 0 e 1: 2 + 3 waypoints; a linha 2 começa com 2 pontos de ligação
    expect(b.nadirMarkerAt).toBe(2 + 3 + 2)
    expect(b.waypoints[b.nadirMarkerAt][0]).toBe(7)
    // os blocos percorrem as linhas do plano pela ordem: o segundo bloco começa na linha 2
    const [, c] = regroupTerrainBlocks(res, [
      { id: 1, lines: [linha(0), linha(1)], nadirLineLocal: null },
      { id: 2, lines: [linha(2)], nadirLineLocal: 0 },
    ])
    expect(c.nadirMarkerAt).toBe(0) // bloco inteiramente nadir: a ligação já saiu
    expect(c.waypoints[0][0]).toBe(7)
  })
})

describe('planTerrainFollow', () => {
  const plano = { elevationAt: () => 250 }
  const plan = { lines: [[em(0, 0), em(300, 0)], [em(300, 60), em(0, 60)]] }

  test('alturas relativas à cota do ponto de referência; blocos reagrupados', () => {
    const r = planTerrainFollow(plano, plan, { refPt: em(0, 0), agl: 80, blocks: [{ id: 1, lines: plan.lines }] })
    expect(r.refElev).toBe(250)
    expect(r.waypoints.every((w) => w[2] === 80)).toBe(true)
    expect(r.blocks3).toHaveLength(1)
    expect(r.blocks3[0].waypoints).toHaveLength(r.waypoints.length)
  })

  test('referência fora do terreno é um erro, não um plano', () => {
    const buraco = { elevationAt: (lon) => (lon < -9.1395 ? null : 250) }
    expect(planTerrainFollow(buraco, plan, { refPt: em(0, 0), agl: 80 }).error).toBe('ref-outside-terrain')
  })
})

describe('buildAreaExport', () => {
  // três linhas: as duas primeiras adjacentes (40 m), a terceira a 900 m
  const lines = [[em(0, 0), em(500, 0)], [em(500, 40), em(0, 40)], [em(0, 940), em(500, 940)]]
  const plan = { lines, waypoints: lines.flat(), nadirStartLine: 2, nadirStartWaypoint: 4 }
  const base = {
    missionName: 'quinta', plan, spacingM: 40, sensorType: 'camera', altitude: 100, speed: 8, wpml,
    photoIntervalM: 20, triggerMode: 'distance', gimbalPitch: -60, crosshatch: true, includeNadir: true,
  }

  test('rota única: nome com variantes, intervalos de disparo, gimbal −90 no arranque da grelha nadir', () => {
    const { params, blocks } = buildAreaExport(base)
    expect(blocks).toBeNull()
    expect(params.name).toBe('quinta_area-crosshatch-nadir')
    expect(params.waypoints).toBe(plan.waypoints)
    expect(params.photoIntervalM).toBe(20)
    expect(params.triggerRanges).toEqual([[0, 3], [4, 5]]) // a ligação de 900 m quebra o intervalo
    expect(params.perWaypoint[4]).toEqual({ gimbalPitch: -90 })
  })

  test('com terrain follow: waypoints densificados, "tf" no nome, marcador depois da ligação', () => {
    const terrainResult = {
      waypoints: Array.from({ length: 12 }, (_, i) => [...em(i * 10, 0), 100]),
      perLine: [3, 4, 5],
      perLink: [0, 1, 2],
      blocks3: null,
    }
    const { params } = buildAreaExport({ ...base, terrainResult })
    expect(params.name).toBe('quinta_area-crosshatch-nadir-tf')
    expect(params.waypoints).toBe(terrainResult.waypoints)
    expect(params.perWaypoint[3 + 4 + 2]).toEqual({ gimbalPitch: -90 })
  })

  test('vários blocos: um perWaypoint local por bloco, intervalos locais', () => {
    const blocks = [
      { id: 1, lines: [lines[0], lines[1]], waypoints: lines.slice(0, 2).flat(), nadirLineLocal: null },
      { id: 2, lines: [lines[2]], waypoints: lines[2], nadirLineLocal: 0 },
    ]
    const { params, blocks: out } = buildAreaExport({ ...base, blocks })
    expect(out).toHaveLength(2)
    expect(out[0].perWaypoint).toBeUndefined()
    expect(out[1].perWaypoint[0]).toEqual({ gimbalPitch: -90 })
    expect(out[0].triggerRanges).toEqual([[0, 3]])
    expect(out[1].triggerRanges).toEqual([[0, 1]])
    expect(params.perWaypoint).toBeUndefined() // o marcador vai nos blocos, não no global
  })

  test('foto por waypoint: sem gatilho por distância, acções do plano preservadas e fundidas com o nadir', () => {
    const perWaypoint = plan.waypoints.map(() => ({ actions: ['takePhoto'] }))
    const { params } = buildAreaExport({ ...base, photoMode: 'waypoint', plan: { ...plan, perWaypoint } })
    expect(params.photoIntervalM).toBe(0)
    expect(params.perWaypoint[4]).toEqual({ actions: ['takePhoto'], gimbalPitch: -90 })
    expect(params.perWaypoint[0]).toEqual({ actions: ['takePhoto'] })
  })

  test('LiDAR não leva gatilho de foto', () => {
    const { params } = buildAreaExport({ ...base, sensorType: 'lidar', includeNadir: false, crosshatch: false, plan: { lines, waypoints: lines.flat() } })
    expect(params.photoIntervalM).toBe(0)
    expect(params.name).toBe('quinta_area')
    expect(params.perWaypoint).toBeUndefined()
  })
})

describe('auxiliares', () => {
  test('withNadirPitch funde sem perder o que lá estava', () => {
    expect(withNadirPitch(null, 2)).toEqual([undefined, undefined, { gimbalPitch: -90 }])
    expect(withNadirPitch([{ heading: 90 }], 0)).toEqual([{ heading: 90, gimbalPitch: -90 }])
  })
  test('nadirMarkerIndex: 2 por linha sem densificação, perLine quando há, marcador do bloco com terrain follow', () => {
    expect(nadirMarkerIndex({ nadirLineLocal: 3 }, false)).toBe(6)
    expect(nadirMarkerIndex({ nadirLineLocal: 2, perLine: [5, 7, 9] }, false)).toBe(12)
    expect(nadirMarkerIndex({ nadirLineLocal: null }, false)).toBeNull()
    expect(nadirMarkerIndex({ nadirMarkerAt: 11 }, true)).toBe(11)
  })
})
