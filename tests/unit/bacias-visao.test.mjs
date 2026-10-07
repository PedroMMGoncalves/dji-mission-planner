// Bacias de visao: que partes de cada bloco ficam atras do relevo, vistas
// dos olhos do operador na base. Linha de vista amostrada ao longo do
// segmento (sem as pontas), curvatura com refraccao, saida no 1.o obstaculo,
// relevo desconhecido nao tapa mas fica contado.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OBSTACLE_CLEAR_M,
  FRESNEL_FRACTION,
  RADIO_FREQ_GHZ,
  baseViewsheds,
  blockVisibility,
  lineOfSight,
} from '../../src/mission/viewshed.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lon0 = -8.0
const lat0 = 37.95
const mLon = metersPerDegLon(lat0)
/** ponto a x m para leste e y m para norte da origem */
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const base = em(0, 0)
/** rectangulo [x0, x1] x [y0, y1] em metros locais, anel fechado */
const rect = (x0, x1, y0, y1) => [em(x0, y0), em(x1, y0), em(x1, y1), em(x0, y1), em(x0, y0)]
const at = (x, y, elev) => {
  const [lon, lat] = em(x, y)
  return { lon, lat, elev }
}

const flat = () => 100
/** plano a 100 m com uma crista (faixa norte-sul) entre x0 e x1, a cota h */
const ridge = (x0, x1, h) => (lon) => {
  const x = xOf(lon)
  return x >= x0 && x <= x1 ? h : 100
}

describe('lineOfSight', () => {
  it('terreno plano: visivel, margem positiva, sem amostras saltadas', () => {
    const r = lineOfSight(at(0, 0, 101.7), at(800, 0, 140), { elevationAt: flat })
    expect(r.visible).toBe(true)
    expect(r.blockedAtM).toBeNull()
    expect(r.worstMarginM).toBeGreaterThan(0)
    expect(r.skipped).toBe(0)
    expect(r.samples).toBeGreaterThan(70)
  })

  it('crista no caminho: tapado a distancia da crista', () => {
    const r = lineOfSight(at(0, 0, 101.7), at(1000, 0, 140), {
      elevationAt: ridge(300, 320, 125),
    })
    expect(r.visible).toBe(false)
    expect(r.blockedAtM).toBeGreaterThanOrEqual(300 - 1e-6)
    expect(r.blockedAtM).toBeLessThanOrEqual(320)
    expect(r.worstMarginM).toBeLessThan(0)
  })

  it('as pontas nao contam: relevo alto colado ao olho e ao alvo nao tapa', () => {
    // degraus de 5 m dentro do primeiro e do ultimo passo
    const elevationAt = (lon) => {
      const x = xOf(lon)
      return x < 8 || x > 492 ? 150 : 100
    }
    const r = lineOfSight(at(0, 0, 101.7), at(500, 0, 140), { elevationAt })
    expect(r.visible).toBe(true)
  })

  it('a curvatura decide um caso rasante a ~3 km', () => {
    // linha horizontal a 101.7 m; crista a meio a 101.65 m: sem curvatura
    // passa 5 cm acima, com a curvatura (0.15 m a meio) fica tapada
    const elevationAt = ridge(1495, 1505, 101.65)
    const eye = at(0, 0, 101.7)
    const target = at(3000, 0, 101.7)
    const plano = lineOfSight(eye, target, { elevationAt, curvature: false })
    expect(plano.visible).toBe(true)
    expect(plano.worstMarginM).toBeCloseTo(0.05, 6)
    const curvo = lineOfSight(eye, target, { elevationAt })
    expect(curvo.visible).toBe(false)
    expect(curvo.blockedAtM).toBeCloseTo(1500, 0)
    expect(curvo.worstMarginM).toBeCloseTo(0.05 - ((1 - 0.13) / (2 * 6371000)) * 1500 ** 2, 3)
  })

  it('relevo desconhecido e saltado e contado, sem tapar', () => {
    // crista dentro de um buraco do MDT: nao se ve, nao tapa
    const elevationAt = (lon) => {
      const x = xOf(lon)
      return x >= 195 && x <= 405 ? null : 100
    }
    const r = lineOfSight(at(0, 0, 101.7), at(800, 0, 101.8), { elevationAt })
    expect(r.visible).toBe(true)
    expect(r.skipped).toBe(21)
  })

  it('resolucao do MDT reduz o passo e apanha uma crista estreita', () => {
    // crista de 2 m de largura entre amostras de 10 m
    const elevationAt = ridge(302.5, 305, 130)
    const eye = at(0, 0, 101.7)
    const target = at(1000, 0, 140)
    expect(lineOfSight(eye, target, { elevationAt }).visible).toBe(true)
    const fino = lineOfSight(eye, target, { elevationAt, resolutionM: 1 })
    expect(fino.visible).toBe(false)
    expect(fino.blockedAtM).toBeCloseTo(303, 0)
  })
})

