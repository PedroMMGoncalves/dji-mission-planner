/**
 * Fronteira de exportação sob parâmetros aleatórios: o que passa a validação
 * tem de sair como XML bem formado, sem lixo, com os rumos no intervalo do
 * WPML; o que está fora do domínio tem de ser recusado.
 */
import fc from 'fast-check'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, test } from 'vitest'
import {
  buildTemplateKML,
  buildWaylinesWPML,
  validateExportParams,
} from '../../src/utils/exporters.js'

const JUNK = /(^|>)\s*(NaN|undefined|Infinity|null)\s*(<|$)/
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
          perWaypointFor(p.waypoints.length).map((pw) => ({ ...p, perWaypoint: pw })),
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
