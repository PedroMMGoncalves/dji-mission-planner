/**
 * Preflight, casos raros (src/mission/preflight.js e preflightFor.js): os
 * limites de waypoints, o tecto AGL e o obturador também nos outros modos,
 * cada um com o seu aviso de disparo; o corredor partido em voos (o pior voo
 * com o trânsito da sua base); a zona da base de referência no corredor e
 * no circular; a fachada com e sem DSM e a descolagem numa base que já não
 * existe; a área com bases por bloco (bloco sem base, base sem relevo, voo
 * que a base não alcança) e o que falta nos dados (sem coordenadas do
 * buraco, sem a distância a que o relevo tapa, sem o modelo do datum).
 */
import { describe, expect, test } from 'vitest'
import {
  WAYPOINT_SOFT_LIMIT,
  WPML_MAX_WAYPOINTS,
  hasBlockers,
  preflightArea,
  preflightPlan,
} from '../../src/mission/preflight.js'
import { preflightFor } from '../../src/mission/preflightFor.js'
import { planForTakeoff, takeoffReference } from '../../src/mission/takeoffRef.js'
import { translate } from '../../src/i18n.jsx'
import { metersPerDegLon } from '../../src/utils/units.js'

const P = {
  waypoints: [
    [-7.2, 40.4, 100],
    [-7.199, 40.4, 100],
  ],
  lines: [
    [
      [-7.2, 40.4],
      [-7.199, 40.4],
    ],
  ],
  stats: { flightTimeS: 100, pathLengthM: 100, photoCount: 5 },
}
const ctx = {
  batteryMin: 20,
  reservePct: 0,
  speed: 8,
  corridorSpeed: 8,
  circularSpeed: 8,
  vlosM: 500,
}
const codes = (items) => items.map((i) => i.code)
const find = (items, code) => items.find((i) => i.code === code)
const wps = (n) => Array.from({ length: n }, (_, i) => [-7.2 + i * 1e-5, 40.4, 100])
const pt = (key, v) => translate('pt', key, v)

describe('outros modos: os mesmos limites da área', () => {
  test('waypoints: acima de 2000 avisa, acima do limite do WPML bloqueia', () => {
    const muitos = preflightPlan({ plan: { ...P, waypoints: wps(WAYPOINT_SOFT_LIMIT + 1) } })
    expect(find(muitos, 'waypoints-many')).toMatchObject({ level: 'warn', params: { n: 2001 } })
    expect(hasBlockers(muitos)).toBe(false)
    const demais = preflightPlan({ plan: { ...P, waypoints: wps(WPML_MAX_WAYPOINTS + 1) } })
    expect(find(demais, 'too-many-waypoints')).toMatchObject({
      level: 'block',
      params: { n: 65536, max: 65535 },
    })
    expect(codes(demais)).not.toContain('waypoints-many')
    // no limite ainda passa; um plano sem lista de waypoints conta zero
    expect(codes(preflightPlan({ plan: { ...P, waypoints: wps(WAYPOINT_SOFT_LIMIT) } }))).toEqual([
      'heights-relative',
    ])
    expect(codes(preflightPlan({ plan: { stats: {} } }))).toEqual(['heights-relative'])
  })

  test('tecto AGL e obturador: cada modo lê o seu aviso de disparo', () => {
    const aglWarn = { cap: 100, worstAgl: 104.6 }
    const trigger = { actualS: 0.812, minS: 1.25, maxSpeed: 5.56 }
    const corredor = preflightFor('corridor', {
      ...ctx,
      corridorPlan: P,
      aglWarn,
      corridorTriggerWarn: trigger,
    })
    expect(find(corredor, 'agl-cap').params).toEqual({ cap: 100, worst: 105 })
    expect(find(corredor, 'shutter').params).toEqual({ s: '0.81', min: '1.3', vmax: '5.6' })
    expect(pt('preflight.shutter', find(corredor, 'shutter').params)).toContain('≤ 5.6 m/s')
    // o aviso de disparo da área não conta na órbita nem no circular
    for (const [modo, chave, propria] of [
      ['orbit', 'orbitPlan', 'orbitTriggerWarn'],
      ['circular', 'circularPlan', 'circularTriggerWarn'],
    ]) {
      const s = { ...ctx, [chave]: P, triggerWarn: trigger }
      expect(codes(preflightFor(modo, s)), modo).not.toContain('shutter')
      expect(codes(preflightFor(modo, { ...s, [propria]: trigger })), modo).toContain('shutter')
    }
    // a fachada não tem disparo por distância nem tecto AGL
    expect(
      codes(preflightFor('face', { ...ctx, facePlan: P, triggerWarn: trigger })),
    ).not.toContain('shutter')
  })
})

