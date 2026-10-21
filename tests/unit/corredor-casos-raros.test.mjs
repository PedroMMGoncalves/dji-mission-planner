/**
 * Corredor, casos raros (src/utils/corridor.js): cada recusa do gerador com
 * o seu código e a mensagem nas duas línguas — altura, meia-largura, sem
 * sensor, pegada nula, sobreposição a mais, latitude fora do globo, eixo de
 * um só ponto, passagens a mais (contadas antes de se alocarem), eixo
 * comprido de mais ou só a passagem de fora comprida de mais, e nenhuma
 * cobertura —; as passagens perdidas e partidas numa curva apertada; a
 * junta da curva a passar pelo norte e numa inversão; a configuração
 * guardada com lixo; e a geometria nas pontas: pontos repetidos, polilinhas
 * vazias e a trava da amostragem.
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { translate } from '../../src/i18n.jsx'
import {
  DEFAULT_CORRIDOR_CONFIG,
  corridorBufferRing,
  dedupePolyline,
  extendRunEnds,
  generateCorridorPlan,
  normalizeCorridorConfig,
  offsetPolylineMiter,
  offsetRuns,
  passOffsets,
  pointPolylineDistance,
  polylineLength,
  resamplePolyline,
  sampleByArcLength,
  simplifyPolyline,
} from '../../src/utils/corridor.js'
import { computeFootprint, resolveSensor } from '../../src/utils/geo.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const toLL = ([x, y]) => [-9.14 + x / mLon, lat0 + y / 110574]
const toM = ([lon, lat]) => [(lon + 9.14) * mLon, (lat - lat0) * 110574]
const base = { sensor, altitude: 100, bufferM: 60, sideOverlapPct: 70, photoIntervalM: 20 }
const recta = (m) => [toLL([0, 0]), toLL([m, 0])]
/** A 15 m com 90 %: espaçamento de 2,1 m e amostragem a 0,53 m (trava a ~10,6 km). */
const fino = { ...base, altitude: 15, bufferM: 100, sideOverlapPct: 90, photoIntervalM: 2 }
const arco = (cx, cy, r, de, ate, n) =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = de + ((ate - de) * k) / n
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

// [o que vem mal, eixo, opções, código]
const RECUSAS = [
  ['altura nula', recta(500), { altitude: 0 }, 'invalid-altitude'],
  ['meia-largura nula', recta(500), { bufferM: 0 }, 'invalid-buffer'],
  ['sem sensor', recta(500), { sensor: null }, 'sensor-required'],
  [
    'câmara de pegada nula',
    recta(500),
    { sensor: { ...sensor, sensorWidth: 0 } },
    'invalid-footprint',
  ],
  ['sobreposição lateral de 99,9 %', recta(500), { sideOverlapPct: 99.9 }, 'overlap-too-high'],
  [
    'latitude fora do globo',
    [
      [0, 91],
      [0.001, 91],
    ],
    {},
    'invalid-latitude',
  ],
  ['dois cliques no mesmo sítio', [toLL([0, 0]), toLL([0, 0])], {}, 'degenerate-centreline'],
  ['meia-largura de 5 km', recta(500), { bufferM: 5000 }, 'too-many-passes'],
  ['meia-largura absurda, que nem se aloca', recta(500), { bufferM: 1e9 }, 'too-many-passes'],
  ['eixo de 15 km a 15 m com 90 %', recta(15000), fino, 'corridor-too-long'],
  [
    'eixo de 4 m: nenhuma passagem chega aos 5 m',
    recta(4),
    { ...fino, bufferM: 11 },
    'no-coverage',
  ],
]

describe('recusas do gerador', () => {
  test.each(RECUSAS)('%s', (_, eixo, opcoes, code) => {
    expect(generateCorridorPlan(eixo, { ...base, ...opcoes })).toEqual({ error: code })
  })

  test('sem eixo de dois pontos não há plano nem erro', () => {
    for (const eixo of [null, [], [toLL([0, 0])]])
      expect(generateCorridorPlan(eixo, base)).toBeNull()
    expect(generateCorridorPlan(recta(500), undefined)).toEqual({ error: 'invalid-altitude' })
  })

  test('círculo de 10,2 km: o eixo cabe na amostragem, a passagem de fora não', () => {
    const n = 64
    const r = 10200 / (2 * n * Math.sin(Math.PI / n))
    const eixo = arco(0, 0, r, 0, 2 * Math.PI, n)
    expect(polylineLength(eixo)).toBeCloseTo(10200, 6)
    const step = (computeFootprint(sensor, 15).across * 0.1) / 4
    expect(resamplePolyline(eixo, step).truncated).toBeUndefined()
    expect(generateCorridorPlan(eixo.map(toLL), fino)).toEqual({ error: 'corridor-too-long' })
  })

  test('cada recusa tem mensagem nas duas línguas', () => {
    for (const [, , , code] of RECUSAS)
      for (const lang of ['pt', 'en'])
        expect(translate(lang, `co.err.${code}`), `${lang}: ${code}`).not.toBe(`co.err.${code}`)
  })
})

