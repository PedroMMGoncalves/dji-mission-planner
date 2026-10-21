/**
 * MDT local (src/utils/demFile.js) com GeoTIFFs sintéticos
 * (tests/lib/geotiff.mjs): cada erro de entrada com o seu código e a
 * mensagem que diz o que fazer, incluindo os TIFF estragados; a cota nos
 * centros dos píxeis, entre eles e na meia-célula da borda; os píxeis sem
 * dados (com o valor do cabeçalho em dupla precisão e a banda em float32, e o
 * sentinela enorme) que não contaminam a interpolação; as cotas em pés
 * convertidas para metros; a grelha reamostrada; o MDT em graus, com a margem
 * em metros convertida em cada eixo; as opções inválidas; a extensão do
 * ficheiro inteiro e o nome por omissão.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import proj4 from 'proj4'
import { loadDemFromFile, projectBox, resolveRasterCrs } from '../../src/utils/demFile.js'
import { CRS_OPTIONS } from '../../src/utils/importArea.js'
import { makeFloatTiff } from '../lib/geotiff.mjs'

// o GeoTIFF lê-se com o FileReader do browser: o mesmo adaptador sobre
// Blob.arrayBuffer() que o teste dos ficheiros reais usa
beforeAll(() => {
  vi.stubGlobal(
    'FileReader',
    class {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then(
          (r) => {
            this.result = r
            this.onload?.({ target: this })
          },
          (e) => this.onerror?.(e),
        )
      }
      abort() {}
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

const PT_TM06 = CRS_OPTIONS.find((o) => o.code === 'EPSG:3763').def
const toWgs = (x, y) => proj4(PT_TM06, proj4.WGS84, [x, y])
const PT = { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3763 }

/** MDT em PT-TM06, 2 m por píxel, com origem em (−30000, 20000) e a rampa 100 + x + 10y. */
const dem = (o = {}) =>
  makeFloatTiff({
    width: 40,
    height: 30,
    originX: -30000,
    originY: 20000,
    scale: 2,
    valueAt: (x, y) => 100 + x + 10 * y,
    nodata: -9999,
    geoKeys: PT,
    ...o,
  })
/** Caixa WGS84 de uma janela em PT-TM06. */
const bboxFrom = (x0, y0, x1, y1) => {
  const a = toWgs(x0, y0)
  const b = toWgs(x1, y1)
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}
const area = bboxFrom(-30000, 20000, -29920, 19940)
/** Centro do píxel (i, j) em WGS84; com i ou j fraccionários, um ponto entre centros. */
const pixel = (i, j) => toWgs(-30000 + 2 * i + 1, 20000 - 2 * j - 1)
const codigo = async (p) => {
  try {
    await p
  } catch (err) {
    return { code: err.code, message: err.message }
  }
  return null
}
/** Reescreve as entradas do directório de etiquetas de um TIFF: fn(vista, posição, etiqueta). */
const alteraIfd = async (blob, fn) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const dv = new DataView(bytes.buffer)
  const ifd = dv.getUint32(4, true)
  for (let i = 0; i < dv.getUint16(ifd, true); i++) {
    const at = ifd + 2 + i * 12
    fn(dv, at, dv.getUint16(at, true))
  }
  return new Blob([bytes])
}

