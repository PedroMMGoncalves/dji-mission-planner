/**
 * Exportação, casos raros (src/utils/exporters.js): cada recusa da fronteira
 * com o seu código, o pormenor que diz onde está o erro e a mensagem
 * traduzida que o operador lê; o KML da área sem extras (o ficheiro do
 * Pilot 2) e com os extras para SIG (base, GCPs, faixas, buracos); e as
 * descargas no browser, com o document e o URL substituídos: o nome do
 * ficheiro, o tipo e o conteúdo que chegam ao disco.
 */
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { XMLValidator } from 'fast-xml-parser'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { translate } from '../../src/i18n.jsx'
import {
  MAX_WAYPOINTS_PER_ROUTE,
  MissionExportError,
  buildAreaKML,
  exportAreaKML,
  exportBlocksZip,
  exportWPMLKmz,
  validateExportParams,
} from '../../src/utils/exporters.js'
import { childNamed, findAll, textOf } from '../../src/utils/xml.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / 110574]
const rect = (x, y, w, h) => [em(x, y), em(x + w, y), em(x + w, y + h), em(x, y + h)]
const ring = rect(0, 0, 100, 60)

const wpml = {
  droneEnumValue: 99,
  droneSubEnumValue: 1,
  payloadEnumValue: 89,
  payloadSubEnumValue: 0,
  payloadPositionIndex: 0,
}
const base = {
  name: 'quinta_area',
  waypoints: [em(0, 20), em(100, 20)],
  altitude: 100,
  speed: 8,
  wpml,
  photoIntervalM: 20,
  triggerMode: 'distance',
  sensorType: 'camera',
  createTimeMs: 1760000000000,
}

/** Código e pormenor da recusa, ou null se passar. */
const recusa = (fn) => {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(MissionExportError)
    return { code: err.code, detail: err.detail }
  }
  return null
}
const xml = (s) => new DOMParser().parseFromString(s, 'text/xml')

// [o que vem mal, alteração aos parâmetros válidos, código, pormenor]
const RECUSAS = [
  [
    'waypoints a mais para o índice do WPML',
    { waypoints: new Array(MAX_WAYPOINTS_PER_ROUTE + 1).fill(em(0, 0)) },
    'too-many-waypoints',
    '65537',
  ],
  [
    'um waypoint que não é par',
    { waypoints: [em(0, 0), [-9.13]] },
    'waypoint-malformed',
    'índice 1',
  ],
  [
    'uma coordenada em texto',
    { waypoints: [[-9.14, '38.7'], em(100, 0)] },
    'waypoint-not-finite',
    'índice 0',
  ],
  [
    'uma longitude fora do globo',
    { waypoints: [em(0, 0), [181, 38.7]] },
    'waypoint-out-of-range',
    'índice 1: 181, 38.7',
  ],
  [
    'uma altura NaN num waypoint',
    { waypoints: [[...em(0, 0), Number.NaN], em(100, 0)] },
    'height-not-finite',
    'índice 0',
  ],
  ['um só waypoint', { waypoints: [em(0, 0)] }, 'too-few-waypoints', '1'],
  ['a altura global em texto', { altitude: '100' }, 'altitude-not-finite', '100'],
  ['velocidade nula', { speed: 0 }, 'speed-invalid', '0'],
  [
    'perfil sem o enum do payload',
    { wpml: { droneEnumValue: 99 } },
    'wpml-enums-missing',
    undefined,
  ],
  ['intervalo de disparo em texto', { photoIntervalM: '20' }, 'param-not-finite', 'photoIntervalM'],
  ['intervalo de disparo negativo', { photoIntervalS: -2 }, 'param-out-of-range', 'photoIntervalS'],
  ['altura de regresso nula', { rthHeightM: 0 }, 'param-out-of-range', 'rthHeightM'],
  ['altura de regresso acima de 1500 m', { rthHeightM: 1501 }, 'param-out-of-range', 'rthHeightM'],
  [
    'acções por waypoint fora de uma lista',
    { perWaypoint: { 0: { heading: 90 } } },
    'param-not-finite',
    'perWaypoint',
  ],
  [
    'uma entrada de acções que não é objecto',
    { perWaypoint: [null, 5] },
    'per-waypoint-invalid',
    '1',
  ],
  [
    'um rumo com o símbolo de grau',
    { perWaypoint: [{ heading: '270°' }] },
    'per-waypoint-not-finite',
    '0.heading=270°',
  ],
  [
    'uma inclinação por extenso',
    { perWaypoint: [undefined, { gimbalPitch: 'nadir' }] },
    'per-waypoint-not-finite',
    '1.gimbalPitch=nadir',
  ],
  [
    'as acções num texto',
    { perWaypoint: [{ actions: 'takePhoto' }] },
    'per-waypoint-invalid',
    '0.actions',
  ],
  [
    'um modo de curva que não existe',
    { turnMode: 'a & b' },
    'param-out-of-range',
    'turnMode=a & b',
  ],
  [
    'a altura de segurança da descolagem em texto',
    { takeOffSecurityHeightM: '30' },
    'param-not-finite',
    'takeOffSecurityHeightM',
  ],
  [
    'a posição do payload com marcação',
    { wpml: { ...wpml, payloadPositionIndex: '<mau>' } },
    'param-not-finite',
    'wpml.payloadPositionIndex',
  ],
  [
    'a inclinação global abaixo de −120°',
    { gimbalPitch: -121 },
    'param-out-of-range',
    'gimbalPitch',
  ],
  [
    'os intervalos de disparo num texto',
    { triggerRanges: 'todos' },
    'param-not-finite',
    'triggerRanges',
  ],
  [
    'intervalos de disparo sobrepostos',
    {
      triggerRanges: [
        [0, 1],
        [1, 1],
      ],
    },
    'param-out-of-range',
    'triggerRanges=[1,1]',
  ],
]

