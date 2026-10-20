/**
 * Ficheiros reais em tests/fixtures/ (M3-T12): uma área como o Google Earth
 * a escreve e como o QGIS a exporta (GeoJSON em CRS84 e em PT-TM06,
 * shapefile com e sem .prj), um recorte de MDT em PT-TM06 e projectos como
 * as versões 1.0.1, 1.3.0 e 1.4.2 os gravavam — lidos pelas mesmas funções
 * que a interface usa. O gerador (tests/lib/fixtures-reais.mjs) tem de
 * reproduzir os ficheiros em disco byte a byte.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { ANEL, TM06, gerarFixtures, paraTM06, relevo } from '../lib/fixtures-reais.mjs'
import { parseAreaFile, reprojectParts } from '../../src/utils/importArea.js'
import { loadDemFromFile } from '../../src/utils/demFile.js'
import { normalizeProject, serializeProject } from '../../src/mission/project.js'
import { planMissionFromProject } from '../../src/mission/planFromProject.js'

// o leitor de KML usa o DOMParser do browser; o GeoTIFF lê-se com FileReader
globalThis.DOMParser = class extends XmlDomParser {
  constructor() {
    super({ onError: () => {} })
  }
}
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (r) => {
        this.result = r
        this.onload?.({ target: this })
      },
      (e) => this.onerror?.(e),
    )
  }
  abort() {}
}

const DIR = new URL('../fixtures/', import.meta.url)
const ler = (nome) => readFileSync(new URL(nome, DIR))
const ficheiro = (nome) => {
  const b = ler(nome)
  return {
    name: nome,
    text: async () => b.toString('utf8'),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  }
}
// os mesmos 4 vértices, por qualquer ordem e sentido (o shapefile escreve
// o anel exterior no sentido horário; o KML/GeoJSON como foi desenhado)
const anelIgual = (ring) => {
  expect(ring).toHaveLength(4)
  for (const [lon, lat] of ANEL) {
    const perto = ring.some((p) => Math.abs(p[0] - lon) < 5e-7 && Math.abs(p[1] - lat) < 5e-7)
    expect(perto, `vértice ${lon},${lat} em ${JSON.stringify(ring)}`).toBe(true)
  }
}

describe('ficheiros reais: o gerador reproduz o que está em disco', () => {
  test('cada ficheiro de tests/fixtures/ é o que o gerador produz', async () => {
    const gerado = await gerarFixtures()
    expect(Object.keys(gerado).length).toBeGreaterThanOrEqual(9)
    for (const [nome, conteudo] of Object.entries(gerado)) {
      expect(Buffer.from(conteudo).equals(ler(nome)), nome).toBe(true)
    }
  })
})

describe('áreas: KML do Google Earth e exportações do QGIS', () => {
  test('KML do Google Earth: o polígono com o buraco; o pino e o caminho ignoram-se', async () => {
    const r = await parseAreaFile(ficheiro('area-google-earth.kml'))
    anelIgual(r.ring)
    expect(r.holes).toHaveLength(1)
    expect(r.discardedParts).toBe(0)
    expect(r.needsCrs).toBeUndefined()
  })

  test('GeoJSON do QGIS em CRS84: tal qual', async () => {
    const r = await parseAreaFile(ficheiro('area-qgis-crs84.geojson'))
    anelIgual(r.ring)
    expect(r.holes).toHaveLength(1)
    expect(r.needsCrs).toBeUndefined()
    expect(r.crsCode).toBeUndefined()
  })

  test('GeoJSON do QGIS em PT-TM06: o membro crs reprojecta sem perguntar', async () => {
    const r = await parseAreaFile(ficheiro('area-qgis-pttm06.geojson'))
    expect(r.crsCode).toBe('EPSG:3763')
    anelIgual(r.ring)
    expect(r.holes).toHaveLength(1)
  })

  test('shapefile com .prj: reprojectado pelo .prj', async () => {
    const r = await parseAreaFile(ficheiro('area-qgis-pttm06.zip'))
    expect(r.needsCrs).toBeUndefined()
    anelIgual(r.ring)
  })

  test('shapefile sem .prj: metros detectados, pede o CRS, e com PT-TM06 bate certo', async () => {
    const r = await parseAreaFile(ficheiro('area-qgis-pttm06-sem-prj.zip'))
    expect(r.needsCrs).toBe(true)
    expect(Math.abs(r.ring[0][0])).toBeGreaterThan(1000)
    const [parte] = reprojectParts(r.parts, TM06)
    anelIgual(parte.ring)
  })
})

describe('MDT em PT-TM06 (GeoTIFF float32)', () => {
  test('lê-se com o CRS do ficheiro e devolve o relevo gravado', async () => {
    const b = ler('mdt-pttm06.tif')
    const blob = new Blob([b], { type: 'image/tiff' })
    blob.name = 'mdt-pttm06.tif'
    const bbox = [-7.9, 38.55, -7.895, 38.553]
    const dem = await loadDemFromFile(blob, bbox, { marginM: 100 })
    expect(dem.crsCode).toBe('EPSG:3763')
    expect(dem.nativeResolutionM).toBeCloseTo(10, 3)
    for (const [lon, lat] of [[-7.8975, 38.5515], ...ANEL]) {
      const [x, y] = paraTM06([lon, lat])
      expect(dem.elevationAt(lon, lat), `${lon},${lat}`).toBeCloseTo(relevo(x, y), 0)
    }
  })
})

describe('projectos de versões anteriores', () => {
  const abrir = (nome) => {
    const n = normalizeProject(JSON.parse(ler(nome).toString('utf8')))
    expect(n, nome).not.toBeNull()
    return n
  }

  test('1.0.1: base única vira a base A, a bateria por combinação vira tempo útil, omissões novas', () => {
    const n = abrir('projecto-1.0.1.json')
    expect(n.drone).toMatchObject({ aircraftId: 'M3E', payloadId: 'M3E_WIDE' })
    expect(n.bases).toHaveLength(1)
    expect(n.bases[0].point).toEqual([-7.9004, 38.5498])
    // 40 min nominais com a reserva de 30 % de então: 28 min úteis, reserva 0
    expect(n.battery.usefulMin).toBeCloseTo(28, 6)
    expect(n.split.reservePct).toBe(0)
    expect(n.split.mode).toBe('area')
    expect(n.holes).toEqual([])
    expect(n.safety.finishAction).toBe('goHome')
    expect(n.obstacleHeightM).toBe(0)
    expect(n.demFile).toBeNull()
    const p = planMissionFromProject(n)
    expect(p.params.waypointStops).toBe('corners')
    expect(p.params.overshoot).toBe(0)
    expect(p.planError).toBeNull()
    expect(p.plan.stats.lineCount).toBeGreaterThan(3)
  })

  test('1.3.0: mosaico antigo com células desligadas fica para traduzir; pontos e buracos lidos', () => {
    const n = abrir('projecto-1.3.0.json')
    expect(n.drone).toMatchObject({ aircraftId: 'M4T', payloadId: 'M4T_WIDE' })
    expect(n.legacyMosaic).toEqual({
      disabled: new Set([2, 5]),
      basePoint: [-7.9004, 38.5498],
      tileOrientation: 15,
    })
    expect(n.disabledTiles.size).toBe(0)
    expect(n.split.mosaic).toBe(2)
    expect(n.holes).toHaveLength(1)
    expect(n.inspectPoints[0].id).toBe(1)
    expect(n.nextInspectId).toBe(2)
    expect(n.params.tieLine).toBe(true)
    expect(n.corridorConfig.waypointStops).toBe('corners')
    expect(n.terrainFollow.enabled).toBe(true)
  })

  test('1.4.2: valida contra o esquema publicado, lê-se inteiro e volta a escrever-se igual', () => {
    const raw = JSON.parse(ler('projecto-1.4.2.json').toString('utf8'))
    const schema = JSON.parse(
      readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
    )
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    const validate = ajv.compile(schema)
    expect(validate(raw), JSON.stringify(validate.errors)).toBe(true)
    const n = normalizeProject(raw)
    expect(n.drone).toEqual({ aircraftId: 'M4T', payloadId: 'M4T_WIDE', rtk: true })
    expect(n.battery.usefulMin).toBe(24)
    expect(n.bases.map((b) => b.label)).toEqual(['A', 'B'])
    expect(n.blockBase).toEqual({ 1: 'base-a', 3: 'base-b' })
    expect(n.disabledTiles).toEqual(new Set([2]))
    expect(n.legacyMosaic).toBeUndefined()
    expect(n.demFile).toEqual({ label: 'mdt-pttm06.tif', surface: 'dtm' })
    expect(n.obstacleHeightM).toBe(12)
    expect(n.safety).toEqual(raw.safety)
    const outra = JSON.parse(
      JSON.stringify(serializeProject({ ...n, battery: raw.battery, cells: null })),
    )
    for (const k of [
      'ring',
      'holes',
      'bases',
      'blockBase',
      'disabledTiles',
      'demFile',
      'safety',
      'params',
      'split',
    ])
      expect(outra[k], k).toEqual(raw[k])
    expect(validate(outra), JSON.stringify(validate.errors)).toBe(true)
    // e o plano sai: mosaico por bateria com duas bases
    const p = planMissionFromProject(n)
    expect(p.planError).toBeNull()
    expect(p.blocks.length).toBeGreaterThan(1)
  })
})
