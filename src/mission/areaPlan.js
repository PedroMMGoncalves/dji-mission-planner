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
 * A margem de cada célula, em metros para cada lado. A percentagem lê-se
 * pelo bloco, nunca pela área inteira (decisão do autor: é a sobreposição
 * entre blocos vizinhos, de 0 a 30 %, para o ajuste entre as fiadas de voos
 * diferentes): no mosaico, pct/100 × lado/2 do quadrado, a mesma em todas as
 * células, também nas que a orla recorta; na grelha e nas partes
 * importadas, pct/100 × √área/2 de cada célula. Dois blocos vizinhos voam
 * assim uma faixa de pct/100 do lado, metade de cada um.
 * @param {number[][][]|null} cells
 * @param {{bufferPct?: number, sideM?: number|null}} [opts] `sideM`: o lado do mosaico
 * @returns {number[]}
 */
export function cellBuffersM(cells, { bufferPct = 0, sideM = null } = {}) {
  const list = Array.isArray(cells) ? cells : []
  if (!(bufferPct > 0)) return list.map(() => 0)
  if (sideM > 0) return list.map(() => (bufferPct / 100) * (sideM / 2))
  return list.map((c) => bufferDistanceMeters(ringToPolygon(c), bufferPct))
}

/**
 * @param {number[][]} ring
 * @param {number[][][]|null} activeCells anéis das células activas
 * @param {any} opts parâmetros de generateFlightPlan; `cellHoles` (opcional,
 *   alinhado com activeCells) dá os buracos de cada célula já recortados pelo
 *   mosaico (buildSquareMosaic), em vez de os procurar entre os da área;
 *   `cellSideM` (opcional) é o lado do mosaico, para a margem de cada célula
 *   (cellBuffersM)
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
  const { cellHoles: _ignored, cellSideM = null, ...cellOpts } = opts
  // a margem de cada célula vem do bloco, nunca da área inteira (cellBuffersM)
  const buffers = cellBuffersM(activeCells, { bufferPct: opts.bufferPct, sideM: cellSideM })
  const perCell = activeCells.map((cell, i) =>
    generateFlightPlan(cell, {
      ...cellOpts,
      bufferPct: 0,
      bufferM: buffers[i],
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
