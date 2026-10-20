/**
 * O plano a partir de um projecto (src/mission/planFromProject.js, M3-T9):
 * o mesmo motor da aplicação, usado pela ferramenta planeado-vs-medido e
 * pelas missões de referência. Com as missões de referência em
 * docs/validacao/missoes/: a área simples, a dupla grelha, os blocos por
 * bateria (mosaico) e o LiDAR.
 */
import { describe, expect, test } from 'vitest'
import { MISSOES } from '../../tools/missoes-referencia.mjs'
import { AIRCRAFT } from '../../src/data/drones.js'
import { planMissionFromProject } from '../../src/mission/planFromProject.js'
import { normalizeProject } from '../../src/mission/project.js'

const plano = (nome) => planMissionFromProject(normalizeProject(MISSOES[nome]))

describe('plano a partir do projecto', () => {
  test('R1: rectângulo nadir — faixas, fotos e tempo, sem blocos', () => {
    const p = plano('R1-rectangulo-nadir')
    expect(p.planError).toBeNull()
    expect(p.photoMode).toBe('distance')
    expect(p.plan.stats.lineCount).toBeGreaterThan(5)
    expect(p.plan.stats.photoCount).toBeGreaterThan(100)
    expect(p.blocks).toBeNull()
    expect(p.longestS).toBeCloseTo(p.plan.stats.flightTimeS, 6)
    expect(p.worstRatio).toBeGreaterThan(0)
    // o nominal do M3E com os 30 % de reserva de então (project.js): tempo útil, reserva 0
    const util = AIRCRAFT.M3E.batteryMin * 0.7
    expect(p.batteryMin).toBeCloseTo(util, 6)
    expect(p.reservePct).toBe(0)
    expect(p.usableS).toBeCloseTo(util * 60, 6)
  })

  test('R2: dupla grelha com nadir — três passagens no plano', () => {
    const p = plano('R2-U-terreno-dupla-grelha')
    expect(p.planError).toBeNull()
    expect(p.params.crosshatch).toBe(true)
    expect(p.plan.nadirStartLine).toBeGreaterThan(0)
  })

  test('R3: blocos por bateria — mosaico, cada bloco cabe no tempo útil', () => {
    const p = plano('R3-blocos-bateria')
    expect(p.planError).toBeNull()
    expect(p.mosaic?.cells?.length).toBeGreaterThan(1)
    expect(p.tileSide).toBeGreaterThan(0)
    expect(p.tileSide).toBeLessThanOrEqual(500)
    expect(p.blocks.length).toBe(p.mosaic.cells.length)
    for (const b of p.blocks) expect(b.timeS, `bloco ${b.id}`).toBeLessThanOrEqual(p.usableS)
    expect(p.worstRatio).toBeLessThanOrEqual(1)
    expect(p.longestS).toBe(Math.max(...p.blocks.map((b) => b.timeS)))
    // uma célula desligada sai dos blocos, e os ids das outras não mudam
    const n = normalizeProject(MISSOES['R3-blocos-bateria'])
    const menos = planMissionFromProject({ ...n, disabledTiles: new Set([0]) })
    expect(menos.blocks.length).toBe(p.blocks.length - 1)
    expect(menos.blocks[0].id).toBe(2)
  })

  test('L1: LiDAR — sem fotos, com densidade de pontos', () => {
    const p = plano('L1-lidar-mapper')
    expect(p.sensor.type).toBe('lidar')
    expect(p.planError).toBeNull()
    expect(p.densityPerM2).toBeGreaterThan(0)
    expect(p.intervalM).toBeNull()
  })

  test('sem área: sem plano; anel inválido: erro explícito', () => {
    const n = normalizeProject({ version: 2, drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' } })
    expect(planMissionFromProject(n).plan).toBeNull()
    // um «laço» (auto-intersecção) não é uma área
    const mau = planMissionFromProject({
      ...n,
      ring: [
        [-7.2, 40.4],
        [-7.199, 40.401],
        [-7.199, 40.4],
        [-7.2, 40.401],
      ],
    })
    expect(mau.planError).toBe('invalid-ring')
    expect(mau.planOk).toBeNull()
  })
})
