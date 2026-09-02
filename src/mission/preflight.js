/**
 * Preflight: uma só lista do que impede ou desaconselha a exportação da
 * missão activa, calculada a partir do mesmo estado que a exportação usa.
 * Cada item tem `level` ('block' impede a exportação; 'warn' desaconselha;
 * 'info' lembra), um `code` que é a chave i18n `preflight.<code>` e os
 * `params` da mensagem. Lógica pura; o App só a mostra e usa os bloqueios
 * para desactivar o botão.
 */

/** Limite duro do WPML: índices de waypoint em 16 bits. */
export const WPML_MAX_WAYPOINTS = 65535
/** Acima disto o Pilot 2 importa lentamente (aviso brando). */
export const WAYPOINT_SOFT_LIMIT = 2000

const item = (level, code, params = {}) => ({ level, code, params })
const wpCount = (x) => (Array.isArray(x?.waypoints) ? x.waypoints.length : 0)
const round1 = (v) => Math.round(v * 10) / 10

/** Minutos úteis de uma bateria, descontada a reserva; null sem bateria. */
export function usableBatteryMin(batteryMin, reservePct = 30) {
  if (!(batteryMin > 0)) return null
  return batteryMin * (1 - Math.min(95, Math.max(0, reservePct)) / 100)
}

/**
 * Preflight da missão de área.
 * @param {object} c
 * @param {any} c.plan plano (pode ter `error`) ou null
 * @param {any[]|null} [c.blocks] blocos de voo, quando a missão está dividida
 * @param {'distance'|'waypoint'} [c.photoMode]
 * @param {{enabled: boolean, tolerance: number}} [c.terrainFollow]
 * @param {boolean} [c.terrainCovers] o relevo carregado cobre a área
 * @param {any} [c.terrainResult] resultado do terrain follow ({error} ou waypoints)
 * @param {number[]|null} [c.basePoint]
 * @param {number|null} [c.baseDistance] distância base → área (m)
 * @param {number} [c.speed] m/s
 * @param {number} [c.batteryMin]
 * @param {number} [c.reservePct]
 * @param {{cap: number, worstAgl: number}|null} [c.aglWarn]
 * @param {{actualS: number, minS: number, maxSpeed: number}|null} [c.triggerWarn]
 * @returns {Array<{level: 'block'|'warn'|'info', code: string, params: object}>}
 */
export function preflightArea(c) {
  const out = []
  const plan = c.plan ?? null
  if (!plan) return [item('block', 'no-plan')]
  if (plan.error) return [item('block', 'plan-error', { error: String(plan.error) })]

  const tf = Boolean(c.terrainFollow?.enabled)
  const tfOk = tf && c.terrainResult && !c.terrainResult.error
  if (tf && c.photoMode === 'waypoint') {
    out.push(item('block', 'terrain-photo-waypoint'))
  } else if (tf && !c.terrainCovers) {
    // sem relevo o KMZ sairia com alturas planas, sem nenhum aviso
    out.push(item('block', 'terrain-not-loaded'))
  } else if (tf && c.terrainResult?.error) {
    out.push(item('block', 'terrain-error', { msg: String(c.terrainResult.error) }))
  }

  // waypoints por rota exportada: a missão inteira ou o maior bloco
  const blocks = Array.isArray(c.blocks) && c.blocks.length > 0 ? c.blocks : null
  let n
  if (tfOk) {
    const b3 = Array.isArray(c.terrainResult.blocks3) ? c.terrainResult.blocks3 : null
    n = b3 && b3.length > 0 ? Math.max(...b3.map(wpCount)) : wpCount(c.terrainResult)
  } else {
    n = blocks ? Math.max(...blocks.map(wpCount)) : wpCount(plan)
  }
  if (n > WPML_MAX_WAYPOINTS)
    out.push(item('block', 'too-many-waypoints', { n, max: WPML_MAX_WAYPOINTS }))
  else if (n > WAYPOINT_SOFT_LIMIT) out.push(item('warn', 'waypoints-many', { n }))

  if (c.aglWarn)
    out.push(item('warn', 'agl-cap', { cap: c.aglWarn.cap, worst: Math.round(c.aglWarn.worstAgl) }))
  if (c.triggerWarn) {
    out.push(
      item('warn', 'shutter', {
        s: c.triggerWarn.actualS.toFixed(2),
        min: c.triggerWarn.minS.toFixed(1),
        vmax: c.triggerWarn.maxSpeed.toFixed(1),
      }),
    )
  }

  const usable = usableBatteryMin(c.batteryMin, c.reservePct)
  if (usable != null) {
    if (blocks) {
      for (const b of blocks) {
        const min = ((b.timeS ?? 0) + (b.transitS ?? 0)) / 60
        if (min > usable)
          out.push(
            item('warn', 'battery-block', { id: b.id, min: round1(min), usable: round1(usable) }),
          )
      }
    } else if (Number.isFinite(plan.stats?.flightTimeS)) {
      const transitS = c.baseDistance > 0 && c.speed > 0 ? (2 * c.baseDistance) / c.speed : 0
      const min = (plan.stats.flightTimeS + transitS) / 60
      if (min > usable)
        out.push(item('warn', 'battery', { min: round1(min), usable: round1(usable) }))
    }
  }

  if (!c.basePoint) out.push(item('info', 'no-base'))
  out.push(item('info', 'heights-relative'))
  return out
}

/**
 * Preflight dos outros modos (fachada, órbita, corredor): plano válido,
 * limite de waypoints, bateria e a mesma nota sobre as alturas.
 */
export function preflightPlan(c) {
  const out = []
  const plan = c.plan ?? null
  if (!plan) return [item('block', 'no-plan')]
  if (plan.error) return [item('block', 'plan-error', { error: String(plan.error) })]
  const n = wpCount(plan)
  if (n > WPML_MAX_WAYPOINTS)
    out.push(item('block', 'too-many-waypoints', { n, max: WPML_MAX_WAYPOINTS }))
  else if (n > WAYPOINT_SOFT_LIMIT) out.push(item('warn', 'waypoints-many', { n }))
  if (c.aglWarn)
    out.push(item('warn', 'agl-cap', { cap: c.aglWarn.cap, worst: Math.round(c.aglWarn.worstAgl) }))
  if (c.triggerWarn) {
    out.push(
      item('warn', 'shutter', {
        s: c.triggerWarn.actualS.toFixed(2),
        min: c.triggerWarn.minS.toFixed(1),
        vmax: c.triggerWarn.maxSpeed.toFixed(1),
      }),
    )
  }
  const usable = usableBatteryMin(c.batteryMin, c.reservePct)
  if (usable != null && Number.isFinite(plan.stats?.flightTimeS)) {
    const min = plan.stats.flightTimeS / 60
    if (min > usable)
      out.push(item('warn', 'battery', { min: round1(min), usable: round1(usable) }))
  }
  out.push(item('info', 'heights-relative'))
  return out
}

/** Um bloqueio impede a exportação. */
export const hasBlockers = (items) => items.some((i) => i.level === 'block')

/** Contagens por nível, para o resumo. */
export function preflightCounts(items) {
  const c = { block: 0, warn: 0, info: 0 }
  for (const i of items) c[i.level] = (c[i.level] ?? 0) + 1
  return c
}
