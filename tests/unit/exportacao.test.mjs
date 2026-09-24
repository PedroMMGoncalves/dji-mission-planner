/**
 * Fronteira de exportação sob parâmetros aleatórios: o que passa a validação
 * tem de sair como XML bem formado, sem lixo, com os rumos no intervalo do
 * WPML; o que está fora do domínio tem de ser recusado.
 */
import fc from 'fast-check'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, test } from 'vitest'
import {
  PASS_DAMPING_M,
  PASS_MIN_DAMPING_M,
  blockExportParams,
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'
import { passThroughFor, routeLengthM } from '../../src/utils/geo.js'

const JUNK = /(^|>)\s*(NaN|undefined|Infinity|null)\s*(<|$)/
const campoNum = (xml, tag) => {
  const m = xml.match(new RegExp(`<wpml:${tag}>([^<]*)</wpml:${tag}>`))
  return m ? Number(m[1]) : null
}
const wpml = {
  droneEnumValue: 77,
  droneSubEnumValue: 0,
  payloadEnumValue: 66,
  payloadSubEnumValue: 0,
  payloadPositionIndex: 0,
}

const waypoint = fc.tuple(
  fc.double({ min: -179.9, max: 179.9, noNaN: true }),
  fc.double({ min: -84, max: 84, noNaN: true }),
)
const params = fc.record({
  waypoints: fc.array(waypoint, { minLength: 2, maxLength: 40 }),
  altitude: fc.double({ min: 20, max: 300, noNaN: true }),
  speed: fc.double({ min: 1, max: 20, noNaN: true }),
  photoIntervalM: fc.double({ min: 0, max: 50, noNaN: true }),
  triggerMode: fc.constantFrom('distance', 'time'),
  sensorType: fc.constantFrom('camera', 'lidar'),
  gimbalPitch: fc.integer({ min: -90, max: 0 }),
  name: fc.stringMatching(/^[a-z0-9_-]{1,20}$/),
})
const perWaypointFor = (n) =>
  fc.array(
    fc.oneof(
      fc.constant(null),
      fc.record({
        heading: fc.double({ min: -180, max: 359.99, noNaN: true }),
        gimbalPitch: fc.integer({ min: -120, max: 60 }),
        actions: fc.constantFrom(['takePhoto'], []),
      }),
    ),
    { minLength: n, maxLength: n },
  )

describe('buildWaylinesWPML', () => {
  test('parâmetros válidos dão XML bem formado, sem lixo, rumos em [-180, 180] e um Placemark por waypoint', () => {
    fc.assert(
      fc.property(
        params.chain((p) =>
          fc
            .tuple(
              perWaypointFor(p.waypoints.length),
              fc.array(fc.boolean(), {
                minLength: p.waypoints.length,
                maxLength: p.waypoints.length,
              }),
            )
            .map(([pw, pass]) => ({ ...p, perWaypoint: pw, passThrough: pass })),
        ),
        (p) => {
          const xml = buildWaylinesWPML({ ...p, wpml })
          expect(XMLValidator.validate(xml)).toBe(true)
          expect(JUNK.test(xml)).toBe(false)
          expect((xml.match(/<Placemark>/g) ?? []).length).toBe(p.waypoints.length)
          for (const m of xml.matchAll(/<wpml:waypointHeadingAngle>([-\d.]+)</g)) {
            const h = Number(m[1])
            expect(h).toBeGreaterThanOrEqual(-180)
            expect(h).toBeLessThanOrEqual(180)
          }
          const dist = campoNum(xml, 'distance')
          const dur = campoNum(xml, 'duration')
          expect(Number.isFinite(dist) && dist >= 0).toBe(true)
          expect(Number.isFinite(dur) && dur >= 0).toBe(true)
          const tpl = buildTemplateKML({ ...p, wpml })
          expect(XMLValidator.validate(tpl)).toBe(true)
          expect(JUNK.test(tpl)).toBe(false)
        },
      ),
      { numRuns: 150 },
    )
  })

  test('um grupo de disparo por intervalo, e só quando há disparo', () => {
    const intervalos = (n) =>
      fc
        .array(fc.integer({ min: 0, max: n - 1 }), { minLength: 2, maxLength: 6 })
        .map((cortes) => [...new Set(cortes)].sort((a, b) => a - b))
        .map((c) => {
          const out = []
          for (let i = 0; i + 1 < c.length; i += 2) out.push([c[i], c[i + 1]])
          return out
        })
        .filter((r) => r.length > 0)
    fc.assert(
      fc.property(
        params.chain((p) =>
          intervalos(p.waypoints.length).map((r) => ({ ...p, triggerRanges: r })),
        ),
        (p) => {
          const xml = buildWaylinesWPML({ ...p, wpml })
          const grupos = (xml.match(/multipleDistance|multipleTiming/g) ?? []).length
          expect(grupos).toBe(p.photoIntervalM > 0 ? p.triggerRanges.length : 0)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('validateExportParams', () => {
  const base = {
    waypoints: [
      [-9.14, 38.7],
      [-9.13, 38.7],
    ],
    altitude: 100,
    speed: 8,
    wpml,
    photoIntervalM: 20,
    triggerMode: 'distance',
    sensorType: 'camera',
  }
  const recusa = (extra) => expect(() => validateExportParams({ ...base, ...extra })).toThrow()

  test('fora do domínio é recusado, dentro é aceite', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 0, noNaN: true }), (altitude) => {
        recusa({ altitude })
      }),
      { numRuns: 50 },
    )
    fc.assert(
      fc.property(fc.double({ min: 30.0001, max: 1e6, noNaN: true }), (speed) => {
        recusa({ speed })
      }),
      { numRuns: 50 },
    )
    fc.assert(
      fc.property(fc.double({ min: 360, max: 1e4, noNaN: true }), (heading) => {
        recusa({ perWaypoint: [{ heading }] })
      }),
      { numRuns: 50 },
    )
    fc.assert(
      fc.property(fc.double({ min: 60.0001, max: 1e3, noNaN: true }), (gimbalPitch) => {
        recusa({ perWaypoint: [{ gimbalPitch }] })
      }),
      { numRuns: 50 },
    )
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 300, noNaN: true }),
        fc.double({ min: 0.1, max: 30, noNaN: true }),
        (altitude, speed) => {
          expect(validateExportParams({ ...base, altitude, speed })).toBeTruthy()
        },
      ),
      { numRuns: 50 },
    )
  })
})

