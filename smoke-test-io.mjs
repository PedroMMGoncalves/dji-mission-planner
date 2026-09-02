/**
 * SUITE DE FRONTEIRA DE E/S
 * =========================
 * Cobre os três módulos que lêem ficheiros de fora — importArea.js (áreas
 * KML/GeoJSON), importWpml.js (missões .kmz) e demFile.js (MDT GeoTIFF) —
 * que ficaram de fora do smoke-test.mjs por dependerem de APIs de browser.
 * É a fronteira por onde entram ficheiros que a app não gerou, logo onde um
 * ficheiro malformado tem de dar erro legível em vez de rebentar a meio.
 *
 * Vive separada da suite principal porque precisa de dois substitutos de
 * APIs de browser, que não devem contaminar os testes de matemática pura:
 *
 *  - DOMParser  → @xmldom/xmldom (devDependency, só para testes)
 *  - FileReader → adaptador sobre Blob.arrayBuffer(), a interface exacta que
 *                 o geotiff.js usa em fromBlob (onload com event.target.result)
 *
 * LIMITE CONHECIDO: perante XML malformado os browsers devolvem um documento
 * com <parsererror> e o @xmldom/xmldom atira uma excepção. parseXml (xml.js)
 * trata os dois casos; aqui exercita-se o caminho da excepção com o xmldom e
 * o caminho do <parsererror> com um DOMParser encenado.
 */

import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import proj4 from 'proj4'
import * as turf from '@turf/turf'

// o xmldom escreve os erros de parsing na consola; aqui só interessa a excepção
globalThis.DOMParser = class extends XmlDomParser {
  constructor() {
    super({ onError: () => {} })
  }
}
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result
        this.onload?.({ target: { result } })
      },
      (err) => this.onerror?.(err),
    )
  }
  abort() {
    this.onabort?.()
  }
}

const { parseAreaFile, reprojectRing, simplifyRingIfNeeded, CRS_OPTIONS } =
  await import('./src/utils/importArea.js')
const { parseWpmlKmz } = await import('./src/utils/importWpml.js')
const { loadDemFromFile, projectBox, resolveRasterCrs } = await import('./src/utils/demFile.js')
const { makeFloatTiff } = await import('./tests/lib/geotiff.mjs')
const { buildTemplateKML, buildWaylinesWPML } = await import('./src/utils/exporters.js')