describe('blockVisibility', () => {
  const block = rect(400, 1000, -100, 100)

  it('terreno plano: 100 % visivel', () => {
    const v = blockVisibility({
      eye: { point: base },
      blockRing: block,
      droneElevAt: () => 140,
      elevationAt: flat,
    })
    expect(v.visibleFrac).toBe(1)
    expect(v.hidden).toEqual([])
    expect(v.unknown).toBe(0)
    expect(v.total).toBe(24 * 8)
    expect(v.gridStepM).toBe(25)
    expect(v.eyeElev).toBeCloseTo(101.7, 9)
  })

  it('crista entre a base e o bloco: a parte longe tapada, a perto visivel', () => {
    // olho a 101.7, drone a 140 (40 m AGL), crista a 120 entre 300 e 320 m:
    // a linha passa a crista acima de 120 ate x = 38.3 * 300 / 18.3 = 628 m
    const v = blockVisibility({
      eye: { point: base },
      blockRing: block,
      droneElevAt: () => 140,
      elevationAt: ridge(300, 320, 120),
    })
    expect(v.hidden.length).toBeGreaterThan(0)
    expect(v.visibleFrac).toBeGreaterThan(0.3)
    expect(v.visibleFrac).toBeLessThan(0.7)
    for (const h of v.hidden) {
      const x = xOf(h.point[0])
      const D = Math.hypot(x, yOf(h.point[1]))
      expect(x).toBeGreaterThan(620)
      // obstaculo na crista: entre a orla perto e a longe, ao longo do raio
      expect(h.blockedAtM).toBeGreaterThanOrEqual((300 * D) / x - 1e-6)
      expect(h.blockedAtM).toBeLessThanOrEqual((320 * D) / x + 1e-6)
    }
    // a orla longe do bloco fica tapada
    expect(v.hidden.some((h) => xOf(h.point[0]) > 950)).toBe(true)
  })

  it('a mesma crista com o drone muito mais alto: tudo visivel', () => {
    const v = blockVisibility({
      eye: { point: base },
      blockRing: block,
      droneElevAt: () => 220,
      elevationAt: ridge(300, 320, 120),
    })
    expect(v.visibleFrac).toBe(1)
    expect(v.hidden).toEqual([])
  })

  it('a altura dos olhos conta num caso marginal', () => {
    // bloco pequeno a 1 km (um so ponto da grelha), drone a 140, crista
    // de 10 m a 500 m a 120.5: com olhos a 1.7 m a linha passa a 120.85,
    // com 0.5 m a 120.25
    const args = {
      blockRing: rect(990, 1010, -10, 10),
      droneElevAt: () => 140,
      elevationAt: ridge(495, 505, 120.5),
    }
    const alto = blockVisibility({ ...args, eye: { point: base, heightM: 1.7 } })
    const baixo = blockVisibility({ ...args, eye: { point: base, heightM: 0.5 } })
    expect(alto.total).toBe(1)
    expect(alto.visibleFrac).toBe(1)
    expect(baixo.visibleFrac).toBe(0)
    expect(baixo.hidden[0].blockedAtM).toBeCloseTo(500, 0)
  })

  it('buracos no relevo: pontos desconhecidos, nao tapados', () => {
    // faixa sem MDT entre 150 e 250 m (com uma crista que la estivesse)
    const elevationAt = (lon, lat) => {
      const x = xOf(lon)
      if (x >= 150 && x <= 250 && yOf(lat) > 0) return null
      return 100
    }
    const v = blockVisibility({
      eye: { point: base },
      blockRing: block,
      droneElevAt: () => 140,
      elevationAt,
    })
    expect(v.hidden).toEqual([])
    expect(v.visibleFrac).toBe(1)
    // os pontos a norte (y > 0) atravessam o buraco
    expect(v.unknown).toBe(24 * 4)
  })

  it('cota do drone desconhecida: ponto desconhecido', () => {
    const v = blockVisibility({
      eye: { point: base },
      blockRing: block,
      droneElevAt: (lon) => (xOf(lon) > 900 ? null : 140),
      elevationAt: flat,
    })
    expect(v.unknown).toBe(4 * 8)
    expect(v.visibleFrac).toBe(1)
  })

  it('base sem relevo: erro', () => {
    const v = blockVisibility({
      eye: { point: base },
      blockRing: block,
      droneElevAt: () => 140,
      elevationAt: (lon) => (xOf(lon) < 50 ? null : 100),
    })
    expect(v).toEqual({ error: 'no-terrain' })
  })

  it('desempenho: bloco de 660 m, grelha de 25 m, raios ate ~1 km em menos de 100 ms', () => {
    const elevationAt = (lon, lat) => 100 + 0.5 * Math.sin(lon * 5000) + 0.5 * Math.cos(lat * 5000)
    const args = {
      eye: { point: base },
      blockRing: rect(300, 960, -330, 330),
      droneElevAt: () => 160,
      elevationAt,
    }
    blockVisibility(args) // aquecimento do JIT
    const t0 = performance.now()
    const v = blockVisibility(args)
    const ms = performance.now() - t0
    expect(v.total).toBeGreaterThan(650)
    expect(v.visibleFrac).toBe(1) // sem saida antecipada: o pior caso
    expect(ms).toBeLessThan(100)
  })
})

