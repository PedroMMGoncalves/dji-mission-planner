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
/**
 * Fracção de um bloco atrás do relevo, vista da base — ou à vista mas com o
 * rádio em risco (zona de Fresnel) — a partir da qual o preflight avisa
 * (abaixo dela, e acima de zero, é uma nota).
 */
export const VIEWSHED_WARN_FRAC = 0.05

const item = (level, code, params = {}) => ({ level, code, params })
const wpCount = (x) => (Array.isArray(x?.waypoints) ? x.waypoints.length : 0)
const round1 = (v) => Math.round(v * 10) / 10

/**
 * Plano com erro: a mensagem traduzida do modo (`c.planErrorText`, que o App
 * tira dos dicionários do painel), e não o código em bruto, que o operador
 * não sabe ler («standoff-corner»); o código fica em `code` (M3-U8).
 */
const planErrorItem = (c, plan) =>
  item('block', 'plan-error', {
    error: c.planErrorText ?? String(plan.error),
    code: String(plan.error),
  })

/**
 * Onde é um índice da rota de verificação: o voo (rótulo) e as coordenadas
 * do waypoint, que se encontram no mapa, em vez do índice que nenhum ecrã
 * mostra (M3-U8). `c.routePoints` é a rota de verificação ([lon, lat, h]) e
 * `c.flightOfIndex(i)` o rótulo do voo a que o índice pertence (com blocos).
 */
function whereAt(c, index) {
  const w = Array.isArray(c.routePoints) ? c.routePoints[index] : null
  const lat = w && Number.isFinite(w[1]) ? w[1].toFixed(5) : '—'
  const lon = w && Number.isFinite(w[0]) ? w[0].toFixed(5) : '—'
  const flight = typeof c.flightOfIndex === 'function' ? (c.flightOfIndex(index) ?? '1') : '1'
  return { at: index, flight, lat, lon }
}

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
/**
 * Trânsito de ida e volta (s) da rota única: o do pior ponto da zona da base
 * ao 1.º waypoint e do último de volta (`baseTransitS`, blockWorstTransitM,
 * como nos blocos), senão o dobro da distância à área. A distância à
 * fronteira dava 0 com a base dentro da área: 1,7 km e 2,8 min por contar
 * numa área de 1 × 1 km com a base no centro (M2-T4/G5).
 */
function routeTransitS(c) {
  if (Number.isFinite(c.baseTransitS)) return Math.max(0, c.baseTransitS)
  return c.basePoint && c.baseDistance > 0 && c.speed > 0 ? (2 * c.baseDistance) / c.speed : 0
}

function groundItems(c, usable) {
  const out = []
  if (c.basePoint) {
    const km = ((c.baseDistance ?? 0) / 1000).toFixed(1)
    const transitMin = routeTransitS(c) / 60
    if (usable != null && transitMin >= usable)
      out.push(
        item('block', 'base-unreachable', { km, min: round1(transitMin), usable: round1(usable) }),
      )
    else if (c.baseDistance > BASE_FAR_M) out.push(item('warn', 'base-far', { km }))
  }
  if (c.reference?.baseOutside && c.reference.source === 'area-min')
    out.push(item('warn', 'base-no-terrain', { elev: Math.round(c.reference.elev) }))
  const minM = c.clearance?.minM
  if (Number.isFinite(minM)) {
    if (minM < 0) out.push(item('block', 'terrain-collision', { m: round1(-minM) }))
    else if (minM < CLEARANCE_WARN_M) out.push(item('warn', 'clearance-low', { m: round1(minM) }))
  }
  // buracos do relevo debaixo da rota (tile em falta, zona sem dados do
  // MDT) dentro da caixa que se dava como coberta: bloqueio (M2-T1)
  const holes = c.terrainHoles
  if (holes && holes.noData > 0 && c.terrainRoute?.covered) {
    const total = holes.noData + holes.samples
    out.push(
      item('block', 'terrain-holes', {
        n: holes.noData,
        total,
        pct: Math.round((100 * holes.noData) / total),
        lat: holes.at ? holes.at.lat.toFixed(5) : '',
        lon: holes.at ? holes.at.lon.toFixed(5) : '',
      }),
    )
  }
  return out
}

