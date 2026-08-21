import * as turf from '@turf/turf'
import {
  aggregatePlans,
  composeCellPlans,
  computeAlignment,
  computeFootprint,
  findOptimalDirection,
  generateFlightPlan,
  computeGSD,
  distanceToArea,
  generateFlightLines,
  gridFromAnchor,
  lidarPointDensity,
  lineSpacing,
  longestEdgeBearing,
  nadirLineLocalPerBlock,
  photoInterval,
  rectangleFromAnchor,
  resolveSensor,
  splitIntoBlocks,
  squareSideForBattery,
  tilePolygonWithSquares,
  validateRing,
} from './src/utils/geo.js'
import { buildExportName, buildSimpleKML, buildTemplateKML, buildWaylinesWPML } from './src/utils/exporters.js'
import { buildGcpKML, gcpStats, planGcps, suggestedGcpCount } from './src/utils/gcp.js'
import { decodeTerrarium, despikeElevations, fitSlopePlane, simplifyProfile, terrainFollowLines } from './src/utils/terrain.js'
import { readFileSync } from 'node:fs'
import { groupApplies } from './src/data/checklist.js'
import { decomposeCells, orderCells } from './src/utils/gridRoute.js'
import { DEFAULT_FACE_CONFIG, checkFaceClearance, generateFacePlan, normalizeFaceConfig } from './src/utils/faceMode.js'
import { headingTicks } from './src/utils/preview.js'
import { DEFAULT_ORBIT_CONFIG, generateOrbitPlan, normalizeOrbitConfig, orbitLevelsToBlocks } from './src/utils/orbit.js'
import { inspectionToWaypoints, nearestNeighbourOrder, reorderList } from './src/utils/inspect.js'
import {
  AIRCRAFT,
  PAYLOADS,
  DEFAULT_CUSTOM_SENSOR,
  DEFAULT_SELECTION,
  aglCapWarning,
  batteryMinFor,
  migrateDroneSelection,
} from './src/data/drones.js'