describe('bateria do corredor partido em voos', () => {
  test('o pior voo com o trânsito da sua base, não o tempo da rota inteira', () => {
    const s = {
      ...ctx,
      corridorPlan: P,
      corridorRouteOps: { transitS: 60, worstFlightS: 25 * 60 },
    }
    expect(find(preflightFor('corridor', s), 'battery').params).toEqual({ min: 25, usable: 20 })
    // sem o pior voo: o voo mais longo do plano, com o trânsito da base
    const longo = { ...P, stats: { ...P.stats, longestFlightS: 19 * 60 } }
    const r = preflightFor('corridor', {
      ...ctx,
      corridorPlan: longo,
      corridorRouteOps: { transitS: 120 },
    })
    expect(find(r, 'battery').params).toEqual({ min: 21, usable: 20 })
    // sem trânsito conhecido nem base, o voo mais longo só por si cabe
    expect(codes(preflightFor('corridor', { ...ctx, corridorPlan: longo }))).not.toContain(
      'battery',
    )
  })

  test('o alcance visual do pior ponto da rota única, contra o da aeronave', () => {
    const s = { ...ctx, corridorPlan: P, corridorRouteOps: { vlosWorstM: 640.4 } }
    expect(find(preflightFor('corridor', s), 'route-vlos').params).toEqual({ m: 640, vlos: 500 })
    const c = { ...ctx, circularPlan: P, circularRouteOps: { vlosWorstM: 480 } }
    expect(codes(preflightFor('circular', c))).not.toContain('route-vlos')
  })
})

describe('zona da base de referência no corredor e no circular', () => {
  const zona = (extra) => ({ radiusM: 60, requestedRadiusM: 100, reduced: true, ...extra })

  test('reduzida com o voo mais baixo: aviso com quanto baixaria', () => {
    const s = {
      ...ctx,
      corridorPlan: P,
      corridorBase: { point: [-7.2, 40.4], label: 'B' },
      corridorBaseDistance: 10,
      corridorReference: { zone: zona({ cause: { belowM: 6.4, reliefM: 14.2, atM: 70 } }) },
    }
    expect(find(preflightFor('corridor', s), 'base-zone-drop')).toEqual({
      level: 'warn',
      code: 'base-zone-drop',
      params: { base: 'B', r: 60, req: 100, relief: 14, at: 70, drop: 6 },
    })
  })

  test('sem raio: aviso próprio; sem causa: nota com o desnível da zona e o raio', () => {
    const zero = preflightFor('circular', {
      ...ctx,
      circularPlan: P,
      circularBase: { point: [-7.2, 40.4] },
      circularReference: { zone: zona({ radiusM: 0, cause: { belowM: 3, reliefM: 9, atM: 5 } }) },
    })
    // a base sem rótulo fica com o nome vazio
    expect(find(zero, 'base-zone-zero').params).toMatchObject({ base: '', r: 0, drop: 3 })
    const semCausa = preflightFor('circular', {
      ...ctx,
      circularPlan: P,
      circularBase: { point: [-7.2, 40.4], label: 'C' },
      circularReference: { zone: zona({ reliefM: 11.6 }) },
    })
    expect(find(semCausa, 'base-zone-reduced')).toMatchObject({
      level: 'info',
      params: { base: 'C', relief: 12, at: 60, drop: 0 },
    })
  })

  test('zona com pontos sem relevo avisa; sem zona, nada da zona', () => {
    const parcial = preflightFor('corridor', {
      ...ctx,
      corridorPlan: P,
      corridorBase: { point: [-7.2, 40.4], label: 'A' },
      corridorReference: { zone: { radiusM: 100, partial: true, noData: 7 } },
    })
    expect(find(parcial, 'base-zone-partial').params).toEqual({ base: 'A', n: 7 })
    const semZona = preflightFor('corridor', {
      ...ctx,
      corridorPlan: P,
      corridorReference: { elev: 120, source: 'area-min' },
    })
    expect(codes(semZona).filter((c) => c.startsWith('base-zone'))).toEqual([])
  })
})