describe('erros de entrada: o código e o que fazer', () => {
  test('sem ficheiro, área inválida, ficheiro que não é TIFF', async () => {
    expect(await codigo(loadDemFromFile(null, area))).toMatchObject({ code: 'dem.file-invalid' })
    expect(await codigo(loadDemFromFile({ name: 'mdt.tif' }, area))).toMatchObject({
      code: 'dem.file-invalid',
    })
    for (const bbox of [null, [0, 0, 1], [0, 0, Number.NaN, 1]])
      expect(await codigo(loadDemFromFile(dem(), bbox))).toMatchObject({ code: 'dem.area-invalid' })
    // o que o operador lê: o que falhou e o passo seguinte
    const lixo = await codigo(loadDemFromFile(new Blob([new Uint8Array(64)]), area))
    expect(lixo.code).toBe('dem.open-failed')
    expect(lixo.message).toMatch(
      /^Não foi possível abrir o GeoTIFF \(.+\)\. Reexporte o MDT do SIG/,
    )
  })

  test('sem CRS nas GeoKeys, CRS fora da lista, raster rodado, fora da área', async () => {
    expect(
      await codigo(loadDemFromFile(dem({ geoKeys: { GTModelTypeGeoKey: 1 } }), area)),
    ).toMatchObject({
      code: 'dem.no-crs',
    })
    expect(
      await codigo(
        loadDemFromFile(
          dem({ geoKeys: { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 32633 } }),
          area,
        ),
      ),
    ).toMatchObject({ code: 'dem.crs-unsupported', message: expect.stringContaining('32633') })
    const rodado = dem({
      transform: [2, 0.5, 0, -30000, 0.5, -2, 0, 20000, 0, 0, 0, 0, 0, 0, 0, 1],
    })
    expect(await codigo(loadDemFromFile(rodado, area, { marginM: 0 }))).toMatchObject({
      code: 'dem.rotated',
    })
    expect(
      await codigo(
        loadDemFromFile(dem(), bboxFrom(200000, 200000, 200100, 200100), { marginM: 0 }),
      ),
    ).toMatchObject({ code: 'dem.outside-area' })
  })

  test('escala nula na matriz do ficheiro: recusado', async () => {
    const plano = dem({ transform: [0, 0, 0, -30000, 0, -2, 0, 20000, 0, 0, 0, 0, 0, 0, 0, 1] })
    expect(await codigo(loadDemFromFile(plano, area, { marginM: 0 }))).toMatchObject({
      code: 'dem.bad-scale',
    })
  })

  test('janela toda sem dados: recusada', async () => {
    const vazio = dem({ valueAt: () => -9999 })
    expect(await codigo(loadDemFromFile(vazio, area, { marginM: 0 }))).toMatchObject({
      code: 'dem.no-valid-values',
    })
  })

  test('TIFF estragado: sem píxeis, sem directório, sem matriz, compressão desconhecida, cortado', async () => {
    expect(await codigo(loadDemFromFile(dem({ width: 0 }), area))).toMatchObject({
      code: 'dem.no-pixels',
    })
    // cabeçalho válido, mas o directório de etiquetas fica para lá do fim do ficheiro
    const cabecalho = new DataView(new ArrayBuffer(16))
    cabecalho.setUint16(0, 0x4949, true)
    cabecalho.setUint16(2, 42, true)
    cabecalho.setUint32(4, 4096, true)
    const ilegivel = await codigo(loadDemFromFile(new Blob([cabecalho.buffer]), area))
    expect(ilegivel.code).toBe('dem.unreadable')
    expect(ilegivel.message).toMatch(/^GeoTIFF ilegível \(.+\)\. Reexporte o MDT do SIG/)
    // sem a escala nem o ponto de amarração (passam a etiquetas desconhecidas)
    const desconhecidas = { 33550: 65000, 33922: 65001 }
    const semMatriz = await alteraIfd(dem(), (dv, at, tag) => {
      if (tag in desconhecidas) dv.setUint16(at, desconhecidas[tag], true)
    })
    expect(await codigo(loadDemFromFile(semMatriz, area))).toMatchObject({
      code: 'dem.not-georeferenced',
    })
    // compressão que o leitor não conhece e píxeis cortados a meio: o motivo entre parênteses
    const comp99 = await alteraIfd(dem(), (dv, at, tag) => {
      if (tag === 259) dv.setUint16(at + 8, 99, true)
    })
    const bytes = await dem().arrayBuffer()
    const cortado = new Blob([bytes.slice(0, bytes.byteLength - 2000)])
    for (const f of [comp99, cortado]) {
      const e = await codigo(loadDemFromFile(f, area, { marginM: 0 }))
      expect(e.code).toBe('dem.read-failed')
      expect(e.message).toMatch(/^Falha ao ler os píxeis do MDT \(.+\)\. Reexporte o MDT do SIG/)
    }
  })
})