describe('curvas apertadas', () => {
  test('semicírculo de 60 m com 120 m de meia-largura: a passagem de dentro que não cabe é perdida, e dita', () => {
    const plan = generateCorridorPlan(arco(0, 60, 60, -Math.PI / 2, Math.PI / 2, 36).map(toLL), {
      ...base,
      bufferM: 120,
    })
    const { stats } = plan
    expect(stats.passCount).toBe(4)
    // a curva é para a esquerda: o lado de dentro são os desvios positivos
    expect(stats.droppedPasses).toBe(1)
    expect(stats.droppedOffsets).toHaveLength(1)
    expect(stats.droppedOffsets[0]).toBeGreaterThan(60)
    expect(stats.runCount).toBe(3)
    expect(stats.splitPasses).toBe(0)
    // a largura dita é a pedida: quem lê tem de olhar também para as perdidas
    expect(stats.coveredWidthM).toBe(240)
  })

  test('V de ponta redonda: as passagens de dentro partem-se nas duas pernas', () => {
    const th = Math.atan2(150, 300)
    const eixo = [
      [-300, 150],
      ...arco(0, 0, 30, Math.PI / 2 - th, (3 * Math.PI) / 2 + th, 24),
      [-300, -150],
    ]
    const { stats, lines } = generateCorridorPlan(eixo.map(toLL), { ...base, bufferM: 120 })
    expect(stats.droppedPasses).toBe(0)
    expect(stats.splitPasses).toBeGreaterThan(0)
    expect(stats.runCount).toBeGreaterThan(stats.passCount)
    // e nenhum ponto sai da faixa pedida mais meia pegada (71 m), nem com as pontas prolongadas
    for (const l of lines)
      for (const p of l.map(toM))
        expect(pointPolylineDistance(p, eixo)).toBeLessThanOrEqual(120 + 71)
  })
})

describe('junta da curva', () => {
  test('a passar pelo norte (as normais trocam de sinal): o arco tem o ângulo da curva, não a volta inteira', () => {
    // para norte, a virar 19,6° para a direita: o lado de fora é a esquerda
    const v = [-17, 98]
    const out = offsetPolylineMiter([[0, 0], v, [0, 196]], 10)
    const meio = out.slice(1, -1)
    for (const p of meio) expect(Math.hypot(p[0] - v[0], p[1] - v[1])).toBeCloseTo(10, 9)
    const ang = (p) => Math.atan2(p[1] - v[1], p[0] - v[0])
    let varrido = Math.abs(ang(meio.at(-1)) - ang(meio[0]))
    if (varrido > Math.PI) varrido = 2 * Math.PI - varrido
    expect((varrido * 180) / Math.PI).toBeCloseTo(2 * ((Math.atan2(17, 98) * 180) / Math.PI), 6)
    expect(meio).toHaveLength(5)
  })

  test('inversão exacta: do lado de fora meia volta em arco; do outro, um bisel', () => {
    const eixo = [
      [0, 0],
      [100, 0],
      [50, 0],
    ]
    const fora = offsetPolylineMiter(eixo, 10)
    for (const p of fora.slice(2, -2)) expect(Math.hypot(p[0] - 100, p[1])).toBeCloseTo(10, 9)
    expect(fora.at(-1)).toEqual([50, -10])
    expect(offsetPolylineMiter(eixo, -10)).toEqual([
      [0, -10],
      [100, -10],
      [100, 10],
      [50, 10],
    ])
  })

  test('sem dois pontos distintos não há desvio; desvio nulo é o próprio eixo, copiado', () => {
    expect(
      offsetPolylineMiter(
        [
          [3, 3],
          [3, 3],
        ],
        5,
      ),
    ).toEqual([])
    expect(offsetRuns([[3, 3]], 5, 1)).toEqual([])
    const eixo = [
      [0, 0],
      [10, 0],
    ]
    const [so] = offsetRuns(eixo, 0, 1)
    expect(so).toEqual(eixo)
    expect(so).not.toBe(eixo)
  })
})

