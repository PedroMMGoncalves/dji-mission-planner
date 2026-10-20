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
  OPEN_CATEGORY_MAX_AGL_M,
} from '../../src/mission/preflight.js'
import { routeClearance } from '../../src/mission/clearance.js'
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
  test('M2-T1: um buraco do relevo debaixo da rota bloqueia, com a fracção e o sítio', () => {
    const c = {
      ...base(),
      terrainRoute: { covered: true, status: 'ready', source: 'global', error: null },
      terrainHoles: { samples: 95, noData: 5, at: { lon: -9.14, lat: 38.7, index: 3 } },
    }
    const it = preflightArea(c).find((i) => i.code === 'terrain-holes')
    expect(it?.level).toBe('block')
    expect(it.params).toMatchObject({ n: 5, total: 100, pct: 5 })
    // sem buracos nada; com o relevo a não cobrir a rota já bloqueia o outro item
    expect(
      codes(preflightArea({ ...c, terrainHoles: { samples: 100, noData: 0, at: null } })),
    ).not.toContain('terrain-holes')
    expect(
      codes(preflightArea({ ...c, terrainRoute: { ...c.terrainRoute, covered: false } })),
    ).not.toContain('terrain-holes')
  })

  test('M2-T3: o trânsito base ↔ rota que entra no relevo bloqueia; abaixo de 15 m avisa', () => {
    const t = { minM: -12.3, at: { leg: 'out' }, outHeightM: 110, backHeightM: 130, flight: 'B-3' }
    const bl = preflightArea({ ...base(), transitClearance: t }).find(
      (i) => i.code === 'transit-collision',
    )
    expect(bl?.level).toBe('block')
    expect(bl.params).toMatchObject({ m: 12.3, flight: 'B-3', h: 110 })
    const w = preflightArea({
      ...base(),
      transitClearance: { ...t, minM: 9, at: { leg: 'back' }, flight: null },
    }).find((i) => i.code === 'transit-low')
    expect(w?.level).toBe('warn')
    expect(w.params).toMatchObject({ m: 9, flight: '—', h: 130 })
    expect(codes(preflightArea({ ...base(), transitClearance: { ...t, minM: 40 } }))).not.toContain(
      'transit-low',
    )
    // também nos outros modos
    expect(codes(preflightPlan({ plan, transitClearance: t }))).toContain('transit-collision')
  })

  test('M2-T1: a zona da base de referência com pontos sem relevo avisa', () => {
    const zone = { radiusM: 100, requestedRadiusM: 100, reduced: false, partial: true, noData: 7 }
    const it = preflightArea({ ...base(), refZone: { label: 'A', zone } }).find(
      (i) => i.code === 'base-zone-partial',
    )
    expect(it?.level).toBe('warn')
    expect(it.params).toEqual({ base: 'A', n: 7 })
  })

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
      {
        level: 'block',
        code: 'plan-error',
        params: { error: 'too-many-lines', code: 'too-many-lines' },
      },
    ])
    // com a mensagem traduzida do modo (M3-U8) o texto deixa de ser o código
    const traduzido = preflightArea({
      ...base(),
      plan: { error: 'too-many-lines' },
      planErrorText: 'Demasiadas faixas.',
    })
    expect(traduzido[0].params).toEqual({ error: 'Demasiadas faixas.', code: 'too-many-lines' })
  })

  test('seguir terreno: relevo em falta e erro do cálculo bloqueiam; foto por waypoint já não', () => {
    const tf = { enabled: true, tolerance: 5 }
    // os pontos de foto entram na rota do relevo (mergePhotoWaypoints)
    expect(
      codes(
        preflightArea({ ...base(), terrainFollow: tf, terrainCovers: true, photoMode: 'waypoint' }),
      ),
    ).not.toContain('terrain-photo-waypoint')
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
    // sem reserva indicada não se desconta nada: o tempo útil já a inclui
    expect(usableBatteryMin(25)).toBe(25)
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

  test('foto por waypoint sem paragem: aviso ate um voo o confirmar', () => {
    const aviso = 'photo-pass-unverified'
    const wp = { ...base(), photoMode: 'waypoint' }
    expect(codes(preflightArea(wp))).toContain(aviso)
    expect(codes(preflightArea({ ...wp, waypointStops: 'corners' }))).toContain(aviso)
    expect(codes(preflightArea({ ...wp, waypointStops: 'all' }))).not.toContain(aviso)
    expect(codes(preflightArea(base()))).not.toContain(aviso)
    // com seguimento de terreno a combinacao ja esta bloqueada; nao se repete
    const tf = { ...wp, terrainFollow: { enabled: true } }
    expect(codes(preflightArea(tf))).not.toContain(aviso)
    // corredor
    expect(codes(preflightPlan({ plan, photoMode: 'waypoint' }))).toContain(aviso)
    const todos = { plan, photoMode: 'waypoint', waypointStops: 'all' }
    expect(codes(preflightPlan(todos))).not.toContain(aviso)
    expect(codes(preflightPlan({ plan }))).not.toContain(aviso)
    const msg = preflightDict[`preflight.${aviso}`]
    expect(msg?.pt && msg?.en).toBeTruthy()
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
      ...codes(
        preflightArea({
          ...base(),
          terrainFollow: { enabled: true },
          terrainCovers: true,
          terrainResult: { waypoints: plan.waypoints },
          terrainDatum: { kind: 'ellipsoidal', model: 'WGS84' },
        }),
      ),
      ...codes(
        preflightArea({
          ...base(),
          uncertainty: {
            belowMinimum: true,
            front: [55, 80],
            side: [45, 70],
            inputs: { mode: 'gnss' },
          },
          blur: [
            { exposureS: 1 / 1000, blurCm: 1, blurPx: 0.5 },
            { exposureS: 1 / 500, blurCm: 2, blurPx: 1.4 },
          ],
          route: {
            duplicates: [3],
            longSegments: [{ at: 5, lengthM: 6000 }],
            climb: [{ at: 7, rateMS: 9, dh: 30, lengthM: 20 }],
          },
        }),
      ),
    ])
    for (const code of all) {
      const entry = preflightDict[`preflight.${code}`]
      expect(entry, code).toBeTruthy()
      expect(typeof entry.pt).toBe('string')
      expect(typeof entry.en).toBe('string')
    }
    expect(all.size).toBe(18)
  })
})