/**
 * O intervalo de disparo escrito no ficheiro tem uma casa decimal. Se esse
 * arredondamento for para cima, o drone dispara mais espaçado do que o
 * plano previa e a sobreposição frontal entregue fica ABAIXO da pedida, sem
 * que nada avise. A garantia que este bloco exige é unilateral: o intervalo
 * no ficheiro nunca é maior do que o intervalo pedido.
 */
describe('intervalo de disparo: nunca entrega menos sobreposicao do que a pedida', () => {
  const rota = [
    [-7.9, 38.55],
    [-7.895, 38.55],
  ]
  // le o parametro do proprio grupo de disparo periodico, nao de outro grupo
  const disparo = (xml) => {
    const m = xml.match(
      /<wpml:actionTriggerType>(multipleTiming|multipleDistance)<\/wpml:actionTriggerType>\s*<wpml:actionTriggerParam>([^<]+)</,
    )
    return m ? { tipo: m[1], param: Number(m[2]) } : null
  }

  test('o intervalo efectivo nunca excede o pedido, nos dois modos', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 200, noNaN: true }), // intervalo pedido (m)
        fc.double({ min: 1, max: 20, noNaN: true }), // velocidade (m/s)
        fc.constantFrom('distance', 'time'),
        (photoIntervalM, speed, triggerMode) => {
          const xml = buildWaylinesWPML({
            waypoints: rota,
            altitude: 100,
            speed,
            wpml,
            photoIntervalM,
            triggerMode,
            sensorType: 'camera',
          })
          const d = disparo(xml)
          expect(d).not.toBeNull()
          const efectivoM = d.tipo === 'multipleTiming' ? d.param * speed : d.param
          // tolerância só para o piso de 0,1 do próprio formato
          expect(efectivoM).toBeLessThanOrEqual(Math.max(photoIntervalM, 0.1 * speed) + 1e-9)
        },
      ),
      { numRuns: 300 },
    )
  })

  test('o caso medido que motivou a guarda: 17,26 m a 13,7 m/s', () => {
    const xml = buildWaylinesWPML({
      waypoints: rota,
      altitude: 100,
      speed: 13.7,
      wpml,
      photoIntervalM: 17.26,
      triggerMode: 'time',
      sensorType: 'camera',
    })
    // 17,26/13,7 = 1,2599 s: ao mais proximo dava 1,3 s (17,81 m, mais do
    // que o pedido); por defeito da 1,2 s (16,44 m, que sobrepoe a mais)
    expect(disparo(xml)).toEqual({ tipo: 'multipleTiming', param: 1.2 })
  })

  test('valores ja certos nao perdem um passo por virgula flutuante', () => {
    for (const [photoIntervalM, esperado] of [
      [0.3, 0.3],
      [20, 20],
      [25, 25],
      [1.7, 1.7],
    ]) {
      const xml = buildWaylinesWPML({
        waypoints: rota,
        altitude: 100,
        speed: 10,
        wpml,
        photoIntervalM,
        triggerMode: 'distance',
        sensorType: 'camera',
      })
      expect(disparo(xml).param).toBe(esperado)
    }
  })
})