describe('seguimento de terreno no corredor', () => {
  test('pedido sem relevo que cubra: bloqueia; com erro do cálculo: bloqueia com a mensagem', () => {
    const s = { ...ctx, corridorPlan: P, terrainFollow: { enabled: true } }
    expect(find(preflightFor('corridor', s), 'terrain-not-loaded').level).toBe('block')
    const erro = preflightFor('corridor', {
      ...s,
      corridorCovers: true,
      corridorTerrain: { error: 'terrain-failed' },
    })
    expect(find(erro, 'terrain-error').params).toEqual({ msg: 'terrain-failed' })
    // com o relevo em falta sobre a rota, um só bloqueio
    const semRelevo = preflightFor('corridor', {
      ...s,
      terrainRoute: { covered: false, status: 'idle', source: null, error: null },
    })
    expect(codes(semRelevo).filter((c) => c.startsWith('terrain'))).toEqual(['terrain-missing'])
  })
})

describe('fachada e órbita', () => {
  test('fachada: sem DSM avisa; com DSM, o corredor a cortar a superfície bloqueia', () => {
    const corte = { ok: false, passes: [1, 3], minClearanceM: -2.5 }
    const semDsm = preflightFor('face', {
      ...ctx,
      facePlan: P,
      dsmLoaded: false,
      faceClearance: corte,
    })
    expect(codes(semDsm)).toContain('face-unverified')
    expect(codes(semDsm)).not.toContain('face-clearance')
    const comDsm = preflightFor('face', {
      ...ctx,
      facePlan: P,
      dsmLoaded: true,
      faceClearance: corte,
    })
    expect(find(comDsm, 'face-clearance')).toMatchObject({
      level: 'block',
      params: { passes: '1, 3', min: -2.5 },
    })
    expect(codes(comDsm)).not.toContain('face-unverified')
    // sem a lista das passagens, o texto não fica com «undefined»
    const semLista = preflightPlan({ plan: P, faceClearance: { ok: false, minClearanceM: -1 } })
    expect(find(semLista, 'face-clearance').params.passes).toBe('')
    // plano da fachada com erro: só o erro
    const erro = preflightFor('face', {
      ...ctx,
      facePlan: { error: 'standoff-corner' },
      dsmLoaded: false,
      planErrorText: 'Canto apertado',
    })
    expect(erro).toEqual([
      {
        level: 'block',
        code: 'plan-error',
        params: { error: 'Canto apertado', code: 'standoff-corner' },
      },
    ])
  })

  test('descolagem numa base que já não existe, ou sem relevo: bloqueia com o nome da base', () => {
    const bases = [{ id: 'b1', label: 'A', point: [-7.21, 40.4] }]
    const sumiu = takeoffReference({ baseId: 'b9', bases, targetPoint: [-7.2, 40.4] })
    expect(sumiu.error).toBe('base-missing')
    const face = preflightFor('face', { ...ctx, facePlan: P, faceTakeoff: sumiu })
    expect(find(face, 'takeoff-base-missing')).toMatchObject({
      level: 'block',
      params: { base: '' },
    })
    const semRelevo = takeoffReference({ baseId: 'b1', bases, targetPoint: [-7.2, 40.4] })
    expect(semRelevo.error).toBe('terrain-missing')
    const orbita = preflightFor('orbit', { ...ctx, orbitPlan: P, orbitTakeoff: semRelevo })
    expect(find(orbita, 'takeoff-terrain-missing').params).toEqual({ base: 'A' })
    // sem lista de bases é o mesmo que a base ter desaparecido
    expect(takeoffReference({ baseId: 'b1', bases: null }).error).toBe('base-missing')
  })

  test('cota da base: a mínima da zona de descolagem; sem configuração da zona, a do ponto', () => {
    // encosta a subir para leste, 1 m em cada 10 m; o alvo 500 m a leste
    const mLon = metersPerDegLon(40.4)
    const elevationAt = (lon) => 200 + ((lon + 7.2) * mLon) / 10
    const bases = [{ id: 'b1', label: 'A', point: [-7.2, 40.4] }]
    const targetPoint = [-7.2 + 500 / mLon, 40.4]
    const zoneConfig = { radiusM: 50, maxReliefM: 10 }
    const comZona = takeoffReference({ baseId: 'b1', bases, targetPoint, elevationAt, zoneConfig })
    const soPonto = takeoffReference({ baseId: 'b1', bases, targetPoint, elevationAt })
    expect(soPonto.baseElev).toBeCloseTo(200, 6)
    expect(soPonto.dh).toBeCloseTo(50, 6)
    // descolando em qualquer sítio da zona, o voo nunca fica abaixo do planeado
    expect(comZona.baseElev).toBeCloseTo(195, 0)
    expect(comZona.dh).toBeCloseTo(55, 0)
    // as alturas do plano somam a diferença; sem alturas por passagem, ficam
    const plano = {
      waypoints: [
        [-7.2, 40.4, 30],
        [-7.2, 40.4],
      ],
      stats: { heights: null },
    }
    const out = planForTakeoff(plano, soPonto)
    expect(out.waypoints.map((w) => w[2])).toEqual([80, 50])
    expect(out.stats.heights).toBeNull()
    expect(planForTakeoff({ waypoints: [[-7.2, 40.4, 30]] }, soPonto).stats).toBeUndefined()
  })

  test('combinação sem voo confirmado: os campos que faltam ficam vazios', () => {
    const items = preflightPlan({ plan: P, unverified: { aircraft: 'M4T' } })
    expect(find(items, 'unverified-combo').params).toEqual({
      aircraft: 'M4T',
      payload: '',
      mode: '',
    })
  })
})

