/**
 * Plano de ÁREA a partir do polígono e, no mosaico, das células activas:
 * cada célula é planeada com os mesmos parâmetros e com alinhamento global,
 * para as faixas de células adjacentes serem colineares (o buffer, se
 * activo, cria a sobreposição entre células). Uma célula sem plano é um
 * erro explícito (cell-uncovered), nunca uma missão silenciosamente mais
 * curta do que a área desenhada. Lógica pura que vivia num useMemo do App.
 */
import { composeCellPlans, computeAlignment, generateFlightPlan } from '../utils/geo.js'

export function planArea(ring, activeCells, opts) {
  if (!ring) return null
  if (!activeCells) return generateFlightPlan(ring, opts)
  const align = computeAlignment(ring, opts.spacingM, opts.angleDeg)
  const align2 = opts.crosshatch
    ? computeAlignment(ring, opts.spacingM, (opts.angleDeg + 90) % 360)
    : null
  const perCell = activeCells.map((cell) => generateFlightPlan(cell, { ...opts, align, align2 }))
  return composeCellPlans(ring, perCell, {
    photoIntervalM: opts.photoIntervalM,
    photoMode: opts.photoMode,
    overshootM: opts.overshootM,
  })
}