describe('baseViewsheds', () => {
  it('cada bloco visto da sua base; aceita id ou { baseId }; sem base fica de fora', () => {
    const bases = [
      { id: 'a', point: base },
      { id: 'b', point: em(2000, 0) },
    ]
    const blocks = [
      { id: 1, ring: rect(400, 1000, -100, 100) },
      { id: 2, ring: rect(400, 1000, -100, 100) },
      { id: 3, ring: rect(400, 1000, -100, 100) },
    ]
    const calls = []
    const out = baseViewsheds({
      bases,
      blocks,
      assignment: { 1: 'a', 2: { baseId: 'b' } },
      elevationAt: ridge(300, 320, 120),
      droneElevAtFor: (block, b) => {
        calls.push([block.id, b.id])
        return () => 140
      },
    })
    expect(Object.keys(out).sort()).toEqual(['1', '2'])
    expect(calls).toEqual([
      [1, 'a'],
      [2, 'b'],
    ])
    // da base a a crista tapa a parte longe; da base b (a leste) nada tapa
    expect(out[1].hidden.length).toBeGreaterThan(0)
    expect(out[2].visibleFrac).toBe(1)
  })

  it('bloco do plano sem ring usa o involucro dos waypoints', () => {
    const out = baseViewsheds({
      bases: [{ id: 'a', point: base }],
      blocks: [{ id: 7, waypoints: [em(400, -50), em(600, -50), em(600, 50), em(400, 50)] }],
      assignment: { 7: 'a' },
      elevationAt: flat,
      droneElevAtFor: () => () => 140,
      gridStepM: 50,
    })
    expect(out[7].total).toBe(4 * 2)
    expect(out[7].visibleFrac).toBe(1)
  })
})

