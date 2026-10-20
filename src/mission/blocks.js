/**
 * Divisão da missão de área em blocos de voo numerados: as células do
 * mosaico (cada célula é um bloco) ou o corte da serpentina por faixas /
 * área. Lógica pura que vivia num useMemo do App.jsx.
 */
import { nadirLineLocalPerBlock, splitIntoBlocks } from '../utils/geo.js'

/**
 * Bloco de voo: a fatia da serpentina que cabe numa bateria ou numa área
 * máxima (splitIntoBlocks), ou uma célula do mosaico, com as suas
 * estatísticas; `transitS` é a ida e volta à base, já contada em `timeS`.
 * @typedef {{id: number, lines: any[], waypoints: any[], areaHa: number, lengthM: number,
 *   transitS: number, timeS: number, perLine?: number[]|null, perWaypoint?: any[]|null,
 *   cellRing?: number[][]|null, cellHoles?: number[][][]|null, nadirLineLocal?: number|null}} Block
 */

/**
 * @param {any} plan plano de área válido (generateFlightPlan / composeCellPlans)
 * @param {{activeCells?: any[]|null, cellIds?: number[]|null, cellHoles?: any[]|null,
 *   split: {mode: string, maxAreaHa?: number, reservePct?: number},
 *   batteryMin?: number, speed?: number, spacingM?: number, basePoint?: number[]|null,
 *   waypointStops?: string, overshootM?: number}} opts `cellIds`: id estável de cada célula activa (o
 *   do mosaico, que não muda ao desactivar outra); sem ele, a posição + 1
 * @returns {Block[]|null} lista de blocos ou null (sem divisão)
 */
export function planBlocks(
  plan,
  {
    activeCells = null,
    cellIds = null,
    // buracos de cada célula activa (mosaico), para o contorno no KML de campo
    cellHoles = null,
    split,
    batteryMin,
    speed,
    spacingM,
    basePoint = null,
    waypointStops = 'corners',
    overshootM = 0,
  },
) {
  if (!plan) return null
  if (activeCells && plan.cellPlans) {
    return plan.cellPlans.map((p, i) => ({
      id: Number.isInteger(cellIds?.[i]) ? cellIds[i] : i + 1,
      // contorno da célula: alcance visual e proposta de bases
      cellRing: activeCells[i] ?? null,
      cellHoles: cellHoles?.[i] ?? null,
      lines: p.lines,
      waypoints: p.waypoints,
      areaHa: p.stats.areaHa,
      lengthM: p.stats.totalLineLengthM,
      transitS: 0,
      timeS: p.stats.flightTimeS ?? 0,
      // waypoints densificados e acções de foto da célula (modo por waypoint)
      perLine: p.perLine ?? null,
      perWaypoint: p.perWaypoint ?? null,
      // cada célula tem a sua grelha nadir no fim
      nadirLineLocal: p.nadirStartLine ?? null,
    }))
  }
  // 'battery' e 'tiles' produzem células (acima); só 'area' corta a serpentina
  if (split.mode !== 'area') return null
  const cut = splitIntoBlocks(plan, {
    mode: split.mode,
    maxAreaHa: split.maxAreaHa,
    batteryMin,
    reservePct: split.reservePct,
    speed,
    spacingM,
    basePoint,
    waypointStops,
    overshootM,
  })
  if (!cut || plan.nadirStartLine == null) return cut
  // em que linha local de cada bloco começa a grelha nadir
  const locals = nadirLineLocalPerBlock(
    cut.map((b) => b.lines.length),
    plan.nadirStartLine,
  )
  return cut.map((b, i) => ({ ...b, nadirLineLocal: locals[i] }))
}
