/**
 * Issue #51: campos do WPML dentro dos intervalos da documentacao viva da
 * DJI (template-kml, waylines-wpml e common-element, paginas de 2026-11):
 * globalRTHHeight [2, 1500]; wpml:index [0, 65535], logo 65536 waypoints;
 * wpml:duration nunca 0 numa rota com comprimento (o comando volta a
 * mostrar 100 % e 00:00); velocidade acima de 15 m/s fora do intervalo
 * documentado de globalTransitionalSpeed ([1, 15] na tabela CN, [0, 15] na
 * EN) e de autoFlightSpeed na tabela CN ([1, 15]).
 */
import { describe, expect, test } from 'vitest'
import {
  MAX_RTH_HEIGHT_M,
  MAX_TRANSITIONAL_SPEED_MS,
  MAX_WAYPOINTS_PER_ROUTE,
  MIN_GLOBAL_RTH_HEIGHT_M,
  buildTemplateKML,
  buildWaylinesWPML,
  defaultRthHeightM,
  validateExportParams,
} from '../../src/utils/exporters.js'
import { WPML_MAX_WAYPOINTS, preflightArea, preflightPlan } from '../../src/mission/preflight.js'
import { routeLengthM } from '../../src/utils/geo.js'
import preflightDict from '../../src/i18n/dict.preflight.js'

const wpml = { droneEnumValue: 77, payloadEnumValue: 66, payloadPositionIndex: 0 }
const base = {
  name: 'r',
  waypoints: [
    [-9.14, 38.7, 60],
    [-9.139, 38.7, 60],
    [-9.139, 38.7005, 70],
  ],
  altitude: 60,
  speed: 8,
  wpml,
  photoIntervalM: 0,
  triggerMode: 'distance',
  sensorType: 'camera',
}
const campo = (xml, tag) => {
  const m = xml.match(new RegExp(`<wpml:${tag}>([^<]*)</wpml:${tag}>`))
  return m ? m[1] : null
}
const recusa = (extra, detail) => {
  let erro = null
  try {
    validateExportParams({ ...base, ...extra })
  } catch (e) {
    erro = e
  }
  expect(erro?.code).toBe('param-out-of-range')
  expect(erro?.detail).toBe(detail)
}
const aceita = (extra) => expect(validateExportParams({ ...base, ...extra })).toBeTruthy()

describe('globalRTHHeight em [2, 1500] (ponto 7)', () => {
  test('constantes da documentacao', () => {
    expect(MIN_GLOBAL_RTH_HEIGHT_M).toBe(2)
    expect(MAX_RTH_HEIGHT_M).toBe(1500)
  })

  test('fronteiras: 1.9 e 1500.1 recusados, 2 e 1500 aceites e escritos tal qual', () => {
    for (const rthHeightM of [0, 1, 1.9, 1.99, 1500.1, 1501]) recusa({ rthHeightM }, 'rthHeightM')
    for (const rthHeightM of [2, 1500]) {
      aceita({ rthHeightM })
      const xml = buildWaylinesWPML({ ...base, rthHeightM })
      expect(Number(campo(xml, 'globalRTHHeight'))).toBe(rthHeightM)
    }
  })

  test('o valor por omissao nunca sai do intervalo, venha o tecto que vier', () => {
    for (const tecto of [-500, -1, 0, 1, 79.2, 1479, 1480, 1481, 5000, NaN, Infinity]) {
      const h = defaultRthHeightM(tecto)
      expect(h).toBeGreaterThanOrEqual(MIN_GLOBAL_RTH_HEIGHT_M)
      expect(h).toBeLessThanOrEqual(MAX_RTH_HEIGHT_M)
    }
    // e e o que o ficheiro leva sem rthHeightM, numa rota acima do tecto
    const alta = base.waypoints.map(([x, y]) => [x, y, 1490])
    const xml = buildWaylinesWPML({ ...base, waypoints: alta })
    expect(Number(campo(xml, 'globalRTHHeight'))).toBe(1500)
  })
})

