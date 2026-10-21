/**
 * Geometria do plano (src/utils/geo.js), casos raros: o tempo de um quadrado
 * do mosaico (a dica «≈ N min» da grelha) é o inverso exacto do lado por
 * bateria, com prolongamento, fiada, paragens, passagens e margem; a
 * direcção óptima das faixas num rectângulo rodado e num polígono sem área;
 * a célula mais estreita do que o espaçamento (a faixa encostada ao bordo,
 * A1); o anel partido; o sensor de um payload próprio; e as guardas: faixas
 * a mais (na área e nas células), uma área onde nenhum troço chega a 1 m,
 * entradas inválidas, a fiada de amarração nos dois sentidos, as células e
 * as grelhas que falham na composição, e os agregados e blocos sem dados.
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { planArea } from '../../src/mission/areaPlan.js'
import {
  aggregatePlans,
  composeCellPlans,
  computeAlignment,
  concatPerWaypoint,
  distanceToArea,
  findOptimalDirection,
  generateFlightLines,
  generateFlightPlan,
  longestEdgeBearing,
  nadirLineLocalPerBlock,
  passPoints,
  resolveSensor,
  splitIntoBlocks,
  squareFlightTimeS,
  squareSideForBattery,
  translateRing,
  triggerRangesForLines,
  validateRing,
} from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const yOf = (lat) => (lat - lat0) * 110574

describe('tempo de um quadrado do mosaico', () => {
  test('propriedade: o quadrado da bateria cabe nela, e 10 m mais já não', () => {
    const opcoes = fc.record({
      speed: fc.integer({ min: 3, max: 15 }),
      spacingM: fc.integer({ min: 10, max: 100 }),
      passes: fc.integer({ min: 1, max: 3 }),
      stopEveryM: fc.constantFrom(0, 20, 45),
      overshootM: fc.constantFrom(0, 15, 40),
      tieLine: fc.boolean(),
      margem: fc.constantFrom({}, { bufferM: 20 }, { bufferPct: 15 }),
    })
    fc.assert(
      fc.property(opcoes, fc.integer({ min: 10, max: 40 }), ({ margem, ...o }, batteryMin) => {
        const opts = { ...o, ...margem }
        const lado = squareSideForBattery({ batteryMin, maxSideM: 1e6, ...opts })
        fc.pre(lado > 50)
        const util = Math.max(60 * o.passes, batteryMin * 60)
        expect(squareFlightTimeS(lado, opts)).toBeLessThanOrEqual(util + 1e-6)
        expect(squareFlightTimeS(lado + 10, opts)).toBeGreaterThan(util)
      }),
    )
  })

  test('cresce com o lado e com cada extra; sem lado, zero; sem velocidade, a 10 m/s', () => {
    const base = { speed: 8, spacingM: 40 }
    const t = (extra, lado = 250) => squareFlightTimeS(lado, { ...base, ...extra })
    expect(t({}, 300)).toBeGreaterThan(t({}))
    for (const extra of [
      { passes: 2 },
      { stopEveryM: 20 },
      { overshootM: 30 },
      { tieLine: true },
      { bufferM: 25 },
      { bufferPct: 10 },
    ])
      expect(t(extra), JSON.stringify(extra)).toBeGreaterThan(t({}))
    expect(t({}, 0)).toBe(0)
    expect(t({}, Number.NaN)).toBe(0)
    expect(squareFlightTimeS(250, { speed: 0, spacingM: 40 })).toBe(
      squareFlightTimeS(250, { speed: 10, spacingM: 40 }),
    )
  })
})

describe('direcção óptima das faixas', () => {
  /** Rectângulo comprido (900 × 200 m) com o lado maior no azimute `az`. */
  const rodado = (az) => {
    const r = (az * Math.PI) / 180
    const ao = [Math.sin(r), Math.cos(r)]
    const at = [Math.cos(r), -Math.sin(r)]
    const p = (s, t) => em(s * ao[0] + t * at[0], s * ao[1] + t * at[1])
    return [p(0, 0), p(900, 0), p(900, 200), p(0, 200)]
  }

  test('num rectângulo comprido, ao longo do lado maior (menos viragens)', () => {
    for (const az of [0, 30, 75, 120, 165]) {
      const d = findOptimalDirection(rodado(az), 40)
      const erro = Math.abs(((d - az + 90) % 180) - 90)
      expect(erro, `azimute ${az}`).toBeLessThanOrEqual(1)
    }
  })

  test('polígono sem área, ou com menos de três vértices: nenhuma', () => {
    expect(findOptimalDirection([em(0, 0), em(0, 0), em(0, 0)], 40)).toBeNull()
    expect(findOptimalDirection([em(0, 0), em(10, 0)], 40)).toBeNull()
    expect(findOptimalDirection(null, 40)).toBeNull()
    // espaçamento inválido: conta 1 m, e a resposta é a mesma
    expect(findOptimalDirection(rodado(30), 0)).toBe(findOptimalDirection(rodado(30), 1))
  })
})