let failures = 0
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`)
  if (!cond) failures++
}

/* 0. Sanidade do hardware — plausibility ranges for every aircraft and
   payload. Guards against data-entry mistakes (a sensor in cm, a focal in
   px, a swapped width/height) rather than wrong-but-plausible values. */
const inRange = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi
for (const a of Object.values(AIRCRAFT)) {
  check(`aeronave ${a.id}: speedRange valido`,
    a.speedRange && a.speedRange.min > 0 && a.speedRange.max >= a.speedRange.min,
    `${a.speedRange?.min}-${a.speedRange?.max} m/s`)
  check(`aeronave ${a.id}: batteryMin 5-120 min`, inRange(a.batteryMin, 5, 120), a.batteryMin)
  check(`aeronave ${a.id}: droneEnumValue numerico`, Number.isFinite(a.wpml?.droneEnumValue))
  check(`aeronave ${a.id}: payloads existem no catalogo`,
    Array.isArray(a.payloads) && a.payloads.length >= 1 && a.payloads.every((pid) => PAYLOADS[pid]),
    a.payloads?.join(','))
}
for (const p of Object.values(PAYLOADS)) {
  check(`payload ${p.id}: payloadEnumValue numerico`, Number.isFinite(p.wpml?.payloadEnumValue))
  if (p.type === 'camera') {
    check(`payload ${p.id}: sensorWidth 4-60 mm`, inRange(p.sensorWidth, 4, 60), p.sensorWidth)
    check(`payload ${p.id}: sensorHeight 3-45 mm`, inRange(p.sensorHeight, 3, 45), p.sensorHeight)
    check(`payload ${p.id}: focalLength 2-100 mm`, inRange(p.focalLength, 2, 100), p.focalLength)
    check(`payload ${p.id}: imageWidth 1000-20000 px`, inRange(p.imageWidth, 1000, 20000), p.imageWidth)
    check(`payload ${p.id}: imageHeight 1000-20000 px`, inRange(p.imageHeight, 1000, 20000), p.imageHeight)
  } else if (p.type === 'lidar') {
    check(`payload ${p.id}: FOV 5-360 graus`, inRange(p.fov, 5, 360), p.fov)
    check(`payload ${p.id}: effectiveFov <= fov`,
      p.effectiveFov == null || (inRange(p.effectiveFov, 5, 360) && p.effectiveFov <= p.fov),
      p.effectiveFov)
  }
}
check('custom default: camara em intervalos validos',
  inRange(DEFAULT_CUSTOM_SENSOR.sensorWidth, 4, 60) &&
    inRange(DEFAULT_CUSTOM_SENSOR.sensorHeight, 3, 45) &&
    inRange(DEFAULT_CUSTOM_SENSOR.focalLength, 2, 100) &&
    inRange(DEFAULT_CUSTOM_SENSOR.imageWidth, 1000, 20000))
check('custom default: FOV LiDAR 5-360 graus', inRange(DEFAULT_CUSTOM_SENSOR.fov, 5, 360),
  DEFAULT_CUSTOM_SENSOR.fov)

/* 0b. Migracao da selecao de hardware (T1.1) — legacy droneId strings and
   current {aircraftId, payloadId} objects both land on valid pairs. */
{
  const sameSel = (a, b) => a.aircraftId === b.aircraftId && a.payloadId === b.payloadId
  check('migra M3E', sameSel(migrateDroneSelection('M3E'), { aircraftId: 'M3E', payloadId: 'M3E_WIDE' }))
  check('migra M4T', sameSel(migrateDroneSelection('M4T'), { aircraftId: 'M4T', payloadId: 'M4T_WIDE' }))
  check('migra M300RTK para P1', sameSel(migrateDroneSelection('M300RTK'), { aircraftId: 'M300RTK', payloadId: 'P1' }))
  check('migra CUSTOM', sameSel(migrateDroneSelection('CUSTOM'), { aircraftId: 'CUSTOM', payloadId: 'CUSTOM' }))
  check('droneId desconhecido cai no default', sameSel(migrateDroneSelection('MAVIC_PRO'), DEFAULT_SELECTION))
  check('par valido passa intacto',
    sameSel(migrateDroneSelection({ aircraftId: 'M300RTK', payloadId: 'CUSTOM' }), { aircraftId: 'M300RTK', payloadId: 'CUSTOM' }))
  check('payload incompativel encaixa no primeiro da aeronave',
    sameSel(migrateDroneSelection({ aircraftId: 'M3E', payloadId: 'P1' }), { aircraftId: 'M3E', payloadId: 'M3E_WIDE' }))
  check('aeronave desconhecida cai no default',
    sameSel(migrateDroneSelection({ aircraftId: 'M600', payloadId: 'P1' }), DEFAULT_SELECTION))
  check('selecao ausente cai no default', sameSel(migrateDroneSelection(undefined), DEFAULT_SELECTION))
  check('default e valido',
    AIRCRAFT[DEFAULT_SELECTION.aircraftId]?.payloads.includes(DEFAULT_SELECTION.payloadId))
}

/* 1. Footprint / GSD / espaçamento — M3E a 100 m */
const sensor = { type: 'camera', sensorWidth: 17.3, sensorHeight: 13.0, focalLength: 12.2, imageWidth: 5280 }
const fp = computeFootprint(sensor, 100)
check('footprint across ~141.8 m', Math.abs(fp.across - 141.8) < 0.1, fp.across.toFixed(2))
check('footprint along ~106.6 m', Math.abs(fp.along - 106.56) < 0.1, fp.along.toFixed(2))
const sp = lineSpacing(fp.across, 70)
check('spacing @70% ~42.5 m', Math.abs(sp - 42.54) < 0.1, sp.toFixed(2))
const iv = photoInterval(fp.along, 80)
check('interval @80% ~21.3 m', Math.abs(iv - 21.31) < 0.1, iv.toFixed(2))
const gsd = computeGSD(sensor, 100)
check('GSD ~2.69 cm/px', Math.abs(gsd - 2.686) < 0.01, gsd.toFixed(3))

/* 1a2. GSD obliquo (R2.4) — alcance inclinado ao centro do quadro */
check('GSD: -90 explicito = nadir (regressao)', computeGSD(sensor, 100, -90) === gsd)
check('GSD: -60 = nadir x 1/sin60 (x1.1547)',
  Math.abs(computeGSD(sensor, 100, -60) / gsd - 1 / Math.sin(Math.PI / 3)) < 1e-9,
  computeGSD(sensor, 100, -60).toFixed(4))
check('GSD: -45 = nadir x 1.4142',
  Math.abs(computeGSD(sensor, 100, -45) / gsd - Math.SQRT2) < 1e-9)
check('GSD: |pitch| < 20 -> null (quase-horizonte)',
  computeGSD(sensor, 100, -15) === null && computeGSD(sensor, 100, 0) === null)

/* 1b. resolveSensor a partir do payload (T1.1) — óticas idênticas às do
   modelo antigo para os perfis que não mudaram. */
{
  const sM3E = resolveSensor(PAYLOADS.M3E_WIDE, DEFAULT_CUSTOM_SENSOR)
  check('payload M3E = sensor de referencia',
    sM3E.type === 'camera' &&
      ['sensorWidth', 'sensorHeight', 'focalLength', 'imageWidth'].every((k) => sM3E[k] === sensor[k]))
  const fpP1 = computeFootprint(resolveSensor(PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR), 100)
  check('P1 footprint across ~102.6 m', Math.abs(fpP1.across - 102.57) < 0.1, fpP1.across.toFixed(2))
  const gsdP1 = computeGSD(resolveSensor(PAYLOADS.P1, DEFAULT_CUSTOM_SENSOR), 100)
  check('P1 GSD ~1.252 cm/px', Math.abs(gsdP1 - 1.2521) < 0.005, gsdP1.toFixed(4))
  const sCustomCam = resolveSensor(PAYLOADS.CUSTOM, DEFAULT_CUSTOM_SENSOR)
  check('payload CUSTOM camara le o customSensor',
    sCustomCam.type === 'camera' && sCustomCam.sensorWidth === DEFAULT_CUSTOM_SENSOR.sensorWidth)
  const sCustomLidar = resolveSensor(PAYLOADS.CUSTOM, { ...DEFAULT_CUSTOM_SENSOR, mode: 'lidar', fov: 75 })
  check('payload CUSTOM lidar le o FOV editado', sCustomLidar.type === 'lidar' && sCustomLidar.fov === 75)
  // lidar payload shape (arrives with T1.2): flies with the working FOV
  const sLidar = resolveSensor({ type: 'lidar', fov: 70.4, effectiveFov: 60 }, DEFAULT_CUSTOM_SENSOR)
  check('payload lidar usa effectiveFov', sLidar.type === 'lidar' && sLidar.fov === 60)
  const sLidarNominal = resolveSensor({ type: 'lidar', fov: 70.4 }, DEFAULT_CUSTOM_SENSOR)
  check('payload lidar sem corte usa fov nominal', sLidarNominal.fov === 70.4)
}

/* 1c. YellowScan Mapper+ no M300 (T1.2) */
{
  const mp = PAYLOADS.MAPPER_PLUS
  check('Mapper+ e payload lidar montavel no M300',
    mp?.type === 'lidar' && AIRCRAFT.M300RTK.payloads.includes('MAPPER_PLUS'))
  const swath = computeFootprint(resolveSensor(mp, DEFAULT_CUSTOM_SENSOR), 100)
  check('Mapper+ faixa ~141 m @100 m (FOV 70.4)', Math.abs(swath.across - 141.1) < 0.5,
    swath.across.toFixed(2))
  const cut = computeFootprint(resolveSensor({ ...mp, effectiveFov: 60 }, DEFAULT_CUSTOM_SENSOR), 100)
  check('Mapper+ corte 60 graus: faixa ~115.5 m', Math.abs(cut.across - 115.47) < 0.5,
    cut.across.toFixed(2))
  check('Mapper+ enum PSDK 65534 e teto 100 m',
    mp.wpml.payloadEnumValue === 65534 && mp.maxAglM === 100 && mp.maxPrr === 240000)
  check('par M300+Mapper+ migra intacto',
    migrateDroneSelection({ aircraftId: 'M300RTK', payloadId: 'MAPPER_PLUS' }).payloadId === 'MAPPER_PLUS')
}

/* 1d. Teto operacional AGL por payload (T1.3) */
{
  const mp = PAYLOADS.MAPPER_PLUS
  check('teto AGL: 90 m nao avisa', aglCapWarning(mp, 90) === null)
  check('teto AGL: 100 m exatos nao avisa', aglCapWarning(mp, 100) === null)
  const w = aglCapWarning(mp, 120)
  check('teto AGL: 120 m avisa', w != null && w.cap === 100 && w.worstAgl === 120,
    w && `${w.worstAgl} > ${w.cap}`)
  const wt = aglCapWarning(mp, 98, { terrainFollowActive: true, toleranceM: 5 })
  check('teto AGL com terrain follow: 98+5 m avisa', wt != null && wt.worstAgl === 103,
    wt && `${wt.worstAgl} > ${wt.cap}`)
  const wtOk = aglCapWarning(mp, 90, { terrainFollowActive: true, toleranceM: 5 })
  check('teto AGL com terrain follow: 90+5 m nao avisa', wtOk === null)
  check('teto AGL: payload sem limite nunca avisa', aglCapWarning(PAYLOADS.M3E_WIDE, 500) === null)
}

/* 1e2. Densidade de pontos LiDAR (T2.1) — âncora: figura publicada do
   Mapper+ (~170 pts/m2 a 100 m AGL, 10 m/s). */
{
  const swath = computeFootprint(resolveSensor(PAYLOADS.MAPPER_PLUS, DEFAULT_CUSTOM_SENSOR), 100).across
  const d = lidarPointDensity({ prr: PAYLOADS.MAPPER_PLUS.maxPrr, speed: 10, swathM: swath })
  check('densidade Mapper+ ~170 pts/m2 @100 m, 10 m/s', Math.abs(d.single - 170) < 2, d.single.toFixed(1))
  check('densidade na sobreposicao = 2x', Math.abs(d.overlap - 2 * d.single) < 1e-9, d.overlap.toFixed(1))
  check('velocidade mais baixa aumenta a densidade',
    lidarPointDensity({ prr: 240000, speed: 5, swathM: swath }).single > d.single)
  check('densidade sem dados validos -> null',
    lidarPointDensity({ prr: 240000, speed: 0, swathM: 141 }) === null &&
      lidarPointDensity({ prr: 0, speed: 10, swathM: 141 }) === null)
}

/* 1e3. Checklist condicional por payload e modo (T2.4/R2.6) */
{
  check('groupApplies: grupo universal aparece sempre',
    groupApplies({ titulo: 'x' }, 'camera') && groupApplies({ titulo: 'x' }, 'lidar'))
  check('groupApplies: grupo lidar so com lidar',
    groupApplies({ appliesTo: 'lidar' }, 'lidar') && !groupApplies({ appliesTo: 'lidar' }, 'camera'))
  check('groupApplies: grupo face so com missao de fachada ativa',
    groupApplies({ appliesTo: 'face' }, 'camera', { face: true }) &&
      !groupApplies({ appliesTo: 'face' }, 'camera') &&
      !groupApplies({ appliesTo: 'face' }, 'lidar', { face: false }))
  check('groupApplies: face independente do tipo de sensor',
    groupApplies({ appliesTo: 'face' }, 'lidar', { face: true }))
  // guarda estrutural: 2 grupos LiDAR + 1 face, filtragem nos tres loops,
  // e o grupo face acrescentado DEPOIS do LiDAR (indices estaveis)
  const chk = readFileSync(new URL('./src/components/ChecklistPage.jsx', import.meta.url), 'utf8')
  check('ChecklistPage: 2 grupos lidar + 1 face',
    (chk.match(/appliesTo: 'lidar'/g) || []).length === 2 &&
      (chk.match(/appliesTo: 'face'/g) || []).length === 1)
  check('ChecklistPage: grupo face depois do grupo lidar de campo',
    chk.indexOf("appliesTo: 'face'") > chk.indexOf("'Manobras de calibração antes das fiadas'"))
  check('ChecklistPage: filtragem aplicada nos loops',
    (chk.match(/groupApplies\(/g) || []).length >= 3)
}

/* 1e. Bateria por combinacao aeronave+payload (T1.4) */
{
  check('bateria: default da aeronave', batteryMinFor(AIRCRAFT.M300RTK, 'P1', {}) === 55)
  check('bateria: override da combinacao vale',
    batteryMinFor(AIRCRAFT.M300RTK, 'MAPPER_PLUS', { 'M300RTK:MAPPER_PLUS': 38 }) === 38)
  check('bateria: outra combinacao nao e afetada',
    batteryMinFor(AIRCRAFT.M300RTK, 'P1', { 'M300RTK:MAPPER_PLUS': 38 }) === 55)
  check('bateria: override invalido cai no default',
    batteryMinFor(AIRCRAFT.M3E, 'M3E_WIDE', { 'M3E:M3E_WIDE': -5 }) === 45)
  check('bateria: overrides ausentes usam defaults',
    batteryMinFor(AIRCRAFT.M4T, 'M4T_WIDE') === 49 && batteryMinFor(AIRCRAFT.CUSTOM, 'CUSTOM') === 25)
}

/* 2. LiDAR por FOV */
const lidar = computeFootprint({ type: 'lidar', fov: 70 }, 100)
check('LiDAR swath ~140 m @FOV70/100m', Math.abs(lidar.across - 140.04) < 0.1, lidar.across.toFixed(2))

/* 3. Retângulo âncora 500×300 orientado a 45° */
const center = [-8.0, 39.5]
const rect = rectangleFromAnchor(center, 500, 300, 45)
check('rect tem 4 vértices', rect.length === 4)
const d01 = turf.distance(rect[0], rect[1], { units: 'meters' })
const d12 = turf.distance(rect[1], rect[2], { units: 'meters' })
check('rect lado A ~500 m', Math.abs(d01 - 500) < 5, d01.toFixed(1))
check('rect lado B ~300 m', Math.abs(d12 - 300) < 5, d12.toFixed(1))
const brg = (turf.bearing(rect[0], rect[1]) + 360) % 180
check('rect orientação ~45°', Math.abs(brg - 45) < 1.5, brg.toFixed(1))
const ctr = turf.centroid(turf.polygon([[...rect, rect[0]]])).geometry.coordinates
check('rect centrado na âncora', turf.distance(ctr, center, { units: 'meters' }) < 1)

/* 4. Validação topológica */
const bowtie = [
  [-8.0, 39.5],
  [-7.99, 39.51],
  [-8.0, 39.51],
  [-7.99, 39.5],
]
const vBad = validateRing(bowtie)
check('bowtie inválido', vBad.valid === false && vBad.kinks.length > 0, `${vBad.kinks.length} kinks`)
const vGood = validateRing(rect)
check('retângulo válido', vGood.valid === true)

/* 5. Grelha E-O (90°) num retângulo 500×300 alinhado N-S */
const rectNS = rectangleFromAnchor(center, 500, 300, 90) // comprimento E-O
const plan90 = generateFlightLines(rectNS, {
  spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10,
})
check('plan90 gerado', plan90 && !plan90.error)
if (plan90 && !plan90.error) {
  check('plan90 ~8 linhas (300/42.5)', plan90.stats.lineCount === 8, plan90.stats.lineCount)
  const len0 = turf.distance(plan90.lines[0][0], plan90.lines[0][1], { units: 'meters' })
  check('plan90 linhas ~500 m', Math.abs(len0 - 500) < 10, len0.toFixed(1))
  const b0 = (turf.bearing(plan90.lines[0][0], plan90.lines[0][1]) + 360) % 180
  check('plan90 azimute ~90°', Math.abs(b0 - 90) < 1, b0.toFixed(1))
  // serpentina: linhas consecutivas em sentidos opostos (diferença angular ~180°)
  const b1 = turf.bearing(plan90.lines[1][0], plan90.lines[1][1])
  const diff = Math.abs(((turf.bearing(plan90.lines[0][0], plan90.lines[0][1]) - b1 + 540) % 360) - 180)
  check('plan90 serpentina (sentidos alternados)', Math.abs(diff - 180) < 2, diff.toFixed(1))
  check('plan90 waypoints = 2×linhas', plan90.stats.waypointCount === 16)
  // espaçamento real entre a 1.ª e 2.ª linha
  const gap = turf.pointToLineDistance(
    turf.point(plan90.lines[1][0]),
    turf.lineString(plan90.lines[0]),
    { units: 'meters' },
  )
  check('plan90 espaçamento real ~42.5 m', Math.abs(gap - sp) < 1, gap.toFixed(2))
}

/* 5a2. Guarda de regressao T3.1/R2.5: num retangulo convexo a rota por
   celulas tem de ser IGUAL a serpentina simples, coordenada a coordenada.
   A serpentina e reconstruida aqui de forma independente: filas por
   latitude ascendente, ziguezague, faixas pares oeste->este. */
if (plan90 && !plan90.error) {
  const rowsMap = new Map()
  plan90.lines.forEach((seg) => {
    const key = ((seg[0][1] + seg[1][1]) / 2).toFixed(9)
    if (!rowsMap.has(key)) rowsMap.set(key, [])
    rowsMap.get(key).push(seg)
  })
  const expected = []
  const rowKeys = [...rowsMap.keys()].sort((a, b) => Number(a) - Number(b))
  rowKeys.forEach((k, r) => {
    const segs = rowsMap.get(k)
      .map((s) => (s[0][0] <= s[1][0] ? s : [s[1], s[0]]))
      .sort((s1, s2) => s1[0][0] - s2[0][0])
    if (r % 2 === 0) segs.forEach((s) => expected.push(s[0], s[1]))
    else segs.slice().reverse().forEach((s) => expected.push(s[1], s[0]))
  })
  const identical =
    expected.length === plan90.waypoints.length &&
    expected.every(
      (p, i) =>
        Math.abs(p[0] - plan90.waypoints[i][0]) < 1e-9 &&
        Math.abs(p[1] - plan90.waypoints[i][1]) < 1e-9,
    )
  check('R2.5: retangulo convexo = serpentina simples (1e-9 deg)', identical,
    `${plan90.waypoints.length} waypoints comparados`)
}

/* 5b. Overshoot por faixa (T2.2) */
{
  const po = generateFlightLines(rectNS, {
    spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10, overshootM: 20,
  })
  check('overshoot: plano gerado', po && !po.error)
  if (po && !po.error) {
    const len0 = turf.distance(po.lines[0][0], po.lines[0][1], { units: 'meters' })
    check('overshoot 20: faixas ~40 m mais longas', Math.abs(len0 - 540) < 10, len0.toFixed(1))
    check('overshoot: mesmo numero de faixas', po.stats.lineCount === plan90.stats.lineCount,
      `${po.stats.lineCount} vs ${plan90.stats.lineCount}`)
    check('overshoot: fotos sobre a area < fotos totais',
      po.stats.photoCountArea != null && po.stats.photoCountArea < po.stats.photoCount,
      `${po.stats.photoCountArea} < ${po.stats.photoCount}`)
    check('overshoot: fotos/area = fotos do plano sem overshoot',
      po.stats.photoCountArea === plan90.stats.photoCount,
      `${po.stats.photoCountArea} vs ${plan90.stats.photoCount}`)
    check('sem overshoot: photoCountArea null', plan90.stats.photoCountArea === null)
    check('overshoot conta para o percurso',
      po.stats.pathLengthM > plan90.stats.pathLengthM + 8 * 40 - 20,
      `${po.stats.pathLengthM.toFixed(0)} vs ${plan90.stats.pathLengthM.toFixed(0)}`)
  }
}

/* 5c. Fiada de amarracao perpendicular (T2.3) */
{
  const base = { spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10 }
  const pt2 = generateFlightLines(rectNS, { ...base, tieLine: true })
  check('tie: +1 faixa', pt2 && !pt2.error && pt2.stats.lineCount === plan90.stats.lineCount + 1,
    pt2?.stats.lineCount)
  const tie = pt2.lines[pt2.lines.length - 1]
  const bTie = (turf.bearing(tie[0], tie[1]) + 360) % 180
  check('tie: perpendicular as faixas (~0 graus)', bTie < 2 || bTie > 178, bTie.toFixed(1))
  const lenTie = turf.distance(tie[0], tie[1], { units: 'meters' })
  check('tie: atravessa a largura do bloco (~300 m)', Math.abs(lenTie - 300) < 10, lenTie.toFixed(1))
  const midT = turf.midpoint(turf.point(tie[0]), turf.point(tie[1]))
  check('tie: a meio e dentro da area',
    turf.booleanPointInPolygon(midT, turf.polygon([[...rectNS, rectNS[0]]])))
  const pt3 = generateFlightLines(rectNS, { ...base, tieLine: true, overshootM: 20 })
  const tie3 = pt3.lines[pt3.lines.length - 1]
  check('tie com overshoot: ~340 m',
    Math.abs(turf.distance(tie3[0], tie3[1], { units: 'meters' }) - 340) < 10,
    turf.distance(tie3[0], tie3[1], { units: 'meters' }).toFixed(1))
  const cx = generateFlightPlan(rectNS, { ...base, crosshatch: true, tieLine: true })
  check('crosshatch: fiada so na 1.a grelha',
    cx && !cx.error && cx.stats.lineCount >= 21 && cx.stats.lineCount <= 22, cx?.stats.lineCount)
}

/* 6. Grelha N-S (0°) */
const plan0 = generateFlightLines(rectNS, {
  spacingM: sp, angleDeg: 0, bufferPct: 0, photoIntervalM: iv, speed: 10,
})
check('plan0 gerado', plan0 && !plan0.error)
if (plan0 && !plan0.error) {
  check('plan0 ~12-13 linhas (500/42.5)', plan0.stats.lineCount >= 12 && plan0.stats.lineCount <= 13, plan0.stats.lineCount)
  const b0 = (turf.bearing(plan0.lines[0][0], plan0.lines[0][1]) + 360) % 180
  check('plan0 azimute ~0°', b0 < 1 || b0 > 179, b0.toFixed(1))
}

/* 7. Buffer 20% aumenta a área coberta */
const plan20 = generateFlightLines(rectNS, {
  spacingM: sp, angleDeg: 90, bufferPct: 20, photoIntervalM: iv, speed: 10,
})
check('plan20 gerado', plan20 && !plan20.error)
if (plan20 && !plan20.error) {
  check('buffer aumenta área', plan20.stats.bufferedAreaHa > plan20.stats.areaHa * 1.15,
    `${plan20.stats.areaHa.toFixed(1)} → ${plan20.stats.bufferedAreaHa.toFixed(1)} ha`)
  const len0 = turf.distance(plan20.lines[0][0], plan20.lines[0][1], { units: 'meters' })
  check('buffer alonga linhas', len0 > 520, len0.toFixed(1))
}

/* 8. Polígono côncavo (forma em L) — linhas cortadas dentro da área */
const mLon = 111320 * Math.cos((39.5 * Math.PI) / 180)
const toLL = (xm, ym) => [-8.0 + xm / mLon, 39.5 + ym / 110574]
const lShape = [toLL(0, 0), toLL(600, 0), toLL(600, 250), toLL(350, 250), toLL(350, 600), toLL(0, 600)]
check('L-shape válido', validateRing(lShape).valid)
const planL = generateFlightLines(lShape, {
  spacingM: 50, angleDeg: 0, bufferPct: 0, photoIntervalM: iv, speed: 10,
})
check('planL gerado', planL && !planL.error)
if (planL && !planL.error) {
  // linhas N-S: x<350 atravessa tudo (~600m), x>350 só a base (~250m)
  const lens = planL.lines.map((s) => turf.distance(s[0], s[1], { units: 'meters' }))
  check('planL linhas longas e curtas', lens.some((l) => l > 550) && lens.some((l) => l < 300),
    lens.map((l) => l.toFixed(0)).join(','))
  // todos os pontos médios dentro do polígono
  const poly = turf.polygon([[...lShape, lShape[0]]])
  const allInside = planL.lines.every((s) =>
    turf.booleanPointInPolygon(turf.midpoint(turf.point(s[0]), turf.point(s[1])), poly),
  )
  check('planL troços dentro da área', allInside)
}

/* 8a2. Decomposição celular boustrophedon (T3.1, port do FlyPath) */
{
  // duas linhas cheias, depois duas com um vão ao meio → 3 células:
  // base + dois braços, ambos adjacentes à base
  const rows = [
    [0, [[0, 10]]],
    [1, [[0, 10]]],
    [2, [[0, 4], [6, 10]]],
    [3, [[0, 4], [6, 10]]],
  ]
  const { cells, adjacency } = decomposeCells(rows, 1e-9)
  check('decompose: 3 células (base + 2 braços)', cells.length === 3, cells.length)
  check('decompose: braços adjacentes à base',
    adjacency[0].size === 2 && adjacency[1].has(0) && adjacency[2].has(0))
  const route = orderCells(cells, adjacency)
  check('decompose: rota com 2 pontos por passagem', route.length === (2 + 2 + 2) * 2, route.length)
  // uma linha vazia quebra a conectividade como um vão real
  const rowsGap = [
    [0, [[0, 10]]],
    [1, []],
    [2, [[0, 10]]],
  ]
  const gap = decomposeCells(rowsGap, 1e-9)
  check('decompose: linha vazia separa células', gap.cells.length === 2 && gap.adjacency[0].size === 0)
}

/* 8a3. Percurso côncavo-seguro num U (T3.1) */
{
  // U a abrir para norte: braços verticais x∈[0,200] e x∈[400,600],
  // base y∈[0,200]; linhas E-O → as filas acima de y=200 têm 2 troços
  const uShape = [
    toLL(0, 0), toLL(600, 0), toLL(600, 600), toLL(400, 600),
    toLL(400, 200), toLL(200, 200), toLL(200, 600), toLL(0, 600),
  ]
  check('U válido', validateRing(uShape).valid)
  const pu = generateFlightLines(uShape, {
    spacingM: 47, angleDeg: 90, bufferPct: 0, photoIntervalM: 0, speed: 10,
  })
  check('U gerado', pu && !pu.error)
  const polyU = turf.polygon([[...uShape, uShape[0]]])
  const edgeU = turf.lineString([...uShape, uShape[0]])
  // dentro OU em cima da fronteira (as pernas de ziguezague correm ao longo
  // da aresta; o ruído do rotate-back poe o ponto medio ~1e-12 fora)
  const inU = (mid) =>
    turf.booleanPointInPolygon(mid, polyU) ||
    turf.pointToLineDistance(mid, edgeU, { units: 'meters' }) < 0.5
  let allIn = true
  for (let i = 1; i + 1 < pu.waypoints.length; i += 2) {
    const mid = turf.midpoint(turf.point(pu.waypoints[i]), turf.point(pu.waypoints[i + 1]))
    if (!inU(mid)) allIn = false
  }
  check('U: ligações entre passagens dentro da área', allIn)

  // reconstrução da serpentina antiga (ordem por fila, ziguezague) para
  // comparação: com angle 90 não há rotação, as filas são latitudes
  const rowsMap = new Map()
  pu.lines.forEach((seg) => {
    const key = ((seg[0][1] + seg[1][1]) / 2).toFixed(6)
    if (!rowsMap.has(key)) rowsMap.set(key, [])
    rowsMap.get(key).push(seg)
  })
  const legacy = []
  const keys = [...rowsMap.keys()].sort((a, b) => Number(a) - Number(b))
  keys.forEach((kk, r) => {
    const segs = rowsMap.get(kk)
      .map((s) => (s[0][0] <= s[1][0] ? s : [s[1], s[0]]))
      .sort((s1, s2) => s1[0][0] - s2[0][0])
    if (r % 2 === 0) segs.forEach((s) => legacy.push(s[0], s[1]))
    else segs.slice().reverse().forEach((s) => legacy.push(s[1], s[0]))
  })
  let legacyLen = 0
  for (let i = 1; i < legacy.length; i++) {
    legacyLen += turf.distance(legacy[i - 1], legacy[i], { units: 'meters' })
  }
  check('U: percurso ≤ serpentina antiga', pu.stats.pathLengthM <= legacyLen + 1,
    `${pu.stats.pathLengthM.toFixed(0)} vs ${legacyLen.toFixed(0)} m`)
  check('U: ganho real sobre a serpentina', pu.stats.pathLengthM < legacyLen - 100,
    `poupa ${(legacyLen - pu.stats.pathLengthM).toFixed(0)} m`)
  let legacyOut = false
  for (let i = 1; i + 1 < legacy.length; i += 2) {
    const mid = turf.midpoint(turf.point(legacy[i]), turf.point(legacy[i + 1]))
    if (!inU(mid)) legacyOut = true
  }
  check('U: a ordem antiga atravessava o vão (controlo)', legacyOut)
}

/* 8a4. Direcao otima de voo (T3.2, port do FlyPath) */
{
  const opt = findOptimalDirection(rectNS, sp)
  const d90 = Math.min(Math.abs(opt - 90), 180 - Math.abs(opt - 90))
  check('otima: retangulo longo concorda com a aresta longa (±5°)', d90 <= 5, `${opt}°`)

  const gen = (ring, ang) => generateFlightLines(ring, {
    spacingM: 50, angleDeg: ang, bufferPct: 0, photoIntervalM: 0, speed: 10,
  }).stats.lineCount

  // trapezio com a aresta mais longa na diagonal (~104°): voar ao longo
  // dela e otimo, e a pesquisa deve concordar com a heuristica da aresta
  const trap = [toLL(0, 0), toLL(600, 0), toLL(600, 150), toLL(0, 300)]
  const edgeT = longestEdgeBearing(trap)
  const optT = findOptimalDirection(trap, 50)
  const dT = Math.min(Math.abs(optT - edgeT), 180 - Math.abs(optT - edgeT))
  check('otima: concorda com a diagonal do trapezio (±6°)', dT <= 6 && gen(trap, optT) <= gen(trap, edgeT),
    `${Math.round(optT)}° vs aresta ${Math.round(edgeT)}°`)

  // num U de bracos verticais com base larga, a aresta mais longa (base,
  // 90°) parte as fiadas em dois trocos por fila acima da base — a
  // pesquisa evita a concavidade e bate a heuristica
  const uShape2 = [
    toLL(0, 0), toLL(700, 0), toLL(700, 600), toLL(450, 600),
    toLL(450, 200), toLL(250, 200), toLL(250, 600), toLL(0, 600),
  ]
  const edgeU = longestEdgeBearing(uShape2)
  const optU = findOptimalDirection(uShape2, 50)
  const nOptU = gen(uShape2, optU)
  const nEdgeU = gen(uShape2, edgeU)
  check('otima: bate a aresta mais longa no U', nOptU < nEdgeU,
    `${nOptU} faixas a ${Math.round(optU)}° < ${nEdgeU} a ${Math.round(edgeU)}°`)

  // no L classico nunca e pior do que a heuristica
  const nOptL = gen(lShape, findOptimalDirection(lShape, 50))
  const nEdgeL = gen(lShape, longestEdgeBearing(lShape))
  check('otima: nunca pior que a aresta no L', nOptL <= nEdgeL, `${nOptL} <= ${nEdgeL}`)
}

/* 8b. Direção de referência e distância da base */
const edgeAz = longestEdgeBearing(rectNS) // comprimento 500 m ao longo de E-O
check('longestEdgeBearing ~90°', Math.abs(edgeAz - 90) < 1.5, edgeAz.toFixed(1))
const inside = distanceToArea(center, rectNS)
check('base dentro da área → 0', inside === 0)
const far = distanceToArea([-8.02, 39.5], rectNS) // ~1.7 km a oeste do centro
check('base fora → distância ao contorno', far > 1000 && far < 2000, far.toFixed(0))

/* 8c. Divisão em blocos de voo */
if (plan90 && !plan90.error) {
  // por área: cada faixa cobre ~500×42.5 m ≈ 2.13 ha; máx 5 ha → 2 faixas/bloco → 4 blocos
  const bArea = splitIntoBlocks(plan90, {
    mode: 'area', maxAreaHa: 5, batteryMin: 25, reservePct: 30, speed: 10, spacingM: sp, basePoint: null,
  })
  check('blocos por área: 4 blocos de 2 faixas', bArea?.length === 4 && bArea.every((b) => b.lines.length === 2),
    bArea?.map((b) => b.lines.length).join('+'))
  check('blocos numerados 1..n', bArea?.every((b, i) => b.id === i + 1))
  const totalLines = bArea?.reduce((s, b) => s + b.lines.length, 0)
  check('blocos preservam todas as faixas', totalLines === plan90.stats.lineCount)

  // por bateria: 5 min × 70% = 210 s úteis; faixa ≈ 53 s + ligação ≈ 4 s → 3+3+2
  const bBat = splitIntoBlocks(plan90, {
    mode: 'battery', maxAreaHa: 20, batteryMin: 5, reservePct: 30, speed: 10, spacingM: sp, basePoint: null,
  })
  check('blocos por bateria: 3 blocos', bBat?.length === 3, bBat?.map((b) => b.lines.length).join('+'))
  check('tempo por bloco ≤ 210 s', bBat?.every((b) => b.timeS <= 215), bBat?.map((b) => Math.round(b.timeS)).join(','))

  // com base marcada, o trânsito reduz o tempo útil → mais blocos (ou igual)
  const bBase = splitIntoBlocks(plan90, {
    mode: 'battery', maxAreaHa: 20, batteryMin: 5, reservePct: 30, speed: 10, spacingM: sp,
    basePoint: [center[0] - 0.01, center[1]],
  })
  check('trânsito à base contabilizado', bBase && bBase.length >= bBat.length && bBase[0].transitS > 100,
    `${bBase?.length} blocos, transito ${Math.round(bBase?.[0].transitS)} s`)
}

/* 8c-bis. Fits-check exclui a ligacao entre faixas (T0.5) */
{
  // Two 250 m lines with a 100 m hop between them; battery budget 60 s.
  // Each line's own cost is 250/10 + 3 = 28 s, so both fit (56 <= 60 s).
  // The old fits-check also charged the 10 s connection and split them
  // into 2 blocks even though the second line opens no such connection.
  const twoLines = {
    lines: [
      [toLL(0, 0), toLL(250, 0)],
      [toLL(350, 0), toLL(600, 0)],
    ],
  }
  const bb = splitIntoBlocks(twoLines, {
    mode: 'battery', maxAreaHa: 20, batteryMin: 2, reservePct: 50, speed: 10, spacingM: 40, basePoint: null,
  })
  check('fits sem ligacao: 1 bloco de 2 faixas', bb?.length === 1 && bb[0].lines.length === 2,
    bb?.map((b) => b.lines.length).join('+'))
  // flown time may exceed the budget by at most that one connection
  check('excesso limitado a uma ligacao (~10 s)', bb?.[0].timeS > 60 && bb?.[0].timeS <= 70.5,
    bb?.[0].timeS?.toFixed(1))
}

/* 8d. Grelha de blocos (células) */
const grid = gridFromAnchor(center, 250, 250, 90, 3, 2)
check('grelha 3×2: 6 células', grid.cells.length === 6)
const outW = turf.distance(grid.outline[0], grid.outline[1], { units: 'meters' })
const outH = turf.distance(grid.outline[1], grid.outline[2], { units: 'meters' })
check('grelha contorno ~750×500 m', Math.abs(outW - 750) < 8 && Math.abs(outH - 500) < 8,
  `${outW.toFixed(0)}×${outH.toFixed(0)}`)
const cellSides = grid.cells.map((c) => turf.distance(c[0], c[1], { units: 'meters' }))
check('células ~250 m de lado', cellSides.every((s) => Math.abs(s - 250) < 5))
const centroids = grid.cells.map((c) => turf.centroid(turf.polygon([[...c, c[0]]])).geometry.coordinates)
let snakeOk = true
for (let i = 1; i < centroids.length; i++) {
  const d = turf.distance(centroids[i - 1], centroids[i], { units: 'meters' })
  if (Math.abs(d - 250) > 10) snakeOk = false
}
check('células em serpentina (vizinhas a ~250 m)', snakeOk,
  centroids.slice(1).map((c, i) => turf.distance(centroids[i], c, { units: 'meters' }).toFixed(0)).join(','))
const cellPlan = generateFlightLines(grid.cells[0], {
  spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10,
})
check('plano por célula gerado (~6-7 faixas)', cellPlan && !cellPlan.error && cellPlan.stats.lineCount >= 6 && cellPlan.stats.lineCount <= 7,
  cellPlan?.stats.lineCount)

/* 8e. Mosaico automático sobre polígono */
// L-shape ~600×600 m: mosaico de 250 m → malha 3×3, canto NE (interior do L) sem célula?
// O L cobre a coluna oeste inteira e a base — todas as 9 células intersetam menos a NE?
// (o recorte do L é 250..600 × 250..600 → células (c1..2, r1..2) exceto as que tocam o L)
const mosaic = tilePolygonWithSquares(lShape, 250, 0)
check('mosaico gerado', Array.isArray(mosaic) && mosaic.length >= 6 && mosaic.length <= 9, mosaic?.length)
if (Array.isArray(mosaic)) {
  const side = turf.distance(mosaic[0][0], mosaic[0][1], { units: 'meters' })
  check('mosaico células ~250 m', Math.abs(side - 250) < 5, side.toFixed(1))
  const polyL = turf.polygon([[...lShape, lShape[0]]])
  const allTouch = mosaic.every((cell) =>
    turf.booleanIntersects(turf.polygon([[...cell, cell[0]]]), polyL),
  )
  check('todas as células intersetam o polígono', allTouch)
}
const mosaicRot = tilePolygonWithSquares(lShape, 250, 45)
check('mosaico rodado 45° gerado', Array.isArray(mosaicRot) && mosaicRot.length > 0, mosaicRot?.length)
if (Array.isArray(mosaicRot)) {
  // numa malha quadrada as arestas alternam entre θ e θ+90 — a 2.ª aresta do
  // anel é a família alinhada com a orientação pedida
  const b = (turf.bearing(mosaicRot[0][1], mosaicRot[0][2]) + 360) % 180
  check('mosaico rodado: arestas a ~45°', Math.abs(b - 45) < 2, b.toFixed(1))
}
const mosaicTiny = tilePolygonWithSquares(lShape, 20, 0)
check('mosaico minúsculo → erro controlado', mosaicTiny?.error === 'too-many-cells')

/* 8f. Alinhamento global: faixas oblíquas colineares entre células */
{
  const outline = rectangleFromAnchor(center, 500, 250, 90) // 2 células de 250
  const grid2 = gridFromAnchor(center, 250, 250, 90, 2, 1)
  const align = computeAlignment(outline, sp, 45)
  check('alignment calculado', align && align.latStep > 0)
  const opts45 = { spacingM: sp, angleDeg: 45, bufferPct: 0, photoIntervalM: iv, speed: 10, align }
  const pA = generateFlightLines(grid2.cells[0], opts45)
  const pB = generateFlightLines(grid2.cells[1], opts45)
  check('células planeadas com align', pA && !pA.error && pB && !pB.error)
  if (pA?.lines && pB?.lines) {
    // todas as faixas (de ambas as células) devem estar a múltiplos exatos do
    // espaçamento medidos a partir do pivô comum — logo, colineares entre células
    const pivotPt = turf.point(align.pivot)
    const residuals = [...pA.lines, ...pB.lines].map((seg) => {
      const brg = turf.bearing(seg[0], seg[1])
      const far1 = turf.destination(seg[0], 5, brg + 180, { units: 'kilometers' })
      const far2 = turf.destination(seg[1], 5, brg, { units: 'kilometers' })
      const ext = turf.lineString([far1.geometry.coordinates, far2.geometry.coordinates])
      const d = turf.pointToLineDistance(pivotPt, ext, { units: 'meters' })
      const r = d % sp
      return Math.min(r, sp - r)
    })
    const worst = Math.max(...residuals)
    check('faixas oblíquas em múltiplos do espaçamento (colineares)', worst < 1,
      `resíduo máx ${worst.toFixed(2)} m em ${residuals.length} faixas`)
  }
}

/* 8f2. Celulas alinhadas MAIS ESTREITAS que o espacamento (A1) — reproducao
   do defeito do audit: 500x300 m a lat 41 em 10 filas de 500x30 m, espacamento
   50 m, angulo 90, alinhamento global do contorno. Antes, as celulas 3 e 8
   (y 60-90 e 210-240 m) devolviam null e desapareciam da missao. */
{
  const c41 = [-8.0, 41.0]
  const grid10 = gridFromAnchor(c41, 500, 30, 90, 1, 10)
  const alignN = computeAlignment(grid10.outline, 50, 90)
  const optsN = { spacingM: 50, angleDeg: 90, bufferPct: 0, photoIntervalM: 0, speed: 10, align: alignN }
  const plans = grid10.cells.map((cell) => generateFlightLines(cell, optsN))
  check('A1: 10/10 celulas estreitas com plano (zero nulls)',
    plans.every((p) => p && !p.error), plans.map((p) => (p && !p.error ? '1' : '0')).join(''))
  const insideOwn = plans.every((p, i) => {
    if (!p || p.error) return false
    const poly = turf.polygon([[...grid10.cells[i], grid10.cells[i][0]]])
    return p.lines.every((s) =>
      turf.booleanPointInPolygon(turf.midpoint(turf.point(s[0]), turf.point(s[1])), poly))
  })
  check('A1: todas as passagens com o ponto medio dentro da propria celula', insideOwn)
  // desvio lateral maximo face a regua global: <= latStep/2 (~10 m aqui)
  const worstStep = Math.max(...plans.map((p) => {
    const lat = p.lines[0][0][1]
    const r = Math.abs(((lat - alignN.yRef) / alignN.latStep) % 1)
    return Math.min(r, 1 - r) * 50
  }))
  check('A1: desvio face a regua global <= 10.2 m', worstStep <= 10.2, worstStep.toFixed(2) + ' m')

  // composicao: celula sem plano -> erro explicito (indices 1-based), nunca
  // uma missao mais curta; erro de celula propaga-se tal e qual
  const composed = composeCellPlans(grid10.outline, [plans[0], null, plans[2]], { photoIntervalM: 0 })
  check('A1: celula sem plano -> cell-uncovered [2]',
    composed?.error === 'cell-uncovered' && composed.cells.join(',') === '2')
  check('A1: varias celulas em falta listadas',
    composeCellPlans(grid10.outline, [null, plans[1], null], {}).cells.join(',') === '1,3')
  check('A1: erro de uma celula propaga-se',
    composeCellPlans(grid10.outline, [plans[0], { error: 'too-many-lines' }], {}).error === 'too-many-lines')
  const full = composeCellPlans(grid10.outline, plans, { photoIntervalM: 0 })
  check('A1: composicao completa soma as 10 celulas',
    full && !full.error && full.cellPlans.length === 10 &&
      full.stats.lineCount === plans.reduce((a, p) => a + p.stats.lineCount, 0))
}

/* 8f3. Regua global exactamente na aresta partilhada (A1): a linha k=0 a
   0 graus coincide com a aresta entre as duas celulas do 2x1 — voa-se UMA
   vez (recuada 0.1 m para dentro da celula de cima), nunca duas */
{
  const outline2 = rectangleFromAnchor(center, 500, 250, 90)
  const grid2b = gridFromAnchor(center, 250, 250, 90, 2, 1)
  const align0 = computeAlignment(outline2, sp, 0)
  const pl = grid2b.cells.map((c) => generateFlightLines(c, {
    spacingM: sp, angleDeg: 0, bufferPct: 0, photoIntervalM: iv, speed: 10, align: align0,
  }))
  const lons = pl.flatMap((p) => p.lines.map((s) => ((s[0][0] + s[1][0]) / 2 - center[0]) * mLon)).sort((a, b) => a - b)
  const gaps = lons.slice(1).map((x, i) => x - lons[i])
  check('A1: linha da aresta partilhada voada uma so vez (gap minimo ~espacamento)',
    Math.min(...gaps) > sp - 0.5, Math.min(...gaps).toFixed(2) + ' m')
  check('A1: a linha da aresta fica a 0.1 m da aresta, dentro de uma das celulas',
    lons.some((x) => Math.abs(x) > 0.05 && Math.abs(x) < 0.2), lons.map((x) => x.toFixed(2)).join(','))
}

/* 8g. Lado do quadrado por bateria */
{
  const base = { batteryMin: 25, reservePct: 30, speed: 10, spacingM: sp, transitS: 0 }
  const uncapped = squareSideForBattery({ ...base, maxSideM: 2000 })
  check('lado por bateria (25 min/30%) ~610 m', uncapped >= 590 && uncapped <= 630, uncapped)
  const capped = squareSideForBattery({ ...base, maxSideM: 500 })
  check('teto VLOS aplicado (500 m)', capped === 500, capped)
  const small = squareSideForBattery({ ...base, batteryMin: 12, maxSideM: 2000 })
  check('bateria menor → lado menor', small >= 380 && small <= 420, small)
  // verificação do modelo: um quadrado com o lado devolvido cabe no tempo útil
  const L = uncapped
  const n = L / sp + 1
  const timeS = (L * L / sp + 2 * L) / 10 + n * 3
  check('tempo do bloco ≤ tempo útil', timeS <= 25 * 60 * 0.7 + 1, `${Math.round(timeS)} s ≤ 1050 s`)
  const transit = squareSideForBattery({ ...base, transitS: 300, maxSideM: 2000 })
  check('trânsito reduz o lado', transit < uncapped, `${transit} < ${uncapped}`)
}

/* 8h. Dupla grelha (crosshatch) */
{
  const cross = generateFlightPlan(rectNS, {
    spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10, crosshatch: true,
  })
  check('crosshatch gerado', cross && !cross.error)
  if (cross && !cross.error) {
    check('crosshatch: 8 + 12-13 faixas', cross.stats.lineCount >= 20 && cross.stats.lineCount <= 21,
      cross.stats.lineCount)
    const bearings = cross.lines.map((s) => Math.round(((turf.bearing(s[0], s[1]) % 180) + 180) % 180))
    const has90 = bearings.some((b) => Math.abs(b - 90) < 2)
    const has0 = bearings.some((b) => b < 2 || b > 178)
    check('crosshatch: duas famílias perpendiculares', has90 && has0)
    const single = generateFlightLines(rectNS, {
      spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10,
    })
    check('crosshatch: tempo ~2× grelha simples',
      cross.stats.flightTimeS > single.stats.flightTimeS * 1.7,
      `${Math.round(cross.stats.flightTimeS)} vs ${Math.round(single.stats.flightTimeS)} s`)
  }
  const sideCross = squareSideForBattery({
    batteryMin: 25, reservePct: 30, speed: 10, spacingM: sp, transitS: 0, maxSideM: 2000, passes: 2,
  })
  check('bateria com crosshatch → lado menor', sideCross >= 400 && sideCross <= 440, sideCross)
}

/* 8h2. Passagem nadir extra no preset 3D (R2.10) */
{
  const base = { spacingM: sp, angleDeg: 90, bufferPct: 0, photoIntervalM: iv, speed: 10, crosshatch: true }
  const two = generateFlightPlan(rectNS, base)
  const three = generateFlightPlan(rectNS, { ...base, includeNadir: true })
  check('nadir: 3.a grelha = repetir a 1.a no fim',
    three && !three.error &&
      three.stats.lineCount === two.stats.lineCount + plan90.stats.lineCount,
    `${three?.stats.lineCount} = ${two.stats.lineCount} + ${plan90.stats.lineCount}`)
  check('nadir: nadirStartLine e waypoint no fim das duas grelhas',
    three.nadirStartLine === two.stats.lineCount &&
      three.nadirStartWaypoint === two.stats.waypointCount)
  check('nadir: fotos somam a 3.a passagem',
    three.stats.photoCount === two.stats.photoCount + plan90.stats.photoCount)
  check('nadir: tempo cresce ~50% face ao crosshatch',
    three.stats.flightTimeS > two.stats.flightTimeS * 1.3 &&
      three.stats.flightTimeS < two.stats.flightTimeS * 1.8,
    `${Math.round(three.stats.flightTimeS)} vs ${Math.round(two.stats.flightTimeS)} s`)
  check('nadir: sem a opcao o crosshatch fica igual',
    two.nadirStartLine === null && two.stats.lineCount >= 20 && two.stats.lineCount <= 21)
  const side3 = squareSideForBattery({
    batteryMin: 25, reservePct: 30, speed: 10, spacingM: sp, transitS: 0, maxSideM: 2000, passes: 3,
  })
  const side2 = squareSideForBattery({
    batteryMin: 25, reservePct: 30, speed: 10, spacingM: sp, transitS: 0, maxSideM: 2000, passes: 2,
  })
  check('nadir: bateria com 3 passagens da lado menor', side3 < side2, `${side3} < ${side2}`)
  // aritmetica das anotacoes por bloco: [3,3,2] com nadir na linha global 4
  check('nadir: anotacao por bloco [3,3,2]@4 -> [null,1,0]',
    JSON.stringify(nadirLineLocalPerBlock([3, 3, 2], 4)) === '[null,1,0]')
  check('nadir: sem nadir -> tudo null',
    nadirLineLocalPerBlock([3, 3], null).every((v) => v === null))
  check('nadir: nadir na fronteira do bloco -> [null,0]',
    JSON.stringify(nadirLineLocalPerBlock([3, 3], 3)) === '[null,0]')
  // exportacao: o marcador roda o gimbal a -90 no waypoint certo
  const pwN = []
  pwN[three.nadirStartWaypoint] = { gimbalPitch: -90 }
  const wlN = buildWaylinesWPML({
    name: 'tri', waypoints: three.waypoints, altitude: 100, speed: 10,
    wpml: { droneEnumValue: 77, droneSubEnumValue: 0, payloadEnumValue: 66, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
    photoIntervalM: iv, triggerMode: 'distance', gimbalPitch: -60, perWaypoint: pwN,
  })
  check('nadir: WPML com -60 global e -90 no arranque da 3.a grelha',
    wlN.includes('<wpml:gimbalPitchRotateAngle>-60</wpml:gimbalPitchRotateAngle>') &&
      wlN.includes('<wpml:gimbalPitchRotateAngle>-90</wpml:gimbalPitchRotateAngle>') &&
      wlN.includes(`<wpml:actionGroupStartIndex>${three.nadirStartWaypoint}</wpml:actionGroupStartIndex>`))
}

/* 8i. Planeamento de GCPs */
{
  check('suggestedGcpCount: 3 ha → 5', suggestedGcpCount(3) === 5)
  check('suggestedGcpCount: 50 ha → 15', suggestedGcpCount(50) === 15)
  check('suggestedGcpCount: 500 ha → 25 (teto)', suggestedGcpCount(500) === 25)
  const g7 = planGcps(rectNS, 7)
  check('planGcps: 7 pontos', g7.length === 7, g7.length)
  const polyR = turf.polygon([[...rectNS, rectNS[0]]])
  check('GCPs todos dentro', g7.every((g) => turf.booleanPointInPolygon(turf.point(g.point), polyR)))
  const st = gcpStats(rectNS, g7)
  check('GCPs espaçamento mín > 40 m', st.minSpacingM > 40, st.minSpacingM.toFixed(0))
  check('GCPs ids sequenciais', g7[0].id === 'GCP-01' && g7[6].id === 'GCP-07')
  const gk = buildGcpKML(g7, 'teste-gcps')
  check('GCP KML: 7 placemarks', (gk.match(/<Placemark>/g) || []).length === 7)
  const gL = planGcps(lShape, 8)
  const polyL2 = turf.polygon([[...lShape, lShape[0]]])
  check('GCPs em polígono côncavo dentro', gL.length >= 6 && gL.every((g) => turf.booleanPointInPolygon(turf.point(g.point), polyL2)), gL.length)
}

/* 8j. Terrain follow (elevação sintética) */
{
  check('decodeTerrarium: nível do mar', decodeTerrarium(128, 0, 0) === 0)
  check('decodeTerrarium: 500 m', decodeTerrarium(129, 244, 0) === 500)

  const flat = Array.from({ length: 20 }, (_, i) => ({ distM: i * 40, value: 300 }))
  const idxFlat = simplifyProfile(flat, 5)
  check('perfil plano → só extremos', idxFlat.length === 2 && idxFlat[0] === 0 && idxFlat[1] === 19)
  const peaked = flat.map((p, i) => ({ ...p, value: i === 10 ? 340 : 300 }))
  const idxPeak = simplifyProfile(peaked, 5)
  check('pico de 40 m retido', idxPeak.includes(10))

  // terreno sintético: rampa Este-Oeste de ~100 m de desnível pelos 500 m da área
  const rampa = {
    elevationAt: (lon) => 200 + (lon - center[0]) * mLon * 0.2, // 0.2 m por metro
  }
  if (plan90 && !plan90.error) {
    const tf = terrainFollowLines(rampa, plan90.lines, {
      agl: 100,
      refElev: 200,
      toleranceM: 5,
      stepM: 40,
    })
    check('terrain follow gerado', tf.waypoints.length >= plan90.lines.length * 2)
    check('perLine soma = waypoints', tf.perLine.reduce((a, b) => a + b, 0) === tf.waypoints.length)
    // rampa linear → cada faixa E-O precisa só dos extremos
    check('rampa linear → 2 wp/faixa', tf.perLine.every((n) => n === 2), tf.perLine.join(','))
    // alturas corretas: agl + (elev − ref); extremos a ±250 m do centro → ±50 m
    const hs = tf.waypoints.map((w) => w[2])
    const hMin = Math.min(...hs)
    const hMax = Math.max(...hs)
    check('alturas seguem a rampa (~50 a ~150)', Math.abs(hMin - 50) < 3 && Math.abs(hMax - 150) < 3,
      `${hMin.toFixed(1)}–${hMax.toFixed(1)}`)
    check('elevMin/Max do terreno coerentes', tf.elevMin >= 145 && tf.elevMax <= 255,
      `${tf.elevMin.toFixed(0)}–${tf.elevMax.toFixed(0)}`)
  }
}

/* 8j2. Plano medio da encosta (T4.5) */
{
  // rampa que sobe 0.2 m/m para Este: inclinacao atan(0.2) = 11.31 graus,
  // desce para Oeste (270), curvas de nivel N-S (0)
  const rampa = { elevationAt: (lon) => 200 + (lon - center[0]) * mLon * 0.2 }
  const fit = fitSlopePlane(rampa, rectNS)
  check('encosta: inclinacao ~11.3 graus', fit && Math.abs(fit.slopeDeg - 11.31) < 0.3,
    fit?.slopeDeg?.toFixed(2))
  check('encosta: desce para Oeste (~270)', Math.abs(fit.downhillAzimuthDeg - 270) < 3,
    fit?.downhillAzimuthDeg?.toFixed(1))
  check('encosta: curvas de nivel N-S (~0)',
    fit.contourAzimuthDeg < 3 || fit.contourAzimuthDeg > 177, fit?.contourAzimuthDeg?.toFixed(1))
  // rampa para Norte: desce para Sul (180), curvas de nivel E-O (90)
  const rampaN = { elevationAt: (lon, lat) => 200 + (lat - center[1]) * 110574 * 0.35 }
  const fitN = fitSlopePlane(rampaN, rectNS)
  check('encosta N: inclinacao ~19.3 graus', fitN && Math.abs(fitN.slopeDeg - 19.29) < 0.4,
    fitN?.slopeDeg?.toFixed(2))
  check('encosta N: desce para Sul e curvas E-O',
    Math.abs(fitN.downhillAzimuthDeg - 180) < 3 && Math.abs(fitN.contourAzimuthDeg - 90) < 3,
    `${fitN?.downhillAzimuthDeg?.toFixed(1)} / ${fitN?.contourAzimuthDeg?.toFixed(1)}`)
  // terreno plano ou dados nulos: sem sugestao
  check('encosta: plano -> inclinacao ~0',
    fitSlopePlane({ elevationAt: () => 300 }, rectNS).slopeDeg < 0.01)
  check('encosta: sem dados -> null', fitSlopePlane({ elevationAt: () => null }, rectNS) === null)
}

/* 8k. Filtro anti-picos do terreno */
{
  const w = 8
  const h = 8
  const grid = new Float32Array(w * h).fill(200)
  grid[3 * w + 3] = 900 // pico isolado (erro de descodificação)
  for (let y = 0; y < h; y++) grid[y * w + 5] = 400 // crista real (coluna contínua)
  despikeElevations(grid, w, h)
  check('pico isolado removido', Math.abs(grid[3 * w + 3] - 200) < 1, grid[3 * w + 3])
  let cristaOk = true
  for (let y = 1; y < h - 1; y++) if (grid[y * w + 5] !== 400) cristaOk = false
  check('crista real preservada', cristaOk)
}

/* 8m. Agregado do projecto (E3.2) */
{
  // 2 planos de 10 e 25 min; bateria 20 min a 30% de reserva -> util 840 s:
  // plano 1 = 1 bateria, plano 2 (1500 s) = 2 -> total 3
  const agg = aggregatePlans(
    [
      { flightTimeS: 600, photoCount: 100 },
      { flightTimeS: 1500, photoCount: null },
      null,
      { flightTimeS: NaN },
    ],
    { batteryMin: 20, reservePct: 30 },
  )
  check('agregado: 2 planos validos, tempo e fotos somados',
    agg.plans === 2 && agg.flightTimeS === 2100 && agg.photoCount === 100)
  check('agregado: baterias somadas POR plano (1+2)', agg.batteries === 3, agg.batteries)
  check('agregado: sem planos -> null', aggregatePlans([null, {}], { batteryMin: 20 }) === null)
  check('agregado: sem bateria valida -> batteries null',
    aggregatePlans([{ flightTimeS: 60 }], {}).batteries === null)
}

/* 9. Trava de segurança */
const planTiny = generateFlightLines(rectNS, {
  spacingM: 0.1, angleDeg: 90, bufferPct: 0, photoIntervalM: 1, speed: 10,
})
check('espaçamento minúsculo → erro controlado', planTiny?.error === 'too-many-lines')

/* 10. Exportadores (strings XML) */
const kml = buildSimpleKML(rectNS, 'teste')
check('KML tem Polygon', kml.includes('<Polygon>') && kml.includes('<coordinates>'))
const kmlCoords = kml.match(/<coordinates>([^<]*)<\/coordinates>/)[1].trim().split(/\s+/)
check('KML fecha o anel', kmlCoords.length === 5 && kmlCoords[0] === kmlCoords[4])

const wpmlParams = {
  name: 'teste',
  waypoints: plan90.waypoints,
  altitude: 100,
  speed: 10,
  wpml: { droneEnumValue: 77, droneSubEnumValue: 0, payloadEnumValue: 66, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
  photoIntervalM: iv,
  triggerMode: 'distance',
}
const tpl = buildTemplateKML(wpmlParams)
check('template.kml: droneEnumValue', tpl.includes('<wpml:droneEnumValue>77</wpml:droneEnumValue>'))
check('template.kml: templateType waypoint', tpl.includes('<wpml:templateType>waypoint</wpml:templateType>'))
check('template.kml: 16 placemarks', (tpl.match(/<Placemark>/g) || []).length === 16)

const wl = buildWaylinesWPML(wpmlParams)
check('waylines: multipleDistance', wl.includes('multipleDistance') && wl.includes(`<wpml:actionTriggerParam>${iv.toFixed(1)}</wpml:actionTriggerParam>`))
check('waylines: takePhoto', wl.includes('takePhoto'))
check('waylines: gimbal nadir', wl.includes('<wpml:gimbalPitchRotateAngle>-90</wpml:gimbalPitchRotateAngle>'))
check('waylines: 16 índices', wl.includes('<wpml:index>15</wpml:index>'))
check('waylines: actionGroupEndIndex 15', wl.includes('<wpml:actionGroupEndIndex>15</wpml:actionGroupEndIndex>'))

const wlTime = buildWaylinesWPML({ ...wpmlParams, triggerMode: 'time' })
check('waylines tempo: multipleTiming ~2.1 s', wlTime.includes('multipleTiming') && wlTime.includes('<wpml:actionTriggerParam>2.1</wpml:actionTriggerParam>'))

check('waylines camara: grupos 0 (gimbal) e 1 (foto)',
  wl.includes('<wpml:actionGroupId>0</wpml:actionGroupId>') &&
    wl.includes('<wpml:actionGroupId>1</wpml:actionGroupId>'))

// Camera with a null trigger keeps the gimbal group (existing behaviour).
const wlNoPhoto = buildWaylinesWPML({ ...wpmlParams, photoIntervalM: 0 })
check('waylines sem intervalo: sem takePhoto, gimbal mantido',
  !wlNoPhoto.includes('takePhoto') && wlNoPhoto.includes('gimbalRotate'))

// LiDAR payload (T0.4): no controllable gimbal and no camera trigger, so
// waypoint 0 must carry no action groups at all.
const wlLidar = buildWaylinesWPML({ ...wpmlParams, sensorType: 'lidar', photoIntervalM: 0 })
check('waylines LiDAR: sem takePhoto', !wlLidar.includes('takePhoto'))
check('waylines LiDAR: sem gimbalRotate', !wlLidar.includes('gimbalRotate'))
check('waylines LiDAR: waypoint 0 sem actionGroup', !wlLidar.includes('<wpml:actionGroup>'))

// M300 + Mapper+ (T1.2): enum PSDK do payload de terceiros, sem ações de câmara
const wlMapper = buildWaylinesWPML({
  ...wpmlParams,
  sensorType: 'lidar',
  photoIntervalM: 0,
  wpml: { droneEnumValue: 60, droneSubEnumValue: 0, ...PAYLOADS.MAPPER_PLUS.wpml },
})
check('waylines Mapper+: payloadEnumValue 65534',
  wlMapper.includes('<wpml:payloadEnumValue>65534</wpml:payloadEnumValue>') &&
    wlMapper.includes('<wpml:droneEnumValue>60</wpml:droneEnumValue>'))
check('waylines Mapper+: sem acoes de camara',
  !wlMapper.includes('takePhoto') && !wlMapper.includes('gimbalRotate'))

/* 9b. Modo fachada (T4.2 — gerador puro) */
{
  // face reta E-O de 600 m, 60 m de altura, standoff 25 m, M3E, 70/70%
  // imagem na face: 35.45 x 26.64 m -> vStep 7.99, hStep 10.63
  const straight = [toLL(0, 0), toLL(600, 0)]
  const fpl = generateFacePlan(straight, {
    sensor, faceHeightM: 60, standoffM: 25, side: 'left',
    verticalOverlapPct: 70, horizontalOverlapPct: 70,
  })
  check('fachada: 6 passagens', fpl && fpl.stats.passCount === 6, fpl?.stats.passCount)
  check('fachada: passo vertical ~6.7 m (<= 8.0)',
    Math.abs(fpl.stats.vStepM - 6.67) < 0.1 && fpl.stats.vStepM <= 8.0, fpl.stats.vStepM?.toFixed(2))
  check('fachada: alturas de 13.3 a 46.7 m',
    Math.abs(fpl.stats.heights[0] - 13.32) < 0.1 &&
      Math.abs(fpl.stats.heights[5] - 46.68) < 0.1,
    `${fpl.stats.heights[0].toFixed(1)}-${fpl.stats.heights[5].toFixed(1)}`)
  check('fachada: espacamento na passagem ~10.5 m (<= 10.7)',
    Math.abs(fpl.stats.hStepM - 10.53) < 0.2 && fpl.stats.hStepM <= 10.7, fpl.stats.hStepM?.toFixed(2))
  check('fachada: GSD a 25 m ~0.67 cm/px', Math.abs(fpl.stats.gsdCm - 0.6715) < 0.005,
    fpl.stats.gsdCm?.toFixed(4))
  check('fachada: waypoints = passagens x pontos e 1 foto por waypoint',
    fpl.stats.waypointCount === fpl.stats.passCount * fpl.stats.pointsPerPass &&
      fpl.perWaypoint.length === fpl.waypoints.length &&
      fpl.perWaypoint.every((p) => p.actions.includes('takePhoto') && p.gimbalPitch === 0))
  // lado esquerdo de quem anda para Este = norte; a face fica a sul -> rumo ~180
  const baseLine = turf.lineString(straight)
  const northOk = fpl.waypoints.every((w) => w[1] > straight[0][1])
  const standoffOk = fpl.waypoints.every((w) => {
    const d = turf.pointToLineDistance(turf.point([w[0], w[1]]), baseLine, { units: 'meters' })
    return Math.abs(d - 25) < 1
  })
  check('fachada: drone a norte da baseline (side left)', northOk)
  check('fachada: standoff 25 m +-1', standoffOk)
  check('fachada: rumo perpendicular a face (~180)',
    fpl.perWaypoint.every((p) => Math.abs(p.heading - 180) <= 2))
  // serpentina vertical: a 2.a passagem comeca onde a 1.a acabou (mesmo xy)
  const n = fpl.stats.pointsPerPass
  check('fachada: viragem em altura no mesmo ponto',
    fpl.waypoints[n - 1][0] === fpl.waypoints[n][0] && fpl.waypoints[n - 1][1] === fpl.waypoints[n][1] &&
      fpl.waypoints[n][2] > fpl.waypoints[n - 1][2])

  // baseline em L: o rumo roda na esquina; standoff mantem-se
  const lBase = [toLL(0, 0), toLL(300, 0), toLL(300, 300)]
  const fpL = generateFacePlan(lBase, {
    sensor, faceHeightM: 30, standoffM: 25, side: 'left',
    verticalOverlapPct: 70, horizontalOverlapPct: 70,
  })
  const pass0 = fpL.perWaypoint.slice(0, fpL.stats.pointsPerPass)
  check('fachada L: rumo 180 no inicio e 90 no fim',
    Math.abs(pass0[0].heading - 180) <= 3 && Math.abs(pass0[pass0.length - 1].heading - 90) <= 3,
    `${pass0[0].heading} -> ${pass0[pass0.length - 1].heading}`)
  // num cotovelo interior a distancia minima a polilinha cai abaixo do
  // standoff (a parede lateral aproxima-se) — a metrica que interessa e a
  // distancia A FACE SEGUNDO O RUMO da camara, que deve manter ~25 m
  const lLine = turf.lineString(lBase)
  const facing = fpL.waypoints.map((w, i) => {
    const far = turf.destination(turf.point([w[0], w[1]]), 200, fpL.perWaypoint[i].heading, {
      units: 'meters',
    })
    const hits = turf.lineIntersect(
      turf.lineString([[w[0], w[1]], far.geometry.coordinates]), lLine).features
    if (hits.length === 0) return null
    return Math.min(...hits.map((f) =>
      turf.distance([w[0], w[1]], f.geometry.coordinates, { units: 'meters' })))
  })
  const okFacing = facing.filter((d) => d != null && d > 22 && d < 28).length
  check('fachada L: distancia a face segundo o rumo ~25 m',
    okFacing >= facing.length - 2 && facing.every((d) => d == null || d < 36),
    `${okFacing}/${facing.length} em [22,28]`)
  const dists = fpL.waypoints.map((w) =>
    turf.pointToLineDistance(turf.point([w[0], w[1]]), lLine, { units: 'meters' }))
  check('fachada L: afastamento minimo nunca colapsa (>18 m)',
    dists.every((d) => d > 18 && d < 36),
    `${Math.min(...dists).toFixed(1)}-${Math.max(...dists).toFixed(1)}`)

  // integracao com o exportador (T4.1): um rumo fixo por waypoint
  const wlFace = buildWaylinesWPML({
    name: 'face', waypoints: fpl.waypoints, altitude: 30, speed: 3,
    wpml: wpmlParams.wpml, photoIntervalM: 0, triggerMode: 'distance',
    sensorType: 'camera', perWaypoint: fpl.perWaypoint,
  })
  check('fachada: WPML com rumo fixo em todos os waypoints',
    (wlFace.match(/smoothTransition/g) || []).length === fpl.waypoints.length)
  check('fachada: WPML com uma foto por waypoint',
    (wlFace.match(/takePhoto/g) || []).length === fpl.waypoints.length)
}

/* 9b2. Folga da fachada contra DSM local (R2.8) */
{
  // face E-O em y=0, drone a norte; DSM sintetico: ressalto de 22 m de topo
  // entre 10 e 15 m a norte da baseline (a face abaula para o corredor em
  // altura baixa); resto plano a cota 0
  const straight = [toLL(0, 0), toLL(600, 0)]
  const dsmBulge = (lon, lat) => {
    const dN = (lat - 39.5) * 110574
    return dN >= 10 && dN <= 15 ? 22 : 0
  }
  const mk = (standoff) => generateFacePlan(straight, {
    sensor, faceHeightM: 60, standoffM: standoff, side: 'left',
    verticalOverlapPct: 70, horizontalOverlapPct: 70, minHeightM: 16,
  })
  // alturas: 16, 20, 26.7, 33.3, 40, 46.7 — o ressalto (22 m) bloqueia o
  // corredor das duas primeiras na amostra a 12.5 m do drone (< 15 m)
  const near = checkFaceClearance(mk(25), dsmBulge, { minClearanceM: 15 })
  check('folga: passagens baixas cortam o ressalto a 25 m',
    near && !near.ok && near.passes.join(',') === '1,2',
    `passes ${near?.passes.join(',')}, horiz min ${near?.minHorizontalM?.toFixed(1)} m`)
  check('folga: passagens acima do ressalto livres', !near.passes.includes(3))
  const far = checkFaceClearance(mk(60), dsmBulge, { minClearanceM: 15 })
  check('folga: standoff maior limpa o aviso', far && far.ok && far.passes.length === 0,
    `horiz min ${far?.minHorizontalM?.toFixed(1)} m`)
  check('folga: standoff herdado do plano', mk(25).stats.standoffM === 25)
  // solo elevado sob o corredor dispara a folga vertical (pe da face a 0)
  const vert = checkFaceClearance(mk(25), () => 10, { minClearanceM: 15, footElevM: 0 })
  check('folga vertical: solo elevado apanha as passagens baixas',
    vert && !vert.ok && vert.passes.join(',') === '1,2' && Math.abs(vert.minVerticalM - 6) < 0.5,
    `vert min ${vert?.minVerticalM?.toFixed(1)} m`)
  // sem dados no DSM -> null (o chamador mostra standoff nao verificado)
  check('folga: DSM sem dados -> null',
    checkFaceClearance(mk(25), () => null, { minClearanceM: 15 }) === null)
}

/* 9b3. Persistencia da configuracao de fachada (E1.1) */
{
  check('faceConfig: ausente -> defaults',
    JSON.stringify(normalizeFaceConfig(undefined)) === JSON.stringify(DEFAULT_FACE_CONFIG))
  const norm = normalizeFaceConfig({
    baseline: [[-8, 39.5], [-7.99, 39.5]], heightM: 9999, standoffM: 1,
    side: 'right', verticalOverlapPct: 'x', minClearanceM: 20,
  })
  check('faceConfig: numeros limitados e lixo -> default',
    norm.heightM === 500 && norm.standoffM === 5 &&
      norm.verticalOverlapPct === DEFAULT_FACE_CONFIG.verticalOverlapPct &&
      norm.minClearanceM === 20 && norm.side === 'right')
  check('faceConfig: baseline valida preservada, invalida -> null',
    norm.baseline.length === 2 &&
      normalizeFaceConfig({ baseline: [[1]] }).baseline === null &&
      normalizeFaceConfig({ baseline: 'x' }).baseline === null)
  check('faceConfig: lado invalido cai em left',
    normalizeFaceConfig({ side: 'up' }).side === 'left')
  // P1: velocidade explicita — projectos antigos recebem o default 5
  check('faceConfig: speedMS default em projectos antigos',
    normalizeFaceConfig({ heightM: 30 }).speedMS === 5)
  check('faceConfig: speedMS limitada a 1-10',
    normalizeFaceConfig({ speedMS: 99 }).speedMS === 10 &&
      normalizeFaceConfig({ speedMS: 0.2 }).speedMS === 1)

  // P1: o tempo do plano usa a velocidade configurada — a componente de
  // deslocamento (tempo total menos os 2 s de paragem-e-disparo por
  // waypoint) reduz para metade quando a velocidade duplica
  const faceLine = [toLL(0, 0), toLL(600, 0)]
  const mkSpeed = (v) => generateFacePlan(faceLine, {
    sensor, faceHeightM: 60, standoffM: 25, side: 'left',
    verticalOverlapPct: 70, horizontalOverlapPct: 70, speed: v,
  })
  const s2 = mkSpeed(2)
  const s4 = mkSpeed(4)
  const travel2 = s2.stats.flightTimeS - 2 * s2.stats.waypointCount
  const travel4 = s4.stats.flightTimeS - 2 * s4.stats.waypointCount
  check('P1: deslocamento reduz a metade quando a velocidade duplica',
    Math.abs(travel2 / travel4 - 2) < 1e-9,
    `${travel2.toFixed(1)} s vs ${travel4.toFixed(1)} s`)

  // P1: o WPML exportado leva exactamente a velocidade configurada
  const wlSpeed = buildWaylinesWPML({
    name: 'face', waypoints: s4.waypoints, perWaypoint: s4.perWaypoint,
    altitude: 47, speed: 4, wpml: wpmlParams.wpml,
    photoIntervalM: 0, triggerMode: 'distance', sensorType: 'camera',
  })
  check('P1: autoFlightSpeed = velocidade configurada',
    wlSpeed.includes('<wpml:autoFlightSpeed>4</wpml:autoFlightSpeed>') &&
      wlSpeed.includes('<wpml:waypointSpeed>4</wpml:waypointSpeed>'))

  // ticks de rumo para a pre-visualizacao
  const tk = headingTicks(
    [[-8, 39.5, 10], [-7.999, 39.5, 10], [-7.998, 39.5, 10]],
    [{ heading: 180 }, {}, { heading: 90 }],
    { lengthM: 10, limit: 2 },
  )
  check('ticks: so waypoints com rumo dentro do limite', tk.length === 1)
  const dTick = turf.distance(tk[0][0], tk[0][1], { units: 'meters' })
  const bTick = ((turf.bearing(tk[0][0], tk[0][1]) % 360) + 360) % 360
  check('ticks: comprimento e direccao correctos',
    Math.abs(dTick - 10) < 0.1 && Math.abs(bTick - 180) < 1,
    `${dTick.toFixed(1)} m a ${bTick.toFixed(0)}°`)
}

/* 9c. Orbitas multi-nivel (T5.1 — gerador puro) */
{
  const orb = generateOrbitPlan(center, {
    sensor, radiusM: 100, levels: [30, 50, 70],
    horizontalOverlapPct: 80, poiHeightM: 10, speed: 4,
  })
  // corda = 141.8 x 0.2 = 28.36 -> n = ceil(628.3/28.36) = 23
  check('orbita: 23 pontos por volta', orb && orb.stats.pointsPerOrbit === 23,
    orb?.stats.pointsPerOrbit)
  check('orbita: 3 niveis x (n+1) waypoints',
    orb.stats.waypointCount === 3 * 24 && orb.perWaypoint.length === orb.stats.waypointCount)
  // raio: erro < 1 m em todos os pontos
  const radii = orb.waypoints.map((w) => turf.distance(center, [w[0], w[1]], { units: 'meters' }))
  check('orbita: raio 100 m com erro < 1 m',
    radii.every((r) => Math.abs(r - 100) < 1),
    `${Math.min(...radii).toFixed(2)}-${Math.max(...radii).toFixed(2)}`)
  // rumo aponta ao POI em todos os waypoints
  const headOk = orb.waypoints.every((w, i) => {
    const want = ((Math.round(turf.bearing([w[0], w[1]], center)) % 360) + 360) % 360
    const diff = Math.abs(orb.perWaypoint[i].heading - want)
    return Math.min(diff, 360 - diff) <= 1
  })
  check('orbita: rumo ao POI em todos os pontos', headOk)
  // gimbal por nivel apontado a cota do centro: -atan((h-10)/100)
  check('orbita: gimbal trigonometrico por nivel',
    orb.perLevel[0].gimbalPitch === -11 && orb.perLevel[1].gimbalPitch === -22 &&
      orb.perLevel[2].gimbalPitch === -31,
    orb.perLevel.map((l) => l.gimbalPitch).join(','))
  // a volta fecha no rumo inicial e a subida e vertical no mesmo ponto
  const n1 = orb.stats.pointsPerOrbit + 1
  check('orbita: volta fechada e subida vertical',
    orb.waypoints[0][0] === orb.waypoints[n1 - 1][0] &&
      orb.waypoints[n1 - 1][0] === orb.waypoints[n1][0] &&
      orb.waypoints[n1][2] > orb.waypoints[n1 - 1][2])
  // integracao com o exportador: voo curvo continuo + rumo fixo por ponto
  const wlOrb = buildWaylinesWPML({
    name: 'orbita', waypoints: orb.waypoints, altitude: 50, speed: 4,
    wpml: wpmlParams.wpml, photoIntervalM: 0, triggerMode: 'distance',
    sensorType: 'camera', perWaypoint: orb.perWaypoint, turnMode: orb.turnMode,
  })
  check('orbita: WPML em voo curvo continuo',
    (wlOrb.match(/toPointAndPassWithContinuityCurvature/g) || []).length === orb.stats.waypointCount &&
      !wlOrb.includes('toPointAndStopWithDiscontinuityCurvature'))
  check('orbita: WPML com rumo e foto por waypoint',
    (wlOrb.match(/smoothTransition/g) || []).length === orb.stats.waypointCount &&
      (wlOrb.match(/takePhoto/g) || []).length === orb.stats.waypointCount)
  // por defeito o modo de viragem antigo mantem-se
  check('orbita: turnMode por defeito inalterado',
    buildWaylinesWPML(wpmlParams).includes('toPointAndStopWithDiscontinuityCurvature'))
  check('orbita: levels por contagem/passo',
    generateOrbitPlan(center, { sensor, radiusM: 50, levels: { count: 2, startM: 20, stepM: 15 } })
      .stats.heights.join(',') === '20,35')
  check('orbita: raio invalido -> erro controlado',
    generateOrbitPlan(center, { sensor, radiusM: 0, levels: [30] })?.error === 'invalid-radius')

  /* E1.2: persistencia e exportacao por nivel */
  check('orbitConfig: ausente -> defaults',
    JSON.stringify(normalizeOrbitConfig(null)) === JSON.stringify(DEFAULT_ORBIT_CONFIG))
  const onorm = normalizeOrbitConfig({
    poi: [-8, 39.5], radiusM: 9999, levelCount: 99.7, levelStartM: 'x', clockwise: false,
  })
  check('orbitConfig: limites, arredondamento e lixo -> default',
    onorm.radiusM === 500 && onorm.levelCount === 12 &&
      onorm.levelStartM === DEFAULT_ORBIT_CONFIG.levelStartM &&
      onorm.clockwise === false && onorm.poi[0] === -8)
  check('orbitConfig: poi invalido -> null', normalizeOrbitConfig({ poi: [1] }).poi === null)

  const lvls = orbitLevelsToBlocks(orb)
  const perLvl = orb.stats.pointsPerOrbit + 1
  check('orbita por nivel: 3 blocos com n+1 waypoints e perWaypoint em sincronia',
    lvls.length === 3 &&
      lvls.every((b, i) => b.waypoints.length === perLvl && b.perWaypoint.length === perLvl &&
        b.id === i + 1 && b.waypoints[0][2] === orb.stats.heights[i]))
  check('orbita por nivel: gimbal do nivel preservado',
    lvls[2].perWaypoint[0].gimbalPitch === orb.perLevel[2].gimbalPitch)
}

/* 9c2. Velocidade da orbita como parametro explicito (micro-patch, espelho do P1) */
{
  check('orbitConfig: speedMS default em projectos antigos',
    normalizeOrbitConfig({}).speedMS === 5)
  check('orbitConfig: speedMS limitada a 1-10',
    normalizeOrbitConfig({ speedMS: 42 }).speedMS === 10 &&
      normalizeOrbitConfig({ speedMS: 0.1 }).speedMS === 1)
  // o tempo de voo da orbita e percurso / velocidade (sem termo de paragem):
  // duplicar a velocidade reduz o tempo exactamente a metade
  const o2 = generateOrbitPlan(center, { sensor, radiusM: 100, levels: [30, 50], speed: 2 })
  const o4 = generateOrbitPlan(center, { sensor, radiusM: 100, levels: [30, 50], speed: 4 })
  check('orbita: tempo reduz a metade quando a velocidade duplica',
    Math.abs(o2.stats.flightTimeS / o4.stats.flightTimeS - 2) < 1e-9,
    `${o2.stats.flightTimeS.toFixed(1)} s vs ${o4.stats.flightTimeS.toFixed(1)} s`)
  // o WPML exportado leva exactamente a velocidade configurada
  const wlOrbSpeed = buildWaylinesWPML({
    name: 'orbita', waypoints: o4.waypoints, perWaypoint: o4.perWaypoint,
    turnMode: o4.turnMode, altitude: 50, speed: 4, wpml: wpmlParams.wpml,
    photoIntervalM: 0, triggerMode: 'distance', sensorType: 'camera',
  })
  check('orbita: autoFlightSpeed = velocidade configurada',
    wlOrbSpeed.includes('<wpml:autoFlightSpeed>4</wpml:autoFlightSpeed>') &&
      wlOrbSpeed.includes('<wpml:waypointSpeed>4</wpml:waypointSpeed>'))
}

/* 9d. Pontos de inspecao (R2.9 — parte pura) */
{
  const P = (x, y, extra = {}) => ({ id: x + y, label: `P${x}`, point: toLL(x, y), heightM: 30, ...extra })
  // pontos em linha, baralhados: o vizinho-mais-proximo a partir da base a
  // oeste devolve a ordem geografica oeste->este
  const pts = [P(400, 0), P(100, 0), P(300, 0), P(0, 0), P(200, 0)]
  const ordered = nearestNeighbourOrder(pts, toLL(-50, 0))
  check('inspecao: ordem por vizinho mais proximo',
    ordered.map((p) => p.label).join(',') === 'P0,P100,P200,P300,P400',
    ordered.map((p) => p.label).join(','))
  check('inspecao: nao altera a lista original', pts[0].label === 'P400')
  check('inspecao: sem base comeca no primeiro ponto',
    nearestNeighbourOrder(pts)[0].label === 'P400')

  const { waypoints: wps, perWaypoint: pw } = inspectionToWaypoints([
    P(0, 0, { heading: 45, gimbalPitch: -30 }),
    P(100, 0, { photo: false }),
    P(200, 0, { heightM: 55.55 }),
  ])
  check('inspecao: waypoints com altura arredondada',
    wps.length === 3 && wps[2][2] === 55.6, wps[2][2])
  check('inspecao: heading/pitch so quando definidos',
    pw[0].heading === 45 && pw[0].gimbalPitch === -30 &&
      pw[1].heading === undefined && pw[1].gimbalPitch === undefined)
  check('inspecao: photo=false nao dispara',
    pw[1].actions.length === 0 && pw[0].actions.includes('takePhoto') && pw[2].actions.includes('takePhoto'))

  // exportacao ponta-a-ponta: rumo fixo no 1.o, grupo de foto nos 1.o e 3.o
  const wlInsp = buildWaylinesWPML({
    name: 'inspecao', waypoints: wps, altitude: 30, speed: 5,
    wpml: wpmlParams.wpml, photoIntervalM: 0, triggerMode: 'distance',
    sensorType: 'camera', perWaypoint: pw,
  })
  check('inspecao: WPML com 1 rumo fixo e 2 fotos',
    (wlInsp.match(/smoothTransition/g) || []).length === 1 &&
      (wlInsp.match(/takePhoto/g) || []).length === 2)

  /* E1.3: reordenacao por arrastar-e-largar */
  check('reorder: move para a frente e para tras',
    reorderList(['a', 'b', 'c', 'd'], 0, 2).join('') === 'bcad' &&
      reorderList(['a', 'b', 'c', 'd'], 3, 1).join('') === 'adbc')
  const orig = ['a', 'b']
  check('reorder: indices invalidos devolvem a lista original intacta',
    reorderList(orig, 0, 5) === orig && reorderList(orig, 1, 1) === orig &&
      reorderList(orig, -1, 0) === orig)
}

/* 10a2. Convencao de nomes de exportacao (E3.1) */
{
  check('nome: area com variantes',
    buildExportName('Quinta Sul', 'area', { variant: ['crosshatch', 'nadir'] }) ===
      'Quinta-Sul_area-crosshatch-nadir')
  check('nome: variantes falsas filtradas',
    buildExportName('m', 'area', { variant: [false, null, 'tie'] }) === 'm_area-tie')
  check('nome: fachada com passagens',
    buildExportName('pedreira', 'face', { part: 'p1-6' }) === 'pedreira_face_p1-6')
  check('nome: orbita com niveis',
    buildExportName('silo', 'orbit', { part: 'n3' }) === 'silo_orbit_n3')
  check('nome: caracteres estranhos e vazio caem no seguro',
    buildExportName('  á/b?  ', 'inspect') === 'b_inspect' &&
      buildExportName('', 'area') === 'missao_area')
}

/* 10b. Acoes por waypoint no exportador (T4.1) */
{
  const wlPW = buildWaylinesWPML({
    ...wpmlParams,
    photoIntervalM: 0,
    perWaypoint: [
      null,
      { heading: 45, gimbalPitch: -30, actions: ['takePhoto'] },
      { actions: ['takePhoto'] },
    ],
  })
  check('T4.1: heading smoothTransition apenas no wp1',
    wlPW.includes('<wpml:waypointHeadingAngle>45</wpml:waypointHeadingAngle>') &&
      (wlPW.match(/smoothTransition/g) || []).length === 1)
  check('T4.1: headingAngleEnable=1 so onde ha heading',
    (wlPW.match(/<wpml:waypointHeadingAngleEnable>1<\/wpml:waypointHeadingAngleEnable>/g) || []).length === 1)
  check('T4.1: grupo do wp1 com gimbal -30',
    wlPW.includes('<wpml:actionGroupStartIndex>1</wpml:actionGroupStartIndex>') &&
      wlPW.includes('<wpml:gimbalPitchRotateAngle>-30</wpml:gimbalPitchRotateAngle>'))
  check('T4.1: grupo do wp2 (so foto)',
    wlPW.includes('<wpml:actionGroupStartIndex>2</wpml:actionGroupStartIndex>'))
  // com photoIntervalM 0 o unico grupo global e o gimbal (id 0): os grupos
  // por waypoint devem ocupar os ids 1 e 2, sem saltos
  check('T4.1: ids de grupos consecutivos',
    wlPW.includes('<wpml:actionGroupId>1</wpml:actionGroupId>') &&
      wlPW.includes('<wpml:actionGroupId>2</wpml:actionGroupId>') &&
      !wlPW.includes('<wpml:actionGroupId>3</wpml:actionGroupId>'))
  check('T4.1: takePhoto nos dois waypoints', (wlPW.match(/takePhoto/g) || []).length >= 2)
  const wlPlain = buildWaylinesWPML(wpmlParams)
  check('T4.1: sem perWaypoint nao ha smoothTransition nem grupos extra',
    !wlPlain.includes('smoothTransition') &&
      !wlPlain.includes('<wpml:actionGroupId>2</wpml:actionGroupId>'))
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} TESTES FALHARAM`)
process.exit(failures === 0 ? 0 : 1)
