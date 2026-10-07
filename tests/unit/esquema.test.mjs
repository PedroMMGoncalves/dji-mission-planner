/**
 * O ficheiro de projecto tem um contrato publico: public/schema/project-v2.schema.json.
 * O que a aplicação escreve (serializeProject a partir dos defaults reais e
 * de um estado completo) tem de validar contra ele, e lixo tem de falhar.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  PROJECT_SCHEMA_URL,
  normalizeProject,
  serializeProject,
} from '../../src/mission/project.js'
import {
  DEFAULT_ANCHOR,
  DEFAULT_GCP_CONFIG,
  DEFAULT_PARAMS,
  DEFAULT_SPLIT,
  DEFAULT_TERRAIN_FOLLOW,
} from '../../src/mission/defaults.js'
import { DEFAULT_CUSTOM_SENSOR, DEFAULT_SELECTION, MISSION_PRESETS } from '../../src/data/drones.js'
import { DEFAULT_CORRIDOR_CONFIG } from '../../src/utils/corridor.js'
import { DEFAULT_ORBIT_CONFIG } from '../../src/utils/orbit.js'
import { DEFAULT_CIRCULAR_CONFIG } from '../../src/utils/circular.js'
import { DEFAULT_FACE_CONFIG } from '../../src/utils/faceMode.js'

const schema = JSON.parse(
  readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
)
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validate = ajv.compile(schema)
const errors = () => (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ')
const roundTrip = (state) => JSON.parse(JSON.stringify(serializeProject(state)))

const defaults = () => ({
  missionName: 'missao-drone',
  drone: { ...DEFAULT_SELECTION },
  custom: { ...DEFAULT_CUSTOM_SENSOR },
  payloadTuning: {},
  battery: { batteryId: 'padrao', usefulMin: 30 },
  inspectPoints: [],
  missionMode: 'area',
  faceConfig: { ...DEFAULT_FACE_CONFIG },
  corridorConfig: { ...DEFAULT_CORRIDOR_CONFIG },
  orbitConfig: { ...DEFAULT_ORBIT_CONFIG },
  circularConfig: { ...DEFAULT_CIRCULAR_CONFIG },
  params: { ...DEFAULT_PARAMS },
  split: { ...DEFAULT_SPLIT },
  anchor: { ...DEFAULT_ANCHOR },
  ring: null,
  areaOrigin: null,
  bases: [],
  blockBase: {},
  disabledTiles: new Set(),
  terrainFollow: { ...DEFAULT_TERRAIN_FOLLOW },
  gcpConfig: { ...DEFAULT_GCP_CONFIG },
})

describe('esquema JSON do ficheiro de projecto', () => {
  test('o esquema publicado e o URL escrito no ficheiro coincidem', () => {
    expect(schema.$id).toBe(PROJECT_SCHEMA_URL)
    expect(roundTrip(defaults()).$schema).toBe(PROJECT_SCHEMA_URL)
  })

  test('o estado por omissao valida', () => {
    expect(validate(roundTrip(defaults())), errors()).toBe(true)
    // a reserva por omissao e 0: o tempo util ja a inclui
    expect(DEFAULT_SPLIT.reservePct).toBe(0)
  })

  test('paragem nos waypoints: os dois valores validam, o resto e recusado', () => {
    for (const waypointStops of ['corners', 'all']) {
      const st = defaults()
      st.params = { ...st.params, waypointStops }
      st.corridorConfig = { ...st.corridorConfig, waypointStops }
      expect(validate(roundTrip(st)), `${waypointStops}: ${errors()}`).toBe(true)
    }
    const mau = defaults()
    mau.params = { ...mau.params, waypointStops: 'nunca' }
    expect(validate(roundTrip(mau))).toBe(false)
    const mau2 = defaults()
    mau2.corridorConfig = { ...mau2.corridorConfig, waypointStops: 'nunca' }
    expect(validate(roundTrip(mau2))).toBe(false)
  })

  test('cada preset de missao aplicado aos parametros valida', () => {
    for (const p of MISSION_PRESETS) {
      const st = defaults()
      st.params = { ...st.params, ...p.values }
      expect(validate(roundTrip(st)), `${p.id}: ${errors()}`).toBe(true)
    }
  })

  test('um projecto completo (todos os modos com geometria) valida e le-se de volta', () => {
    const st = defaults()
    st.missionName = 'Quinta'
    st.missionMode = 'corridor'
    st.ring = [
      [-9.14, 38.7],
      [-9.13, 38.7],
      [-9.13, 38.71],
      [-9.14, 38.71],
    ]
    st.areaOrigin = 'anchor'
    st.anchor = { ...st.anchor, center: [-9.135, 38.705], shape: 'square', cols: 2, rows: 3 }
    st.bases = [
      { id: 'b1', label: 'A', point: [-9.141, 38.699], radiusM: null },
      { id: 'b2', label: 'B', point: [-9.129, 38.711], radiusM: 60 },
    ]
    st.blockBase = { 1: 'b2', 6: 'b1' }
    st.split = { ...st.split, mode: 'battery', tileOrientationAuto: false, tileOrientation: 30 }
    st.disabledTiles = new Set([0, 4])
    st.payloadTuning = { M4T_LIDAR: { effectiveFov: 50 } }
    st.battery = { batteryId: 'padrao', usefulMin: 27.5 }
    st.inspectPoints = [
      {
        id: 1,
        label: 'P01',
        point: [-9.14, 38.7],
        heightM: 40,
        heading: null,
        gimbalPitch: null,
        photo: true,
      },
      {
        id: 2,
        label: 'P02',
        point: [-9.139, 38.7],
        heightM: 35,
        heading: 90,
        gimbalPitch: -30,
        photo: false,
      },
    ]
    st.faceConfig = {
      ...st.faceConfig,
      baseline: [
        [-9.14, 38.7],
        [-9.139, 38.7],
      ],
    }
    st.corridorConfig = {
      ...st.corridorConfig,
      centreline: [
        [-9.14, 38.7],
        [-9.13, 38.7],
        [-9.12, 38.71],
      ],
    }
    st.orbitConfig = { ...st.orbitConfig, poi: [-9.135, 38.705] }
    st.circularConfig = { ...st.circularConfig, radiusM: 40, overlapPct: 35, angleDeg: 30 }
    st.terrainFollow = { enabled: true, tolerance: 3 }
    st.gcpConfig = { enabled: true, count: 7 }
    const json = roundTrip(st)
    expect(validate(json), errors()).toBe(true)
    const n = normalizeProject(json)
    expect(n.ring).toEqual(st.ring)
    expect([...n.disabledTiles]).toEqual([0, 4])
    expect(n.bases).toEqual(st.bases)
    expect(n.blockBase).toEqual({ 1: 'b2', 6: 'b1' })
    expect(n.split).toMatchObject({ tileOrientationAuto: false, tileOrientation: 30, mosaic: 2 })
    expect(n.inspectPoints).toHaveLength(2)
    expect(n.battery).toEqual({ aircraftId: 'M3E', batteryId: 'padrao', usefulMin: 27.5 })
  })

  test('projecto anterior ao equipamento: valida, e abre com o tempo útil equivalente', () => {
    const antigo = roundTrip(defaults())
    delete antigo.battery
    antigo.drone = { aircraftId: 'M300RTK', payloadId: 'P1' }
    antigo.batteryByCombo = { 'M300RTK:P1': 40 }
    antigo.split = { ...antigo.split, mode: 'battery', reservePct: 25 }
    expect(validate(antigo), errors()).toBe(true)
    const n = normalizeProject(antigo)
    expect(n.battery).toEqual({ aircraftId: 'M300RTK', batteryId: null, usefulMin: 30 })
    expect(n.split.reservePct).toBe(0)
    // regravado, sai no formato de hoje e continua a validar
    const hoje = roundTrip({
      ...defaults(),
      drone: n.drone,
      split: { ...DEFAULT_SPLIT, ...n.split },
      battery: { batteryId: 'TB60', usefulMin: n.battery.usefulMin },
    })
    expect(hoje.batteryByCombo).toBeUndefined()
    expect(hoje.split.reservePct).toBe(0)
    expect(validate(hoje), errors()).toBe(true)
  })

  test('projecto anterior às bases múltiplas (basePoint) valida e abre com a base A', () => {
    const antigo = roundTrip(defaults())
    delete antigo.bases
    delete antigo.blockBase
    delete antigo.split.mosaic
    delete antigo.split.tileOrientationAuto
    antigo.basePoint = [-9.141, 38.699]
    expect(validate(antigo), errors()).toBe(true)
    const n = normalizeProject(antigo)
    expect(n.bases).toEqual([{ id: 'b1', label: 'A', point: [-9.141, 38.699], radiusM: null }])
    // regravado: as bases, sem a base única
    const hoje = roundTrip({ ...defaults(), bases: n.bases })
    expect(hoje.basePoint).toBeUndefined()
    expect(validate(hoje), errors()).toBe(true)
  })

  test('bases e atribuições inválidas falham', () => {
    const ok = roundTrip(defaults())
    const base = { id: 'b1', label: 'A', point: [-9.14, 38.7], radiusM: null }
    expect(validate({ ...ok, bases: [base] })).toBe(true)
    expect(validate({ ...ok, bases: [{ ...base, label: 'a' }] })).toBe(false)
    expect(validate({ ...ok, bases: [{ ...base, point: [200, 0] }] })).toBe(false)
    expect(validate({ ...ok, bases: [{ ...base, radiusM: 900 }] })).toBe(false)
    expect(validate({ ...ok, bases: [{ ...base, cor: 'x' }] })).toBe(false)
    expect(validate({ ...ok, blockBase: { 0: 'b1' } })).toBe(false)
    expect(validate({ ...ok, blockBase: { 3: 7 } })).toBe(false)
    expect(validate({ ...ok, split: { ...ok.split, tileOrientationAuto: 'sim' } })).toBe(false)
  })

  test('lixo falha: versao errada, anel com dois vertices, altitude em texto, campo desconhecido', () => {
    const ok = roundTrip(defaults())
    expect(validate({ ...ok, version: 1 })).toBe(false)
    expect(
      validate({
        ...ok,
        ring: [
          [-9.14, 38.7],
          [-9.13, 38.7],
        ],
      }),
    ).toBe(false)
    expect(validate({ ...ok, params: { ...ok.params, altitude: '100' } })).toBe(false)
    expect(validate({ ...ok, params: { ...ok.params, altitude: 0 } })).toBe(false)
    expect(validate({ ...ok, basePoint: [200, 0] })).toBe(false)
    expect(validate({ ...ok, missionMode: 'zz' })).toBe(false)
    expect(validate({ ...ok, missionMode: 'circular' })).toBe(true)
    expect(validate({ ...ok, circularConfig: { ...ok.circularConfig, gimbalPitch: 10 } })).toBe(
      false,
    )
    expect(validate({ ...ok, extra: 1 })).toBe(false)
    expect(validate({ ...ok, inspectPoints: [{ id: 1 }] })).toBe(false)
    expect(validate({ ...ok, split: { ...ok.split, batteryMin: 25 } })).toBe(false) // so v1
    expect(validate({ ...ok, battery: { ...ok.battery, usefulMin: 0 } })).toBe(false)
    expect(validate({ ...ok, battery: { ...ok.battery, usefulMin: '25' } })).toBe(false)
    expect(validate({ ...ok, battery: { ...ok.battery, reservePct: 20 } })).toBe(false)
  })
})
