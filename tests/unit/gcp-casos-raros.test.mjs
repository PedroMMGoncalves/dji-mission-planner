/**
 * Pontos de controlo no solo, casos raros (src/utils/gcp.js): o número
 * sugerido nos extremos e com áreas inválidas; um pedido inválido ou uma
 * área que não é polígono; uma área mais pequena do que o recuo (um só
 * alvo, dentro dela) ou pequena para os alvos pedidos (só os que cabem,
 * afastados entre si); uma faixa diagonal comprida, com a grelha de
 * candidatos desbastada; o recuo dado à mão; as métricas sem GCPs; e o KML
 * de campo, com os nomes escapados e as coordenadas em graus decimais,
 * também junto ao meridiano de Greenwich e ao equador.
 */
import * as turf from '@turf/turf'
import { DOMParser } from '@xmldom/xmldom'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, test } from 'vitest'
import { buildGcpKML, gcpStats, planGcps, suggestedGcpCount } from '../../src/utils/gcp.js'
import { childNamed, findAll, textOf } from '../../src/utils/xml.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]
const dentro = (ring, p) =>
  turf.booleanPointInPolygon(turf.point(p), turf.polygon([[...ring, ring[0]]]))
const aoBordo = (ring, p) =>
  turf.pointToLineDistance(turf.point(p), turf.lineString([...ring, ring[0]]), { units: 'meters' })
const separacaoMinima = (gcps) => {
  let m = Infinity
  for (let i = 0; i < gcps.length; i++)
    for (let j = i + 1; j < gcps.length; j++)
      m = Math.min(m, turf.distance(gcps[i].point, gcps[j].point, { units: 'meters' }))
  return m
}

describe('quantos GCPs', () => {
  test('5 de base, mais um por cada 5 ha, até 25; área inválida conta como nenhuma', () => {
    for (const ha of [0, -3, Number.NaN, undefined, Infinity]) expect(suggestedGcpCount(ha)).toBe(5)
    expect(suggestedGcpCount(4.9)).toBe(5)
    expect(suggestedGcpCount(5)).toBe(6)
    expect(suggestedGcpCount(24.9)).toBe(9)
    expect(suggestedGcpCount(100)).toBe(25)
    expect(suggestedGcpCount(1e6)).toBe(25)
  })
})