describe('CRS e projecção da caixa', () => {
  test('o projectado tem precedência; geográficos 3D também contam como graus', () => {
    expect(
      resolveRasterCrs({ ProjectedCSTypeGeoKey: 3763, GeographicTypeGeoKey: 4326 }),
    ).toMatchObject({
      crsCode: 'EPSG:3763',
      geographic: false,
    })
    for (const code of [4326, 4258, 4979, 4937])
      expect(resolveRasterCrs({ GeographicTypeGeoKey: code })).toEqual({
        crsCode: `EPSG:${code}`,
        geographic: true,
        def: null,
      })
    expect(() => resolveRasterCrs(null)).toThrow(expect.objectContaining({ code: 'dem.no-crs' }))
  })

  test('projectBox ignora os pontos fora do domínio e os que não são números', () => {
    // metade da caixa fora do domínio (a < 5 lança), a outra metade dá NaN em parte
    const box = projectBox([0, 0, 10, 10], (a, b) => {
      if (a < 5) throw new Error('fora')
      return b > 8 ? [Number.NaN, b] : [a, b]
    })
    expect(box[0]).toBeGreaterThanOrEqual(5)
    expect(box[3]).toBeLessThanOrEqual(8)
    expect(() => projectBox([0, 0, 1, 1], () => null)).toThrow(
      expect.objectContaining({ code: 'dem.project-failed' }),
    )
    // passos inválidos: pelo menos um por aresta
    expect(projectBox([0, 0, 10, 20], (a, b) => [a, b], 0)).toEqual([0, 0, 10, 20])
  })
})

