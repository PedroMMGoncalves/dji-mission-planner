/**
 * Ficheiros reais dos testes (M3-T12), em tests/fixtures/: uma área como o
 * Google Earth a escreve (KML), como o QGIS a exporta (GeoJSON em CRS84 e em
 * PT-TM06, shapefile com e sem .prj), um recorte de MDT em PT-TM06 (GeoTIFF
 * float32) e projectos tal como as versões 1.0.1, 1.3.0 e 1.4.2 os
 * gravavam. Os ficheiros estão no repositório para se abrirem nas
 * ferramentas; este gerador reproduz-os byte a byte (datas fixas), e a suite
 * confirma que o que está em disco é o que ele produz.
 *
 *   node tests/lib/fixtures-reais.mjs   # reescreve tests/fixtures/
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import proj4 from 'proj4'
import { CRS_OPTIONS } from '../../src/utils/importArea.js'
import { PROJECT_SCHEMA_URL } from '../../src/mission/project.js'
import { makeFloatTiff } from './geotiff.mjs'
import { PRJ_PT_TM06, shapefileZip } from './shapefile.mjs'

/** A área: um rectângulo de ~435 × 333 m no Alentejo interior, [lon, lat]. */
export const ANEL = [
  [-7.9, 38.55],
  [-7.895, 38.55],
  [-7.895, 38.553],
  [-7.9, 38.553],
]
const BURACO = [
  [-7.898, 38.551],
  [-7.897, 38.551],
  [-7.897, 38.5518],
  [-7.898, 38.5518],
]
export const DATA = new Date(Date.UTC(2026, 9, 20, 10, 0, 0))
export const TM06 = CRS_OPTIONS.find((o) => o.code === 'EPSG:3763').def
/** [lon, lat] → [x, y] em PT-TM06 (metros), com 3 decimais como o QGIS. */
export const paraTM06 = ([lon, lat]) => proj4(TM06, [lon, lat]).map((v) => Number(v.toFixed(3)))
const fechado = (r) => [...r, r[0]]
/** Buffer de Node a partir do que o escritor devolve (Blob, ArrayBuffer ou Buffer). */
async function toBuffer(v) {
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Blob) return Buffer.from(await v.arrayBuffer())
  return Buffer.from(v)
}

/** Relevo sintético do MDT (m): rampa para Este e uma colina ao centro. */
export function relevo(x, y) {
  const [cx, cy] = paraTM06([-7.8975, 38.5515])
  return 180 + 0.02 * (x - cx) + 15 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * 120 ** 2))
}

