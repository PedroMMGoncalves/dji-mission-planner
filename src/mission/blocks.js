/**
 * Divisão da missão de área em blocos de voo numerados: as células do
 * mosaico (cada célula é um bloco) ou o corte da serpentina por faixas /
 * área. Lógica pura que vivia num useMemo do App.jsx.
 */
import { nadirLineLocalPerBlock, splitIntoBlocks, stripRouteStats } from '../utils/geo.js'

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

/**
 * Comprimento e tempo de uma missão dividida em voos: a soma do que cada
 * voo voa — a rota do seu bloco (a 3D, com seguimento de terreno), as suas
 * `n − 1` inversões e, com paragem em todos, as paragens intermédias —, o
 * mesmo que a exportação escreve em `wpml:distance` e `wpml:duration` de
 * cada KMZ. Sem os troços entre blocos, que não se voam (cada bloco descola
 * da sua base), e sem trânsito.
 * @param {Array<{waypoints?: number[][], lines?: any[], perLine?: number[]|null}>} flights
 *   blocos (planBlocks) ou blocos com alturas (`blocks3` de planTerrainFollow)
 * @param {{speed: number, waypointStops?: string}} opts
 * @returns {{pathLengthM: number, flightTimeS: number|null}}
 */
export function flightsRouteStats(flights, { speed, waypointStops = 'corners' }) {
  let pathLengthM = 0
  /** @type {number|null} */
  let flightTimeS = 0
  for (const b of flights) {
    const st = stripRouteStats(b.waypoints ?? [], {
      speed,
      lineCount: b.lines?.length ?? 0,
      perLine: b.perLine ?? null,
      waypointStops,
    })
    pathLengthM += st.pathLengthM
    flightTimeS =
      flightTimeS == null || st.flightTimeS == null ? null : flightTimeS + st.flightTimeS
  }
  return { pathLengthM, flightTimeS }
}

/**
 * O plano de área com as estatísticas de rota que o painel, o relatório e o
 * resumo do projecto mostram («Distância total», «Tempo na missão»): com
 * blocos, a soma dos voos (flightsRouteStats), sobre os blocos com alturas
 * quando há seguimento de terreno; sem blocos, a rota inteira, a 3D com
 * seguimento de terreno. Sem nada a corrigir devolve o plano tal qual.
 *
 * Até Outubro de 2026, com seguimento de terreno, as estatísticas vinham da
 * rota de toda a área numa só peça: contavam os troços entre blocos e uma
 * inversão a mais por bloco — 20 blocos de 500 m davam 128,5 km e 235 min
 * para 116,3 km e 213 min voados (+10 %); o corte da serpentina por área
 * contava-os também sem seguimento de terreno (+1–2 %).
 * @param {any} plan plano de área válido (planArea), ou null / com erro
 * @param {{blocks?: any[]|null, terrainResult?: any,
 *   speed: number, waypointStops?: string}} opts
 */
export function areaRouteStats(
  plan,
  { blocks = null, terrainResult = null, speed, waypointStops = 'corners' },
) {
  if (!plan || plan.error) return plan
  const tf =
    terrainResult && !terrainResult.error && terrainResult.waypoints?.length ? terrainResult : null
  const flights = blocks?.length ? (tf?.blocks3 ?? blocks) : null
  let stats
  if (flights) stats = flightsRouteStats(flights, { speed, waypointStops })
  else if (tf)
    stats = stripRouteStats(tf.waypoints, {
      speed,
      lineCount: plan.lines.length,
      perLine: tf.perLine,
      waypointStops,
    })
  else return plan
  return { ...plan, stats: { ...plan.stats, ...stats, ...(tf ? { path3D: true } : {}) } }
}