describe('cotas lidas', () => {
  test('no centro de um píxel o valor dele; entre dois, a média; fora ou sem coordenadas, nada', async () => {
    const out = await loadDemFromFile(dem(), area, { marginM: 0 })
    expect(out.elevationAt(...pixel(5, 3))).toBeCloseTo(135, 3)
    expect(out.elevationAt(...pixel(5.5, 3))).toBeCloseTo(135.5, 2)
    expect(out.elevationAt(...toWgs(-50000, 50000))).toBeNull()
    expect(out.elevationAt(Number.NaN, 39)).toBeNull()
  })

  test('na meia-célula da borda, o valor do píxel da borda; para lá dela, nada', async () => {
    const out = await loadDemFromFile(dem(), area, { marginM: 0 })
    // entre a borda e o primeiro centro só há um vizinho: o valor dele, sem extrapolar
    expect(out.elevationAt(...pixel(-0.25, 3))).toBeCloseTo(130, 3)
    expect(out.elevationAt(...pixel(39.25, 3))).toBeCloseTo(169, 3)
    expect(out.elevationAt(...pixel(5, -0.25))).toBeCloseTo(105, 3)
    expect(out.elevationAt(...pixel(5, 29.25))).toBeCloseTo(395, 3)
    expect(out.elevationAt(...pixel(-0.75, 3))).toBeNull()
    expect(out.elevationAt(...pixel(39.75, 3))).toBeNull()
  })

  test('reamostrado (lado máximo 10): no sítio de cada amostra, o píxel nativo que ela leva', async () => {
    const out = await loadDemFromFile(dem(), area, { marginM: 0, maxDim: 10 })
    // 40 × 30 passa a 10 × 8: uma amostra por 4 colunas e por 3,75 linhas
    expect([out.width, out.height]).toEqual([10, 8])
    expect(out.nativeResolutionM).toBeCloseTo(2, 6)
    expect(out.resolutionM).toBeCloseTo((8 + 7.5) / 2, 6)
    // a amostra (j, k) leva o píxel nativo (round(4j), round(3,75k)) e fica em
    // (4j + 0,5; 3,75k + 0,5), em píxeis nativos: a (2, 2) é o píxel (8, 8) e
    // a (5, 3) o (20, 11); meia amostra de desvio dava outra cota
    const nativo = (fx, fy) => toWgs(-30000 + 2 * fx, 20000 - 2 * fy)
    expect(out.elevationAt(...nativo(8.5, 8))).toBeCloseTo(188, 3)
    expect(out.elevationAt(...nativo(20.5, 11.75))).toBeCloseTo(230, 3)
  })

  test('sem dados ao lado: a interpolação só conta os vizinhos válidos', async () => {
    // a coluna 6 sem dados e um bloco 3 × 3 sem dados à volta do píxel (20, 10)
    const buraco = (x, y) => x === 6 || (Math.abs(x - 20) <= 1 && Math.abs(y - 10) <= 1)
    const comBuraco = dem({ valueAt: (x, y) => (buraco(x, y) ? -9999 : 100 + x + 10 * y) })
    const out = await loadDemFromFile(comBuraco, area, { marginM: 0 })
    // de cada lado da coluna fica o valor do vizinho válido, nunca puxado para o −9999
    expect(out.elevationAt(...pixel(5.5, 3))).toBeCloseTo(135, 3)
    expect(out.elevationAt(...pixel(5.75, 3))).toBeCloseTo(135, 3)
    expect(out.elevationAt(...pixel(6.25, 3))).toBeCloseTo(137, 3)
    // no meio do bloco faltam os quatro vizinhos: nada
    expect(out.elevationAt(...pixel(20.25, 10.25))).toBeNull()
  })

  test('valor sem dados com casas decimais (float32 contra dupla precisão) e sentinela enorme', async () => {
    // −9999.99 não é exacto em float32: a banda traz −9999.990234375 e o
    // cabeçalho −9999.99; a diferença (2e-4) não cabe numa tolerância fixa de
    // 1e-6, só na relativa. (Um "0.1" não serve aqui: o escritor de TIFF dos
    // testes põe o texto sempre fora da entrada, e um valor de 4 bytes com o
    // terminador é lido de dentro dela.)
    expect(Math.fround(-9999.99)).not.toBe(-9999.99)
    const decimal = dem({
      valueAt: (x, y) => (x < 3 ? -9999.99 : 100 + x + 10 * y),
      nodata: -9999.99,
    })
    const out = await loadDemFromFile(decimal, area, { marginM: 0 })
    expect(out.elevationAt(...pixel(1, 3))).toBeNull()
    expect(out.elevationAt(...pixel(10, 3))).toBeCloseTo(140, 3)
    const enorme = dem({ valueAt: (x, y) => (x < 3 ? -3.4e38 : 100 + x + 10 * y), nodata: null })
    const out2 = await loadDemFromFile(enorme, area, { marginM: 0 })
    expect(out2.elevationAt(...pixel(1, 3))).toBeNull()
  })

  test('cotas em pés: passam a metros, uma única vez', async () => {
    const pes = dem({ geoKeys: { ...PT, VerticalCSTypeGeoKey: 5773, VerticalUnitsGeoKey: 9002 } })
    const out = await loadDemFromFile(pes, area, { marginM: 0 })
    expect(out.verticalDatum).toMatchObject({ unitLabel: 'ft', model: 'EGM96' })
    expect(out.elevationAt(...pixel(5, 3))).toBeCloseTo(135 * 0.3048, 3)
  })

  test('opções inválidas: lado máximo e margem de omissão; nome e extensão do ficheiro', async () => {
    const out = await loadDemFromFile(dem(), area, { maxDim: Number.NaN, marginM: -100 })
    // a janela inteira (40 × 30), sem reamostragem nem margem a mais
    expect(out.width).toBe(40)
    expect(out.height).toBe(30)
    expect(out.resolutionM).toBeCloseTo(2, 6)
    expect(out.label).toBe('MDT')
    // a extensão do ficheiro todo, em WGS84 (80 × 60 m): os extremos dos
    // quatro cantos (a quadrícula do PT-TM06 não segue os meridianos)
    const cantos = [
      [-30000, 19940],
      [-30000, 20000],
      [-29920, 19940],
      [-29920, 20000],
    ].map(([x, y]) => toWgs(x, y))
    const lons = cantos.map((c) => c[0])
    const lats = cantos.map((c) => c[1])
    const [w, s, e, n] = out.fileBbox
    expect(w).toBeCloseTo(Math.min(...lons), 7)
    expect(s).toBeCloseTo(Math.min(...lats), 7)
    expect(e).toBeCloseTo(Math.max(...lons), 7)
    expect(n).toBeCloseTo(Math.max(...lats), 7)
    // um ficheiro com nome leva-o
    const comNome = new File([await dem().arrayBuffer()], 'mdt_dgt.tif')
    expect((await loadDemFromFile(comNome, area, { marginM: 0 })).label).toBe('mdt_dgt.tif')
  })

  test('lado máximo acima do tecto (8192): fica no tecto, sem reamostrar uma janela pequena', async () => {
    const out = await loadDemFromFile(dem(), area, { marginM: 0, maxDim: 100000 })
    expect(out.width).toBe(40)
    const um = await loadDemFromFile(dem(), area, { marginM: 0, maxDim: 0.4 })
    // abaixo de 1 píxel conta o de omissão (2048): também sem reamostrar
    expect(um.width).toBe(40)
  })
})

