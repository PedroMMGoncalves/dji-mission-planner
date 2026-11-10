/*
 * Versao do WPML (#48): o namespace `xmlns:wpml` dos dois ficheiros. A 1.0.2
 * e a dos exemplos da especificacao (template e waylines, EN e CN) e a que
 * voou no M3E e no M4T; os 81 KMZ escritos pelo Pilot 2 num M300 declaram
 * 1.0.3 e os ficheiros reais do Matrice 4 declaram 1.0.6. A versao e uma
 * escolha do projecto, so de entre estas tres, e so muda o atributo: os
 * elementos continuam os da 1.0.2.
 */
import { readFileSync } from 'node:fs'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import Ajv2020 from 'ajv/dist/2020.js'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import DICT from '../../src/i18n.jsx'
import { AIRCRAFT, DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { missionWpml } from '../../src/mission/missionWpml.js'
import { preflightArea, preflightPlan } from '../../src/mission/preflight.js'
import { preflightFor } from '../../src/mission/preflightFor.js'
import {
  normalizeProject,
  normalizeWpmlVersion,
  serializeProject,
} from '../../src/mission/project.js'
import {
  DEFAULT_WPML_VERSION,
  MissionExportError,
  WPML_VERSIONS,
  buildBlocksZip,
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'
import { parseWpmlKmz } from '../../src/utils/importWpml.js'
import { describeErrors, validateWpml } from '../lib/wpml-conformidade.mjs'

const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-7.2 + x / mL, lat + y / 110574]
const wps = [em(0, 0), em(100, 0), em(100, 30), em(0, 30)]
const wpmlDe = (wpmlVersion) =>
  missionWpml(AIRCRAFT.M300RTK, PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR, { wpmlVersion })
const base = {
  name: 'versao',
  waypoints: wps,
  altitude: 100,
  speed: 8,
  photoIntervalM: 20,
  triggerMode: 'distance',
  sensorType: 'camera',
  gimbalPitch: -90,
  createTimeMs: 1760000000000,
  wpml: wpmlDe(undefined),
}
const comVersao = (v) => ({ ...base, wpml: { ...base.wpml, wpmlVersion: v } })
const NS = (v) => `xmlns:wpml="http://www.dji.com/wpmz/${v}"`
const namespaces = (xml) => [...xml.matchAll(/xmlns:wpml="([^"]*)"/g)].map((m) => m[1])

describe('as versoes admitidas', () => {
  test('1.0.2 (a de omissao), 1.0.3 e 1.0.6', () => {
    expect(WPML_VERSIONS).toEqual(['1.0.2', '1.0.3', '1.0.6'])
    expect(DEFAULT_WPML_VERSION).toBe('1.0.2')
  })

  test('missionWpml leva a versao, a de omissao quando nao e dada', () => {
    expect(wpmlDe(undefined).wpmlVersion).toBe('1.0.2')
    expect(wpmlDe('1.0.6').wpmlVersion).toBe('1.0.6')
  })
})

describe('o namespace nos dois ficheiros', () => {
  test('sem versao: o mesmo ficheiro de sempre, e o mesmo que pedir 1.0.2', () => {
    const { wpmlVersion: _v, ...semVersao } = base.wpml
    const antigo = { ...base, wpml: semVersao }
    for (const build of [buildTemplateKML, buildWaylinesWPML]) {
      expect(build(antigo)).toBe(build(comVersao('1.0.2')))
      expect(build(antigo)).toContain(NS('1.0.2'))
    }
  })

  test.each(WPML_VERSIONS)('versao %s: so muda o atributo, nos dois ficheiros', (v) => {
    for (const build of [buildTemplateKML, buildWaylinesWPML]) {
      const xml = build(comVersao(v))
      expect(namespaces(xml)).toEqual([`http://www.dji.com/wpmz/${v}`])
      // os elementos continuam os da 1.0.2: o resto do ficheiro e igual
      expect(xml.replace(NS(v), NS('1.0.2'))).toBe(build(comVersao('1.0.2')))
    }
  })

  test('os blocos de um ZIP levam todos a mesma versao, nos dois ficheiros', async () => {
    const blocos = [
      { id: 1, waypoints: wps.slice(0, 2) },
      { id: 2, waypoints: wps.slice(2) },
    ]
    const zip = await JSZip.loadAsync(
      await (await buildBlocksZip(comVersao('1.0.3'), blocos)).arrayBuffer(),
    )
    const kmzs = Object.keys(zip.files).filter((n) => n.endsWith('.kmz'))
    expect(kmzs).toHaveLength(2)
    for (const n of kmzs) {
      const kmz = await JSZip.loadAsync(await zip.file(n).async('arraybuffer'))
      for (const f of ['wpmz/template.kml', 'wpmz/waylines.wpml'])
        expect(namespaces(await kmz.file(f).async('string')), `${n}/${f}`).toEqual([
          'http://www.dji.com/wpmz/1.0.3',
        ])
    }
  })

  test('a fronteira recusa outra versao, um numero, um texto vazio e uma injeccao', () => {
    for (const mau of ['1.0.4', '1.0.2" x="', 102, 1.02, '', ' 1.0.2', '1.0.2 ', {}]) {
      let erro = null
      try {
        validateExportParams(comVersao(mau))
      } catch (e) {
        erro = e
      }
      expect(erro, JSON.stringify(mau)).toBeInstanceOf(MissionExportError)
      expect(erro.code).toBe('param-out-of-range')
      expect(erro.detail).toMatch(/^wpml\.wpmlVersion=/)
      // nada chega ao ficheiro
      expect(() => buildTemplateKML(comVersao(mau))).toThrow(MissionExportError)
      expect(() => buildWaylinesWPML(comVersao(mau))).toThrow(MissionExportError)
    }
    for (const ok of [...WPML_VERSIONS, undefined, null])
      expect(() => validateExportParams(comVersao(ok))).not.toThrow()
  })
})

describe('o importador e o validador de conformidade', () => {
  // o leitor usa o DOMParser do browser
  beforeAll(() => {
    vi.stubGlobal(
      'DOMParser',
      class extends XmlDomParser {
        constructor() {
          super({ onError: () => {} })
        }
      },
    )
  })
  afterAll(() => vi.unstubAllGlobals())

  test.each(WPML_VERSIONS)('KMZ %s: le-se de volta com os mesmos waypoints', async (v) => {
    const params = comVersao(v)
    const zip = new JSZip()
    zip.file('wpmz/template.kml', buildTemplateKML(params))
    zip.file('wpmz/waylines.wpml', buildWaylinesWPML(params))
    const lido = await parseWpmlKmz(await zip.generateAsync({ type: 'uint8array' }))
    expect(lido.waypointCount).toBe(wps.length)
    lido.waypoints.forEach((w, i) => {
      expect(w[0]).toBeCloseTo(wps[i][0], 8)
      expect(w[1]).toBeCloseTo(wps[i][1], 8)
    })
    expect(lido.altitude).toBe(100)
    expect(lido.droneEnumValue).toBe(60)
    expect(lido.payloadEnumValue).toBe(50)
  })

  test.each(WPML_VERSIONS)('KMZ %s: o validador de conformidade nao parte', (v) => {
    const params = comVersao(v)
    const { errors } = validateWpml({
      template: buildTemplateKML(params),
      waylines: buildWaylinesWPML(params),
    })
    expect(errors, describeErrors(errors)).toEqual([])
  })
})

describe('a versao no projecto', () => {
  test('um projecto antigo, sem o campo, abre na de omissao', () => {
    expect(normalizeProject({ version: 2 }).wpmlVersion).toBe('1.0.2')
    expect(normalizeProject({ version: 1 }).wpmlVersion).toBe('1.0.2')
  })

  test('grava e volta; um valor que nao e da lista abre na de omissao', () => {
    for (const v of WPML_VERSIONS) {
      const json = JSON.parse(JSON.stringify(serializeProject({ wpmlVersion: v })))
      expect(json.wpmlVersion).toBe(v)
      expect(normalizeProject(json).wpmlVersion).toBe(v)
    }
    for (const mau of ['1.0.4', '1.0.2" x="', 102, '', null, {}]) {
      expect(normalizeWpmlVersion(mau), JSON.stringify(mau)).toBe('1.0.2')
      expect(normalizeProject({ version: 2, wpmlVersion: mau }).wpmlVersion).toBe('1.0.2')
    }
    // sem versao no estado grava-se a de omissao
    expect(serializeProject({}).wpmlVersion).toBe('1.0.2')
  })

  test('o esquema publicado aceita as tres e recusa o resto', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
    )
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
    for (const ok of WPML_VERSIONS) expect(validate({ version: 2, wpmlVersion: ok }), ok).toBe(true)
    for (const mau of ['1.0.4', '', 102])
      expect(validate({ version: 2, wpmlVersion: mau }), String(mau)).toBe(false)
  })
})

