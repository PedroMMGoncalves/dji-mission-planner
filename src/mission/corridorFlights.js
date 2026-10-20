/**
 * Corredor partido em voos: o eixo corta-se em troços de igual comprimento
 * e cada troço é um corredor com o seu plano. As passagens prolongam-se
 * meia pegada nas pontas (M2-E12), pelo que troços vizinhos se sobrepõem
 * uma pegada inteira no corte. O número de troços é o mínimo para cada voo
 * caber no tempo útil da bateria, com 5 % de margem para as subidas do
 * seguimento de terreno. A deslocação desde a base não entra na conta: num
 * corredor longo o piloto muda de sítio ao longo do eixo, e o preflight
 * avisa da distância de cada voo à sua base. Lógica pura.
 */
import * as turf from '@turf/turf'
import { generateCorridorPlan } from '../utils/corridor.js'
import { nearestBase } from './bases.js'
import { corridorRouteWithTerrain, planCorridorTerrain } from './corridorTerrain.js'
import { baseZoneFor, referenceElevation } from './reference.js'

/** Tecto de voos por corredor (acima disto o ficheiro ZIP e a revisão ficam ingeríveis). */
export const MAX_CORRIDOR_FLIGHTS = 60
/** Fracção do tempo útil que um voo pode ocupar (margem para as subidas do relevo). */
export const CORRIDOR_SPLIT_MARGIN = 0.95

/**
 * O eixo cortado em `n` troços de igual comprimento (polilinhas [lon, lat]).
 * @param {number[][]} axis
 * @param {number} n
 * @returns {number[][][]}
 */
export function splitAxis(axis, n) {
  const line = turf.lineString(axis)
  const lenKm = turf.length(line, { units: 'kilometers' })
  if (!(lenKm > 0) || !(n > 1)) return [axis]
  const out = []
  for (let k = 0; k < n; k++) {
    const piece = turf.lineSliceAlong(line, (lenKm * k) / n, (lenKm * (k + 1)) / n, {
      units: 'kilometers',
    }).geometry.coordinates
    out.push(piece)
  }
  return out
}

/**
 * Os voos do corredor: `{ flights: [{ label, axis, plan }], whole }`, com um
 * só voo quando o corredor inteiro cabe na bateria (ou sem tempo útil), ou
 * `{ error }`.
 * @param {number[][]} axis eixo do corredor
 * @param {any} options as opções de generateCorridorPlan
 * @param {{usableS: number|null, labelPrefix?: string}} opts tempo útil por voo (s)
 */
export function planCorridorFlights(axis, options, { usableS, labelPrefix = 'C' }) {
  const whole = generateCorridorPlan(axis, options)
  if (!whole || whole.error) return { error: whole?.error ?? 'no-plan', whole }
  const label = (i) => `${labelPrefix}-${i + 1}`
  const one = { flights: [{ label: label(0), axis, plan: whole }], whole }
  if (!(usableS > 0)) return one
  const limit = usableS * CORRIDOR_SPLIT_MARGIN
  if (whole.stats.flightTimeS <= limit) return one
  let n = Math.max(2, Math.ceil(whole.stats.flightTimeS / limit))
  while (n <= MAX_CORRIDOR_FLIGHTS) {
    const axes = splitAxis(axis, n)
    const plans = axes.map((a) => generateCorridorPlan(a, options))
    const bad = plans.find((p) => !p || p.error)
    if (bad) return { error: bad?.error ?? 'split-failed', whole }
    const worst = Math.max(...plans.map((p) => p.stats.flightTimeS))
    if (worst <= limit) {
      return { flights: axes.map((a, i) => ({ label: label(i), axis: a, plan: plans[i] })), whole }
    }
    // as viragens nas pontas de cada troço crescem com o número de troços:
    // salta para a estimativa seguinte, nunca menos de um
    n = Math.max(n + 1, Math.ceil((n * worst) / limit))
  }
  return { error: 'too-many-flights', whole }
}

/**
 * Cada voo com a sua base (a mais próxima do troço), a cota de referência
 * (a zona da base, senão a mínima do relevo debaixo do troço, como o
 * corredor de um só voo), o seguimento de terreno e a rota final; e a rota
 * de todos junta para a vista 3D e as verificações: alturas na cota comum (a
 * menor das referências), `breaks` onde começa cada voo (o salto entre voos
 * não se voa), as acções por waypoint nos índices da rota junta.
 * @param {Array<{label: string, axis: number[][], plan: any}>} flights
 * @param {{bases?: any[], elevationAt?: ((lon: number, lat: number) => number|null)|null,
 *   zoneConfig?: any, terrainFollow?: {enabled?: boolean, tolerance?: number}|null,
 *   terrainData?: any, altitude: number, speed: number,
 *   waypointStops?: 'corners'|'all'}} c
 */
export function corridorFlightRoutes(flights, c) {
  const {
    bases = [],
    elevationAt = null,
    zoneConfig = null,
    terrainFollow = null,
    terrainData = null,
    altitude,
    speed,
    waypointStops = 'corners',
  } = c
  const routes = flights.map((f) => {
    const base = nearestBase(bases, f.plan.waypoints)
    let reference = null
    if (typeof elevationAt === 'function') {
      const ref = referenceElevation({
        elevationAt,
        basePoint: base?.point ?? null,
        waypoints: f.plan.waypoints,
      })
      const zone = base
        ? baseZoneFor(base.point, { elevationAt, zoneConfig, baseRadiusM: base.radiusM })
        : null
      reference = zone
        ? { ...ref, elev: zone.refElev, source: 'base', baseOutside: false, zone }
        : ref
    }
    let terrain = null
    if (terrainFollow?.enabled) {
      if (!terrainData) terrain = { error: 'terrain-not-loaded' }
      else {
        try {
          terrain = planCorridorTerrain(terrainData, f.plan, {
            refElev: reference?.elev ?? null,
            agl: altitude,
            toleranceM: terrainFollow.tolerance,
            speed,
            waypointStops,
          })
        } catch (err) {
          terrain = { error: err?.message ?? 'terrain-failed' }
        }
      }
    }
    const tfOk = terrain && !terrain.error ? terrain : null
    return { ...f, base, reference, terrain, route: corridorRouteWithTerrain(f.plan, f.plan, tfOk) }
  })
  const refs = routes.map((r) => r.reference?.elev).filter((v) => Number.isFinite(v))
  const common = refs.length ? Math.min(...refs) : null
  const waypoints = []
  const breaks = []
  const perWaypoint = []
  let anyAction = false
  for (const r of routes) {
    const dh = common != null && Number.isFinite(r.reference?.elev) ? r.reference.elev - common : 0
    if (waypoints.length > 0) breaks.push(waypoints.length)
    const offset = waypoints.length
    r.route.waypoints.forEach((w, k) => {
      waypoints.push([w[0], w[1], (Number.isFinite(w[2]) ? w[2] : altitude) + dh])
      const pw = r.route.perWaypoint?.[k]
      if (pw) {
        perWaypoint[offset + k] = pw
        anyAction = true
      }
    })
  }
  return {
    routes,
    combined: { waypoints, breaks, perWaypoint: anyAction ? perWaypoint : null, refElev: common },
  }
}
