/*
 * Matriz modos × aeronaves para a conformidade WPML (T10 da revisão): os
 * parâmetros de exportação de cada modo (área por distância, por tempo e por
 * waypoint, com terreno, LiDAR; corredor; fachada; órbita em foto e em
 * vídeo, e por nível; circular; pontos de inspecção) em cada aeronave (M3E,
 * M4T grande-angular e térmica, M300 RTK + P1, M300 + Mapper+, custom),
 * directamente dos módulos da app, sem a interface.
 */
import { AIRCRAFT, PAYLOADS } from '../../src/data/drones.js'
import {
  circularExportParams,
  corridorExportParams,
  faceExportParams,
  inspectionExportParams,
  orbitExportParams,
} from '../../src/mission/exportParams.js'
import { generateCircularPlan } from '../../src/utils/circular.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import {
  blockExportParams,
  buildTemplateKML,
  buildWaylinesWPML,
} from '../../src/utils/exporters.js'
import { generateFacePlan } from '../../src/utils/faceMode.js'
import { passThroughFor, resolveSensor } from '../../src/utils/geo.js'
import { generateOrbitPlan, orbitLevelsToBlocks } from '../../src/utils/orbit.js'
import { DEFAULT_CUSTOM_SENSOR } from '../../src/data/drones.js'

const T0 = 1760000000000
const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-7.2 + x / mL, lat + y / 110574] : [-7.2 + x / mL, lat + y / 110574, z]

/** Enums e limites WPML de um par aeronave/payload, como a app os passa. */
export function wpmlOf(aircraftId, payloadId) {
  const a = AIRCRAFT[aircraftId]
  const p = PAYLOADS[payloadId]
  return { ...a.wpml, ...p.wpml, gimbalPitchRange: p.gimbalPitch, imageFormat: p.imageFormat }
}

const PAIRS = [
  ['M3E', 'M3E_WIDE'],
  ['M4T', 'M4T_WIDE'],
  ['M4T', 'M4T_THERMAL'],
  ['M300RTK', 'P1'],
  ['CUSTOM', 'CUSTOM'],
]
const safety = {
  finishAction: 'goHome',
  exitOnRCLost: 'executeLostAction',
  executeRCLostAction: 'goBack',
}

// duas faixas de 100 m com uma ligação de 30 m, e uma terceira
const grelha = [em(0, 0), em(100, 0), em(100, 30), em(0, 30), em(0, 60), em(100, 60)]

