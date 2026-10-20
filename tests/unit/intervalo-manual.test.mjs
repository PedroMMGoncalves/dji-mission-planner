/**
 * Intervalo de disparo escrito pelo piloto (src/mission/triggerInterval.js):
 * metros em Distância e Waypoint, segundos em Tempo; o intervalo efectivo
 * que o plano usa, os segundos exactos que vão para o ficheiro e a
 * sobreposição frontal que resulta.
 */
import { describe, expect, test } from 'vitest'
import { triggerInterval } from '../../src/mission/triggerInterval.js'
import {
  buildWaylinesWPML,
  triggerSecondsFor,
  validateExportParams,
} from '../../src/utils/exporters.js'

const base = { footprintAlong: 107, frontOverlapPct: 80, speed: 10 }
const wpml = {
  droneEnumValue: 77,
  droneSubEnumValue: 0,
  payloadEnumValue: 66,
  payloadSubEnumValue: 0,
  payloadPositionIndex: 0,
}
const rota = [
  [-7.9, 38.55],
  [-7.895, 38.55],
]
const disparo = (xml) => {
  const m = xml.match(
    /<wpml:actionTriggerType>(multipleTiming|multipleDistance)<\/wpml:actionTriggerType>\s*<wpml:actionTriggerParam>([^<]+)</,
  )
  return m ? { tipo: m[1], param: Number(m[2]) } : null
}

describe('intervalo de disparo: automático ou escrito à mão', () => {
  test('automático: pegada × (1 − frontal); em Tempo, os segundos do ficheiro', () => {
    const d = triggerInterval({ ...base, triggerMode: 'distance' })
    expect(d.manual).toBe(false)
    expect(d.intervalM).toBeCloseTo(21.4, 6)
    expect(d.autoIntervalM).toBeCloseTo(21.4, 6)
    expect(d.seconds).toBeNull()
    expect(d.frontOverlapPct).toBeCloseTo(80, 6)
    const t = triggerInterval({ ...base, triggerMode: 'time' })
    // 21,4 m a 10 m/s = 2,14 s: por defeito à décima, como no ficheiro
    expect(t.seconds).toBe(2.1)
    expect(t.seconds).toBe(triggerSecondsFor(t.intervalM, 10))
  })

  test('metros escritos: o plano usa o valor do ficheiro e a frontal resulta dele', () => {
    const d = triggerInterval({
      ...base,
      triggerMode: 'distance',
      intervalMode: 'manual',
      manualIntervalM: 25.37,
    })
    expect(d.manual).toBe(true)
    expect(d.intervalM).toBe(25.3)
    expect(d.autoIntervalM).toBeCloseTo(21.4, 6)
    expect(d.frontOverlapPct).toBeCloseTo(100 * (1 - 25.3 / 107), 6)
    // com foto por waypoint vale o mesmo valor (passo dos pontos de foto)
    const w = triggerInterval({
      ...base,
      triggerMode: 'waypoint',
      intervalMode: 'manual',
      manualIntervalM: 12,
    })
    expect(w.intervalM).toBe(12)
    expect(w.seconds).toBeNull()
  })

  test('segundos escritos: o intervalo em metros segue a velocidade', () => {
    const t = triggerInterval({
      ...base,
      speed: 8,
      triggerMode: 'time',
      intervalMode: 'manual',
      manualIntervalS: 2,
    })
    expect(t.seconds).toBe(2)
    expect(t.intervalM).toBe(16)
    expect(t.frontOverlapPct).toBeCloseTo(100 * (1 - 16 / 107), 6)
  })

  test('limites: o campo recorta o que se escreve', () => {
    const m = triggerInterval({
      ...base,
      triggerMode: 'distance',
      intervalMode: 'manual',
      manualIntervalM: 0.01,
    })
    expect(m.intervalM).toBe(0.5)
    const s = triggerInterval({
      ...base,
      triggerMode: 'time',
      intervalMode: 'manual',
      manualIntervalS: 500,
    })
    expect(s.seconds).toBe(60)
    // um intervalo maior do que a pegada: sobreposição negativa (faltas), dita
    const g = triggerInterval({
      ...base,
      triggerMode: 'distance',
      intervalMode: 'manual',
      manualIntervalM: 150,
    })
    expect(g.frontOverlapPct).toBeLessThan(0)
  })

  test('o ficheiro leva os segundos escritos, sem passar pela conversão de metros', () => {
    const t = triggerInterval({
      ...base,
      speed: 7,
      triggerMode: 'time',
      intervalMode: 'manual',
      manualIntervalS: 2.3,
    })
    const xml = buildWaylinesWPML({
      waypoints: rota,
      altitude: 100,
      speed: 7,
      wpml,
      photoIntervalM: t.intervalM,
      photoIntervalS: t.seconds,
      triggerMode: 'time',
      sensorType: 'camera',
    })
    expect(disparo(xml)).toEqual({ tipo: 'multipleTiming', param: 2.3 })
    // e em Distância, os metros escritos tal qual
    const d = triggerInterval({
      ...base,
      triggerMode: 'distance',
      intervalMode: 'manual',
      manualIntervalM: 25.3,
    })
    const xd = buildWaylinesWPML({
      waypoints: rota,
      altitude: 100,
      speed: 10,
      wpml,
      photoIntervalM: d.intervalM,
      triggerMode: 'distance',
      sensorType: 'camera',
    })
    expect(disparo(xd)).toEqual({ tipo: 'multipleDistance', param: 25.3 })
  })

  test('segundos negativos ou não numéricos são recusados na exportação', () => {
    const p = {
      name: 'x',
      waypoints: rota,
      altitude: 100,
      speed: 10,
      wpml,
      photoIntervalM: 20,
      triggerMode: 'time',
      sensorType: 'camera',
    }
    expect(() => validateExportParams({ ...p, photoIntervalS: -1 })).toThrow()
    expect(() => validateExportParams({ ...p, photoIntervalS: Number.NaN })).toThrow()
    expect(() => validateExportParams({ ...p, photoIntervalS: 2 })).not.toThrow()
  })
})
