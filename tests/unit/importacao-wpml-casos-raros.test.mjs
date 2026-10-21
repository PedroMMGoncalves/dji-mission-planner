/**
 * Importação de missões .kmz, casos raros (src/utils/importWpml.js). A ida e
 * volta com os exportadores reais está no smoke-test-io; aqui ficam as
 * combinações que os ficheiros do comando trazem e que nenhum teste via: as
 * recusas com o seu código; Placemarks sem geometria (POI) e coordenadas
 * com lixo; índices só em parte dos waypoints e repetidos; medianas com um
 * número par de valores; os dados repartidos entre a rota (waylines.wpml) e
 * o molde (template.kml), nos dois sentidos; o nome da missão quando falta;
 * a entrada preferida quando o ZIP traz duas rotas; e os waypoints quase
 * alinhados numa diagonal, que dariam uma lâmina em vez de uma área.
 */
import JSZip from 'jszip'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { parseWpmlKmz } from '../../src/utils/importWpml.js'

// o leitor usa o DOMParser do browser
beforeAll(() => {
  vi.stubGlobal(
    'DOMParser',
    class extends XmlDomParser {
      constructor() {
        super({ onError: () => {} })
      }
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

const lat0 = 39.5
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
const em = (x, y) => [-8.5 + x / mLon, lat0 + y / 110574]
const quadrado = [em(0, 0), em(100, 0), em(100, 100), em(0, 100)]

const kml = (corpo) =>
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" ` +
  `xmlns:wpml="http://www.dji.com/wpmz/1.0.2"><Document>${corpo}</Document></kml>`
/** Placemark de um waypoint; só leva as etiquetas dadas. */
const pm = ([lon, lat], { index, h, tagH = 'executeHeight', v } = {}) =>
  `<Placemark><Point><coordinates>${lon},${lat}</coordinates></Point>` +
  (index != null ? `<wpml:index>${index}</wpml:index>` : '') +
  (h != null ? `<wpml:${tagH}>${h}</wpml:${tagH}>` : '') +
  (v != null ? `<wpml:waypointSpeed>${v}</wpml:waypointSpeed>` : '') +
  '</Placemark>'
const pasta = (conteudo) => `<Folder>${conteudo}</Folder>`
/** KMZ com as entradas dadas ({ caminho: texto }). */
const kmz = async (entradas) => {
  const zip = new JSZip()
  for (const [nome, texto] of Object.entries(entradas)) zip.file(nome, texto)
  return zip.generateAsync({ type: 'uint8array' })
}
const rotaQuadrada = (extra = '') =>
  kml(pasta(`${extra}${quadrado.map((p, i) => pm(p, { index: i, h: 60 })).join('')}`))
const codigo = async (p) => {
  try {
    await p
  } catch (err) {
    return { code: err.code, message: err.message }
  }
  return null
}

describe('recusas: o código e a mensagem que o operador lê', () => {
  test('ZIP ilegível, sem missão, XML partido, sem waypoints, poucos waypoints', async () => {
    expect(await codigo(parseWpmlKmz(new Uint8Array([1, 2, 3, 4])))).toMatchObject({
      code: 'wpml.unreadable',
    })
    expect(await codigo(parseWpmlKmz(await kmz({ 'leiame.txt': 'nada' })))).toMatchObject({
      code: 'wpml.not-mission',
    })
    const partido = await kmz({ 'wpmz/waylines.wpml': '<kml><Document></kml>' })
    expect(await codigo(parseWpmlKmz(partido))).toMatchObject({ code: 'wpml.xml-invalid' })
    const vazio = await kmz({ 'wpmz/waylines.wpml': kml(pasta('')) })
    expect(await codigo(parseWpmlKmz(vazio))).toMatchObject({ code: 'wpml.no-coordinates' })
    const dois = await kmz({
      'wpmz/waylines.wpml': kml(pasta(pm(quadrado[0]) + pm(quadrado[1]))),
    })
    expect(await codigo(parseWpmlKmz(dois))).toMatchObject({ code: 'wpml.too-few-waypoints' })
  })

  test('alturas absolutas declaradas só no molde: recusadas, com o referencial na mensagem', async () => {
    const molde = kml(
      pasta(
        '<wpml:waylineCoordinateSysParam><wpml:heightMode>EGM96</wpml:heightMode>' +
          '</wpml:waylineCoordinateSysParam>',
      ),
    )
    // a rota não diz o referencial: vale o do molde
    const ficheiro = await kmz({
      'wpmz/template.kml': molde,
      'wpmz/waylines.wpml': kml(pasta(quadrado.map((p) => pm(p, { h: 60 })).join(''))),
    })
    const erro = await codigo(parseWpmlKmz(ficheiro))
    expect(erro.code).toBe('wpml.height-mode')
    expect(erro.message).toContain('EGM96')
  })
})

describe('waypoints lidos', () => {
  test('Placemarks sem geometria ficam de fora; de um bloco de coordenadas vale o primeiro par legível', async () => {
    const poi = '<Placemark><name>POI</name><wpml:index>9</wpml:index></Placemark>'
    const vazio = '<Placemark><Point><coordinates>  </coordinates></Point></Placemark>'
    const lixo = `<Placemark><Point><coordinates>a,b ${quadrado[3][0]},${quadrado[3][1]},70</coordinates></Point></Placemark>`
    const rota = kml(
      pasta(
        poi +
          quadrado
            .slice(0, 3)
            .map((p) => pm(p))
            .join('') +
          vazio +
          lixo,
      ),
    )
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': rota }))
    expect(out.waypointCount).toBe(4)
    expect(out.waypoints).toEqual(quadrado)
  })

  test('índice em falta num waypoint: vale a ordem do documento; índices repetidos desempatam por ela', async () => {
    const [a, b, c, d] = quadrado
    // o índice em falta não é o índice 0: o waypoint não salta para o início
    const parcial = kml(
      pasta(pm(c, { index: 2 }) + pm(a) + pm(b, { index: 1 }) + pm(d, { index: 3 })),
    )
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': parcial }))
    expect(out.waypoints).toEqual([c, a, b, d])
    const repetidos = kml(
      pasta(pm(d, { index: 1 }) + pm(a, { index: 0 }) + pm(b, { index: 0 }) + pm(c, { index: 2 })),
    )
    const out2 = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': repetidos }))
    expect(out2.waypoints).toEqual([a, b, d, c])
  })

  test('etiquetas vazias contam como ausentes, não como zero', async () => {
    // o texto vazio dava o número 0: a velocidade do Folder vazia passava por
    // 0 m/s e tapava a dos waypoints, duas alturas vazias puxavam a mediana
    // para metade e um índice vazio mandava o waypoint para o início
    const [a, b, c, d] = quadrado
    const cru = ([lon, lat], interior) =>
      `<Placemark><Point><coordinates>${lon},${lat}</coordinates></Point>${interior}</Placemark>`
    const v4 = '<wpml:waypointSpeed>4</wpml:waypointSpeed>'
    const rota = kml(
      pasta(
        '<wpml:autoFlightSpeed></wpml:autoFlightSpeed>' +
          cru(a, `<wpml:index>0</wpml:index><wpml:executeHeight></wpml:executeHeight>${v4}`) +
          cru(b, `<wpml:index>1</wpml:index><wpml:executeHeight> </wpml:executeHeight>${v4}`) +
          cru(c, `<wpml:index>2</wpml:index><wpml:executeHeight>60</wpml:executeHeight>${v4}`) +
          cru(d, `<wpml:index></wpml:index><wpml:executeHeight>60</wpml:executeHeight>${v4}`),
      ),
    )
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': rota }))
    expect(out.speed).toBe(4)
    expect(out.altitude).toBe(60)
    expect(out.waypoints).toEqual([a, b, c, d])
  })

  test('alturas e velocidades diferentes, em número par: a média das duas do meio', async () => {
    const alturas = [100, 130, 110, 120]
    const velocidades = [3, 9, 5, 7]
    const rota = kml(
      pasta(quadrado.map((p, i) => pm(p, { index: i, h: alturas[i], v: velocidades[i] })).join('')),
    )
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': rota }))
    expect(out.altitude).toBe(115)
    expect(out.speed).toBe(6)
  })

  test('sem velocidade nem altura em lado nenhum: ficam a null, e o anel continua a sair', async () => {
    const rota = kml(pasta(quadrado.map((p) => pm(p)).join('')))
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': rota }))
    expect(out).toMatchObject({
      altitude: null,
      speed: null,
      heightMode: null,
      droneEnumValue: null,
    })
    expect(out.ring).toHaveLength(4)
  })
})

describe('dados repartidos entre a rota e o molde', () => {
  const missionConfig =
    '<wpml:missionConfig>' +
    '<wpml:droneInfo><wpml:droneEnumValue>99</wpml:droneEnumValue>' +
    '<wpml:droneSubEnumValue>1</wpml:droneSubEnumValue></wpml:droneInfo>' +
    '<wpml:payloadInfo><wpml:payloadEnumValue>89</wpml:payloadEnumValue>' +
    '<wpml:payloadSubEnumValue>2</wpml:payloadSubEnumValue></wpml:payloadInfo>' +
    '</wpml:missionConfig>'
  const sistema =
    '<wpml:waylineCoordinateSysParam><wpml:heightMode>relativeToStartPoint</wpml:heightMode>' +
    '</wpml:waylineCoordinateSysParam>'
  // a rota só com as coordenadas e os índices
  const rotaNua = kml(pasta(quadrado.map((p, i) => pm(p, { index: i })).join('')))

  test('a rota só com coordenadas: referencial, alturas, velocidade, enums e nome vêm do molde', async () => {
    const molde = kml(
      `<name>Quinta norte</name>${missionConfig}` +
        pasta(
          `<wpml:autoFlightSpeed>6.5</wpml:autoFlightSpeed>${sistema}` +
            quadrado.map((p, i) => pm(p, { index: i, h: 80, tagH: 'height' })).join(''),
        ),
    )
    const out = await parseWpmlKmz(
      await kmz({ 'wpmz/template.kml': molde, 'wpmz/waylines.wpml': rotaNua }),
    )
    expect(out).toMatchObject({
      waypointCount: 4,
      altitude: 80,
      speed: 6.5,
      name: 'Quinta norte',
      heightMode: 'relativeToStartPoint',
      droneEnumValue: 99,
      droneSubEnumValue: 1,
      payloadEnumValue: 89,
      payloadSubEnumValue: 2,
    })
  })

  test('o molde sem alturas por waypoint: a altura global dele; sem velocidade do Folder: a mediana das dele', async () => {
    const velocidades = [4, 6, 6, 4]
    const molde = kml(
      pasta(
        `${sistema}<wpml:globalHeight>90</wpml:globalHeight>` +
          quadrado.map((p, i) => pm(p, { index: i, v: velocidades[i] })).join(''),
      ),
    )
    const out = await parseWpmlKmz(
      await kmz({ 'wpmz/template.kml': molde, 'wpmz/waylines.wpml': rotaNua }),
    )
    expect(out.altitude).toBe(90)
    expect(out.speed).toBe(5)
  })

  test('a rota sem waypoints: vale a do molde, e a velocidade vem da rota', async () => {
    const rotaVazia = kml(pasta('<wpml:autoFlightSpeed>9</wpml:autoFlightSpeed>'))
    const molde = kml(
      pasta(quadrado.map((p, i) => pm(p, { index: i, h: 70, tagH: 'height' })).join('')),
    )
    const out = await parseWpmlKmz(
      await kmz({ 'wpmz/template.kml': molde, 'wpmz/waylines.wpml': rotaVazia }),
    )
    expect(out).toMatchObject({ waypointCount: 4, altitude: 70, speed: 9 })
  })
})

describe('nome da missão e entrada escolhida', () => {
  test('sem nome no molde: o da pasta da rota; sem nenhum, o do ficheiro sem a extensão', async () => {
    const comPasta = kml(pasta(`<name>Rota da pasta</name>${quadrado.map((p) => pm(p)).join('')}`))
    expect((await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': comPasta }))).name).toBe(
      'Rota da pasta',
    )
    const semNome = await kmz({
      'wpmz/waylines.wpml': kml(pasta(quadrado.map((p) => pm(p)).join(''))),
    })
    const nomeDe = async (nome) => (await parseWpmlKmz(new File([semNome], nome))).name
    expect(await nomeDe('Rota 7.KMZ')).toBe('Rota 7')
    expect(await nomeDe('copia.zip')).toBe('copia')
    // um ficheiro que só tem a extensão, ou um nome em branco, não dá nome
    expect(await nomeDe('.kmz')).toBeNull()
    expect(await nomeDe('   ')).toBeNull()
    expect((await parseWpmlKmz(semNome)).name).toBeNull()
  })

  test('duas rotas no ZIP: a de wpmz/ ganha, sem olhar a maiúsculas', async () => {
    const outra = kml(pasta([em(500, 500), em(600, 500), em(600, 600)].map((p) => pm(p)).join('')))
    const ficheiro = await kmz({
      'copia/waylines.wpml': outra,
      'WPMZ/WAYLINES.WPML': rotaQuadrada(),
    })
    const out = await parseWpmlKmz(ficheiro)
    expect(out.waypoints).toEqual(quadrado)
    expect(out.altitude).toBe(60)
  })
})

describe('área reconstruída', () => {
  test('waypoints quase alinhados numa diagonal: o rectângulo com 20 m de folga, não uma lâmina', async () => {
    // cinco pontos a 45°, com um centímetro de desvio alternado
    const diagonal = [0, 1, 2, 3, 4].map((i) => em(20 * i, 20 * i + (i % 2) * 0.01))
    const rota = kml(pasta(diagonal.map((p) => pm(p)).join('')))
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': rota }))
    expect(out.ring).toHaveLength(4)
    const lons = out.ring.map((p) => p[0])
    const lats = out.ring.map((p) => p[1])
    const lon = diagonal.map((p) => p[0])
    const lat = diagonal.map((p) => p[1])
    expect((Math.min(...lon) - Math.min(...lons)) * mLon).toBeCloseTo(20, 0)
    expect((Math.max(...lons) - Math.max(...lon)) * mLon).toBeCloseTo(20, 0)
    expect((Math.min(...lat) - Math.min(...lats)) * 110574).toBeCloseTo(20, 0)
    expect((Math.max(...lats) - Math.max(...lat)) * 110574).toBeCloseTo(20, 0)
  })

  test('um quadrado: o invólucro são os próprios cantos, sem o vértice de fecho', async () => {
    const out = await parseWpmlKmz(await kmz({ 'wpmz/waylines.wpml': rotaQuadrada() }))
    expect(out.ring).toHaveLength(4)
    for (const p of quadrado) expect(out.ring).toContainEqual(p)
  })
})