describe('base longe, base sem relevo e folga ao solo', () => {
  test('base a mais de 2 km avisa; com transito acima da bateria bloqueia', () => {
    const longe = preflightArea({ ...base(), baseDistance: 3000 })
    expect(codes(longe)).toContain('base-far')
    expect(hasBlockers(longe)).toBe(false)
    // 30 min x 70 % = 21 min uteis; 2 x 12 km a 8 m/s = 50 min so de transito
    const inalcancavel = preflightArea({ ...base(), baseDistance: 12000 })
    expect(codes(inalcancavel)).toContain('base-unreachable')
    expect(codes(inalcancavel)).not.toContain('base-far')
    expect(hasBlockers(inalcancavel)).toBe(true)
    const perto = preflightArea({ ...base(), baseDistance: 500 })
    expect(codes(perto)).not.toContain('base-far')
  })
  test('base fora do relevo carregado avisa que se assumiu a minima da area', () => {
    const fora = { elev: 91, source: 'area-min', baseOutside: true, reliefM: 75 }
    const items = preflightArea({ ...base(), reference: fora })
    expect(codes(items)).toContain('base-no-terrain')
    expect(items.find((i) => i.code === 'base-no-terrain').params.elev).toBe(91)
    const dentro = { elev: 120, source: 'base', baseOutside: false, reliefM: 75 }
    expect(codes(preflightArea({ ...base(), reference: dentro }))).not.toContain('base-no-terrain')
  })
  test('sem base: lembrete em terreno plano, aviso com a cota assumida quando ha desnivel', () => {
    const plano = { elev: 100, source: 'area-min', baseOutside: false, reliefM: 4 }
    const semBasePlano = preflightArea({ ...base(), basePoint: null, reference: plano })
    expect(codes(semBasePlano)).toContain('no-base')
    expect(codes(semBasePlano)).not.toContain('no-base-relief')
    const acidentado = { elev: 91, source: 'area-min', baseOutside: false, reliefM: 75 }
    const semBaseRelevo = preflightArea({ ...base(), basePoint: null, reference: acidentado })
    expect(codes(semBaseRelevo)).toContain('no-base-relief')
    expect(codes(semBaseRelevo)).not.toContain('no-base')
    expect(hasBlockers(semBaseRelevo)).toBe(false)
    expect(semBaseRelevo.find((i) => i.code === 'no-base-relief').params).toEqual({
      elev: 91,
      relief: 75,
    })
    // sem relevo carregado nao ha cota assumida: fica o lembrete
    expect(codes(preflightArea({ ...base(), basePoint: null, reference: null }))).toContain(
      'no-base',
    )
  })
  test('rota que entra no relevo bloqueia; folga curta avisa; folga larga nada', () => {
    const colide = preflightArea({ ...base(), clearance: { minM: -12.4 } })
    expect(codes(colide)).toContain('terrain-collision')
    expect(hasBlockers(colide)).toBe(true)
    expect(colide.find((i) => i.code === 'terrain-collision').params.m).toBe(12.4)
    const curta = preflightArea({ ...base(), clearance: { minM: 9 } })
    expect(codes(curta)).toContain('clearance-low')
    expect(hasBlockers(curta)).toBe(false)
    const larga = preflightArea({ ...base(), clearance: { minM: 40 } })
    expect(codes(larga)).not.toContain('clearance-low')
    expect(codes(larga)).not.toContain('terrain-collision')
    expect(codes(preflightArea({ ...base(), clearance: null }))).not.toContain('clearance-low')
  })
  test('os outros modos tambem verificam a rota exportada', () => {
    const route = {
      duplicates: [3],
      longSegments: [],
      climb: [{ at: 5, rateMS: 9, dh: 30, lengthM: 20 }],
    }
    const items = preflightPlan({ plan, batteryMin: 30, reservePct: 30, route })
    expect(codes(items)).toContain('route-duplicate-waypoint')
    expect(codes(items)).toContain('route-climb-rate')
    expect(hasBlockers(items)).toBe(true)
  })
  test('os outros modos tambem bloqueiam a colisao com o relevo', () => {
    const items = preflightPlan({ plan, batteryMin: 30, reservePct: 30, clearance: { minM: -1 } })
    expect(codes(items)).toContain('terrain-collision')
  })
})

