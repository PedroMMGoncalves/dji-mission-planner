/*
 * Pacote R-A da revisao do codigo (docs/REVISAO-CODIGO-2026-10.md): o
 * ficheiro de projecto vai e volta campo a campo (M3-T4), guarda as celulas
 * de uma importacao em partes (M3-C3), recusa coordenadas invalidas em vez
 * de deixar a pagina em branco (M3-C5), normaliza a ancora e os parametros,
 * e a copia de um projecto gravado que nao se le tem uma chave datada
 * (M3-C7).
 */
import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CUSTOM_SENSOR } from '../../src/data/drones.js'
import {
  DEFAULT_ANCHOR,
  DEFAULT_GCP_CONFIG,
  DEFAULT_PARAMS,
  DEFAULT_SPLIT,
  DEFAULT_TERRAIN_FOLLOW,
} from '../../src/mission/defaults.js'
import {
  PROJECT_KEYS,
  isPoint,
  normalizeAnchor,
  normalizeParams,
  normalizeProject,
  serializeProject,
  validRing,
} from '../../src/mission/project.js'
import { normalizeSafety } from '../../src/mission/safety.js'
import { rejectedProjectKey } from '../../src/hooks/useProject.js'
import { DEFAULT_CIRCULAR_CONFIG } from '../../src/utils/circular.js'
import { DEFAULT_CORRIDOR_CONFIG } from '../../src/utils/corridor.js'
import { DEFAULT_FACE_CONFIG } from '../../src/utils/faceMode.js'
import { DEFAULT_ORBIT_CONFIG } from '../../src/utils/orbit.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lat0 = 38.7
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [-9.14 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const quad = (x, y, s) => [em(x, y), em(x + s, y), em(x + s, y + s), em(x, y + s)]
const roundTrip = (state) => JSON.parse(JSON.stringify(serializeProject(state)))

/** Um estado com TODOS os campos fora da omissao. */
const estadoCompleto = () => ({
  missionName: 'Mina de São Domingos',
  drone: { aircraftId: 'M300RTK', payloadId: 'P1', rtk: true },
  custom: { ...DEFAULT_CUSTOM_SENSOR, focalLength: 50 },
  payloadTuning: { P1: { effectiveFov: 0.9 } },
  battery: { batteryId: 'tb60', usefulMin: 25 },
  inspectPoints: [
    { id: 7, point: em(10, 10), heightM: 40, headingDeg: 90 },
    { id: 9, point: em(20, 20), heightM: 30 },
  ],
  missionMode: 'corridor',
  faceConfig: { ...DEFAULT_FACE_CONFIG, standoffM: 30, heightM: 25 },
  corridorConfig: { ...DEFAULT_CORRIDOR_CONFIG, bufferM: 80, centreline: [em(0, 0), em(500, 0)] },
  orbitConfig: { ...DEFAULT_ORBIT_CONFIG, radiusM: 70, poi: em(5, 5) },
  circularConfig: { ...DEFAULT_CIRCULAR_CONFIG, enabled: true, radiusM: 40 },
  params: { ...DEFAULT_PARAMS, altitude: 90, overshoot: 30, tieLine: true, crosshatch: true },
  split: { ...DEFAULT_SPLIT, mode: 'tiles', tileSize: 300, tileOrientationAuto: false },
  anchor: { ...DEFAULT_ANCHOR, center: null, length: 600, width: 400, orientation: 45 },
  ring: quad(0, 0, 400),
  holes: [quad(100, 100, 100)],
  cells: [quad(0, 0, 200), quad(200, 0, 200)],
  areaOrigin: 'draw',
  bases: [
    { id: 'b1', label: 'A', point: em(-50, -50), radiusM: null },
    { id: 'b2', label: 'B', point: em(900, 5), radiusM: 60 },
  ],
  blockBase: { 3: 'b2' },
  disabledTiles: new Set([2, 5]),
  terrainFollow: { enabled: true, tolerance: 7 },
  gcpConfig: { enabled: true, count: 8 },
  obstacleHeightM: 12,
  safety: { finishAction: 'autoLand', exitOnRCLost: 'goContinue', executeRCLostAction: 'hover' },
  demFile: { label: 'mdt-dgt.tif', surface: 'dsm' },
})

describe('M3-T4: o projecto vai e volta campo a campo', () => {
  test('todos os PROJECT_KEYS voltam iguais (ou normalizados) num estado fora da omissao', () => {
    const s = estadoCompleto()
    const json = roundTrip(s)
    const n = normalizeProject(json)
    expect(n).not.toBeNull()
    // tudo o que se grava e um PROJECT_KEY, e todos os PROJECT_KEYS se gravam
    const gravados = Object.keys(json).filter((k) => k !== '$schema' && k !== 'version')
    for (const k of gravados) expect(PROJECT_KEYS).toContain(k)
    for (const k of PROJECT_KEYS) expect(gravados).toContain(k)
    for (const k of PROJECT_KEYS) {
      switch (k) {
        case 'battery':
          expect(n.battery).toMatchObject(s.battery)
          break
        case 'split':
          expect(n.split).toMatchObject({ ...s.split, reservePct: 0, mosaic: 2 })
          break
        case 'disabledTiles':
          expect([...n.disabledTiles]).toEqual([...s.disabledTiles])
          break
        case 'safety':
          expect(n.safety).toEqual(normalizeSafety(s.safety))
          expect(n.safety).toEqual(s.safety)
          break
        case 'drone':
          expect(n.drone).toEqual(s.drone)
          break
        default:
          expect(n[k], k).toEqual(s[k])
      }
    }
  })

  test('o esquema publicado conhece todos os PROJECT_KEYS', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
    )
    for (const k of PROJECT_KEYS) expect(Object.keys(schema.properties), k).toContain(k)
  })

  test('sem holes, terrainFollow, anchor e gcpConfig no ficheiro, a leitura da o que a omissao diz', () => {
    const n = normalizeProject({ version: 2, ring: quad(0, 0, 100) })
    expect(n.holes).toEqual([])
    expect(n.terrainFollow).toBeUndefined()
    expect(n.gcpConfig).toBeUndefined()
    expect(n.anchor).toBeUndefined()
    // o App parte das omissoes: estes sao os valores que ficam
    expect({ ...DEFAULT_TERRAIN_FOLLOW, ...(n.terrainFollow ?? {}) }).toEqual(
      DEFAULT_TERRAIN_FOLLOW,
    )
    expect({ ...DEFAULT_GCP_CONFIG, ...(n.gcpConfig ?? {}) }).toEqual(DEFAULT_GCP_CONFIG)
  })
})