/**
 * Trânsitos entre a base e a rota (transitClearance): a aeronave voa-os
 * sozinha, à altura do 1.º waypoint (ou à de segurança da descolagem) e, no
 * regresso, à de RTH — nenhum número do planeador os mostrava (M2-T3).
 * Bloqueio quando entram no relevo, aviso abaixo de 15 m.
 */
function transitItems(c) {
  const out = []
  // rota única: o vértice mais afastado da rota, do pior ponto da zona,
  // contra o alcance visual da aeronave (os blocos já o tinham por voo)
  if (Number.isFinite(c.routeVlosM) && c.vlosM > 0 && c.routeVlosM > c.vlosM)
    out.push(item('warn', 'route-vlos', { m: Math.round(c.routeVlosM), vlos: Math.round(c.vlosM) }))
  const t = c.transitClearance
  if (!t || !Number.isFinite(t.minM)) return out
  const params = {
    m: round1(Math.abs(t.minM)),
    flight: t.flight ?? '—',
    h: Math.round(t.at?.leg === 'back' ? t.backHeightM : t.outHeightM),
    // a altura de regresso que o KMZ escreve, para o remédio dizer o que é
    rth: Number.isFinite(c.rthHeightM) ? Math.round(c.rthHeightM) : '—',
  }
  if (t.minM < 0) out.push(item('block', 'transit-collision', params))
  else if (t.minM < CLEARANCE_WARN_M) out.push(item('warn', 'transit-low', params))
  return out
}

/**
 * Zona de descolagem reduzida (computeTakeoffZone): nota quando o chão
 * dentro do raio pedido não baixa o voo; aviso com quanto baixaria quando
 * descolar até ao raio pedido punha o voo abaixo do planeado (M2-T7: numa
 * encosta uniforme de 10° o raio cai a 20 m e descolar a 100 m baixava o
 * voo 14 m, só com uma nota); aviso próprio quando a zona fica sem raio.
 */