describe('nota da categoria aberta (120 m)', () => {
  const plano = {
    waypoints: [
      [0, 0, 100],
      [0.001, 0, 100],
    ],
    stats: { flightTimeS: 60 },
  }
  const codigos = (items) => items.map((i) => `${i.level}:${i.code}`)

  test('acima de 120 m acima do solo: so uma nota, nunca aviso nem bloqueio', () => {
    for (const fn of [
      preflightPlan,
      (c) => preflightArea({ ...c, terrainFollow: { enabled: false } }),
    ]) {
      const it = fn({ plan: plano, aglMaxM: 300.4 })
      const nota = it.find((i) => i.code === 'open-category-agl')
      expect(nota.level).toBe('info')
      expect(nota.params).toEqual({ max: 300, cap: OPEN_CATEGORY_MAX_AGL_M })
      expect(codigos(it).filter((c) => c.startsWith('block:'))).toEqual([])
    }
  })

  test('a 120 m ou menos, ou sem altura conhecida, nao ha nota', () => {
    for (const aglMaxM of [30, 80, 120, null, undefined, NaN]) {
      expect(codigos(preflightPlan({ plan: plano, aglMaxM }))).not.toContain(
        'info:open-category-agl',
      )
    }
  })

  test('a folga ao solo devolve tambem a maior altura acima do solo', () => {
    const plano2 = [
      [-9.14, 38.7, 100],
      [-9.13, 38.7, 100],
    ]
    // relevo a descer 50 m para leste: a rota fica a 150 m do solo no fim
    const elevationAt = (lon) => 200 - (lon + 9.14) * 5000
    const r = routeClearance(plano2, { elevationAt, refElev: 200 })
    expect(r.minM).toBeCloseTo(100, 0)
    expect(r.maxM).toBeCloseTo(150, 0)
  })
})

