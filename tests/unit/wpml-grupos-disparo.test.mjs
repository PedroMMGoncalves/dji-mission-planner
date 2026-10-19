/*
 * Grupos de disparo por intervalo (multipleDistance, multipleTiming):
 * `actionGroupMode` so admite `sequence` (common-element.md). Escrevia-se
 * `parallel`, que nao existe, e nenhum voo o tinha testado: num M4T
 * (Outubro de 2026, disparo por distancia) as fotos sairam so nos
 * waypoints — os cantos das faixas —, como se o grupo disparasse ao chegar
 * a cada waypoint do intervalo e nao a cada X metros.
 */
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, test } from 'vitest'
import { buildWaylinesWPML } from '../../src/utils/exporters.js'

const wpml = {
  droneEnumValue: 99,
  droneSubEnumValue: 1,
  payloadEnumValue: 89,
  payloadSubEnumValue: 0,
  payloadPositionIndex: 0,
}
const lat = 40.4
const mL = 111320 * Math.cos((lat * Math.PI) / 180)
const p = (x, y) => [-7.2 + x / mL, lat + y / 110574, 120]
// duas faixas de 80 m, so com os cantos (disparo por distancia)
const wps = [p(0, 0), p(80, 0), p(80, 30), p(0, 30), p(0, 60), p(80, 60)]
const base = {
  name: 'p',
  waypoints: wps,
  altitude: 120,
  speed: 10,
  wpml,
  photoIntervalM: 20,
  triggerMode: 'distance',
  sensorType: 'camera',
  createTimeMs: 1760000000000,
}
const grupos = (xml) => xml.split('<wpml:actionGroup>').slice(1)
const disparos = (xml) => grupos(xml).filter((g) => /multipleDistance|multipleTiming/.test(g))

describe('grupos de disparo por intervalo', () => {
  for (const triggerMode of ['distance', 'time']) {
    test(`${triggerMode}: sequence, actionId 0, nunca parallel`, () => {
      const xml = buildWaylinesWPML({ ...base, triggerMode })
      expect(XMLValidator.validate(xml)).toBe(true)
      expect(xml).not.toMatch(/parallel/)
      // o gimbal no waypoint 0 e o disparo a cobrir a rota inteira
      expect(grupos(xml)).toHaveLength(2)
      for (const g of grupos(xml)) expect(g).toMatch(/<wpml:actionGroupMode>sequence</)
      const [d] = disparos(xml)
      expect(d).toMatch(/<wpml:actionGroupStartIndex>0</)
      expect(d).toMatch(/<wpml:actionGroupEndIndex>5</)
      expect(d).toMatch(/<wpml:actionId>0</)
      expect(d).toMatch(/<wpml:actionActuatorFunc>takePhoto</)
      expect(d).toMatch(
        triggerMode === 'time'
          ? /<wpml:actionTriggerType>multipleTiming<\/wpml:actionTriggerType>\s*<wpml:actionTriggerParam>2\.0</
          : /<wpml:actionTriggerType>multipleDistance<\/wpml:actionTriggerType>\s*<wpml:actionTriggerParam>20\.0</,
      )
    })
  }

  test('um grupo por intervalo de triggerRanges, todos em sequence e com actionId 0', () => {
    const xml = buildWaylinesWPML({
      ...base,
      triggerRanges: [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
    })
    const ds = disparos(xml)
    expect(ds).toHaveLength(3)
    for (const g of ds) {
      expect(g).toMatch(/<wpml:actionGroupMode>sequence</)
      expect(g).toMatch(/<wpml:actionId>0</)
    }
    // ids de grupo unicos no ficheiro: 0 (gimbal), 1, 2, 3
    const ids = [...xml.matchAll(/<wpml:actionGroupId>(\d+)</g)].map((m) => Number(m[1]))
    expect(ids).toEqual([0, 1, 2, 3])
  })

  test('sem intervalo de disparo nao ha grupo de disparo, e continua sem parallel', () => {
    const xml = buildWaylinesWPML({ ...base, photoIntervalM: 0 })
    expect(disparos(xml)).toHaveLength(0)
    expect(xml).not.toMatch(/parallel/)
  })
})