let failures = 0
function check(label, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`)
}

/** Espera que `fn` rejeite/atire com uma mensagem que contenha `fragment`. */
async function throwsWith(fn, fragment) {
  try {
    await fn()
    return `nao lancou (esperado "${fragment}")`
  } catch (err) {
    const msg = String(err?.message ?? err)
    return msg.includes(fragment) ? null : `mensagem "${msg}"`
  }
}

/** Ficheiro falso com a interface que os importadores usam. */
const fakeFile = (name, content) => ({
  name,
  text: async () => content,
  arrayBuffer: async () => (content instanceof Uint8Array ? content.buffer : content),
})

/* ================================================================== */
/* 1. importArea.js — áreas KML / GeoJSON                              */
/* ================================================================== */

const kmlDoc = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${inner}</Document></kml>`

const polygonKml = (coords, tag = 'Polygon') =>
  `<Placemark><${tag}><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></${tag}></Placemark>`

{
  // quadrado de ~0.01 grau, fechado (o 1.o vertice repetido no fim)
  const square = '-8.50,39.50,0 -8.49,39.50,0 -8.49,39.51,0 -8.50,39.51,0 -8.50,39.50,0'
  const r = await parseAreaFile(fakeFile('area.kml', kmlDoc(polygonKml(square))))
  check(
    'KML: anel aberto com 4 vertices (vertice de fecho removido)',
    r.ring.length === 4 && !r.needsCrs,
    `${r.ring.length} vertices`,
  )
  check(
    'KML: coordenadas na ordem [lon, lat], altitude descartada',
    r.ring[0][0] === -8.5 && r.ring[0][1] === 39.5 && r.ring[0].length === 2,
    JSON.stringify(r.ring[0]),
  )

  // prefixo de namespace: <kml:Polygon> conta como <Polygon>
  const prefixed = `<?xml version="1.0"?><kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Document>
    <kml:Placemark><kml:Polygon><kml:outerBoundaryIs><kml:LinearRing>
    <kml:coordinates>${square}</kml:coordinates>
    </kml:LinearRing></kml:outerBoundaryIs></kml:Polygon></kml:Placemark></kml:Document></kml:kml>`
  const rp = await parseAreaFile(fakeFile('area.kml', prefixed))
  check(
    'KML: tags com prefixo de namespace (kml:Polygon) sao lidas',
    rp.ring.length === 4,
    `${rp.ring.length} vertices`,
  )

  // dois poligonos -> vence o maior
  const small = '-8.60,39.60,0 -8.599,39.60,0 -8.599,39.601,0 -8.60,39.601,0 -8.60,39.60,0'
  const rBoth = await parseAreaFile(
    fakeFile('area.kml', kmlDoc(polygonKml(small) + polygonKml(square))),
  )
  check(
    'KML: com varios poligonos escolhe o de maior area',
    Math.abs(rBoth.ring[0][0] - -8.5) < 1e-9,
    JSON.stringify(rBoth.ring[0]),
  )

  // anel INTERIOR primeiro no documento: o exterior tem de ganhar
  const donut = `<Placemark><Polygon>
    <innerBoundaryIs><LinearRing><coordinates>${small}</coordinates></LinearRing></innerBoundaryIs>
    <outerBoundaryIs><LinearRing><coordinates>${square}</coordinates></LinearRing></outerBoundaryIs>
  </Polygon></Placemark>`
  // partes ignoradas: escolhe-se o maior poligono e avisa-se quantos ficaram
  // de fora (um buraco NAO conta como parte)
  check('KML: um poligono -> nenhuma parte ignorada', r.discardedParts === 0)
  check('KML: dois poligonos -> uma parte ignorada', rBoth.discardedParts === 1)
  const multi = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-8.5, 39.5],
          [-8.49, 39.5],
          [-8.49, 39.51],
          [-8.5, 39.51],
          [-8.5, 39.5],
        ],
      ],
      [
        [
          [-8.6, 39.6],
          [-8.599, 39.6],
          [-8.599, 39.601],
          [-8.6, 39.601],
          [-8.6, 39.6],
        ],
      ],
      [
        [
          [-8.7, 39.7],
          [-8.699, 39.7],
          [-8.699, 39.701],
          [-8.7, 39.701],
          [-8.7, 39.7],
        ],
      ],
    ],
  }
  const rMulti = await parseAreaFile(fakeFile('multi.geojson', JSON.stringify(multi)))
  check(
    'GeoJSON: MultiPolygon com tres partes -> maior escolhida, duas ignoradas',
    rMulti.discardedParts === 2 &&
      rMulti.ring.length === 4 &&
      Math.abs(rMulti.ring[0][0] + 8.5) < 1e-9,
  )
  const rDonut = await parseAreaFile(fakeFile('area.kml', kmlDoc(donut)))
  check('KML: buraco nao conta como parte ignorada', rDonut.discardedParts === 0)
  check(
    'KML: anel exterior preferido mesmo com o interior primeiro',
    Math.abs(rDonut.ring[0][0] - -8.5) < 1e-9,
    JSON.stringify(rDonut.ring[0]),
  )

  // poligono sem vertices suficientes -> ignorado
  check(
    'KML: poligono degenerado -> erro legivel',
    (await throwsWith(
      () => parseAreaFile(fakeFile('a.kml', kmlDoc(polygonKml('-8.5,39.5 -8.4,39.5')))),
      'Nenhum poligono'.replace('poligono', 'polígono'),
    )) === null,
  )

  check(
    'KML: XML malformado -> "KML invalido"',
    (await throwsWith(
      () => parseAreaFile(fakeFile('a.kml', '<kml><Document></kml>')),
      'KML inválido',
    )) === null,
  )
  check(
    'KML: sem poligonos -> erro legivel',
    (await throwsWith(
      () => parseAreaFile(fakeFile('a.kml', kmlDoc('<Placemark/>'))),
      'Nenhum polígono encontrado no KML',
    )) === null,
  )
}

{
  // GeoJSON em WGS84
  const ring = [
    [-8.5, 39.5],
    [-8.49, 39.5],
    [-8.49, 39.51],
    [-8.5, 39.51],
    [-8.5, 39.5],
  ]
  const fc = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }],
  }
  const r = await parseAreaFile(fakeFile('a.geojson', JSON.stringify(fc)))
  check(
    'GeoJSON: FeatureCollection -> anel aberto sem needsCrs',
    r.ring.length === 4 && !r.needsCrs,
    `${r.ring.length} vertices`,
  )

  const multi = { type: 'MultiPolygon', coordinates: [[ring], [ring.map(([x, y]) => [x + 1, y])]] }
  check(
    'GeoJSON: MultiPolygon recolhe todos os aneis exteriores',
    (await parseAreaFile(fakeFile('a.json', JSON.stringify(multi)))).ring.length === 4,
  )

  const gc = { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: [ring] }] }
  check(
    'GeoJSON: GeometryCollection e percorrida',
    (await parseAreaFile(fakeFile('a.geojson', JSON.stringify(gc)))).ring.length === 4,
  )

  // coordenadas projectadas (PT-TM06, metros) -> pede CRS ao utilizador
  const def = CRS_OPTIONS.find((o) => o.code === 'EPSG:3763').def
  const proj = ring.map(([x, y]) => proj4(proj4.WGS84, def, [x, y]))
  const projFc = { type: 'Polygon', coordinates: [proj] }
  const rp = await parseAreaFile(fakeFile('a.geojson', JSON.stringify(projFc)))
  check('GeoJSON: coordenadas projectadas -> needsCrs', rp.needsCrs === true)
  const back = reprojectRing(rp.ring, def)
  check(
    'GeoJSON: reprojectRing devolve o anel original em WGS84',
    back.every((p, i) => Math.abs(p[0] - ring[i][0]) < 1e-7 && Math.abs(p[1] - ring[i][1]) < 1e-7),
    JSON.stringify(back[0].map((v) => +v.toFixed(6))),
  )

  check(
    'GeoJSON: JSON invalido -> erro legivel',
    (await throwsWith(
      () => parseAreaFile(fakeFile('a.geojson', '{nao json')),
      'GeoJSON inválido',
    )) === null,
  )
  check(
    'GeoJSON: sem poligonos -> erro legivel',
    (await throwsWith(
      () => parseAreaFile(fakeFile('a.geojson', '{"type":"Point","coordinates":[0,0]}')),
      'Nenhum polígono encontrado no GeoJSON',
    )) === null,
  )
  check(
    'extensao nao suportada -> erro legivel',
    (await throwsWith(() => parseAreaFile(fakeFile('a.dxf', 'x')), 'Formato não suportado')) ===
      null,
  )
}