// [o que vem mal, anel, extras, código, pormenor]
const RECUSAS_KML = [
  ['área de dois vértices', ring.slice(0, 2), {}, 'ring-too-short', undefined],
  ['área que não é lista', null, {}, 'ring-too-short', undefined],
  [
    'base sem coordenadas',
    ring,
    { basePoint: [Number.NaN, 38.7] },
    'waypoint-not-finite',
    'índice -1',
  ],
  [
    'GCP fora do globo',
    ring,
    { gcps: [{ id: 'G1', point: [200, 38.7] }] },
    'waypoint-out-of-range',
    'índice 0: 200, 38.7',
  ],
  [
    'faixa com um ponto partido',
    ring,
    { lines: [[em(0, 20), [-9.13]]] },
    'waypoint-malformed',
    'índice 1',
  ],
  [
    'buraco com um vértice NaN',
    ring,
    { holes: [[em(40, 20), [Number.NaN, 38.7], em(50, 30)]] },
    'waypoint-not-finite',
    'índice 1',
  ],
]

describe('fronteira da exportação: cada recusa com o seu código e o sítio do erro', () => {
  test('sem parâmetros nenhuns: sem waypoints, e a mensagem é só o código', () => {
    let erro
    try {
      validateExportParams(null)
    } catch (err) {
      erro = err
    }
    expect(erro).toMatchObject({ name: 'MissionExportError', code: 'no-waypoints' })
    expect(erro.message).toBe('no-waypoints')
    // com pormenor, a mensagem leva-o depois do código
    expect(new MissionExportError('param-out-of-range', 'gimbalPitch').message).toBe(
      'param-out-of-range: gimbalPitch',
    )
  })

  test.each(RECUSAS)('%s', (_, extra, code, detail) => {
    expect(recusa(() => validateExportParams({ ...base, ...extra }))).toEqual({ code, detail })
  })

  test('alturas em falta num waypoint não são erro (vale a altura global)', () => {
    const waypoints = [[...em(0, 20), null], em(100, 20)]
    expect(recusa(() => validateExportParams({ ...base, waypoints }))).toBeNull()
  })

  test.each(RECUSAS_KML)('KML da área: %s', (_, anel, extras, code, detail) => {
    expect(recusa(() => buildAreaKML(anel, 'Quinta', extras))).toEqual({ code, detail })
  })

  test('cada código recusado tem mensagem nas duas línguas, com o pormenor no sítio', () => {
    const codigos = new Set([
      'no-waypoints',
      'duplicate-file-name',
      ...RECUSAS.map((r) => r[2]),
      ...RECUSAS_KML.map((r) => r[3]),
    ])
    for (const code of codigos) {
      for (const lang of ['pt', 'en']) {
        const msg = translate(lang, `export.err.${code}`, { d: 'X-9' })
        expect(msg, `${lang}: ${code}`).not.toBe(`export.err.${code}`)
        expect(msg).not.toMatch(/\{d\}/)
      }
    }
    // as acções por waypoint dizem qual é a entrada e o valor
    expect(
      translate('pt', 'export.err.per-waypoint-not-finite', { d: '0.heading=270°' }),
    ).toContain('(0.heading=270°)')
  })
})