/*
 * Primeiro voo real (M3E, 2026-09): o comando mostrou 100 % e 00:00 em falta
 * com a missao na foto 114 de 139. O Pilot 2 tira o progresso e o tempo em
 * falta de wpml:distance e wpml:duration, no Folder do waylines.wpml, entre
 * waylineId e autoFlightSpeed — e onde os 81 KMZ escritos pelo comando os
 * trazem (docs/VALIDACAO.md, 5.1). A exportacao nao escrevia nenhum dos dois.
 */
describe('distancia e duracao da rota no waylines.wpml', () => {
  const base = {
    name: 'd',
    waypoints: [
      [-8.166, 37.8675, 60],
      [-8.164, 37.8675, 60],
      [-8.164, 37.8677, 70],
      [-8.166, 37.8677, 70],
    ],
    altitude: 60,
    speed: 8,
    wpml,
    photoIntervalM: 0,
    triggerMode: 'distance',
    sensorType: 'camera',
  }

  test('escritas no Folder, entre waylineId e autoFlightSpeed', () => {
    const xml = buildWaylinesWPML(base)
    expect(xml).toMatch(
      /<wpml:waylineId>0<\/wpml:waylineId>\s*<wpml:distance>[^<]+<\/wpml:distance>\s*<wpml:duration>[^<]+<\/wpml:duration>\s*<wpml:autoFlightSpeed>/,
    )
  })

  test('distance e o comprimento 3D da rota, o mesmo que o Pilot 2 escreve', () => {
    const xml = buildWaylinesWPML(base)
    expect(campoNum(xml, 'distance')).toBeCloseTo(routeLengthM(base.waypoints), 1)
  })

  test('duration e a prevista pelo plano; sem ela, distancia / velocidade', () => {
    expect(campoNum(buildWaylinesWPML({ ...base, durationS: 123.4 }), 'duration')).toBe(123.4)
    expect(campoNum(buildWaylinesWPML(base), 'duration')).toBeCloseTo(
      routeLengthM(base.waypoints) / base.speed,
      1,
    )
  })

  test('nunca zero numa rota com comprimento — era o que dava 100 % a meio', () => {
    const xml = buildWaylinesWPML(base)
    expect(campoNum(xml, 'distance')).toBeGreaterThan(0)
    expect(campoNum(xml, 'duration')).toBeGreaterThan(0)
  })

  test('o template.kml nao as leva, como nos ficheiros do comando', () => {
    const tpl = buildTemplateKML(base)
    expect(tpl).not.toMatch(/wpml:distance|wpml:duration/)
  })

  test('durationS nao finita ou negativa e recusada na fronteira', () => {
    for (const durationS of [NaN, Infinity, -1, '10']) {
      expect(() => validateExportParams({ ...base, durationS })).toThrow()
    }
    expect(() => validateExportParams({ ...base, durationS: 0 })).not.toThrow()
    expect(() => validateExportParams({ ...base, durationS: null })).not.toThrow()
  })
})

