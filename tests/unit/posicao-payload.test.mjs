/*
 * Posicao do payload (#47): o suporte onde o payload esta montado
 * (`wpml:payloadPositionIndex`). Na pagina de suporte de produtos da DJI
 * (type-subtype-gimbalindex): 0 e o suporte de baixo, a esquerda, no M300
 * RTK (o principal nas outras aeronaves), 1 o de baixo, a direita, 2 o de
 * cima; 7 e a camara FPV, nunca um payload de missao. A aeronave diz que
 * suportes tem, o projecto guarda a escolha, e o valor chega a todos os
 * sitios onde o exportador o escreve, nos dois ficheiros.
 */
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import {
  AIRCRAFT,
  DEFAULT_CUSTOM_SENSOR,
  PAYLOADS,
  migrateDroneSelection,
  payloadPositionFor,
  withPayloadPosition,
} from '../../src/data/drones.js'
import DICT from '../../src/i18n.jsx'
import { missionWpml } from '../../src/mission/missionWpml.js'
import { normalizeProject, serializeProject } from '../../src/mission/project.js'
import {
  MissionExportError,
  PAYLOAD_POSITION_INDEXES,
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'

const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const em = (x, y) => [-7.2 + x / mL, lat + y / 110574]
const wps = [em(0, 0), em(100, 0), em(100, 30), em(0, 30)]
const base = {
  name: 'posicao',
  waypoints: wps,
  altitude: 100,
  speed: 8,
  photoIntervalM: 20,
  triggerMode: 'distance',
  sensorType: 'camera',
  gimbalPitch: -90,
  createTimeMs: 1760000000000,
  // fotos, gimbal e gravacao por waypoint: todas as accoes que levam o suporte
  perWaypoint: [
    { gimbalPitch: -60, actions: ['startRecord'] },
    { actions: ['takePhoto'] },
    { gimbalPitch: -90 },
    { actions: ['stopRecord'] },
  ],
}
const posicoes = (xml) =>
  [...xml.matchAll(/<wpml:payloadPositionIndex>([^<]*)<\/wpml:payloadPositionIndex>/g)].map(
    (m) => m[1],
  )
const accoesComSuporte = (xml) =>
  xml
    .split('<wpml:action>')
    .slice(1)
    .filter((a) =>
      /<wpml:actionActuatorFunc>(takePhoto|startRecord|stopRecord|gimbalRotate)</.test(a),
    )
const recusa = (fn, code) => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(MissionExportError)
    expect(e.code).toBe(code)
    return e
  }
  throw new Error('devia ter recusado')
}

describe('as posicoes de montagem de cada aeronave', () => {
  test('M300 RTK e aeronave propria: 0, 1 e 2; integradas: so 0', () => {
    expect(PAYLOAD_POSITION_INDEXES).toEqual([0, 1, 2])
    expect(AIRCRAFT.M300RTK.payloadPositions).toEqual([0, 1, 2])
    expect(AIRCRAFT.CUSTOM.payloadPositions).toEqual([0, 1, 2])
    expect(AIRCRAFT.M3E.payloadPositions).toEqual([0])
    expect(AIRCRAFT.M4T.payloadPositions).toEqual([0])
    // todas dentro das que a exportacao aceita; a camara FPV (7) nunca
    for (const a of Object.values(AIRCRAFT)) {
      for (const p of a.payloadPositions) expect(PAYLOAD_POSITION_INDEXES).toContain(p)
      expect(a.payloadPositions[0]).toBe(0)
    }
  })

  test('o payload nao traz a posicao: e da montagem, nao do sensor', () => {
    for (const p of Object.values(PAYLOADS))
      expect(p.wpml).not.toHaveProperty('payloadPositionIndex')
  })

  test('payloadPositionFor: a posicao valida para a aeronave, senao 0', () => {
    expect(payloadPositionFor(AIRCRAFT.M300RTK, 2)).toBe(2)
    expect(payloadPositionFor(AIRCRAFT.M300RTK, 1)).toBe(1)
    expect(payloadPositionFor(AIRCRAFT.CUSTOM, 2)).toBe(2)
    expect(payloadPositionFor(AIRCRAFT.M3E, 2)).toBe(0)
    expect(payloadPositionFor(AIRCRAFT.M4T, 1)).toBe(0)
    for (const mau of [3, 7, 1.5, -1, '1', null, undefined, NaN])
      expect(payloadPositionFor(AIRCRAFT.M300RTK, mau), String(mau)).toBe(0)
    expect(payloadPositionFor(undefined, 1)).toBe(0)
  })

  test('withPayloadPosition: guarda a posicao so quando nao e 0 e a aeronave a tem', () => {
    const m300 = { aircraftId: 'M300RTK', payloadId: 'P1', rtk: true }
    expect(withPayloadPosition(m300, 2)).toEqual({ ...m300, payloadPositionIndex: 2 })
    // 0 e a omissao: nao se escreve, como nos projectos anteriores
    expect(withPayloadPosition({ ...m300, payloadPositionIndex: 2 }, 0)).toEqual(m300)
    expect(withPayloadPosition({ aircraftId: 'M3E', payloadId: 'M3E_WIDE' }, 2)).toEqual({
      aircraftId: 'M3E',
      payloadId: 'M3E_WIDE',
    })
    expect(withPayloadPosition(m300, 7)).toEqual(m300)
  })
})

