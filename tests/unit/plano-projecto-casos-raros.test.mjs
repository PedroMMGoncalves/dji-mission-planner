/**
 * O plano a partir do projecto (src/mission/planFromProject.js), nas
 * combinações que as missões de referência não têm: hardware fora do
 * catálogo, projecto sem drone nem divisão, LiDAR com o corte de trabalho do
 * FOV e LiDAR manual sem PRR, espaçamento à mão, bateria por combinação,
 * dupla grelha sem nadir, grelha de células da âncora, mosaico com margem e
 * orientação fixa, células desligadas vindas de JSON. E o intervalo de
 * disparo escrito à mão que não é um número (src/mission/triggerInterval.js).
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_SELECTION, PAYLOADS } from '../../src/data/drones.js'
import { DEFAULT_SPLIT } from '../../src/mission/defaults.js'
import { planMissionFromProject } from '../../src/mission/planFromProject.js'
import { normalizeProject } from '../../src/mission/project.js'
import { triggerInterval } from '../../src/mission/triggerInterval.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const ring = [em(0, 0), em(600, 0), em(600, 400), em(0, 400)]
const projecto = (extra = {}) =>
  normalizeProject({
    version: 2,
    ring,
    drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' },
    params: { altitude: 100, speed: 10, frontOverlap: 80, sideOverlap: 70, angle: 90 },
    ...extra,
  })

describe('hardware e valores em falta', () => {
  test('aeronave ou payload fora do catálogo: erro com os dois nomes', () => {
    expect(() =>
      planMissionFromProject({ ring, drone: { aircraftId: 'M600', payloadId: 'M3E_WIDE' } }),
    ).toThrow('hardware desconhecido: M600/M3E_WIDE')
    expect(() =>
      planMissionFromProject({ ring, drone: { aircraftId: 'M3E', payloadId: 'X5S' } }),
    ).toThrow('hardware desconhecido: M3E/X5S')
  })

  test('sem drone nem divisão: a selecção e a divisão por omissão, uma só rota', () => {
    const p = planMissionFromProject({ ring })
    expect(p.drone).toEqual(DEFAULT_SELECTION)
    expect(p.split).toEqual(DEFAULT_SPLIT)
    expect(p.holes).toEqual([])
    expect(p.planError).toBeNull()
    expect(p.blocks).toBeNull()
    expect(p.basePoint).toBeNull()
    // reserva que não é número conta 0
    const r = planMissionFromProject({ ring, split: { reservePct: 'x' } })
    expect(r.reservePct).toBe(0)
  })

  test('bateria: o tempo útil do projecto; sem ele, a duração escrita para a combinação', () => {
    const n = projecto()
    const util = planMissionFromProject({ ...n, battery: { usefulMin: 22 } })
    expect(util.batteryMin).toBe(22)
    const combo = planMissionFromProject({
      ...n,
      battery: null,
      batteryByCombo: { 'M3E:M3E_WIDE': 31 },
    })
    expect(combo.batteryMin).toBe(31)
    expect(combo.usableS).toBe(31 * 60)
  })
})

describe('sensores sem câmara', () => {
  const lidar = (extra = {}) =>
    projecto({
      drone: { aircraftId: 'M300RTK', payloadId: 'MAPPER_PLUS' },
      params: { altitude: 80, speed: 5, sideOverlap: 50, angle: 90 },
      ...extra,
    })

  test('LiDAR com o corte de trabalho do FOV: faixa mais estreita, mais faixas, mais pontos', () => {
    const nominal = planMissionFromProject(lidar())
    const cortado = planMissionFromProject({
      ...lidar(),
      payloadTuning: { MAPPER_PLUS: { effectiveFov: 50 } },
    })
    expect(nominal.sensor.fov).toBe(PAYLOADS.MAPPER_PLUS.fov)
    expect(cortado.sensor.fov).toBe(50)
    // faixa = 2 × altura × tan(FOV/2); espaçamento a 50 % de sobreposição
    expect(cortado.footprint.across).toBeCloseTo(2 * 80 * Math.tan((25 * Math.PI) / 180), 6)
    expect(cortado.spacingM).toBeCloseTo(cortado.footprint.across / 2, 6)
    expect(cortado.plan.stats.lineCount).toBeGreaterThan(nominal.plan.stats.lineCount)
    expect(cortado.densityPerM2).toBeGreaterThan(nominal.densityPerM2)
    expect(cortado.intervalM).toBeNull()
    expect(cortado.photoMode).toBe('distance')
  })

  test('o corte do FOV só vale para o LiDAR: numa câmara não muda nada', () => {
    const n = projecto()
    const a = planMissionFromProject(n)
    const b = planMissionFromProject({ ...n, payloadTuning: { M3E_WIDE: { effectiveFov: 30 } } })
    expect(b.sensor).toEqual(a.sensor)
    expect(b.spacingM).toBe(a.spacingM)
  })

  test('LiDAR manual (payload próprio): sem PRR, sem densidade; sem fotos', () => {
    const p = planMissionFromProject(
      projecto({
        drone: { aircraftId: 'CUSTOM', payloadId: 'CUSTOM' },
        custom: { mode: 'lidar', fov: 60 },
        params: { altitude: 60, speed: 6, sideOverlap: 30, angle: 0, triggerMode: 'waypoint' },
      }),
    )
    expect(p.sensor).toEqual({ type: 'lidar', fov: 60 })
    expect(p.planError).toBeNull()
    expect(p.densityPerM2).toBeNull()
    expect(p.densityOverlapPerM2).toBeNull()
    // sem câmara não há foto por waypoint
    expect(p.photoMode).toBe('distance')
    expect(p.plan.stats.photoCount ?? 0).toBe(0)
  })
})

describe('geometria e divisão', () => {
  test('espaçamento à mão: o escrito, nunca abaixo de 1 m', () => {
    const n = projecto()
    const p = planMissionFromProject({
      ...n,
      params: { ...n.params, spacingMode: 'manual', manualSpacing: 80 },
    })
    expect(p.spacingM).toBe(80)
    // faixas este-oeste (90°) afastadas de 80 m em latitude
    const [l0, l1] = p.plan.lines
    expect(Math.abs(l1[0][1] - l0[0][1]) * 110574).toBeCloseTo(80, 0)
    const zero = planMissionFromProject({
      ...n,
      params: { ...n.params, spacingMode: 'manual', manualSpacing: 0 },
    })
    expect(zero.spacingM).toBe(1)
  })

  test('dupla grelha sem nadir: duas passagens, e o GSD com a inclinação pedida', () => {
    const n = projecto()
    const simples = planMissionFromProject(n)
    const dupla = planMissionFromProject({
      ...n,
      params: { ...n.params, crosshatch: true, includeNadir: false, gimbalPitch: -60 },
    })
    expect(dupla.plan.nadirStartLine ?? null).toBeNull()
    expect(dupla.plan.stats.lineCount).toBeGreaterThan(simples.plan.stats.lineCount)
    // oblíqua a -60°: o GSD ao centro é maior do que o nadir
    expect(dupla.gsdCm).toBeGreaterThan(simples.gsdCm)
    const comNadir = planMissionFromProject({
      ...n,
      params: { ...n.params, crosshatch: true, includeNadir: true, gimbalPitch: -60 },
    })
    expect(comNadir.gsdCm).toBeCloseTo(simples.gsdCm, 9)
  })

  test('grelha de células da âncora: um bloco por célula, sem mosaico', () => {
    const cells = [
      [em(0, 0), em(300, 0), em(300, 400), em(0, 400)],
      [em(300, 0), em(600, 0), em(600, 400), em(300, 400)],
    ]
    const p = planMissionFromProject({ ...projecto(), cells, split: { mode: 'tiles' } })
    expect(p.mosaic).toBeNull()
    expect(p.activeCells).toBe(cells)
    expect(p.blocks.map((b) => b.id)).toEqual([1, 2])
    expect(p.longestS).toBe(Math.max(...p.blocks.map((b) => b.timeS)))
  })

  test('mosaico por bateria com margem: o lado conta a margem e cada bloco cabe', () => {
    const n = projecto({ battery: { usefulMin: 12 } })
    const semMargem = planMissionFromProject({ ...n, split: { mode: 'battery' } })
    const comMargem = planMissionFromProject({
      ...n,
      params: { ...n.params, bufferPct: 20 },
      split: { mode: 'battery' },
    })
    expect(comMargem.tileSide).toBeLessThan(semMargem.tileSide)
    for (const b of comMargem.blocks) expect(b.timeS).toBeLessThanOrEqual(comMargem.usableS)
  })

  test('mosaico com orientação fixa: as arestas no azimute pedido, não nas faixas', () => {
    const n = projecto()
    const auto = planMissionFromProject({ ...n, split: { mode: 'tiles', tileSize: 200 } })
    const fixa = planMissionFromProject({
      ...n,
      split: { mode: 'tiles', tileSize: 200, tileOrientationAuto: false, tileOrientation: 30 },
    })
    expect(auto.mosaic.orientationDeg).toBe(90)
    expect(fixa.mosaic.orientationDeg).toBe(30)
    // as arestas do quadrado de cada célula fazem 30° (ou 30 + k·90°) com o norte
    const azimute = ([a, b]) =>
      (Math.atan2((b[0] - a[0]) * mLon, (b[1] - a[1]) * 110574) * 180) / Math.PI
    for (const c of fixa.mosaic.cells) {
      const resto = (((azimute(c.square) - 30) % 90) + 90) % 90
      expect(Math.min(resto, 90 - resto)).toBeLessThan(0.5)
    }
  })

  test('células desligadas vindas de JSON (lista, não Set): as mesmas que com um Set', () => {
    const n = projecto({ split: { mode: 'tiles', tileSize: 200 } })
    const set = planMissionFromProject({ ...n, disabledTiles: new Set([0, 2]) })
    const lista = planMissionFromProject({ ...n, disabledTiles: [0, 2] })
    expect(lista.blocks.map((b) => b.id)).toEqual(set.blocks.map((b) => b.id))
    expect(lista.blocks.map((b) => b.id)).not.toContain(1)
    expect(lista.blocks.map((b) => b.id)).not.toContain(3)
  })

  test('buracos que não são lista contam como nenhum', () => {
    const p = planMissionFromProject({ ...projecto(), holes: 'nenhum' })
    expect(p.holes).toEqual([])
    expect(p.planError).toBeNull()
  })
})

describe('intervalo escrito à mão que não é um número', () => {
  const base = { footprintAlong: 107, frontOverlapPct: 80, speed: 10, intervalMode: 'manual' }

  test('em metros: sem intervalo (o plano não inventa um)', () => {
    const r = triggerInterval({ ...base, triggerMode: 'distance', manualIntervalM: 'vinte' })
    expect(r).toMatchObject({ intervalM: null, seconds: null, frontOverlapPct: null, manual: true })
    expect(r.autoIntervalM).toBeCloseTo(21.4, 6)
  })

  test('em segundos: sem segundos nem metros; sem velocidade, os segundos ficam', () => {
    const r = triggerInterval({ ...base, triggerMode: 'time', manualIntervalS: undefined })
    expect(r).toMatchObject({ intervalM: null, seconds: null })
    const parado = triggerInterval({ ...base, triggerMode: 'time', manualIntervalS: 3, speed: 0 })
    expect(parado).toMatchObject({ intervalM: null, seconds: 3 })
  })
})
