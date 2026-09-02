/**
 * O ficheiro de projecto tem um contrato publico: public/schema/project-v2.schema.json.
 * O que a aplicação escreve (serializeProject a partir dos defaults reais e
 * de um estado completo) tem de validar contra ele, e lixo tem de falhar.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { PROJECT_SCHEMA_URL, normalizeProject, serializeProject } from '../../src/mission/project.js'
import {
  DEFAULT_ANCHOR, DEFAULT_GCP_CONFIG, DEFAULT_PARAMS, DEFAULT_SPLIT, DEFAULT_TERRAIN_FOLLOW,
} from '../../src/mission/defaults.js'
import { DEFAULT_CUSTOM_SENSOR, DEFAULT_SELECTION, MISSION_PRESETS } from '../../src/data/drones.js'
import { DEFAULT_CORRIDOR_CONFIG } from '../../src/utils/corridor.js'
import { DEFAULT_ORBIT_CONFIG } from '../../src/utils/orbit.js'
import { DEFAULT_FACE_CONFIG } from '../../src/utils/faceMode.js'

const schema = JSON.parse(readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validate = ajv.compile(schema)
const errors = () => (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ')
const roundTrip = (state) => JSON.parse(JSON.stringify(serializeProject(state)))

const defaults = () => ({
  missionName: 'missao-drone',
  drone: { ...DEFAULT_SELECTION },
  custom: { ...DEFAULT_CUSTOM_SENSOR },
  payloadTuning: {},
  batteryByCombo: {},
  inspectPoints: [],
  missionMode: 'area',
  faceConfig: { ...DEFAULT_FACE_CONFIG },
  corridorConfig: { ...DEFAULT_CORRIDOR_CONFIG },
  orbitConfig: { ...DEFAULT_ORBIT_CONFIG },
  params: { ...DEFAULT_PARAMS },
  split: { ...DEFAULT_SPLIT },
  anchor: { ...DEFAULT_ANCHOR },
  ring: null,
  areaOrigin: null,
  basePoint: null,
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
    st.ring = [[-9.14, 38.7], [-9.13, 38.7], [-9.13, 38.71], [-9.14, 38.71]]
    st.areaOrigin = 'anchor'
    st.anchor = { ...st.anchor, center: [-9.135, 38.705], shape: 'square', cols: 2, rows: 3 }
    st.basePoint = [-9.141, 38.699]
    st.split = { ...st.split, mode: 'battery' }
    st.disabledTiles = new Set([0, 4])
    st.payloadTuning = { M4T_LIDAR: { effectiveFov: 50 } }
    st.batteryByCombo = { 'M3E:M3E_WIDE': 28 }
    st.inspectPoints = [
      { id: 1, label: 'P01', point: [-9.14, 38.7], heightM: 40, heading: null, gimbalPitch: null, photo: true },
      { id: 2, label: 'P02', point: [-9.139, 38.7], heightM: 35, heading: 90, gimbalPitch: -30, photo: false },
    ]
    st.faceConfig = { ...st.faceConfig, baseline: [[-9.14, 38.7], [-9.139, 38.7]] }
    st.corridorConfig = { ...st.corridorConfig, centreline: [[-9.14, 38.7], [-9.13, 38.7], [-9.12, 38.71]] }
    st.orbitConfig = { ...st.orbitConfig, poi: [-9.135, 38.705] }
    st.terrainFollow = { enabled: true, tolerance: 3 }
    st.gcpConfig = { enabled: true, count: 7 }
    const json = roundTrip(st)
    expect(validate(json), errors()).toBe(true)
    const n = normalizeProject(json)
    expect(n.ring).toEqual(st.ring)
    expect([...n.disabledTiles]).toEqual([0, 4])
    expect(n.inspectPoints).toHaveLength(2)
  })

  test('lixo falha: versao errada, anel com dois vertices, altitude em texto, campo desconhecido', () => {
    const ok = roundTrip(defaults())
    expect(validate({ ...ok, version: 1 })).toBe(false)
    expect(validate({ ...ok, ring: [[-9.14, 38.7], [-9.13, 38.7]] })).toBe(false)
    expect(validate({ ...ok, params: { ...ok.params, altitude: '100' } })).toBe(false)
    expect(validate({ ...ok, params: { ...ok.params, altitude: 0 } })).toBe(false)
    expect(validate({ ...ok, basePoint: [200, 0] })).toBe(false)
    expect(validate({ ...ok, missionMode: 'zz' })).toBe(false)
    expect(validate({ ...ok, extra: 1 })).toBe(false)
    expect(validate({ ...ok, inspectPoints: [{ id: 1 }] })).toBe(false)
    expect(validate({ ...ok, split: { ...ok.split, batteryMin: 25 } })).toBe(false) // so v1
  })
})
