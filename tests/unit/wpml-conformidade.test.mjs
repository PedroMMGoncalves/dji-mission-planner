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
  describeErrors,
  validateKmz,
  validateWpml,
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
    expect(e['Placemark/useStraightLine'].docs['30.waylines-wpml.md'].support).toEqual([
      'M30/M30T',
      'M3E/M3T/M3M',
      'M3D/M3TD',
    ])
    expect(e['Placemark/caliFlightEnable#mapping2d']).toBeDefined()
    expect(e['Folder/caliFlightEnable']).toBeUndefined()
    expect(e['droneInfo/droneEnumValue'].docs['40.common-element.md'].values).toEqual([
      '89',
      '60',
      '67',
      '77',
      '91',
    ])
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

  test('cada excepcao tem uma prova escrita', () => {
    for (const v of Object.values(ALLOW.elements)) expect(v.length).toBeGreaterThan(10)
    for (const m of Object.values(ALLOW.values))
      for (const v of Object.values(m)) expect(v.length).toBeGreaterThan(10)
    for (const v of Object.values(ALLOW.missing)) expect(v.length).toBeGreaterThan(10)
    for (const o of ALLOW.order) expect(o.why.length).toBeGreaterThan(5)
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
    ])
      expect(nomes).toContain(n)
    expect(casos.length).toBeGreaterThanOrEqual(50)
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
