/**
 * Seguimento de terreno ao nível da MISSÃO: liga o plano de área, o relevo
 * e a divisão em blocos. Lógica pura, sem React — vivia dentro de um
 * useMemo em App.jsx, onde nenhum teste em Node lhe chegava, e foi aí que
 * um bloco podia arrancar num ponto de ligação em vez de numa linha.
 */
import { terrainFollowLines } from '../utils/terrain.js'

/**
 * Reagrupa por bloco os waypoints densificados (ordem preservada).
 *
 * `res` é o resultado de terrainFollowLines sobre TODAS as linhas do plano;
 * `blocks` a divisão em blocos, cada um com as suas `lines` (contíguas, pela
 * ordem do plano) e, se houver grelha nadir, `nadirLineLocal`.
 *
 * A ligação que antecede a primeira linha de um bloco não se voa — o bloco
 * arranca da base, não do fim do bloco anterior — pelo que os pontos que o
 * seguimento de terreno inseriu nessa ligação (`perLink`) são retirados. O
 * marcador do gimbal da grelha nadir cai no primeiro waypoint DA GRELHA,
 * depois da ligação que lá conduz.
 */
export function regroupTerrainBlocks(res, blocks) {
  const porLinha = []
  let idx = 0
  res.perLine.forEach((n) => {
    porLinha.push(res.waypoints.slice(idx, idx + n))
    idx += n
  })
  let li = 0
  return blocks.map((b) => {
    const startLine = li
    const pontosDaLinha = (i) => {
      const pts = porLinha[i] ?? []
      return i === startLine ? pts.slice(res.perLink?.[i] ?? 0) : pts
    }
    const waypoints = []
    const perLine = []
    const perLink = []
    for (let k = 0; k < b.lines.length; k++) {
      const pts = pontosDaLinha(li)
      waypoints.push(...pts)
      perLine.push(pts.length)
      perLink.push(k === 0 ? 0 : (res.perLink?.[li] ?? 0))
      li++
    }
    let nadirMarkerAt = null
    if (b.nadirLineLocal != null) {
      nadirMarkerAt = 0
      for (let k = 0; k < b.nadirLineLocal; k++) nadirMarkerAt += pontosDaLinha(startLine + k).length
      if (b.nadirLineLocal > 0) nadirMarkerAt += res.perLink?.[startLine + b.nadirLineLocal] ?? 0
    }
    return { ...b, waypoints, nadirMarkerAt, perLine, perLink }
  })
}

/**
 * Alturas por waypoint para um plano de área.
 *
 * `refPt` é o ponto de referência das alturas (a base marcada, ou o primeiro
 * waypoint); a sua cota no terreno é o zero das alturas relativas que o WPML
 * escreve. Devolve `{ error: 'ref-outside-terrain' }` quando o terreno não
 * cobre esse ponto.
 */
export function planTerrainFollow(terrain, plan, { blocks = null, refPt, agl, toleranceM = 5 }) {
  const refElev = terrain.elevationAt(refPt[0], refPt[1])
  if (!Number.isFinite(refElev)) return { error: 'ref-outside-terrain' }
  const res = terrainFollowLines(terrain, plan.lines, {
    agl,
    refElev,
    toleranceM: Math.max(1, toleranceM),
  })
  return { ...res, refElev, blocks3: blocks ? regroupTerrainBlocks(res, blocks) : null }
}