describe('célula mais estreita do que o espaçamento (A1)', () => {
  test('nenhuma faixa global cai nela: fica uma, encostada ao bordo mais perto da régua', () => {
    const ring = [em(0, 0), em(600, 0), em(600, 225), em(0, 225)]
    const cells = [
      [em(0, 0), em(600, 0), em(600, 215), em(0, 215)],
      [em(0, 215), em(600, 215), em(600, 225), em(0, 225)],
    ]
    const plano = planArea(ring, cells, {
      spacingM: 40,
      angleDeg: 90,
      bufferPct: 0,
      photoIntervalM: 20,
      speed: 8,
    })
    expect(plano.error).toBeUndefined()
    const [larga, estreita] = plano.cellPlans
    const ys = (p) => p.lines.map((l) => yOf(l[0][1]))
    // a régua global vai de 13,1 m em 39,8 m: a célula larga leva as seis
    // faixas até 211,9 m, e a seguinte (251,7 m) já passa da área
    expect(ys(larga)).toHaveLength(6)
    expect(ys(larga)[5]).toBeCloseTo(211.94, 1)
    // a estreita (215 a 225 m) não apanha nenhuma: fica com uma, encostada
    // ao bordo de baixo, o mais perto da régua, 10 cm para dentro
    expect(ys(estreita)).toHaveLength(1)
    expect(ys(estreita)[0]).toBeCloseTo(215.1, 2)
  })
})

describe('anéis e sensores', () => {
  test('anel com um vértice nulo: inválido, sem rebentar; menos de três: inválido', () => {
    expect(validateRing([null, em(0, 0), em(100, 0), em(100, 100)])).toEqual({
      valid: false,
      kinks: [],
    })
    expect(validateRing([em(0, 0), em(1, 1)])).toEqual({ valid: false, kinks: [] })
    expect(validateRing(null)).toEqual({ valid: false, kinks: [] })
    // translação de algo que não é anel: devolvido tal qual
    expect(translateRing(null, 1, 1)).toBeNull()
  })

  test('payload próprio: a câmara ou o LiDAR do editor', () => {
    const custom = { ...DEFAULT_CUSTOM_SENSOR, mode: 'camera', focalLength: 24, imageWidth: 6000 }
    expect(resolveSensor(PAYLOADS.CUSTOM, custom)).toEqual({
      type: 'camera',
      sensorWidth: custom.sensorWidth,
      sensorHeight: custom.sensorHeight,
      focalLength: 24,
      imageWidth: 6000,
    })
    expect(resolveSensor(PAYLOADS.CUSTOM, { ...custom, mode: 'lidar', fov: 70 })).toEqual({
      type: 'lidar',
      fov: 70,
    })
  })
})