describe('o selector e o rotulo', () => {
  test('cada posicao de cada aeronave tem rotulo e forma curta, em PT e EN', () => {
    const chaves = ['cp.drone.position', 'cp.drone.positionHint']
    for (const a of Object.values(AIRCRAFT))
      for (const n of a.payloadPositions)
        chaves.push(`cp.drone.position.${n}`, `cp.drone.positionShort.${n}`)
    for (const k of chaves) {
      expect(DICT[k]?.pt, k).toBeTruthy()
      expect(DICT[k]?.en, k).toBeTruthy()
    }
    // o numero que vai para o KMZ esta no rotulo, nas duas linguas
    for (const n of [0, 1, 2])
      for (const l of ['pt', 'en']) {
        expect(DICT[`cp.drone.position.${n}`][l]).toContain(`(${n})`)
        expect(DICT[`cp.drone.positionShort.${n}`][l]).toContain(`(${n})`)
      }
  })
})

describe('a posicao no projecto', () => {
  test('um projecto antigo, sem o campo, abre na posicao 0', () => {
    const n = normalizeProject({ version: 2, drone: { aircraftId: 'M300RTK', payloadId: 'P1' } })
    expect(n.drone).toEqual({ aircraftId: 'M300RTK', payloadId: 'P1', rtk: false })
    expect(payloadPositionFor(AIRCRAFT[n.drone.aircraftId], n.drone.payloadPositionIndex)).toBe(0)
  })

  test('grava e volta (1 e 2 no M300 e na aeronave propria)', () => {
    for (const [aircraftId, payloadId, pos] of [
      ['M300RTK', 'P1', 1],
      ['M300RTK', 'MAPPER_PLUS', 2],
      ['CUSTOM', 'CUSTOM', 2],
    ]) {
      const drone = { aircraftId, payloadId, rtk: false, payloadPositionIndex: pos }
      const json = JSON.parse(JSON.stringify(serializeProject({ drone })))
      expect(json.drone.payloadPositionIndex).toBe(pos)
      expect(normalizeProject(json).drone).toEqual(drone)
    }
  })

  test('valor invalido ou de uma aeronave sem esse suporte: 0, sem rebentar', () => {
    for (const mau of [3, 7, 1.5, -1, '2', null, true, {}]) {
      const n = normalizeProject({
        version: 2,
        drone: { aircraftId: 'M300RTK', payloadId: 'P1', payloadPositionIndex: mau },
      })
      expect(n.drone, String(mau)).toEqual({ aircraftId: 'M300RTK', payloadId: 'P1', rtk: false })
    }
    const m3e = normalizeProject({
      version: 2,
      drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE', payloadPositionIndex: 2 },
    })
    expect(m3e.drone).toEqual({ aircraftId: 'M3E', payloadId: 'M3E_WIDE', rtk: false })
    // um payload trocado pelo da aeronave mantem a posicao, se a aeronave a tem
    expect(
      migrateDroneSelection({
        aircraftId: 'M300RTK',
        payloadId: 'M3E_WIDE',
        payloadPositionIndex: 1,
      }),
    ).toEqual({ aircraftId: 'M300RTK', payloadId: 'P1', rtk: false, payloadPositionIndex: 1 })
  })

  test('o esquema publicado aceita 0, 1 e 2 e recusa o resto', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
    )
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
    const ficheiro = (payloadPositionIndex) => ({
      version: 2,
      drone: { aircraftId: 'M300RTK', payloadId: 'P1', payloadPositionIndex },
    })
    for (const ok of [0, 1, 2]) expect(validate(ficheiro(ok)), String(ok)).toBe(true)
    for (const mau of [3, 7, 1.5, -1, '1']) expect(validate(ficheiro(mau)), String(mau)).toBe(false)
  })
})

