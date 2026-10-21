/**
 * Ficha de campo por base, para a checklist de campo e o relatório da
 * missão: onde fica a base (coordenadas e ligação para a aplicação de
 * mapas), a zona de descolagem, a cota de referência e o ganho, os voos
 * com o tempo (trânsito incluído) e o nome do KMZ de cada um, os conjuntos
 * de baterias que a base pede contra os que a equipa tem, e o alcance
 * visual usado, e por voo a parte do bloco que se vê da base (bacias de
 * visão, com o modelo de relevo usado). Lógica pura sobre summarizeBases,
 * layoutBlocks, flightFiles e viewshedsByBlock; a interface só formata.
 */
import { flightsVsSets } from './equipment.js'

const fin = (v) => typeof v === 'number' && Number.isFinite(v)

/** Coordenadas "lat, lon" com 6 casas decimais (~0,1 m). */
export function formatLatLon(point) {
  if (!Array.isArray(point) || !fin(point[0]) || !fin(point[1])) return ''
  return `${point[1].toFixed(6)}, ${point[0].toFixed(6)}`
}

/**
 * Ligações para abrir um ponto na navegação: `https` (Google Maps, abre a
 * aplicação no telemóvel e funciona no computador) e `geo:` (RFC 5870, a
 * aplicação de mapas do Android), com o rótulo como nome do marcador.
 * @param {number[]} point [lon, lat]
 * @param {string} [label]
 * @returns {{https: string, geo: string}|null}
 */
export function mapLinks(point, label = '') {
  if (!Array.isArray(point) || !fin(point[0]) || !fin(point[1])) return null
  const lat = point[1].toFixed(6)
  const lon = point[0].toFixed(6)
  const q = label ? `(${encodeURIComponent(label)})` : ''
  return {
    https: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    geo: `geo:${lat},${lon}?q=${lat},${lon}${q}`,
  }
}

/** Resumo da bacia de visão de um voo, só quando calculada e com relevo. */
const viewOf = (v) => (v?.summary?.status === 'ok' ? v.summary : null)

/**
 * @typedef {object} FieldFlight
 * @property {number} blockId
 * @property {string} flightLabel
 * @property {string|null} file      nome do KMZ
 * @property {number} flightS        tempo do voo no bloco
 * @property {number} transitS       ida e volta da zona, no pior caso
 * @property {number} totalS
 * @property {number|null} worstVlosM
 * @property {boolean} withinVlos
 * @property {import('./viewshedPlan.js').ViewSummary|null} view bacia de visão vista do ponto
 *   da base (null enquanto se calcula, ou sem relevo)
 * @property {number|null} rthM altura de regresso (RTH) escrita no KMZ deste voo
 * @property {number|null} h1M altura do 1.º waypoint no KMZ (rel. à descolagem)
 * @property {number|null} hmaxM altura máxima no KMZ
 * @property {number|null} pctUseful percentagem do tempo útil (com trânsito)
 */

/** Alturas do KMZ de um voo (relativas à descolagem): a do 1.º waypoint e a máxima. */
function heightFields(h) {
  return {
    h1M: h && fin(h.h1M) ? h.h1M : null,
    hmaxM: h && fin(h.hmaxM) ? h.hmaxM : null,
  }
}
/** Percentagem do tempo útil que um voo (com trânsito) ocupa; null sem útil. */
function pctOf(totalS, usefulS) {
  return fin(usefulS) && usefulS > 0 && fin(totalS) ? Math.round((100 * totalS) / usefulS) : null
}
/** Alturas ({h1M, hmaxM}) de uma lista de waypoints [lon, lat, h]; null sem alturas. */
export function heightsOfWaypoints(waypoints, fallbackM = null) {
  const hs = (waypoints ?? []).map((w) => (fin(w?.[2]) ? w[2] : fallbackM)).filter((h) => fin(h))
  if (hs.length === 0) return null
  return { h1M: hs[0], hmaxM: Math.max(...hs) }
}

/**
 * A ficha de uma rota única (área sem blocos, corredor, circular) com a base
 * marcada: a mesma forma das fichas por base, com um só voo — antes só a
 * área com blocos e bases levava a base para o papel (M3-U10).
 * @param {Record<string, any>} a
 * @returns {any}
 */