describe('blockExportParams', () => {
  const params = {
    name: 'm',
    waypoints: [
      [0, 0],
      [0.01, 0],
      [0.01, 0.001],
      [0, 0.001],
    ],
    perWaypoint: [{ actions: ['takePhoto'] }],
    triggerRanges: [[0, 3]],
    durationS: 999,
    altitude: 100,
    speed: 10,
    wpml,
  }

  test('cada bloco leva o seu nome, waypoints, accoes, intervalos e duracao', () => {
    const b = { id: 3, waypoints: params.waypoints.slice(0, 2), durationS: 42 }
    const p = blockExportParams(params, b)
    expect(p.name).toBe('m_b03')
    expect(p.waypoints).toBe(b.waypoints)
    expect(p.perWaypoint).toBeNull()
    expect(p.triggerRanges).toBeNull()
    expect(p.durationS).toBe(42)
  })

  test('a duracao da missao inteira nunca passa para um bloco', () => {
    // sem a do bloco, o exportador cai em distancia / velocidade do bloco
    const b = { id: 1, waypoints: params.waypoints.slice(0, 2) }
    const p = blockExportParams(params, b)
    expect(p.durationS).toBeNull()
    expect(campoNum(buildWaylinesWPML(p), 'duration')).toBeCloseTo(
      routeLengthM(b.waypoints) / params.speed,
      1,
    )
  })
})

/*
 * Pontos de passagem: o modo das grelhas para em cada waypoint, e no 1.o voo
 * real (M3E) o drone parava em cada foto. Nos pontos intermedios passa a
 * sair o modo que o Pilot 2 chama «Turns before waypoint. Flies through».
 */
