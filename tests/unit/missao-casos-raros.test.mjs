/**
 * Módulos de src/mission em casos raros: a área com um buraco planeada em
 * células da âncora (cada célula só leva os buracos que a tocam), as fotos do
 * corredor no mapa, a rota activa da órbita que descola numa base, as notas
 * de versão de um projecto antigo, o nome da bateria de origem, o perfil de
 * elevação sem relevo, com alturas em falta ou com buracos no relevo, a
 * incerteza com LiDAR e com o gimbal quase horizontal, e as métricas de
 * qualidade sem plano.
 */
import { describe, expect, test } from 'vitest'
import * as turf from '@turf/turf'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { VERSION_NOTES, notesSince } from '../../src/data/versionNotes.js'
import { activeRoute } from '../../src/mission/activeRoute.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { buildProfile } from '../../src/mission/elevationProfile.js'
import { batteryLabel } from '../../src/mission/equipment.js'
import {
  areaPhotoPoints,
  corridorPhotoPoints,
  photoPointsAlong,
  photosOnRoute,
} from '../../src/mission/photoPoints.js'
import { versionBefore } from '../../src/mission/project.js'
import { qualityStatsFor } from '../../src/mission/qualityStats.js'
import {
  motionBlur,
  routeChecks,
  terrainReliefRange,
  uncertaintyIntervals,
} from '../../src/mission/uncertainty.js'
import { translate } from '../../src/i18n.jsx'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { resolveSensor } from '../../src/utils/geo.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const xOf = (lon) => (lon + 9.14) * mLon
const yOf = (lat) => (lat - lat0) * 110574
const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]
const camera = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const lidar = resolveSensor(PAYLOADS.MAPPER_PLUS, DEFAULT_CUSTOM_SENSOR)
const dist = (a, b) => turf.distance(a, b, { units: 'meters' })
// um ponto a `m` metros exactos de `a`, para leste (a distância do turf)
const este = (a, m) =>
  turf.destination(a, m / 1000, 90, { units: 'kilometers' }).geometry.coordinates

describe('área com um buraco planeada em células da âncora', () => {
  const ring = rect(0, 0, 600, 400)
  const buraco = rect(100, 150, 100, 100)
  const cells = [rect(0, 0, 300, 400), rect(300, 0, 300, 400)]
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
    holes: [buraco],
  }
  const dentro = (p) => xOf(p[0]) > 101 && xOf(p[0]) < 199 && yOf(p[1]) > 151 && yOf(p[1]) < 249

  test('a célula que o buraco toca contorna-o; a outra fica como sem buraco', () => {
    const plano = planArea(ring, cells, opts)
    expect(plano.error).toBeUndefined()
    const [oeste, leste] = plano.cellPlans
    // nenhuma faixa da célula oeste passa por dentro do buraco
    for (const l of oeste.lines) {
      const meio = [(l[0][0] + l[1][0]) / 2, (l[0][1] + l[1][1]) / 2]
      expect(dentro(meio)).toBe(false)
    }
    expect(oeste.lines.length).toBeGreaterThan(
      planArea(ring, cells, { ...opts, holes: [] }).cellPlans[0].lines.length,
    )
    // a célula leste não toca o buraco: o mesmo plano que sem ele
    const semBuraco = planArea(ring, cells, { ...opts, holes: [] }).cellPlans[1]
    expect(leste.lines).toEqual(semBuraco.lines)
    // dar os buracos por célula (o mosaico) dá o mesmo
    const porCelula = planArea(ring, cells, { ...opts, cellHoles: [[buraco], []] })
    expect(porCelula.cellPlans[0].lines).toEqual(oeste.lines)
  })

  test('um buraco degenerado (dois pontos) não rebenta nem conta', () => {
    const plano = planArea(ring, cells, { ...opts, holes: [[em(10, 10), em(20, 20)]] })
    const semBuraco = planArea(ring, cells, { ...opts, holes: [] })
    expect(plano.cellPlans.map((p) => p.lines)).toEqual(semBuraco.cellPlans.map((p) => p.lines))
  })
})

