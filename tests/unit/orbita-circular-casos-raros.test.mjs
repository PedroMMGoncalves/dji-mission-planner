/**
 * Órbita e modo circular, casos raros (src/utils/orbit.js,
 * src/utils/circular.js): raio e níveis inválidos; a órbita no sentido
 * contrário ao dos ponteiros; sem velocidade, sem tempo; os níveis de um
 * plano que não existe; o conselho de sobreposição quando só cabe um
 * círculo; buracos partidos (a área conta sem eles); o seguimento de
 * terreno de um plano sem a lista dos círculos; e os blocos sem velocidade.
 */
import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import {
  applyCircularTerrain,
  circularBlocks,
  generateCircularPlan,
  overlapAdvice,
} from '../../src/utils/circular.js'
import { rectangleFromAnchor, resolveSensor } from '../../src/utils/geo.js'
import { generateOrbitPlan, orbitLevelsToBlocks } from '../../src/utils/orbit.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const poi = [-8, 39.5]
const orbita = (extra) =>
  generateOrbitPlan(poi, { sensor, radiusM: 30, levels: [20, 40], speed: 3, ...extra })

describe('órbita', () => {
  test('raio ou POI em falta; níveis vazios, sem contagem ou não finitos', () => {
    expect(orbita({ radiusM: 0 })).toEqual({ error: 'invalid-radius' })
    expect(generateOrbitPlan(null, { sensor, radiusM: 30, levels: [20] })).toEqual({
      error: 'invalid-radius',
    })
    expect(generateOrbitPlan(poi, undefined)).toEqual({ error: 'invalid-radius' })
    for (const levels of [[], { count: 0, startM: 10, stepM: 5 }, [20, Number.NaN], null])
      expect(orbita({ levels })).toEqual({ error: 'invalid-levels' })
    // por contagem: começo e passo
    expect(orbita({ levels: { count: 3, startM: 10, stepM: 5 } }).stats.heights).toEqual([
      10, 15, 20,
    ])
  })

  test('no sentido contrário ao dos ponteiros, os pontos rodam ao contrário', () => {
    const rumo = (p, i) => turf.bearing(poi, p.waypoints[i].slice(0, 2))
    const dir = orbita({ clockwise: true })
    const inv = orbita({ clockwise: false })
    const passo = 360 / dir.stats.pointsPerOrbit
    const delta = (p) => ((rumo(p, 1) - rumo(p, 0) + 540) % 360) - 180
    expect(delta(dir)).toBeCloseTo(passo, 6)
    expect(delta(inv)).toBeCloseTo(-passo, 6)
  })

  test('sem velocidade não há tempo de voo; sem plano não há níveis', () => {
    expect(orbita({ speed: 0 }).stats.flightTimeS).toBeNull()
    expect(orbitLevelsToBlocks(null)).toEqual([])
    expect(orbitLevelsToBlocks({ waypoints: [[0, 0, 1]] })).toEqual([])
  })
})

describe('modo circular', () => {
  const field = rectangleFromAnchor([-8, 39.5], 131, 93, 0)
  const opts = (extra) => ({
    sensor,
    radiusM: 30,
    overlapPct: 50,
    altitude: 60,
    gimbalPitch: -45,
    frontOverlapPct: 80,
    speed: 8,
    ...extra,
  })

  test('um só círculo cabe na área: não há sobreposição que tire um, o mínimo é 0 %', () => {
    const pequeno = rectangleFromAnchor([-8, 39.5], 40, 40, 0)
    const a = overlapAdvice(pequeno, { radiusM: 100, overlapPct: 50 })
    expect(a).toMatchObject({ count: 1, cols: 1, rows: 1, minPct: 0 })
  })

  test('buracos partidos: a área conta sem eles, e o plano sai na mesma', () => {
    // um buraco com o primeiro vértice NaN não fecha (NaN não é igual a si
    // mesmo) e o polígono com ele é recusado
    const p = generateCircularPlan(
      field,
      opts({
        holes: [
          [
            [Number.NaN, 39.5],
            [-8, 39.5001],
            [-7.9999, 39.5001],
          ],
        ],
      }),
    )
    const inteira = generateCircularPlan(field, opts())
    expect(p.error).toBeUndefined()
    expect(p.stats.areaHa).toBeCloseTo(inteira.stats.areaHa, 9)
    expect(p.waypoints).toEqual(inteira.waypoints)
  })

  test('seguimento de terreno: sem plano ou sem relevo, nada; sem a lista dos círculos, um só', () => {
    const plan = generateCircularPlan(field, opts())
    expect(applyCircularTerrain(null, { elevationAt: () => 0, refElev: 0, agl: 60 })).toBeNull()
    expect(applyCircularTerrain(plan, { elevationAt: null, refElev: 0, agl: 60 })).toBeNull()
    // sem `circles`, o plano é um círculo: o ponto sem cota leva a mais alta de todos
    const semCirculos = { waypoints: plan.waypoints.slice(0, 4) }
    const cotas = [10, null, 30, 20]
    let i = 0
    const r = applyCircularTerrain(semCirculos, {
      elevationAt: () => cotas[i++],
      refElev: 0,
      agl: 60,
      speed: 8,
    })
    expect(r.missing).toBe(1)
    expect(r.waypoints.map((w) => w[2])).toEqual([70, 90, 90, 80])
  })

  test('blocos sem velocidade: o tempo a zero e a duração por saber; sem círculos, nenhum', () => {
    const plan = generateCircularPlan(field, opts())
    const b = circularBlocks(plan, null, { usableS: null, speed: 0 })
    expect(b).toHaveLength(1)
    expect(b[0].timeS).toBe(0)
    expect(b[0].durationS).toBeNull()
    expect(circularBlocks({ circles: [] }, null, { speed: 8 })).toEqual([])
  })
})
