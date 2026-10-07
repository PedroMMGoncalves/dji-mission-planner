/**
 * Acções de segurança (fim da missão, sinal perdido): a escolha do operador
 * chega ao missionConfig dos waylines.wpml (e do template.kml) de TODOS os
 * modos — área (rota única e por voo), corredor, circular, fachada, órbita e
 * pontos de inspecção —, fica no projecto e um projecto antigo abre com as
 * omissões de sempre (goHome, executeLostAction, goBack).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  DEFAULT_SAFETY,
  FINISH_ACTIONS,
  RC_LOST_ACTIONS,
  RC_LOST_MODES,
  normalizeSafety,
  safetyParams,
} from '../../src/mission/safety.js'
import {
  circularExportParams,
  corridorExportParams,
  faceExportParams,
  inspectionExportParams,
  orbitExportParams,
} from '../../src/mission/exportParams.js'
import { buildAreaExport } from '../../src/mission/areaExport.js'
import { normalizeProject, serializeProject } from '../../src/mission/project.js'
import {
  blockExportParams,
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'
import { generateFacePlan } from '../../src/utils/faceMode.js'
import { generateOrbitPlan } from '../../src/utils/orbit.js'
import { generateCorridorPlan } from '../../src/utils/corridor.js'
import { generateCircularPlan } from '../../src/utils/circular.js'
import { rectangleFromAnchor, resolveSensor } from '../../src/utils/geo.js'
import { DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'

const sensor = resolveSensor(PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
const wpml = { droneEnumValue: 60, payloadEnumValue: 50, payloadPositionIndex: 0 }
const comum = { missionName: 'corta sul', wpml, sensorType: 'camera' }
const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]

const escolha = {
  finishAction: 'autoLand',
  exitOnRCLost: 'goContinue',
  executeRCLostAction: 'hover',
}
const tag = (xml, name) => new RegExp(`<wpml:${name}>([^<]*)</wpml:${name}>`).exec(xml)?.[1]
const lidas = (xml) => ({
  finishAction: tag(xml, 'finishAction'),
  exitOnRCLost: tag(xml, 'exitOnRCLost'),
  executeRCLostAction: tag(xml, 'executeRCLostAction'),
})

/** Parâmetros de exportação de cada modo, com as acções `safety` (ou sem elas). */
function modos(safety) {
  const lines = [
    [em(0, 0), em(400, 0)],
    [em(400, 40), em(0, 40)],
  ]
  const area = buildAreaExport({
    ...comum,
    plan: { lines, waypoints: lines.flat() },
    spacingM: 40,
    altitude: 100,
    speed: 8,
    photoIntervalM: 20,
    triggerMode: 'distance',
    gimbalPitch: -90,
    safety,
  })
  // a mesma área em dois voos: cada KMZ do ZIP herda as acções
  const voos = buildAreaExport({
    ...comum,
    plan: { lines, waypoints: lines.flat() },
    blocks: lines.map((l, i) => ({ id: i + 1, lines: [l], waypoints: l })),
    spacingM: 40,
    altitude: 100,
    speed: 8,
    photoIntervalM: 20,
    triggerMode: 'distance',
    gimbalPitch: -90,
    safety,
  })
  const face = generateFacePlan([em(0, 0), em(80, 0)], {
    sensor,
    faceHeightM: 30,
    standoffM: 12,
    side: 'left',
    verticalOverlapPct: 70,
    horizontalOverlapPct: 70,
    gimbalPitch: 0,
    speed: 3,
  })
  const orbit = generateOrbitPlan(em(0, 0), {
    sensor,
    radiusM: 40,
    levels: { count: 2, startM: 20, stepM: 15 },
    horizontalOverlapPct: 70,
    poiHeightM: 10,
    clockwise: true,
    speed: 3,
  })
  const corridor = generateCorridorPlan([em(0, 0), em(800, 0), em(1200, 300)], {
    sensor,
    altitude: 100,
    bufferM: 150,
    sideOverlapPct: 70,
    photoIntervalM: 20,
    speed: 8,
  })
  const circular = generateCircularPlan(rectangleFromAnchor(em(0, 0), 131, 93, 0), {
    sensor,
    radiusM: 30,
    overlapPct: 50,
    altitude: 60,
    gimbalPitch: -45,
    frontOverlapPct: 80,
    speed: 8.2,
  })
  return {
    área: area.params,
    'área, voo 2 de 2': blockExportParams(voos.params, voos.blocks[1]),
    corredor: corridorExportParams({
      ...comum,
      plan: corridor,
      photoMode: 'distance',
      altitude: 100,
      speed: 8,
      photoIntervalM: 20,
      safety,
    }),
    circular: circularExportParams({ ...comum, plan: circular, altitude: 60, speed: 8.2, safety }),
    fachada: faceExportParams({ ...comum, plan: face, speed: 3, gimbalPitch: 0, safety }),
    órbita: orbitExportParams({ ...comum, plan: orbit, speed: 3, safety }),
    inspecção: inspectionExportParams({
      ...comum,
      points: [
        { id: 'a', point: em(0, 0), heading: 45, gimbalPitch: -30, heightM: 40 },
        { id: 'b', point: em(30, 0), heading: 270, gimbalPitch: -60, heightM: 50 },
      ],
      altitude: 60,
      speed: 5,
      gimbalPitch: -45,
      safety,
    }),
  }
}