describe('fotos no mapa: corredor e casos raros', () => {
  const plan = generateCorridorPlan([em(0, 0), em(800, 0), em(1400, 300)], {
    sensor: camera,
    altitude: 60,
    bufferM: 50,
    sideOverlapPct: 70,
    photoIntervalM: 20,
    speed: 8,
  })

  test('corredor: fotos ao longo das passagens, a cada intervalo, perto da contagem do plano', () => {
    const fotos = corridorPhotoPoints(plan, 20)
    // as passagens vizinhas ligam-se por viragens curtas: o intervalo continua
    // por elas, e a contagem fica a menos de uma foto por passagem da do plano
    expect(Math.abs(fotos.length - plan.stats.photoCount)).toBeLessThanOrEqual(plan.stats.runCount)
    // cada foto em cima da rota (a menos de 1 m de um troço)
    const rota = turf.lineString(plan.waypoints.map((w) => [w[0], w[1]]))
    for (const f of fotos.filter((_, i) => i % 7 === 0))
      expect(turf.pointToLineDistance(f, rota, { units: 'meters' })).toBeLessThan(1)
    // seguidas, ao longo de uma passagem, a 20 m
    expect(dist(fotos[1], fotos[2])).toBeCloseTo(20, 0)
    expect(corridorPhotoPoints({ error: 'no-coverage' }, 20)).toEqual([])
    expect(corridorPhotoPoints(null, 20)).toEqual([])
  })

  test('troço de 0 m, o tecto de pontos e o grupo de um só waypoint', () => {
    const a = em(0, 0)
    const b = este(a, 100)
    // o waypoint repetido não divide por zero: as fotos seguem do mesmo sítio
    const rep = photoPointsAlong([a, a, b], [[0, 2]], 25)
    expect(rep).toHaveLength(5)
    expect(dist(rep[0], a)).toBeLessThan(0.01)
    expect(dist(rep[4], b)).toBeLessThan(0.01)
    // o mapa não aguenta infinitos: o tecto corta
    expect(photoPointsAlong([a, b], [[0, 1]], 1, { limit: 7 })).toHaveLength(7)
    // um grupo de um só waypoint é uma foto nesse ponto
    expect(photoPointsAlong([a, b], [[1, 1]], 10)).toEqual([[b[0], b[1]]])
    // sem plano nem blocos: nada
    expect(areaPhotoPoints(null, null, { intervalM: 10, spacingM: 20 })).toEqual([])
  })

  test('na rota 3D: sem alturas não há foto a desenhar; rotas inválidas, nada', () => {
    const plana = [em(0, 0), em(100, 0)]
    expect(photosOnRoute([em(50, 0)], plana)).toEqual([])
    expect(photosOnRoute([em(50, 0)], [[...em(0, 0), 10]])).toEqual([])
    expect(photosOnRoute(null, plana)).toEqual([])
    // todos os troços com 0 m: nada a projectar
    const parado = [
      [...em(0, 0), 10],
      [...em(0, 0), 10],
    ]
    expect(photosOnRoute([em(0, 0)], parado)).toEqual([])
    // saltos que não são lista não contam
    const subida = [
      [...em(0, 0), 10],
      [...em(100, 0), 30],
    ]
    expect(photosOnRoute([em(50, 0)], subida, { breaks: 'x' })).toEqual([[...em(50, 0), 20]])
  })
})

describe('rota activa da órbita que descola numa base', () => {
  const wps = [
    [-7.2, 40.4, 30],
    [-7.199, 40.4, 30],
  ]
  const elevationAt = () => 250

  test('na base: alturas relativas a ela e a cota de referência a da base', () => {
    const orbitTakeoff = { mode: 'base', dh: 20, refElev: 180, error: undefined }
    const r = activeRoute({
      missionMode: 'orbit',
      elevationAt,
      orbitPlan: { waypoints: wps, perWaypoint: [{ actions: ['takePhoto'] }, null] },
      orbitPoi: [-7.2, 40.401],
      orbitTakeoff,
      altitude: 100,
    })
    expect(r.waypoints.map((w) => w[2])).toEqual([50, 50])
    expect(r.refElev).toBe(180)
    expect(r.perWaypoint).toEqual([{ actions: ['takePhoto'] }, null])
  })

  test('base com erro (sem relevo, base que já não existe): no chão do POI', () => {
    for (const orbitTakeoff of [
      { mode: 'base', dh: 0, refElev: null, error: 'terrain-missing' },
      { mode: 'base', dh: 0, refElev: null, error: 'base-missing' },
      { mode: 'target', dh: 0, refElev: 250 },
    ]) {
      const r = activeRoute({
        missionMode: 'orbit',
        elevationAt,
        orbitPlan: { waypoints: wps },
        orbitPoi: [-7.2, 40.401],
        orbitTakeoff,
        altitude: 100,
      })
      expect(r).toEqual({ waypoints: wps, refElev: 250, perWaypoint: null })
    }
  })
})

