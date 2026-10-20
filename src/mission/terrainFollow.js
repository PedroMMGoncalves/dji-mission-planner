/**
 * Seguimento de terreno ao nível da MISSÃO: liga o plano de área, o relevo
 * e a divisão em blocos. Lógica pura, sem React — vivia dentro de um
 * useMemo em App.jsx, onde nenhum teste em Node lhe chegava, e foi aí que
 * um bloco podia arrancar num ponto de ligação em vez de numa linha.
 */
import { terrainFollowLines } from '../utils/terrain.js'
import { M_PER_DEG_LAT, metersPerDegLon } from '../utils/units.js'

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
  // cada linha: os seus pontos e o índice global do primeiro, para as
  // acções por waypoint (foto por waypoint com terreno) seguirem o ponto
  const porLinha = []
  let idx = 0
  res.perLine.forEach((n) => {
    porLinha.push({ pts: res.waypoints.slice(idx, idx + n), from: idx })
    idx += n
  })
  let li = 0
  return blocks.map((b) => {
    const startLine = li
    const pontosDaLinha = (i) => {
      const { pts = [], from = 0 } = porLinha[i] ?? {}
      const skip = i === startLine ? (res.perLink?.[i] ?? 0) : 0
      return { pts: pts.slice(skip), from: from + skip }
    }
    const waypoints = []
    const perLine = []
    const perLink = []
    const perWaypoint = res.perWaypoint ? [] : null
    for (let k = 0; k < b.lines.length; k++) {
      const { pts, from } = pontosDaLinha(li)
      if (perWaypoint) {
        pts.forEach((_, j) => {
          const pw = res.perWaypoint[from + j]
          if (pw) perWaypoint[waypoints.length + j] = pw
        })
      }
      waypoints.push(...pts)
      perLine.push(pts.length)
      perLink.push(k === 0 ? 0 : (res.perLink?.[li] ?? 0))
      li++
    }
    let nadirMarkerAt = null
    if (b.nadirLineLocal != null) {
      nadirMarkerAt = 0
      for (let k = 0; k < b.nadirLineLocal; k++)
        nadirMarkerAt += pontosDaLinha(startLine + k).pts.length
      if (b.nadirLineLocal > 0) nadirMarkerAt += res.perLink?.[startLine + b.nadirLineLocal] ?? 0
    }
    // com terreno, as acções por waypoint são as do terreno (índices novos),
    // nunca as do plano em planta, que apontariam para outros pontos
    return { ...b, waypoints, nadirMarkerAt, perLine, perLink, perWaypoint }
  })
}

/**
 * Foto por waypoint com seguimento de terreno: junta os pontos de foto do
 * plano (a passos iguais ao longo de cada faixa, cada um com a sua acção)
 * aos vértices que o relevo pede, ordenados pela distância ao longo da
 * faixa. Cada ponto de foto leva a altura interpolada no perfil voado — é
 * onde a aeronave está quando dispara — e a acção vai com o ponto, não com
 * o índice. Um ponto de foto a menos de meio metro de um vértice do relevo
 * funde-se nele. As ligações entre faixas ficam como o seguimento as deu
 * (sem fotos). Devolve um resultado com a forma de terrainFollowLines e
 * `perWaypoint` alinhado com os waypoints novos; sem `perWaypoint` no plano
 * (disparo por distância ou por tempo) devolve `res` tal qual. Só faixas de
 * dois vértices (as da área); uma faixa com mais vértices fica com os
 * pontos do relevo, sem fotos.
 * @param {any} res resultado de terrainFollowLines sobre `plan.lines`
 * @param {{lines: number[][][], waypoints: number[][], perLine?: number[]|null,
 *   perWaypoint?: any[]|null}} plan
 */