function kmlGoogleEarth() {
  const coords = (r) =>
    fechado(r)
      .map(([lon, lat]) => `${lon},${lat},0`)
      .join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
<Document>
	<name>area-google-earth.kml</name>
	<StyleMap id="m_ylw-pushpin">
		<Pair>
			<key>normal</key>
			<styleUrl>#s_ylw-pushpin</styleUrl>
		</Pair>
		<Pair>
			<key>highlight</key>
			<styleUrl>#s_ylw-pushpin_hl</styleUrl>
		</Pair>
	</StyleMap>
	<Style id="s_ylw-pushpin">
		<IconStyle>
			<scale>1.1</scale>
			<Icon>
				<href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
			</Icon>
			<hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
		</IconStyle>
		<LineStyle>
			<color>ff00ffff</color>
			<width>2</width>
		</LineStyle>
		<PolyStyle>
			<color>4d00ffff</color>
		</PolyStyle>
	</Style>
	<Style id="s_ylw-pushpin_hl">
		<IconStyle>
			<scale>1.3</scale>
			<Icon>
				<href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
			</Icon>
			<hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
		</IconStyle>
		<LineStyle>
			<color>ff00ffff</color>
			<width>2</width>
		</LineStyle>
		<PolyStyle>
			<color>4d00ffff</color>
		</PolyStyle>
	</Style>
	<Folder>
		<name>Herdade</name>
		<open>1</open>
		<Placemark>
			<name>Área de voo</name>
			<styleUrl>#m_ylw-pushpin</styleUrl>
			<Polygon>
				<tessellate>1</tessellate>
				<outerBoundaryIs>
					<LinearRing>
						<coordinates>
							${coords(ANEL)} 
						</coordinates>
					</LinearRing>
				</outerBoundaryIs>
				<innerBoundaryIs>
					<LinearRing>
						<coordinates>
							${coords(BURACO)} 
						</coordinates>
					</LinearRing>
				</innerBoundaryIs>
			</Polygon>
		</Placemark>
		<Placemark>
			<name>Base</name>
			<styleUrl>#m_ylw-pushpin</styleUrl>
			<Point>
				<gx:drawOrder>1</gx:drawOrder>
				<coordinates>-7.9004,38.5498,0</coordinates>
			</Point>
		</Placemark>
		<Placemark>
			<name>Caminho</name>
			<styleUrl>#m_ylw-pushpin</styleUrl>
			<LineString>
				<tessellate>1</tessellate>
				<coordinates>
					-7.9004,38.5498,0 -7.9,38.55,0 -7.898,38.5505,0 
				</coordinates>
			</LineString>
		</Placemark>
	</Folder>
</Document>
</kml>
`
}

/** FeatureCollection como o QGIS a exporta («GeoJSON», uma feature por linha). */
function geojsonQgis(crs, projectar) {
  const anel = fechado(ANEL).map(projectar)
  const buraco = fechado(BURACO).map(projectar)
  const feature = {
    type: 'Feature',
    properties: { fid: 1, nome: 'Área de voo', uso: 'olival' },
    geometry: { type: 'MultiPolygon', coordinates: [[anel, buraco]] },
  }
  return (
    `{\n"type": "FeatureCollection",\n"name": "area",\n"crs": { "type": "name", "properties": { "name": "${crs}" } },\n"features": [\n` +
    JSON.stringify(feature) +
    `\n]\n}\n`
  )
}

async function geotiffTM06() {
  const pts = ANEL.map(paraTM06)
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])) / 10) * 10 - 150
  const maxX = Math.ceil(Math.max(...pts.map((p) => p[0])) / 10) * 10 + 150
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])) / 10) * 10 - 150
  const maxY = Math.ceil(Math.max(...pts.map((p) => p[1])) / 10) * 10 + 150
  const scale = 10
  const width = Math.round((maxX - minX) / scale)
  const height = Math.round((maxY - minY) / scale)
  return toBuffer(
    makeFloatTiff({
      width,
      height,
      originX: minX,
      originY: maxY,
      scale,
      nodata: -9999,
      geoKeys: { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3763 },
      valueAt: (px, py) => relevo(minX + (px + 0.5) * scale, maxY - (py + 0.5) * scale),
    }),
  )
}

const base = [-7.9004, 38.5498]
/** O sensor personalizado como a aplicação o guarda (DEFAULT_CUSTOM_SENSOR, sem alterações). */
const SENSOR_CUSTOM = {
  mode: 'camera',
  sensorWidth: 17.3,
  sensorHeight: 13,
  focalLength: 12.2,
  imageWidth: 5280,
  fov: 70,
  droneEnumValue: 60,
  payloadEnumValue: 50,
}
const paramsAntigos = {
  altitude: 80,
  speed: 8,
  frontOverlap: 80,
  sideOverlap: 70,
  angle: 90,
  bufferPct: 0,
  triggerMode: 'distance',
  spacingMode: 'auto',
  manualSpacing: 50,
  crosshatch: false,
  includeNadir: false,
  gimbalPitch: -90,
}
const faceAntiga = {
  baseline: null,
  heightM: 30,
  standoffM: 25,
  side: 'left',
  verticalOverlapPct: 70,
  horizontalOverlapPct: 70,
  gimbalPitch: 0,
  minClearanceM: 15,
  speedMS: 5,
}
const orbitaAntiga = {
  poi: null,
  radiusM: 60,
  levelCount: 3,
  levelStartM: 30,
  levelStepM: 15,
  horizontalOverlapPct: 80,
  poiHeightM: 0,
  clockwise: true,
  speedMS: 5,
}
const corredorAntigo = {
  centreline: null,
  bufferM: 60,
  speedMS: 8,
  photoMode: 'distance',
  simplifyM: 1,
}
const ancora = {
  center: null,
  length: 500,
  width: 300,
  orientation: 90,
  shape: 'rect',
  cols: 1,
  rows: 1,
}

/** Como a 1.0.1 gravava (serializeProject de então): sem $schema, buracos nem circular. */
function projecto101() {
  return {
    version: 2,
    missionName: 'Olival da Herdade',
    drone: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' },
    custom: SENSOR_CUSTOM,
    payloadTuning: {},
    batteryByCombo: { 'M3E:M3E_WIDE': 40 },
    inspectPoints: [],
    missionMode: 'area',
    faceConfig: faceAntiga,
    corridorConfig: corredorAntigo,
    orbitConfig: orbitaAntiga,
    params: paramsAntigos,
    split: {
      mode: 'area',
      maxAreaHa: 20,
      reservePct: 30,
      maxSide: 500,
      tileSize: 250,
      tileOrientation: 0,
    },
    anchor: ancora,
    ring: ANEL,
    areaOrigin: 'draw',
    basePoint: base,
    disabledTiles: [],
    terrainFollow: { enabled: false, tolerance: 5 },
    gcpConfig: { enabled: false, count: null },
  }
}

/** Como a 1.3.0 gravava: $schema, buracos, circular, mosaico manual com células desligadas. */
function projecto130() {
  return {
    $schema: PROJECT_SCHEMA_URL,
    version: 2,
    missionName: 'Olival da Herdade',
    drone: { aircraftId: 'M4T', payloadId: 'M4T_WIDE' },
    custom: SENSOR_CUSTOM,
    payloadTuning: {},
    batteryByCombo: {},
    inspectPoints: [
      { id: 1, point: [-7.8995, 38.5505], heightM: 40, heading: 120, gimbalPitch: -30 },
    ],
    missionMode: 'area',
    faceConfig: faceAntiga,
    corridorConfig: { ...corredorAntigo, waypointStops: 'corners' },
    orbitConfig: { ...orbitaAntiga, capture: 'photo' },
    circularConfig: { radiusM: 30, overlapPct: 50, gimbalPitch: -45, speedMS: 8, angleDeg: null },
    params: { ...paramsAntigos, overshoot: 10, tieLine: true, waypointStops: 'corners' },
    split: {
      mode: 'tiles',
      maxAreaHa: 20,
      reservePct: 30,
      maxSide: 500,
      tileSize: 150,
      tileOrientation: 15,
    },
    anchor: ancora,
    ring: ANEL,
    holes: [BURACO],
    areaOrigin: 'draw',
    basePoint: base,
    disabledTiles: [2, 5],
    terrainFollow: { enabled: true, tolerance: 5 },
    gcpConfig: { enabled: true, count: 5 },
  }
}

/** Como a 1.4.2 gravava: bateria da missão, bases e atribuições, relevo lembrado, segurança. */
function projecto142() {
  return {
    $schema: PROJECT_SCHEMA_URL,
    version: 2,
    missionName: 'Olival da Herdade',
    drone: { aircraftId: 'M4T', payloadId: 'M4T_WIDE', rtk: true },
    custom: SENSOR_CUSTOM,
    payloadTuning: {},
    battery: { batteryId: 'padrao', usefulMin: 24 },
    inspectPoints: [
      { id: 1, point: [-7.8995, 38.5505], heightM: 40, heading: 120, gimbalPitch: -30 },
    ],
    missionMode: 'area',
    faceConfig: faceAntiga,
    corridorConfig: { ...corredorAntigo, waypointStops: 'corners' },
    orbitConfig: { ...orbitaAntiga, capture: 'photo' },
    circularConfig: {
      radiusM: 30,
      overlapPct: 50,
      gimbalPitch: -45,
      speedMS: 8,
      angleDeg: null,
      enabled: false,
    },
    params: {
      ...paramsAntigos,
      altitude: 90,
      crosshatch: true,
      includeNadir: true,
      gimbalPitch: -60,
      triggerMode: 'waypoint',
      overshoot: 0,
      tieLine: false,
      waypointStops: 'all',
    },
    split: {
      mode: 'battery',
      maxAreaHa: 20,
      reservePct: 0,
      maxSide: 500,
      tileSize: 250,
      tileOrientation: 0,
      tileOrientationAuto: true,
      mosaic: 2,
    },
    anchor: ancora,
    ring: ANEL,
    holes: [BURACO],
    areaOrigin: 'draw',
    bases: [
      { id: 'base-a', label: 'A', point: base, radiusM: null },
      { id: 'base-b', label: 'B', point: [-7.8945, 38.5535], radiusM: 150 },
    ],
    blockBase: { 1: 'base-a', 3: 'base-b' },
    disabledTiles: [2],
    terrainFollow: { enabled: true, tolerance: 5 },
    gcpConfig: { enabled: true, count: 5 },
    obstacleHeightM: 12,
    demFile: { label: 'mdt-pttm06.tif', surface: 'dtm' },
    safety: {
      finishAction: 'goHome',
      exitOnRCLost: 'executeLostAction',
      executeRCLostAction: 'goBack',
    },
  }
}

/** Nome → conteúdo (string ou Buffer) de cada ficheiro de tests/fixtures/. */
export async function gerarFixtures() {
  const features = [{ ring: fechado(ANEL).map(paraTM06), props: { nome: 'Área de voo' } }]
  const json = (o) => JSON.stringify(o, null, 2) + '\n'
  return {
    'area-google-earth.kml': kmlGoogleEarth(),
    'area-qgis-crs84.geojson': geojsonQgis('urn:ogc:def:crs:OGC:1.3:CRS84', (p) => p),
    'area-qgis-pttm06.geojson': geojsonQgis('urn:ogc:def:crs:EPSG::3763', paraTM06),
    'area-qgis-pttm06.zip': await shapefileZip('area', features, { prj: PRJ_PT_TM06, date: DATA }),
    'area-qgis-pttm06-sem-prj.zip': await shapefileZip('area', features, { date: DATA }),
    'mdt-pttm06.tif': await geotiffTM06(),
    'projecto-1.0.1.json': json(projecto101()),
    'projecto-1.3.0.json': json(projecto130()),
    'projecto-1.4.2.json': json(projecto142()),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = new URL('../fixtures/', import.meta.url)
  await mkdir(dir, { recursive: true })
  for (const [nome, conteudo] of Object.entries(await gerarFixtures())) {
    await writeFile(new URL(nome, dir), conteudo)
  }
  console.log('tests/fixtures/ reescrita')
}
