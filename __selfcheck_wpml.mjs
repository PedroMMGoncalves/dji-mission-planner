/* Selfcheck TEMPORÁRIO de src/utils/importWpml.js — apagar após correr. */
import JSZip from 'jszip'
import * as turf from '@turf/turf'

/* ---- shim mínimo de DOMParser (Node não tem DOM) ------------------ */
class XNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType
    this.nodeName = nodeName
    this.localName = nodeType === 1 ? nodeName.split(':').pop() : null
    this.childNodes = []
    this.data = ''
  }
  get textContent() {
    if (this.nodeType === 3) return this.data
    return this.childNodes.map((n) => n.textContent).join('')
  }
}
const ENT = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' }
const decode = (s) =>
  s.replace(/&(lt|gt|amp|apos|quot|#\d+);/g, (m, k) =>
    k[0] === '#' ? String.fromCharCode(Number(k.slice(1))) : ENT[k],
  )

function parseXML(src) {
  const doc = new XNode(9, '#document')
  doc.documentElement = null
  const stack = [doc]
  const pushText = (t) => {
    if (!t) return
    const n = new XNode(3, '#text')
    n.data = decode(t)
    stack[stack.length - 1].childNodes.push(n)
  }
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      pushText(src.slice(i))
      break
    }
    if (lt > i) pushText(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) {
      i = src.indexOf('-->', lt) + 3
      continue
    }
    if (src.startsWith('<?', lt)) {
      i = src.indexOf('?>', lt) + 2
      continue
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt)
      const n = new XNode(3, '#text')
      n.data = src.slice(lt + 9, end)
      stack[stack.length - 1].childNodes.push(n)
      i = end + 3
      continue
    }
    if (src.startsWith('<!', lt)) {
      i = src.indexOf('>', lt) + 1
      continue
    }
    const gt = src.indexOf('>', lt)
    if (gt === -1) break
    const raw = src.slice(lt + 1, gt)
    if (raw.startsWith('/')) {
      stack.pop()
    } else {
      const selfClose = raw.endsWith('/')
      const m = raw.match(/^[^\s/>]+/)
      const el = new XNode(1, m ? m[0] : raw)
      stack[stack.length - 1].childNodes.push(el)
      if (!selfClose) stack.push(el)
    }
    i = gt + 1
  }
  doc.documentElement = doc.childNodes.find((n) => n.nodeType === 1) || null
  return doc
}
globalThis.DOMParser = class {
  parseFromString(s) {
    return parseXML(s)
  }
}

/* ---- módulos em teste --------------------------------------------- */
const { buildTemplateKML, buildWaylinesWPML } = await import('./src/utils/exporters.js')
const { parseWpmlKmz } = await import('./src/utils/importWpml.js')

/* ---- helpers ------------------------------------------------------ */
let failures = 0
function ok(cond, label, extra = '') {
  if (cond) console.log(`  OK  ${label}`)
  else {
    failures++
    console.log(`  FALHA  ${label} ${extra}`)
  }
}
const M_LAT = 110574
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

const WPML = {
  droneEnumValue: 77,
  droneSubEnumValue: 0,
  payloadEnumValue: 66,
  payloadSubEnumValue: 0,
  payloadPositionIndex: 0,
}
const baseParams = {
  name: 'teste-missao',
  altitude: 100,
  speed: 8,
  wpml: WPML,
  photoIntervalM: 25,
  triggerMode: 'distance',
}

async function makeKmz(params, type = 'nodebuffer') {
  const zip = new JSZip()
  const wpmz = zip.folder('wpmz')
  wpmz.file('template.kml', buildTemplateKML(params))
  wpmz.file('waylines.wpml', buildWaylinesWPML(params))
  return zip.generateAsync({ type, compression: 'DEFLATE' })
}

