/**
 * Mosaico de quadrados optimizado (squareMosaic.js): recorte pelo polígono,
 * pesquisa do deslocamento da grelha, fusão das tiras, pedaços disjuntos,
 * buracos por célula, numeração serpenteante e orientação tirada das faixas.
 */
import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import {
  computeAlignment,
  generateFlightPlan,
  ringToPolygon,
  tilePolygonWithSquares,
} from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-8.0 + x / mLon, lat0 + y / 110574]
const S = 600

/** Rectângulo w×h centrado na origem, com arestas no azimute `az`. */
function rectangulo(w, h, az = 0) {
  const t = (az * Math.PI) / 180
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([u, v]) => em(u * Math.cos(t) + v * Math.sin(t), -u * Math.sin(t) + v * Math.cos(t)))
}

/** Contorno irregular (bolha), raio médio R em metros. */
function bolha(R, n = 120) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    const r = R * (1 + 0.18 * Math.sin(3 * a) + 0.08 * Math.cos(7 * a) + 0.03 * Math.sin(23 * a))
    return em(r * Math.cos(a), r * Math.sin(a))
  })
}

const poligonoCelula = (c) => ringToPolygon(c.ring, c.holes)
const areaTurf = (rings) => rings.reduce((t, c) => t + turf.area(poligonoCelula(c)), 0)

/** Diferença angular entre dois azimutes, como direcções (módulo 180°). */
const difDireccao = (a, b) => {
  const d = (((a - b) % 180) + 180) % 180
  return Math.min(d, 180 - d)
}

