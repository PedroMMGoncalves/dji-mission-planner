/**
 * Projectos gravados com o mosaico antigo (tilePolygonWithSquares: grelha
 * presa à caixa envolvente, quadrados inteiros que podiam sair da área, lado
 * por bateria com o trânsito da base única). As células desactivadas eram
 * guardadas como índices DESSA grelha; no mosaico novo (buildSquareMosaic)
 * os índices apontam para outras células. Para o operador não perder a
 * selecção, refaz-se a grelha antiga com as mesmas regras e desactiva-se no
 * mosaico novo cada célula que fica, em área, pelo menos metade dentro das
 * células antigas desactivadas. Lógica pura.
 */
import * as turf from '@turf/turf'
import {
  distanceToArea,
  ringToPolygon,
  squareSideForBattery,
  tilePolygonWithSquares,
} from '../utils/geo.js'

/** Fracção da área de uma célula nova dentro das antigas desactivadas para a desactivar. */
export const LEGACY_DISABLED_MIN_FRACTION = 0.5

/**
 * Lado do quadrado tal como o mosaico antigo o calculava: o manual, ou o da
 * bateria com o trânsito de ida e volta da base única até à área (sem
 * trânsito quando ele sozinho passava o tempo útil).
 */
export function legacyTileSide({
  split,
  ring,
  basePoint = null,
  batteryMin,
  speed,
  spacingM,
  passes = 1,
  stopEveryM = 0,
}) {
  if (split?.mode !== 'battery') return split?.tileSize
  const dist = basePoint ? distanceToArea(basePoint, ring) : null
  let transitS = dist != null ? (2 * dist) / (speed || 10) : 0
  const usableS = batteryMin > 0 ? batteryMin * 60 : null
  if (usableS != null && transitS >= usableS) transitS = 0
  return squareSideForBattery({
    batteryMin,
    reservePct: 0,
    speed,
    spacingM,
    transitS,
    maxSideM: split.maxSide,
    passes,
    stopEveryM,
  })
}

/** Caixa [minLon, minLat, maxLon, maxLat] de um anel. */
function bboxOf(ring) {
  let b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring)
    b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
  return b
}
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

/**
 * Índices do mosaico novo a desactivar a partir da selecção antiga.
 * @param {number[][][]} oldCells anéis da grelha antiga (tilePolygonWithSquares)
 * @param {Iterable<number>} disabled índices desactivados na grelha antiga
 * @param {Array<{ring: number[][], holes?: number[][][]}>} newCells células do mosaico novo
 * @returns {Set<number>}
 */
export function translateLegacyDisabledTiles(oldCells, disabled, newCells) {
  const out = new Set()
  if (!Array.isArray(oldCells) || !Array.isArray(newCells)) return out
  const off = [...(disabled ?? [])]
    .map((i) => oldCells[i])
    .filter((r) => Array.isArray(r) && r.length >= 3)
    .map((r) => ({ poly: ringToPolygon(r), bbox: bboxOf(r) }))
  if (off.length === 0) return out
  newCells.forEach((cell, i) => {
    if (!Array.isArray(cell?.ring) || cell.ring.length < 3) return
    const poly = ringToPolygon(cell.ring, cell.holes ?? null)
    const bbox = bboxOf(cell.ring)
    const total = turf.area(poly)
    if (!(total > 0)) return
    let inside = 0
    for (const o of off) {
      if (!overlaps(bbox, o.bbox)) continue
      try {
        const x = turf.intersect(turf.featureCollection([poly, o.poly]))
        if (x) inside += turf.area(x)
      } catch {
        // geometria degenerada: esta célula antiga não conta
      }
    }
    if (inside / total >= LEGACY_DISABLED_MIN_FRACTION) out.add(i)
  })
  return out
}

/**
 * Selecção antiga traduzida para o mosaico novo, com a grelha antiga refeita
 * a partir do projecto (mesmo anel, lado, orientação e buracos).
 */
export function legacyDisabledForMosaic({
  ring,
  holes = null,
  split,
  basePoint = null,
  batteryMin,
  speed,
  spacingM,
  passes = 1,
  stopEveryM = 0,
  disabled,
  newCells,
}) {
  const side = legacyTileSide({
    split,
    ring,
    basePoint,
    batteryMin,
    speed,
    spacingM,
    passes,
    stopEveryM,
  })
  const old = tilePolygonWithSquares(ring, side, split?.tileOrientation ?? 0, holes)
  if (!Array.isArray(old)) return new Set()
  return translateLegacyDisabledTiles(old, disabled, newCells)
}
