/**
 * Preflight único antes de exportar (src/mission/preflight.js): bloqueios,
 * avisos e lembretes calculados de um estado como o da aplicação.
 */
import { describe, expect, test } from 'vitest'
import {
  hasBlockers,
  preflightArea,
  preflightCounts,
  preflightPlan,
  usableBatteryMin,
  WPML_MAX_WAYPOINTS,
} from '../../src/mission/preflight.js'
import { generateFlightPlan } from '../../src/utils/geo.js'
import preflightDict from '../../src/i18n/dict.preflight.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const ring = [em(0, 0), em(600, 0), em(600, 400), em(0, 400)]
const opts = {
  spacingM: 40,
  angleDeg: 90,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 8,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
}
const plan = generateFlightPlan(ring, opts)
const codes = (items) => items.map((i) => i.code)
const base = () => ({
  plan,
  blocks: null,
  photoMode: 'distance',
  terrainFollow: { enabled: false, tolerance: 5 },
  terrainCovers: false,
  terrainResult: null,
  basePoint: em(-50, -50),
  baseDistance: 70,
  speed: 8,
  batteryMin: 30,
  reservePct: 30,
  aglWarn: null,
  triggerWarn: null,
})

describe('preflightArea', () => {
  test('plano válido, curto e com base: só o lembrete das alturas', () => {
    expect(plan.error).toBeUndefined()
    const items = preflightArea(base())
    expect(codes(items)).toEqual(['heights-relative'])
    expect(hasBlockers(items)).toBe(false)
  })

  test('sem plano ou com erro: um bloqueio e mais nada', () => {
    expect(codes(preflightArea({ ...base(), plan: null }))).toEqual(['no-plan'])
    const items = preflightArea({ ...base(), plan: { error: 'too-many-lines' } })
    expect(items).toEqual([
      { level: 'block', code: 'plan-error', params: { error: 'too-many-lines' } },
    ])
  })

  test('seguir terreno: foto por waypoint, relevo em falta e erro do cálculo bloqueiam', () => {
    const tf = { enabled: true, tolerance: 5 }
    expect(codes(preflightArea({ ...base(), terrainFollow: tf, photoMode: 'waypoint' }))).toContain(
      'terrain-photo-waypoint',
    )
    expect(codes(preflightArea({ ...base(), terrainFollow: tf, terrainCovers: false }))).toContain(
      'terrain-not-loaded',
    )
    const err = preflightArea({
      ...base(),
      terrainFollow: tf,
      terrainCovers: true,
      terrainResult: { error: 'Ref fora' },
    })
    expect(err.find((i) => i.code === 'terrain-error').params.msg).toBe('Ref fora')
    // terreno bom: nenhum bloqueio
    const ok = preflightArea({
      ...base(),
      terrainFollow: tf,
      terrainCovers: true,
      terrainResult: { waypoints: plan.waypoints, blocks3: null },
    })
    expect(hasBlockers(ok)).toBe(false)
  })

  test('waypoints: aviso acima de 2000 numa rota, bloqueio acima do limite WPML; blocos contam o maior', () => {
    const many = { ...plan, waypoints: Array.from({ length: 2500 }, () => em(0, 0)) }
    expect(codes(preflightArea({ ...base(), plan: many }))).toContain('waypoints-many')
    const huge = {
      ...plan,
      waypoints: Array.from({ length: WPML_MAX_WAYPOINTS + 1 }, () => em(0, 0)),
    }
    expect(codes(preflightArea({ ...base(), plan: huge }))).toContain('too-many-waypoints')
    // dividido em blocos pequenos, a mesma missão deixa de bloquear
    const blocks = [
      { id: 1, waypoints: huge.waypoints.slice(0, 100), timeS: 60, transitS: 0 },
      { id: 2, waypoints: huge.waypoints.slice(0, 100), timeS: 60, transitS: 0 },
    ]
    expect(hasBlockers(preflightArea({ ...base(), plan: huge, blocks }))).toBe(false)
    // com terrain follow conta a rota densificada
    const tfItems = preflightArea({
      ...base(),
      terrainFollow: { enabled: true, tolerance: 5 },
      terrainCovers: true,
      terrainResult: { waypoints: many.waypoints, blocks3: null },
    })
    expect(codes(tfItems)).toContain('waypoints-many')
  })

  test('bateria: tempo mais trânsito acima do útil avisa; por bloco identifica o bloco', () => {
    const usable = usableBatteryMin(30, 30)
    expect(usable).toBeCloseTo(21)
    const longo = { ...plan, stats: { ...plan.stats, flightTimeS: 25 * 60 } }
    const it = preflightArea({ ...base(), plan: longo }).find((i) => i.code === 'battery')
    expect(it).toBeTruthy()
    expect(it.params.usable).toBe(21)
    expect(it.params.min).toBeGreaterThan(25)
    const blocks = [
      { id: 1, waypoints: [], timeS: 10 * 60, transitS: 30 },
      { id: 2, waypoints: [], timeS: 22 * 60, transitS: 30 },
    ]
    const bl = preflightArea({ ...base(), plan: longo, blocks }).filter(
      (i) => i.code === 'battery-block',
    )
    expect(bl.map((i) => i.params.id)).toEqual([2])
    expect(usableBatteryMin(0)).toBeNull()
  })

  test('avisos passados (tecto AGL, obturador) e lembrete sem base', () => {
    const items = preflightArea({
      ...base(),
      basePoint: null,
      baseDistance: null,
      aglWarn: { cap: 100, worstAgl: 105.4 },
      triggerWarn: { actualS: 0.5, minS: 0.7, maxSpeed: 7.1 },
    })
    expect(codes(items)).toEqual(['agl-cap', 'shutter', 'no-base', 'heights-relative'])
    expect(items[0].params).toEqual({ cap: 100, worst: 105 })
    expect(preflightCounts(items)).toEqual({ block: 0, warn: 2, info: 2 })
  })

  test('preflightPlan (outros modos): mesmas regras sem terreno nem base', () => {
    expect(codes(preflightPlan({ plan: null }))).toEqual(['no-plan'])
    expect(codes(preflightPlan({ plan: { error: 'x' } }))).toEqual(['plan-error'])
    expect(codes(preflightPlan({ plan, batteryMin: 30, reservePct: 30 }))).toEqual([
      'heights-relative',
    ])
    const longo = { ...plan, stats: { ...plan.stats, flightTimeS: 40 * 60 } }
    expect(codes(preflightPlan({ plan: longo, batteryMin: 30, reservePct: 30 }))).toContain(
      'battery',
    )
  })

  test('todos os códigos têm mensagem em PT e EN', () => {
    const all = new Set([
      ...codes(preflightArea({ ...base(), plan: null })),
      ...codes(preflightArea({ ...base(), plan: { error: 'e' } })),
      ...codes(
        preflightArea({ ...base(), terrainFollow: { enabled: true }, photoMode: 'waypoint' }),
      ),
      ...codes(preflightArea({ ...base(), terrainFollow: { enabled: true } })),
      ...codes(
        preflightArea({
          ...base(),
          terrainFollow: { enabled: true },
          terrainCovers: true,
          terrainResult: { error: 'e' },
        }),
      ),
      ...codes(
        preflightArea({
          ...base(),
          plan: { ...plan, waypoints: Array(WPML_MAX_WAYPOINTS + 1).fill(em(0, 0)) },
        }),
      ),
      ...codes(
        preflightArea({ ...base(), plan: { ...plan, waypoints: Array(2500).fill(em(0, 0)) } }),
      ),
      ...codes(
        preflightArea({
          ...base(),
          basePoint: null,
          aglWarn: { cap: 1, worstAgl: 2 },
          triggerWarn: { actualS: 1, minS: 1, maxSpeed: 1 },
        }),
      ),
      ...codes(preflightArea({ ...base(), plan: { ...plan, stats: { flightTimeS: 1e5 } } })),
      ...codes(
        preflightArea({
          ...base(),
          plan: { ...plan, stats: { flightTimeS: 1e5 } },
          blocks: [{ id: 1, waypoints: [], timeS: 1e5 }],
        }),
      ),
    ])
    for (const code of all) {
      const entry = preflightDict[`preflight.${code}`]
      expect(entry, code).toBeTruthy()
      expect(typeof entry.pt).toBe('string')
      expect(typeof entry.en).toBe('string')
    }
    expect(all.size).toBe(13)
  })
})