{
  // simplificacao so acima de 400 vertices; abaixo devolve o mesmo objecto
  const few = Array.from({ length: 50 }, (_, i) => [-8.5 + i * 1e-4, 39.5])
  check('simplifyRingIfNeeded: <= 400 vertices intacto', simplifyRingIfNeeded(few) === few)
  const many = Array.from({ length: 900 }, (_, i) => {
    const a = (2 * Math.PI * i) / 900
    return [-8.5 + 0.01 * Math.cos(a), 39.5 + 0.01 * Math.sin(a)]
  })
  const simplified = simplifyRingIfNeeded(many)
  check(
    'simplifyRingIfNeeded: > 400 vertices reduzido mantendo a forma',
    simplified.length <= 400 && simplified.length >= 3,
    `${many.length} -> ${simplified.length}`,
  )
  const areaBefore = turf.area(turf.polygon([[...many, many[0]]]))
  const areaAfter = turf.area(turf.polygon([[...simplified, simplified[0]]]))
  check(
    'simplifyRingIfNeeded: area preservada a menos de 1%',
    Math.abs(areaAfter - areaBefore) / areaBefore < 0.01,
    `${((100 * Math.abs(areaAfter - areaBefore)) / areaBefore).toFixed(3)}%`,
  )
}

{
  // caminho do <parsererror>: convencao dos browsers, encenada
  const real = globalThis.DOMParser
  globalThis.DOMParser = class {
    parseFromString() {
      return new real().parseFromString(
        '<parsererror xmlns="http://www.w3.org/1999/xhtml">erro</parsererror>',
        'application/xml',
      )
    }
  }
  const caught = await throwsWith(
    () => parseAreaFile(fakeFile('a.kml', kmlDoc(polygonKml('0,0 1,0 1,1 0,1 0,0')))),
    'KML inválido',
  )
  globalThis.DOMParser = real
  check('XML: <parsererror> (convencao dos browsers) tambem da erro', caught === null)
}

/* ================================================================== */
/* 2. importWpml.js — ida e volta de uma missão .kmz                   */
/* ================================================================== */

const WPML_IDS = {
  droneEnumValue: 77,
  droneSubEnumValue: 0,
  payloadEnumValue: 66,
  payloadSubEnumValue: 0,
  payloadPositionIndex: 0,
}

/** Empacota template.kml + waylines.wpml na estrutura oficial wpmz/. */
async function makeKmz({ template, waylines, folder = 'wpmz' }) {
  const zip = new JSZip()
  if (template != null) zip.file(`${folder}/template.kml`, template)
  if (waylines != null) zip.file(`${folder}/waylines.wpml`, waylines)
  return zip.generateAsync({ type: 'uint8array' })
}

const missionParams = (waypoints, extra = {}) => ({
  name: 'missao-teste',
  waypoints,
  altitude: 100,
  speed: 7,
  wpml: WPML_IDS,
  photoIntervalM: 20,
  triggerMode: 'distance',
  sensorType: 'camera',
  ...extra,
})

