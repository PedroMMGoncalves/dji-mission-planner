/**
 * A rota exportável do separador aberto (src/mission/activeRoute.js, M3-C15):
 * por modo, os waypoints com altura relativa e a cota de referência que a
 * vista 3D, a folga ao solo e os trânsitos usam. Antes vivia num useMemo do
 * App e só se via a correr a aplicação.
 */
import { describe, expect, test } from 'vitest'
import { activeRoute } from '../../src/mission/activeRoute.js'

const flat = [
  [-7.2, 40.4],
  [-7.199, 40.4],
  [-7.199, 40.401],
]
const planOk = { waypoints: flat, lines: [[flat[0], flat[1]]] }
const elevationAt = (lon, lat) => 200 + 1000 * (lon + 7.2) + 500 * (lat - 40.4)

describe('rota activa por modo', () => {
  test('fachada e órbita: os waypoints do plano, a cota do pé da face / do POI', () => {
    const wps = [[-7.2, 40.4, 30]]
    const face = activeRoute({
      missionMode: 'face',
      elevationAt,
      facePlan: { waypoints: wps },
      faceBaseline: [[-7.199, 40.4]],
      altitude: 100,
    })
    expect(face.waypoints).toBe(wps)
    expect(face.refElev).toBeCloseTo(201, 6)
    const orbit = activeRoute({
      missionMode: 'orbit',
      elevationAt: null, // sem relevo: cota 0
      orbitPlan: { waypoints: wps },
      orbitPoi: [-7.2, 40.401],
      altitude: 100,
    })
    expect(orbit).toEqual({ waypoints: wps, refElev: 0, perWaypoint: null })
    // um plano com erro não é rota: cai no plano de área (aqui, nenhum)
    expect(
      activeRoute({ missionMode: 'face', facePlan: { error: 'x' }, planOk: null, altitude: 100 }),
    ).toBeNull()
  })

  test('corredor e circular: a cota de referência da área e a altura do plano', () => {
    const corr = activeRoute({
      missionMode: 'corridor',
      corridorPlan: {
        waypoints: [
          [-7.2, 40.4],
          [-7.199, 40.4, 72],
        ],
      },
      corridorReference: { elev: 210, source: 'base' },
      altitude: 100,
    })
    // sem altura própria leva a altitude pedida; com altura (terreno) fica
    expect(corr.waypoints).toEqual([
      [-7.2, 40.4, 100],
      [-7.199, 40.4, 72],
    ])
    expect(corr.refElev).toBe(210)
    expect(corr.refSource).toBe('base')
    expect(activeRoute({ missionMode: 'corridor', corridorPlan: null, altitude: 100 })).toBeNull()
    const circ = activeRoute({
      missionMode: 'circular',
      circularPlan: { waypoints: [[-7.2, 40.4, 60]] },
      circularReference: null,
      altitude: 100,
    })
    expect(circ).toEqual({
      waypoints: [[-7.2, 40.4, 60]],
      refElev: null,
      refSource: null,
      perWaypoint: null,
    })
    expect(
      activeRoute({
        missionMode: 'circular',
        circularPlan: { error: 'invalid-area' },
        altitude: 1,
      }),
    ).toBeNull()
  })

  test('área plana: a altitude pedida em todos os pontos e a referência da área', () => {
    const r = activeRoute({
      missionMode: 'area',
      planOk,
      terrainResult: null,
      reference: { elev: 180, source: 'area-min' },
      altitude: 90,
    })
    expect(r.waypoints).toEqual(flat.map(([lon, lat]) => [lon, lat, 90]))
    expect(r.refElev).toBe(180)
    expect(r.refSource).toBe('area-min')
    expect(activeRoute({ missionMode: 'area', planOk: null, altitude: 90 })).toBeNull()
  })

  test('área com seguimento de terreno: as alturas e a cota do seguimento', () => {
    const tf = { waypoints: [[-7.2, 40.4, 95.5]], refElev: 177 }
    const r = activeRoute({
      missionMode: 'area',
      planOk,
      terrainResult: tf,
      reference: { elev: 180, source: 'area-min' },
      altitude: 90,
    })
    expect(r.waypoints).toBe(tf.waypoints)
    expect(r.refElev).toBe(177)
    // um seguimento com erro não conta: rota plana
    const e = activeRoute({
      missionMode: 'area',
      planOk,
      terrainResult: { error: 'photo-waypoint' },
      reference: { elev: 180, source: 'area-min' },
      altitude: 90,
    })
    expect(e.waypoints[0][2]).toBe(90)
    expect(e.refElev).toBe(180)
  })

  test('área com bases: cada bloco na cota da sua zona, exprimido na comum, com cortes', () => {
    const blocks = [
      {
        id: 1,
        waypoints: [
          [-7.2, 40.4],
          [-7.199, 40.4],
        ],
      },
      {
        id: 2,
        waypoints: [
          [-7.198, 40.4],
          [-7.197, 40.4],
        ],
      },
    ]
    const r = activeRoute({
      missionMode: 'area',
      planOk,
      terrainResult: null,
      blockRefs: { refs: [200, 220], common: 200 },
      blocks,
      altitude: 100,
    })
    expect(r.refSource).toBe('bases')
    expect(r.refElev).toBe(200)
    expect(r.waypoints).toHaveLength(4)
    // bloco 2: 100 m sobre a cota 220, na cota comum 200 → 120 m
    expect(r.waypoints[2][2]).toBeCloseTo(120, 6)
    expect(r.breaks).toEqual([2])
  })

  test('acções por waypoint (foto por waypoint): do plano, do seguimento e dos blocos, na rota', () => {
    const pw = [undefined, { actions: ['takePhoto'] }]
    const plan = {
      waypoints: [
        [-8, 40],
        [-8.001, 40],
      ],
      perWaypoint: pw,
    }
    const flat = activeRoute({
      missionMode: 'area',
      planOk: plan,
      terrainResult: null,
      reference: { elev: 100, source: 'x' },
      altitude: 90,
    })
    expect(flat.perWaypoint).toBe(pw)
    const tf = {
      waypoints: [
        [-8, 40, 90],
        [-8.0005, 40, 95],
        [-8.001, 40, 100],
      ],
      refElev: 100,
      perWaypoint: [undefined, undefined, { actions: ['takePhoto'] }],
    }
    const terr = activeRoute({ missionMode: 'area', planOk: plan, terrainResult: tf, altitude: 90 })
    expect(terr.perWaypoint).toBe(tf.perWaypoint)
    // blocos: as acções de cada bloco deslocadas para os índices da rota
    const blocks = [
      { waypoints: plan.waypoints, perWaypoint: pw },
      {
        waypoints: [
          [-8, 40.001],
          [-8.001, 40.001],
        ],
        perWaypoint: pw,
      },
    ]
    const b = activeRoute({
      missionMode: 'area',
      planOk: plan,
      blockRefs: { refs: [100, 100], common: 100 },
      blocks,
      altitude: 90,
    })
    expect(b.breaks).toEqual([2])
    expect(b.perWaypoint).toHaveLength(4)
    expect(b.perWaypoint[1]).toBe(pw[1])
    expect(b.perWaypoint[2]).toBeUndefined()
    expect(b.perWaypoint[3]).toBe(pw[1])
    // sem acções (disparo por distância): null
    const none = activeRoute({
      missionMode: 'area',
      planOk: { waypoints: plan.waypoints },
      altitude: 90,
    })
    expect(none.perWaypoint).toBeNull()
  })

  test('fachada, órbita e circular levam as acções por waypoint do plano', () => {
    const pw = [{ actions: ['takePhoto'] }, { actions: ['takePhoto'] }]
    const wps = [
      [-8, 40, 10],
      [-8.001, 40, 10],
    ]
    const face = activeRoute({
      missionMode: 'face',
      facePlan: { waypoints: wps, perWaypoint: pw },
      faceBaseline: [[-8, 40]],
      altitude: 100,
    })
    expect(face.perWaypoint).toBe(pw)
    const orbit = activeRoute({
      missionMode: 'orbit',
      orbitPlan: { waypoints: wps, perWaypoint: pw },
      orbitPoi: [-8, 40],
      altitude: 100,
    })
    expect(orbit.perWaypoint).toBe(pw)
    const circ = activeRoute({
      missionMode: 'circular',
      circularPlan: { waypoints: wps, perWaypoint: pw },
      circularReference: { elev: 100, source: 'x' },
      altitude: 100,
    })
    expect(circ.perWaypoint).toBe(pw)
  })
})