describe('M3-C3: as celulas de uma importacao em partes ficam no projecto', () => {
  test('gravam-se e voltam; com a area da ancora nao se gravam (regeneram-se dela)', () => {
    const s = estadoCompleto()
    expect(roundTrip(s).cells).toHaveLength(2)
    expect(normalizeProject(roundTrip(s)).cells).toEqual(s.cells)
    const daAncora = roundTrip({
      ...s,
      areaOrigin: 'anchor',
      anchor: { ...s.anchor, center: em(0, 0) },
    })
    expect(daAncora.cells).toBeUndefined()
    const semCelulas = roundTrip({ ...s, cells: null })
    expect(semCelulas.cells).toBeUndefined()
    expect(normalizeProject(semCelulas).cells).toBeUndefined()
  })
})

describe('M3-C5: coordenadas invalidas recusam o projecto em vez de o abrir a meio', () => {
  const base = { version: 2, ring: quad(0, 0, 100) }
  test('os quatro casos que deixavam a pagina em branco', () => {
    expect(
      normalizeProject({
        ...base,
        ring: [
          ['a', 'b'],
          ['c', 'd'],
          ['e', 'f'],
        ],
      }),
    ).toBeNull()
    expect(
      normalizeProject({ ...base, inspectPoints: [{ id: 1, point: [-8] }] }).inspectPoints,
    ).toEqual([])
    expect(normalizeProject({ ...base, anchor: { center: [-8] } }).anchor.center).toBeNull()
    expect(
      normalizeProject({
        ...base,
        holes: [
          [
            [-8, 'x'],
            [-8, 39],
            [-7, 39],
          ],
        ],
      }),
    ).toBeNull()
    expect(normalizeProject({ ...base, cells: [[em(0, 0), 'x', em(1, 1)]] })).toBeNull()
    expect(normalizeProject({ ...base, ring: 'x' })).toBeNull()
    expect(normalizeProject({ ...base, ring: [em(0, 0), em(1, 0)] })).toBeNull()
    expect(normalizeProject({ ...base, ring: null }).ring).toBeUndefined()
  })

  test('ids de pontos de inspeccao em texto sao refeitos como inteiros', () => {
    const n = normalizeProject({
      ...base,
      inspectPoints: [
        { id: 'a', point: em(0, 0) },
        { id: 4, point: em(1, 1) },
        { id: 2.5, point: em(2, 2) },
      ],
    })
    expect(n.inspectPoints.map((q) => q.id)).toEqual([5, 4, 6])
    expect(n.nextInspectId).toBe(7)
    expect(Number.isNaN(n.nextInspectId)).toBe(false)
  })

  test('propriedade: para qualquer entrada, ou null ou so coordenadas finitas', () => {
    const coord = fc.oneof(
      fc.double({ noNaN: false, noDefaultInfinity: false }),
      fc.string(),
      fc.constant(null),
      fc.constant(undefined),
    )
    const ponto = fc.oneof(
      fc.array(coord, { minLength: 0, maxLength: 4 }),
      fc.string(),
      fc.constant(null),
      fc.record({ x: fc.double() }),
    )
    const anel = fc.oneof(
      fc.array(ponto, { minLength: 0, maxLength: 6 }),
      fc.string(),
      fc.constant(null),
    )
    fc.assert(
      fc.property(
        anel,
        fc.array(anel, { maxLength: 3 }),
        fc.array(anel, { maxLength: 3 }),
        ponto,
        (ring, holes, cells, centre) => {
          const n = normalizeProject({ version: 2, ring, holes, cells, anchor: { center: centre } })
          if (n === null) return true
          if (n.ring) expect(validRing(n.ring)).toBe(true)
          for (const h of n.holes) expect(validRing(h)).toBe(true)
          for (const c of n.cells ?? []) expect(validRing(c)).toBe(true)
          if (n.anchor?.center != null) expect(isPoint(n.anchor.center)).toBe(true)
          return true
        },
      ),
      { numRuns: 300, seed: 20261019 },
    )
  })
})