describe('área com bases: o que preflightFor passa ao motor', () => {
  const plan = { ...P, stats: { ...P.stats, flightTimeS: 600 } }
  const blocks = [
    { id: 1, waypoints: P.waypoints, timeS: 600 },
    { id: 2, waypoints: P.waypoints, timeS: 900 },
    { id: 3, waypoints: P.waypoints },
  ]
  const layout = {
    hasBases: true,
    order: [1, 2, 3, 4],
    byBlock: {
      1: { baseId: 'b1', baseLabel: 'A', flightLabel: 'A-1', withinVlos: false, worstVlosM: 812.3 },
      2: { baseId: 'b1', baseLabel: 'A', flightLabel: 'A-2', withinVlos: true, transitS: 600 },
      3: { baseId: null, flightLabel: '?-3' },
      // o 4 não tem entrada (bloco que entretanto saiu)
    },
    bases: [
      {
        id: 'b1',
        label: 'A',
        blockIds: [1, 2],
        noTerrain: false,
        zone: null,
        flights: ['A-1', 'A-2'],
      },
      { id: 'b2', label: 'B', blockIds: [], noTerrain: true, flights: [] },
      { id: 'b3', label: 'C', blockIds: [3], noTerrain: true, flights: ['?-3'] },
    ],
  }

  test('bases por bloco: alcance, bateria com trânsito, bloco sem base e base sem relevo', () => {
    const items = preflightFor('area', {
      ...ctx,
      plan,
      blocks,
      perBlockBases: true,
      baseLayout: layout,
      areaBasePoint: [-7.2, 40.4],
      areaBaseDistance: 5000,
      vlosM: undefined,
      zones: {},
    })
    // o alcance visual vai bloco a bloco: sem o da aeronave, «0»
    expect(find(items, 'block-vlos').params).toEqual({
      flight: 'A-1',
      id: 1,
      base: 'A',
      m: 812,
      vlos: 0,
    })
    // 15 min de voo e 10 de trânsito contra 20 úteis
    expect(find(items, 'battery-block-base').params).toEqual({
      flight: 'A-2',
      id: 2,
      base: 'A',
      min: 25,
      transit: 10,
      usable: 20,
    })
    expect(find(items, 'block-no-base').params).toEqual({ flight: '?-3', id: 3 })
    // a base sem blocos não diz nada; a C, fora do relevo, bloqueia
    const semRelevo = items.filter((i) => i.code === 'base-zone-no-terrain')
    expect(semRelevo.map((i) => i.params)).toEqual([{ base: 'C', flights: '?-3' }])
    // a distância à base da rota única não conta com bases por bloco
    expect(codes(items)).not.toContain('base-far')
  })

  test('um voo que a base não alcança só com o trânsito bloqueia', () => {
    const longe = {
      ...layout,
      byBlock: { ...layout.byBlock, 2: { ...layout.byBlock[2], transitS: 21 * 60 } },
    }
    const items = preflightArea({ ...ctx, plan, blocks, baseLayout: longe, batteryMin: 20 })
    expect(find(items, 'block-base-unreachable').params).toEqual({
      flight: 'A-2',
      id: 2,
      base: 'A',
      min: 21,
      usable: 20,
    })
  })

  test('sem bases por bloco: a zona da base de referência, se o relevo a mediu', () => {
    const zone = {
      radiusM: 40,
      requestedRadiusM: 100,
      reduced: true,
      cause: { belowM: 4, reliefM: 12, atM: 45 },
    }
    const s = {
      ...ctx,
      plan,
      blocks: null,
      perBlockBases: false,
      refBase: { id: 'b1', label: 'A' },
      areaBasePoint: [-7.2, 40.4],
      areaBaseDistance: 30,
      areaRouteOps: { transitS: 30, vlosWorstM: 900 },
    }
    const items = preflightFor('area', { ...s, zones: { b1: zone } })
    expect(find(items, 'base-zone-drop').params).toMatchObject({ base: 'A', r: 40, drop: 4 })
    expect(find(items, 'route-vlos').params).toEqual({ m: 900, vlos: 500 })
    // zona com erro (base fora do relevo) ou sem zona: nada da zona
    for (const zones of [{ b1: { error: 'no-terrain' } }, {}]) {
      const r = preflightFor('area', { ...s, zones })
      expect(codes(r).filter((c) => c.startsWith('base-zone'))).toEqual([])
    }
  })
})