describe('tecto de waypoints: wpml:index [0, 65535] (ponto 8)', () => {
  const rota = (n) => Array.from({ length: n }, (_, i) => [-9.14 + (i % 1000) * 1e-5, 38.7])
  const plano = (n) => ({ waypoints: rota(n), stats: {} })
  const codes = (items) => items.map((i) => i.code)

  test('uma so constante: o preflight usa a do exportador', () => {
    expect(MAX_WAYPOINTS_PER_ROUTE).toBe(65536)
    expect(WPML_MAX_WAYPOINTS).toBe(MAX_WAYPOINTS_PER_ROUTE)
  })

  test('65536 waypoints passam no preflight e na fronteira; 65537 nao', () => {
    expect(codes(preflightPlan({ plan: plano(65536) }))).not.toContain('too-many-waypoints')
    const demais = preflightPlan({ plan: plano(65537) }).find(
      (i) => i.code === 'too-many-waypoints',
    )
    expect(demais).toMatchObject({ level: 'block', params: { n: 65537, max: 65536 } })
    expect(codes(preflightArea({ plan: plano(65536) }))).not.toContain('too-many-waypoints')
    expect(codes(preflightArea({ plan: plano(65537) }))).toContain('too-many-waypoints')
    expect(() => validateExportParams({ ...base, waypoints: rota(65536) })).not.toThrow()
    expect(() => validateExportParams({ ...base, waypoints: rota(65537) })).toThrow(
      /too-many-waypoints/,
    )
  })
})

describe('wpml:duration nunca 0 numa rota com comprimento (ponto 9)', () => {
  const porVelocidade = routeLengthM(base.waypoints) / base.speed

  test('durationS nula, ausente, 0 ou -0 cai em distancia / velocidade', () => {
    for (const durationS of [null, undefined, 0, -0]) {
      const xml = buildWaylinesWPML({ ...base, durationS })
      const d = Number(campo(xml, 'duration'))
      expect(d).toBeGreaterThan(0)
      expect(d).toBeCloseTo(porVelocidade, 1)
    }
  })

  test('uma durationS positiva vai tal qual', () => {
    expect(campo(buildWaylinesWPML({ ...base, durationS: 0.01 }), 'duration')).toBe('0.01')
    expect(campo(buildWaylinesWPML({ ...base, durationS: 123.4 }), 'duration')).toBe('123.4')
  })

  test('rota de comprimento zero: 0 finito, nunca NaN nem Infinity', () => {
    const parado = [
      [-9.14, 38.7, 60],
      [-9.14, 38.7, 60],
    ]
    for (const durationS of [null, 0]) {
      const xml = buildWaylinesWPML({ ...base, waypoints: parado, durationS })
      expect(campo(xml, 'distance')).toBe('0')
      expect(campo(xml, 'duration')).toBe('0')
    }
  })
})

describe('velocidade acima do intervalo documentado (pontos 2b e 2d)', () => {
  const plan = { waypoints: base.waypoints, stats: {} }
  const aviso = (items) => items.find((i) => i.code === 'speed-above-documented')

  test('a transicao continua limitada a 15; autoFlightSpeed e waypointSpeed levam a pedida', () => {
    const p = { ...base, speed: 20 }
    for (const xml of [buildWaylinesWPML(p), buildTemplateKML(p)]) {
      expect(campo(xml, 'globalTransitionalSpeed')).toBe('15')
      expect(campo(xml, 'autoFlightSpeed')).toBe('20')
    }
    expect(campo(buildWaylinesWPML(p), 'waypointSpeed')).toBe('20')
  })

  test('aviso acima de 15 m/s, nos dois motores; em 15 nao', () => {
    expect(MAX_TRANSITIONAL_SPEED_MS).toBe(15)
    for (const motor of [preflightArea, preflightPlan]) {
      expect(aviso(motor({ plan, speed: 15 }))).toBeUndefined()
      expect(aviso(motor({ plan }))).toBeUndefined()
      expect(aviso(motor({ plan, speed: 15.5 }))).toEqual({
        level: 'warn',
        code: 'speed-above-documented',
        params: { v: '15.5', max: 15 },
      })
      expect(aviso(motor({ plan, speed: 20 })).params.v).toBe('20')
    }
  })

  test('texto em PT e EN, com as mesmas variaveis', () => {
    const msg = preflightDict['preflight.speed-above-documented']
    expect(typeof msg?.pt).toBe('string')
    expect(typeof msg?.en).toBe('string')
    for (const lang of ['pt', 'en']) {
      expect(msg[lang]).toContain('{v}')
      expect(msg[lang]).toContain('{max}')
    }
  })
})