describe('versões: as notas de um projecto antigo', () => {
  test('compara número a número, e uma versão em falta é a mais antiga', () => {
    expect(versionBefore('1.4.2', '1.5.0')).toBe(true)
    expect(versionBefore('1.5.0', '1.5.0')).toBe(false)
    expect(versionBefore('1.10.0', '1.9.9')).toBe(false)
    expect(versionBefore('1.9.9', '1.10.0')).toBe(true)
    expect(versionBefore('2', '1.9.9')).toBe(false)
    expect(versionBefore(null, '1.0.0')).toBe(true)
    expect(versionBefore(undefined, undefined)).toBe(false)
  })

  test('um projecto da 1.4.2 vê as notas da 1.5.0 e da 1.6.0; um da 1.5.0, a da 1.6.0; um da 1.6.0, nenhuma; sem versão, todas', () => {
    expect(notesSince('1.4.2', versionBefore).map((n) => n.version)).toEqual(['1.5.0', '1.6.0'])
    expect(notesSince('1.5.0', versionBefore).map((n) => n.version)).toEqual(['1.6.0'])
    expect(notesSince('1.6.0', versionBefore)).toEqual([])
    expect(notesSince(null, versionBefore)).toHaveLength(VERSION_NOTES.length)
  })
})

describe('nome da bateria no ecrã', () => {
  const pt = (k) => translate('pt', k)
  const en = (k) => translate('en', k)

  test('a de origem traduz-se; as do operador ficam como ele as chamou', () => {
    expect(batteryLabel({ id: 'padrao', label: 'Bateria padrão' }, pt)).toBe('Bateria de origem')
    expect(batteryLabel({ id: 'padrao', label: '' }, en)).toBe('Stock battery')
    // a de origem renomeada pelo operador fica com o nome dele
    expect(batteryLabel({ id: 'padrao', label: 'Amarelas' }, en)).toBe('Amarelas')
    expect(batteryLabel({ id: 'TB65', label: 'TB65' }, en)).toBe('TB65')
    expect(batteryLabel({ id: 'bateria-2', label: '' }, pt)).toBe('bateria-2')
    expect(batteryLabel({}, pt)).toBe('')
    expect(batteryLabel(null, pt)).toBe('')
  })
})

describe('perfil de elevação em casos raros', () => {
  const rota = [
    [...em(0, 0), 60],
    [...em(100, 0)],
    [...em(200, 0), 100],
    [...em(300, 0), 80],
    [...em(400, 0), 90],
  ]

  test('sem relevo: a linha de voo, sem terreno nem folga', () => {
    const p = buildProfile(rota, null, 150)
    expect(p.ok).toBe(true)
    expect(p.hasTerrain).toBe(false)
    expect(p).toMatchObject({ gMin: null, gMax: null, aglMin: null, aglMax: null, worst: null })
    expect(p.samples.every((s) => s.ground === null)).toBe(true)
    expect(p.wpCount).toBe(5)
    expect(p.totalM).toBeCloseTo(400, 0)
    // um relevo sem elevationAt é o mesmo que nenhum
    expect(buildProfile(rota, {}, 150).hasTerrain).toBe(false)
  })

  test('alturas em falta: a mediana das que há (número par: a média das duas do meio)', () => {
    const p = buildProfile(rota, null, 150)
    // 60, 100, 80, 90 → (80 + 90) / 2 = 85
    expect(p.nodes[1].alt).toBe(150 + 85)
    // nenhuma altura: 100 m; sem cota de referência, sobre zero
    const semAlturas = buildProfile([em(0, 0), em(100, 0)], null, null)
    expect(semAlturas.nodes.map((n) => n.alt)).toEqual([100, 100])
    expect(semAlturas.yMin).toBe(95)
    expect(semAlturas.yMax).toBe(105)
  })

  test('menos de dois pontos válidos: perfil vazio', () => {
    for (const w of [null, undefined, [], [em(0, 0)], [[Number.NaN, 38.7], em(0, 0)]]) {
      const p = buildProfile(w, null, 0)
      expect(p.ok).toBe(false)
      expect(p.samples).toEqual([])
    }
  })

  test('waypoint repetido (0 m) e buracos no relevo: a folga só onde há relevo', () => {
    const elevationAt = (lon) => (xOf(lon) < 150 ? 120 : null)
    const p = buildProfile(
      [
        [...em(0, 0), 50],
        [...em(0, 0), 50],
        [...em(300, 0), 50],
      ],
      { elevationAt },
      100,
    )
    expect(p.totalM).toBeCloseTo(300, 0)
    expect(p.hasTerrain).toBe(true)
    expect(p.gMin).toBe(120)
    expect(p.aglMin).toBe(30)
    expect(p.samples.some((s) => s.ground === null)).toBe(true)
  })
})