describe('acções de segurança: normalização', () => {
  test('omissões: regressar à base; com o sinal perdido, interromper e regressar', () => {
    expect(DEFAULT_SAFETY).toEqual({
      finishAction: 'goHome',
      exitOnRCLost: 'executeLostAction',
      executeRCLostAction: 'goBack',
    })
    expect(normalizeSafety(undefined)).toEqual(DEFAULT_SAFETY)
    expect(normalizeSafety([])).toEqual(DEFAULT_SAFETY)
    expect(safetyParams(null)).toEqual(DEFAULT_SAFETY)
  })

  test('valores válidos passam; desconhecidos voltam à omissão campo a campo', () => {
    for (const finishAction of FINISH_ACTIONS)
      expect(normalizeSafety({ finishAction }).finishAction).toBe(finishAction)
    for (const exitOnRCLost of RC_LOST_MODES)
      expect(normalizeSafety({ exitOnRCLost }).exitOnRCLost).toBe(exitOnRCLost)
    for (const executeRCLostAction of RC_LOST_ACTIONS)
      expect(normalizeSafety({ executeRCLostAction }).executeRCLostAction).toBe(executeRCLostAction)
    expect(normalizeSafety({ finishAction: 'explodir', exitOnRCLost: 'goContinue' })).toEqual({
      ...DEFAULT_SAFETY,
      exitOnRCLost: 'goContinue',
    })
  })
})

describe('acções de segurança: exportação de todos os modos', () => {
  test('a escolha chega ao missionConfig dos waylines e do template', () => {
    for (const [modo, p] of Object.entries(modos(escolha))) {
      expect(validateExportParams(p), modo).toBe(p)
      expect(lidas(buildWaylinesWPML(p)), modo).toEqual(escolha)
      expect(lidas(buildTemplateKML(p)), modo).toEqual(escolha)
    }
  })

  test('sem escolha, as omissões de sempre', () => {
    for (const [modo, p] of Object.entries(modos(null)))
      expect(lidas(buildWaylinesWPML(p)), modo).toEqual(DEFAULT_SAFETY)
  })

  test('cada acção de fim e de sinal perdido sai tal como escolhida (área)', () => {
    for (const finishAction of FINISH_ACTIONS)
      for (const exitOnRCLost of RC_LOST_MODES)
        for (const executeRCLostAction of RC_LOST_ACTIONS) {
          const safety = { finishAction, exitOnRCLost, executeRCLostAction }
          expect(lidas(buildWaylinesWPML(modos(safety).área))).toEqual(safety)
        }
  })
})

describe('acções de segurança: projecto', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
  )
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)

  test('ficam no projecto e voltam ao abri-lo; o esquema aceita-as', () => {
    const out = JSON.parse(JSON.stringify(serializeProject({ safety: escolha })))
    expect(out.safety).toEqual(escolha)
    expect(normalizeProject(out).safety).toEqual(escolha)
    expect(validate({ version: 2, safety: escolha })).toBe(true)
    expect(validate({ version: 2, safety: { finishAction: 'explodir' } })).toBe(false)
  })

  test('projecto anterior às acções: abre com as omissões', () => {
    expect(normalizeProject({ version: 2 }).safety).toEqual(DEFAULT_SAFETY)
    expect(normalizeProject({ version: 1 }).safety).toEqual(DEFAULT_SAFETY)
    expect(serializeProject({}).safety).toEqual(DEFAULT_SAFETY)
  })
})
