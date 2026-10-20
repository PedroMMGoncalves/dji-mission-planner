/**
 * Onde as fotos saem com disparo por distância/tempo (src/mission/photoPoints.js):
 * a cada intervalo dentro de cada grupo de disparo, a começar no primeiro
 * waypoint do grupo; sem fotos nas ligações longas, fora dos grupos.
 */
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import {
  areaPhotoPoints,
  photoPointsAlong,
  photoPositions2d,
  photosAtWaypoints,
  photosOnRoute,
} from '../../src/mission/photoPoints.js'
import { triggerMaxLinkM } from '../../src/utils/geo.js'

const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-7.2 + x / mL, lat + y / 110574]
const dist = (a, b) => turf.distance(a, b, { units: 'meters' })
// um ponto a `m` metros exactos de `a`, para Este (as faixas dos testes)
const este = (a, m) =>
  turf.destination(a, m / 1000, 90, { units: 'kilometers' }).geometry.coordinates

describe('fotos por distância', () => {
  test('uma linha de 100 m a cada 20 m: seis fotos, do início ao fim', () => {
    const a = em(0, 0)
    const pts = photoPointsAlong([a, este(a, 100)], [[0, 1]], 20)
    expect(pts).toHaveLength(6)
    expect(dist(pts[0], a)).toBeLessThan(0.01)
    expect(dist(pts[5], este(a, 100))).toBeLessThan(0.05)
    for (let i = 1; i < pts.length; i++) expect(dist(pts[i - 1], pts[i])).toBeCloseTo(20, 1)
  })

  test('o intervalo continua pela viragem curta e recomeça depois de uma ligação longa', () => {
    // duas faixas a 30 m (ligação curta) e uma terceira a 900 m (ligação longa)
    const wps = [em(0, 0), em(50, 0), em(50, 30), em(0, 30), em(0, 930), em(50, 930)]
    const lines = [
      [wps[0], wps[1]],
      [wps[2], wps[3]],
      [wps[4], wps[5]],
    ]
    const plan = { lines, waypoints: wps }
    const pts = areaPhotoPoints(plan, null, { intervalM: 20, spacingM: 30 })
    // grupo 1: 0..130 m de rota (50 + 30 + 50) → 0,20,…,120 = 7 fotos; grupo 2: 0,20,40 = 3
    expect(pts).toHaveLength(10)
    // a última do grupo 1 fica na segunda faixa, a 120 m de rota; a primeira
    // do grupo 2 no arranque da terceira faixa
    expect(dist(pts[6], em(10, 30))).toBeLessThan(0.1)
    expect(dist(pts[7], em(0, 930))).toBeLessThan(0.01)
    expect(pts.length).toBeGreaterThan(0)
    expect(triggerMaxLinkM(30)).toBeLessThan(900)
  })

  test('blocos: cada bloco com os seus grupos, pelos seus waypoints', () => {
    const a = [em(0, 0), este(em(0, 0), 40)]
    const b = [em(0, 500), este(em(0, 500), 40)]
    const blocks = [
      { id: 1, lines: [a], waypoints: a },
      { id: 2, lines: [b], waypoints: b },
    ]
    const pts = areaPhotoPoints({ lines: [a, b], waypoints: [...a, ...b] }, blocks, {
      intervalM: 10,
      spacingM: 20,
    })
    expect(pts).toHaveLength(10)
    expect(dist(pts[5], em(0, 500))).toBeLessThan(0.01)
  })

  test('sem intervalo, sem grupos ou fora dos índices: nada', () => {
    expect(photoPointsAlong([em(0, 0), em(10, 0)], [[0, 1]], 0)).toEqual([])
    expect(photoPointsAlong([em(0, 0), em(10, 0)], [], 5)).toEqual([])
    expect(photoPointsAlong([em(0, 0)], [[0, 3]], 5)).toEqual([])
  })

  test('na rota 3D: cada foto recebe a altura do troço mais próximo; os saltos entre voos não contam', () => {
    // duas faixas a subir (100 → 120 m) ligadas por um salto entre voos
    const route = [
      [...em(0, 0), 100],
      [...em(100, 0), 120],
      [...em(100, 500), 300],
      [...em(0, 500), 300],
    ]
    const fotos = [em(50, 0), em(25, 1), em(50, 500)]
    const out = photosOnRoute(fotos, route, { breaks: [2] })
    expect(out).toHaveLength(3)
    expect(out[0][2]).toBeCloseTo(110, 0)
    expect(out[1][2]).toBeCloseTo(105, 0)
    expect(out[2][2]).toBe(300)
    // uma foto logo a seguir ao fim da faixa (no salto, que não se voa) vai
    // para o troço real mais próximo; uma foto longe de qualquer troço (mais
    // do que o passo da procura) não pertence à rota e não é desenhada
    const salto = photosOnRoute([em(100, 30), em(100, 250)], route, { breaks: [2] })
    expect(salto).toHaveLength(1)
    expect(salto[0][2]).toBe(120)
  })

  test('com foto por waypoint: só os waypoints com a acção de foto', () => {
    const route = [
      [...em(0, 0), 100],
      [...em(10, 0), 100],
      [...em(20, 0), 100],
    ]
    const pw = [undefined, { actions: ['takePhoto'] }, { actions: ['startRecord'] }]
    expect(photosAtWaypoints(route, pw)).toEqual([route[1]])
    expect(photosAtWaypoints(route, null)).toEqual([])
  })

  test('no mapa, as fotos empilhadas na vertical (fachada, órbita) são uma só marca', () => {
    const a = em(0, 0)
    const b = em(10, 0)
    const pts = photoPositions2d([
      [...a, 10],
      [...a, 20],
      [...b, 10],
      [Number.NaN, 0],
    ])
    expect(pts).toEqual([a, b])
    expect(photoPositions2d(null)).toEqual([])
  })
})
