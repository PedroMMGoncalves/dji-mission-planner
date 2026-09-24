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
/** Base a mais do que isto da área: o trânsito passa a contar a sério (aviso). */
export const BASE_FAR_M = 2000
/** Folga ao solo abaixo disto avisa; abaixo de zero bloqueia (a rota entra no relevo). */
export const CLEARANCE_WARN_M = 15
/** Sem base, um desnível da área acima disto faz da cota assumida um aviso e não um lembrete. */
export const NO_BASE_RELIEF_WARN_M = 10

const item = (level, code, params = {}) => ({ level, code, params })
const wpCount = (x) => (Array.isArray(x?.waypoints) ? x.waypoints.length : 0)
const round1 = (v) => Math.round(v * 10) / 10

/**
 * Foto por waypoint sem paragem: nenhum voo provou ainda que o Pilot 2
 * dispara a acção de foto ao passar pelo ponto sem parar. Aviso até um voo
 * o confirmar (docs/VALIDACAO.md, matriz de compatibilidade).
 */
const photoPassUnverified = (c) =>
  c.photoMode === 'waypoint' && c.waypointStops !== 'all'
    ? [item('warn', 'photo-pass-unverified')]
    : []

/**
 * Base e solo: o que uma base longe da área ou fora do relevo, e uma rota
 * que entra no terreno, têm a dizer antes de exportar. Os dois sintomas
 * vistos no campo — perfil com o voo debaixo da terra e blocos de 80 m —
 * tinham a mesma causa (base a dezenas de km, fora do MDT) e nenhum aviso.
 */
function groundItems(c, usable) {
  const out = []
  if (c.basePoint && c.baseDistance > BASE_FAR_M) {
    const km = (c.baseDistance / 1000).toFixed(1)
    const transitMin = c.speed > 0 ? (2 * c.baseDistance) / c.speed / 60 : null
    if (usable != null && transitMin != null && transitMin >= usable)
      out.push(
        item('block', 'base-unreachable', { km, min: round1(transitMin), usable: round1(usable) }),
      )
    else out.push(item('warn', 'base-far', { km }))
  }
  if (c.reference?.baseOutside && c.reference.source === 'area-min')
    out.push(item('warn', 'base-no-terrain', { elev: Math.round(c.reference.elev) }))
  const minM = c.clearance?.minM
  if (Number.isFinite(minM)) {
    if (minM < 0) out.push(item('block', 'terrain-collision', { m: round1(-minM) }))
    else if (minM < CLEARANCE_WARN_M) out.push(item('warn', 'clearance-low', { m: round1(minM) }))
  }
  return out
}

/**
 * Sem base: lembrete brando em terreno plano; aviso, com a cota assumida e o
 * desnível, quando a área tem relevo — aí a diferença entre a cota mínima
 * assumida e a descolagem real é altura de voo a mais (GSD a menos) ou, se
 * descolar fora e abaixo da área, folga a menos.
 */
function noBaseItems(c) {
  if (c.basePoint) return []
  const r = c.reference
  if (r?.source === 'area-min' && Number.isFinite(r.reliefM) && r.reliefM > NO_BASE_RELIEF_WARN_M)
    return [
      item('warn', 'no-base-relief', { elev: Math.round(r.elev), relief: Math.round(r.reliefM) }),
    ]
  return [item('info', 'no-base')]
}

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
 * @param {'corners'|'all'} [c.waypointStops] paragem nos waypoints (omissão: só nos cantos)
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
 * @param {{kind: string, model?: string}|null} [c.terrainDatum] datum vertical da fonte de relevo
 * @param {any} [c.uncertainty] intervalos de uncertaintyIntervals (sobreposições no pior caso)
 * @param {Array<{exposureS: number, blurCm: number, blurPx: number|null}>|null} [c.blur] arrastamento por exposição
 * @param {{duplicates: number[], longSegments: any[], climb: any[]}|null} [c.route] routeChecks da rota exportada
 * @param {{minM: number}|null} [c.clearance] pior folga ao solo da rota exportável (routeClearance)
 * @param {{elev: number|null, source: string|null, baseOutside: boolean, reliefM: number|null}|null} [c.reference] cota de referência (referenceElevation)
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
  // com seguimento de terreno a foto por waypoint já está bloqueada acima
  if (!tf) out.push(...photoPassUnverified(c))

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

  // alturas elipsoidais no MDT: as diferencas continuam certas, mas a cota
  // do ponto de descolagem que o operador compara com o mapa nao e a mesma
  if (tfOk && c.terrainDatum?.kind === 'ellipsoidal') {
    out.push(item('warn', 'terrain-datum-ellipsoidal', { model: c.terrainDatum.model ?? '' }))
  }

  // incerteza propagada: sobreposicao no pior caso abaixo do minimo habitual
  const u = c.uncertainty
  if (u?.belowMinimum) {
    out.push(
      item('warn', 'overlap-uncertain', {
        front: u.front ? Math.round(u.front[0]) : '-',
        side: u.side ? Math.round(u.side[0]) : '-',
        mode: u.inputs?.mode === 'rtk' ? 'RTK' : 'GNSS',
      }),
    )
  }
  // arrastamento por movimento acima de um pixel a 1/500 s
  const slow = Array.isArray(c.blur)
    ? c.blur.find((b) => Math.abs(b.exposureS - 1 / 500) < 1e-9)
    : null
  if (slow && slow.blurPx != null && slow.blurPx > 1) {
    out.push(item('warn', 'blur', { px: slow.blurPx.toFixed(1), cm: slow.blurCm.toFixed(1) }))
  }
  // rota exportada, segmento a segmento
  if (c.route) {
    if (c.route.duplicates.length > 0)
      out.push(
        item('block', 'route-duplicate-waypoint', {
          n: c.route.duplicates.length,
          at: c.route.duplicates[0],
        }),
      )
    if (c.route.climb.length > 0) {
      const worst = c.route.climb.reduce((m, x) => (x.rateMS > m.rateMS ? x : m))
      out.push(
        item('warn', 'route-climb-rate', {
          rate: worst.rateMS.toFixed(1),
          at: worst.at,
          n: c.route.climb.length,
        }),
      )
    }
    if (c.route.longSegments.length > 0) {
      const longest = c.route.longSegments.reduce((m, x) => (x.lengthM > m.lengthM ? x : m))
      out.push(
        item('warn', 'route-long-segment', {
          km: (longest.lengthM / 1000).toFixed(1),
          at: longest.at,
        }),
      )
    }
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

  out.push(...groundItems(c, usable))
  out.push(...noBaseItems(c))
  out.push(item('info', 'heights-relative'))
  return out
}

/**
 * Preflight dos outros modos (fachada, órbita, corredor): plano válido,
 * limite de waypoints, bateria e a mesma nota sobre as alturas. O corredor
 * passa ainda `photoMode` e `waypointStops`, para o aviso da foto sem paragem.
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
  out.push(...photoPassUnverified(c))
  out.push(...groundItems(c, usable))
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
