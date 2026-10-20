/*
 * Pacote M-C da revisao da matematica (docs/REVISAO-MATEMATICA-2026-10.md):
 * modelos e melhorias — fotos por circulo pelo bordo distante e circulos
 * que nao veem a area, corda real e rumo inicial da orbita, cantos da
 * fachada, pontas do corredor, GCPs pela normal e com buracos, referencial
 * local em metros, dupla grelha encadeada, margem do contorno, densidade
 * LiDAR media, fotos das ligacoes, area dos blocos sem prolongamento,
 * picos sobre o mosaico, descidas e plano da encosta so dentro do anel.
 */
import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'
import { AIRCRAFT, DEFAULT_CUSTOM_SENSOR, PAYLOADS } from '../../src/data/drones.js'
import { planArea } from '../../src/mission/areaPlan.js'
import { buildSquareMosaic, mosaicOrientationForLines } from '../../src/mission/squareMosaic.js'
import { routeChecks } from '../../src/mission/uncertainty.js'
import { circularGrid, generateCircularPlan } from '../../src/utils/circular.js'
import { extendRunEnds, generateCorridorPlan } from '../../src/utils/corridor.js'
import {
  CORNER_MIN_SPACING_M,
  MIN_PHOTO_GAP_M,
  MIN_SAMPLE_STEP_M,
  generateFacePlan,
  spacePhotos,
} from '../../src/utils/faceMode.js'
import { gcpStats, planGcps } from '../../src/utils/gcp.js'
import {
  bufferDistanceMeters,
  computeFootprint,
  generateFlightPlan,
  gridFromAnchor,
  lidarPointDensity,
  rectangleFromAnchor,
  resolveSensor,
  ringToPolygon,
  splitIntoBlocks,
  squareSideForBattery,
  triggerMaxLinkM,
} from '../../src/utils/geo.js'
import { generateOrbitPlan } from '../../src/utils/orbit.js'
import { despikeElevations, despikeMosaic, fitSlopePlane } from '../../src/utils/terrain.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lat0 = 38.7
const lon0 = -9.14
const mLon = metersPerDegLon(lat0)
const em = (x, y, z) =>
  z == null
    ? [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
    : [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT, z]
const xOf = (p) => (p[0] - lon0) * mLon
const yOf = (p) => (p[1] - lat0) * M_PER_DEG_LAT
const dist = (a, b) => turf.distance(a, b, { units: 'meters' })
const P1 = resolveSensor(PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR)
const M3E = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
const deg = (r) => (r * 180) / Math.PI
const rad = (d) => (d * Math.PI) / 180
const base = {
  spacingM: 40,
  angleDeg: 90,
  bufferPct: 0,
  photoIntervalM: 20,
  speed: 8,
  overshootM: 0,
  tieLine: false,
  photoMode: 'distance',
  crosshatch: false,
  includeNadir: false,
}

// ---------------------------------------------------------------- circular
describe('M2-E5: fotos por circulo pelo bordo distante da pegada', () => {
  const field = rectangleFromAnchor([-8, 39.5], 131, 93, 0)
  const circ = (extra) =>
    generateCircularPlan(field, {
      sensor: P1,
      radiusM: 30,
      overlapPct: 50,
      altitude: 60,
      gimbalPitch: -45,
      frontOverlapPct: 80,
      speed: 8.2,
      ...extra,
    })
  // o modelo do relatorio: v = atan(sH/2f), D_far = H/tan(|p| - v),
  // t_far = H/sin(|p| - v), w_far = t_far * sW/f, rho_far = |D_far - R|,
  // n = ceil(2 pi / ((1 - o) * w_far / rho_far))
  const esperado = (R, pitchDeg = 45, H = 60, o = 0.8) => {
    const v = Math.atan(P1.sensorHeight / (2 * P1.focalLength))
    const p = rad(pitchDeg)
    const dFar = H / Math.tan(p - v)
    const tFar = H / Math.sin(p - v)
    const wFar = (tFar * P1.sensorWidth) / P1.focalLength
    const rhoFar = Math.abs(dFar - R)
    return { n: Math.ceil((2 * Math.PI) / (((1 - o) * wFar) / rhoFar)), wFar, rhoFar }
  }

  test('P1 a 60 m, -45 graus, 80 %: 21 fotos a R 30 e 15 a R 60 (a corda dava 24 e 66 % reais)', () => {
    expect(generateCircularPlan(field, { radiusM: 30, overlapPct: 50, altitude: 60 }).error).toBe(
      undefined,
    )
    const r30 = circ({})
    const r60 = circ({ radiusM: 60 })
    expect(r30.stats.pointsPerCircle).toBe(esperado(30).n)
    expect(r30.stats.pointsPerCircle).toBe(21)
    expect(r60.stats.pointsPerCircle).toBe(esperado(60).n)
    expect(r60.stats.pointsPerCircle).toBe(15)
    // entre fotos consecutivas o bordo distante anda no maximo (1 - o) da sua largura
    for (const [R, plan] of [
      [30, r30],
      [60, r60],
    ]) {
      const { wFar, rhoFar } = esperado(R)
      const passoFar = (rhoFar * 2 * Math.PI) / plan.stats.pointsPerCircle
      expect(passoFar).toBeLessThanOrEqual(0.2 * wFar + 1e-9)
    }
    expect(r30.stats.photoCount).toBe(r30.stats.circleCount * 21)
  })

  test('mais inclinada, menos fotos; a corda voada e a de n pontos', () => {
    const n60 = circ({ gimbalPitch: -60 }).stats.pointsPerCircle
    const n30 = circ({ gimbalPitch: -30 }).stats.pointsPerCircle
    expect(n60).toBeLessThan(21)
    expect(n30).toBeGreaterThan(21)
    const r = circ({})
    expect(r.stats.chordM).toBeCloseTo(2 * 30 * Math.sin(Math.PI / 21), 6)
  })

  test('com |pitch| <= meia abertura vertical o topo da imagem e ceu: recusa', () => {
    // M3E grande angular: v = 28 graus > o minimo de -20 da interface
    expect(circ({ sensor: M3E, gimbalPitch: -20 }).error).toBe('pitch-too-shallow')
    expect(circ({ sensor: M3E, gimbalPitch: -45 }).error).toBeUndefined()
  })

  test('sem camara: 24 por volta e zero fotos', () => {
    const r = circ({ sensor: null })
    expect(r.stats.pointsPerCircle).toBe(24)
    expect(r.stats.photoCount).toBe(0)
  })
})

describe('M2-E10: circulos que nao veem a area sao descartados', () => {
  const o = {
    sensor: P1,
    radiusM: 30,
    overlapPct: 50,
    altitude: 60,
    gimbalPitch: -45,
    frontOverlapPct: 80,
    speed: 8.2,
  }
  test('num L de 300 m com bracos de 100 m caem os circulos do canto vazio; num rectangulo nenhum', () => {
    const L = [em(0, 0), em(300, 0), em(300, 100), em(100, 100), em(100, 300), em(0, 300)]
    const box = [em(0, 0), em(300, 0), em(300, 300), em(0, 300)]
    const pl = generateCircularPlan(L, o)
    const pb = generateCircularPlan(box, o)
    expect(pb.stats.discardedCount).toBe(0)
    expect(pb.stats.circleCount).toBe(circularGrid(box, { radiusM: 30, overlapPct: 50 }).count)
    expect(pl.stats.discardedCount).toBeGreaterThan(0)
    expect(pl.stats.circleCount + pl.stats.discardedCount).toBe(
      circularGrid(L, { radiusM: 30, overlapPct: 50 }).count,
    )
    // o canto vazio (x > 100, y > 100) fica a mais de 2R + meia pegada da area:
    // nenhum centro mantido esta la ao fundo
    const outline = turf.lineString([...L, L[0]])
    const poly = ringToPolygon(L)
    for (const c of pl.circles) {
      const inside = turf.booleanPointInPolygon(turf.point(c.centre), poly)
      const d = turf.pointToLineDistance(turf.point(c.centre), outline, { units: 'meters' })
      expect(inside || d <= 2 * 30 + 150).toBe(true)
    }
    // a serpentina mantem-se: ligacoes consecutivas curtas (<= 2 passos + 2R)
    for (let k = 1; k < pl.circles.length; k++) {
      expect(dist(pl.circles[k - 1].centre, pl.circles[k].centre)).toBeLessThanOrEqual(
        Math.hypot(2 * 30, 2 * 30) + 1,
      )
    }
    expect(pl.stats.photoCount).toBe(pl.stats.circleCount * pl.stats.pointsPerCircle)
  })
})

// ------------------------------------------------------------------ orbita
describe('M2-E13/E14: orbita — rumo inicial da base e corda voada', () => {
  const poi = [-9.14, 38.7]
  const orb = (extra) =>
    generateOrbitPlan(poi, {
      sensor: M3E,
      radiusM: 60,
      levels: { count: 2, startM: 10, stepM: 10 },
      horizontalOverlapPct: 80,
      poiHeightM: 0,
      speed: 5,
      ...extra,
    })
  test('chordM e transitionM sao a corda de n pontos, nunca acima da pedida', () => {
    const p = orb({})
    const n = p.stats.pointsPerOrbit
    const real = 2 * 60 * Math.sin(Math.PI / n)
    expect(p.stats.chordM).toBeCloseTo(real, 9)
    expect(p.stats.transitionM).toBeCloseTo(real, 9)
    const pedida = computeFootprint(M3E, 60).across * (1 - 0.8)
    expect(p.stats.chordM).toBeLessThanOrEqual(pedida + 1e-9)
    // com o minimo de 8 pontos a corda voada fica muito abaixo da pedida
    const larga = orb({ horizontalOverlapPct: 0, radiusM: 60 })
    expect(larga.stats.pointsPerOrbit).toBe(8)
    expect(larga.stats.chordM).toBeCloseTo(2 * 60 * Math.sin(Math.PI / 8), 9)
    expect(larga.stats.chordM).toBeLessThan(computeFootprint(M3E, 60).across)
  })
  test('startBearingDeg poe o primeiro waypoint no azimute da base; sem camara zero fotos', () => {
    const sul = orb({ startBearingDeg: 180 })
    expect(Math.abs(turf.bearing(poi, sul.waypoints[0]) - 180)).toBeLessThan(0.01)
    const este = orb({ startBearingDeg: 90 })
    expect(Math.abs(turf.bearing(poi, este.waypoints[0]) - 90)).toBeLessThan(0.01)
    expect(orb({}).stats.photoCount).toBe(orb({}).waypoints.length)
    expect(orb({ sensor: null }).stats.photoCount).toBe(0)
  })
})

// ------------------------------------------------------------------ fachada
describe('M2-E11: nos cantos a fachada roda o rumo em passos', () => {
  const hfov = deg(2 * Math.atan(M3E.sensorWidth / (2 * M3E.focalLength)))
  const maxStep = Math.max(5, hfov * (1 - 0.7))
  const face = (baseline, side) =>
    generateFacePlan(baseline, {
      sensor: M3E,
      faceHeightM: 30,
      standoffM: 25,
      side,
      verticalOverlapPct: 70,
      horizontalOverlapPct: 70,
    })
  const saltos = (r) => {
    const n = r.stats.pointsPerPass
    const out = []
    for (let i = 1; i < r.waypoints.length; i++) {
      if (i % n === 0) continue // mudanca de passagem
      const a = r.perWaypoint[i - 1].heading
      const b = r.perWaypoint[i].heading
      out.push(Math.abs(((b - a + 540) % 360) - 180))
    }
    return out
  }
  test('num L o salto de rumo entre fotos consecutivas fica <= HFOV * (1 - o)', () => {
    const L = [em(0, 0), em(60, 0), em(60, 60)]
    for (const side of ['left', 'right']) {
      const r = face(L, side)
      expect(r.error).toBeUndefined()
      expect(r.stats.pointsPerPass).toBeGreaterThan(r.stats.samplesPerPass)
      for (const s of saltos(r)) expect(s).toBeLessThanOrEqual(maxStep + 1)
      expect(r.stats.photoCount).toBe(r.stats.heights.length * r.stats.pointsPerPass)
      // as fotos inseridas ficam ENTRE as amostras, ao longo da linha
      // afastada: nenhum par seguido da mesma passagem a menos do espacamento
      // minimo (antes iam para o ponto da amostra seguinte, a 0 m, e o
      // preflight bloqueava a exportacao)
      const n = r.stats.pointsPerPass
      for (let i = 1; i < r.waypoints.length; i++) {
        if (i % n === 0) continue // mudanca de passagem, na vertical
        expect(dist(r.waypoints[i - 1], r.waypoints[i])).toBeGreaterThanOrEqual(
          CORNER_MIN_SPACING_M - 0.01,
        )
      }
      expect(routeChecks(r.waypoints, {}).duplicates).toEqual([])
      // e nenhuma se aproxima da face mais do que o afastamento pedido
      const pe = turf.lineString(L)
      for (const w of r.waypoints)
        expect(
          turf.pointToLineDistance(turf.point([w[0], w[1]]), pe, { units: 'meters' }),
        ).toBeGreaterThan(25 * 0.95)
    }
  })
  test('um canto agudo do lado de fora: as fotos seguem o arco a volta da aresta', () => {
    // deflexao de 135 graus: do lado convexo a linha afastada e um arco de
    // raio igual ao afastamento, centrado no vertice
    const V = [em(0, 0), em(60, 0), em(60 - 60 * Math.cos(Math.PI / 4), 60 * Math.sin(Math.PI / 4))]
    for (const side of ['left', 'right']) {
      const r = face(V, side)
      if (r.error) continue // o lado concavo fechado demais e recusado (standoff-corner)
      expect(routeChecks(r.waypoints, {}).duplicates).toEqual([])
      for (const s of saltos(r)) expect(s).toBeLessThanOrEqual(maxStep + 1)
    }
  })
  test('numa face recta nao ha fotos inseridas', () => {
    const r = face([em(0, 0), em(60, 0)], 'left')
    expect(r.stats.pointsPerPass).toBe(r.stats.samplesPerPass)
    expect(Math.max(...saltos(r))).toBeLessThanOrEqual(1)
  })
  // um canto agudo do lado de dentro, a 5 m: ao longo da linha afastada as
  // fotos ficam a um passo, mas atraves do vertice da esquadria a distancia
  // em linha recta caia para 0,06-0,4 m e o preflight bloqueava a exportacao
  test('canto agudo do lado de dentro: nenhuma foto seguida abaixo do minimo da DJI', () => {
    for (const defl of [90, 105, 135, 150, 170]) {
      const a = (defl * Math.PI) / 180
      const V = [em(0, 0), em(60, 0), em(60 + 60 * Math.cos(a), 60 * Math.sin(a))]
      for (const side of ['left', 'right'])
        for (const ov of [50, 90]) {
          const r = generateFacePlan(V, {
            sensor: M3E,
            faceHeightM: 30,
            standoffM: 5,
            side,
            verticalOverlapPct: 70,
            horizontalOverlapPct: ov,
          })
          if (r.error) {
            expect(r.error).toBe('standoff-corner')
            continue
          }
          expect(routeChecks(r.waypoints, {}).duplicates).toEqual([])
          const n = r.stats.pointsPerPass
          for (let i = 1; i < r.waypoints.length; i++) {
            if (i % n === 0) continue // mudanca de passagem, na vertical
            expect(dist(r.waypoints[i - 1], r.waypoints[i])).toBeGreaterThanOrEqual(
              MIN_PHOTO_GAP_M - 0.01,
            )
          }
          // so se tiram posicoes da linha afastada: nenhuma se aproxima da face
          const pe = turf.lineString(V)
          for (const w of r.waypoints)
            expect(
              turf.pointToLineDistance(turf.point([w[0], w[1]]), pe, { units: 'meters' }),
            ).toBeGreaterThan(5 * 0.95)
        }
    }
  })
  test('95 % de sobreposicao a 5 m: fotos e passagens a MIN_SAMPLE_STEP_M ou mais', () => {
    const r = generateFacePlan([em(0, 0), em(40, 0)], {
      sensor: M3E,
      faceHeightM: 10,
      standoffM: 5,
      side: 'left',
      verticalOverlapPct: 95,
      horizontalOverlapPct: 95,
    })
    expect(r.error).toBeUndefined()
    expect(r.stats.hStepM).toBeGreaterThanOrEqual(MIN_SAMPLE_STEP_M - 1e-9)
    expect(r.stats.vStepM).toBeGreaterThanOrEqual(MIN_SAMPLE_STEP_M - 0.1)
    expect(routeChecks(r.waypoints, {}).duplicates).toEqual([])
  })
  test('spacePhotos: num V fechado fica a posicao do vertice, com o rumo do meio', () => {
    // tres posicoes a 0,3 m do vertice, com rumos 180, 105 e 30; as vizinhas
    // de fora a 2 m, com os rumos das faces
    const pts = [em(-2, 0), em(-0.3, 0), em(0, 0.05), em(-0.3, 0.1), em(-2, 0.5)]
    const hs = [180, 180, 105, 30, 30]
    const r = spacePhotos(pts, hs, 0.9)
    expect(r.headings).toEqual([180, 105, 30])
    for (let i = 1; i < r.pts.length; i++)
      expect(dist(r.pts[i - 1], r.pts[i])).toBeGreaterThanOrEqual(0.9)
    // as pontas da passagem ficam sempre
    const ponta = spacePhotos([em(0, 0), em(0.2, 0), em(3, 0)], [90, 90, 90], 0.9)
    expect(ponta.pts[0]).toEqual(em(0, 0))
    expect(ponta.pts.at(-1)).toEqual(em(3, 0))
  })
})

// ----------------------------------------------------------------- corredor
describe('M2-E12: as passagens do corredor prolongam-se meia pegada nas pontas', () => {
  test('eixo recto de 800 m: a passagem vai de -along/2 a 800 + along/2, com disparo', () => {
    const plan = generateCorridorPlan([em(0, 0), em(800, 0)], {
      sensor: M3E,
      altitude: 80,
      bufferM: 40,
      sideOverlapPct: 60,
      photoIntervalM: 20,
      speed: 8,
    })
    expect(plan.error).toBeUndefined()
    const half = computeFootprint(M3E, 80).along / 2
    expect(plan.stats.endExtendM).toBeCloseTo(half, 6)
    for (const run of plan.lines) {
      const xs = run.map(xOf)
      expect(Math.min(...xs)).toBeCloseTo(-half, 0)
      expect(Math.max(...xs)).toBeCloseTo(800 + half, 0)
    }
  })
  test('extendRunEnds prolonga tangencialmente nos dois extremos', () => {
    expect(
      extendRunEnds(
        [
          [0, 0],
          [10, 0],
          [20, 0],
        ],
        5,
      ),
    ).toEqual([
      [-5, 0],
      [10, 0],
      [25, 0],
    ])
  })
})

// --------------------------------------------------------------------- GCPs
describe('M2-E8/E9: GCPs pela normal interior e area sem os buracos', () => {
  test('numa faixa de 3000 x 100 m os GCPs da fronteira espalham-se pela largura', () => {
    const strip = [em(0, 0), em(3000, 0), em(3000, 100), em(0, 100)]
    const g = planGcps(strip, 10)
    expect(g).toHaveLength(10)
    const ys = g.map((p) => yOf(p.point))
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(50)
    for (const y of ys) expect(y).toBeGreaterThan(0)
    for (const y of ys) expect(y).toBeLessThan(100)
  })
  test('quadrado de 400 m com buraco de 200 m: 12 ha, nao 16', () => {
    const sq = [em(0, 0), em(400, 0), em(400, 400), em(0, 400)]
    const hole = [em(100, 100), em(300, 100), em(300, 300), em(100, 300)]
    expect(gcpStats(sq, planGcps(sq, 8), null).areaHa).toBeCloseTo(16, 1)
    expect(gcpStats(sq, planGcps(sq, 8, { holes: [hole] }), [hole]).areaHa).toBeCloseTo(12, 1)
  })
})

// --------------------------------------------------------------- referencial
describe('M2-G8: ancora e grelha rodadas em metros, no referencial do turf', () => {
  test('500 x 300 a 0/30/45/90 graus mede 500 x 300 (+-0,05 m) e o rumo pedido', () => {
    for (const az of [0, 30, 45, 90]) {
      const r = rectangleFromAnchor(em(0, 0), 500, 300, az)
      const lados = [0, 1, 2, 3].map((i) => dist(r[i], r[(i + 1) % 4]))
      expect(lados[0]).toBeCloseTo(500, 1)
      expect(lados[2]).toBeCloseTo(500, 1)
      expect(lados[1]).toBeCloseTo(300, 1)
      expect(lados[3]).toBeCloseTo(300, 1)
      expect(Math.abs(turf.bearing(r[0], r[1]) - az)).toBeLessThan(0.01)
    }
  })
  test('grelha 2 x 3 de 500 x 400 a 45 graus: celulas e contorno exactos', () => {
    const g = gridFromAnchor(em(0, 0), 500, 400, 45, 2, 3)
    expect(g.cells).toHaveLength(6)
    const lados = (ring) => [0, 1, 2, 3].map((i) => dist(ring[i], ring[(i + 1) % 4]))
    for (const c of g.cells) {
      const l = lados(c)
      expect(l[0]).toBeCloseTo(500, 1)
      expect(l[1]).toBeCloseTo(400, 1)
    }
    const o = lados(g.outline)
    expect(o[0]).toBeCloseTo(1000, 1)
    expect(o[1]).toBeCloseTo(1200, 1)
  })
  test('o grau de latitude do referencial e o que o turf mede', () => {
    expect(M_PER_DEG_LAT).toBeCloseTo(turf.distance([0, 38], [0, 39], { units: 'meters' }), 6)
  })
})

// ------------------------------------------------------------- dupla grelha
describe('M2-G9: a grelha seguinte comeca junto ao fim da anterior', () => {
  test('bloco de 500 m com nadir: nenhuma ligacao entre grelhas atravessa o bloco em diagonal', () => {
    for (const [L, nadir] of [
      [500, true],
      [500, false],
      [460, true],
    ]) {
      const sq = rectangleFromAnchor(em(L / 2, L / 2), L, L, 90)
      const dg = generateFlightPlan(sq, { ...base, crosshatch: true, includeNadir: nadir })
      expect(dg.error).toBeUndefined()
      const w = dg.waypoints
      // ligacoes: do fim de uma faixa ao inicio da seguinte
      for (let i = 1; i + 1 < w.length; i += 2) {
        expect(dist(w[i], w[i + 1])).toBeLessThanOrEqual(L + 10)
      }
      if (nadir) expect(dg.nadirStartLine).toBe(dg.lines.length - Math.ceil(dg.lines.length / 3))
    }
  })
})

// ------------------------------------------------------------------- margem
describe('M2-G10: a margem e a do contorno, com e sem celulas', () => {
  const big = [em(0, 0), em(1440, 0), em(1440, 960), em(0, 960)]
  const o = { ...base, bufferPct: 10 }
  test('com celulas as faixas chegam ao mesmo sitio do plano unico', () => {
    const unico = generateFlightPlan(big, o)
    const mosaic = buildSquareMosaic(big, {
      sideM: 480,
      orientationDeg: mosaicOrientationForLines(90),
    })
    const celulas = planArea(
      big,
      mosaic.cells.map((c) => c.ring),
      o,
    )
    const ext = (p) => {
      const pts = p.lines.flat()
      return [
        Math.min(...pts.map(xOf)),
        Math.max(...pts.map(xOf)),
        Math.min(...pts.map(yOf)),
        Math.max(...pts.map(yOf)),
      ]
    }
    const a = ext(unico)
    const b = ext(celulas)
    for (let i = 0; i < 4; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.5)
    // a margem e a de 10 % de raiz(area) do CONTORNO (58,8 m), nao a de cada celula (24 m)
    const bufferM = bufferDistanceMeters(ringToPolygon(big), 10)
    expect(bufferM).toBeGreaterThan(50)
    expect(-b[0]).toBeCloseTo(bufferM, 0)
    expect(b[1] - 1440).toBeCloseTo(bufferM, 0)
  })
  test('o lado por bateria usa a margem em metros quando a tem', () => {
    const sizing = { batteryMin: 25, reservePct: 30, speed: 5, spacingM: 25, maxSideM: 2000 }
    const pct = squareSideForBattery({ ...sizing, bufferPct: 10 })
    const metros = squareSideForBattery({ ...sizing, bufferPct: 10, bufferM: 20 })
    const sem = squareSideForBattery(sizing)
    expect(pct).toBeLessThan(sem)
    expect(metros).toBeLessThan(sem)
    expect(metros).not.toBe(pct)
    // sem margem em metros nem em %, nada muda
    expect(squareSideForBattery({ ...sizing, bufferM: 0 })).toBe(sem)
  })
})

// ------------------------------------------------------------ densidade LiDAR
describe('M2-G11: densidade LiDAR media da area', () => {
  test('media = PRR / (v * espacamento); minimo de uma passagem = PRR / (v * faixa)', () => {
    const d = lidarPointDensity({ prr: 240000, speed: 4, swathM: 84.7, spacingM: 25.4 })
    expect(d.single).toBeCloseTo(240000 / (4 * 84.7), 6)
    expect(d.mean).toBeCloseTo(240000 / (4 * 25.4), 6)
    expect(d.mean).toBeGreaterThan(d.overlap)
    expect(lidarPointDensity({ prr: 240000, speed: 4, swathM: 84.7 }).mean).toBeNull()
    expect(lidarPointDensity({ prr: 0, speed: 4, swathM: 84.7, spacingM: 25 })).toBeNull()
  })
})

// --------------------------------------------------------- fotos das ligacoes
describe('M2-G12: as fotos contam-se continuas por grupo de disparo', () => {
  test('1 km2 com o M3E a 100 m, 80/70: 1172 fotos (faixa a faixa davam 1128)', () => {
    const km = [em(0, 0), em(1000, 0), em(1000, 1000), em(0, 1000)]
    const fp = computeFootprint(M3E, 100)
    const spacingM = fp.across * (1 - 0.7)
    const photoIntervalM = fp.along * (1 - 0.8)
    const plan = generateFlightPlan(km, { ...base, spacingM, photoIntervalM })
    const faixas = plan.lines.reduce(
      (n, l) => n + Math.floor(dist(l[0], l[1]) / photoIntervalM) + 1,
      0,
    )
    let percurso = 0
    plan.lines.forEach((l, i) => {
      percurso += dist(l[0], l[1])
      if (i > 0) percurso += dist(plan.lines[i - 1][1], l[0])
    })
    expect(plan.stats.photoCount).toBe(Math.floor(percurso / photoIntervalM) + 1)
    expect(plan.stats.photoCount).toBeGreaterThan(faixas)
    expect(plan.stats.photoCount).toBe(1172)
    expect(faixas).toBe(1128)
  })
  test('uma ligacao longa quebra o grupo: duas areas afastadas contam em separado', () => {
    // duas faixas de 300 m a 200 m uma da outra (ligacao > 2,5 s e > 60 m)
    const ring = [
      em(0, 0),
      em(300, 0),
      em(300, 20),
      em(290, 20),
      em(290, 180),
      em(300, 180),
      em(300, 200),
      em(0, 200),
      em(0, 180),
      em(10, 180),
      em(10, 20),
      em(0, 20),
    ]
    const plan = generateFlightPlan(ring, { ...base, spacingM: 40 })
    const groups = []
    let cur = 0
    plan.lines.forEach((l, i) => {
      if (i > 0 && dist(plan.lines[i - 1][1], l[0]) > triggerMaxLinkM(40)) {
        groups.push(cur)
        cur = 0
      } else if (i > 0) cur += dist(plan.lines[i - 1][1], l[0])
      cur += dist(l[0], l[1])
    })
    groups.push(cur)
    expect(groups.length).toBeGreaterThan(1)
    expect(plan.stats.photoCount).toBe(groups.reduce((n, g) => n + Math.floor(g / 20) + 1, 0))
  })
  test('triggerMaxLinkM: 2,5 espacamentos, nunca menos de 60 m', () => {
    expect(triggerMaxLinkM(42.5)).toBeCloseTo(106.25, 6)
    expect(triggerMaxLinkM(10)).toBe(60)
    expect(triggerMaxLinkM(undefined)).toBe(60)
  })
})

// ----------------------------------------------------------- blocos por area
describe('M2-G15: a area de um bloco nao conta o prolongamento', () => {
  test('1 km2 a 50 m com 30 m de prolongamento e 25 ha por bloco: 5 faixas (25 ha) por bloco', () => {
    const area = [em(0, 0), em(1000, 0), em(1000, 1000), em(0, 1000)]
    const plan = generateFlightPlan(area, { ...base, spacingM: 50, overshootM: 30 })
    const com = splitIntoBlocks(plan, {
      mode: 'area',
      maxAreaHa: 25,
      speed: 8,
      spacingM: 50,
      overshootM: 30,
    })
    const sem = splitIntoBlocks(plan, { mode: 'area', maxAreaHa: 25, speed: 8, spacingM: 50 })
    expect(com.slice(0, -1).map((b) => b.lines.length)).toEqual([5, 5, 5, 5])
    for (const b of com.slice(0, -1)) expect(b.areaHa).toBeCloseTo(25, 1)
    // sem descontar, as faixas de 1060 m so cabiam 4 por bloco (21,2 ha)
    expect(sem.slice(0, -1).every((b) => b.lines.length === 4)).toBe(true)
    expect(sem.length).toBeGreaterThan(com.length)
  })
})

// -------------------------------------------------------------------- relevo
describe('M2-T12: picos filtrados sobre o mosaico, com orla dos tiles vizinhos', () => {
  const w = 8
  const h = 8
  const tile = () => ({ elev: new Float32Array(w * h).fill(100), width: w, height: h })
  test('uma crista de 1 pixel que cruza o bordo entre dois tiles mantem-se', () => {
    const tiles = new Map([
      ['10/10', tile()],
      ['11/10', tile()],
    ])
    for (let x = 4; x < w; x++) tiles.get('10/10').elev[3 * w + x] = 300
    for (let x = 0; x < 4; x++) tiles.get('11/10').elev[3 * w + x] = 300
    // tile a tile, o pixel do bordo so via 3 vizinhos e caia para 100
    const solo = Float32Array.from(tiles.get('11/10').elev)
    despikeElevations(solo, w, h)
    expect(solo[3 * w]).toBe(100)
    despikeMosaic(tiles)
    expect(tiles.get('10/10').elev[3 * w + w - 1]).toBe(300)
    expect(tiles.get('11/10').elev[3 * w]).toBe(300)
    expect(tiles.get('11/10').elev[3 * w + 2]).toBe(300)
    // a ponta da crista (um so vizinho ao seu nivel) continua a cair: a
    // regra de suporte >= 2 em 8 e a que apanha os erros de descodificacao
    expect(tiles.get('11/10').elev[3 * w + 3]).toBe(100)
  })
  test('um pico isolado continua a cair, tambem no bordo do mosaico', () => {
    const tiles = new Map([['5/5', tile()]])
    tiles.get('5/5').elev[3 * w + 3] = 900
    tiles.get('5/5').elev[0] = 900 // canto do mosaico, sem vizinhos de fora
    despikeMosaic(tiles)
    expect(tiles.get('5/5').elev[3 * w + 3]).toBe(100)
    expect(tiles.get('5/5').elev[0]).toBe(100)
  })
})

describe('M2-T9: o plano da encosta so amostra dentro do anel', () => {
  test('num L a falesia que fica na caixa envolvente mas fora do L nao entra na media', () => {
    const elevationAt = (lon, lat) => {
      const x = xOf([lon, lat])
      const y = yOf([lon, lat])
      return x > 150 && y > 150 ? 400 + 0.1 * y : 100 + 0.1 * y
    }
    const L = [em(0, 0), em(300, 0), em(300, 100), em(100, 100), em(100, 300), em(0, 300)]
    const fit = fitSlopePlane({ elevationAt }, L)
    expect(fit.slopeDeg).toBeCloseTo(deg(Math.atan(0.1)), 1)
    expect(Math.abs(fit.downhillAzimuthDeg - 180)).toBeLessThan(1)
    expect(fit.samples).toBeLessThan(144)
    // sem o filtro a caixa inteira (com a falesia) daria uma encosta muito maior
    const caixa = [em(0, 0), em(300, 0), em(300, 300), em(0, 300)]
    expect(fitSlopePlane({ elevationAt }, caixa).slopeDeg).toBeGreaterThan(fit.slopeDeg + 10)
  })
})

describe('M2-T13: as descidas contra a velocidade de descida', () => {
  const wps = [em(0, 0, 100), em(100, 0, 100), em(200, 0, 60), em(300, 0, 110)]
  test('com maxDescentMS 3 a descida de 4 m/s e apanhada; sem ele vale o limite de subida', () => {
    const so = routeChecks(wps, { speed: 10, maxClimbMS: 5 }).climb
    expect(so.map((c) => c.at)).toEqual([3])
    const ambos = routeChecks(wps, { speed: 10, maxClimbMS: 5, maxDescentMS: 3 }).climb
    expect(ambos.map((c) => c.at)).toEqual([2, 3])
    expect(ambos[0].dh).toBeLessThan(0)
    // um limite de descida mais alto nao afrouxa a subida
    expect(
      routeChecks(wps, { speed: 10, maxClimbMS: 5, maxDescentMS: 9 }).climb.map((c) => c.at),
    ).toEqual([3])
  })
  test('todas as aeronaves trazem maxDescentMS', () => {
    for (const a of Object.values(AIRCRAFT)) {
      expect(a.maxDescentMS).toBeGreaterThan(0)
      expect(a.maxDescentMS).toBeLessThanOrEqual(a.maxClimbMS)
    }
  })
})