export function singleRouteSheet({
  label = 'A',
  color = null,
  point,
  radiusM = null,
  requestedRadiusM = null,
  reduced = false,
  cause = null,
  noTerrain = false,
  refElev = null,
  gainM = null,
  flightLabel = '1',
  file = null,
  flightS = 0,
  transitS = 0,
  vlosM = null,
  worstVlosM = null,
  rthM = null,
  takeoffM = null,
  heights = null,
  usefulS = null,
  params = null,
  equipment = null,
  aircraftId = '',
  batteryId = null,
  baseWord = 'Base',
}) {
  if (!Array.isArray(point) || !fin(point[0]) || !fin(point[1])) return null
  const totalS = (fin(flightS) ? flightS : 0) + (fin(transitS) ? transitS : 0)
  const flight = {
    blockId: 1,
    flightLabel,
    file,
    flightS: fin(flightS) ? flightS : 0,
    transitS: fin(transitS) ? transitS : 0,
    totalS,
    worstVlosM: fin(worstVlosM) ? worstVlosM : null,
    withinVlos: !(fin(worstVlosM) && fin(vlosM) && worstVlosM > vlosM),
    view: null,
    rthM: fin(rthM) ? rthM : null,
    ...heightFields(heights),
    pctUseful: pctOf(totalS, usefulS),
  }
  return {
    id: 'single',
    label,
    color,
    point,
    coords: formatLatLon(point),
    links: mapLinks(point, `${baseWord} ${label}`),
    radiusM,
    requestedRadiusM,
    reduced: Boolean(reduced),
    cause,
    noTerrain: Boolean(noTerrain),
    refElev: fin(refElev) ? refElev : null,
    gainM: fin(gainM) ? gainM : null,
    rthM: fin(rthM) ? rthM : null,
    takeoffM: fin(takeoffM) ? takeoffM : null,
    params: params ?? null,
    usefulS: fin(usefulS) ? usefulS : null,
    flights: [flight],
    totalS,
    sets: flightsVsSets(equipment, aircraftId, batteryId, 1),
    vlosM,
    worstVlosM: fin(worstVlosM) ? worstVlosM : null,
    viewTerrain: null,
    viewPending: false,
  }
}

/**
 * A linha do dia, por cima das fichas: os voos de todas as bases contra os
 * conjuntos de baterias da equipa (M3-U10, M3-U14) — cada ficha comparava os
 * voos da sua base com os conjuntos da equipa inteira.
 * @param {any[]} sheets
 * @param {{equipment?: any, aircraftId?: string, batteryId?: string|null}} eq
 * @returns {{flights: number, sets: number|null, short: boolean}|null}
 */
export function daySummary(sheets, { equipment = null, aircraftId = '', batteryId = null } = {}) {
  const flights = (sheets ?? []).reduce((n, s) => n + (s.flights?.length ?? 0), 0)
  if (flights === 0) return null
  const r = flightsVsSets(equipment, aircraftId, batteryId, flights)
  return { flights, sets: r.sets ?? null, short: Boolean(r.short) }
}

/**
 * A ordem dos voos do dia, para a folha A4 de cada base («10.º voo de 20 ·
 * antes I-9, depois K-11»): os voos das fichas, que vêm base a base pela
 * ordem dos rótulos e, em cada base, pela ordem de voo — a numeração do
 * layoutBlocks. Por rótulo do voo: a posição (1..total) e os voos antes e
 * depois (null no primeiro e no último).
 * @param {any[]} sheets
 * @returns {Map<string, {n: number, total: number, prev: string|null, next: string|null}>}
 */
export function dayFlightOrder(sheets) {
  const labels = (sheets ?? []).flatMap((s) => (s.flights ?? []).map((f) => f.flightLabel))
  return new Map(
    labels.map((l, i) => [
      l,
      { n: i + 1, total: labels.length, prev: labels[i - 1] ?? null, next: labels[i + 1] ?? null },
    ]),
  )
}

/**
 * O aviso da zona de descolagem da folha A4, com a mesma regra do preflight
 * (zoneItems em preflight.js): 'zero' quando a zona ficou sem raio, 'drop'
 * quando descolar até ao raio pedido baixa o voo (`drop` m), 'reduced'
 * quando a zona encolheu sem o baixar, 'noTerrain' com a base fora do
 * relevo carregado (cota desconhecida); null com a zona inteira.
 * @param {any} sheet
 * @returns {{kind: 'zero'|'drop'|'reduced'|'noTerrain', r?: number, req?: number,
 *   relief?: number, at?: number, drop?: number}|null}
 */
export function zoneNotice(sheet) {
  if (!sheet) return null
  if (sheet.noTerrain) return { kind: 'noTerrain' }
  if (!sheet.reduced) return null
  const r = fin(sheet.radiusM) ? Math.round(sheet.radiusM) : 0
  const drop = Math.round(fin(sheet.cause?.belowM) ? sheet.cause.belowM : 0)
  return {
    kind: !(sheet.radiusM > 0) ? 'zero' : drop > 0 ? 'drop' : 'reduced',
    r,
    req: fin(sheet.requestedRadiusM) ? Math.round(sheet.requestedRadiusM) : r,
    relief: Math.round(fin(sheet.cause?.reliefM) ? sheet.cause.reliefM : 0),
    at: Math.round(fin(sheet.cause?.atM) ? sheet.cause.atM : r),
    drop,
  }
}

/**
 * As alturas no comando de uma base (relativas à descolagem): a menor do
 * 1.º waypoint e a maior de todas, entre os voos dela; null sem alturas.
 * @param {any} sheet
 * @returns {{minM: number, maxM: number}|null}
 */
export function sheetHeights(sheet) {
  const fl = (sheet?.flights ?? []).filter((f) => fin(f.h1M))
  if (fl.length === 0) return null
  return {
    minM: Math.min(...fl.map((f) => f.h1M)),
    maxM: Math.max(...fl.map((f) => (fin(f.hmaxM) ? f.hmaxM : f.h1M))),
  }
}