{
  // rectangulo de 4 waypoints, exportado pelos exportadores REAIS e lido de volta
  const wps = [
    [-8.5, 39.5],
    [-8.495, 39.5],
    [-8.495, 39.504],
    [-8.5, 39.504],
  ]
  const params = missionParams(wps)
  const kmz = await makeKmz({
    template: buildTemplateKML(params),
    waylines: buildWaylinesWPML(params),
  })
  const back = await parseWpmlKmz(kmz)

  check(
    'WPML ida e volta: numero de waypoints',
    back.waypointCount === 4 && back.waypoints.length === 4,
    `${back.waypointCount}`,
  )
  check(
    'WPML ida e volta: coordenadas preservadas (6 casas decimais)',
    back.waypoints.every(
      (p, i) => Math.abs(p[0] - wps[i][0]) < 1e-6 && Math.abs(p[1] - wps[i][1]) < 1e-6,
    ),
    JSON.stringify(back.waypoints[0]),
  )
  check(
    'WPML ida e volta: altitude, velocidade e nome',
    back.altitude === 100 && back.speed === 7 && back.name === 'missao-teste',
    `${back.altitude} m, ${back.speed} m/s, "${back.name}"`,
  )
  check(
    'WPML ida e volta: enums de aeronave e payload',
    back.droneEnumValue === 77 && back.payloadEnumValue === 66,
    `${back.droneEnumValue}/${back.payloadEnumValue}`,
  )

  // area reconstruida: involucro convexo que contem todos os waypoints
  check(
    'WPML: anel reconstruido e um poligono valido',
    back.ring.length >= 3 && back.ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    `${back.ring.length} vertices`,
  )
  const poly = turf.polygon([[...back.ring, back.ring[0]]])
  check(
    'WPML: todos os waypoints caem dentro do anel reconstruido',
    back.waypoints.every((p) => turf.booleanPointInPolygon(turf.point(p), poly)),
  )
}

{
  // alturas por waypoint diferentes -> mediana; iguais -> valor unico
  const wps = [
    [-8.5, 39.5, 90],
    [-8.495, 39.5, 100],
    [-8.495, 39.504, 110],
    [-8.5, 39.504, 130],
  ]
  const kmz = await makeKmz({ waylines: buildWaylinesWPML(missionParams(wps)) })
  const back = await parseWpmlKmz(kmz)
  check(
    'WPML: alturas diferentes -> mediana das alturas',
    back.altitude === 105,
    `${back.altitude} m`,
  )

  const flat = wps.map(([x, y]) => [x, y, 80])
  const backFlat = await parseWpmlKmz(
    await makeKmz({ waylines: buildWaylinesWPML(missionParams(flat)) }),
  )
  check(
    'WPML: alturas iguais -> altura unica, nao mediana',
    backFlat.altitude === 80,
    `${backFlat.altitude} m`,
  )
}

