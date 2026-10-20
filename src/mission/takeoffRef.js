/**
 * Ponto de descolagem das missões de face e de órbita: no chão do alvo (o pé
 * da face, o chão no POI), como sempre, ou numa base do projecto. As alturas
 * do plano medem-se acima do chão do alvo; o WPML escreve-as relativas à
 * descolagem (relativeToStartPoint). Com uma base e relevo que cubra a base
 * e o alvo, somam a diferença de cotas (alvo − base), e o piloto deixa de
 * fazer a conta de cabeça. A cota da base é a da sua zona de descolagem (a
 * mínima, como na área e no corredor), senão a do ponto. Lógica pura.
 */
import { baseZoneFor } from './reference.js'

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])

/**
 * @typedef {{mode: 'target'|'base', base: any|null, dh: number, refElev: number|null,
 *   targetElev: number|null, baseElev: number|null, error?: string}} TakeoffRef
 */

/**
 * @param {{baseId?: string|null, bases?: any[], targetPoint?: number[]|null,
 *   elevationAt?: ((lon: number, lat: number) => number|null)|null, zoneConfig?: any}} args
 * @returns {TakeoffRef}
 */
export function takeoffReference({
  baseId = null,
  bases = [],
  targetPoint = null,
  elevationAt = null,
  zoneConfig = null,
}) {
  const canSample = typeof elevationAt === 'function'
  const atTarget =
    canSample && isPoint(targetPoint) ? elevationAt(targetPoint[0], targetPoint[1]) : null
  const targetElev = Number.isFinite(atTarget) ? atTarget : null
  if (!baseId) {
    return { mode: 'target', base: null, dh: 0, refElev: targetElev, targetElev, baseElev: null }
  }
  const base = (bases ?? []).find((b) => b?.id === baseId) ?? null
  // a base escolhida já não existe: as alturas ficariam relativas a um sítio
  // que o projecto não tem, por isso é um erro e não um regresso silencioso
  if (!base || !isPoint(base.point)) {
    return {
      mode: 'base',
      base: null,
      dh: 0,
      refElev: null,
      targetElev,
      baseElev: null,
      error: 'base-missing',
    }
  }
  if (!canSample) {
    return {
      mode: 'base',
      base,
      dh: 0,
      refElev: null,
      targetElev: null,
      baseElev: null,
      error: 'terrain-missing',
    }
  }
  const zone = baseZoneFor(base.point, { elevationAt, zoneConfig, baseRadiusM: base.radiusM })
  const atBase = elevationAt(base.point[0], base.point[1])
  const baseElev = Number.isFinite(zone?.refElev)
    ? zone.refElev
    : Number.isFinite(atBase)
      ? atBase
      : null
  if (targetElev == null || baseElev == null) {
    return {
      mode: 'base',
      base,
      dh: 0,
      refElev: null,
      targetElev,
      baseElev,
      error: 'ref-outside-terrain',
    }
  }
  return {
    mode: 'base',
    base,
    dh: targetElev - baseElev,
    refElev: baseElev,
    targetElev,
    baseElev,
  }
}

/** Waypoints com a altura somada de `dh` (acima do alvo → relativa à descolagem). */
export function shiftHeights(waypoints, dh) {
  if (!Number.isFinite(dh) || dh === 0 || !Array.isArray(waypoints)) return waypoints
  return waypoints.map((w) => [
    w[0],
    w[1],
    Math.round(((Number.isFinite(w[2]) ? w[2] : 0) + dh) * 10) / 10,
  ])
}

/**
 * O plano de face ou de órbita com as alturas relativas à descolagem: os
 * waypoints e as alturas das passagens/níveis (`stats.heights`). Sem
 * diferença (descolagem no chão do alvo), o próprio plano.
 * @param {any} plan
 * @param {TakeoffRef|null} ref
 */
export function planForTakeoff(plan, ref) {
  const dh = ref && !ref.error && ref.mode === 'base' ? ref.dh : 0
  if (!plan || plan.error || !Number.isFinite(dh) || dh === 0) return plan
  return {
    ...plan,
    waypoints: shiftHeights(plan.waypoints, dh),
    stats: plan.stats
      ? {
          ...plan.stats,
          heights: Array.isArray(plan.stats.heights)
            ? plan.stats.heights.map((h) => Math.round((h + dh) * 10) / 10)
            : plan.stats.heights,
        }
      : plan.stats,
  }
}
