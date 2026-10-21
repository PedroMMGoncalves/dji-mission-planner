/**
 * Fachada, casos raros (src/utils/faceMode.js): cada recusa do gerador com o
 * seu código e a mensagem nas duas línguas; o piso acima da passagem de
 * topo; sem velocidade; um canto a passar pelo norte (o rumo roda pelo
 * caminho curto); as fotografias coladas na ponta de uma passagem; a
 * configuração guardada; e a folga contra o MDS local — um ressalto a meio
 * do afastamento, o solo a subir debaixo do drone, um MDS sem dados, um
 * plano sem estatísticas e a cota em falta debaixo do drone.
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { translate } from '../../src/i18n.jsx'
import {
  DEFAULT_FACE_CONFIG,
  checkFaceClearance,
  generateFacePlan,
  normalizeFaceConfig,
  spacePhotos,
} from '../../src/utils/faceMode.js'
import { resolveSensor } from '../../src/utils/geo.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lat0 = 39.5
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const toLL = (x, y) => [-8 + x / mLon, lat0 + y / 110574]
const base = { sensor, faceHeightM: 40, standoffM: 25, side: 'left', speed: 3 }
const recta = [toLL(0, 0), toLL(200, 0)]

// [o que vem mal, linha de base, opções, código]
const RECUSAS = [
  ['sem altura de face', recta, { faceHeightM: 0 }, 'invalid-dimensions'],
  ['afastamento nulo', recta, { standoffM: 0 }, 'invalid-dimensions'],
  ['sem sensor', recta, { sensor: null }, 'camera-required'],
  ['um LiDAR', recta, { sensor: { type: 'lidar', fov: 70 } }, 'camera-required'],
  [
    'sobreposição de 99,8 %',
    recta,
    { verticalOverlapPct: 99.8, horizontalOverlapPct: 99.8 },
    'overlap-too-high',
  ],
  ['câmara apontada quase a pique', recta, { gimbalPitch: 89 }, 'pitch-too-steep'],
  ['dois cliques no mesmo sítio', [toLL(0, 0), toLL(0, 0)], {}, 'standoff-corner'],
]

describe('recusas do gerador', () => {
  test.each(RECUSAS)('%s', (_, linha, extra, code) => {
    expect(generateFacePlan(linha, { ...base, ...extra })).toEqual({ error: code })
  })

  test('sem linha de base não há plano; sem opções, dimensões inválidas', () => {
    expect(generateFacePlan(null, base)).toBeNull()
    expect(generateFacePlan([toLL(0, 0)], base)).toBeNull()
    expect(generateFacePlan(recta, undefined)).toEqual({ error: 'invalid-dimensions' })
  })

  test('cada recusa tem mensagem nas duas línguas', () => {
    for (const [, , , code] of RECUSAS)
      for (const lang of ['pt', 'en'])
        expect(translate(lang, `fp.error.${code}`), `${lang}: ${code}`).not.toBe(`fp.error.${code}`)
  })
})

describe('passagens e fotografias', () => {
  test('piso acima do centro da passagem de topo: uma só passagem, no piso', () => {
    const imgH = generateFacePlan(recta, base).stats.imageHeightM
    // face pouco mais alta do que uma imagem, piso acima do meio dela
    const p = generateFacePlan(recta, { ...base, faceHeightM: imgH + 2, minHeightM: imgH / 2 + 3 })
    expect(p.stats.passCount).toBe(1)
    expect(p.stats.heights).toEqual([imgH / 2 + 3])
    expect(p.stats.vStepM).toBeNull()
  })

  test('sem velocidade não há tempo de voo', () => {
    expect(generateFacePlan(recta, { ...base, speed: 0 }).stats.flightTimeS).toBeNull()
  })

  test('canto a passar pelo norte: o rumo das fotografias roda pelo caminho curto', () => {
    // para oeste, a virar 60° para a direita; o drone à esquerda (a sul)
    // olha para norte: o rumo vai de 340° a 40°, passando pelo 0°
    const rumo = (graus) => [Math.sin((graus * Math.PI) / 180), Math.cos((graus * Math.PI) / 180)]
    const [ax, ay] = rumo(250)
    const [bx, by] = rumo(310)
    const linha = [toLL(0, 0), toLL(150 * ax, 150 * ay), toLL(150 * (ax + bx), 150 * (ay + by))]
    const p = generateFacePlan(linha, base)
    const rumos = p.perWaypoint.slice(0, p.stats.pointsPerPass).map((w) => w.heading)
    expect(rumos.some((h) => h > 300)).toBe(true)
    expect(rumos.some((h) => h > 0 && h < 60)).toBe(true)
    // nenhuma fotografia vira para sul (o caminho longo, de 340° a 40° por 180°)
    for (const h of rumos) expect(h >= 330 || h <= 50).toBe(true)
  })

  test('fotografias coladas na ponta de uma passagem: fica a da ponta', () => {
    const pts = [toLL(0, 0), toLL(5, 0), toLL(10, 0), toLL(10.2, 0)]
    const r = spacePhotos(pts, [0, 0, 0, 0], 0.55)
    expect(r.pts).toEqual([toLL(0, 0), toLL(5, 0), toLL(10.2, 0)])
    expect(r.headings).toEqual([0, 0, 0])
  })

  test('configuração guardada: sem objecto, a de omissão; lado direito e inclinações filtradas', () => {
    for (const s of [null, 'x', 42]) expect(normalizeFaceConfig(s)).toEqual(DEFAULT_FACE_CONFIG)
    const c = normalizeFaceConfig({
      side: 'right',
      capture: 'multi',
      multiPitches: [-200, 'x', 10, 70, -30, 0, 5],
      takeoffBaseId: 'b2',
      extendEnds: false,
    })
    expect(c).toMatchObject({
      side: 'right',
      capture: 'multi',
      multiPitches: [-120, 10, 60, -30, 0],
      takeoffBaseId: 'b2',
      extendEnds: false,
    })
  })
})

describe('folga contra o MDS local', () => {
  // face de 600 m de este a oeste em y = 0, drone a norte
  const face = [toLL(0, 0), toLL(600, 0)]
  const plano = (afast) =>
    generateFacePlan(face, { ...base, faceHeightM: 60, standoffM: afast, minHeightM: 16 })
  // ressalto de 22 m entre 10 e 15 m a norte do pé da face; o resto à cota 0
  const ressalto = (lon, lat) => {
    const dN = (lat - lat0) * 110574
    return dN >= 10 && dN <= 15 ? 22 : 0
  }

  test('um ressalto a meio do afastamento: só a passagem que o corta é marcada', () => {
    const r = checkFaceClearance(plano(25), ressalto, { minClearanceM: 15 })
    expect(r.ok).toBe(false)
    expect(r.passes).toEqual([1])
    // a amostra a meio dos 25 m (12,5 m) já bate no ressalto
    expect(r.minHorizontalM).toBeCloseTo(12.5, 6)
    expect(checkFaceClearance(plano(60), ressalto, { minClearanceM: 15 })).toMatchObject({
      ok: true,
      passes: [],
    })
  })

  test('solo debaixo do drone acima do pé da face: as passagens baixas são marcadas', () => {
    const r = checkFaceClearance(plano(25), () => 10, { minClearanceM: 15, footElevM: 0 })
    expect(r.passes).toEqual([1, 2])
    expect(r.minVerticalM).toBeCloseTo(6, 1)
  })

  test('sem dados no MDS, sem plano ou sem função: nada (o painel diz «não verificado»)', () => {
    expect(checkFaceClearance(plano(25), () => null)).toBeNull()
    // com a cota do pé dada, mas sem uma única amostra do MDS
    expect(checkFaceClearance(plano(25), () => null, { footElevM: 0 })).toBeNull()
    expect(checkFaceClearance(null, () => 0)).toBeNull()
    expect(checkFaceClearance(plano(25), null)).toBeNull()
  })

  test('plano sem estatísticas: 25 m de afastamento, uma passagem e a folga vertical pedida', () => {
    const wp = toLL(0, 25)
    const r = checkFaceClearance(
      { waypoints: [[wp[0], wp[1], 10]], perWaypoint: [{ heading: 180 }] },
      () => 0,
      { footElevM: 0 },
    )
    expect(r).toMatchObject({
      ok: false,
      passes: [1],
      minVerticalM: 10,
      minHorizontalM: 25,
      samples: 4,
    })
  })

  test('sem cota debaixo do drone nem na primeira amostra: conta o resto, e a vertical fica por saber', () => {
    // o MDS só tem dados até 15 m a norte da face: o drone (25 m) e a
    // amostra a 18,75 m ficam sem cota; contam as de 12,5 e 6,25 m
    const wp = toLL(0, 25)
    const soAFrente = (lon, lat) => ((lat - lat0) * 110574 > 15 ? null : -5)
    const r = checkFaceClearance({ waypoints: [wp], perWaypoint: [{ heading: 180 }] }, soAFrente, {
      footElevM: 0,
    })
    expect(r).toMatchObject({ ok: true, minVerticalM: null, minHorizontalM: 25, samples: 2 })
  })
})