describe('ancora e parametros normalizados', () => {
  test('ancora: centro ponto ou null, dimensoes positivas, forma conhecida, inteiros', () => {
    expect(
      normalizeAnchor({
        center: [-8, 39],
        length: 0,
        width: 'x',
        orientation: 400,
        shape: 'tri',
        cols: 2.5,
        rows: 3,
      }),
    ).toEqual({
      ...DEFAULT_ANCHOR,
      center: [-8, 39],
      orientation: 40,
      rows: 3,
    })
    expect(normalizeAnchor('x')).toEqual(DEFAULT_ANCHOR)
  })
  test('parametros: so as chaves da omissao, com o tipo da omissao', () => {
    expect(
      normalizeParams({
        altitude: 'x',
        speed: 5,
        crosshatch: 'yes',
        tieLine: true,
        foo: 1,
        angle: NaN,
      }),
    ).toEqual({ speed: 5, tieLine: true })
    expect(normalizeParams(null)).toEqual({})
  })
})

describe('M3-C7: a copia de um projecto gravado que nao se le', () => {
  test('chave datada, ao segundo', () => {
    expect(rejectedProjectKey(new Date('2026-10-19T20:30:05Z'))).toBe(
      'dji-mission-planner:project:v1:recusado:2026-10-19-20-30-05',
    )
  })
})
