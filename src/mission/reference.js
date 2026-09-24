/**
 * Cota de referência das alturas relativas.
 *
 * O WPML exporta alturas relativas ao ponto de descolagem; para o perfil de
 * elevação, a vista 3D e a folga ao solo é preciso saber a cota desse ponto.
 * A cadeia é: base → primeiro waypoint → nenhuma. NUNCA 0: uma base fora do
 * relevo carregado (ou longe da área, depois de a mover) dava cota 0 e o
 * perfil desenhava o voo a 80 m absolutos, debaixo de um terreno a 100 m,
 * com a folga a −86 m — e nada avisava.
 *
 * `source` diz de onde veio a cota, para o preflight avisar quando a base
 * existe mas não tem relevo ('waypoint-fallback').
 *
 * @param {{elevationAt?: ((lon: number, lat: number) => number|null)|null,
 *   basePoint?: number[]|null, waypoints?: number[][]|null}} args
 * @returns {{elev: number|null, source: 'base'|'waypoint'|'waypoint-fallback'|null}}
 */
export function referenceElevation({ elevationAt, basePoint, waypoints }) {
  const at = (p) => {
    if (!Array.isArray(p) || typeof elevationAt !== 'function') return null
    const e = elevationAt(p[0], p[1])
    return Number.isFinite(e) ? e : null
  }
  const fromBase = at(basePoint)
  if (fromBase != null) return { elev: fromBase, source: 'base' }
  const first = Array.isArray(waypoints) && waypoints.length ? waypoints[0] : null
  const fromWp = at(first)
  if (fromWp != null) return { elev: fromWp, source: basePoint ? 'waypoint-fallback' : 'waypoint' }
  return { elev: null, source: null }
}