describe('área: o que falta nos dados', () => {
  const plan = { ...P, stats: { ...P.stats, flightTimeS: 300 } }
  const base = {
    plan,
    batteryMin: 30,
    reservePct: 0,
    basePoint: [-7.2, 40.4],
    baseDistance: 20,
    speed: 8,
  }

  test('buraco do relevo sem o sítio: as coordenadas ficam vazias', () => {
    const items = preflightArea({
      ...base,
      terrainRoute: { covered: true },
      terrainHoles: { samples: 90, noData: 10, at: null },
    })
    expect(find(items, 'terrain-holes').params).toEqual({
      n: 10,
      total: 100,
      pct: 10,
      lat: '',
      lon: '',
    })
  })

  test('relevo que falhou: do ficheiro ou da descarga, e sem mensagem', () => {
    const ficheiro = preflightArea({
      ...base,
      terrainRoute: { covered: false, status: 'error', fromFile: true, error: 'TIFF ilegível' },
    })
    expect(find(ficheiro, 'terrain-file-error').params).toEqual({ msg: 'TIFF ilegível' })
    const descarga = preflightArea({ ...base, terrainRoute: { covered: false, status: 'error' } })
    expect(find(descarga, 'terrain-download-error').params).toEqual({ msg: '' })
    const aCarregar = preflightArea({
      ...base,
      terrainRoute: { covered: false, status: 'loading' },
    })
    expect(codes(aCarregar)).toContain('terrain-loading')
    const ficheiroCurto = preflightArea({
      ...base,
      terrainRoute: { covered: false, status: 'ready', source: 'file' },
    })
    expect(codes(ficheiroCurto)).toContain('terrain-file-outside')
  })

  test('seguimento de terreno: conta o maior bloco 3D; sem blocos 3D, a rota inteira', () => {
    const tf = { ...base, terrainFollow: { enabled: true }, terrainCovers: true }
    const blocks3 = [{ waypoints: wps(10) }, { waypoints: wps(WAYPOINT_SOFT_LIMIT + 5) }]
    const r = preflightArea({ ...tf, terrainResult: { waypoints: wps(5), blocks3 } })
    expect(find(r, 'waypoints-many').params).toEqual({ n: 2005 })
    const semBlocos = preflightArea({
      ...tf,
      terrainResult: { waypoints: wps(WAYPOINT_SOFT_LIMIT + 1), blocks3: [] },
    })
    expect(find(semBlocos, 'waypoints-many').params).toEqual({ n: 2001 })
    // relevo elipsoidal sem o nome do modelo
    const elips = preflightArea({
      ...tf,
      terrainResult: { waypoints: wps(5) },
      terrainDatum: { kind: 'ellipsoidal' },
    })
    expect(find(elips, 'terrain-datum-ellipsoidal').params).toEqual({ model: '' })
  })

  test('sobreposição incerta sem um dos lados; RTK no texto', () => {
    const items = preflightArea({
      ...base,
      uncertainty: { belowMinimum: true, front: [52.4, 70], side: null, inputs: { mode: 'rtk' } },
    })
    expect(find(items, 'overlap-uncertain').params).toEqual({ front: 52, side: '-', mode: 'RTK' })
    const gnss = preflightArea({ ...base, uncertainty: { belowMinimum: true, side: [40, 60] } })
    expect(find(gnss, 'overlap-uncertain').params).toEqual({ front: '-', side: 40, mode: 'GNSS' })
  })

  test('bacias de visão sem a distância a que o relevo tapa: «0 m»', () => {
    const layout = {
      hasBases: true,
      order: [1],
      byBlock: { 1: { baseId: 'b1', baseLabel: 'A', flightLabel: 'A-1', withinVlos: true } },
      bases: [{ id: 'b1', label: 'A', blockIds: [1], noTerrain: false, zone: null }],
    }
    const summary = {
      status: 'ok',
      hidden: 4,
      hiddenPct: 20,
      hiddenFrac: 0.2,
      radioOnly: 1,
      radioOnlyPct: 2,
      radioOnlyFrac: 0.02,
    }
    const items = preflightArea({
      ...base,
      blocks: [{ id: 1, waypoints: P.waypoints, timeS: 60 }],
      baseLayout: layout,
      viewsheds: { 1: { flightLabel: 'A-1', baseLabel: 'A', summary } },
    })
    expect(find(items, 'block-viewshed').params).toMatchObject({ pct: 20, m: 0 })
    expect(find(items, 'block-radio-minor').params).toMatchObject({ pct: 2, m: 0 })
  })

  test('voo de um índice da rota que não se sabe: o voo «1»', () => {
    const items = preflightArea({
      ...base,
      route: { duplicates: [1], climb: [], longSegments: [] },
      routePoints: P.waypoints,
      flightOfIndex: () => null,
    })
    expect(find(items, 'route-duplicate-waypoint').params).toMatchObject({
      n: 1,
      at: 1,
      flight: '1',
    })
  })
})
