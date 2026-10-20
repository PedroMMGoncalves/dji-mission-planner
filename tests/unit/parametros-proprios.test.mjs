/**
 * Altura e sobreposições próprias do corredor e do circular (por omissão,
 * as do separador Área): os campos do projecto, os limites e o esquema.
 */
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { DEFAULT_CORRIDOR_CONFIG, normalizeCorridorConfig } from '../../src/utils/corridor.js'
import { DEFAULT_CIRCULAR_CONFIG, normalizeCircularConfig } from '../../src/utils/circular.js'

const schema = JSON.parse(
  readFileSync(new URL('../../public/schema/project-v2.schema.json', import.meta.url), 'utf8'),
)
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)

describe('altura e sobreposições próprias', () => {
  test('corredor: por omissão herda as da área; os próprios ficam nos limites', () => {
    expect(DEFAULT_CORRIDOR_CONFIG.ownParams).toBe(false)
    expect(normalizeCorridorConfig({}).ownParams).toBe(false)
    const c = normalizeCorridorConfig({
      ownParams: true,
      altitude: 60,
      frontOverlap: 85,
      sideOverlap: 65,
    })
    expect(c).toMatchObject({ ownParams: true, altitude: 60, frontOverlap: 85, sideOverlap: 65 })
    const lim = normalizeCorridorConfig({ ownParams: 'sim', altitude: 2, frontOverlap: 99 })
    expect(lim.ownParams).toBe(false)
    expect(lim.altitude).toBe(5)
    expect(lim.frontOverlap).toBe(95)
  })

  test('circular: por omissão herda as da área; os próprios ficam nos limites', () => {
    expect(DEFAULT_CIRCULAR_CONFIG.ownParams).toBe(false)
    expect(normalizeCircularConfig({}).ownParams).toBe(false)
    const c = normalizeCircularConfig({ ownParams: true, altitude: 80, frontOverlap: 75 })
    expect(c).toMatchObject({ ownParams: true, altitude: 80, frontOverlap: 75 })
    expect(normalizeCircularConfig({ altitude: 5000 }).altitude).toBe(1500)
  })

  test('o esquema aceita os campos e recusa valores fora dos limites', () => {
    expect(
      validate({
        version: 2,
        corridorConfig: { ownParams: true, altitude: 60, frontOverlap: 80, sideOverlap: 70 },
        circularConfig: { ownParams: true, altitude: 80, frontOverlap: 75 },
      }),
    ).toBe(true)
    expect(validate({ version: 2, corridorConfig: { altitude: 2 } })).toBe(false)
    expect(validate({ version: 2, circularConfig: { frontOverlap: 99 } })).toBe(false)
  })
})