/* retângulo 500 x 300 m, 8 faixas em serpentina → 16 waypoints */
const LON0 = -8.6
const LAT0 = 39.5
const ML = mLon(LAT0)
const toLL = (x, y) => [LON0 + x / ML, LAT0 + y / M_LAT]
const rectWaypoints = []
for (let i = 0; i < 8; i++) {
  const y = -150 + (300 * i) / 7
  const ends = i % 2 === 0 ? [-250, 250] : [250, -250]
  rectWaypoints.push(toLL(ends[0], y), toLL(ends[1], y))
}

/* ---- 1) ida-e-volta completa -------------------------------------- */
console.log('1) KMZ WPML completo (16 waypoints, 500x300 m)')
const kmz = await makeKmz({ ...baseParams, waypoints: rectWaypoints })
// entrada tipo File: objeto com arrayBuffer()
const fileLike = {
  name: 'teste-missao.kmz',
  arrayBuffer: async () => kmz.buffer.slice(kmz.byteOffset, kmz.byteOffset + kmz.byteLength),
}
const res = await parseWpmlKmz(fileLike)

ok(res.waypoints.length === 16, 'waypoints.length === 16', `(${res.waypoints.length})`)
ok(res.waypointCount === 16, 'waypointCount === 16', `(${res.waypointCount})`)
const orderOk = rectWaypoints.every(
  (p, i) =>
    Math.abs(p[0] - res.waypoints[i][0]) < 1e-7 && Math.abs(p[1] - res.waypoints[i][1]) < 1e-7,
)
ok(orderOk, 'waypoints na ordem correta e coordenadas iguais (<1e-7 deg)')
ok(res.altitude === 100, 'altitude === 100', `(${res.altitude})`)
ok(res.speed === 8, 'speed === 8', `(${res.speed})`)
ok(res.droneEnumValue === 77, 'droneEnumValue === 77', `(${res.droneEnumValue})`)
ok(res.payloadEnumValue === 66, 'payloadEnumValue === 66', `(${res.payloadEnumValue})`)
ok(res.name === 'teste-missao', "name === 'teste-missao'", `(${res.name})`)
ok(Array.isArray(res.ring) && res.ring.length >= 4, 'ring com >= 4 vértices', `(${res.ring?.length})`)

const ringPoly = turf.polygon([[...res.ring, res.ring[0]]])
const ringLine = turf.lineString([...res.ring, res.ring[0]])
const outside = res.waypoints.filter((p) => {
  if (turf.booleanPointInPolygon(turf.point(p), ringPoly)) return false
  return turf.pointToLineDistance(turf.point(p), ringLine, { units: 'meters' }) > 1
})
ok(outside.length === 0, 'todos os waypoints dentro do ring (tolerância 1 m)', `(${outside.length} fora)`)
const areaHa = turf.area(ringPoly) / 10000
ok(areaHa > 14 && areaHa < 16, 'área do ring ~15 ha (500x300 m)', `(${areaHa.toFixed(2)} ha)`)

/* ---- 2) KMZ sem WPML ---------------------------------------------- */
console.log('2) KMZ sem waylines/template')
const junk = new JSZip()
junk.file('leiame.txt', 'sem wpml aqui')
try {
  await parseWpmlKmz(await junk.generateAsync({ type: 'nodebuffer' }))
  ok(false, 'devia lançar erro')
} catch (e) {
  ok(/waylines\.wpml/.test(e.message), 'erro sobre waylines/template', `("${e.message}")`)
}

/* ---- 3) ficheiro não-zip ------------------------------------------ */
console.log('3) ficheiro ilegível')
try {
  await parseWpmlKmz(Buffer.from('isto nao e um kmz'))
  ok(false, 'devia lançar erro')
} catch (e) {
  ok(/KMZ ilegível/.test(e.message), 'erro "KMZ ilegível"', `("${e.message}")`)
}

/* ---- 4) apenas 2 waypoints ---------------------------------------- */
console.log('4) KMZ com 2 waypoints')
const kmz2 = await makeKmz({ ...baseParams, waypoints: [toLL(-100, 0), toLL(100, 0)] })
try {
  await parseWpmlKmz(kmz2)
  ok(false, 'devia lançar erro')
} catch (e) {
  ok(e.message === 'KMZ sem waypoints suficientes', 'erro "KMZ sem waypoints suficientes"', `("${e.message}")`)
}