describe('incerteza sem câmara e com o gimbal quase horizontal', () => {
  test('LiDAR: sem GSD, sem pegada ao longo nem sobreposição frontal; a lateral conta', () => {
    const u = uncertaintyIntervals({
      sensor: lidar,
      altitude: 80,
      spacing: 60,
      interval: null,
      posError: { verticalM: 3, horizontalM: 2, mode: 'gnss' },
    })
    expect(u.gsd).toBeNull()
    expect(u.footprintAlong).toBeNull()
    expect(u.front).toBeNull()
    expect(u.side[0]).toBeLessThan(u.side[1])
    expect(u.agl).toEqual([77, 83])
    // 60 m de espaçamento numa faixa de ~113 m: 47 % no melhor caso, abaixo dos 50 %
    expect(u.belowMinimum).toBe(true)
  })

  test('sem erro de posicionamento indicado: GNSS a zero; seguimento sem tolerância: a nominal', () => {
    const u = uncertaintyIntervals({
      sensor: camera,
      altitude: 100,
      spacing: 30,
      interval: 20,
      terrainFollow: true,
    })
    expect(u.agl).toEqual([100, 100])
    expect(u.inputs).toMatchObject({
      verticalM: 0,
      horizontalM: 0,
      mode: 'gnss',
      terrainFollow: true,
    })
    expect(u.gsd[0]).toBeCloseTo(u.gsd[1], 12)
  })

  test('gimbal quase horizontal (fachada): sem GSD ao centro', () => {
    const u = uncertaintyIntervals({
      sensor: camera,
      altitude: 40,
      gimbalPitch: -10,
      spacing: 10,
      interval: 5,
      posError: { verticalM: 1, horizontalM: 1 },
    })
    expect(u.gsd).toBeNull()
    expect(u.front).not.toBeNull()
  })

  test('relevo face à referência: sem referência ou sem relevo nos pontos, nada', () => {
    const wps = [em(0, 0), em(100, 0), em(200, 0)]
    const subida = (lon) => 100 + xOf(lon) / 10
    const r = terrainReliefRange(wps, subida, em(0, 0))
    expect(r.minM).toBe(0)
    expect(r.maxM).toBeCloseTo(20, 9)
    expect(r.samples).toBe(3)
    expect(terrainReliefRange(wps, subida, null)).toBeNull()
    expect(terrainReliefRange(wps, (lon) => (xOf(lon) > 50 ? null : 100), em(0, 0))).toEqual({
      minM: 0,
      maxM: 0,
      samples: 1,
    })
    expect(terrainReliefRange(wps, () => null, em(0, 0))).toBeNull()
    // muitos waypoints: amostra-se de passo em passo
    const muitos = Array.from({ length: 1000 }, (_, i) => em(i, 0))
    expect(terrainReliefRange(muitos, subida, em(0, 0), { maxSamples: 100 }).samples).toBe(100)
  })

  test('arrastamento sem GSD: só em cm; rota 2D: os repetidos contam só no plano', () => {
    const b = motionBlur({ speed: 10, gsdCm: 0 })
    expect(b.map((x) => x.blurPx)).toEqual([null, null])
    expect(b[1].blurCm).toBeCloseTo(2, 9)
    const r = routeChecks([em(0, 0), em(0.3, 0), em(100, 0)], { speed: 8 })
    expect(r.duplicates).toEqual([1])
    expect(r.climb).toEqual([])
  })
})

describe('métricas de qualidade sem plano', () => {
  test('área sem métricas ainda: tudo vazio, nadir', () => {
    expect(qualityStatsFor('area', { area: {}, sensor: camera })).toEqual({
      gsd: null,
      gimbalPitch: -90,
      uncertainty: null,
      footprint: null,
      spacing: null,
      interval: null,
      intervalS: null,
      intervalManual: false,
      triggerMode: null,
      speed: null,
      pointDensity: null,
    })
  })

  test('circular sem plano nem voo: sem GSD; corredor sem intervalo: nenhum', () => {
    const c = qualityStatsFor('circular', { area: {}, sensor: camera, circularPitch: -44.6 })
    expect(c).toMatchObject({
      gsd: null,
      gimbalPitch: -45,
      interval: null,
      triggerMode: 'distance',
    })
    const corr = qualityStatsFor('corridor', {
      area: {},
      sensor: camera,
      corridorFlight: { altitude: 60, sideOverlap: 70 },
      corridorSpeed: 8,
    })
    expect(corr.interval).toBeNull()
    expect(corr.spacing).toBeCloseTo(corr.footprint.across * 0.3, 9)
  })
})