describe('nao ha missao sem relevo', () => {
  const tf = { enabled: true, tolerance: 5 }
  const route = (over) => ({
    covered: false,
    status: 'idle',
    source: null,
    error: null,
    ...over,
  })

  test('relevo a cobrir a rota: nada a dizer', () => {
    expect(codes(preflightArea({ ...base(), terrainRoute: route({ covered: true }) }))).toEqual([
      'heights-relative',
    ])
  })

  test('sem relevo sobre a rota bloqueia, e diz porque', () => {
    const one = (over) => {
      const items = preflightArea({ ...base(), terrainRoute: route(over) })
      expect(hasBlockers(items)).toBe(true)
      return items.filter((i) => i.level === 'block')
    }
    expect(codes(one({ status: 'idle' }))).toEqual(['terrain-missing'])
    expect(codes(one({ status: 'loading' }))).toEqual(['terrain-loading'])
    expect(one({ status: 'error', error: 'HTTP 503' })).toEqual([
      { level: 'block', code: 'terrain-download-error', params: { msg: 'HTTP 503' } },
    ])
    expect(codes(one({ status: 'ready', source: 'file' }))).toEqual(['terrain-file-outside'])
    // relevo global que nao chega a rota (geometria acabada de mudar)
    expect(codes(one({ status: 'ready' }))).toEqual(['terrain-missing'])
  })

  test('com seguimento de terreno, um so bloqueio e nao dois', () => {
    const items = preflightArea({ ...base(), terrainFollow: tf, terrainRoute: route() })
    expect(codes(items.filter((i) => i.level === 'block'))).toEqual(['terrain-missing'])
    const other = preflightPlan({
      plan,
      terrainFollow: tf,
      terrainCovers: false,
      terrainRoute: route({ status: 'loading' }),
    })
    expect(codes(other.filter((i) => i.level === 'block'))).toEqual(['terrain-loading'])
  })

  test('todos os modos: fachada e orbita tambem bloqueiam sem relevo', () => {
    const items = preflightPlan({ plan, terrainRoute: route() })
    expect(codes(items)).toContain('terrain-missing')
    expect(hasBlockers(preflightPlan({ plan, terrainRoute: route({ covered: true }) }))).toBe(false)
  })

  test('as mensagens novas existem em PT e EN, e sem o velho "sem relevo"', () => {
    for (const code of [
      'terrain-missing',
      'terrain-loading',
      'terrain-download-error',
      'terrain-file-outside',
    ]) {
      expect(preflightDict[`preflight.${code}`]?.pt).toBeTruthy()
      expect(preflightDict[`preflight.${code}`]?.en).toBeTruthy()
    }
    expect(preflightDict['preflight.no-base'].pt).not.toMatch(/sem relevo/)
    expect(preflightDict['preflight.no-base'].en).not.toMatch(/without terrain/)
  })
})