describe('a posicao chega ao WPML', () => {
  test('missionWpml: a posicao dada, 0 por omissao', () => {
    const p1 = missionWpml(AIRCRAFT.M300RTK, PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
    expect(p1.payloadPositionIndex).toBe(0)
    const topo = missionWpml(AIRCRAFT.M300RTK, PAYLOADS.MAPPER_PLUS, DEFAULT_CUSTOM_SENSOR, {
      payloadPositionIndex: 2,
    })
    expect(topo.payloadPositionIndex).toBe(2)
    expect(topo.payloadEnumValue).toBe(65535)
  })

  test.each([0, 1, 2])(
    'posicao %i: payloadInfo e cada accao dos dois ficheiros, todos iguais',
    (pos) => {
      const wpml = missionWpml(AIRCRAFT.M300RTK, PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR, {
        payloadPositionIndex: pos,
      })
      const params = { ...base, wpml }
      for (const xml of [buildTemplateKML(params), buildWaylinesWPML(params)]) {
        const todas = posicoes(xml)
        // payloadInfo + uma por accao de camara ou de gimbal
        expect(todas.length).toBe(1 + accoesComSuporte(xml).length)
        expect(todas.length).toBeGreaterThan(4)
        expect(new Set(todas)).toEqual(new Set([String(pos)]))
        expect(xml).toMatch(
          new RegExp(
            `<wpml:payloadInfo>[\\s\\S]*<wpml:payloadPositionIndex>${pos}</wpml:payloadPositionIndex>[\\s\\S]*</wpml:payloadInfo>`,
          ),
        )
      }
    },
  )

  test('com a lente nomeada, o payloadParam do template leva a mesma posicao', () => {
    const wpml = {
      ...missionWpml(AIRCRAFT.CUSTOM, PAYLOADS.CUSTOM, DEFAULT_CUSTOM_SENSOR, {
        payloadPositionIndex: 2,
      }),
      imageFormat: 'visable',
    }
    const tpl = buildTemplateKML({ ...base, wpml })
    expect(tpl).toMatch(
      /<wpml:payloadParam>\s*<wpml:payloadPositionIndex>2<\/wpml:payloadPositionIndex>/,
    )
    expect(new Set(posicoes(tpl))).toEqual(new Set(['2']))
    expect(new Set(posicoes(buildWaylinesWPML({ ...base, wpml })))).toEqual(new Set(['2']))
  })

  test('a fronteira recusa uma posicao que nao seja 0, 1 ou 2', () => {
    const wpml = missionWpml(AIRCRAFT.M300RTK, PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
    for (const mau of [3, 7, 1.5, -1]) {
      const e = recusa(
        () => validateExportParams({ ...base, wpml: { ...wpml, payloadPositionIndex: mau } }),
        'param-out-of-range',
      )
      expect(e.detail).toBe(`wpml.payloadPositionIndex=${mau}`)
    }
    recusa(
      () => validateExportParams({ ...base, wpml: { ...wpml, payloadPositionIndex: '1' } }),
      'param-not-finite',
    )
    for (const ok of [0, 1, 2, undefined, null])
      expect(() =>
        validateExportParams({ ...base, wpml: { ...wpml, payloadPositionIndex: ok } }),
      ).not.toThrow()
  })
})