describe('distribuição', () => {
  const area = rect(0, 0, 300, 200)

  test('sem polígono, nada; um pedido que não é um número positivo dá um alvo', () => {
    expect(planGcps(null, 5)).toEqual([])
    expect(planGcps(area.slice(0, 2), 5)).toEqual([])
    for (const count of ['abc', 0, -3, Number.NaN]) expect(planGcps(area, count)).toHaveLength(1)
    expect(planGcps(area, 2.7)).toHaveLength(2)
    expect(planGcps(area, '3').map((g) => g.id)).toEqual(['GCP-01', 'GCP-02', 'GCP-03'])
  })

  test('área mais pequena do que o recuo: um só alvo, dentro dela', () => {
    // 10 × 10 m com o recuo mínimo de 15 m: nenhum candidato tem folga
    const quadradinho = rect(0, 0, 10, 10)
    const g = planGcps(quadradinho, 5)
    expect(g).toHaveLength(1)
    expect(dentro(quadradinho, g[0].point)).toBe(true)
  })

  test('área pequena para os alvos pedidos: só os que cabem, a mais de 10 m uns dos outros', () => {
    const pequena = rect(0, 0, 60, 60)
    const g = planGcps(pequena, 25)
    expect(g.length).toBeGreaterThan(1)
    expect(g.length).toBeLessThan(25)
    expect(separacaoMinima(g)).toBeGreaterThan(10)
    for (const { point } of g) expect(dentro(pequena, point)).toBe(true)
  })

  test('faixa diagonal de 6 km × 100 m: 25 alvos dentro, com folga, de ponta a ponta', () => {
    // a caixa da faixa tem 4,3 km de lado: a grelha de candidatos passaria de
    // 3000 pontos e é desbastada
    const d = 4243
    const w = 50 / Math.SQRT2
    const faixa = [em(-w, w), em(d - w, d + w), em(d + w, d - w), em(w, -w)]
    const g = planGcps(faixa, 25)
    expect(g).toHaveLength(25)
    for (const { point } of g) {
      expect(dentro(faixa, point)).toBe(true)
      expect(aoBordo(faixa, point)).toBeGreaterThan(11)
    }
    // a posição ao longo do eixo (0 a 6000 m) cobre a faixa toda
    const ao = g.map(({ point }) => {
      const x = (point[0] + 9.14) * mLon
      const y = (point[1] - lat0) * 110574
      return (x + y) / Math.SQRT2
    })
    expect(Math.min(...ao)).toBeLessThan(300)
    expect(Math.max(...ao)).toBeGreaterThan(5700)
  })

  test('o recuo dado à mão afasta os alvos do bordo; um recuo inválido conta como nenhum', () => {
    const grande = rect(0, 0, 400, 300)
    const bordo = (gcps) => Math.min(...gcps.map(({ point }) => aoBordo(grande, point)))
    // a folga é metade do recuo: 20 m com 40 m, 7,5 m com o mínimo de 15 m
    expect(bordo(planGcps(grande, 9, { insetM: 40 }))).toBeGreaterThanOrEqual(20)
    const omissao = planGcps(grande, 9)
    expect(bordo(omissao)).toBeGreaterThanOrEqual(7.5)
    expect(bordo(omissao)).toBeLessThan(20)
    for (const insetM of [-5, Number.NaN, 0])
      expect(planGcps(grande, 9, { insetM })).toEqual(omissao)
  })

  test('métricas sem GCPs nem área: zero, sem hectares por alvo, sem separação', () => {
    expect(gcpStats(null, null)).toEqual({
      count: 0,
      areaHa: 0,
      haPerGcp: null,
      minSpacingM: Infinity,
    })
    const s = gcpStats(area, 'nenhum')
    expect(s.count).toBe(0)
    expect(s.areaHa).toBeCloseTo(6, 1)
    expect(s.haPerGcp).toBeNull()
  })
})

describe('KML de campo', () => {
  const xml = (s) => new DOMParser().parseFromString(s, 'text/xml')

  test('um ponto por GCP, com o nome escapado e o estilo comum; sem lista, só o documento', () => {
    const kml = buildGcpKML(
      [
        { id: 'GCP <1>', point: [-9.14, 38.7] },
        { id: 'GCP-02', point: [-9.1305, 38.7012345678] },
      ],
      'Quinta & Sítio',
    )
    expect(XMLValidator.validate(kml)).toBe(true)
    const doc = xml(kml)
    expect(textOf(childNamed(findAll(doc, 'Document')[0], 'name'))).toBe('Quinta & Sítio')
    const pts = findAll(doc, 'Placemark')
    expect(pts.map((p) => textOf(childNamed(p, 'name')))).toEqual(['GCP <1>', 'GCP-02'])
    expect(pts.map((p) => textOf(findAll(p, 'styleUrl')[0]))).toEqual(['#gcpTarget', '#gcpTarget'])
    expect(pts.map((p) => textOf(findAll(p, 'coordinates')[0]))).toEqual([
      '-9.14,38.7,0',
      '-9.1305,38.70123457,0',
    ])
    const vazio = buildGcpKML(null)
    expect(XMLValidator.validate(vazio)).toBe(true)
    expect(findAll(xml(vazio), 'Placemark')).toHaveLength(0)
    expect(textOf(findAll(xml(vazio), 'name')[0])).toBe('GCPs')
  })

  test('junto ao meridiano de Greenwich e ao equador: graus decimais, sem notação científica', () => {
    // a menos de 11 cm de 0°, Number(v.toFixed(8)) escrevia «4e-7» (o KML da
    // área e o KMZ já escreviam graus decimais)
    const kml = buildGcpKML([
      { id: 'G1', point: [4e-7, 51.4779] },
      { id: 'G2', point: [-0.1276, -3e-7] },
      { id: 'G3', point: [-1e-9, 0] },
    ])
    const coords = findAll(xml(kml), 'coordinates').map(textOf)
    expect(coords).toEqual(['0.0000004,51.4779,0', '-0.1276,-0.0000003,0', '0,0,0'])
  })
})
