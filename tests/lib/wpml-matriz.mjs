/*
 * Matriz modos × aeronaves para a conformidade WPML (T10 da revisão): os
 * parâmetros de exportação de cada modo (área por distância, por tempo e por
 * waypoint, com terreno, dupla grelha, blocos e LiDAR; corredor; fachada;
 * órbita em foto, em vídeo, por nível e com várias inclinações; circular;
 * pontos de inspecção) em cada aeronave e payload (M3E, M4T grande-angular e
 * térmica, M300 RTK + P1, M300 + Mapper+, aeronave e payload próprios, em
 * câmara e em LiDAR), directamente dos módulos da app, sem a interface; e as
 * opções do projecto que mudam o ficheiro: a posição do payload (1 e 2, nas
 * aeronaves com três suportes) e a versão do namespace (1.0.3 e 1.0.6).
 * Os enums vêm de missionWpml, o mesmo construtor que a app usa.
 */
import { AIRCRAFT, DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
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
import { shotPitches } from '../../src/mission/gimbal.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { missionWpml } from '../../src/mission/missionWpml.js'
import { planMissionFromProject } from '../../src/mission/planFromProject.js'
import { normalizeProject } from '../../src/mission/project.js'
import { planTerrainFollow } from '../../src/mission/terrainFollow.js'

const T0 = 1760000000000
const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-7.2 + x / mL, lat + y / 110574] : [-7.2 + x / mL, lat + y / 110574, z]

/** O sensor próprio em LiDAR (payload «Personalizado / LiDAR» com o modo LiDAR). */
const CUSTOM_LIDAR = { ...DEFAULT_CUSTOM_SENSOR, mode: 'lidar' }

/**
 * Enums e limites WPML de um par aeronave/payload, como a app os passa
 * (missionWpml). `opts`: { payloadPositionIndex, wpmlVersion }.
 */
export function wpmlOf(aircraftId, payloadId, opts = {}) {
  return missionWpml(AIRCRAFT[aircraftId], PAYLOADS[payloadId], DEFAULT_CUSTOM_SENSOR, opts)
}

/** Sensor do par (o payload próprio pode ser câmara ou LiDAR). */
const sensorOf = (payloadId, lidar = false) =>
  resolveSensor(PAYLOADS[payloadId], lidar ? CUSTOM_LIDAR : DEFAULT_CUSTOM_SENSOR)

/*
 * Pares aeronave/payload com câmara. Os LiDAR (M300 + Mapper+ e o payload
 * próprio em LiDAR) entram só na área e no corredor: a fachada, a órbita, a
 * circular e a inspecção pedem câmara na interface.
 */