describe('KML da área', () => {
  test('sem extras: o ficheiro mínimo do Pilot 2, com o anel fechado uma só vez', () => {
    const kml = buildAreaKML(ring, 'Quinta')
    expect(XMLValidator.validate(kml)).toBe(true)
    const doc = xml(kml)
    expect(findAll(doc, 'Placemark')).toHaveLength(1)
    expect(findAll(doc, 'Style')).toHaveLength(0)
    expect(findAll(doc, 'styleUrl')).toHaveLength(0)
    const coords = textOf(findAll(doc, 'coordinates')[0]).split(/\s+/)
    expect(coords).toHaveLength(ring.length + 1)
    expect(coords.at(-1)).toBe(coords[0])
    // um anel que já venha fechado não repete o último vértice
    expect(buildAreaKML([...ring, ring[0]], 'Quinta')).toBe(kml)
  })

  test('com extras para SIG: base, GCPs com nomes escapados, faixas numa pasta e buracos', () => {
    const kml = buildAreaKML(ring, 'Quinta & Sítio', {
      basePoint: em(-50, 100),
      gcps: [
        { id: 'G<1>', point: em(10, 10) },
        { id: 2, point: em(90, 50) },
      ],
      lines: [
        [em(0, 20), em(100, 20)],
        [em(100, 40), em(0, 40)],
      ],
      // o segundo buraco, de dois vértices, não é um anel: fica de fora
      holes: [rect(40, 20, 10, 10), [em(0, 0), em(1, 1)]],
    })
    expect(XMLValidator.validate(kml)).toBe(true)
    const doc = xml(kml)
    const nomes = findAll(doc, 'Placemark').map((p) => textOf(childNamed(p, 'name')))
    expect(nomes).toEqual(['Quinta & Sítio', 'Base', 'G<1>', '2', 'L001', 'L002'])
    expect(findAll(doc, 'Style').map((s) => s.getAttribute('id'))).toEqual([
      'surveyArea',
      'flightLine',
    ])
    expect(textOf(findAll(doc, 'styleUrl')[0])).toBe('#surveyArea')
    expect(textOf(childNamed(findAll(doc, 'Folder')[0], 'name'))).toBe('Flight lines')
    expect(findAll(doc, 'innerBoundaryIs')).toHaveLength(1)
    // a base e os GCPs são pontos no solo
    const base0 = findAll(doc, 'Point')[0]
    expect(textOf(findAll(base0, 'coordinates')[0])).toMatch(/,0$/)
  })

  test('listas de extras vazias: continua a ser o ficheiro do Pilot 2', () => {
    expect(buildAreaKML(ring, 'Quinta', { gcps: [], lines: [], holes: [] })).toBe(
      buildAreaKML(ring, 'Quinta'),
    )
  })
})

describe('descarga no browser (document e URL substituídos)', () => {
  let registo
  let ancora
  beforeEach(() => {
    registo = []
    ancora = { click: () => registo.push(['click', ancora.download, ancora.href]) }
    vi.stubGlobal('document', {
      createElement: (tag) => {
        registo.push(['createElement', tag])
        return ancora
      },
      body: {
        appendChild: (el) => registo.push(['appendChild', el === ancora]),
        removeChild: (el) => registo.push(['removeChild', el === ancora]),
      },
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      registo.push(['createObjectURL', blob])
      return 'blob:teste'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      registo.push(['revokeObjectURL', url])
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  const descarregado = () => registo.find(([o]) => o === 'createObjectURL')[1]

  test('KML da área: o nome com .kml, o tipo do Google Earth e o mesmo texto; o URL é largado no fim', async () => {
    exportAreaKML(ring, 'quinta_area')
    expect(registo.map(([o]) => o)).toEqual([
      'createObjectURL',
      'createElement',
      'appendChild',
      'click',
      'removeChild',
      'revokeObjectURL',
    ])
    expect(registo[1]).toEqual(['createElement', 'a'])
    expect(registo[2]).toEqual(['appendChild', true])
    expect(registo[3]).toEqual(['click', 'quinta_area.kml', 'blob:teste'])
    expect(registo.at(-1)).toEqual(['revokeObjectURL', 'blob:teste'])
    const blob = descarregado()
    expect(blob.type).toBe('application/vnd.google-earth.kml+xml')
    expect(await blob.text()).toBe(buildAreaKML(ring, 'quinta_area'))
  })

  test('KMZ de uma missão: <nome>.kmz com o molde e a rota em wpmz/', async () => {
    await exportWPMLKmz(base)
    expect(ancora.download).toBe('quinta_area.kmz')
    const zip = await JSZip.loadAsync(await descarregado().arrayBuffer())
    const nomes = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    expect(nomes.sort()).toEqual(['wpmz/template.kml', 'wpmz/waylines.wpml'])
    for (const n of nomes)
      expect(XMLValidator.validate(await zip.file(n).async('string'))).toBe(true)
  })

  test('ZIP dos blocos: <missão>_blocos.zip por omissão, ou o nome dado; um KMZ por bloco', async () => {
    const blocks = [
      { id: 1, waypoints: base.waypoints },
      { id: 2, name: 'quinta_area_A-2', waypoints: base.waypoints },
    ]
    await exportBlocksZip(base, blocks)
    expect(ancora.download).toBe('quinta_area_blocos.zip')
    const zip = await JSZip.loadAsync(await descarregado().arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['quinta_area_A-2.kmz', 'quinta_area_b01.kmz'])
    await exportBlocksZip(base, blocks, 'quinta_voos')
    expect(ancora.download).toBe('quinta_voos.zip')
  })
})
