/**
 * Corredor com seguimento de terreno (src/mission/corridorTerrain.js): cada
 * passagem sobre o seu chao, vertices mantidos, fotos por waypoint
 * reindexadas, exportacao e preflight.
 */
import { describe, expect, test } from 'vitest'
import {
  TERRAIN_UNION_MAX_KM,
  baseToRouteM,
  bboxCovers,
  bboxOfPoints,
  planCorridorTerrain,
  terrainTargetBbox,
} from '../../src/mission/corridorTerrain.js'
import { corridorExportParams } from '../../src/mission/exportParams.js'
import { preflightPlan } from '../../src/mission/preflight.js'
import { buildWaylinesWPML, validateExportParams } from '../../src/utils/exporters.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { resolveSensor } from '../../src/utils/geo.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const wpml = { droneEnumValue: 77, payloadEnumValue: 66, payloadPositionIndex: 0 }
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const LL = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const XY = (lon, lat) => [(lon + 9.14) * mLon, (lat - lat0) * 110574]

// rampa de rampa de acesso: sobe 0,1 m/m para leste, e uma escombreira de
// 40 m ao lado do eixo, a norte
const relevo = {
  elevationAt: (lon, lat) => {
    const [x, y] = XY(lon, lat)
    return 300 + 0.1 * x + 40 * Math.exp(-((x - 500) ** 2 + (y - 120) ** 2) / (2 * 70 * 70))
  },
}
const eixo = [LL(0, 0), LL(400, 60), LL(900, 0)]
const opcoes = (extra) => ({
  sensor,
  altitude: 60,
  bufferM: 120,
  sideOverlapPct: 70,
  photoIntervalM: 20,
  speed: 8,
  ...extra,
})
const cotaMin = (wps) => Math.min(...wps.map(([lon, lat]) => relevo.elevationAt(lon, lat)))

describe('seguimento de terreno do corredor', () => {
  const plan = generateCorridorPlan(eixo, opcoes())
  const ref = cotaMin(plan.waypoints)
  const tf = planCorridorTerrain(relevo, plan, { refElev: ref, agl: 60, toleranceM: 3, speed: 8 })

  test('cada passagem sobre o seu chao: AGL + (cota - referencia) em todos os vertices', () => {
    expect(tf.error).toBeUndefined()
    for (const idx of tf.vertexIndex)
      for (const k of idx) {
        const [lon, lat, h] = tf.waypoints[k]
        // o corredor de +-30 m pode subir a altura, nunca a baixar
        expect(h).toBeGreaterThanOrEqual(60 + relevo.elevationAt(lon, lat) - ref - 0.06)
      }
  })

  test('os vertices das passagens ficam todos, e o relevo acrescenta pontos', () => {
    const n = plan.lines.reduce((s, l) => s + l.length, 0)
    expect(tf.vertexIndex.flat()).toHaveLength(n)
    expect(tf.waypoints.length).toBeGreaterThanOrEqual(n)
    plan.lines.forEach((line, i) =>
      line.forEach((p, j) => {
        const w = tf.waypoints[tf.vertexIndex[i][j]]
        expect([w[0], w[1]]).toEqual(p)
      }),
    )
  })

  test('a passagem ao lado da escombreira sobe; a do outro lado, a mesma distancia, nao', () => {
    // pontos de cada passagem (sem os da ligacao que a antecede)
    const passagens = []
    let off = 0
    tf.perLine.forEach((n, i) => {
      passagens.push(tf.waypoints.slice(off + (tf.perLink[i] ?? 0), off + n))
      off += n
    })
    const yMedio = (pts) => pts.reduce((a, w) => a + XY(w[0], w[1])[1], 0) / pts.length
    const ordenadas = passagens.filter((p) => p.length > 0).sort((a, b) => yMedio(a) - yMedio(b))
    // subida acima da rampa, na janela da escombreira ao longo do eixo
    const subida = (pts) =>
      Math.max(
        ...pts
          .map((w) => ({ x: XY(w[0], w[1])[0], h: w[2] }))
          .filter((q) => q.x > 350 && q.x < 650)
          .map((q) => q.h - 0.1 * q.x),
      )
    const sul = subida(ordenadas[0])
    const norte = subida(ordenadas[ordenadas.length - 1])
    expect(norte - sul).toBeGreaterThan(20)
  })

  test('estatisticas da rota 3D e tempo com as inversoes', () => {
    expect(tf.pathLengthM).toBeGreaterThan(plan.stats.pathLengthM)
    expect(tf.flightTimeS).toBeGreaterThan(tf.pathLengthM / 8)
    expect(tf.refElev).toBe(ref)
  })

  test('sem cota de referencia e um erro, nunca alturas planas', () => {
    expect(planCorridorTerrain(relevo, plan, { refElev: null, agl: 60, speed: 8 }).error).toBe(
      'ref-outside-terrain',
    )
    expect(planCorridorTerrain(relevo, null, { refElev: 1, agl: 60, speed: 8 }).error).toBe(
      'no-plan',
    )
  })

  test('foto por waypoint: as fotos seguem os vertices, os pontos novos vao sem foto', () => {
    const wp = generateCorridorPlan(eixo, opcoes({ photoMode: 'waypoint', photoIntervalM: 60 }))
    const r = planCorridorTerrain(relevo, wp, { refElev: ref, agl: 60, toleranceM: 1, speed: 8 })
    const fotos = r.perWaypoint.filter((pw) => pw?.actions?.includes('takePhoto')).length
    expect(fotos).toBe(wp.waypoints.length)
    for (const k of r.vertexIndex.flat()) expect(r.perWaypoint[k].actions).toEqual(['takePhoto'])
    const semFoto = r.waypoints.length - fotos
    expect(semFoto).toBeGreaterThan(0)
  })
})