const CAMERAS = [
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

/**
 * Nome curto do par nos casos dos modos (o histórico da matriz): a aeronave
 * para o primeiro payload de cada uma (m3e, m4t = grande-angular, m300rtk =
 * P1, custom), aeronave-payload para os outros.
 */
const FIRST = { M3E: 'M3E_WIDE', M4T: 'M4T_WIDE', M300RTK: 'P1', CUSTOM: 'CUSTOM' }
const shortTag = (a, p) => (FIRST[a] === p ? a.toLowerCase() : `${a}-${p}`.toLowerCase())

/** Lista de casos { name, params }. */
export function casosMatriz() {
  const casos = []
  const add = (name, params) =>
    casos.push({ name, params: { createTimeMs: T0, ...safety, ...params } })

  /* ---- área: distância, tempo, foto por waypoint, terreno ------------- */
  const areaModes = (a, p, wpml, tag) => {
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
  for (const [a, p] of CAMERAS) areaModes(a, p, wpmlOf(a, p), `${a}-${p}`.toLowerCase())

  // LiDAR: sem acções de câmara (M300 + Mapper+, e o payload próprio em LiDAR)
  const areaLidar = (name, wpml, waypoints = grelha) =>
    add(name, {
      name: 'm_area_lidar',
      waypoints,
      altitude: 80,
      speed: 5,
      wpml,
      photoIntervalM: 0,
      triggerMode: 'distance',
      sensorType: 'lidar',
      gimbalPitch: -90,
    })
  areaLidar('area-lidar-m300-mapper', wpmlOf('M300RTK', 'MAPPER_PLUS'))
  areaLidar('area-lidar-custom', wpmlOf('CUSTOM', 'CUSTOM'))
  areaLidar('area-lidar-terreno-m300-mapper', wpmlOf('M300RTK', 'MAPPER_PLUS'), [
    em(0, 0, 80),
    em(50, 0, 84.5),
    em(100, 0, 78),
    em(100, 30, 77.2),
    em(0, 30, 81),
  ])

  /* ---- corredor --------------------------------------------------------- */
  // câmara por distância e por waypoint, e LiDAR sem acções de câmara
  const axis = [em(0, 0), em(300, 20), em(600, 0)]
  const corridor = (a, p, lidarCustom, wpml, name) => {
    const sensor = sensorOf(p, lidarCustom)
    const lidar = sensor.type === 'lidar'
    for (const photoMode of lidar ? ['distance'] : ['distance', 'waypoint']) {
      const plan = generateCorridorPlan(axis, {
        sensor,
        altitude: 100,
        bufferM: 60,
        sideOverlapPct: 70,
        photoIntervalM: lidar ? 0 : 20,
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
        wpml,
        photoIntervalM: lidar ? 0 : 20,
        sensorType: sensor.type,
      })
      add(name(lidar ? 'lidar' : photoMode), params)
    }
  }
  for (const [a, p] of CAMERAS)
    corridor(a, p, false, wpmlOf(a, p), (m) => `corredor-${m}-${shortTag(a, p)}`)
  corridor(
    'M300RTK',
    'MAPPER_PLUS',
    false,
    wpmlOf('M300RTK', 'MAPPER_PLUS'),
    (m) => `corredor-${m}-m300rtk`,
  )
  corridor('CUSTOM', 'CUSTOM', true, wpmlOf('CUSTOM', 'CUSTOM'), (m) => `corredor-${m}-custom`)

  /* ---- fachada: uma inclinação, e várias com paragem e espera ---------- */
  const face = [em(0, 0), em(60, 5)]
  // o nome histórico «fachada-m4t» é o da térmica
  const faceTag = (a, p) =>
    p === 'M4T_THERMAL' ? 'm4t' : p === 'M4T_WIDE' ? 'm4t-m4t_wide' : a.toLowerCase()
  const facade = (a, p, wpml, tag) => {
    const sensor = sensorOf(p)
    const plan = generateFacePlan(face, { sensor, faceHeightM: 20, standoffM: 15, speed: 3 })
    if (plan?.error) throw new Error(`fachada: ${plan.error}`)
    add(
      `fachada-${tag}`,
      faceExportParams({
        missionName: 'm',
        plan,
        speed: 3,
        wpml,
        gimbalPitch: 0,
        sensorType: 'camera',
      }),
    )
    const multi = generateFacePlan(face, {
      sensor,
      faceHeightM: 20,
      standoffM: 15,
      speed: 3,
      hoverS: 2,
      shots: shotPitches(null, PAYLOADS[p].gimbalPitch),
    })
    add(
      `fachada-inclinacoes-${tag}`,
      faceExportParams({
        missionName: 'm',
        plan: multi,
        speed: 3,
        wpml,
        gimbalPitch: 0,
        sensorType: 'camera',
      }),
    )
  }
  for (const [a, p] of CAMERAS) facade(a, p, wpmlOf(a, p), faceTag(a, p))

  /* ---- órbita: foto (missão única e por nível), vídeo, inclinações ------ */
  const orbit = (a, p, wpml, tag) => {
    const sensor = sensorOf(p)
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
    add(`orbita-foto-${tag}`, pp)
    for (const b of orbitLevelsToBlocks(photo))
      add(
        `orbita-nivel-${b.id}-${tag}`,
        blockExportParams({ createTimeMs: T0, ...safety, ...pp }, b),
      )
    const video = generateOrbitPlan(em(0, 0), {
      sensor,
      radiusM: 40,
      levels: { count: 3, startM: 20, stepM: 10 },
      speed: 3,
      capture: 'video',
    })
    add(
      `orbita-video-${tag}`,
      orbitExportParams({ missionName: 'm', plan: video, speed: 3, wpml, sensorType: 'camera' }),
    )
    const multi = generateOrbitPlan(em(0, 0), {
      sensor,
      radiusM: 40,
      levels: { count: 2, startM: 20, stepM: 10 },
      speed: 3,
      capture: 'multi',
      shots: shotPitches(null, PAYLOADS[p].gimbalPitch),
      hoverS: 2,
    })
    add(
      `orbita-inclinacoes-${tag}`,
      orbitExportParams({ missionName: 'm', plan: multi, speed: 3, wpml, sensorType: 'camera' }),
    )
  }
  for (const [a, p] of CAMERAS) orbit(a, p, wpmlOf(a, p), shortTag(a, p))

  /* ---- circular --------------------------------------------------------- */
  const ring = [em(0, 0), em(120, 0), em(120, 90), em(0, 90)]
  const circular = (a, p, wpml, tag) => {
    const sensor = sensorOf(p)
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
      `circular-${tag}`,
      circularExportParams({
        missionName: 'm',
        plan,
        altitude: 60,
        speed: 8,
        wpml,
        sensorType: 'camera',
      }),
    )
  }
  for (const [a, p] of CAMERAS) circular(a, p, wpmlOf(a, p), shortTag(a, p))

  /* ---- pontos de inspecção: rumo e pitch por ponto, um sem foto --------- */
  const inspection = (a, p, wpml, tag) => {
    const points = [
      { point: em(0, 0), heightM: 30, heading: 270, gimbalPitch: -30 },
      { point: em(40, 10), heightM: 40 },
      { point: em(80, 0), heightM: 35, heading: -45, photo: false },
    ]
    add(
      `inspeccao-${tag}`,
      inspectionExportParams({
        missionName: 'm',
        points,
        altitude: 30,
        speed: 5,
        wpml,
        gimbalPitch: -30,
        sensorType: 'camera',
      }),
    )
  }
  for (const [a, p] of CAMERAS) inspection(a, p, wpmlOf(a, p), shortTag(a, p))

  /* ---- área pelo montador real ----------------------------------------- */
  // buildAreaExport sobre o plano do projecto (planMissionFromProject):
  // blocos por área, dupla grelha com nadir, seguimento de terreno e mosaico
  // por bateria (um ficheiro por bloco)
  const ringA = [em(0, 0), em(300, 0), em(300, 200), em(0, 200)]
  const areaCase = (
    tag,
    {
      aircraftId,
      payloadId,
      params,
      split,
      battery = null,
      terrain = null,
      custom = null,
      opts = {},
    },
  ) => {
    const n = normalizeProject({
      version: 2,
      missionName: 'm',
      drone: { aircraftId, payloadId },
      ...(custom ? { custom } : {}),
      params,
      split,
      ...(battery ? { battery } : {}),
      ring: ringA,
      bases: [{ id: 'a', label: 'A', point: em(-30, -30), radiusM: null }],
    })
    const p = planMissionFromProject(n)
    if (!p.planOk) throw new Error(`área ${tag}: ${p.planError}`)
    const terrainResult = terrain
      ? planTerrainFollow(terrain, p.planOk, {
          blocks: p.blocks,
          refPt: em(-30, -30),
          agl: p.params.altitude,
          toleranceM: 5,
        })
      : null
    if (terrainResult?.error) throw new Error(`área ${tag}: terreno ${terrainResult.error}`)
    const out = buildAreaExport({
      missionName: 'm',
      plan: p.planOk,
      terrainResult,
      blocks: p.blocks,
      spacingM: p.spacingM,
      photoMode: p.photoMode,
      sensorType: p.sensor.type,
      altitude: p.params.altitude,
      speed: p.speed,
      wpml: wpmlOf(aircraftId, payloadId, opts),
      photoIntervalM: p.intervalM,
      triggerMode: p.params.triggerMode,
      gimbalPitch: p.params.gimbalPitch,
      crosshatch: p.params.crosshatch,
      includeNadir: p.params.includeNadir,
      tieLine: p.params.tieLine,
      waypointStops: p.params.waypointStops,
    })
    if (!out.blocks) {
      add(`area-${tag}`, out.params)
      return
    }
    if (out.blocks.length < 2) throw new Error(`área ${tag}: esperavam-se 2+ blocos`)
    for (const b of out.blocks)
      add(
        `area-${tag}-${b.id}`,
        blockExportParams({ createTimeMs: T0, ...safety, ...out.params }, b),
      )
  }
  const base = { altitude: 80, speed: 8, frontOverlap: 80, sideOverlap: 70, angle: 90 }
  // dupla grelha com nadir e blocos por área, em cada câmara e nos LiDAR
  const projectPairs = [
    ...CAMERAS.map(([a, p]) => [a, p, null]),
    ['M300RTK', 'MAPPER_PLUS', null],
    ['CUSTOM', 'CUSTOM', CUSTOM_LIDAR],
  ]
  for (const [a, p, custom] of projectPairs) {
    const tag = custom ? 'custom-lidar' : a === 'M3E' ? 'm3e' : `${a}-${p}`.toLowerCase()
    areaCase(`blocos-${tag}`, {
      aircraftId: a,
      payloadId: p,
      custom,
      params: { ...base, gimbalPitch: -90 },
      split: { mode: 'area', maxAreaHa: 2.5 },
    })
    areaCase(`cruzada-nadir-${tag}`, {
      aircraftId: a,
      payloadId: p,
      custom,
      params: { ...base, gimbalPitch: -60, crosshatch: true, includeNadir: true },
      split: { mode: 'none' },
    })
  }
  areaCase('terreno-m300rtk', {
    aircraftId: 'M300RTK',
    payloadId: 'P1',
    params: { ...base, gimbalPitch: -90, triggerMode: 'waypoint', waypointStops: 'all' },
    split: { mode: 'none' },
    // rampa suave para Este: alturas por waypoint sem tecto
    terrain: { elevationAt: (lon) => 200 + 0.05 * ((lon + 7.2) * mL) },
  })
  areaCase('mosaico-bateria-m4t', {
    aircraftId: 'M4T',
    payloadId: 'M4T_WIDE',
    params: {
      altitude: 60,
      speed: 6,
      frontOverlap: 80,
      sideOverlap: 70,
      angle: 0,
      gimbalPitch: -90,
    },
    split: { mode: 'battery', maxSide: 500 },
    // tempo útil curto: o lado do quadrado fica pequeno e a área parte-se
    battery: { batteryId: 'padrao', usefulMin: 5 },
  })

  /* ---- opções do projecto: posição do payload ------------------------- */
  // 1 e 2 nas aeronaves com três suportes (M300 RTK e a própria), em todos
  // os modos: o suporte vai para o payloadInfo, o payloadParam e cada acção
  for (const pos of [1, 2]) {
    for (const [a, p] of [
      ['M300RTK', 'P1'],
      ['CUSTOM', 'CUSTOM'],
    ]) {
      const wpml = wpmlOf(a, p, { payloadPositionIndex: pos })
      const tag = `${a}-${p}-pos${pos}`.toLowerCase()
      areaModes(a, p, wpml, tag)
      corridor(a, p, false, wpml, (m) => `corredor-${m}-${tag}`)
      facade(a, p, wpml, tag)
      orbit(a, p, wpml, tag)
      circular(a, p, wpml, tag)
      inspection(a, p, wpml, tag)
    }
    areaLidar(
      `area-lidar-m300-mapper-pos${pos}`,
      wpmlOf('M300RTK', 'MAPPER_PLUS', { payloadPositionIndex: pos }),
    )
    corridor(
      'M300RTK',
      'MAPPER_PLUS',
      false,
      wpmlOf('M300RTK', 'MAPPER_PLUS', { payloadPositionIndex: pos }),
      (m) => `corredor-${m}-m300rtk-mapper-pos${pos}`,
    )
    areaCase(`cruzada-nadir-m300rtk-p1-pos${pos}`, {
      aircraftId: 'M300RTK',
      payloadId: 'P1',
      params: { ...base, gimbalPitch: -60, crosshatch: true, includeNadir: true },
      split: { mode: 'none' },
      opts: { payloadPositionIndex: pos },
    })
  }

  /* ---- opções do projecto: versão do namespace ------------------------- */
  // 1.0.3 e 1.0.6 em cada par, nos modos com acções diferentes (área por
  // distância, órbita em vídeo, inspecção) e na área em blocos
  for (const ver of ['1.0.3', '1.0.6']) {
    const v = ver.replace(/\./g, '')
    for (const [a, p] of CAMERAS) {
      const wpml = wpmlOf(a, p, { wpmlVersion: ver })
      const tag = `${a}-${p}-ns${v}`.toLowerCase()
      areaModes(a, p, wpml, tag)
      orbit(a, p, wpml, tag)
      inspection(a, p, wpml, tag)
    }
    areaLidar(
      `area-lidar-m300-mapper-ns${v}`,
      wpmlOf('M300RTK', 'MAPPER_PLUS', { wpmlVersion: ver }),
    )
    areaCase(`blocos-m4t-ns${v}`, {
      aircraftId: 'M4T',
      payloadId: 'M4T_THERMAL',
      params: { ...base, gimbalPitch: -90 },
      split: { mode: 'area', maxAreaHa: 2.5 },
      opts: { wpmlVersion: ver },
    })
  }
  return casos
}

/** Os dois ficheiros de cada caso. */
export function ficheiros(params) {
  return { template: buildTemplateKML(params), waylines: buildWaylinesWPML(params) }
}
