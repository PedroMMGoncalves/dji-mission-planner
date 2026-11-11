/*
 * Conformidade WPML contra o dicionario da especificacao (T1-T4, T7 e T10
 * da revisao da exportacao, docs/REVISAO-EXPORTACAO-2026-10.md): cada
 * ficheiro gerado — a matriz modos x aeronaves e os ficheiros dourados — so
 * usa elementos, valores, ordens e obrigatorios que a especificacao da, ou
 * que uma excepcao explica com a prova.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { buildBlocksZip } from '../../src/utils/exporters.js'
import {
  ALLOW,
  SPEC,
  USED,
  allowEntries,
  describeErrors,
  modelsOf,
  openDivergences,
  validateKmz,
  validateWpml,
  whyOf,
} from '../lib/wpml-conformidade.mjs'
import { casosMatriz, ficheiros } from '../lib/wpml-matriz.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDEN = join(HERE, '..', 'golden')

describe('dicionario da especificacao (T1)', () => {
  test('entradas-sentinela: as tabelas foram lidas como deve ser', () => {
    const e = SPEC.elements
    expect(e['actionGroup/actionGroupMode'].docs['40.common-element.md'].values).toEqual([
      'sequence',
    ])
    expect(
      e['actionActuatorFuncParam/gimbalHeadingYawBase@gimbalRotate'].docs['40.common-element.md']
        .values,
    ).toEqual(['north'])
    expect(e['Folder/templateType'].docs['20.template-kml.md'].values).toEqual([
      'waypoint',
      'mapping2d',
      'mapping3d',
      'mappingStrip',
    ])
    expect(e['missionConfig/takeOffSecurityHeight'].docs['30.waylines-wpml.md'].range).toEqual({
      min: 1.2,
      minOpen: false,
      max: 1500,
      maxOpen: false,
    })
    expect(e['missionConfig/globalTransitionalSpeed'].docs['30.waylines-wpml.md'].range).toEqual({
      min: 0,
      minOpen: false,
      max: 15,
      maxOpen: false,
    })
    // a pagina viva separa «M3D/M3TD，M4D/M4TD» com a virgula chinesa
    expect(e['Placemark/useStraightLine'].docs['30.waylines-wpml.md'].support).toEqual([
      'M30/M30T',
      'M3E/M3T/M3M',
      'M3D/M3TD',
      'M4D/M4TD',
      'M4E/M4T',
      'M5TD',
    ])
    expect(e['Placemark/quickOrthoMappingEnable'].docs['20.template-kml.md'].support).toEqual([
      'M4E',
    ])
    expect(e['missionConfig/globalRTHHeight'].docs['20.template-kml.md'].range).toEqual({
      min: 2,
      minOpen: false,
      max: 1500,
      maxOpen: false,
    })
    // lista com o tipo na coluna da unidade; «Note:» nao e valor
    expect(
      new Set(
        e['actionActuatorFuncParam/payloadLensIndex@takePhoto'].docs['40.common-element.md'].values,
      ),
    ).toEqual(new Set(['zoom', 'wide', 'ir', 'narrow_band', 'visable']))
    expect(e['missionConfig/finishAction'].docs['30.waylines-wpml.md'].values).not.toContain('Note')
    expect(e['Placemark/caliFlightEnable#mapping2d']).toBeDefined()
    expect(e['Folder/caliFlightEnable']).toBeUndefined()
    // os enums das aeronaves e dos payloads remetem para a pagina de suporte de produtos
    expect(e['droneInfo/droneEnumValue'].docs['40.common-element.md'].values).toBeNull()
    expect(e['droneInfo/droneEnumValue'].docs['40.common-element.md'].ref).toEqual({
      page: 'product-support',
      table: 'aircraft',
      field: 'type',
    })
    expect(e['payloadInfo/payloadPositionIndex'].docs['40.common-element.md'].ref.field).toBe(
      'gimbalIndex',
    )
    const ps = SPEC.productSupport
    expect(ps.aircraft.find((a) => a.type === 99 && a.subType === 1)?.domain).toBe(0)
    expect(ps.cameras.find((c) => c.type === 89)?.gimbalIndex).toEqual([0])
    expect(ps.cameras.find((c) => c.type === 42)?.gimbalIndex).toEqual([0, 1, 2])
    expect(ps.cameras.some((c) => [50, 65534, 65535].includes(c.type))).toBe(false)
    expect(SPEC.namespaces).toEqual({ 'template.kml': ['1.0.2'], 'waylines.wpml': ['1.0.2'] })
    // a origem: as paginas vivas, com a data que declaram
    expect(SPEC.source.site).toBe('https://developer.dji.com/doc/cloud-api-tutorial')
    for (const pg of SPEC.source.pages) expect(pg.updated).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(SPEC.examples['waylines.wpml'].Placemark).toEqual([
      'Point',
      'index',
      'executeHeight',
      'waypointSpeed',
      'waypointHeadingParam',
      'waypointTurnParam',
      'actionGroup',
    ])
    expect(Object.keys(e).length).toBeGreaterThan(200)
  })

  test('cada excepcao tem uma prova escrita; as abertas, a referencia da documentacao', () => {
    // uma prova (texto), ou { why, file?, open? }
    for (const { key, entry } of allowEntries()) {
      expect(whyOf(entry)?.length ?? 0, key).toBeGreaterThan(5)
      if (typeof entry === 'object' && 'open' in entry)
        expect(entry.open.length, key).toBeGreaterThan(20)
    }
    expect(Object.keys(ALLOW.namespace).sort()).toEqual(['1.0.3', '1.0.6'])
  })

  test('modelos da coluna de suporte', () => {
    expect(modelsOf('M3E/M3T/M3M')).toEqual(['M3E', 'M3T', 'M3M'])
    expect(modelsOf('M300 RTK and M350 RTK (H20/H20T/H20N)')).toEqual(['M300 RTK', 'M350 RTK'])
    expect(modelsOf('M300 RTK and M350 RTK(H20/H20T)')).toEqual(['M300 RTK', 'M350 RTK'])
    expect(modelsOf('M4E')).toEqual(['M4E'])
  })
})

describe('matriz modos x aeronaves (T2, T3, T4)', () => {
  const casos = casosMatriz()
  test('a matriz cobre os modos e as aeronaves', () => {
    const nomes = casos.map((c) => c.name)
    for (const n of [
      'area-distancia-m3e-m3e_wide',
      'area-tempo-m4t-m4t_thermal',
      'area-waypoint-m300rtk-p1',
      'area-terreno-custom-custom',
      'area-lidar-m300-mapper',
      'corredor-distance-m3e',
      'corredor-waypoint-m300rtk',
      'fachada-m4t',
      'orbita-foto-m3e',
      'orbita-nivel-1-m3e',
      'orbita-video-m3e',
      'circular-m300rtk',
      'inspeccao-m4t',
      // combinações acrescentadas na revisão (T11): M4T e M300 nos modos que
      // só tinham uma aeronave, LiDAR em corredor, e a área pelo montador real
      'corredor-distance-m4t',
      'corredor-lidar-m300rtk',
      'fachada-m300rtk',
      'orbita-foto-m4t',
      'orbita-nivel-1-m300rtk',
      'orbita-video-m300rtk',
      'circular-m4t',
      'inspeccao-m300rtk',
      'area-blocos-m3e-1',
      'area-blocos-m3e-2',
      'area-cruzada-nadir-m3e',
      'area-terreno-m300rtk',
      'area-mosaico-bateria-m4t-1',
      'area-mosaico-bateria-m4t-2',
      // dicionario das paginas vivas (2026-11): cada modo em cada aeronave e
      // payload, o LiDAR proprio, a posicao do payload e o namespace
      'area-cruzada-nadir-m4t-m4t_thermal',
      'area-cruzada-nadir-m300rtk-p1',
      'area-cruzada-nadir-m300rtk-mapper_plus',
      'area-cruzada-nadir-custom-custom',
      'area-blocos-m300rtk-mapper_plus-1',
      'area-blocos-custom-lidar-1',
      'area-lidar-custom',
      'corredor-lidar-custom',
      'corredor-distance-m4t-m4t_thermal',
      'corredor-waypoint-custom',
      'fachada-m4t-m4t_wide',
      'fachada-custom',
      'orbita-video-m4t-m4t_thermal',
      'orbita-foto-custom',
      'circular-m4t-m4t_thermal',
      'circular-custom',
      'inspeccao-m4t-m4t_thermal',
      'inspeccao-custom',
      'area-distancia-m300rtk-p1-pos1',
      'orbita-video-m300rtk-p1-pos2',
      'inspeccao-custom-custom-pos2',
      'area-lidar-m300-mapper-pos2',
      'corredor-lidar-m300rtk-mapper-pos1',
      'area-distancia-m4t-m4t_thermal-ns106',
      'area-distancia-m300rtk-p1-ns103',
      'orbita-video-m3e-m3e_wide-ns103',
      'area-blocos-m4t-ns106-1',
    ])
      expect(nomes).toContain(n)
    expect(new Set(nomes).size).toBe(nomes.length)
    expect(casos.length).toBeGreaterThanOrEqual(280)
  })
  test('a câmara dispara em todos os casos com câmara, nunca com LiDAR; a lente é a do payload', () => {
    for (const c of casos) {
      const { waylines } = ficheiros(c.params)
      const dispara = /takePhoto|startRecord|multipleDistance|multipleTiming/.test(waylines)
      expect(dispara, c.name).toBe(c.params.sensorType !== 'lidar')
      const fmt = c.params.wpml?.imageFormat
      const lentes = [...waylines.matchAll(/<wpml:payloadLensIndex>([^<]*)</g)].map((m) => m[1])
      if (dispara && typeof fmt === 'string' && /^[a-z_,]+$/.test(fmt)) {
        expect(lentes.length, `${c.name}: sem payloadLensIndex`).toBeGreaterThan(0)
        expect(new Set(lentes), c.name).toEqual(new Set([fmt]))
      } else expect(lentes, c.name).toEqual([])
    }
  })
  for (const c of casos) {
    test(`conforme: ${c.name}`, () => {
      const { errors, aircraft } = validateWpml(ficheiros(c.params))
      expect(aircraft).not.toBeNull()
      expect(errors, describeErrors(errors)).toEqual([])
    })
  }
})

describe('ficheiros dourados (T2, T3, T4)', () => {
  const nomes = [
    ...new Set(
      readdirSync(GOLDEN)
        .filter((f) => f.endsWith('.waylines.wpml'))
        .map((f) => f.replace('.waylines.wpml', '')),
    ),
  ]
  test('ha ficheiros dourados', () => expect(nomes.length).toBeGreaterThan(5))
  for (const n of nomes) {
    test(`conforme: golden ${n}`, () => {
      const template = readFileSync(join(GOLDEN, `${n}.template.kml`), 'utf8')
      const waylines = readFileSync(join(GOLDEN, `${n}.waylines.wpml`), 'utf8')
      const { errors } = validateWpml({ template, waylines })
      expect(errors, describeErrors(errors)).toEqual([])
    })
  }
})

describe('empacotamento (T7)', () => {
  test('cada KMZ de um ZIP de blocos tem so os dois ficheiros, UTF-8 sem BOM, XML valido e conforme', async () => {
    const caso = casosMatriz().find((c) => c.name === 'area-distancia-m3e-m3e_wide')
    const wps = caso.params.waypoints
    const blocks = [
      {
        id: 1,
        waypoints: wps.slice(0, 4),
        triggerRanges: [
          [0, 1],
          [2, 3],
        ],
      },
      { id: 2, waypoints: wps.slice(4), triggerRanges: [[0, 1]] },
    ]
    const zip = await buildBlocksZip({ ...caso.params, triggerRanges: null }, blocks)
    const JSZip = (await import('jszip')).default
    const outer = await JSZip.loadAsync(await zip.arrayBuffer())
    const kmzs = Object.keys(outer.files).filter((f) => f.endsWith('.kmz'))
    expect(kmzs).toHaveLength(2)
    for (const f of kmzs) {
      const { errors, template, waylines } = await validateKmz(
        await outer.file(f).async('arraybuffer'),
      )
      expect(errors, describeErrors(errors)).toEqual([])
      expect(template.charCodeAt(0)).not.toBe(0xfeff)
      expect(waylines.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    }
  })

  test('o validador apanha o que apanhou a revisao', () => {
    const caso = casosMatriz().find((c) => c.name === 'area-distancia-m3e-m3e_wide')
    const { template, waylines } = ficheiros(caso.params)
    const codes = (t, w) => validateWpml({ template: t, waylines: w }).errors.map((e) => e.code)
    // parallel (M4T, 2026-10), aircraft (E1), caliFlightEnable (E3), 4e-7 (M6)
    expect(
      codes(
        template,
        waylines.replace('<wpml:actionGroupMode>sequence', '<wpml:actionGroupMode>parallel'),
      ),
    ).toContain('enum')
    expect(
      codes(
        template,
        waylines.replace('gimbalHeadingYawBase>north', 'gimbalHeadingYawBase>aircraft'),
      ),
    ).toContain('enum')
    expect(
      codes(
        template.replace(
          '<wpml:templateId>0',
          '<wpml:caliFlightEnable>0</wpml:caliFlightEnable>\n    <wpml:templateId>0',
        ),
        waylines,
      ),
    ).toContain('unknown-element')
    expect(
      codes(template, waylines.replace(/<coordinates>[^<]+/, '<coordinates>4e-7,3e-7')),
    ).toContain('coherence')
    expect(
      codes(template, waylines.replace(/<wpml:executeHeight>[^<]+/, '<wpml:executeHeight>1e2')),
    ).toContain('number-format')
    expect(
      codes(
        template,
        waylines.replace(/<wpml:globalTransitionalSpeed>[^<]+/, '<wpml:globalTransitionalSpeed>16'),
      ),
    ).toContain('range')
    // o dicionario das paginas vivas: um elemento so do M4E no M4T, um
    // payload fora da tabela de camaras, um subtipo que a tabela nao tem, um
    // suporte que a camara nao tem, uma lente fora do enum, um namespace sem
    // prova e namespaces diferentes nos dois ficheiros
    const m4 = ficheiros(casosMatriz().find((c) => c.name === 'area-distancia-m4t-m4t_wide').params)
    expect(
      codes(
        m4.template.replace(
          '<wpml:useGlobalHeight>',
          '<wpml:quickOrthoMappingEnable>0</wpml:quickOrthoMappingEnable><wpml:useGlobalHeight>',
        ),
        m4.waylines,
      ),
    ).toContain('unsupported')
    const wl = (a, b) => codes(m4.template, m4.waylines.replace(a, b))
    expect(wl('<wpml:payloadEnumValue>89', '<wpml:payloadEnumValue>65534')).toContain('enum')
    expect(wl('<wpml:droneSubEnumValue>1', '<wpml:droneSubEnumValue>3')).toContain('enum')
    expect(wl('<wpml:payloadPositionIndex>0', '<wpml:payloadPositionIndex>1')).toContain('enum')
    expect(wl(/<wpml:payloadLensIndex>[^<]*/, '<wpml:payloadLensIndex>visable,foo')).toContain(
      'enum',
    )
    expect(
      codes(
        m4.template.replace('wpmz/1.0.2', 'wpmz/1.0.4'),
        m4.waylines.replace('wpmz/1.0.2', 'wpmz/1.0.4'),
      ),
    ).toContain('namespace')
    expect(codes(m4.template.replace('wpmz/1.0.2', 'wpmz/1.0.6'), m4.waylines)).toContain(
      'coherence',
    )
    // um elemento novo sem prova
    expect(
      codes(
        template,
        waylines.replace(
          '<wpml:waylineId>0</wpml:waylineId>',
          '<wpml:waylineId>0</wpml:waylineId>\n    <wpml:novidade>1</wpml:novidade>',
        ),
      ),
    ).toContain('unknown-element')
  })
})

describe('excepcoes (ALLOW)', () => {
  // corre depois da matriz e dos dourados (os testes de um ficheiro correm
  // por ordem): uma excepcao que nenhum ficheiro gerado usa deixou de ser
  // precisa e sai, para a lista dizer so o que a exportacao precisa
  test('cada excepcao e usada pela matriz ou pelos dourados', () => {
    const unused = allowEntries()
      .map((e) => e.key)
      .filter((k) => !USED.has(k))
    expect(unused).toEqual([])
  })
  test('divergencias abertas face a documentacao viva: contadas e listadas', () => {
    // a aplicacao escreve o que a documentacao nao aceita, sem prova de
    // campo; a decisao e do projecto (docs/VALIDACAO.md, 7.1)
    const open = openDivergences().map(({ key, entry }) => `${key}: ${entry.open}`)
    expect(open, open.join('\n')).toHaveLength(2)
  })
})