/* ---- revisão do código, pacote R-B ------------------------------------- */
describe('M3-U1: a fachada e o corredor no preflight', () => {
  const plan = { waypoints: [em(0, 0), em(10, 0), em(20, 0)], stats: { flightTimeS: 60 } }
  test('fachada: sem DSM local avisa; o corredor de voo a cortar o DSM bloqueia', () => {
    const semDsm = preflightPlan({ plan, faceDsmLoaded: false, faceClearance: null })
    expect(codes(semDsm)).toContain('face-unverified')
    expect(semDsm.find((i) => i.code === 'face-unverified').level).toBe('warn')
    const corta = preflightPlan({
      plan,
      faceDsmLoaded: true,
      faceClearance: { ok: false, passes: [3, 4], minClearanceM: 1.5 },
    })
    const it = corta.find((i) => i.code === 'face-clearance')
    expect(it.level).toBe('block')
    expect(it.params).toEqual({ passes: '3, 4', min: 1.5 })
    expect(hasBlockers(corta)).toBe(true)
    const ok = preflightPlan({
      plan,
      faceDsmLoaded: true,
      faceClearance: { ok: true, passes: [], minClearanceM: 12 },
    })
    expect(codes(ok)).not.toContain('face-clearance')
    expect(codes(ok)).not.toContain('face-unverified')
  })
  test('corredor: passagens sem cobertura avisam, com o número', () => {
    const it = preflightPlan({ plan, corridorDropped: 2 }).find(
      (i) => i.code === 'corridor-uncovered',
    )
    expect(it.level).toBe('warn')
    expect(it.params).toEqual({ n: 2 })
    expect(codes(preflightPlan({ plan, corridorDropped: 0 }))).not.toContain('corridor-uncovered')
  })
})

describe('M3-U3: a altura de regresso (RTH) no preflight', () => {
  test('o trânsito que entra no relevo diz o RTH do KMZ; acima de 120 m há a nota da categoria aberta', () => {
    const t = {
      minM: -3,
      at: { leg: 'out' },
      outHeightM: 40,
      backHeightM: 100,
      flight: 'A-1',
    }
    const it = preflightArea({ ...base(), transitClearance: t, rthHeightM: 130 })
    expect(it.find((i) => i.code === 'transit-collision').params).toMatchObject({ rth: 130 })
    const nota = it.find((i) => i.code === 'open-category-rth')
    expect(nota.level).toBe('info')
    expect(nota.params).toEqual({ rth: 130, cap: OPEN_CATEGORY_MAX_AGL_M })
    expect(codes(preflightArea({ ...base(), rthHeightM: 120 }))).not.toContain('open-category-rth')
    expect(codes(preflightArea({ ...base(), rthHeightM: null }))).not.toContain('open-category-rth')
  })
})

describe('M3-U4: um só identificador de voo nos textos', () => {
  test('o aviso da bateria por bloco diz o rótulo do voo (o do mapa e do ficheiro), não o id da célula', () => {
    // células 1, 2, 4, 5 (a 3 desactivada): o quadrado da célula 4 é o voo 3
    const blocks = [1, 2, 4, 5].map((id) => ({
      id,
      waypoints: plan.waypoints,
      timeS: 60 * 60,
      transitS: 0,
    }))
    const labels = { 1: '1', 2: '2', 4: '3', 5: '4' }
    const items = preflightArea({
      ...base(),
      blocks,
      blockFlightLabels: labels,
      batteryMin: 30,
      reservePct: 0,
    })
    const bat = items.filter((i) => i.code === 'battery-block')
    expect(bat.map((i) => i.params.flight)).toEqual(['1', '2', '3', '4'])
    expect(bat.map((i) => i.params.id)).toEqual([1, 2, 4, 5])
    // sem rótulos (não devia acontecer), o id
    const semRotulos = preflightArea({ ...base(), blocks, batteryMin: 30, reservePct: 0 })
    expect(
      semRotulos.filter((i) => i.code === 'battery-block').map((i) => i.params.flight),
    ).toEqual(['1', '2', '4', '5'])
  })
})

