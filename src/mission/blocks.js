/**
 * Divisão da missão de área em blocos de voo numerados: as células do
 * mosaico (cada célula é um bloco) ou o corte da serpentina por faixas /
 * área. Lógica pura que vivia num useMemo do App.jsx.
 */
import { nadirLineLocalPerBlock, splitIntoBlocks } from '../utils/geo.js'

/**
 * @param plan plano de área válido (generateFlightPlan / composeCellPlans)
 * @param opts { activeCells, split: {mode, maxAreaHa, reservePct}, batteryMin, speed, spacingM, basePoint }
 * @returns lista de blocos ou null (sem divisão)
 */
export function planBlocks(plan, { activeCells = null, split, batteryMin, speed, spacingM, basePoint = null }) {
  if (!plan) return null
  if (activeCells && plan.cellPlans) {
    return plan.cellPlans.map((p, i) => ({
      id: i + 1,
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
  })
  if (!cut || plan.nadirStartLine == null) return cut
  // em que linha local de cada bloco começa a grelha nadir
  const locals = nadirLineLocalPerBlock(cut.map((b) => b.lines.length), plan.nadirStartLine)
  return cut.map((b, i) => ({ ...b, nadirLineLocal: locals[i] }))
}