export function mergePhotoWaypoints(res, plan) {
  if (!res || res.error || !plan?.perLine || !plan.perWaypoint) return res
  const waypoints = []
  const perLine = []
  const vertexIndex = []
  const perWaypoint = []
  let tfIdx = 0
  let planIdx = 0
  plan.lines.forEach((seg, i) => {
    const nTf = res.perLine[i] ?? 0
    const link = res.perLink?.[i] ?? 0
    const tfPts = res.waypoints.slice(tfIdx, tfIdx + nTf)
    tfIdx += nTf
    const nPlan = plan.perLine[i] ?? 0
    const planPts = plan.waypoints.slice(planIdx, planIdx + nPlan)
    const planPw = planPts.map((_, k) => plan.perWaypoint[planIdx + k] ?? null)
    planIdx += nPlan
    const start = waypoints.length
    // a ligação que conduz à faixa, tal qual (sem fotos)
    waypoints.push(...tfPts.slice(0, link))
    const linePts = tfPts.slice(link)
    if (linePts.length < 2 || !Array.isArray(seg) || seg.length !== 2) {
      waypoints.push(...linePts)
      perLine.push(waypoints.length - start)
      vertexIndex.push(linePts.length ? [start + link, waypoints.length - 1] : [])
      return
    }
    // distância ao longo da faixa (recta a→b), em metros
    const [a, b] = seg
    const mLon = metersPerDegLon((a[1] + b[1]) / 2)
    const dx = (b[0] - a[0]) * mLon
    const dy = (b[1] - a[1]) * M_PER_DEG_LAT
    const len = Math.hypot(dx, dy) || 1
    const along = (p) => ((p[0] - a[0]) * mLon * dx + (p[1] - a[1]) * M_PER_DEG_LAT * dy) / len
    const tf = linePts.map((p) => ({ p: [p[0], p[1], p[2]], s: along(p), pw: null }))
    // altura do perfil voado em s: linear entre os vértices do relevo que o cercam
    const heightAt = (s) => {
      if (s <= tf[0].s) return tf[0].p[2]
      for (let k = 1; k < tf.length; k++) {
        if (s <= tf[k].s) {
          const t = (s - tf[k - 1].s) / (tf[k].s - tf[k - 1].s || 1)
          return Math.round((tf[k - 1].p[2] + (tf[k].p[2] - tf[k - 1].p[2]) * t) * 10) / 10
        }
      }
      return tf[tf.length - 1].p[2]
    }
    const merged = [...tf]
    planPts.forEach((p, k) => {
      const s = along(p)
      const near = merged.find((m) => Math.abs(m.s - s) < 0.5)
      if (near) {
        if (planPw[k]) near.pw = planPw[k]
      } else merged.push({ p: [p[0], p[1], heightAt(s)], s, pw: planPw[k] })
    })
    merged.sort((u, v) => u.s - v.s)
    const lineStart = waypoints.length
    for (const m of merged) {
      if (m.pw) perWaypoint[waypoints.length] = m.pw
      waypoints.push(m.p)
    }
    perLine.push(waypoints.length - start)
    vertexIndex.push([lineStart, waypoints.length - 1])
  })
  return { ...res, waypoints, perLine, vertexIndex, perWaypoint }
}

/**
 * Resultado do seguimento de terreno: `{error}` (com `detail` opcional) ou as
 * alturas e as estatísticas de terrainFollowLines, mais a cota de referência
 * e, com blocos, os blocos com alturas (`blocks3`). Um só objecto com campos
 * opcionais para o chamador testar `error` e usar o resto sem conversões.
 * @typedef {{error?: string, detail?: string, waypoints?: Array<[number, number, number]>,
 *   perLine?: number[], perLink?: number[], vertexIndex?: number[][], elevMin?: number|null,
 *   elevMax?: number|null, corridorM?: number, corridorRiseMaxM?: number,
 *   clearanceMinM?: number|null, cappedCount?: number, noDataCount?: number,
 *   sampleCount?: number, warnings?: Array<{code: string, params: any, message: string}>,
 *   perWaypoint?: any[]|null, refElev?: number, blocks3?: any[]|null}} TerrainFollowResult
 */

/**
 * Alturas por waypoint para um plano de área.
 *
 * A cota de referência é o zero das alturas relativas que o WPML escreve:
 * `refElev` quando o chamador já a decidiu (referenceElevation — base, ou a
 * mínima da área), senão a cota do terreno em `refPt`. Devolve
 * `{ error: 'ref-outside-terrain' }` quando não há cota nenhuma.
 *
 * `blockRefs` (opcional, alinhado com `blocks`): com bases múltiplas cada
 * bloco descola da sua base e as alturas do bloco referem-se à cota da zona
 * dela, `agl + terreno − refBloco`. Os blocos com cota própria são
 * recalculados com ela (os mesmos pontos: cada troço é amostrado por si, e a
 * ligação que antecede o bloco já não entrava); a rota inteira
 * (`waypoints`) fica na cota comum `refElev`, para o 3D e a folga ao solo.
 * @returns {TerrainFollowResult}
 */
export function planTerrainFollow(
  terrain,
  plan,
  { blocks = null, refPt = null, refElev: refGiven = null, agl, toleranceM = 5, blockRefs = null },
) {
  const refElev = Number.isFinite(refGiven)
    ? refGiven
    : refPt
      ? terrain.elevationAt(refPt[0], refPt[1])
      : null
  if (!Number.isFinite(refElev)) return { error: 'ref-outside-terrain' }
  // com foto por waypoint, os pontos de foto entram na rota do relevo
  const res = mergePhotoWaypoints(
    terrainFollowLines(terrain, plan.lines, { agl, refElev, toleranceM: Math.max(1, toleranceM) }),
    plan,
  )
  let blocks3 = blocks ? regroupTerrainBlocks(res, blocks) : null
  if (blocks3 && Array.isArray(blockRefs)) {
    const warnings = [...(res.warnings ?? [])]
    blocks3 = blocks3.map((b3, i) => {
      const r = blockRefs[i]
      if (!Number.isFinite(r) || r === refElev) return { ...b3, refElev }
      const own = mergePhotoWaypoints(
        terrainFollowLines(terrain, blocks[i].lines, {
          agl,
          refElev: r,
          toleranceM: Math.max(1, toleranceM),
        }),
        blocks[i],
      )
      for (const w of own.warnings ?? []) if (!warnings.includes(w)) warnings.push(w)
      return { ...regroupTerrainBlocks(own, [blocks[i]])[0], refElev: r }
    })
    return { ...res, warnings, refElev, blocks3 }
  }
  return { ...res, refElev, blocks3 }
}
