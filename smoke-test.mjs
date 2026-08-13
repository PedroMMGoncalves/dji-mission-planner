import * as turf from '@turf/turf'
import {
  computeAlignment,
  computeFootprint,
  computeGSD,
  distanceToArea,
  generateFlightLines,
  gridFromAnchor,
  lineSpacing,
  longestEdgeBearing,
  photoInterval,
  rectangleFromAnchor,
  splitIntoBlocks,
  tilePolygonWithSquares,
  validateRing,
} from './src/utils/geo.js'
import { buildSimpleKML, buildTemplateKML, buildWaylinesWPML } from './src/utils/exporters.js'

let failures = 0
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`)
  if (!cond) failures++
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

const wlLidar = buildWaylinesWPML({ ...wpmlParams, photoIntervalM: 0 })
check('waylines LiDAR: sem takePhoto', !wlLidar.includes('takePhoto'))

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} TESTES FALHARAM`)
process.exit(failures === 0 ? 0 : 1)