function zoneItems(base, zone) {
  if (!zone) return []
  const out = []
  if (zone.reduced) {
    const drop = Math.round(zone.cause?.belowM ?? 0)
    const params = {
      base,
      r: Math.round(zone.radiusM),
      req: Math.round(zone.requestedRadiusM),
      relief: Math.round(zone.cause?.reliefM ?? zone.reliefM),
      at: Math.round(zone.cause?.atM ?? zone.radiusM),
      drop,
    }
    if (!(zone.radiusM > 0)) out.push(item('warn', 'base-zone-zero', params))
    else if (drop > 0) out.push(item('warn', 'base-zone-drop', params))
    else out.push(item('info', 'base-zone-reduced', params))
  }
  if (zone.partial) out.push(item('warn', 'base-zone-partial', { base, n: zone.noData }))
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

/**
 * Não há missão sem relevo: as alturas são relativas à descolagem e só o
 * relevo diz a que altura do chão se voa. `c.terrainRoute` diz se o relevo
 * carregado cobre a rota exportada; enquanto não cobrir, um só bloqueio diz
 * porquê (a descarregar, a descarga falhou, o MDT importado não chega lá,
 * ou ainda nada). Sem `terrainRoute` (chamadas antigas, testes) não se
 * verifica.
 */
function terrainRouteItems(c) {
  const t = c.terrainRoute
  if (!t || t.covered) return []
  if (t.status === 'loading') return [item('block', 'terrain-loading')]
  if (t.status === 'error')
    return [
      item('block', t.fromFile ? 'terrain-file-error' : 'terrain-download-error', {
        msg: String(t.error ?? ''),
      }),
    ]
  // o MDT importado já foi recortado de novo para esta caixa e não chega
  if (t.status === 'ready' && t.source === 'file') return [item('block', 'terrain-file-outside')]
  return [item('block', 'terrain-missing')]
}

/**
 * Rota exportada, segmento a segmento (routeChecks), em todos os modos:
 * waypoints a menos de 0,5 m (bloqueio — a DJI recusa-os), taxa de subida
 * acima da aeronave e troços acima de 5 km (avisos).
 */
function routeItems(c) {
  const out = []
  if (c.gimbal)
    out.push(
      item('warn', 'gimbal-range', { worst: c.gimbal.worst, min: c.gimbal.min, max: c.gimbal.max }),
    )
  if (c.route) {
    if (c.route.duplicates.length > 0)
      out.push(
        item('block', 'route-duplicate-waypoint', {
          n: c.route.duplicates.length,
          ...whereAt(c, c.route.duplicates[0]),
        }),
      )
    if (c.route.climb.length > 0) {
      const worst = c.route.climb.reduce((m, x) => (x.rateMS > m.rateMS ? x : m))
      out.push(
        item('warn', 'route-climb-rate', {
          rate: worst.rateMS.toFixed(1),
          n: c.route.climb.length,
          ...whereAt(c, worst.at),
        }),
      )
    }
    if (c.route.longSegments.length > 0) {
      const longest = c.route.longSegments.reduce((m, x) => (x.lengthM > m.lengthM ? x : m))
      out.push(
        item('warn', 'route-long-segment', {
          km: (longest.lengthM / 1000).toFixed(1),
          ...whereAt(c, longest.at),
        }),
      )
    }
  }
  return out
}

/**
 * Bases múltiplas, bloco a bloco (`c.baseLayout`, de layoutBlocks): bloco
 * sem base (não devia acontecer: bloqueia), fora do alcance visual da sua
 * base no pior ponto da zona (aviso, com a distância), voo com o trânsito
 * da base acima do tempo útil (aviso, como a bateria sempre foi; bloqueio
 * quando só o trânsito já o passa, como a base inalcançável), base fora do
 * relevo (bloqueio: a cota de referência dos seus blocos é desconhecida) e
 * zona reduzida junto a um desnível (nota). Os blocos são nomeados pelo voo
 * e pelo id da exportação; as bases pelo rótulo.
 */
function blockBaseItems(c, usable) {
  const L = c.baseLayout
  if (!L?.hasBases) return []
  const out = []
  const blocks = Array.isArray(c.blocks) ? c.blocks : []
  for (const id of L.order) {
    const e = L.byBlock[id]
    if (!e) continue
    const who = { flight: e.flightLabel, id }
    if (!e.baseId) {
      out.push(item('block', 'block-no-base', who))
      continue
    }
    const base = e.baseLabel
    if (!e.withinVlos && Number.isFinite(e.worstVlosM))
      out.push(
        item('warn', 'block-vlos', {
          ...who,
          base,
          m: Math.round(e.worstVlosM),
          vlos: Math.round(c.vlosM ?? 0),
        }),
      )
    const b = blocks.find((x) => x.id === id)
    if (usable != null && b) {
      const transitMin = (e.transitS ?? 0) / 60
      const min = ((b.timeS ?? 0) + (e.transitS ?? 0)) / 60
      if (transitMin >= usable)
        out.push(
          item('block', 'block-base-unreachable', {
            ...who,
            base,
            min: round1(transitMin),
            usable: round1(usable),
          }),
        )
      else if (min > usable)
        out.push(
          item('warn', 'battery-block-base', {
            ...who,
            base,
            min: round1(min),
            transit: round1(transitMin),
            usable: round1(usable),
          }),
        )
    }
  }
  for (const base of L.bases) {
    if (base.blockIds.length === 0) continue
    if (base.noTerrain)
      out.push(
        item('block', 'base-zone-no-terrain', {
          base: base.label,
          flights: base.flights.join(', '),
        }),
      )
    else out.push(...zoneItems(base.label, base.zone))
  }
  return out
}

/**
 * Bacias de visão, bloco a bloco (`c.viewsheds`, de viewshedsByBlock em
 * src/mission/viewshedPlan.js), por causa: a parte do bloco em que o drone
 * fica atrás do relevo visto dos olhos do operador no ponto da base
 * (`block-viewshed`), e a parte À VISTA em que o relevo entra na zona de
 * Fresnel do rádio (`block-radio`; os pontos tapados já contam na outra).
 * Aviso a partir de VIEWSHED_WARN_FRAC, nota abaixo; nada sem pontos (também
 * quando só há pontos sem veredicto, com relevo em falta), nada enquanto se
 * calcula, e nada com a base fora do relevo (já bloqueia acima).
 */
function viewshedItems(c) {
  const L = c.baseLayout
  const V = c.viewsheds
  if (!L?.hasBases || !V) return []
  const out = []
  for (const id of L.order) {
    const v = V[id]
    const s = v?.summary
    if (!s || s.status !== 'ok') continue
    const who = { flight: v.flightLabel, id, base: v.baseLabel }
    if (s.hidden > 0) {
      const params = { ...who, pct: s.hiddenPct, m: s.blockedAtM ?? 0 }
      if (s.hiddenFrac >= VIEWSHED_WARN_FRAC) out.push(item('warn', 'block-viewshed', params))
      else out.push(item('info', 'block-viewshed-minor', params))
    }
    if (s.radioOnly > 0) {
      const params = { ...who, pct: s.radioOnlyPct, m: s.radioAtM ?? 0 }
      if (s.radioOnlyFrac >= VIEWSHED_WARN_FRAC) out.push(item('warn', 'block-radio', params))
      else out.push(item('info', 'block-radio-minor', params))
    }
  }
  return out
}

/**
 * Minutos úteis por voo; null sem bateria. A missão passa o tempo útil do
 * equipamento (já sem a reserva de aterragem) com reservePct 0 — a reserva
 * por omissão é 0 para nunca ser descontada duas vezes.
 */
export function usableBatteryMin(batteryMin, reservePct = 0) {
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
 * @param {number|null} [c.baseTransitS] trânsito de ida e volta da rota única, do pior ponto da zona (s)
 * @param {number|null} [c.routeVlosM] vértice mais afastado da rota única, do pior ponto da zona (m)
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
 * @param {{samples: number, noData: number, at: {lon: number, lat: number}|null}|null} [c.terrainHoles] amostras da rota sem relevo (terrainHolesAlong)
 * @param {{minM: number, at: {leg: string}, outHeightM: number, backHeightM: number, flight?: string|null}|null} [c.transitClearance] folga dos trânsitos base ↔ rota (transitClearance), o pior voo
 * @param {{elev: number|null, source: string|null, baseOutside: boolean, reliefM: number|null}|null} [c.reference] cota de referência (referenceElevation)
 * @param {{worst: number, min: number, max: number}|null} [c.gimbal] inclinação pedida fora do intervalo do payload (gimbalRangeViolation)
 * @param {number|null} [c.aglMaxM] maior altura acima do solo da rota (nota da categoria aberta)
 * @param {{covered: boolean, status: string, source: string|null, error: string|null, fromFile?: boolean}|null} [c.terrainRoute] o relevo cobre a rota exportada
 * @param {any} [c.baseLayout] bases múltiplas: layoutBlocks (src/mission/baseLayout.js)
 * @param {number} [c.vlosM] alcance visual da aeronave (m), para a mensagem
 * @param {{label: string, zone: any}|null} [c.refZone] rota única com bases: a zona da base de referência
 * @param {Record<string, any>|null} [c.viewsheds] bacias de visão por bloco (viewshedsByBlock)
 * @param {string|null} [c.planErrorText] mensagem traduzida do erro do plano (M3-U8)
 * @param {Record<string, string>} [c.blockFlightLabels] rótulo do voo de cada bloco, por id (M3-U4)
 * @param {number[][]|null} [c.routePoints] rota de verificação [lon, lat, h], para as coordenadas dos itens de rota
 * @param {((i: number) => string|null)|null} [c.flightOfIndex] voo a que um índice da rota pertence
 * @param {number|null} [c.rthHeightM] altura de regresso (RTH) escrita no KMZ (a maior, com vários voos)
 * @param {{aircraft: string, payload: string, mode: string}|null} [c.unverified] combinação sem voo confirmado (M3-U19)
 * @returns {Array<{level: 'block'|'warn'|'info', code: string, params: object}>}
 */
export function preflightArea(c) {
  const out = []
  const plan = c.plan ?? null
  if (!plan) return [item('block', 'no-plan')]
  if (plan.error) return [planErrorItem(c, plan)]

  const tf = Boolean(c.terrainFollow?.enabled)
  const tfOk = tf && c.terrainResult && !c.terrainResult.error
  const noTerrain = terrainRouteItems(c)
  out.push(...noTerrain)
  if (tf && c.photoMode === 'waypoint') {
    out.push(item('block', 'terrain-photo-waypoint'))
  } else if (noTerrain.length > 0) {
    // o bloqueio do relevo em falta já diz tudo
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
  out.push(...routeItems(c))

  const usable = usableBatteryMin(c.batteryMin, c.reservePct)
  if (c.baseLayout?.hasBases && blocks) {
    // bases múltiplas: bateria, alcance visual e zona bloco a bloco, e o
    // relevo entre o operador e o drone
    out.push(...blockBaseItems(c, usable))
    out.push(...viewshedItems(c))
  } else if (c.refZone?.zone) {
    // rota única: a zona da base de referência
    out.push(...zoneItems(c.refZone.label, c.refZone.zone))
  }
  if (c.baseLayout?.hasBases && blocks) {
    // (a bateria já foi vista bloco a bloco, com o trânsito de cada base)
  } else if (usable != null) {
    if (blocks) {
      for (const b of blocks) {
        const min = ((b.timeS ?? 0) + (b.transitS ?? 0)) / 60
        if (min > usable)
          out.push(
            item('warn', 'battery-block', {
              // o rótulo do voo, o mesmo do mapa e do ficheiro (M3-U4)
              flight: c.blockFlightLabels?.[b.id] ?? String(b.id),
              id: b.id,
              min: round1(min),
              usable: round1(usable),
            }),
          )
      }
    } else if (Number.isFinite(plan.stats?.flightTimeS)) {
      const min = (plan.stats.flightTimeS + routeTransitS(c)) / 60
      if (min > usable)
        out.push(item('warn', 'battery', { min: round1(min), usable: round1(usable) }))
    }
  }

  out.push(...groundItems(c, usable))
  out.push(...transitItems(c))
  out.push(...noBaseItems(c))
  out.push(...openCategoryItems(c))
  out.push(...unverifiedItems(c))
  out.push(item('info', 'heights-relative'))
  return out
}

/**
 * Preflight dos outros modos (fachada, órbita, corredor, circular): plano
 * válido, limite de waypoints, bateria e a mesma nota sobre as alturas. O
 * `terrainRoute` bloqueia sem relevo sobre a rota, em todos os modos. O
 * corredor passa ainda `photoMode` e `waypointStops`, para o aviso da foto
 * sem paragem; o corredor e o circular passam `terrainFollow`,
 * `terrainCovers` e `terrainResult` (bloqueio sem relevo) e `reference`,
 * `basePoint` e `baseDistance` (verificações da base e da cota assumida).
 * A fachada passa `faceClearance` ({ok, passes, minClearanceM}, checkFaceClearance)
 * e `faceDsmLoaded`; o corredor `corridorDropped` (passagens sem cobertura).
 * @param {any} c
 */
export function preflightPlan(c) {
  const out = []
  const plan = c.plan ?? null
  if (!plan) return [item('block', 'no-plan')]
  if (plan.error) return [planErrorItem(c, plan)]
  // Fachada: a folga ao DSM que o painel verifica (M3-U1) — o corredor de
  // voo a cortar a superfície bloqueia; sem DSM local a verificação não é
  // possível, e fica o aviso. Corredor: passagens sem cobertura (aviso).
  if (c.faceDsmLoaded === false) out.push(item('warn', 'face-unverified'))
  if (c.faceClearance && c.faceClearance.ok === false)
    out.push(
      item('block', 'face-clearance', {
        passes: (c.faceClearance.passes ?? []).join(', '),
        min: c.faceClearance.minClearanceM,
      }),
    )
  if (c.corridorDropped > 0) out.push(item('warn', 'corridor-uncovered', { n: c.corridorDropped }))
  // Seguimento de terreno pedido (corredor, circular) sem relevo que cubra a
  // rota: o KMZ sairia com alturas planas, sem nenhum aviso. Os modos que não
  // o suportam não passam `terrainFollow`.
  const noTerrain = terrainRouteItems(c)
  out.push(...noTerrain)
  if (c.terrainFollow?.enabled && noTerrain.length === 0) {
    if (!c.terrainCovers) out.push(item('block', 'terrain-not-loaded'))
    else if (c.terrainResult?.error)
      out.push(item('block', 'terrain-error', { msg: String(c.terrainResult.error) }))
  }
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
    // com o trânsito de ida e volta, como a área (o corredor e o circular
    // contavam só o voo)
    const min = (plan.stats.flightTimeS + routeTransitS(c)) / 60
    if (min > usable)
      out.push(item('warn', 'battery', { min: round1(min), usable: round1(usable) }))
  }
  out.push(...photoPassUnverified(c))
  out.push(...routeItems(c))
  out.push(...groundItems(c, usable))
  out.push(...transitItems(c))
  // os modos com cota de referência própria (corredor, circular) dizem o que
  // se assume sem base, como a área
  if ('reference' in c) out.push(...noBaseItems(c))
  if (c.refZone?.zone) out.push(...zoneItems(c.refZone.label, c.refZone.zone))
  out.push(...openCategoryItems(c))
  out.push(...unverifiedItems(c))
  out.push(item('info', 'heights-relative'))
  return out
}

/** Máximo acima do solo na categoria aberta (Reg. (UE) 2019/947, UAS.OPEN.010). */
export const OPEN_CATEGORY_MAX_AGL_M = 120

/**
 * Nota, e só nota, quando a rota passa os 120 m acima do solo: a altura é
 * decisão operacional (categoria específica, autorização), a aplicação não
 * corta nem bloqueia. `c.aglMaxM` é a maior altura acima do solo da rota
 * exportada, sobre o relevo; `c.rthHeightM` a altura de regresso (a maior,
 * com vários voos) que o KMZ escreve.
 */
/** Primeiro voo de uma combinação aeronave + payload + modo sem KMZ confirmado (M3-U19). */
function unverifiedItems(c) {
  if (!c.unverified) return []
  return [
    item('info', 'unverified-combo', {
      aircraft: c.unverified.aircraft ?? '',
      payload: c.unverified.payload ?? '',
      mode: c.unverified.mode ?? '',
    }),
  ]
}

function openCategoryItems(c) {
  const out = []
  const m = c.aglMaxM
  if (Number.isFinite(m) && m > OPEN_CATEGORY_MAX_AGL_M)
    out.push(
      item('info', 'open-category-agl', { max: Math.round(m), cap: OPEN_CATEGORY_MAX_AGL_M }),
    )
  // o regresso (RTH) acima dos 120 m passa a categoria aberta junto à base,
  // onde o solo está à cota da descolagem (M3-U3)
  const r = c.rthHeightM
  if (Number.isFinite(r) && r > OPEN_CATEGORY_MAX_AGL_M)
    out.push(
      item('info', 'open-category-rth', { rth: Math.round(r), cap: OPEN_CATEGORY_MAX_AGL_M }),
    )
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
