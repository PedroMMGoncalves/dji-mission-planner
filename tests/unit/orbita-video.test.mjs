/**
 * Orbita em video: espiral continua com startRecord/stopRecord
 * (src/utils/orbit.js, src/utils/exporters.js, src/mission/exportParams.js).
 */
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_ORBIT_CONFIG,
  generateOrbitPlan,
  normalizeOrbitConfig,
  orbitLevelsToBlocks,
} from '../../src/utils/orbit.js'
import { buildWaylinesWPML, validateExportParams } from '../../src/utils/exporters.js'
import { orbitExportParams } from '../../src/mission/exportParams.js'
import { resolveSensor } from '../../src/utils/geo.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import * as turf from '@turf/turf'

const poi = [-9.14, 38.7]
const sensor = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const wpml = { droneEnumValue: 77, payloadEnumValue: 66, payloadPositionIndex: 0 }
const opts = (extra) => ({
  sensor,
  radiusM: 60,
  levels: { count: 5, startM: 10, stepM: 10 },
  horizontalOverlapPct: 80,
  poiHeightM: 0,
  speed: 5,
  ...extra,
})
const count = (xml, re) => (xml.match(re) || []).length

describe('espiral em video', () => {
  const video = generateOrbitPlan(poi, opts({ capture: 'video' }))
  const photo = generateOrbitPlan(poi, opts())
  const n = video.stats.pointsPerOrbit

  test('5 niveis sao 4 voltas, do primeiro ao ultimo nivel, a subir sempre', () => {
    expect(video.stats.capture).toBe('video')
    expect(video.stats.turnCount).toBe(4)
    expect(video.stats.waypointCount).toBe(4 * n + 1)
    expect(video.waypoints[0][2]).toBe(10)
    expect(video.waypoints.at(-1)[2]).toBe(50)
    for (let i = 1; i < video.waypoints.length; i++) {
      expect(video.waypoints[i][2]).toBeGreaterThan(video.waypoints[i - 1][2])
    }
    // uma volta sobe exactamente um passo
    expect(video.waypoints[n][2]).toBeCloseTo(20, 6)
  })

  test('a mesma geometria horizontal dos aneis: raio, rumo ao POI, fecha no rumo inicial', () => {
    for (const w of video.waypoints) {
      expect(turf.distance(w, poi, { units: 'meters' })).toBeCloseTo(60, 0)
    }
    expect(video.waypoints.at(-1).slice(0, 2)).toEqual(video.waypoints[0].slice(0, 2))
    expect(video.stats.pointsPerOrbit).toBe(photo.stats.pointsPerOrbit)
    video.perWaypoint.forEach((pw, i) => {
      const brg = ((Math.round(turf.bearing(video.waypoints[i], poi)) % 360) + 360) % 360
      expect(pw.heading).toBe(brg)
    })
  })

  test('grava do primeiro ao ultimo ponto e nunca fotografa', () => {
    expect(video.perWaypoint[0].actions).toEqual(['startRecord'])
    expect(video.perWaypoint.at(-1).actions).toEqual(['stopRecord'])
    expect(video.perWaypoint.slice(1, -1).every((pw) => pw.actions.length === 0)).toBe(true)
    expect(video.stats.photoCount).toBe(0)
    expect(video.stats.transitionM).toBeNull()
  })

  test('o gimbal reaponta ao centro em cada ponto, a descer com a altura', () => {
    const pitches = video.perWaypoint.map((pw) => pw.gimbalPitch)
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).toBeLessThanOrEqual(pitches[i - 1])
    expect(pitches[0]).toBe(-Math.round((Math.atan2(10, 60) * 180) / Math.PI))
    expect(pitches.at(-1)).toBe(-Math.round((Math.atan2(50, 60) * 180) / Math.PI))
  })

  test('um so nivel: uma volta a altura constante, a gravar', () => {
    const one = generateOrbitPlan(
      poi,
      opts({ capture: 'video', levels: { count: 1, startM: 30, stepM: 10 } }),
    )
    expect(one.stats.turnCount).toBe(1)
    expect(one.stats.waypointCount).toBe(one.stats.pointsPerOrbit + 1)
    expect(new Set(one.waypoints.map((w) => w[2]))).toEqual(new Set([30]))
    expect(one.perWaypoint[0].actions).toEqual(['startRecord'])
    expect(one.perWaypoint.at(-1).actions).toEqual(['stopRecord'])
  })

  test('cada volta e um nivel para a pre-visualizacao e os blocos cobrem todos os pontos', () => {
    expect(video.perLevel.map((l) => l.heightM)).toEqual([10, 20, 30, 40])
    const blocks = orbitLevelsToBlocks(video)
    expect(blocks.reduce((s, b) => s + b.waypoints.length, 0)).toBe(video.stats.waypointCount)
    expect(blocks.at(-1).waypoints.length).toBe(n + 1)
  })

  test('em fotografia nada muda: aneis, uma foto por ponto, transicao de uma corda', () => {
    expect(photo.stats.capture).toBe('photo')
    expect(photo.stats.turnCount).toBe(5)
    expect(photo.stats.photoCount).toBe(photo.stats.waypointCount)
    expect(photo.perWaypoint.every((pw) => pw.actions[0] === 'takePhoto')).toBe(true)
    expect(photo.stats.transitionM).toBeCloseTo(photo.stats.chordM, 6)
  })
})