describe('buildSquareMosaic', () => {
  test('rectangulo de 3x2 lados da 6 celulas cheias, sem tiras', () => {
    for (const az of [0, 30]) {
      const r = buildSquareMosaic(rectangulo(3 * S, 2 * S, az), { sideM: S, orientationDeg: az })
      expect(r.error).toBeUndefined()
      expect(r.cells).toHaveLength(6)
      expect(r.slivers).toBe(0)
      for (const c of r.cells) {
        expect(c.fillFrac).toBeCloseTo(1, 6)
        expect(c.mergedFrom).toEqual([])
        expect(c.holes).toEqual([])
      }
    }
  })

  test('rectangulo de 2,1 lados: as tiras de 0,1 lado sao fundidas', () => {
    const ring = rectangulo(2.1 * S, 2 * S)
    const r = buildSquareMosaic(ring, { sideM: S })
    // a grelha ingénua tem pelo menos 3×2 quadrados; com a fusão ficam 4 células
    expect(tilePolygonWithSquares(ring, S, 0).length).toBeGreaterThanOrEqual(6)
    expect(r.cells.length).toBeLessThan(6)
    expect(r.cells).toHaveLength(4)
    expect(r.slivers).toBe(0)
    const fundidas = r.cells.filter((c) => c.mergedFrom.length > 0)
    expect(fundidas).toHaveLength(2)
    for (const c of fundidas) {
      expect(c.fillFrac).toBeCloseTo(1.1, 6)
      expect(c.mergedFrom[0].areaM2).toBeCloseTo(0.1 * S * S, 3)
      // polígono único e válido
      expect(turf.booleanValid(poligonoCelula(c))).toBe(true)
      expect(c.ring.length).toBeGreaterThanOrEqual(4)
    }
    expect(areaTurf(r.cells) / turf.area(ringToPolygon(ring))).toBeCloseTo(1, 6)
  })

  test('rectangulo de 2,1 lados sem fusao possivel: o deslocamento evita as tiras', () => {
    const r = buildSquareMosaic(rectangulo(2.1 * S, 2 * S), { sideM: S, fits: () => false })
    expect(r.cells).toHaveLength(6)
    expect(r.slivers).toBe(0)
    for (const c of r.cells) expect(c.fillFrac).toBeGreaterThanOrEqual(0.25)
    expect(r.cells.every((c) => c.mergedFrom.length === 0)).toBe(true)
  })

  test('fits proprio recebe o anel em lon/lat e a area fundida', () => {
    const chamadas = []
    const r = buildSquareMosaic(rectangulo(2.1 * S, 2 * S), {
      sideM: S,
      offsetSteps: 1,
      fits: (ring, areaM2) => {
        chamadas.push({ ring, areaM2 })
        return areaM2 <= 1.15 * S * S
      },
    })
    expect(chamadas.length).toBeGreaterThan(0)
    for (const { ring, areaM2 } of chamadas) {
      expect(Math.abs(ring[0][0] + 8)).toBeLessThan(0.1) // longitude
      expect(Math.abs(ring[0][1] - lat0)).toBeLessThan(0.1) // latitude
      expect(areaM2).toBeGreaterThan(S * S)
    }
    expect(r.cells).toHaveLength(4)
  })

  test('deslocamento optimizado bate a grelha ancorada na bbox de tilePolygonWithSquares', () => {
    const ring = bolha(1300)
    const az = 17
    const area = ringToPolygon(ring)
    // grelha antiga, recortada pelo polígono: pedaços e tiras
    const antigos = tilePolygonWithSquares(ring, S, az)
    let pedacos = 0
    let tirasAntigas = 0
    for (const sq of antigos) {
      const x = turf.intersect(turf.featureCollection([ringToPolygon(sq), area]))
      if (!x) continue
      const partes =
        x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates
      for (const p of partes) {
        const a = turf.area(turf.polygon(p))
        if (a < 1) continue
        pedacos++
        if (a / (S * S) < 0.25) tirasAntigas++
      }
    }
    expect(tirasAntigas).toBeGreaterThan(0) // o caso tem de ter tiras na grelha antiga

    const r = buildSquareMosaic(ring, { sideM: S, orientationDeg: az })
    expect(r.cells.length).toBeLessThanOrEqual(pedacos)
    expect(r.slivers).toBeLessThan(tirasAntigas)
  })

  test('poligono concavo: pedacos disjuntos do mesmo quadrado sao celulas separadas', () => {
    // pente: base de 0,5 lado e 4 dentes de 0,25 lado com 2,5 lados de altura;
    // qualquer quadrado acima da base apanha pelo menos dois dentes
    const pts = [
      [0, 0],
      [1.75, 0],
      [1.75, 3],
      [1.5, 3],
      [1.5, 0.5],
      [1.25, 0.5],
      [1.25, 3],
      [1.0, 3],
      [1.0, 0.5],
      [0.75, 0.5],
      [0.75, 3],
      [0.5, 3],
      [0.5, 0.5],
      [0.25, 0.5],
      [0.25, 3],
      [0, 3],
    ].map(([x, y]) => [x * S, y * S])
    const ring = pts.map(([x, y]) => em(x - 0.875 * S, y - 1.5 * S))
    const poly = ringToPolygon(ring)
    expect(turf.booleanValid(poly)).toBe(true)

    const r = buildSquareMosaic(ring, { sideM: S, minFillFrac: 0 })
    expect(r.error).toBeUndefined()
    const porQuadrado = new Map()
    for (const c of r.cells) {
      const k = `${c.row},${c.col}`
      porQuadrado.set(k, [...(porQuadrado.get(k) ?? []), c])
      // cada célula é um polígono simples, contido na área
      expect(turf.booleanValid(poligonoCelula(c))).toBe(true)
    }
    expect(Math.max(...[...porQuadrado.values()].map((l) => l.length))).toBeGreaterThanOrEqual(2)
    // o nº de células de cada quadrado é o nº de componentes do recorte
    for (const lista of porQuadrado.values()) {
      const sq = ringToPolygon(lista[0].square)
      const x = turf.intersect(turf.featureCollection([sq, poly]))
      const partes = (
        x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates
      ).filter((p) => turf.area(turf.polygon(p)) > 1)
      expect(lista).toHaveLength(partes.length)
      for (let i = 0; i < lista.length; i++)
        for (let j = i + 1; j < lista.length; j++)
          expect(turf.booleanDisjoint(poligonoCelula(lista[i]), poligonoCelula(lista[j]))).toBe(
            true,
          )
    }
    expect(areaTurf(r.cells) / turf.area(poly)).toBeCloseTo(1, 5)
  })

  test('buraco inteiro numa celula volta como anel interior dessa celula', () => {
    const ring = rectangulo(3 * S, 3 * S)
    const buracoInterior = [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ].map(([x, y]) => em(x, y))
    // buraco a cavalo na linha da grelha entre duas células
    const buracoFronteira = [
      [-100, 800],
      [-100, 1000],
      [100, 1000],
      [100, 800],
    ].map(([x, y]) => em(x + S / 2, y - 0.5 * S))
    const holes = [buracoInterior, buracoFronteira]
    const r = buildSquareMosaic(ring, { sideM: S, holes })
    expect(r.cells).toHaveLength(9)
    const comBuraco = r.cells.filter((c) => c.holes.length > 0)
    expect(comBuraco).toHaveLength(1)
    const c = comBuraco[0]
    expect(c.areaM2).toBeCloseTo(S * S - 100 * 100, 0)
    expect(turf.booleanPointInPolygon(turf.point(em(0, 0)), poligonoCelula(c))).toBe(false)
    expect(turf.booleanPointInPolygon(turf.point(em(200, 200)), poligonoCelula(c))).toBe(true)
    for (const x of r.cells) expect(turf.booleanValid(poligonoCelula(x))).toBe(true)
    // o planeador aceita a célula com os seus buracos
    const plano = generateFlightPlan(c.ring, {
      spacingM: 40,
      angleDeg: 0,
      bufferPct: 0,
      photoIntervalM: 0,
      speed: 10,
      holes: c.holes,
    })
    expect(plano?.lines?.length).toBeGreaterThan(0)
    const total = turf.area(ringToPolygon(ring, holes))
    expect(areaTurf(r.cells) / total).toBeCloseTo(1, 5)
  })

  test('orientacao de mosaicOrientationForLines poe as arestas paralelas as faixas', () => {
    expect(mosaicOrientationForLines(210)).toBe(30)
    expect(mosaicOrientationForLines(-30)).toBe(150)
    expect(mosaicOrientationForLines(NaN)).toBe(0)
    const ring = bolha(1200)
    for (const angle of [0, 30, 90]) {
      const orientationDeg = mosaicOrientationForLines(angle)
      const r = buildSquareMosaic(ring, { sideM: 400, orientationDeg })
      const cheia = r.cells.find((c) => c.mergedFrom.length === 0 && c.fillFrac > 0.999999)
      expect(cheia).toBeDefined()
      const align = computeAlignment(ring, 40, angle)
      const plano = generateFlightPlan(cheia.ring, {
        spacingM: 40,
        angleDeg: angle,
        bufferPct: 0,
        photoIntervalM: 0,
        speed: 10,
        align,
      })
      expect(plano.lines.length).toBeGreaterThan(5)
      const arestas = cheia.ring.map((p, i) =>
        turf.bearing(p, cheia.ring[(i + 1) % cheia.ring.length]),
      )
      for (const linha of plano.lines) {
        const b = turf.bearing(linha[0], linha[linha.length - 1])
        expect(Math.min(...arestas.map((e) => difDireccao(b, e)))).toBeLessThan(0.5)
      }
    }
  })

  test('area das celulas soma a area do poligono menos os buracos (0,5 %)', () => {
    const ring = bolha(1500, 300)
    const holes = [
      [
        [100, 100],
        [400, 120],
        [380, 420],
        [90, 380],
      ].map(([x, y]) => em(x, y)),
      [
        [-700, -300],
        [-650, -310],
        [-640, -250],
        [-700, -240],
      ].map(([x, y]) => em(x, y)),
    ]
    for (const az of [0, 23, 61]) {
      const r = buildSquareMosaic(ring, { sideM: 500, orientationDeg: az, holes })
      const total = turf.area(ringToPolygon(ring, holes))
      expect(Math.abs(areaTurf(r.cells) / total - 1)).toBeLessThan(0.005)
      // áreas planas: as mesmas a menos da escala do referencial local
      const plana = r.cells.reduce((t, c) => t + c.areaM2, 0)
      expect(Math.abs(plana / total - 1)).toBeLessThan(0.01)
    }
  })

  test('numeracao serpenteante: linha a linha, sentido alternado', () => {
    const r = buildSquareMosaic(rectangulo(3 * S, 2 * S), { sideM: S })
    expect(r.cells.map((c) => [c.id, c.row, c.col])).toEqual([
      [1, 0, 0],
      [2, 0, 1],
      [3, 0, 2],
      [4, 1, 2],
      [5, 1, 1],
      [6, 1, 0],
    ])

    const b = buildSquareMosaic(bolha(1800), { sideM: S, orientationDeg: 40 })
    expect(b.cells.map((c) => c.id)).toEqual(b.cells.map((_, i) => i + 1))
    const linhas = []
    for (const c of b.cells) {
      const ult = linhas[linhas.length - 1]
      if (ult && ult.row === c.row) ult.cols.push(c.col)
      else {
        if (ult) expect(c.row).toBeGreaterThan(ult.row)
        linhas.push({ row: c.row, cols: [c.col] })
      }
    }
    expect(linhas.length).toBeGreaterThan(2)
    linhas.forEach((l, i) => {
      const dir = i % 2 === 0 ? 1 : -1
      for (let k = 1; k < l.cols.length; k++)
        expect(dir * (l.cols[k] - l.cols[k - 1])).toBeGreaterThanOrEqual(0)
    })
  })

  test('demasiadas celulas e entrada degenerada', () => {
    const big = bolha(1800)
    const r = buildSquareMosaic(big, { sideM: 100 })
    expect(r.error).toBe('too-many-cells')
    expect(r.count).toBeGreaterThan(400)
    const r2 = buildSquareMosaic(big, { sideM: S, maxCells: 10 })
    expect(r2.error).toBe('too-many-cells')
    expect(r2.count).toBeGreaterThan(10)

    expect(buildSquareMosaic(null, { sideM: S }).error).toBe('invalid')
    expect(buildSquareMosaic(big.slice(0, 2), { sideM: S }).error).toBe('invalid')
    expect(buildSquareMosaic(big, { sideM: 0 }).error).toBe('invalid')
    expect(buildSquareMosaic(big, { sideM: NaN }).error).toBe('invalid')
    expect(buildSquareMosaic([em(0, 0), em(100, 0), [NaN, 1]], { sideM: S }).error).toBe('invalid')
    // colinear: área nula
    expect(buildSquareMosaic([em(0, 0), em(100, 0), em(200, 0)], { sideM: S }).error).toBe(
      'invalid',
    )
  })

  test('desempenho: ~10 km2 com quadrados de 600 m bem abaixo de 300 ms', () => {
    const ring = bolha(1784, 400)
    const km2 = turf.area(ringToPolygon(ring)) / 1e6
    expect(km2).toBeGreaterThan(9)
    expect(km2).toBeLessThan(11)
    buildSquareMosaic(ring, { sideM: S, orientationDeg: 23 }) // aquecimento do JIT
    const t0 = performance.now()
    const r = buildSquareMosaic(ring, { sideM: S, orientationDeg: 23 })
    const ms = performance.now() - t0
    expect(r.error).toBeUndefined()
    expect(r.trials).toBe(17)
    expect(ms).toBeLessThan(300)
  })
})
