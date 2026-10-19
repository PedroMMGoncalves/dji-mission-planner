/*
 * Pacote B da revisao da exportacao (docs/REVISAO-EXPORTACAO-2026-10.md):
 * B2 lente por accao nos payloads multi-lente; M7 gimbalRotate so quando o
 * pitch muda; M9 velocidade de transicao em [1, 15].
 */
import { describe, expect, test } from 'vitest'
import { buildWaylinesWPML } from '../../src/utils/exporters.js'
import { wpmlOf } from '../lib/wpml-matriz.mjs'

const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-7.2 + x / mL, lat + y / 110574]
const wps = [em(0, 0), em(100, 0), em(100, 30), em(0, 30)]
const base = {
  name: 'b',
  waypoints: wps,
  altitude: 100,
  speed: 10,
  photoIntervalM: 20,
  triggerMode: 'distance',
  sensorType: 'camera',
  gimbalPitch: -90,
  createTimeMs: 1760000000000,
}
const count = (xml, re) => (xml.match(re) || []).length

describe('B2: a lente vai em cada accao de camara nos payloads multi-lente', () => {
  test('M4T termica: payloadLensIndex ir antes de useGlobalPayloadLensIndex', () => {
    const xml = buildWaylinesWPML({ ...base, wpml: wpmlOf('M4T', 'M4T_THERMAL') })
    expect(xml).toMatch(
      /<wpml:payloadPositionIndex>0<\/wpml:payloadPositionIndex>\s*<wpml:payloadLensIndex>ir<\/wpml:payloadLensIndex>\s*<wpml:useGlobalPayloadLensIndex>0</,
    )
  })
  test('M4T grande-angular: wide; M3E e P1: sem lista, como no ficheiro que voou', () => {
    expect(buildWaylinesWPML({ ...base, wpml: wpmlOf('M4T', 'M4T_WIDE') })).toMatch(
      /<wpml:payloadLensIndex>wide</,
    )
    expect(buildWaylinesWPML({ ...base, wpml: wpmlOf('M3E', 'M3E_WIDE') })).not.toMatch(
      /payloadLensIndex/,
    )
    expect(buildWaylinesWPML({ ...base, wpml: wpmlOf('M300RTK', 'P1') })).not.toMatch(
      /payloadLensIndex/,
    )
  })
  test('tambem nas accoes por waypoint (takePhoto e startRecord), nunca no stopRecord', () => {
    const xml = buildWaylinesWPML({
      ...base,
      wpml: wpmlOf('M4T', 'M4T_THERMAL'),
      photoIntervalM: 0,
      perWaypoint: [
        { actions: ['startRecord'] },
        { actions: ['takePhoto'] },
        null,
        { actions: ['stopRecord'] },
      ],
    })
    const acoes = xml.split('<wpml:action>').slice(1)
    const de = (f) => acoes.filter((a) => a.includes(`<wpml:actionActuatorFunc>${f}<`))
    expect(de('startRecord')[0]).toMatch(/payloadLensIndex>ir</)
    expect(de('takePhoto')[0]).toMatch(/payloadLensIndex>ir</)
    expect(de('stopRecord')[0]).not.toMatch(/payloadLensIndex|useGlobalPayloadLensIndex/)
  })
  test('um imageFormat fora do formato nao chega ao ficheiro', () => {
    const xml = buildWaylinesWPML({
      ...base,
      wpml: { ...wpmlOf('M4T', 'M4T_WIDE'), imageFormat: 'Wide<' },
    })
    expect(xml).not.toMatch(/payloadLensIndex/)
  })
})

describe('M7: gimbalRotate por waypoint so quando o pitch muda', () => {
  const wpml = wpmlOf('M3E', 'M3E_WIDE')
  test('pitch igual ao global no waypoint 0 e repetido a seguir: um so grupo de gimbal', () => {
    const xml = buildWaylinesWPML({
      ...base,
      wpml,
      photoIntervalM: 0,
      perWaypoint: wps.map(() => ({ gimbalPitch: -90, actions: ['takePhoto'] })),
    })
    expect(count(xml, /<wpml:actionActuatorFunc>gimbalRotate</g)).toBe(1)
    expect(count(xml, /<wpml:actionActuatorFunc>takePhoto</g)).toBe(4)
  })
  test('cada mudanca de pitch escreve um gimbalRotate, e so essa', () => {
    const xml = buildWaylinesWPML({
      ...base,
      wpml,
      photoIntervalM: 0,
      perWaypoint: [
        { gimbalPitch: -60 },
        { gimbalPitch: -60 },
        { gimbalPitch: -45 },
        { gimbalPitch: -45 },
      ],
    })
    // global -90 no 0, depois -60 no 0, -45 no 2
    const pitches = [...xml.matchAll(/<wpml:gimbalPitchRotateAngle>([^<]+)</g)].map((m) => m[1])
    expect(pitches).toEqual(['-90', '-60', '-45'])
  })
  test('LiDAR: sem grupo global, o primeiro pitch por waypoint conta como mudanca', () => {
    const xml = buildWaylinesWPML({
      ...base,
      wpml: wpmlOf('M300RTK', 'MAPPER_PLUS'),
      sensorType: 'lidar',
      photoIntervalM: 0,
      perWaypoint: [{ gimbalPitch: -90 }, { gimbalPitch: -90 }, null, null],
    })
    expect(count(xml, /<wpml:actionActuatorFunc>gimbalRotate</g)).toBe(1)
  })
})

describe('M9: velocidade de transicao em [1, 15]', () => {
  const wpml = wpmlOf('CUSTOM', 'CUSTOM')
  test('abaixo de 1 sobe a 1; acima de 15 desce a 15; no meio fica', () => {
    const trans = (speed) =>
      buildWaylinesWPML({ ...base, wpml, speed }).match(/<wpml:globalTransitionalSpeed>([^<]+)</)[1]
    expect(trans(0.5)).toBe('1')
    expect(trans(20)).toBe('15')
    expect(trans(8)).toBe('8')
  })
})