describe('o lembrete do preflight', () => {
  const P = {
    waypoints: [
      [-7.2, 40.4, 100],
      [-7.199, 40.4, 100],
    ],
    lines: [
      [
        [-7.2, 40.4],
        [-7.199, 40.4],
      ],
    ],
    stats: { flightTimeS: 100, pathLengthM: 100, photoCount: 5 },
  }
  const lembrete = (items) => items.filter((i) => i.code === 'wpml-version')

  test('so quando a versao nao e a de omissao, como nota', () => {
    for (const motor of [preflightArea, preflightPlan]) {
      expect(lembrete(motor({ plan: P }))).toEqual([])
      expect(lembrete(motor({ plan: P, wpmlVersion: '1.0.2' }))).toEqual([])
      expect(lembrete(motor({ plan: P, wpmlVersion: '1.0.3' }))).toEqual([
        { level: 'info', code: 'wpml-version', params: { v: '1.0.3', base: '1.0.2' } },
      ])
    }
  })

  test('preflightFor passa a versao a todos os modos', () => {
    const s = { plan: P, corridorPlan: P, circularPlan: P, facePlan: P, orbitPlan: P }
    for (const modo of ['area', 'corridor', 'circular', 'face', 'orbit'])
      expect(lembrete(preflightFor(modo, { ...s, wpmlVersion: '1.0.6' })), modo).toHaveLength(1)
  })

  test('textos PT e EN do campo, das opcoes e do lembrete', () => {
    const chaves = ['safety.wpmlVersion', 'safety.wpmlVersionHint', 'preflight.wpml-version']
    for (const v of WPML_VERSIONS) chaves.push(`safety.wpmlVersion.${v.replaceAll('.', '')}`)
    for (const k of chaves) {
      expect(DICT[k]?.pt, k).toBeTruthy()
      expect(DICT[k]?.en, k).toBeTruthy()
    }
    for (const v of WPML_VERSIONS)
      for (const l of ['pt', 'en'])
        expect(DICT[`safety.wpmlVersion.${v.replaceAll('.', '')}`][l]).toContain(v)
  })
})
