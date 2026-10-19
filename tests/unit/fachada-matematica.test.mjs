/*
 * Fachada depois da revisao da matematica (docs/REVISAO-MATEMATICA-2026-10.md):
 * M2-E2, a banda vista na face com a camara inclinada; M2-E3, a linha
 * afastada com a junta do corredor e a recusa quando um canto ou um troco
 * curto nao deixam manter o afastamento.
 */
import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { STANDOFF_MIN_FRAC, generateFacePlan } from '../../src/utils/faceMode.js'
import { resolveSensor } from '../../src/utils/geo.js'

const lat = 38.7
const mLon = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat + y / 110574]
const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const face = [em(0, 0), em(60, 0)]
const plano = (over = {}) =>
  generateFacePlan(face, {
    sensor,
    faceHeightM: 30,
    standoffM: 25,
    verticalOverlapPct: 70,
    horizontalOverlapPct: 70,
    ...over,
  })

describe('M2-E2: a banda vista na face com a camara inclinada', () => {
  test('nivelada: a banda e simetrica e as passagens vao do pe ao topo (como antes)', () => {
    const r = plano({ gimbalPitch: 0 })
    expect(r.stats.bandBottomM).toBeCloseTo(-r.stats.bandTopM, 6)
    expect(r.stats.imageHeightM).toBeCloseTo(2 * r.stats.bandTopM, 6)
    expect(r.stats.heights[0] + r.stats.bandBottomM).toBeCloseTo(0, 6)
    expect(r.stats.heights.at(-1) + r.stats.bandTopM).toBeCloseTo(30, 6)
    expect(r.stats.uncoveredBottomM).toBe(0)
  })

  test('a -20 graus a banda sobe menos e desce mais; o topo continua coberto e o GSD piora 1/cos', () => {
    const nivel = plano({ gimbalPitch: 0 })
    const r = plano({ gimbalPitch: -20 })
    const v = Math.atan(sensor.sensorHeight / (2 * sensor.focalLength))
    const p = (-20 * Math.PI) / 180
    expect(r.stats.bandTopM).toBeCloseTo(25 * Math.tan(p + v), 6)
    expect(r.stats.bandBottomM).toBeCloseTo(25 * Math.tan(p - v), 6)
    // o topo da face fica dentro da banda da ultima passagem
    expect(r.stats.heights.at(-1) + r.stats.bandTopM).toBeGreaterThanOrEqual(30 - 1e-6)
    // e o pe dentro da primeira (sem piso: a face cabe numa imagem)
    expect(r.stats.heights[0] + r.stats.bandBottomM).toBeLessThanOrEqual(0 + 1e-6)
    expect(r.stats.gsdCm).toBeCloseTo(nivel.stats.gsdCm / Math.cos(p), 3)
    for (const w of r.perWaypoint) expect(w.gimbalPitch).toBe(-20)
  })

  test('a +20 graus com o piso de 5 m a passagem fica no piso e o pe por cobrir e dito', () => {
    const r = plano({ gimbalPitch: 20, minHeightM: 5 })
    expect(r.stats.heights).toEqual([5])
    expect(r.stats.uncoveredBottomM).toBeCloseTo(5 + r.stats.bandBottomM, 6)
    expect(r.stats.uncoveredBottomM).toBeGreaterThan(0)
  })

  test('inclinacao que ja nao ve a face e recusada', () => {
    expect(plano({ gimbalPitch: -80 }).error).toBe('pitch-too-steep')
    expect(plano({ gimbalPitch: 45 }).error).toBeUndefined()
  })
})

describe('M2-E3: a linha afastada mantem o afastamento em todos os cantos', () => {
  const dmin = (r, base) => {
    const line = turf.lineString(base)
    return Math.min(
      ...r.offsetLine.map((p) =>
        turf.pointToLineDistance(turf.point(p), line, { units: 'meters' }),
      ),
    )
  }
  const ok = (base, side = 'left') =>
    generateFacePlan(base, { sensor, faceHeightM: 20, standoffM: 25, side })

  test('canto convexo de 150 graus: arco a 25 m do vertice, nunca a menos', () => {
    // deflexao de 150 graus (quase uma inversao)
    const base = [em(0, 0), em(100, 0), em(100 - 100 * Math.cos(Math.PI / 6), 50)]
    for (const side of ['left', 'right']) {
      const r = ok(base, side)
      expect(r.error).toBeUndefined()
      expect(dmin(r, base)).toBeGreaterThanOrEqual(25 * STANDOFF_MIN_FRAC)
    }
  })

  test('canto convexo de 90 graus: o arco leva o rumo ao vertice', () => {
    const base = [em(0, 0), em(100, 0), em(100, 100)]
    // lado direito da linha (0,0)->(100,0)->(100,100): o sul/leste, convexo
    const r = ok(base, 'right')
    expect(r.error).toBeUndefined()
    expect(dmin(r, base)).toBeGreaterThanOrEqual(25 * STANDOFF_MIN_FRAC)
    // rumos entre 270 (a olhar para oeste... ) e 0: a meio do arco, ~315 nao: o
    // rumo aponta a face; no arco do vertice (100,0) os rumos passam por ~315
    const rumos = r.perWaypoint.slice(0, r.stats.pointsPerPass).map((w) => w.heading)
    expect(rumos.some((h) => h > 300 && h < 330)).toBe(true)
  })

  test('U de 40 x 60 voado por dentro com 25 m: recusado; por fora: aceite', () => {
    const U = [em(0, 0), em(0, 60), em(40, 60), em(40, 0)]
    expect(ok(U, 'right').error).toBe('standoff-corner')
    const fora = ok(U, 'left')
    expect(fora.error).toBeUndefined()
    expect(dmin(fora, U)).toBeGreaterThanOrEqual(25 * STANDOFF_MIN_FRAC)
  })

  test('V agudo (30 graus de abertura): por dentro a esquadria afasta-se ate manter os 25 m', () => {
    const V = [
      em(100 - 100 * Math.cos(Math.PI / 12), 100 * Math.sin(Math.PI / 12)),
      em(100, 0),
      em(100 - 100 * Math.cos(Math.PI / 12), -100 * Math.sin(Math.PI / 12)),
    ]
    for (const side of ['left', 'right']) {
      const r = ok(V, side)
      expect(r.error).toBeUndefined()
      expect(dmin(r, V)).toBeGreaterThanOrEqual(25 * STANDOFF_MIN_FRAC)
    }
  })

  test('o L de 300 m de sempre continua a sair', () => {
    const L = [em(0, 0), em(300, 0), em(300, 300)]
    for (const side of ['left', 'right']) {
      const r = generateFacePlan(L, { sensor, faceHeightM: 30, standoffM: 25, side })
      expect(r.error).toBeUndefined()
      expect(dmin(r, L)).toBeGreaterThanOrEqual(25 * STANDOFF_MIN_FRAC)
    }
  })
})
