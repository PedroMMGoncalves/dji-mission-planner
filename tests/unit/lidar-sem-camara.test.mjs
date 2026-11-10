/**
 * Issue #52: um LiDAR num Skyport (Mapper+ no M300) nao tem gimbal nem
 * disparo que o WPML comande. O grupo global de gimbal ja saia omitido, mas
 * as accoes por waypoint (orbita em foto e em video, circular, fachada com
 * varias inclinacoes, inspeccao, foto por waypoint, marcador nadir da dupla
 * grelha) e o gatilho por distancia/tempo continuavam a escrever accoes de
 * camara — no waylines.wpml e no template.kml, que leva os mesmos grupos.
 * Os planos vem dos geradores reais e os parametros dos construtores reais;
 * so o sensorType e LiDAR. Os rumos e a espera (hover) sao da aeronave e
 * ficam.
 */
import { describe, expect, test } from 'vitest'
import {
  circularExportParams,
  corridorExportParams,
  faceExportParams,
  inspectionExportParams,
  orbitExportParams,
} from '../../src/mission/exportParams.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { buildTemplateKML, buildWaylinesWPML } from '../../src/utils/exporters.js'
import { generateFacePlan } from '../../src/utils/faceMode.js'
import { generateOrbitPlan } from '../../src/utils/orbit.js'
import { generateCircularPlan } from '../../src/utils/circular.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { generateFlightPlan, rectangleFromAnchor, resolveSensor } from '../../src/utils/geo.js'
import { AIRCRAFT, DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const wpmlLidar = { ...AIRCRAFT.M300RTK.wpml, ...PAYLOADS.MAPPER_PLUS.wpml }
const lidar = { missionName: 'Quinta do Lago', wpml: wpmlLidar, sensorType: 'lidar' }
const camara = resolveSensor(PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
const conta = (xml, re) => (xml.match(re) ?? []).length
const CAMARA =
  />(takePhoto|startRecord|stopRecord|gimbalRotate|gimbalEvenlyRotate)<|multipleDistance|multipleTiming/g

/** Os dois ficheiros, sem nenhuma accao de camara; devolve-os. */
const semCamara = (p) => {
  const xmls = [buildWaylinesWPML(p), buildTemplateKML(p)]
  for (const xml of xmls) expect(xml.match(CAMARA)).toBeNull()
  return xmls
}
// rumos por waypoint: da aeronave, ficam nos dois ficheiros
const rumos = (xml) => conta(xml, /<wpml:waypointHeadingMode>smoothTransition</g)
const comRumo = (pw) => pw.filter((e) => e?.heading != null).length

describe('LiDAR: nenhuma accao de camara no waylines nem no template (#52)', () => {
  test('area: foto por waypoint, gatilho por distancia e por tempo, marcador nadir', () => {
    const lat0 = 38.7
    const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
    const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
    const ring = [em(0, 0), em(300, 0), em(300, 200), em(0, 200)]
    const plan = generateFlightPlan(ring, {
      spacingM: 40,
      angleDeg: 90,
      bufferPct: 0,
      photoIntervalM: 20,
      speed: 8,
      photoMode: 'waypoint',
      crosshatch: true,
      includeNadir: true,
    })
    const comum = {
      missionName: 'q',
      plan,
      spacingM: 40,
      sensorType: 'lidar',
      altitude: 80,
      speed: 8,
      wpml: wpmlLidar,
      photoIntervalM: 20,
      gimbalPitch: -60,
      crosshatch: true,
      includeNadir: true,
    }
    const pw = buildAreaExport({ ...comum, photoMode: 'waypoint', triggerMode: 'waypoint' }).params
    // o construtor ainda passa as fotos e o marcador; e o exportador que os cala
    expect(pw.perWaypoint.some((e) => e?.gimbalPitch === -90)).toBe(true)
    expect(pw.perWaypoint.some((e) => e?.actions?.includes('takePhoto'))).toBe(true)
    semCamara(pw)
    for (const triggerMode of ['distance', 'time']) {
      const p = buildAreaExport({ ...comum, photoMode: 'distance', triggerMode }).params
      // mesmo com um intervalo forcado, o gatilho nao sai com LiDAR
      semCamara({ ...p, photoIntervalM: 20 })
    }
  })

  test('corredor: modo distancia (o construtor passa o intervalo) e modo waypoint', () => {
    const axis = [
      [-9.14, 38.7],
      [-9.13, 38.7],
      [-9.125, 38.7035],
    ]
    const opts = {
      sensor: resolveSensor(PAYLOADS.MAPPER_PLUS, DEFAULT_CUSTOM_SENSOR),
      altitude: 80,
      bufferM: 150,
      sideOverlapPct: 50,
      photoIntervalM: 20,
      speed: 5,
    }
    for (const photoMode of ['distance', 'waypoint']) {
      const plan = generateCorridorPlan(axis, { ...opts, photoMode })
      const p = corridorExportParams({
        ...lidar,
        plan,
        photoMode,
        altitude: 80,
        speed: 5,
        photoIntervalM: 20,
      })
      if (photoMode === 'distance') expect(p.photoIntervalM).toBe(20)
      semCamara(p)
    }
  })

  test('fachada com varias inclinacoes e espera: sem camara, rumos e hover ficam', () => {
    const plan = generateFacePlan(
      [
        [-9.14, 38.7],
        [-9.139, 38.7],
      ],
      {
        sensor: camara,
        faceHeightM: 30,
        standoffM: 12,
        side: 'left',
        verticalOverlapPct: 70,
        horizontalOverlapPct: 70,
        gimbalPitch: 0,
        speed: 3,
        hoverS: 2,
        shots: [0, -30],
      },
    )
    const [wl, tpl] = semCamara(faceExportParams({ ...lidar, plan, speed: 3, gimbalPitch: 0 }))
    const n = comRumo(plan.perWaypoint)
    expect(n).toBeGreaterThan(0)
    for (const xml of [wl, tpl]) {
      expect(rumos(xml)).toBe(n)
      // a espera e da aeronave: uma por ponto, como com camara
      expect(conta(xml, />hover</g)).toBe(plan.waypoints.length)
    }
  })

  test('orbita em foto e em video, plano como o da interface com LiDAR (sem sensor)', () => {
    const base = {
      sensor: null,
      radiusM: 40,
      levels: { count: 3, startM: 20, stepM: 15 },
      horizontalOverlapPct: 70,
      poiHeightM: 10,
      clockwise: true,
      speed: 3,
    }
    const foto = generateOrbitPlan([-9.14, 38.7], base)
    // sem sensor o gerador ja nao poe fotos, mas continua a pedir um pitch
    expect(foto.perWaypoint.every((e) => e.gimbalPitch != null)).toBe(true)
    const [wl, tpl] = semCamara(orbitExportParams({ ...lidar, plan: foto, speed: 3 }))
    expect(rumos(wl)).toBe(foto.waypoints.length)
    expect(rumos(tpl)).toBe(foto.waypoints.length)

    const video = generateOrbitPlan([-9.14, 38.7], { ...base, capture: 'video' })
    expect(video.perWaypoint.some((e) => e?.gimbalEven === true)).toBe(true)
    const [vwl] = semCamara(orbitExportParams({ ...lidar, plan: video, speed: 3 }))
    expect(rumos(vwl)).toBe(comRumo(video.perWaypoint))
  })

  test('circular: plano sem camara, nenhum gimbalRotate nem foto', () => {
    const field = rectangleFromAnchor([-8, 39.5], 131, 93, 0)
    const plan = generateCircularPlan(field, {
      sensor: { type: 'lidar', fov: 70 },
      radiusM: 30,
      overlapPct: 50,
      altitude: 60,
      gimbalPitch: -45,
      frontOverlapPct: 80,
      speed: 5,
    })
    const [wl] = semCamara(circularExportParams({ ...lidar, plan, altitude: 60, speed: 5 }))
    expect(rumos(wl)).toBe(comRumo(plan.perWaypoint))
  })

  test('pontos de inspeccao: sem camara; o rumo e a espera pedidos no ponto ficam', () => {
    const points = [
      { id: 'a', point: [-9.14, 38.7], heading: 45, gimbalPitch: -30, heightM: 40, hoverS: 3 },
      { id: 'b', point: [-9.139, 38.7], gimbalPitch: -60, heightM: 50 },
    ]
    const p = inspectionExportParams({ ...lidar, points, altitude: 60, speed: 5, gimbalPitch: -45 })
    const [wl, tpl] = semCamara(p)
    for (const xml of [wl, tpl]) {
      expect(rumos(xml)).toBe(1)
      expect(conta(xml, />hover</g)).toBe(1)
      // um so grupo (o da espera), com id 0
      expect([...xml.matchAll(/<wpml:actionGroupId>(\d+)</g)].map((m) => m[1])).toEqual(['0'])
    }
  })

  test('a mesma rota com camara continua a levar as accoes, com ids a partir de 0', () => {
    const points = [
      { id: 'a', point: [-9.14, 38.7], heading: 45, gimbalPitch: -30, heightM: 40 },
      { id: 'b', point: [-9.139, 38.7], gimbalPitch: -60, heightM: 50 },
    ]
    const p = inspectionExportParams({
      ...lidar,
      sensorType: 'camera',
      points,
      altitude: 60,
      speed: 5,
      gimbalPitch: -45,
    })
    for (const xml of [buildWaylinesWPML(p), buildTemplateKML(p)]) {
      expect(conta(xml, />takePhoto</g)).toBe(2)
      expect(conta(xml, />gimbalRotate</g)).toBe(3)
      const ids = [...xml.matchAll(/<wpml:actionGroupId>(\d+)</g)].map((m) => Number(m[1]))
      expect(ids).toEqual([0, 1, 2])
    }
  })
})
