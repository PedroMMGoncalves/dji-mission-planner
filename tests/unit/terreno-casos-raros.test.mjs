/**
 * Relevo (src/utils/terrain.js), casos raros: o seguimento de terreno sem
 * relevo, com buracos (aviso com quantos pontos), com o tecto AGL a travar a
 * subida do corredor (aviso com a folga que fica), com valores inválidos e
 * com linhas degeneradas; o plano médio de uma área (encosta conhecida, área
 * fina demais para ajustar um plano, relevo com buracos); e as falhas da
 * descarga do relevo global, com as APIs do browser substituídas (caixa
 * inválida, sem fetch, sem createImageBitmap, sem canvas, área grande de
 * mais, tiles que não chegam).
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  MIN_SAFE_REL_M,
  fitSlopePlane,
  loadTerrain,
  terrainFollowLines,
} from '../../src/utils/terrain.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../../src/utils/units.js'

const lat0 = 39.5
const lon0 = -8.0
const mLon = metersPerDegLon(lat0)
const em = (x, y) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]
const xOf = (lon) => (lon - lon0) * mLon
const yOf = (lat) => (lat - lat0) * M_PER_DEG_LAT
const linha = [em(0, 0), em(300, 0)]

describe('seguimento de terreno em casos raros', () => {
  test('sem linhas: resultado vazio, sem avisos', () => {
    const r = terrainFollowLines({ elevationAt: () => 100 }, [], { agl: 80, refElev: 100 })
    expect(r).toMatchObject({ waypoints: [], perLine: [], warnings: [], sampleCount: 0 })
    expect(r.elevMin).toBeNull()
    expect(r.clearanceMinM).toBeNull()
  })

  test('sem relevo nenhum: alturas planas e o aviso de que nenhum ponto tinha dados', () => {
    const r = terrainFollowLines(null, [linha], { agl: 80, refElev: 100 })
    expect(r.waypoints.every((w) => w[2] === 80)).toBe(true)
    expect(r.noDataCount).toBe(r.sampleCount)
    expect(r.elevMin).toBeNull()
    const [aviso] = r.warnings
    expect(aviso.code).toBe('tf.no-data')
    expect(aviso.params).toEqual({ n: r.sampleCount, total: r.sampleCount })
    expect(aviso.message).toBe(
      `Sem dados de terreno em ${r.sampleCount} de ${r.sampleCount} pontos amostrados: nessas zonas foi usada a última cota válida.`,
    )
  })

  test('buraco no relevo a meio da linha: a última cota válida, e o aviso com a contagem', () => {
    // rampa de 0,1 m/m com um buraco entre 100 e 200 m
    const elevationAt = (lon) => {
      const x = xOf(lon)
      return x > 100 && x < 200 ? null : 100 + 0.1 * x
    }
    const r = terrainFollowLines({ elevationAt, resolutionM: 10 }, [linha], {
      agl: 80,
      refElev: 100,
      toleranceM: 1,
      corridorM: 0,
    })
    expect(r.noDataCount).toBeGreaterThan(0)
    expect(r.noDataCount).toBeLessThan(r.sampleCount)
    expect(r.warnings.map((w) => w.code)).toEqual(['tf.no-data'])
    // no buraco a altura fica na da última cota válida (~10 m acima da referência)
    const noBuraco = r.waypoints.filter((w) => xOf(w[0]) > 110 && xOf(w[0]) < 190)
    for (const w of noBuraco) expect(w[2]).toBeCloseTo(90, 0)
    expect(r.elevMin).toBeCloseTo(100, 6)
    expect(r.elevMax).toBeCloseTo(130, 6)
  })

  test('tecto AGL: a subida do corredor trava e a folga desce, com aviso', () => {
    // muro de 60 m a 20 m para norte do eixo, ao longo de toda a linha
    const elevationAt = (lon, lat) => (yOf(lat) > 10 ? 160 : 100)
    const r = terrainFollowLines({ elevationAt, resolutionM: 10 }, [linha], {
      agl: 100,
      refElev: 100,
      aglCapM: 120,
    })
    expect(r.cappedCount).toBeGreaterThan(0)
    // a subida pedida (60 m) só pôde ser 20: fica 60 m de folga sobre o muro
    expect(r.clearanceMinM).toBeCloseTo(60, 6)
    expect(r.waypoints.every((w) => w[2] === 120)).toBe(true)
    const aviso = r.warnings.find((w) => w.code === 'tf.capped')
    expect(aviso.params).toMatchObject({ rise: '60', half: 30, height: 100, cap: 120, min: '60' })
    // sem tecto, sobe tudo e não há aviso
    const livre = terrainFollowLines({ elevationAt, resolutionM: 10 }, [linha], {
      agl: 100,
      refElev: 100,
    })
    expect(livre.waypoints.every((w) => w[2] === 160)).toBe(true)
    expect(livre.warnings).toEqual([])
  })

  test('valores inválidos: referência e altura a zero, tolerância zero guarda todos os pontos', () => {
    const elevationAt = (lon) => 100 + 0.05 * xOf(lon)
    const r = terrainFollowLines({ elevationAt, resolutionM: 10 }, [linha], {
      agl: Number.NaN,
      refElev: undefined,
      toleranceM: 0,
      stepM: -1,
      corridorM: 0,
    })
    // altura relativa = cota (referência 0, AGL 0); todos os pontos do passo
    // de meia resolução (5 m) ficam, sem simplificação
    expect(r.waypoints[0][2]).toBe(100)
    expect(r.waypoints.at(-1)[2]).toBe(115)
    expect(r.waypoints.length).toBeGreaterThanOrEqual(61)
    for (let i = 1; i < r.waypoints.length; i++)
      expect(xOf(r.waypoints[i][0]) - xOf(r.waypoints[i - 1][0])).toBeLessThanOrEqual(5 + 1e-6)
    // e abaixo do mínimo recomendado em lado nenhum: os 100 m de cota chegam
    expect(r.warnings).toEqual([])
    expect(MIN_SAFE_REL_M).toBe(20)
  })

  test('linhas degeneradas: um vértice inválido não se voa; um troço de 0 m é um ponto', () => {
    const r = terrainFollowLines(
      { elevationAt: () => 100 },
      [[em(0, 0), [Number.NaN, 39.5]], [em(50, 50), em(50, 50)], 'x'],
      { agl: 60, refElev: 100 },
    )
    expect(r.perLine).toEqual([0, 1, 0])
    expect(r.vertexIndex).toEqual([[], [0, 0], []])
    expect(r.waypoints).toEqual([[...em(50, 50), 60]])
  })
})

describe('plano médio da área (sugestões para encostas)', () => {
  const area = [em(0, 0), em(400, 0), em(400, 300), em(0, 300)]

  test('encosta a subir para leste a 10 %: inclinação de 5,7°, desce para oeste, curvas N-S', () => {
    const fit = fitSlopePlane({ elevationAt: (lon) => 100 + 0.1 * xOf(lon) }, area)
    expect(fit.slopeDeg).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 3)
    expect(fit.downhillAzimuthDeg).toBeCloseTo(270, 6)
    // curvas de nível norte-sul (0° ou 180°, a mesma direcção)
    const c = fit.contourAzimuthDeg
    expect(Math.min(c, 180 - c)).toBeCloseTo(0, 6)
    expect(fit.samples).toBe(144)
  })

  test('relevo com buracos: só os pontos com dados contam', () => {
    const metade = (lon) => (xOf(lon) < 200 ? 100 + 0.1 * xOf(lon) : null)
    const fit = fitSlopePlane({ elevationAt: metade }, area)
    expect(fit.samples).toBe(72)
    expect(fit.downhillAzimuthDeg).toBeCloseTo(270, 6)
  })

  test('faixa fina na diagonal: as amostras caem numa recta e não há plano (nem sugestão)', () => {
    // a grelha 12 × 12 da caixa só acerta nos pontos da diagonal; com o
    // limiar absoluto do pivô o arredondamento passava e o plano saía com
    // qualquer inclinação: 90° nesta rampa de 5,7°, 15° numa faixa de 1,2 km
    const rampa = { elevationAt: (lon) => 100 + 0.1 * xOf(lon) }
    const diagonal = (L, w) => [em(0, 0), em(w, 0), em(L, L - w), em(L, L), em(L - w, L), em(0, w)]
    expect(fitSlopePlane(rampa, diagonal(400, 30))).toBeNull()
    expect(fitSlopePlane(rampa, diagonal(1200, 40))).toBeNull()
    // mais larga, com pontos fora da diagonal: o plano certo
    const larga = fitSlopePlane(rampa, diagonal(400, 120))
    expect(larga.slopeDeg).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 3)
    expect(larga.downhillAzimuthDeg).toBeCloseTo(270, 6)
  })

  test('pouco relevo na área (menos de oito pontos) ou sem relevo: nenhuma sugestão', () => {
    const quaseSem = (lon, lat) => (xOf(lon) < 40 && yOf(lat) < 40 ? 100 : null)
    expect(fitSlopePlane({ elevationAt: quaseSem }, area)).toBeNull()
    expect(fitSlopePlane(null, area)).toBeNull()
    expect(fitSlopePlane({ elevationAt: () => 1 }, [em(0, 0), em(1, 1)])).toBeNull()
  })
})

describe('descarga do relevo global: falhas', () => {
  const TILE = 4
  const box = /** @type {[number, number, number, number]} */ ([-8.01, 39.49, -7.99, 39.51])
  const ok = async () => ({ ok: true, status: 200, blob: async () => ({}) })
  const bitmap = () =>
    vi.stubGlobal('createImageBitmap', async () => ({ width: TILE, height: TILE }))
  const canvas = (ctx) =>
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return ctx
        }
      },
    )
  const plano = {
    drawImage() {},
    getImageData: () => {
      const data = new Uint8ClampedArray(TILE * TILE * 4)
      for (let i = 0; i < data.length; i += 4) data.set([128, 0, 0, 255], i)
      return { data }
    },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('caixa inválida, sem fetch, sem createImageBitmap: erros com código', async () => {
    await expect(loadTerrain([0, 0, 1], { fetchImpl: ok })).rejects.toMatchObject({
      code: 'terrain.bbox-invalid',
    })
    await expect(loadTerrain([0, 0, 1, Number.NaN], { fetchImpl: ok })).rejects.toMatchObject({
      code: 'terrain.bbox-invalid',
    })
    await expect(loadTerrain(box, { fetchImpl: 'não', cacheStorage: null })).rejects.toMatchObject({
      code: 'terrain.unsupported',
      params: { d: 'fetch' },
    })
    // em Node não há createImageBitmap
    await expect(loadTerrain(box, { fetchImpl: ok, cacheStorage: null })).rejects.toMatchObject({
      code: 'terrain.unsupported',
      params: { d: 'createImageBitmap' },
    })
  })

  test('área grande de mais para o relevo global', async () => {
    bitmap()
    canvas(plano)
    await expect(
      loadTerrain([-9.5, 37, -6.2, 42], { fetchImpl: ok, cacheStorage: null }),
    ).rejects.toMatchObject({ code: 'terrain.too-large' })
  })

  test('tiles que respondem com erro HTTP, ou sem canvas para os ler: a descarga falha', async () => {
    bitmap()
    canvas(plano)
    const naoHa = async () => ({ ok: false, status: 404 })
    await expect(loadTerrain(box, { fetchImpl: naoHa, cacheStorage: null })).rejects.toMatchObject({
      code: 'terrain.download-failed',
    })
    // sem contexto 2d
    canvas(null)
    await expect(loadTerrain(box, { fetchImpl: ok, cacheStorage: null })).rejects.toMatchObject({
      code: 'terrain.download-failed',
    })
    // sem OffscreenCanvas nem document
    vi.stubGlobal('OffscreenCanvas', undefined)
    await expect(loadTerrain(box, { fetchImpl: ok, cacheStorage: null })).rejects.toMatchObject({
      code: 'terrain.download-failed',
    })
  })

  test('com tudo a funcionar: a cota nos tiles; fora deles ou sem coordenadas, nada', async () => {
    bitmap()
    canvas(plano)
    const t = await loadTerrain(box, { fetchImpl: ok, cacheStorage: null })
    expect(t.elevationAt(-8, 39.5)).toBeCloseTo(0, 6)
    expect(t.elevationAt(Number.NaN, 39.5)).toBeNull()
    expect(t.elevationAt(10, 39.5)).toBeNull()
  })
})