describe('exportacao da orbita em video', () => {
  const plan = generateOrbitPlan(
    poi,
    opts({ capture: 'video', levels: { count: 3, startM: 20, stepM: 10 } }),
  )
  const params = orbitExportParams({
    missionName: 'Chamine',
    plan,
    speed: 5,
    wpml,
    sensorType: 'camera',
  })
  const xml = buildWaylinesWPML(params)

  test('nome com a variante, validacao passa', () => {
    expect(params.name).toBe('Chamine_orbit-video_n3')
    expect(validateExportParams(params)).toBe(params)
    const foto = orbitExportParams({
      missionName: 'Chamine',
      plan: generateOrbitPlan(poi, opts({ levels: { count: 3, startM: 20, stepM: 10 } })),
      speed: 5,
      wpml,
      sensorType: 'camera',
    })
    expect(foto.name).toBe('Chamine_orbit_n3')
  })

  test('um startRecord no primeiro ponto, um stopRecord no ultimo, nenhum takePhoto', () => {
    expect(count(xml, /<wpml:actionActuatorFunc>startRecord</g)).toBe(1)
    expect(count(xml, /<wpml:actionActuatorFunc>stopRecord</g)).toBe(1)
    expect(count(xml, /<wpml:actionActuatorFunc>takePhoto</g)).toBe(0)
    const placemarks = xml.split('<Placemark>').slice(1)
    expect(placemarks[0]).toMatch(/startRecord/)
    expect(placemarks.at(-1)).toMatch(/stopRecord/)
    expect(placemarks.slice(1, -1).some((p) => /Record/.test(p))).toBe(false)
  })

  test('parametros das accoes conforme common-element.md', () => {
    const start =
      /<wpml:actionActuatorFunc>startRecord<\/wpml:actionActuatorFunc>\s*<wpml:actionActuatorFuncParam>([\s\S]*?)<\/wpml:actionActuatorFuncParam>/.exec(
        xml,
      )[1]
    expect(start).toMatch(/<wpml:payloadPositionIndex>0</)
    expect(start).toMatch(/<wpml:useGlobalPayloadLensIndex>0</)
    const stop =
      /<wpml:actionActuatorFunc>stopRecord<\/wpml:actionActuatorFunc>\s*<wpml:actionActuatorFuncParam>([\s\S]*?)<\/wpml:actionActuatorFuncParam>/.exec(
        xml,
      )[1]
    expect(stop).toMatch(/<wpml:payloadPositionIndex>0</)
    expect(stop).not.toMatch(/useGlobalPayloadLensIndex/)
    // a gravacao arranca depois de o gimbal apontar (grupo em sequencia)
    const first = xml.split('<Placemark>')[1]
    expect(first.indexOf('gimbalRotate')).toBeLessThan(first.indexOf('startRecord'))
  })

  test('gimbal e rumo em todos os pontos, voo curvo continuo, altura executada a subir', () => {
    expect(count(xml, /<wpml:actionActuatorFunc>gimbalRotate</g)).toBe(plan.stats.waypointCount + 1)
    expect(count(xml, /toPointAndPassWithContinuityCurvature/g)).toBe(plan.stats.waypointCount)
    const hs = [...xml.matchAll(/<wpml:executeHeight>([-\d.]+)</g)].map((m) => Number(m[1]))
    expect(hs[0]).toBe(20)
    expect(hs.at(-1)).toBe(40)
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThan(hs[i - 1])
  })

  test('accoes desconhecidas continuam a ser ignoradas', () => {
    const p = {
      ...params,
      perWaypoint: params.perWaypoint.map((pw) => ({ ...pw, actions: ['zoom'] })),
    }
    expect(buildWaylinesWPML(p)).not.toMatch(/<wpml:actionActuatorFunc>zoom</)
  })
})

describe('configuracao guardada', () => {
  test('capture: por omissao fotografia, video aceite, lixo cai na omissao', () => {
    expect(DEFAULT_ORBIT_CONFIG.capture).toBe('photo')
    expect(normalizeOrbitConfig(null).capture).toBe('photo')
    expect(normalizeOrbitConfig({ capture: 'video' }).capture).toBe('video')
    expect(normalizeOrbitConfig({ capture: 'spiral' }).capture).toBe('photo')
  })
})
