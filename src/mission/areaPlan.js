/**
 * Plano de ÁREA a partir do polígono e, no mosaico, das células activas:
 * cada célula é planeada com os mesmos parâmetros e com alinhamento global,
 * para as faixas de células adjacentes serem colineares (o buffer, se
 * activo, cria a sobreposição entre células). Uma célula sem plano é um
 * erro explícito (cell-uncovered), nunca uma missão silenciosamente mais
 * curta do que a área desenhada. Lógica pura que vivia num useMemo do App.
 */
import * as turf from '@turf/turf'
import {
  bufferDistanceMeters,
  composeCellPlans,
  computeAlignment,
  generateFlightPlan,
  ringToPolygon,
} from '../utils/geo.js'

/**
 * @param {number[][]} ring
 * @param {number[][][]|null} activeCells anéis das células activas
 * @param {any} opts parâmetros de generateFlightPlan; `cellHoles` (opcional,
 *   alinhado com activeCells) dá os buracos de cada célula já recortados pelo
 *   mosaico (buildSquareMosaic), em vez de os procurar entre os da área
 */
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
  const cellHoles = Array.isArray(opts.cellHoles) ? opts.cellHoles : null
  const { cellHoles: _ignored, ...cellOpts } = opts
  // a margem em metros vem do CONTORNO, uma vez, e não da área de cada
  // célula (M2-G10: 10 % eram 59 m na área e 24 m numa célula de 480 m — a
  // margem exterior mudava ao ligar a divisão)
  const bufferM =
    opts.bufferPct > 0 ? bufferDistanceMeters(ringToPolygon(ring, holes), opts.bufferPct) : 0
  const perCell = activeCells.map((cell, i) =>
    generateFlightPlan(cell, {
      ...cellOpts,
      bufferM,
      align,
      align2,
      holes: cellHoles ? (cellHoles[i]?.length ? cellHoles[i] : null) : holesFor(cell),
    }),
  )
  return composeCellPlans(ring, perCell, {
    photoIntervalM: opts.photoIntervalM,
    photoMode: opts.photoMode,
    overshootM: opts.overshootM,
    holes,
  })
}
