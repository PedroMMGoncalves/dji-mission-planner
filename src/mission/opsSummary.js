/**
 * Resumo operacional para o painel de estatísticas: quantos voos, de
 * quantas bases, quantos conjuntos de baterias, o voo mais longo contra o
 * tempo útil de uma bateria e o tempo total de voo com os trânsitos. É o que
 * decide se a divisão aguenta no campo; o preflight tem os avisos completos,
 * isto só os põe à vista de relance. Lógica pura.
 */

/** Acima disto do tempo útil, o voo mais longo fica a âmbar (perto do limite). */
export const OPS_NEAR_FRAC = 0.9

/**
 * @param {object} o
 * @param {Array<{id: number|string, timeS?: number, transitS?: number}>|null} [o.blocks]
 *   voos da divisão (null ou vazio: a missão é um só voo)
 * @param {Record<string, {flightLabel?: string, transitS?: number}>|null} [o.byBlock]
 *   disposição por bases (baseLayout.byBlock): rótulo e trânsito de cada voo
 * @param {number|null} [o.singleTimeS] tempo de voo da missão sem divisão
 * @param {number|null} [o.singleTransitS] trânsito ida e volta da missão sem divisão
 * @param {number|null} [o.usefulMin] tempo útil de uma bateria (min)
 * @param {number} [o.bases] número de bases
 * @param {{sets: number|null, short: boolean}|null} [o.sets] flightsVsSets
 * @returns {null | {flights: number, bases: number, sets: number|null, short: boolean,
 *   longest: {label: string|null, timeS: number}, totalS: number,
 *   usefulS: number|null, longestFrac: number|null, level: 'ok'|'near'|'over'}}
 */
export function opsSummary({
  blocks = null,
  byBlock = null,
  singleTimeS = null,
  singleTransitS = null,
  usefulMin = null,
  bases = 0,
  sets = null,
}) {
  const flights = []
  if (Array.isArray(blocks) && blocks.length > 0) {
    for (const b of blocks) {
      const info = byBlock?.[String(b.id)] ?? byBlock?.[b.id] ?? null
      const transit = Number.isFinite(info?.transitS)
        ? info.transitS
        : Number.isFinite(b.transitS)
          ? b.transitS
          : 0
      const own = Number.isFinite(b.timeS) ? b.timeS : 0
      flights.push({ label: info?.flightLabel ?? null, timeS: own + transit })
    }
  } else if (Number.isFinite(singleTimeS)) {
    flights.push({
      label: null,
      timeS: singleTimeS + (Number.isFinite(singleTransitS) ? singleTransitS : 0),
    })
  }
  if (flights.length === 0) return null
  const longest = flights.reduce((m, f) => (f.timeS > m.timeS ? f : m))
  const totalS = flights.reduce((s, f) => s + f.timeS, 0)
  const usefulS = Number.isFinite(usefulMin) && usefulMin > 0 ? usefulMin * 60 : null
  const longestFrac = usefulS ? longest.timeS / usefulS : null
  const level =
    longestFrac == null
      ? 'ok'
      : longestFrac > 1
        ? 'over'
        : longestFrac > OPS_NEAR_FRAC
          ? 'near'
          : 'ok'
  return {
    flights: flights.length,
    bases: Math.max(0, bases | 0),
    sets: sets?.sets ?? null,
    short: Boolean(sets?.short),
    longest,
    totalS,
    usefulS,
    longestFrac,
    level,
  }
}