// Radio: 60 % da 1.a zona de Fresnel a 2,4 GHz. A meio de um raio de 800 m
// o raio da zona e sqrt(lambda*400*400/800) = 5,0 m, e 60 % sao 3,0 m.
describe('radio (zona de Fresnel)', () => {
  const fresnel = { freqGHz: RADIO_FREQ_GHZ, fraction: FRESNEL_FRACTION }

  it('constantes: 2,4 GHz e 60 %', () => {
    expect(RADIO_FREQ_GHZ).toBe(2.4)
    expect(FRESNEL_FRACTION).toBe(0.6)
  })

  it('crista rente: o olho ve o drone, o radio nao tem a zona livre', () => {
    // linha a meio: 101,7 + 38,3/2 = 120,85 m; crista a 119 m: 1,85 m de folga < 3,0 m
    const elevationAt = ridge(395, 405, 119)
    const eye = at(0, 0, 101.7)
    const target = at(800, 0, 140)
    const sem = lineOfSight(eye, target, { elevationAt })
    expect(sem.visible).toBe(true)
    // sem fresnel, nada de radio (compatibilidade)
    expect('radioOk' in sem).toBe(false)
    const r = lineOfSight(eye, target, { elevationAt, fresnel })
    expect(r.visible).toBe(true)
    expect(r.radioOk).toBe(false)
    expect(r.radioWorstAtM).toBeGreaterThanOrEqual(390)
    expect(r.radioWorstAtM).toBeLessThanOrEqual(410)
    expect(r.radioMarginM).toBeCloseTo(1.85 - 3.0, 0)
    // com a crista 2 m mais baixa (3,85 m de folga) o radio passa
    const ok = lineOfSight(eye, target, { elevationAt: ridge(395, 405, 117), fresnel })
    expect(ok.radioOk).toBe(true)
    expect(ok.radioMarginM).toBeGreaterThan(0)
  })

  it('a mesma folga sobre o obstaculo: o raio curto passa, o longo nao', () => {
    // linha horizontal a 101,7 m sobre um vale a 50 m; obstaculo a meio, 3 m
    // abaixo da linha
    const valley = (x0, x1) => (lon) => (xOf(lon) >= x0 && xOf(lon) <= x1 ? 98.7 : 50)
    const shortR = lineOfSight(at(0, 0, 101.7), at(200, 0, 101.7), {
      elevationAt: valley(95, 105),
      fresnel,
    })
    const longR = lineOfSight(at(0, 0, 101.7), at(2000, 0, 101.7), {
      elevationAt: valley(995, 1005),
      fresnel,
    })
    // 60 % da zona: 1,5 m a 200 m, 4,7 m a 2 km
    expect(shortR.visible && longR.visible).toBe(true)
    expect(shortR.radioOk).toBe(true)
    expect(longR.radioOk).toBe(false)
    expect(longR.radioWorstAtM).toBeCloseTo(1000, -1)
  })

  it('com radio le o raio todo: o 1.o obstaculo visual e a pior intrusao mais adiante', () => {
    // crista baixa a 200 m tapa; outra mais alta a 600 m e a pior intrusao
    const elevationAt = (lon) => {
      const x = xOf(lon)
      if (x >= 195 && x <= 215) return 125
      if (x >= 595 && x <= 615) return 160
      return 100
    }
    const eye = at(0, 0, 101.7)
    const target = at(800, 0, 140)
    const sem = lineOfSight(eye, target, { elevationAt })
    const r = lineOfSight(eye, target, { elevationAt, fresnel })
    expect(sem.visible).toBe(false)
    expect(r.visible).toBe(false)
    expect(r.blockedAtM).toBe(sem.blockedAtM)
    expect(r.blockedAtM).toBeLessThanOrEqual(215)
    expect(r.radioOk).toBe(false)
    expect(r.radioWorstAtM).toBeGreaterThanOrEqual(595)
    expect(r.samples).toBeGreaterThan(sem.samples)
    // a antena noutra cota: originElev
    const alto = lineOfSight(eye, target, {
      elevationAt: flat,
      fresnel: { ...fresnel, originElev: 101.7 },
    })
    expect(alto.radioOk).toBe(true)
  })

  it('fraccao 0: o radio e a propria linha de vista', () => {
    const eye = at(0, 0, 101.7)
    for (const h of [119, 122]) {
      const r = lineOfSight(eye, at(800, 0, 140), {
        elevationAt: ridge(395, 405, h),
        fresnel: { fraction: 0 },
      })
      expect(r.radioOk).toBe(r.visible)
    }
  })
})