describe('M3-U8: mensagens que dizem onde e o quê', () => {
  test('os itens de rota dão o voo e as coordenadas do waypoint, não o índice', () => {
    const pts = [em(0, 0), em(10, 0), em(20, 0), em(30, 0), em(40, 0), em(50, 0)]
    const c = {
      ...base(),
      route: {
        duplicates: [4],
        longSegments: [{ at: 2, lengthM: 6000 }],
        climb: [{ at: 1, rateMS: 9, dh: 20, lengthM: 10 }],
      },
      routePoints: pts,
      flightOfIndex: (i) => (i < 3 ? 'A-1' : 'B-2'),
    }
    const items = preflightArea(c)
    const dup = items.find((i) => i.code === 'route-duplicate-waypoint')
    expect(dup.params).toMatchObject({ n: 1, at: 4, flight: 'B-2', lat: pts[4][1].toFixed(5) })
    expect(dup.params.lon).toBe(pts[4][0].toFixed(5))
    expect(items.find((i) => i.code === 'route-long-segment').params).toMatchObject({
      km: '6.0',
      flight: 'A-1',
    })
    expect(items.find((i) => i.code === 'route-climb-rate').params).toMatchObject({
      rate: '9.0',
      flight: 'A-1',
      n: 1,
    })
    // rota única, sem blocos: o voo é o 1
    const unica = preflightArea({ ...c, flightOfIndex: null })
    expect(unica.find((i) => i.code === 'route-duplicate-waypoint').params.flight).toBe('1')
    // nenhuma mensagem do preflight fala em «índice»
    for (const [k, v] of Object.entries(preflightDict)) {
      expect(`${k}: ${v.pt}`).not.toMatch(/índice/i)
      expect(`${k}: ${v.en}`).not.toMatch(/\bindex\b/i)
    }
  })
  test('plan-error: cada código de erro dos modos tem texto no dicionário, e a mensagem não mostra o código', async () => {
    const { readFileSync } = await import('node:fs')
    const dict = (await import('../../src/i18n/dict.missionModes.js')).default
    const cp = (await import('../../src/i18n/dict.controlPanel.js')).default
    const codesIn = (file) =>
      [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/error: '([a-z-]+)'/g)].map(
        (m) => m[1],
      )
    const families = [
      ['../../src/utils/faceMode.js', (c) => dict[`fp.error.${c}`]],
      ['../../src/utils/corridor.js', (c) => dict[`co.err.${c}`]],
      // o circular tem erros do plano (ci.err) e do relevo (ci.terrain.err)
      ['../../src/utils/circular.js', (c) => dict[`ci.err.${c}`] ?? dict[`ci.terrain.err.${c}`]],
      ['../../src/utils/orbit.js', (c) => dict[`orb.err.${c}`]],
      [
        '../../src/utils/geo.js',
        // too-many-cells é o erro do mosaico (tilesError), dito no cartão 4
        (c) =>
          c === 'too-many-lines'
            ? cp['cp.area.tooManyLines']
            : c === 'too-many-cells'
              ? cp['cp.split.tooManyCellsTile']
              : cp[`cp.area.planError.${c}`],
      ],
      [
        '../../src/mission/areaPlan.js',
        (c) => (c === 'too-many-lines' ? cp['cp.area.tooManyLines'] : cp[`cp.area.planError.${c}`]),
      ],
    ]
    let n = 0
    for (const [file, lookup] of families) {
      for (const code of new Set(codesIn(file))) {
        n += 1
        const entry = lookup(code)
        expect(entry, `${file}: ${code}`).toBeTruthy()
        expect(entry.pt).not.toMatch(/\([a-z]+(-[a-z]+)+\)/)
      }
    }
    expect(n).toBeGreaterThan(10)
    // a mensagem traduzida entra inteira no item; o código fica à parte
    const item = preflightPlan({ plan: { error: 'standoff-corner' }, planErrorText: 'Texto.' })[0]
    expect(item.params).toEqual({ error: 'Texto.', code: 'standoff-corner' })
    expect(preflightDict['preflight.plan-error'].pt).not.toMatch(/\(\{error\}\)/)
  })
})