describe('guardas e casos de bordo', () => {
  const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]
  const opts = { spacingM: 20, angleDeg: 90, bufferPct: 0, photoIntervalM: 10, speed: 8 }

  test('faixas a mais com um espaçamento minúsculo: recusado com o número, na área e nas células', () => {
    const area = rect(0, 0, 2000, 2000)
    const unica = generateFlightLines(area, { ...opts, spacingM: 0.5 })
    expect(unica.error).toBe('too-many-lines')
    expect(unica.nLines).toBeGreaterThan(2500)
    const celulas = planArea(area, [rect(0, 0, 2000, 1000), rect(0, 1000, 2000, 1000)], {
      ...opts,
      spacingM: 0.3,
    })
    expect(celulas.error).toBe('too-many-lines')
    expect(celulas.nLines).toBeGreaterThan(2500)
  })

  test('entradas inválidas: sem plano, sem alinhamento, sem distância; nenhum troço com 1 m: sem plano', () => {
    expect(generateFlightLines(null, opts)).toBeNull()
    expect(generateFlightLines(rect(0, 0, 100, 100), { ...opts, spacingM: 0.05 })).toBeNull()
    expect(generateFlightLines(rect(0, 0, 0.5, 0.5), opts)).toBeNull()
    expect(computeAlignment(null, 20, 90)).toBeNull()
    expect(computeAlignment(rect(0, 0, 100, 100), 0, 90)).toBeNull()
    // uma «área» achatada numa linha horizontal não tem altura para a régua
    expect(computeAlignment([em(0, 0), em(50, 0), em(100, 0)], 20, 90)).toBeNull()
    expect(distanceToArea(null, rect(0, 0, 100, 100))).toBeNull()
    expect(distanceToArea(em(50, 50), rect(0, 0, 100, 100))).toBe(0)
    expect(distanceToArea(em(50, 130), rect(0, 0, 100, 100))).toBeCloseTo(30, 0)
    expect(longestEdgeBearing([em(0, 0), em(1, 1)])).toBeNull()
    // sem intervalo, só os extremos
    expect(passPoints(em(0, 0), em(100, 0), 0)).toEqual([em(0, 0), em(100, 0)])
  })

  test('mover a área: cada vértice desloca-se o mesmo', () => {
    const r = rect(0, 0, 100, 50)
    const movido = translateRing(r, 0.001, -0.002)
    movido.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(r[i][0] + 0.001, 12)
      expect(p[1]).toBeCloseTo(r[i][1] - 0.002, 12)
    })
  })

  test('fiada de amarração: começa no lado onde acabou a última faixa, e só na parte cheia', () => {
    // num rectângulo a serpentina acaba em cima: a fiada desce
    const r = generateFlightLines(rect(0, 0, 300, 100), { ...opts, tieLine: true })
    const fiada = r.lines.at(-1)
    expect(yOf(fiada[0][1])).toBeCloseTo(100, 0)
    expect(yOf(fiada.at(-1)[1])).toBeCloseTo(0, 0)
    // num arco (∩), a rota acaba em baixo, na perna da direita: a fiada sobe,
    // e no meio do arco só existe da trave para cima (120 a 200 m)
    const arco = [
      em(0, 0),
      em(100, 0),
      em(100, 120),
      em(200, 120),
      em(200, 0),
      em(300, 0),
      em(300, 200),
      em(0, 200),
    ]
    const a = generateFlightLines(arco, { ...opts, tieLine: true })
    expect(yOf(a.lines.at(-2).at(-1)[1])).toBeLessThan(5)
    const fiadaArco = a.lines.at(-1)
    expect(yOf(fiadaArco[0][1])).toBeCloseTo(120, 0)
    expect(yOf(fiadaArco.at(-1)[1])).toBeCloseTo(200, 0)
  })

  test('composição das células: o erro de uma passa, a que não tem plano é dita, sem células nada', () => {
    const plano = generateFlightLines(rect(0, 0, 200, 100), opts)
    expect(composeCellPlans(rect(0, 0, 200, 100), [plano, { error: 'x' }])).toEqual({ error: 'x' })
    expect(composeCellPlans(rect(0, 0, 200, 200), [plano, null, plano, null])).toEqual({
      error: 'cell-uncovered',
      cells: [2, 4],
    })
    expect(composeCellPlans(rect(0, 0, 200, 100), [])).toBeNull()
    // sem intervalo de disparo não há contagem de fotos; a da área só com prolongamento
    const sem = composeCellPlans(rect(0, 0, 200, 100), [plano], { photoIntervalM: 0 })
    expect(sem.stats.photoCount).toBeNull()
    expect(sem.stats.photoCountArea).toBeNull()
    const com = composeCellPlans(rect(0, 0, 200, 100), [plano], {
      photoIntervalM: 10,
      overshootM: 5,
    })
    expect(com.stats.photoCountArea).toBe(plano.stats.photoCountArea ?? 0)
  })

  test('dupla grelha: a segunda ou a nadir que falham são ditas, nunca uma grelha só', () => {
    const p = generateFlightLines(rect(0, 0, 200, 100), opts)
    const com = (respostas) => {
      let i = 0
      return () => respostas[i++]
    }
    const o = { ...opts, crosshatch: true }
    expect(generateFlightPlan(null, o, com([p, null]))).toEqual({ error: 'crosshatch-failed' })
    expect(generateFlightPlan(null, o, com([p, { error: 'y' }]))).toEqual({ error: 'y' })
    const n = { ...o, includeNadir: true }
    expect(generateFlightPlan(null, n, com([p, p, null]))).toEqual({ error: 'nadir-failed' })
    expect(generateFlightPlan(null, n, com([p, p, { error: 'z' }]))).toEqual({ error: 'z' })
    // sem velocidade, as ligações a 10 m/s; uma parte sem tempo deixa o total por saber
    const semTempo = { ...p, stats: { ...p.stats, flightTimeS: null, photoCount: null } }
    const r = generateFlightPlan(null, { ...o, speed: 0 }, com([semTempo, semTempo]))
    expect(r.stats.flightTimeS).toBeNull()
    expect(r.stats.photoCount).toBeNull()
  })

  test('intervalos de disparo, nadir por bloco e acções por waypoint sem dados', () => {
    expect(triggerRangesForLines(null, null, null)).toEqual([])
    // uma linha de um só ponto ou sem waypoints fica de fora: o intervalo é só o da primeira
    const l = [em(0, 0), em(100, 0)]
    expect(triggerRangesForLines([l, [em(0, 0)], l], [2, 1, 0], null)).toEqual([[0, 1]])
    expect(nadirLineLocalPerBlock([3, 4], null)).toEqual([null, null])
    // uma parte com acções e outra sem: a sem conta 2 waypoints por linha
    const comAccoes = { lines: [l], waypoints: [l[0], l[1]], perLine: [2], perWaypoint: [{ a: 1 }] }
    const semAccoes = { lines: [l, l], waypoints: [l[0], l[1], l[0], l[1]] }
    const { perLine, perWaypoint } = concatPerWaypoint([semAccoes, comAccoes])
    expect(perLine).toEqual([2, 2, 2])
    // a acção da segunda parte desloca-se pelos 4 waypoints da primeira
    expect(perWaypoint).toHaveLength(5)
    expect(perWaypoint[4]).toEqual({ a: 1 })
    expect(perWaypoint.slice(0, 4).every((e) => e === undefined)).toBe(true)
  })

  test('agregado sem planos, sem bateria ou com blocos sem tempos', () => {
    expect(aggregatePlans(null, { batteryMin: 30 })).toBeNull()
    expect(aggregatePlans([null, { flightTimeS: Number.NaN }], { batteryMin: 30 })).toBeNull()
    expect(aggregatePlans([{ flightTimeS: 600 }], {})).toEqual({
      plans: 1,
      flightTimeS: 600,
      photoCount: 0,
      batteries: null,
    })
    // blocos sem tempo próprio ou de trânsito contam uma bateria cada
    const blocos = { flightTimeS: 900, blocks: [{ timeS: null }, { timeS: 300, transitS: null }] }
    expect(aggregatePlans([blocos], { batteryMin: 10 }).batteries).toBe(2)
  })

  test('divisão em blocos: sem plano ou sem modo nada; sem velocidade, a 10 m/s; sem base, sem trânsito', () => {
    const plano = generateFlightLines(rect(0, 0, 400, 200), opts)
    const o = { mode: 'battery', batteryMin: 2, spacingM: 20 }
    expect(splitIntoBlocks(null, o)).toBeNull()
    expect(splitIntoBlocks({ lines: [] }, o)).toBeNull()
    expect(splitIntoBlocks(plano, { ...o, mode: 'none' })).toBeNull()
    const sem = splitIntoBlocks(plano, { ...o, speed: 0 })
    const a10 = splitIntoBlocks(plano, { ...o, speed: 10 })
    expect(sem.map((b) => b.timeS)).toEqual(a10.map((b) => b.timeS))
    for (const b of sem) expect(b.transitS).toBe(0)
    // paragens em todos os waypoints, num plano sem densificação: nenhuma a mais
    const todas = splitIntoBlocks(plano, { ...o, speed: 10, waypointStops: 'all' })
    expect(todas.map((b) => b.lines.length)).toEqual(a10.map((b) => b.lines.length))
  })
})
