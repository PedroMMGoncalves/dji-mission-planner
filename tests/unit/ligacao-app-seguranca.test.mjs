// M3-T3 da revisao do codigo: a ligacao do App as verificacoes de seguranca
// vive em funcoes puras (src/mission), testaveis sem montar o App — os
// campos WPML da missao (a lente do M4T termico) e as pernas de transito
// base <-> rota com bases por bloco, cada uma na cota da sua zona.
import { describe, it, expect } from 'vitest'
import { AIRCRAFT, PAYLOADS, DEFAULT_CUSTOM_SENSOR } from '../../src/data/drones.js'
import { missionWpml } from '../../src/mission/missionWpml.js'
import { transitLegs, worstTransit } from '../../src/mission/transitLegs.js'
import { DEFAULT_TAKEOFF_SECURITY_HEIGHT_M } from '../../src/utils/exporters.js'

const lat0 = 38.7
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y, z) =>
  z == null ? [-9.14 + x / mLon, lat0 + y / 110574] : [-9.14 + x / mLon, lat0 + y / 110574, z]
const xOf = (lon) => (lon + 9.14) * mLon

describe('missionWpml: os campos WPML da missao', () => {
  it('M4T termico leva a lente ir; o M4T largo, wide', () => {
    const ir = missionWpml(AIRCRAFT.M4T, PAYLOADS.M4T_THERMAL, DEFAULT_CUSTOM_SENSOR)
    expect(ir.imageFormat).toBe('ir')
    expect(ir.droneEnumValue).toBe(AIRCRAFT.M4T.wpml.droneEnumValue)
    expect(ir.payloadEnumValue).toBe(PAYLOADS.M4T_THERMAL.wpml.payloadEnumValue)
    expect(ir.gimbalPitchRange).toEqual(PAYLOADS.M4T_THERMAL.gimbalPitch)
    expect(missionWpml(AIRCRAFT.M4T, PAYLOADS.M4T_WIDE, DEFAULT_CUSTOM_SENSOR).imageFormat).toBe(
      'wide',
    )
  })
  it('payloads de uma lente ficam sem lente (como no ficheiro que voou)', () => {
    const m3e = missionWpml(AIRCRAFT.M3E, PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
    expect(m3e.imageFormat).toBeNull()
    expect(m3e.gimbalPitchRange).toEqual(PAYLOADS.M3E_WIDE.gimbalPitch ?? null)
    const p1 = missionWpml(AIRCRAFT.M300RTK, PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
    expect(p1.imageFormat).toBeNull()
    expect(p1.payloadEnumValue).toBe(PAYLOADS.P1.wpml.payloadEnumValue)
  })
  it('payload proprio: os enums vem do editor; aeronave propria, tambem o da aeronave', () => {
    const custom = { ...DEFAULT_CUSTOM_SENSOR, payloadEnumValue: 1234, droneEnumValue: 4321 }
    const soPayload = missionWpml(AIRCRAFT.M300RTK, PAYLOADS.CUSTOM, custom)
    expect(soPayload.payloadEnumValue).toBe(1234)
    expect(soPayload.droneEnumValue).toBe(AIRCRAFT.M300RTK.wpml.droneEnumValue)
    const ambos = missionWpml(AIRCRAFT.CUSTOM, PAYLOADS.CUSTOM, custom)
    expect(ambos.payloadEnumValue).toBe(1234)
    expect(ambos.droneEnumValue).toBe(4321)
  })
})

describe('transitLegs: as pernas base <-> rota', () => {
  // dois blocos de 400 m lado a lado, bases A (cota 100) e B (cota 160): a
  // rota do 3D esta na cota comum (100), com o bloco de B subido 60 m
  const blocoA = { id: 1, waypoints: [em(0, 0), em(400, 0), em(400, 50), em(0, 50)] }
  const blocoB = { id: 2, waypoints: [em(600, 0), em(1000, 0), em(1000, 50), em(600, 50)] }
  const refs = { refs: [100, 160], common: 100 }
  const view3d = {
    waypoints: [
      ...blocoA.waypoints.map((w) => [w[0], w[1], 80]),
      ...blocoB.waypoints.map((w) => [w[0], w[1], 80 + 60]),
    ],
    breaks: [4],
    refElev: 100,
    refSource: 'bases',
  }
  const bases = [
    { id: 'a', label: 'A', point: em(-100, 0) },
    { id: 'b', label: 'B', point: em(1100, 0) },
  ]
  const baseLayout = {
    hasBases: true,
    byBlock: { 1: { baseId: 'a', flightLabel: 'A-1' }, 2: { baseId: 'b', flightLabel: 'B-2' } },
  }
  const args = {
    view3d,
    perBlock: true,
    blocks: [blocoA, blocoB],
    baseLayout,
    bases,
    blockRefs: refs,
  }

  it('uma perna por bloco, cada uma na cota da sua zona e com o seu voo', () => {
    const legs = transitLegs(args)
    expect(legs.map((l) => l.flight)).toEqual(['A-1', 'B-2'])
    expect(legs.map((l) => l.refElev)).toEqual([100, 160])
    expect(legs[0].basePoint).toEqual(bases[0].point)
    expect(legs[1].basePoint).toEqual(bases[1].point)
    // as alturas voltam a ser as do KMZ de cada voo (80 m sobre a sua zona)
    expect(legs[0].waypoints.map((w) => w[2])).toEqual([80, 80, 80, 80])
    expect(legs[1].waypoints.map((w) => w[2])).toEqual([80, 80, 80, 80])
    expect(legs[1].waypoints.map((w) => Math.round(xOf(w[0])))).toEqual([600, 1000, 1000, 600])
  })
  it('bloco sem base ou sem cota fica de fora; sem bases, uma so perna da base de referencia', () => {
    const semB = transitLegs({ ...args, baseLayout: { byBlock: { 1: baseLayout.byBlock[1] } } })
    expect(semB.map((l) => l.flight)).toEqual(['A-1'])
    const semCota = transitLegs({ ...args, blockRefs: { refs: [100, null], common: 100 } })
    expect(semCota.map((l) => l.flight)).toEqual(['A-1'])
    const unica = transitLegs({ view3d, perBlock: false, basePoint: em(-100, 0) })
    expect(unica).toHaveLength(1)
    expect(unica[0].flight).toBeNull()
    expect(unica[0].refElev).toBe(100)
    expect(unica[0].waypoints).toHaveLength(8)
    expect(transitLegs({ view3d, perBlock: false, basePoint: null })).toEqual([])
    expect(transitLegs({ view3d: null, perBlock: false, basePoint: em(0, 0) })).toEqual([])
  })
  it('a pior perna manda, com o rotulo do voo: uma lomba entre a base B e o seu bloco', () => {
    // relevo plano (100 m) excepto uma lomba de 260 m em x = 1050, entre a
    // base B (x = 1100) e o bloco de B; a ida faz-se a 80 m sobre a cota 160
    const elevationAt = (lon) => {
      const x = xOf(lon)
      return x > 1020 && x < 1080 ? 260 : x > 500 ? 160 : 100
    }
    const worst = worstTransit(transitLegs(args), { elevationAt })
    expect(worst.flight).toBe('B-2')
    expect(worst.minM).toBeLessThan(0)
    expect(worst.at.leg).toBe('out')
    // 80 m sobre a zona (160) a atravessar uma lomba de 260: 20 m abaixo
    expect(worst.minM).toBeCloseTo(-20, 6)
    // sem a lomba, a perna de A: 80 m de folga (acima da altura de seguranca)
    const plano = worstTransit(transitLegs(args), {
      elevationAt: (lon) => (xOf(lon) > 500 ? 160 : 100),
    })
    expect(plano.minM).toBeCloseTo(80, 6)
    expect(plano.outHeightM).toBe(Math.max(80, DEFAULT_TAKEOFF_SECURITY_HEIGHT_M))
  })
  it('sem pernas ou sem relevo nao ha resultado', () => {
    expect(worstTransit([], { elevationAt: () => 100 })).toBeNull()
    expect(worstTransit(transitLegs(args), { elevationAt: () => null })).toBeNull()
  })
})