/** Lista de casos { name, aircraft, params }. */
export function casosMatriz() {
  const casos = []
  const add = (name, params) =>
    casos.push({ name, params: { createTimeMs: T0, ...safety, ...params } })

  for (const [a, p] of PAIRS) {
    const wpml = wpmlOf(a, p)
    const tag = `${a}-${p}`.toLowerCase()
    const base = {
      name: `m_area_${tag}`,
      waypoints: grelha,
      altitude: 100,
      speed: 10,
      wpml,
      gimbalPitch: -90,
      sensorType: 'camera',
    }
    add(`area-distancia-${tag}`, {
      ...base,
      photoIntervalM: 20,
      triggerMode: 'distance',
      triggerRanges: [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
    })
    add(`area-tempo-${tag}`, { ...base, photoIntervalM: 12.3, triggerMode: 'time' })
    // foto por waypoint: fotos nos pontos intermédios, em passagem
    const densa = [
      em(0, 0),
      em(25, 0),
      em(50, 0),
      em(75, 0),
      em(100, 0),
      em(100, 30),
      em(75, 30),
      em(50, 30),
      em(25, 30),
      em(0, 30),
    ]
    const foto = { actions: ['takePhoto'] }
    add(`area-waypoint-${tag}`, {
      ...base,
      waypoints: densa,
      photoIntervalM: 0,
      triggerMode: 'waypoint',
      perWaypoint: densa.map(() => foto),
      passThrough: passThroughFor([5, 5]),
    })
    // seguimento de terreno: alturas por waypoint, vértices em passagem, nadir no bloco 2
    const terreno = [
      em(0, 0, 100),
      em(50, 0, 104.5),
      em(100, 0, 98),
      em(100, 30, 97.2),
      em(0, 30, 101),
      em(0, 60, 102),
      em(100, 60, 99),
    ]
    add(`area-terreno-${tag}`, {
      ...base,
      waypoints: terreno,
      photoIntervalM: 20,
      triggerMode: 'distance',
      triggerRanges: [
        [0, 2],
        [3, 4],
        [5, 6],
      ],
      passThrough: [false, true, false, false, false, false, false],
      perWaypoint: [null, null, null, null, null, { gimbalPitch: -90 }, null],
    })
  }
  // LiDAR: sem acções de câmara
  add('area-lidar-m300-mapper', {
    name: 'm_area_lidar',
    waypoints: grelha,
    altitude: 80,
    speed: 5,
    wpml: wpmlOf('M300RTK', 'MAPPER_PLUS'),
    photoIntervalM: 0,
    triggerMode: 'distance',
    sensorType: 'lidar',
    gimbalPitch: -90,
  })

  // corredor (M3E e M300+P1), por distância e por waypoint
  const axis = [em(0, 0), em(300, 20), em(600, 0)]
  for (const [a, p] of [
    ['M3E', 'M3E_WIDE'],
    ['M300RTK', 'P1'],
  ]) {
    const sensor = resolveSensor(PAYLOADS[p], DEFAULT_CUSTOM_SENSOR)
    for (const photoMode of ['distance', 'waypoint']) {
      const plan = generateCorridorPlan(axis, {
        sensor,
        altitude: 100,
        bufferM: 60,
        sideOverlapPct: 70,
        photoIntervalM: 20,
        speed: 8,
        photoMode,
      })
      if (plan?.error) throw new Error(`corredor: ${plan.error}`)
      const params = corridorExportParams({
        missionName: 'm',
        plan,
        photoMode,
        altitude: 100,
        speed: 8,
        wpml: wpmlOf(a, p),
        photoIntervalM: 20,
        sensorType: 'camera',
      })
      add(`corredor-${photoMode}-${a.toLowerCase()}`, params)
    }
  }

  // fachada (M3E, M4T térmica)
  const face = [em(0, 0), em(60, 5)]
  for (const [a, p] of [
    ['M3E', 'M3E_WIDE'],
    ['M4T', 'M4T_THERMAL'],
  ]) {
    const sensor = resolveSensor(PAYLOADS[p], DEFAULT_CUSTOM_SENSOR)
    const plan = generateFacePlan(face, { sensor, faceHeightM: 20, standoffM: 15, speed: 3 })
    if (plan?.error) throw new Error(`fachada: ${plan.error}`)
    add(
      `fachada-${a.toLowerCase()}`,
      faceExportParams({
        missionName: 'm',
        plan,
        speed: 3,
        wpml: wpmlOf(a, p),
        gimbalPitch: 0,
        sensorType: 'camera',
      }),
    )
  }

  // órbita: foto (missão única e por nível) e vídeo
  {
    const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
    const wpml = wpmlOf('M3E', 'M3E_WIDE')
    const photo = generateOrbitPlan(em(0, 0), {
      sensor,
      radiusM: 40,
      levels: { count: 2, startM: 20, stepM: 10 },
      speed: 3,
    })
    const pp = orbitExportParams({
      missionName: 'm',
      plan: photo,
      speed: 3,
      wpml,
      sensorType: 'camera',
    })
    add('orbita-foto-m3e', pp)
    for (const b of orbitLevelsToBlocks(photo))
      add(`orbita-nivel-${b.id}-m3e`, blockExportParams({ createTimeMs: T0, ...safety, ...pp }, b))
    const video = generateOrbitPlan(em(0, 0), {
      sensor,
      radiusM: 40,
      levels: { count: 3, startM: 20, stepM: 10 },
      speed: 3,
      capture: 'video',
    })
    add(
      'orbita-video-m3e',
      orbitExportParams({ missionName: 'm', plan: video, speed: 3, wpml, sensorType: 'camera' }),
    )
  }

  // circular (M3E e M300+P1)
  const ring = [em(0, 0), em(120, 0), em(120, 90), em(0, 90)]
  for (const [a, p] of [
    ['M3E', 'M3E_WIDE'],
    ['M300RTK', 'P1'],
  ]) {
    const sensor = resolveSensor(PAYLOADS[p], DEFAULT_CUSTOM_SENSOR)
    const plan = generateCircularPlan(ring, {
      sensor,
      radiusM: 30,
      overlapPct: 50,
      altitude: 60,
      gimbalPitch: -45,
      speed: 8,
    })
    if (plan?.error) throw new Error(`circular: ${plan.error}`)
    add(
      `circular-${a.toLowerCase()}`,
      circularExportParams({
        missionName: 'm',
        plan,
        altitude: 60,
        speed: 8,
        wpml: wpmlOf(a, p),
        sensorType: 'camera',
      }),
    )
  }

  // pontos de inspecção (M3E, M4T): rumo e pitch por ponto, um sem foto
  for (const [a, p] of [
    ['M3E', 'M3E_WIDE'],
    ['M4T', 'M4T_WIDE'],
  ]) {
    const points = [
      { point: em(0, 0), heightM: 30, heading: 270, gimbalPitch: -30 },
      { point: em(40, 10), heightM: 40 },
      { point: em(80, 0), heightM: 35, heading: -45, photo: false },
    ]
    add(
      `inspeccao-${a.toLowerCase()}`,
      inspectionExportParams({
        missionName: 'm',
        points,
        altitude: 30,
        speed: 5,
        wpml: wpmlOf(a, p),
        gimbalPitch: -30,
        sensorType: 'camera',
      }),
    )
  }
  return casos
}

/** Os dois ficheiros de cada caso. */
export function ficheiros(params) {
  return { template: buildTemplateKML(params), waylines: buildWaylinesWPML(params) }
}
