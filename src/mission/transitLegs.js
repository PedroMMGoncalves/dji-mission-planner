/**
 * Trânsitos base ↔ rota (M2-T3 da revisão da matemática): as pernas a
 * verificar e a pior folga ao solo entre elas.
 *
 * Com `flyToWaylineMode` «safely» a aeronave sobe à altura do 1.º waypoint
 * (ou à de segurança da descolagem, se maior) e voa a direito até ele; no
 * fim regressa à altura de RTH. Com bases por bloco cada voo descola da sua
 * base, às alturas relativas à cota da zona dela — a rota do 3D está na cota
 * comum, pelo que cada perna é reexprimida na cota da sua zona, como no seu
 * KMZ. Funções puras sobre o que o App já calcula (M3-T3 da revisão do
 * código), para os testes as importarem sem montar o App.
 */
import { transitClearance } from './clearance.js'
import { DEFAULT_TAKEOFF_SECURITY_HEIGHT_M, defaultRthHeightM } from '../utils/exporters.js'

/**
 * @typedef {object} TransitLeg
 * @property {number[]} basePoint [lon, lat] da base de onde o voo descola
 * @property {number} refElev cota de referência das alturas da perna
 * @property {string|null} flight rótulo do voo ("A-1"), ou null na rota única
 * @property {number[][]} waypoints [lon, lat, altura relativa a refElev]
 */

/**
 * As pernas: uma por bloco com base (bases por bloco, cada uma na cota da sua
 * zona) ou uma só, da base de referência à rota inteira.
 * @param {object} a
 * @param {{waypoints: number[][], breaks?: number[]|null, refElev: number}|null} a.view3d
 *   rota de verificação na cota comum (blocksViewRoute) ou única
 * @param {boolean} a.perBlock bases por bloco com cotas próprias (view3d.refSource 'bases')
 * @param {any[]|null} [a.blocks] blocos pela ordem da rota (ou blocks3 do seguimento de terreno)
 * @param {{byBlock?: Record<string, {baseId: string|null, flightLabel: string}>}|null} [a.baseLayout]
 * @param {Array<{id: string, point: number[]}>} [a.bases]
 * @param {{refs: (number|null)[]}|null} [a.blockRefs] cotas de referência por bloco (blockReferences)
 * @param {number[]|null} [a.basePoint] base da rota única
 * @returns {TransitLeg[]}
 */
export function transitLegs({ view3d, perBlock, blocks, baseLayout, bases, blockRefs, basePoint }) {
  if (!view3d?.waypoints?.length || !Number.isFinite(view3d.refElev)) return []
  /** @type {TransitLeg[]} */
  const legs = []
  if (perBlock && blocks?.length) {
    const starts = [0, ...(view3d.breaks ?? [])]
    let k = 0
    blocks.forEach((b, i) => {
      if (!(b.waypoints?.length > 0)) return
      const start = starts[k]
      const end = starts[k + 1] ?? view3d.waypoints.length
      k += 1
      const info = baseLayout?.byBlock?.[b.id]
      const base = (bases ?? []).find((x) => x.id === info?.baseId)
      const refElev = blockRefs?.refs?.[i]
      if (!base || !Number.isFinite(refElev)) return
      // alturas na cota da zona deste voo, como no seu KMZ
      const dh = view3d.refElev - refElev
      legs.push({
        basePoint: base.point,
        refElev,
        flight: info.flightLabel,
        waypoints: view3d.waypoints.slice(start, end).map((w) => [w[0], w[1], (w[2] ?? 0) + dh]),
      })
    })
    return legs
  }
  if (basePoint)
    legs.push({ basePoint, refElev: view3d.refElev, flight: null, waypoints: view3d.waypoints })
  return legs
}

/**
 * Altura de regresso (RTH) de cada voo: a que o KMZ escreve
 * (`defaultRthHeightM` do tecto da rota desse voo, nas alturas da sua zona,
 * nunca abaixo da altitude pedida — como `missionConfigXml`), para o cartão,
 * a ficha, a checklist e o relatório mostrarem o que vai no ficheiro, e a
 * subida de descolagem (M3-U3 da revisão do código).
 * @param {Array<{flight: string|null, waypoints: number[][]}>} legs
 * @param {{altitudeM?: number}} [opts] altitude nominal (área): entra no tecto
 * @returns {{flight: string|null, ceilingM: number, rthM: number}[]}
 */
export function rthByFlight(legs, { altitudeM = 0 } = {}) {
  const alt = Number.isFinite(altitudeM) ? altitudeM : 0
  return (legs ?? []).map((leg) => {
    let tecto = alt
    for (const w of leg.waypoints ?? []) if (Number.isFinite(w[2]) && w[2] > tecto) tecto = w[2]
    return { flight: leg.flight ?? null, ceilingM: tecto, rthM: defaultRthHeightM(tecto) }
  })
}

/** «100» ou «100–120»: o RTH de todos os voos, para os ecrãs. */
export function rthRangeLabel(info) {
  if (!info || !Number.isFinite(info.minM) || !Number.isFinite(info.maxM)) return '—'
  const a = Math.round(info.minM)
  const b = Math.round(info.maxM)
  return a === b ? String(a) : `${a}–${b}`
}

/**
 * A pior folga das pernas: o resultado de transitClearance da perna com a
 * menor folga, com o rótulo do voo. Cada perna regressa à altura de RTH do
 * seu tecto (o waypoint mais alto).
 * @param {TransitLeg[]} legs
 * @param {{elevationAt: (lon: number, lat: number) => number|null,
 *   takeOffSecurityHeightM?: number, rthHeightOf?: (ceilingM: number) => number}} opts
 * @returns {(ReturnType<typeof transitClearance> & {flight: string|null})|null}
 */
export function worstTransit(
  legs,
  {
    elevationAt,
    takeOffSecurityHeightM = DEFAULT_TAKEOFF_SECURITY_HEIGHT_M,
    rthHeightOf = defaultRthHeightM,
  },
) {
  let worst = null
  for (const leg of legs) {
    let tecto = 0
    for (const w of leg.waypoints) if (Number.isFinite(w[2]) && w[2] > tecto) tecto = w[2]
    const r = transitClearance(leg.basePoint, leg.waypoints, {
      elevationAt,
      refElev: leg.refElev,
      takeOffSecurityHeightM,
      rthHeightM: rthHeightOf(tecto),
    })
    if (r && (!worst || r.minM < worst.minM)) worst = { ...r, flight: leg.flight }
  }
  return worst
}