describe('passThrough: pontos sem paragem', () => {
  const lat = 38.7
  const mL = 111320 * Math.cos((lat * Math.PI) / 180)
  const p = (x, y, z) => [-9.14 + x / mL, lat + y / 110574, z]
  // faixa de 5 pontos a 20 m, ligacao, faixa de 3 pontos
  const wps = [
    p(0, 0, 60),
    p(20, 0, 60),
    p(40, 0, 62),
    p(60, 0, 60),
    p(80, 0, 60),
    p(80, 30, 60),
    p(40, 30, 60),
    p(0, 30, 60),
  ]
  const base = {
    name: 'p',
    waypoints: wps,
    altitude: 60,
    speed: 8,
    wpml,
    photoIntervalM: 0,
    triggerMode: 'distance',
    sensorType: 'camera',
    // Sem isto, duas exportacoes consecutivas podem cair em milissegundos
    // diferentes e o createTime/updateTime do template.kml diverge.
    createTimeMs: 1756000000000,
  }
  const pass = passThroughFor([5, 3])
  const STOP = 'toPointAndStopWithDiscontinuityCurvature'
  const PASS = 'toPointAndPassWithContinuityCurvature'
  const modos = (xml) => [...xml.matchAll(/<wpml:waypointTurnMode>([^<]+)</g)].map((m) => m[1])
  const bloco = (xml, i) => xml.split('<Placemark>')[i + 1]
  const amortecimento = (b) => Number(b.match(/<wpml:waypointTurnDampingDist>([^<]+)</)[1])

  test('sem passThrough o XML e o de sempre', () => {
    expect(buildWaylinesWPML({ ...base, passThrough: null })).toBe(buildWaylinesWPML(base))
    expect(buildTemplateKML({ ...base, passThrough: null })).toBe(buildTemplateKML(base))
  })

  test('intermedios passam, cantos param', () => {
    const m = modos(buildWaylinesWPML({ ...base, passThrough: pass }))
    expect(m).toEqual([STOP, PASS, PASS, PASS, STOP, STOP, PASS, STOP])
  })

  test('linha recta e amortecimento dentro dos limites da DJI', () => {
    const b = bloco(buildWaylinesWPML({ ...base, passThrough: pass }), 2)
    expect(b).toMatch(/<wpml:useStraightLine>1</)
    const d = amortecimento(b)
    expect(d).toBeGreaterThanOrEqual(PASS_MIN_DAMPING_M)
    expect(d).toBeLessThanOrEqual(PASS_DAMPING_M)
    expect(d).toBeLessThanOrEqual(0.45 * 20)
  })

  test('troco curto: o amortecimento encolhe; demasiado curto, o ponto para', () => {
    const curto = [p(0, 0), p(1, 0), p(2, 0), p(2.3, 0), p(10, 0)]
    const xml = buildWaylinesWPML({
      ...base,
      waypoints: curto,
      passThrough: [false, true, true, true, false],
    })
    const m = modos(xml)
    expect(m[1]).toBe(PASS)
    expect(amortecimento(bloco(xml, 1))).toBeCloseTo(0.45, 2)
    expect(m[2]).toBe(STOP) // 0,45 x 0,3 m < 0,2 m
    expect(m[3]).toBe(STOP)
  })

  test('extremos da rota nunca passam', () => {
    const m = modos(buildWaylinesWPML({ ...base, passThrough: wps.map(() => true) }))
    expect(m[0]).toBe(STOP)
    expect(m.at(-1)).toBe(STOP)
  })

  test('template coerente: parametros proprios so nos pontos de passagem', () => {
    const tpl = buildTemplateKML({ ...base, passThrough: pass })
    expect(XMLValidator.validate(tpl)).toBe(true)
    const globais = [...tpl.matchAll(/<wpml:useGlobalTurnParam>(\d)</g)].map((x) => x[1])
    expect(globais).toEqual(['1', '0', '0', '0', '1', '1', '0', '1'])
    expect((tpl.match(/<wpml:waypointTurnParam>/g) ?? []).length).toBe(4)
    expect(tpl).toMatch(new RegExp(`<wpml:globalWaypointTurnMode>${STOP}<`))
    const straight = [...tpl.matchAll(/<wpml:useStraightLine>(\d)</g)].map((x) => x[1])
    expect(straight).toEqual(['1', '1', '1', '1', '1', '1', '1', '1'])
  })

  test('passThrough invalido e recusado', () => {
    for (const passThrough of ['sim', [1, 0], wps.map(() => true).concat(true)]) {
      expect(() => validateExportParams({ ...base, passThrough })).toThrow()
    }
    // eslint-disable-next-line no-sparse-arrays
    expect(() => validateExportParams({ ...base, passThrough: [false, , true] })).not.toThrow()
  })

  test('blockExportParams fatia passThrough pelo bloco', () => {
    const b = { id: 1, waypoints: wps.slice(0, 5), passThrough: pass.slice(0, 5) }
    const todo = { ...base, passThrough: pass }
    expect(blockExportParams(todo, b).passThrough).toEqual(pass.slice(0, 5))
    expect(blockExportParams(todo, { id: 2, waypoints: wps }).passThrough).toBeNull()
  })
})