/**
 * Fichas das bases com voos, pela ordem dos rótulos.
 * @param {object} args
 * @param {any[]} args.rows summarizeBases
 * @param {any} args.layout layoutBlocks
 * @param {any[]|null} args.blocks blocos do plano (id, timeS)
 * @param {import('./flightFiles.js').FlightFile[]} [args.files] flightFiles
 * @param {number} args.vlosM alcance visual da aeronave
 * @param {any} [args.equipment] para flightsVsSets
 * @param {string} [args.aircraftId]
 * @param {string|null} [args.batteryId]
 * @param {string} [args.baseWord] palavra antes do rótulo no nome do marcador ("Base")
 * @param {Record<string, any>|null} [args.viewsheds] bacias de visão por bloco (viewshedsByBlock)
 * @param {import('./viewshedPlan.js').TerrainModel|null} [args.viewTerrain] relevo das bacias
 * @param {Array<{flight: string|null, rthM: number}>|null} [args.rthByFlight] RTH de cada voo (rthByFlight)
 * @param {number|null} [args.takeoffM] subida de descolagem escrita no KMZ
 * @param {((id: any) => {h1M: number, hmaxM: number}|null)|null} [args.heightsOf] alturas do KMZ de cada bloco
 * @param {number|null} [args.usefulS] tempo útil por voo (s)
 * @param {any} [args.params] parâmetros do plano para a ficha (altitude, velocidade, sobreposições, GSD)
 */
export function baseFieldSheets({
  rows,
  layout,
  blocks,
  files = [],
  vlosM,
  equipment = null,
  aircraftId = '',
  batteryId = null,
  baseWord = 'Base',
  viewsheds = null,
  viewTerrain = null,
  // altura de regresso (RTH) de cada voo, como o KMZ a escreve (rthByFlight),
  // e a subida de descolagem (M3-U3)
  rthByFlight = null,
  takeoffM = null,
  // alturas do KMZ de cada bloco ({h1M, hmaxM}), tempo útil (s) e os
  // parâmetros que o piloto confere no Pilot 2 (M3-U10)
  heightsOf = null,
  usefulS = null,
  params = null,
}) {
  if (!layout?.hasBases || !Array.isArray(blocks) || blocks.length === 0) return []
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const fileOf = new Map((files ?? []).map((f) => [f.blockId, f.file]))
  const rthOf = (label) => {
    const r = (rthByFlight ?? []).find((x) => x.flight === label)
    return r && fin(r.rthM) ? r.rthM : null
  }
  return (rows ?? [])
    .filter((r) => (r.blockIds ?? []).length > 0)
    .map((r) => {
      const ids = [...r.blockIds].sort(
        (a, b) => (layout.byBlock[a]?.flight ?? a) - (layout.byBlock[b]?.flight ?? b),
      )
      /** @type {FieldFlight[]} */
      const flights = ids.map((id) => {
        const info = layout.byBlock[id] ?? {}
        const b = byId.get(id)
        const flightS = fin(b?.timeS) ? b.timeS : 0
        const transitS = fin(info.transitS) ? info.transitS : 0
        return {
          blockId: id,
          flightLabel: info.flightLabel || String(id),
          file: fileOf.get(id) ?? null,
          flightS,
          transitS,
          totalS: flightS + transitS,
          worstVlosM: fin(info.worstVlosM) ? info.worstVlosM : null,
          withinVlos: info.withinVlos !== false,
          view: viewOf(viewsheds?.[id]),
          rthM: rthOf(info.flightLabel || String(id)),
          ...heightFields(typeof heightsOf === 'function' ? heightsOf(id) : null),
          pctUseful: pctOf(flightS + transitS, usefulS),
        }
      })
      const worst = flights.map((f) => f.worstVlosM).filter(fin)
      const rths = flights.map((f) => f.rthM).filter(fin)
      return {
        id: r.id,
        label: r.label,
        color: r.color,
        point: r.point,
        coords: formatLatLon(r.point),
        links: mapLinks(r.point, `${baseWord} ${r.label}`),
        radiusM: r.radiusM,
        requestedRadiusM: r.requestedRadiusM,
        reduced: Boolean(r.reduced),
        cause: r.cause ?? null,
        noTerrain: Boolean(r.noTerrain),
        refElev: fin(r.refElev) ? r.refElev : null,
        gainM: fin(r.gainM) ? r.gainM : null,
        // a maior altura de regresso entre os voos desta base
        rthM: rths.length ? Math.max(...rths) : null,
        takeoffM: fin(takeoffM) ? takeoffM : null,
        params: params ?? null,
        usefulS: fin(usefulS) ? usefulS : null,
        flights,
        totalS: flights.reduce((s, f) => s + f.totalS, 0),
        sets: flightsVsSets(equipment, aircraftId, batteryId, flights.length),
        vlosM,
        worstVlosM: worst.length ? Math.max(...worst) : null,
        // bacias de visão: o relevo usado e se ainda falta algum voo
        viewTerrain: viewsheds ? viewTerrain : null,
        viewPending: flights.some((f) => viewsheds?.[f.blockId] && !viewsheds[f.blockId].summary),
      }
    })
}