/* ---- 5) pontos colineares → retângulo de recurso ------------------- */
console.log('5) waypoints colineares')
const collinear = [0, 1, 2, 3, 4].map((k) => toLL(-100 + k * 50, -100 + k * 50))
const kmzLine = await makeKmz({ ...baseParams, waypoints: collinear })
const resLine = await parseWpmlKmz(kmzLine)
ok(resLine.ring.length === 4, 'ring de recurso com 4 vértices', `(${resLine.ring.length})`)
const rectPoly = turf.polygon([[...resLine.ring, resLine.ring[0]]])
const allIn = collinear.every((p) => turf.booleanPointInPolygon(turf.point(p), rectPoly))
ok(allIn, 'todos os pontos colineares dentro do retângulo de recurso')
const [x0, y0, x1, y1] = turf.bbox(rectPoly)
const wM = turf.distance([x0, y0], [x1, y0], { units: 'meters' })
const hM = turf.distance([x0, y0], [x0, y1], { units: 'meters' })
ok(wM > 220 && wM < 260 && hM > 220 && hM < 260, 'retângulo = extensão + ~20 m de folga por lado', `(${wM.toFixed(1)} x ${hM.toFixed(1)} m)`)
ok(resLine.altitude === 100 && resLine.speed === 8, 'altitude/velocidade preservadas no caso degenerado')

/* ---- 6) só template.kml (sem waylines) ---------------------------- */
console.log('6) KMZ só com template.kml')
const onlyTpl = new JSZip()
onlyTpl.folder('wpmz').file('template.kml', buildTemplateKML({ ...baseParams, waypoints: rectWaypoints }))
const resTpl = await parseWpmlKmz(await onlyTpl.generateAsync({ type: 'nodebuffer' }))
ok(resTpl.waypoints.length === 16, 'template.kml: 16 waypoints', `(${resTpl.waypoints.length})`)
ok(resTpl.altitude === 100 && resTpl.speed === 8, 'template.kml: altitude 100 / speed 8', `(${resTpl.altitude}/${resTpl.speed})`)

/* ---- 7) alturas variáveis → mediana + índices baralhados ---------- */
console.log('7) alturas variáveis e Placemarks fora de ordem')
const varied = rectWaypoints.map((p, i) => [p[0], p[1], 90 + i])
const wpmlText = buildWaylinesWPML({ ...baseParams, waypoints: varied })
// baralha a ordem dos Placemarks no XML: o <wpml:index> tem de mandar
const head = wpmlText.slice(0, wpmlText.indexOf('      <Placemark>'))
const tail = wpmlText.slice(wpmlText.lastIndexOf('</Placemark>') + '</Placemark>'.length)
const pms = wpmlText
  .slice(wpmlText.indexOf('      <Placemark>'), wpmlText.lastIndexOf('</Placemark>') + 12)
  .split(/(?=      <Placemark>)/)
const shuffled = [...pms].reverse().join('')
const zipShuf = new JSZip()
zipShuf.folder('wpmz').file('waylines.wpml', head + shuffled + tail)
const resVar = await parseWpmlKmz(await zipShuf.generateAsync({ type: 'nodebuffer' }))
ok(resVar.waypoints.length === 16, 'placemarks baralhados: 16 waypoints', `(${resVar.waypoints.length})`)
const orderVarOk = rectWaypoints.every(
  (p, i) => Math.abs(p[0] - resVar.waypoints[i][0]) < 1e-7 && Math.abs(p[1] - resVar.waypoints[i][1]) < 1e-7,
)
ok(orderVarOk, 'ordem reposta por <wpml:index>')
ok(resVar.altitude === 97.5, 'altitude = mediana de 90..105 = 97.5', `(${resVar.altitude})`)

console.log(failures === 0 ? '\nSELFCHECK PASSOU' : `\nSELFCHECK FALHOU (${failures})`)
process.exit(failures === 0 ? 0 : 1)