describe('configuração guardada', () => {
  test('sem nada: a de omissão', () => {
    for (const s of [null, undefined, {}])
      expect(normalizeCorridorConfig(s)).toEqual(DEFAULT_CORRIDOR_CONFIG)
  })

  test('valores fora do domínio presos, lixo fora, vértices repetidos fundidos', () => {
    const c = normalizeCorridorConfig({
      centreline: [[-9.14, 38.7], [-9.14, 38.7], ['a', 1], null, [-9.13, 38.7, 12]],
      bufferM: '9999',
      speedMS: 'depressa',
      altitude: 2,
      photoMode: 'waypoint',
      split: 'battery',
      ownParams: 'sim',
      frontOverlap: 120,
    })
    expect(c.centreline).toEqual([
      [-9.14, 38.7],
      [-9.13, 38.7, 12],
    ])
    expect(c).toMatchObject({
      bufferM: 5000,
      speedMS: 8,
      altitude: 5,
      photoMode: 'waypoint',
      split: 'battery',
      ownParams: false,
      frontOverlap: 95,
    })
    // um só vértice válido não é eixo
    expect(
      normalizeCorridorConfig({
        centreline: [
          [-9.14, 38.7],
          [-9.14, 38.7],
        ],
      }).centreline,
    ).toBeNull()
  })
})

describe('geometria nas pontas', () => {
  test('desvios das passagens com entradas que não são números', () => {
    expect(passOffsets('x', 10, 5)).toEqual([0])
    expect(passOffsets(10, null, undefined)).toHaveLength(41) // espaçamento mínimo de 0,5 m
    expect(passOffsets(1e9, 1, 0)).toEqual({ count: 2e9 + 1 })
  })

  test('polilinhas vazias, de um ponto ou com passo inválido; e a trava da amostragem', () => {
    expect(dedupePolyline(null)).toEqual([])
    expect(resamplePolyline('x', 1)).toEqual([])
    expect(
      resamplePolyline(
        [
          [1, 1],
          [1, 1],
        ],
        1,
      ),
    ).toEqual([[1, 1]])
    // passo inválido: 0,25 m
    expect(
      resamplePolyline(
        [
          [0, 0],
          [1, 0],
        ],
        'x',
      ),
    ).toHaveLength(5)
    // 30 km a 1 m: pára aos 20 000 pontos, marcada, sem coser o corte ao fim
    const longa = resamplePolyline(
      [
        [0, 0],
        [30000, 0],
      ],
      1,
    )
    expect(longa.truncated).toBe(true)
    expect(longa).toHaveLength(20000)
    expect(longa.at(-1)).toEqual([19999, 0])
  })

  test('vértices repetidos: distância, prolongamento das pontas e amostragem por arco', () => {
    const rep = [
      [0, 0],
      [0, 0],
      [10, 0],
    ]
    expect(pointPolylineDistance([0, 5], rep)).toBe(5)
    // a ponta de comprimento nulo não tem direcção: fica onde está
    expect(extendRunEnds(rep, 2)).toEqual([
      [0, 0],
      [0, 0],
      [12, 0],
    ])
    expect(extendRunEnds(rep, 0)).toBe(rep)
    expect(extendRunEnds([[1, 1]], 2)).toEqual([[1, 1]])
    expect(sampleByArcLength(rep, 2.5)).toEqual([
      [0, 0],
      [2.5, 0],
      [5, 0],
      [7.5, 0],
      [10, 0],
    ])
    const s = simplifyPolyline(rep, 'x')
    expect(s).toEqual(rep)
    expect(s).not.toBe(rep)
  })

  test('anel do corredor para o mapa: à meia-largura do eixo; sem eixo, largura ou coordenadas, nada', () => {
    const eixo = [toLL([0, 0]), toLL([200, 0])]
    const ring = corridorBufferRing(eixo, 30)
    expect(ring.length).toBeGreaterThanOrEqual(4)
    expect(ring.at(-1)).toEqual(ring[0])
    for (const p of ring) {
      const d = pointPolylineDistance(toM(p), [
        [0, 0],
        [200, 0],
      ])
      expect(d).toBeGreaterThan(29.4)
      expect(d).toBeLessThan(30.6)
    }
    expect(corridorBufferRing([toLL([0, 0])], 30)).toBeNull()
    expect(corridorBufferRing(eixo, 0)).toBeNull()
    expect(corridorBufferRing([[Number.NaN, 0], toLL([200, 0])], 30)).toBeNull()
  })
})