describe('vegetacao e obstaculos somados ao relevo', () => {
  it('somam-se as amostras longe do olho, nunca na clareira da base', () => {
    const eye = at(0, 0, 101.7)
    const target = at(800, 0, 140)
    // planicie a 90 m e crista a 119 m a meio: a vista passa; com 5 m de
    // arvores (a planicie a 95 m continua abaixo da linha), nao
    const elevationAt = (lon) => (xOf(lon) >= 395 && xOf(lon) <= 405 ? 119 : 90)
    expect(lineOfSight(eye, target, { elevationAt }).visible).toBe(true)
    const r = lineOfSight(eye, target, { elevationAt, obstacleM: 5 })
    expect(r.visible).toBe(false)
    expect(r.blockedAtM).toBeGreaterThanOrEqual(395)
    // arvores de 20 m em todo o lado menos na clareira de 30 m: a linha sobe
    // devagar e fica tapada logo a seguir a clareira
    const near = lineOfSight(eye, target, { elevationAt: flat, obstacleM: 20 })
    expect(near.visible).toBe(false)
    expect(near.blockedAtM).toBeGreaterThan(DEFAULT_OBSTACLE_CLEAR_M)
    expect(near.blockedAtM).toBeLessThanOrEqual(DEFAULT_OBSTACLE_CLEAR_M + 10)
    // sem clareira: tapado na primeira amostra
    const none = lineOfSight(eye, target, { elevationAt: flat, obstacleM: 20, obstacleClearM: 0 })
    expect(none.blockedAtM).toBe(10)
  })
})

describe('blockVisibility com radio', () => {
  const args = {
    eye: { point: base, heightM: 1.7, antennaHeightM: 1.5 },
    blockRing: rect(400, 1000, -100, 100),
    droneElevAt: () => 140,
    elevationAt: ridge(300, 320, 118),
  }
  it('pontos a vista com o radio em risco a parte; tapados contam no radio', () => {
    const sem = blockVisibility(args)
    const r = blockVisibility({ ...args, fresnel: { freqGHz: 2.4, fraction: 0.6 } })
    // sem fresnel o resultado de sempre, sem campos do radio
    expect('radioRisk' in sem).toBe(false)
    expect(r.hidden).toEqual(sem.hidden)
    expect(r.total).toBe(sem.total)
    expect(r.radioRisk.length).toBeGreaterThan(0)
    expect(r.radioFail).toBeGreaterThanOrEqual(r.hidden.length + r.radioRisk.length)
    const hiddenKeys = new Set(r.hidden.map((h) => h.point.join()))
    for (const q of r.radioRisk) {
      expect(hiddenKeys.has(q.point.join())).toBe(false)
      expect(q.atM).toBeGreaterThanOrEqual(290)
      expect(q.atM).toBeLessThanOrEqual(330)
    }
    // a antena 1,5 m: a cota da antena e 0,2 m abaixo do olho
    expect(r.eyeElev - r.antennaElev).toBeCloseTo(0.2, 6)
  })
})