describe('exportacao do corredor com relevo', () => {
  const plan = generateCorridorPlan(eixo, opcoes())
  const ref = cotaMin(plan.waypoints)
  const tf = planCorridorTerrain(relevo, plan, { refElev: ref, agl: 60, toleranceM: 3, speed: 8 })
  const base = {
    missionName: 'Rampa',
    plan,
    photoMode: 'distance',
    altitude: 60,
    speed: 8,
    wpml,
    photoIntervalM: 20,
    sensorType: 'camera',
  }

  test('sem relevo sai o mesmo de sempre', () => {
    const a = corridorExportParams(base)
    const b = corridorExportParams({ ...base, terrainResult: null })
    expect(b).toEqual(a)
    expect(a.name).toBe('Rampa_corridor_n' + plan.stats.passCount)
  })

  test('com relevo: nome -tf, waypoints do relevo, disparo e passagem coerentes, valida', () => {
    const p = corridorExportParams({ ...base, terrainResult: tf })
    expect(p.name).toBe('Rampa_corridor-tf_n' + plan.stats.passCount)
    expect(p.waypoints).toBe(tf.waypoints)
    expect(p.durationS).toBe(tf.flightTimeS)
    expect(validateExportParams(p)).toBe(p)
    const last = p.triggerRanges[p.triggerRanges.length - 1]
    expect(last[1]).toBe(tf.waypoints.length - 1)
    expect(p.passThrough).toHaveLength(tf.waypoints.length)
    const xml = buildWaylinesWPML(p)
    const hs = [...xml.matchAll(/<wpml:executeHeight>([-\d.]+)</g)].map((m) => Number(m[1]))
    expect(hs).toHaveLength(tf.waypoints.length)
    expect(new Set(hs).size).toBeGreaterThan(3)
  })

  test('um resultado com erro nao contamina a exportacao', () => {
    expect(corridorExportParams({ ...base, terrainResult: { error: 'x' } })).toEqual(
      corridorExportParams(base),
    )
  })
})

describe('caixa do relevo, cobertura e base', () => {
  test('uniao da area e do corredor quando proximos; o modo activo quando longe', () => {
    const area = [-9.15, 38.69, -9.13, 38.71]
    const perto = [-9.13, 38.7, -9.12, 38.72]
    expect(terrainTargetBbox({ areaBbox: area, corridorBbox: perto, missionMode: 'area' })).toEqual(
      [-9.15, 38.69, -9.12, 38.72],
    )
    const longe = [-8.5, 38.7, -8.49, 38.71]
    expect(
      terrainTargetBbox({ areaBbox: area, corridorBbox: longe, missionMode: 'corridor' }),
    ).toEqual(longe)
    expect(terrainTargetBbox({ areaBbox: area, corridorBbox: longe, missionMode: 'area' })).toEqual(
      area,
    )
    expect(terrainTargetBbox({ areaBbox: null, corridorBbox: perto, missionMode: 'area' })).toEqual(
      perto,
    )
    expect(terrainTargetBbox({ areaBbox: area, corridorBbox: null, missionMode: 'corridor' })).toBe(
      null,
    )
    expect(TERRAIN_UNION_MAX_KM).toBe(20)
  })

  test('caixas: de pontos, cobertura e lixo', () => {
    expect(
      bboxOfPoints([
        [1, 2],
        [3, -1],
        [NaN, 5],
      ]),
    ).toEqual([1, -1, 3, 2])
    expect(bboxOfPoints([])).toBeNull()
    expect(bboxCovers([0, 0, 10, 10], [1, 1, 2, 2])).toBe(true)
    expect(bboxCovers([0, 0, 10, 10], [1, 1, 11, 2])).toBe(false)
    expect(bboxCovers(null, [1, 1, 2, 2])).toBe(false)
  })

  test('distancia da base ao ponto mais proximo da rota', () => {
    const d = baseToRouteM(LL(0, -500), [LL(0, 0, 0), LL(900, 0)])
    expect(d).toBeGreaterThan(495)
    expect(d).toBeLessThan(505)
    expect(baseToRouteM(null, [LL(0, 0)])).toBeNull()
  })
})

describe('preflight do corredor com relevo', () => {
  const plan = generateCorridorPlan(eixo, opcoes())
  const codes = (items) => items.map((i) => `${i.level}:${i.code}`)

  test('seguimento de terreno sem relevo que cubra e um bloqueio', () => {
    const it = preflightPlan({
      plan,
      terrainFollow: { enabled: true, tolerance: 5 },
      terrainCovers: false,
      terrainResult: { error: 'terrain-not-loaded' },
    })
    expect(codes(it)).toContain('block:terrain-not-loaded')
  })

  test('erro do seguimento de terreno com relevo e um bloqueio com a mensagem', () => {
    const it = preflightPlan({
      plan,
      terrainFollow: { enabled: true, tolerance: 5 },
      terrainCovers: true,
      terrainResult: { error: 'ref-outside-terrain' },
    })
    expect(codes(it)).toContain('block:terrain-error')
  })

  test('sem seguimento de terreno nada muda; sem base diz o que assume', () => {
    expect(codes(preflightPlan({ plan }))).not.toContain('block:terrain-not-loaded')
    const semBase = preflightPlan({
      plan,
      basePoint: null,
      reference: { elev: 300, source: 'area-min', reliefM: 95, baseOutside: false },
    })
    expect(codes(semBase)).toContain('warn:no-base-relief')
    // fachada e orbita nao passam reference: sem item novo
    expect(codes(preflightPlan({ plan }))).not.toContain('info:no-base')
  })
})