describe('MDT em graus (EPSG:4326)', () => {
  // píxeis de 1/1024 de grau (potência de 2): os centros caem em números exactos
  const P = 1 / 1024
  const graus = () =>
    makeFloatTiff({
      width: 16,
      height: 12,
      originX: -8.5,
      originY: 39.5,
      scale: P,
      valueAt: (x, y) => (x === 9 && y === 5 ? -9999 : 200 + x + 10 * y),
      nodata: -9999,
      geoKeys: { GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326 },
    })
  /** Centro do píxel (i, j), em graus. */
  const c = (i, j) => [-8.5 + (i + 0.5) * P, 39.5 - (j + 0.5) * P]
  /** Caixa, em graus, das colunas [i0, i1[ e das linhas [j0, j1[. */
  const caixa = (i0, j0, i1, j1) => [-8.5 + i0 * P, 39.5 - j1 * P, -8.5 + i1 * P, 39.5 - j0 * P]

  test('resolução em metros e caixa em graus; no centro exacto, o valor do píxel', async () => {
    const out = await loadDemFromFile(graus(), caixa(0, 0, 16, 12), { marginM: 0 })
    expect(out).toMatchObject({ crsCode: 'EPSG:4326', width: 16, height: 12 })
    expect(out.bbox).toEqual(caixa(0, 0, 16, 12))
    // a média de 83,8 m por píxel em longitude (a 39,5° de latitude) e 108,6 m em latitude
    expect(out.resolutionM).toBeCloseTo(96.19, 2)
    expect(out.nativeResolutionM).toBe(out.resolutionM)
    expect(out.elevationAt(...c(3, 4))).toBe(243)
    // no centro de um píxel sem dados só ele pesa: nada; ao lado, o vizinho mais perto
    expect(out.elevationAt(...c(9, 5))).toBeNull()
    expect(out.elevationAt(...c(8.9, 5))).toBeCloseTo(258, 9)
    expect(out.elevationAt(...c(9.1, 5))).toBeCloseTo(260, 9)
  })

  test('a margem em metros passa a graus em cada eixo', async () => {
    const meio = caixa(6, 4, 10, 8)
    const sem = await loadDemFromFile(graus(), meio, { marginM: 0 })
    expect([sem.width, sem.height]).toEqual([4, 4])
    // 200 m são 2,4 píxeis em longitude e 1,8 em latitude: mais 3 e mais 2 de cada lado
    const com = await loadDemFromFile(graus(), meio, { marginM: 200 })
    expect([com.width, com.height]).toEqual([10, 8])
    expect(com.bbox).toEqual(caixa(3, 2, 13, 10))
  })
})