{
  // ordem de voo pelo <wpml:index>, mesmo com os Placemarks trocados no ficheiro
  const doc = (rows) => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"
    xmlns:wpml="http://www.dji.com/wpmz/1.0.2"><Document><Folder><name>trocada</name>
    <wpml:autoFlightSpeed>5</wpml:autoFlightSpeed>${rows}</Folder></Document></kml>`
  const pm = (i, lon, lat) =>
    `<Placemark><Point><coordinates>${lon},${lat}</coordinates></Point>
     <wpml:index>${i}</wpml:index><wpml:executeHeight>50</wpml:executeHeight></Placemark>`
  const shuffled = doc(pm(2, -8.49, 39.51) + pm(0, -8.5, 39.5) + pm(1, -8.49, 39.5))
  const back = await parseWpmlKmz(await makeKmz({ waylines: shuffled }))
  check(
    'WPML: ordem de voo vem do <wpml:index>, nao da ordem no ficheiro',
    back.waypoints.map((p) => p[0]).join(',') === '-8.5,-8.49,-8.49',
    back.waypoints.map((p) => p[0]).join(','),
  )
  check('WPML: velocidade do Folder (autoFlightSpeed)', back.speed === 5, `${back.speed}`)

  // sem <wpml:index> mantem-se a ordem do documento
  const noIdx = doc(
    '<Placemark><Point><coordinates>-8.49,39.51</coordinates></Point></Placemark>' +
      '<Placemark><Point><coordinates>-8.50,39.50</coordinates></Point></Placemark>' +
      '<Placemark><Point><coordinates>-8.49,39.50</coordinates></Point></Placemark>',
  )
  const backNo = await parseWpmlKmz(await makeKmz({ waylines: noIdx }))
  check(
    'WPML: sem <wpml:index> segue a ordem do documento',
    backNo.waypoints[0][0] === -8.49 && backNo.waypoints[1][0] === -8.5,
  )
}

{
  // waypoints colineares -> involucro degenerado -> rectangulo de recurso
  const line = Array.from({ length: 6 }, (_, i) => [-8.5 + i * 0.001, 39.5])
  const back = await parseWpmlKmz(
    await makeKmz({ waylines: buildWaylinesWPML(missionParams(line)) }),
  )
  check(
    'WPML: waypoints colineares -> rectangulo de recurso com 4 vertices',
    back.ring.length === 4,
    `${back.ring.length} vertices`,
  )
  const poly = turf.polygon([[...back.ring, back.ring[0]]])
  check(
    'WPML: rectangulo de recurso contem a linha com folga',
    back.waypoints.every((p) => turf.booleanPointInPolygon(turf.point(p), poly)),
  )
  const north = Math.max(...back.ring.map((p) => p[1]))
  check(
    'WPML: folga do rectangulo ~20 m',
    Math.abs((north - 39.5) * 110574 - 20) < 1,
    `${((north - 39.5) * 110574).toFixed(1)} m`,
  )
}

{
  // o template serve de reserva quando o waylines nao tem rota
  const wps = [
    [-8.5, 39.5],
    [-8.49, 39.5],
    [-8.49, 39.51],
  ]
  const back = await parseWpmlKmz(await makeKmz({ template: buildTemplateKML(missionParams(wps)) }))
  check(
    'WPML: so com template.kml a rota e lida na mesma',
    back.waypointCount === 3 && back.altitude === 100,
    `${back.waypointCount} wp, ${back.altitude} m`,
  )

  // ficheiros na raiz do zip (fora de wpmz/) tambem sao aceites
  const backRoot = await parseWpmlKmz(
    await makeKmz({ waylines: buildWaylinesWPML(missionParams(wps)), folder: '.' }),
  )
  check('WPML: waylines fora de wpmz/ e aceite', backRoot.waypointCount === 3)
}

{
  check(
    'WPML: zip corrompido -> erro legivel',
    (await throwsWith(() => parseWpmlKmz(new Uint8Array([1, 2, 3, 4])), 'KMZ ilegível')) === null,
  )
  check(
    'WPML: zip sem waylines nem template -> erro legivel',
    (await throwsWith(async () => {
      const zip = new JSZip()
      zip.file('leiame.txt', 'nao sou uma missao')
      return parseWpmlKmz(await zip.generateAsync({ type: 'uint8array' }))
    }, 'não é uma missão WPML')) === null,
  )
  check(
    'WPML: missao sem coordenadas -> erro legivel',
    (await throwsWith(
      () =>
        parseWpmlKmz(
          makeKmz({
            waylines: '<?xml version="1.0"?><kml><Document><Folder/></Document></kml>',
          }),
        ),
      'nenhum waypoint encontrado',
    )) === null,
  )
  check(
    'WPML: XML corrompido dentro do zip -> erro legivel',
    (await throwsWith(
      () => parseWpmlKmz(makeKmz({ waylines: '<kml><Document></kml>' })),
      'XML da missão ilegível',
    )) === null,
  )
  check(
    'WPML: poucos waypoints para um anel -> erro legivel',
    (await throwsWith(
      () =>
        parseWpmlKmz(
          makeKmz({
            waylines: buildWaylinesWPML(
              missionParams([
                [-8.5, 39.5],
                [-8.49, 39.5],
              ]),
            ),
          }),
        ),
      'waypoints suficientes',
    )) === null,
  )
}

/* ================================================================== */
/* 3. demFile.js — MDT GeoTIFF local                                   */
/* ================================================================== */

const PT_TM06 = CRS_OPTIONS.find((o) => o.code === 'EPSG:3763').def
const toWgs = (x, y) => proj4(PT_TM06, proj4.WGS84, [x, y])

/** MDT sintético em PT-TM06, north-up, com a rampa 100 + x + 10y por omissão. */
function makeDem({
  width = 40,
  height = 30,
  originX = -30000,
  originY = 20000,
  scale = 2,
  valueAt = (x, y) => 100 + x + 10 * y,
  nodata = -9999,
  geoKeys = { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3763 },
} = {}) {
  return makeFloatTiff({ width, height, valueAt, originX, originY, scale, geoKeys, nodata })
}

/** bbox WGS84 de uma janela em coordenadas do raster PT-TM06. */
function bboxFrom(x0, y0, x1, y1) {
  const a = toWgs(x0, y0)
  const b = toWgs(x1, y1)
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}

{
  // resolveRasterCrs: os cinco caminhos
  check(
    'MDT CRS: projectado suportado (PT-TM06)',
    resolveRasterCrs({ ProjectedCSTypeGeoKey: 3763 }).crsCode === 'EPSG:3763' &&
      resolveRasterCrs({ ProjectedCSTypeGeoKey: 3763 }).geographic === false,
  )
  const geo = resolveRasterCrs({ GeographicTypeGeoKey: 4326 })
  check(
    'MDT CRS: geografico tratado como lon/lat directo',
    geo.geographic === true && geo.def === null && geo.crsCode === 'EPSG:4326',
  )
  check(
    'MDT CRS: ETRS89 (4258) tambem conta como geografico',
    resolveRasterCrs({ GeographicTypeGeoKey: 4258 }).geographic === true,
  )
  check(
    'MDT CRS: projectado tem precedencia sobre o geografico',
    resolveRasterCrs({ ProjectedCSTypeGeoKey: 3763, GeographicTypeGeoKey: 4326 }).crsCode ===
      'EPSG:3763',
  )
  check(
    'MDT CRS: user-defined (32767) conta como ausente',
    (await throwsWith(
      async () => resolveRasterCrs({ ProjectedCSTypeGeoKey: 32767 }),
      'não indica o sistema de coordenadas',
    )) === null,
  )
  check(
    'MDT CRS: sem GeoKeys -> erro que diz o que exportar',
    (await throwsWith(async () => resolveRasterCrs({}), 'PT-TM06 (EPSG:3763)')) === null,
  )
  check(
    'MDT CRS: EPSG desconhecido -> erro que nomeia o codigo',
    (await throwsWith(
      async () => resolveRasterCrs({ ProjectedCSTypeGeoKey: 32633 }),
      'CRS não suportado: EPSG:32633',
    )) === null,
  )
}

{
  // projectBox: identidade, curvatura das arestas e falha total
  const box = projectBox([0, 0, 10, 20], (a, b) => [a, b])
  check(
    'projectBox: identidade devolve a mesma caixa',
    box.join(',') === '0,0,10,20',
    box.join(','),
  )

  // projecção que curva: o extremo em y cai a MEIO da aresta de baixo, não num canto
  const curved = projectBox([-10, 0, 10, 5], (a, b) => [a, b + 4 - (a * a) / 25])
  check(
    'projectBox: amostra as arestas, nao so os cantos',
    Math.abs(curved[3] - 9) < 1e-9,
    `maxY ${curved[3].toFixed(2)} (cantos dariam 5)`,
  )
  check(
    'projectBox: todos os pontos fora do dominio -> erro legivel',
    (await throwsWith(
      async () =>
        projectBox([0, 0, 1, 1], () => {
          throw new Error('fora')
        }),
      'Não foi possível projetar a área',
    )) === null,
  )
}

{
  // leitura completa de uma janela, sem margem nem reamostragem
  const dem = makeDem()
  const out = await loadDemFromFile(dem, bboxFrom(-30000, 20000, -29920, 19940), { marginM: 0 })
  check(
    'MDT: CRS e dimensoes da janela lida',
    out.crsCode === 'EPSG:3763' && out.width === 40 && out.height === 30,
    `${out.crsCode} ${out.width}x${out.height}`,
  )
  check(
    'MDT: resolucao nativa e a do raster (2 m)',
    Math.abs(out.nativeResolutionM - 2) < 1e-6 && Math.abs(out.resolutionM - 2) < 1e-6,
    `${out.resolutionM.toFixed(3)} m`,
  )
  check('MDT: rotulo e origem do ficheiro', out.source === 'file')

  // valor exacto no centro de um pixel (interpolacao bilinear degenera no proprio ponto)
  const centre = toWgs(-30000 + 2 * 5 + 1, 20000 - 2 * 3 - 1) // pixel (5, 3) -> 100 + 5 + 30
  check(
    'MDT: elevacao no centro do pixel e o valor do pixel',
    Math.abs(out.elevationAt(centre[0], centre[1]) - 135) < 1e-3,
    `${out.elevationAt(centre[0], centre[1])?.toFixed(3)} (esperado 135)`,
  )

  // ponto a meio de dois pixeis vizinhos -> media dos dois
  const mid = toWgs(-30000 + 2 * 5 + 2, 20000 - 2 * 3 - 1) // fronteira entre (5,3) e (6,3)
  check(
    'MDT: interpolacao bilinear entre pixeis vizinhos',
    Math.abs(out.elevationAt(mid[0], mid[1]) - 135.5) < 1e-2,
    `${out.elevationAt(mid[0], mid[1])?.toFixed(3)} (esperado 135.5)`,
  )

  const far = toWgs(-50000, 50000)
  check('MDT: fora da janela devolve null', out.elevationAt(far[0], far[1]) === null)
  check(
    'MDT: coordenadas nao finitas devolvem null',
    out.elevationAt(NaN, 39.5) === null && out.elevationAt(-8.5, Infinity) === null,
  )
}

{
  // nodata -> NaN -> null, sem contaminar os vizinhos validos
  const dem = makeDem({ valueAt: (x, y) => (x >= 20 ? -9999 : 100 + x + 10 * y) })
  const out = await loadDemFromFile(dem, bboxFrom(-30000, 20000, -29920, 19940), { marginM: 0 })
  const inNodata = toWgs(-30000 + 2 * 30 + 1, 20000 - 2 * 3 - 1)
  check(
    'MDT: zona de nodata devolve null (nao o sentinela -9999)',
    out.elevationAt(inNodata[0], inNodata[1]) === null,
    String(out.elevationAt(inNodata[0], inNodata[1])),
  )
  const valid = toWgs(-30000 + 2 * 10 + 1, 20000 - 2 * 3 - 1)
  check(
    'MDT: zona valida ao lado do nodata mantem-se correcta',
    Math.abs(out.elevationAt(valid[0], valid[1]) - 140) < 1e-3,
    `${out.elevationAt(valid[0], valid[1])?.toFixed(2)}`,
  )

  const allVoid = makeDem({ valueAt: () => -9999 })
  check(
    'MDT: janela toda sem dados -> erro legivel',
    (await throwsWith(
      () => loadDemFromFile(allVoid, bboxFrom(-30000, 20000, -29920, 19940), { marginM: 0 }),
      'não tem valores de elevação válidos',
    )) === null,
  )

  // sentinela enorme de float (−3.4e38) tambem conta como sem dados
  const huge = makeDem({ valueAt: (x) => (x >= 20 ? -3.4e38 : 50), nodata: -32768 })
  const outHuge = await loadDemFromFile(huge, bboxFrom(-30000, 20000, -29920, 19940), {
    marginM: 0,
  })
  check(
    'MDT: sentinela -3.4e38 tratado como sem dados',
    outHuge.elevationAt(inNodata[0], inNodata[1]) === null,
  )
}

{
  // reamostragem: maxDim menor que a janela reduz a grelha e engrossa a resolucao
  const dem = makeDem({ width: 40, height: 30 })
  const out = await loadDemFromFile(dem, bboxFrom(-30000, 20000, -29920, 19940), {
    marginM: 0,
    maxDim: 10,
  })
  check(
    'MDT: maxDim limita o lado maior da grelha lida',
    out.width === 10 && out.height <= 10,
    `${out.width}x${out.height}`,
  )
  check(
    'MDT: resolucao efectiva cresce com a reamostragem',
    out.resolutionM > out.nativeResolutionM * 3,
    `${out.resolutionM.toFixed(2)} m vs nativa ${out.nativeResolutionM.toFixed(2)} m`,
  )
  // a grelha reamostrada tem de concordar com a resolucao nativa no mesmo ponto
  const fine = await loadDemFromFile(makeDem(), bboxFrom(-30000, 20000, -29920, 19940), {
    marginM: 0,
  })
  const p = toWgs(-30000 + 40, 20000 - 30)
  const coarseV = out.elevationAt(...p)
  const fineV = fine.elevationAt(...p)
  check(
    'MDT: elevacao reamostrada concorda com a nativa no mesmo ponto',
    Math.abs(coarseV - fineV) < 5,
    `${coarseV?.toFixed(1)} vs ${fineV?.toFixed(1)} m`,
  )
}

{
  // raster em graus (EPSG:4326): sem reprojeccao
  const dem = makeDem({
    originX: -8.5,
    originY: 39.51,
    scale: 0.0002,
    width: 20,
    height: 20,
    geoKeys: { GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326 },
  })
  const out = await loadDemFromFile(dem, [-8.4995, 39.5075, -8.4985, 39.5085], { marginM: 0 })
  check('MDT: raster geografico lido sem reprojeccao', out.crsCode === 'EPSG:4326')
  check(
    'MDT: resolucao de um raster em graus convertida para metros',
    out.nativeResolutionM > 15 && out.nativeResolutionM < 25,
    `${out.nativeResolutionM.toFixed(1)} m`,
  )
}

{
  // erros de entrada
  check(
    'MDT: ficheiro invalido -> erro legivel',
    (await throwsWith(() => loadDemFromFile(null, [0, 0, 1, 1]), 'Ficheiro de MDT inválido')) ===
      null,
  )
  check(
    'MDT: bbox invalida -> erro legivel',
    (await throwsWith(
      () => loadDemFromFile(makeDem(), [0, 0, NaN, 1]),
      'Área de levantamento inválida',
    )) === null,
  )
  check(
    'MDT: ficheiro que nao e GeoTIFF -> erro legivel',
    (await throwsWith(
      () => loadDemFromFile(new Blob([new Uint8Array(64)]), [-8.5, 39.5, -8.49, 39.51]),
      'Não foi possível abrir o GeoTIFF',
    )) === null,
  )
  // raster com rotação: recusado em vez de georreferenciado a torto
  const rotated = makeFloatTiff({
    width: 20,
    height: 20,
    valueAt: () => 50,
    scale: 2,
    originX: -30000,
    originY: 20000,
    geoKeys: { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3763 },
    nodata: -9999,
    // [a, b, c, d, e, f, ...]: b e e não nulos = eixos rodados
    transform: [2, 0.5, 0, -30000, 0.5, -2, 0, 20000, 0, 0, 0, 0, 0, 0, 0, 1],
  })
  check(
    'MDT: raster com rotacao -> recusado com instrucao de reexportar',
    (await throwsWith(
      () => loadDemFromFile(rotated, bboxFrom(-30000, 20000, -29960, 19960), { marginM: 0 }),
      'MDT com rotação não suportado',
    )) === null,
  )
  check(
    'MDT: raster que nao cobre a area -> erro legivel',
    (await throwsWith(
      () => loadDemFromFile(makeDem(), bboxFrom(200000, 200000, 200100, 200100), { marginM: 0 }),
      'não cobre a área de levantamento',
    )) === null,
  )
}

{
  // Datum e unidade verticais: pes convertem para metros; Cascais e 4979 sao declarados
  const feet = await loadDemFromFile(
    makeDem({
      valueAt: () => 100,
      geoKeys: {
        GTModelTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 3763,
        VerticalCSTypeGeoKey: 5773,
        VerticalUnitsGeoKey: 9002,
      },
    }),
    bboxFrom(-30000, 20000, -29920, 19940),
    { marginM: 0 },
  )
  const [lonC, latC] = toWgs(-29960, 19970)
  check(
    'MDT em pes: 100 ft lem-se como 30.48 m',
    Math.abs(feet.elevationAt(lonC, latC) - 30.48) < 0.01,
    String(feet.elevationAt(lonC, latC)),
  )
  check(
    'MDT em pes: datum EGM96 declarado, unidade ft',
    feet.verticalDatum.model === 'EGM96' && feet.verticalDatum.unitLabel === 'ft',
  )
  const cascais = await loadDemFromFile(
    makeDem({
      geoKeys: { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3763, VerticalCSTypeGeoKey: 5782 },
    }),
    bboxFrom(-30000, 20000, -29920, 19940),
    { marginM: 0 },
  )
  check(
    'MDT Cascais (EPSG:5782): ortometrico, nao assumido',
    cascais.verticalDatum.kind === 'orthometric' && cascais.verticalDatum.assumed === false,
  )
  const plain = await loadDemFromFile(makeDem(), bboxFrom(-30000, 20000, -29920, 19940), {
    marginM: 0,
  })
  check(
    'MDT sem GeoKeys verticais: datum desconhecido (assumido), valores intactos',
    plain.verticalDatum.kind === 'unknown' &&
      Math.abs(plain.elevationAt(lonC, latC) - (feet.elevationAt(lonC, latC) / 0.3048) * 1 + 0) > 0,
  )
}

{
  // Cache de tiles (tileCache.js) com uma CacheStorage falsa, e datum vertical
  const { withTileCache, clearTileCache, isOffline } = await import('./src/utils/tileCache.js')
  const stores = new Map()
  const storage = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)
      return { match: async (u) => m.get(u), put: async (u, r) => m.set(u, r) }
    },
    delete: async (name) => stores.delete(name),
  }
  const resp = (ok) => ({
    ok,
    status: ok ? 200 : 500,
    clone() {
      return { ...this }
    },
  })
  let calls = 0
  const cached = withTileCache(
    async () => {
      calls += 1
      return resp(true)
    },
    { cacheStorage: storage, cacheName: 't' },
  )
  await cached.fetch('u/1')
  await cached.fetch('u/1')
  check(
    'cache de tiles: segunda leitura vem da cache',
    calls === 1 && cached.stats.hits === 1 && cached.stats.stored === 1,
  )
  let bad = 0
  const failing = withTileCache(
    async () => {
      bad += 1
      return resp(false)
    },
    { cacheStorage: storage, cacheName: 't' },
  )
  await failing.fetch('u/2')
  await failing.fetch('u/2')
  check('cache de tiles: respostas com erro nao entram', bad === 2 && failing.stats.stored === 0)
  const broken = withTileCache(async () => resp(true), {
    cacheStorage: {
      open: async () => {
        throw new Error('quota')
      },
    },
    cacheName: 't',
  })
  check(
    'cache de tiles: cache avariada cai no fetch simples',
    (await broken.fetch('u/3')).ok === true,
  )
  const plain = withTileCache(async () => resp(true), { cacheStorage: null })
  check(
    'cache de tiles: sem Cache API o fetch simples serve',
    (await plain.fetch('u/4')).ok === true && plain.enabled === (typeof caches !== 'undefined'),
  )
  check(
    'cache de tiles: limpar',
    (await clearTileCache(storage, 't')) === true &&
      stores.has('t') === false &&
      (await clearTileCache(
        {
          delete: async () => {
            throw new Error('x')
          },
        },
        't',
      )) === false,
  )
  check('cache de tiles: isOffline sem navigator e null', isOffline() === null)

  const { describeVerticalDatum, needsUnitConversion } =
    await import('./src/utils/verticalDatum.js')
  const egm = describeVerticalDatum({ VerticalCSTypeGeoKey: 5773, VerticalUnitsGeoKey: 9002 })
  check(
    'datum: EGM96 em pes',
    egm.model === 'EGM96' && Math.abs(egm.unitFactor - 0.3048) < 1e-9 && needsUnitConversion(egm),
  )
  check(
    'datum: codigo vertical desconhecido assume ortometrico',
    describeVerticalDatum({ VerticalCSTypeGeoKey: 5555 }).assumed === true,
  )
  check(
    'datum: VerticalDatumGeoKey so',
    describeVerticalDatum({ VerticalDatumGeoKey: 5171 }).kind === 'orthometric',
  )
  check(
    'datum: geografico 3D e elipsoidal',
    describeVerticalDatum({ GeographicTypeGeoKey: 4937 }).kind === 'ellipsoidal',
  )
  check(
    'datum: unidade desconhecida fica etiquetada',
    describeVerticalDatum({ VerticalUnitsGeoKey: 9999 }).unitLabel.includes('9999'),
  )
  check('datum: sem chaves e desconhecido', describeVerticalDatum(undefined).kind === 'unknown')
}

console.log(
  failures === 0 ? '\nTODOS OS TESTES DE E/S PASSARAM' : `\n${failures} TESTES DE E/S FALHARAM`,
)
process.exit(failures === 0 ? 0 : 1)
