/**
 * Cenário sintético do E2E: um relevo analítico (rampa + três colinas) e
 * polígonos sobre ele. O MDT é escrito como GeoTIFF float32 em EPSG:4326 e
 * importado pela interface, tal como um operador faria; a mesma função
 * `ground` serve depois de oráculo para medir a folga ao solo da rota
 * exportada — sem relevo analítico não haveria verdade contra a qual medir.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeFloatTiff } from '../lib/geotiff.mjs'

export const lon0 = -9.14
export const lat0 = 38.7
export const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
export const toM = (lon, lat) => [(lon - lon0) * mLon, (lat - lat0) * 110574]
export const toLL = (x, y) => [lon0 + x / mLon, lat0 + y / 110574]

const G = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s))
/** Cota do solo (m) em coordenadas locais métricas. */
export const ground = (x, y) =>
  150 + 0.05 * x + 90 * G(x, y, 700, 600, 220) + 120 * G(x, y, 1800, 1200, 300) + 60 * G(x, y, 1200, 300, 150)

const feature = (rings, type = 'Polygon') =>
  JSON.stringify({ type: 'Feature', properties: {}, geometry: { type, coordinates: rings } })

const closed = (pts) => [...pts, pts[0]]

/** Rectângulo 2,5 × 1,8 km. */
export const rectRing = closed([toLL(200, 150), toLL(2700, 150), toLL(2700, 1950), toLL(200, 1950)])
/** U: o rectângulo com um entalhe x 1000..1900, y 800..1950 — a colina de
 *  120 m em (1800, 1200) fica DENTRO do entalhe, por onde passam as ligações. */
export const uRing = closed([
  toLL(200, 150), toLL(2700, 150), toLL(2700, 1950), toLL(1900, 1950),
  toLL(1900, 800), toLL(1000, 800), toLL(1000, 1950), toLL(200, 1950),
])
const small = (lon, lat) => closed([[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001]])

/** Escreve os ficheiros do cenário em `dir` e devolve os caminhos. */
export async function makeFixtures(dir) {
  const originX = -9.145
  const originY = 38.725
  const scale = 0.0001 // ~8,7 m × 11 m por píxel
  const width = 420
  const height = 270
  const tif = makeFloatTiff({
    width, height, originX, originY, scale, nodata: -9999,
    geoKeys: { GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326 },
    valueAt: (px, py) => {
      const [x, y] = toM(originX + (px + 0.5) * scale, originY - (py + 0.5) * scale)
      return ground(x, y)
    },
  })
  const paths = {
    dem: join(dir, 'dem.tif'),
    rect: join(dir, 'rect.geojson'),
    u: join(dir, 'u.geojson'),
    multi: join(dir, 'multi.geojson'),
  }
  writeFileSync(paths.dem, Buffer.from(await tif.arrayBuffer()))
  writeFileSync(paths.rect, feature([rectRing]))
  writeFileSync(paths.u, feature([uRing]))
  writeFileSync(paths.multi, feature([[rectRing], [small(-9.16, 38.69)], [small(-9.1, 38.73)]], 'MultiPolygon'))
  return paths
}
