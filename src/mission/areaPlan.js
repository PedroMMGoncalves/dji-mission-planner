/**
 * Plano de ÁREA a partir do polígono e, no mosaico, das células activas:
 * cada célula é planeada com os mesmos parâmetros e com alinhamento global,
 * para as faixas de células adjacentes serem colineares (o buffer, se
 * activo, cria a sobreposição entre células). Uma célula sem plano é um
 * erro explícito (cell-uncovered), nunca uma missão silenciosamente mais
 * curta do que a área desenhada. Lógica pura que vivia num useMemo do App.
 */
import * as turf from '@turf/turf'
import { composeCellPlans, computeAlignment, generateFlightPlan, ringToPolygon } from '../utils/geo.js'

export function planArea(ring, activeCells, opts) {
  if (!ring) return null
  if (!activeCells) return generateFlightPlan(ring, opts)
  const align = computeAlignment(ring, opts.spacingM, opts.angleDeg)
  const align2 = opts.crosshatch
    ? computeAlignment(ring, opts.spacingM, (opts.angleDeg + 90) % 360)
    : null
  // cada célula só leva os buracos que a tocam: um anel interior fora da
  // célula faria um polígono inválido
  const holes = Array.isArray(opts.holes) ? opts.holes : []
  const holesFor = (cell) => {
    if (holes.length === 0) return null
    const cellPoly = ringToPolygon(cell)
    return holes.filter((h) => {
      try {
        return turf.booleanIntersects(cellPoly, ringToPolygon(h))
      } catch {
        return false
      }
    })
  }
  const perCell = activeCells.map((cell) =>
    generateFlightPlan(cell, { ...opts, align, align2, holes: holesFor(cell) }),
  )
  return composeCellPlans(ring, perCell, {
    photoIntervalM: opts.photoIntervalM,
    photoMode: opts.photoMode,
    overshootM: opts.overshootM,
    holes,
  })
}
