import * as turf from '@turf/turf'
import { computeFootprint, lineSpacing } from './geo.js'
import { M_PER_DEG_LAT, metersPerDegLon } from './units.js'

/**
 * MAPEAMENTO DE CORREDOR — cobertura de infraestruturas lineares (estradas,
 * condutas, linhas de água, linhas eléctricas) a partir de um eixo desenhado,
 * em vez de um polígono.
 *
 * O problema é simples de enunciar e tem uma armadilha. Dado um eixo e uma
 * meia-largura B, há que voar passagens paralelas ao eixo, afastadas do
 * espaçamento que a sobreposição lateral exige, até cobrir B de cada lado.
 * A armadilha está no desvio paralelo de uma polilinha: onde a curvatura é
 * apertada, isto é, onde |desvio| excede o raio de curvatura local, a linha
 * desviada dobra-se sobre si própria e o drone voaria um laço.
 *
 * Este módulo resolve-a por um critério geométrico em vez de por remoção de
 * auto-intersecções: um ponto do desvio só é válido se distar do eixo
 * exactamente |desvio|. Dentro de uma dobra, a distância ao eixo é menor,
 * logo os pontos da dobra são descartados por construção. A passagem parte-se
 * então em troços contíguos — o mesmo que acontece a uma faixa numa área
 * côncava — em vez de ganhar um laço.
 *
 * A segunda decisão importante é a amostragem. As posições de fotografia são
 * calculadas por comprimento de arco DE CADA PASSAGEM, não do eixo: numa
 * curva, a passagem interior é mais curta do que a exterior, e projectar as
 * posições do eixo para fora daria sobreposição frontal a mais no interior e
 * a menos no exterior — precisamente na berma onde é necessária.
 *
 * Convenções iguais às de geo.js: [lon, lat] em WGS84, distâncias em metros.
 * O cálculo corre num referencial planar local em metros, centrado no eixo.
 */

const MIN_RUN_M = 5 // troços mais curtos do que isto não são passagens úteis
// Trava contra buffers absurdos face ao espaçamento. NÃO é um recorte
// silencioso: passOffsets devolve o número que a cobertura exige, e
// generateCorridorPlan recusa o plano acima deste limite, porque entregar
// menos passagens do que a largura pedida seria dizer ao operador que
// mapeou uma faixa que na verdade não voou.
export const MAX_PASSES = 200
const MAX_SAMPLES = 20000 // trava contra passos de amostragem minúsculos

export const DEFAULT_CORRIDOR_CONFIG = {
  centreline: null, // polilinha [[lon, lat], ...] = eixo do corredor
  bufferM: 60, // meia-largura coberta de cada lado do eixo
  speedMS: 8,
  photoMode: 'distance', // 'distance' | 'waypoint'
  simplifyM: 1, // tolerância de simplificação das passagens (modo distância)
}

/** Normaliza uma configuração guardada num projecto (campos em falta, lixo). */
export function normalizeCorridorConfig(stored) {
  const d = DEFAULT_CORRIDOR_CONFIG
  const s = stored ?? {}
  const num = (v, fallback, lo, hi) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return fallback
    return Math.min(hi, Math.max(lo, n))
  }
  const line = Array.isArray(s.centreline)
    ? s.centreline.filter(
        (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
      )
    : null
  return {
    centreline: line && line.length >= 2 ? line : null,
    bufferM: num(s.bufferM, d.bufferM, 1, 5000),
    speedMS: num(s.speedMS, d.speedMS, 0.5, 25),
    photoMode: s.photoMode === 'waypoint' ? 'waypoint' : 'distance',
    simplifyM: num(s.simplifyM, d.simplifyM, 0, 25),
  }
}

/* ------------------------------------------------------------------ *
 * Geometria pura, no referencial em metros                            *
 * ------------------------------------------------------------------ */

/**
 * Desvios transversais com sinal (metros) das passagens que cobrem um
 * corredor com `halfWidthM` de cada lado do eixo.
 *
 * Simétricos e centrados em 0. Uma passagem central só basta quando a pegada
 * transversal já cobre a largura toda; caso contrário acrescentam-se
 * passagens ao ritmo de uma de cada vez, à medida que o corredor alarga, para
 * o número não saltar. As passagens exteriores transbordam um pouco a berma,
 * o que mantém a sobreposição pedida até ao limite do corredor.
 */
export function passOffsets(halfWidthM, spacingM, footprintAcrossM) {
  const half = Math.max(Number(halfWidthM) || 0, 0)
  const spacing = Math.max(Number(spacingM) || 0, 0.5)
  const across = Math.max(Number(footprintAcrossM) || 0, 0)
  const total = 2 * half
  if (total <= across + 1e-9 || total <= 1e-9) return [0]
  const nPasses = Math.ceil((total - across) / spacing) + 1
  const centre = (nPasses - 1) / 2
  return Array.from({ length: nPasses }, (_, i) => (i - centre) * spacing)
}

/** Comprimento de uma polilinha no plano. */
export function polylineLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return total
}

/**
 * Reamostra uma polilinha a passos ≤ `spacing` MANTENDO todos os vértices
 * originais, para o percurso passar exactamente por cada dobra do eixo e não
 * cortar curvas.
 */
export function resamplePolyline(pts, spacing) {
  if (!Array.isArray(pts) || pts.length === 0) return []
  const step = Math.max(Number(spacing) || 0, 0.25)
  const clean = [pts[0]]
  for (const p of pts.slice(1)) {
    const q = clean[clean.length - 1]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) clean.push(p)
  }
  if (clean.length === 1) return clean
  const out = [clean[0]]
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1]
    const b = clean[i]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      // Verificado por ponto, não por vértice: uma polilinha de dois pontos
      // percorre um único segmento, pelo que uma verificação por vértice só
      // corria depois de o segmento inteiro estar em memória e nunca travava
      // nada. Ao parar aqui garante-se o último ponto e o fim do troço.
      if (out.length >= MAX_SAMPLES) {
        if (out[out.length - 1] !== clean[clean.length - 1]) out.push(clean[clean.length - 1])
        return out
      }
    }
  }
  return out
}

/** Distância de um ponto ao segmento [a, b], no plano. */
function pointSegmentDistance(p, a, b) {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const wx = p[0] - a[0]
  const wy = p[1] - a[1]
  const len2 = vx * vx + vy * vy
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0
  return Math.hypot(wx - t * vx, wy - t * vy)
}

/** Distância de um ponto a uma polilinha (mínimo sobre os segmentos). */
export function pointPolylineDistance(p, line) {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const d = pointSegmentDistance(p, line[i - 1], line[i])
    if (d < best) best = d
  }
  return best
}

/** Normais unitárias à esquerda, uma por segmento da polilinha. */
function segmentNormals(pts) {
  const out = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    const len = Math.hypot(dx, dy) || 1
    out.push([-dy / len, dx / len])
  }
  return out
}

/**
 * Desvio paralelo de uma polilinha com juntas em esquadria (miter).
 *
 * Em cada vértice interior o ponto desviado é a intersecção das duas rectas
 * desviadas, que é o único ponto a distar |offset| dos DOIS segmentos: uma
 * normal média simples ficaria a |offset|·cos(φ) e encolheria a cobertura
 * justamente na curva. Em inversões quase completas a esquadria dispara para
 * o infinito, pelo que acima de `miterLimit` se usa um bisel (os dois pontos
 * desviados do vértice) — a alternativa segura e finita.
 */
export function offsetPolylineMiter(axis, offset, miterLimit = 4) {
  const n = axis.length
  if (n < 2) return []
  const sn = segmentNormals(axis)
  const at = (v, nrm) => [v[0] + nrm[0] * offset, v[1] + nrm[1] * offset]
  const out = [at(axis[0], sn[0])]
  for (let i = 1; i < n - 1; i++) {
    const a = sn[i - 1]
    const b = sn[i]
    const denom = 1 + (a[0] * b[0] + a[1] * b[1])
    const mx = denom > 1e-9 ? (a[0] + b[0]) / denom : Infinity
    const my = denom > 1e-9 ? (a[1] + b[1]) / denom : Infinity
    if (!Number.isFinite(mx) || !Number.isFinite(my) || Math.hypot(mx, my) > miterLimit) {
      out.push(at(axis[i], a), at(axis[i], b))
    } else {
      out.push([axis[i][0] + mx * offset, axis[i][1] + my * offset])
    }
  }
  out.push(at(axis[n - 1], sn[n - 2]))
  return out
}

/**
 * Troços válidos da passagem desviada em `offset` metros.
 *
 * Constrói-se o desvio em esquadria, amostra-se densamente e mantém-se apenas
 * o que dista do eixo o próprio |offset|. Onde a curvatura é mais apertada do
 * que o desvio, a linha desviada dobra-se e os pontos da dobra ficam mais
 * perto do eixo do que |offset| — são descartados, e a passagem parte-se em
 * troços contíguos em vez de ganhar um laço que o drone voaria.
 */
export function offsetRuns(axis, offset, sampleStep) {
  if (Math.abs(offset) < 1e-9) return [axis.slice()]
  const raw = offsetPolylineMiter(axis, offset)
  if (raw.length < 2) return []
  const dense = resamplePolyline(raw, sampleStep)
  const tol = Math.max(0.25, Math.abs(offset) * 0.01)
  const limit = Math.abs(offset) - tol
  const runs = []
  let current = []
  for (const q of dense) {
    if (pointPolylineDistance(q, axis) >= limit) {
      current.push(q)
    } else if (current.length > 0) {
      runs.push(current)
      current = []
    }
  }
  if (current.length > 0) runs.push(current)
  return runs.filter((r) => r.length >= 2 && polylineLength(r) >= MIN_RUN_M)
}

/** Simplificação Douglas-Peucker no plano, preservando os extremos. */
export function simplifyPolyline(pts, toleranceM) {
  const tol = Number(toleranceM) || 0
  if (tol <= 0 || pts.length <= 2) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const stack = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()
    let worst = 0
    let idx = -1
    for (let i = lo + 1; i < hi; i++) {
      const d = pointSegmentDistance(pts[i], pts[lo], pts[hi])
      if (d > worst) {
        worst = d
        idx = i
      }
    }
    if (idx > 0 && worst > tol) {
      keep[idx] = true
      stack.push([lo, idx], [idx, hi])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** Reamostra por comprimento de arco a passos iguais ≤ `interval`. */
export function sampleByArcLength(pts, interval) {
  const step = Number(interval)
  if (!(step > 0) || pts.length < 2) return pts.slice()
  const total = polylineLength(pts)
  const n = Math.max(1, Math.ceil(total / step))
  const target = total / n
  const out = [pts[0]]
  let carried = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    let segLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (segLen <= 0) continue
    let t0 = 0
    while (carried + (1 - t0) * segLen >= target - 1e-9 && out.length <= n) {
      const need = (target - carried) / segLen
      const t = t0 + need
      if (t > 1 + 1e-9) break
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      t0 = t
      carried = 0
    }
    carried += (1 - t0) * segLen
  }
  // O último ponto tem de ser o fim exacto da passagem.
  const last = pts[pts.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push(last)
  else out[out.length - 1] = last
  return out
}

/**
 * Anel do corredor (eixo dilatado de `bufferM`) para desenho no mapa. É
 * ilustrativo — mostra a faixa pedida, não a efectivamente coberta, que numa
 * curva apertada pode ser menor. Devolve null quando a dilatação falha.
 */
export function corridorBufferRing(centreline, bufferM) {
  if (!Array.isArray(centreline) || centreline.length < 2) return null
  if (!(bufferM > 0)) return null
  try {
    const poly = turf.buffer(turf.lineString(centreline), bufferM, { units: 'meters' })
    const ring = poly?.geometry?.coordinates?.[0]
    return Array.isArray(ring) && ring.length >= 4 ? ring : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Gerador do plano                                                     *
 * ------------------------------------------------------------------ */

/**
 * Gera o plano de voo de um corredor.
 *
 * `centreline` é a polilinha do eixo em [lon, lat]. Devolve
 * { lines, waypoints, perWaypoint?, perLine?, stats } com a mesma forma que
 * generateFlightLines, para o resto da aplicação (pré-visualização, blocos,
 * exportação) o consumir sem casos especiais; ou { error } quando os
 * parâmetros não permitem um plano.
 */
export function generateCorridorPlan(centreline, options) {
  const {
    sensor,
    altitude,
    bufferM,
    sideOverlapPct = 70,
    photoIntervalM = 0,
    speed = 8,
    photoMode = 'distance',
    simplifyM = 1,
  } = options ?? {}

  if (!Array.isArray(centreline) || centreline.length < 2) return null
  if (!(altitude > 0)) return { error: 'invalid-altitude' }
  if (!(bufferM > 0)) return { error: 'invalid-buffer' }
  if (!sensor) return { error: 'sensor-required' }

  const footprint = computeFootprint(sensor, altitude)
  const across = footprint.across
  if (!(across > 0)) return { error: 'invalid-footprint' }
  const spacing = lineSpacing(across, sideOverlapPct)
  if (!(spacing > 0.5)) return { error: 'overlap-too-high' }

  // Referencial planar local em metros, centrado no eixo.
  const lat0 = centreline.reduce((s, p) => s + p[1], 0) / centreline.length
  const lon0 = centreline[0][0]
  const mLon = metersPerDegLon(lat0)
  if (!(mLon > 0)) return { error: 'invalid-latitude' }
  const toM = ([lon, lat]) => [(lon - lon0) * mLon, (lat - lat0) * M_PER_DEG_LAT]
  const toLL = ([x, y]) => [lon0 + x / mLon, lat0 + y / M_PER_DEG_LAT]

  const axis = centreline.map(toM)
  const corridorLengthM = polylineLength(axis)
  if (!(corridorLengthM > 0)) return { error: 'degenerate-centreline' }

  const offsets = passOffsets(bufferM, spacing, across)
  if (offsets.length > MAX_PASSES) return { error: 'too-many-passes' }

  // Passo de amostragem do eixo: fino o bastante para as normais seguirem a
  // curvatura e para o critério de validade apanhar as dobras, sem explodir
  // em pontos num corredor longo.
  const sampleStep = Math.max(0.5, Math.min(spacing / 4, corridorLengthM / 4, 10))

  const perWaypointPhotos = photoMode === 'waypoint' && photoIntervalM > 0

  // Passagens: cada desvio pode partir-se em vários troços onde a curvatura
  // impede a cobertura. Alterna-se o sentido (boustrophedon) para o percurso
  // entre passagens ser curto.
  //
  // Contam-se DUAS coisas diferentes, que antes se anulavam uma a outra:
  //  - partidas: um desvio que rende mais do que um troço (a curvatura obriga
  //    a interromper a passagem, mas o corredor continua a ser voado);
  //  - PERDIDAS: um desvio que não rende troço nenhum. Aí a faixa inteira fica
  //    por voar, e é o caso que o operador tem mesmo de saber.
  // O painel derivava o aviso de `runCount - passCount`: uma passagem partida
  // somava +1, uma perdida subtraía −1, e as duas juntas davam zero — aviso
  // nenhum com cobertura em falta. Numa semicircunferência de raio 60 m com
  // meia-largura de 120 m, duas passagens do lado côncavo desapareciam e o
  // painel anunciava a largura pedida, sem uma palavra.
  const runsMetric = []
  let splitPasses = 0
  const droppedOffsets = []
  offsets.forEach((offset, k) => {
    const runs = offsetRuns(axis, offset, sampleStep)
    if (runs.length === 0) droppedOffsets.push(offset)
    else if (runs.length > 1) splitPasses += 1
    const ordered = k % 2 === 0 ? runs : runs.slice().reverse()
    for (const run of ordered) runsMetric.push(k % 2 === 0 ? run : run.slice().reverse())
  })
  if (runsMetric.length === 0) return { error: 'no-coverage' }

  const lines = []
  const waypoints = []
  const perWaypoint = perWaypointPhotos ? [] : null
  const perLine = perWaypointPhotos ? [] : null

  for (const run of runsMetric) {
    const shaped = perWaypointPhotos
      ? sampleByArcLength(run, photoIntervalM)
      : simplifyPolyline(run, simplifyM)
    const ll = shaped.map(toLL)
    lines.push(ll)
    const start = waypoints.length
    for (const p of ll) {
      if (perWaypoint) perWaypoint[waypoints.length] = { actions: ['takePhoto'] }
      waypoints.push(p)
    }
    if (perLine) perLine.push(waypoints.length - start)
  }

  let pathLengthM = 0
  for (let i = 1; i < waypoints.length; i++) {
    pathLengthM += turf.distance(waypoints[i - 1], waypoints[i], { units: 'meters' })
  }
  let coveredM = 0
  for (const seg of lines) coveredM += polylineLength(seg.map(toM))

  let photoCount = null
  if (perWaypointPhotos) photoCount = waypoints.length
  else if (photoIntervalM > 0) {
    photoCount = lines.reduce((n, seg) => n + Math.floor(polylineLength(seg.map(toM)) / photoIntervalM) + 1, 0)
  }

  const TURN_TIME_S = 3
  const flightTimeS = speed > 0 ? pathLengthM / speed + Math.max(0, lines.length - 1) * TURN_TIME_S : null

  return {
    lines,
    waypoints,
    ...(perWaypoint ? { perWaypoint, perLine } : {}),
    stats: {
      corridorLengthM,
      passCount: offsets.length,
      runCount: lines.length,
      splitPasses,
      droppedPasses: droppedOffsets.length,
      droppedOffsets,
      offsets,
      spacingM: spacing,
      footprintAcrossM: across,
      // Largura PEDIDA. Continua a ser este o número mostrado e desenhado no
      // mapa, mas quando `droppedPasses > 0` não é a largura voada — nenhum
      // número único o consegue dizer, porque uma passagem perdida a meio
      // deixa um vazio interior sem encolher a extensão exterior. Quem lê isto
      // tem de olhar também para droppedPasses.
      coveredWidthM: 2 * bufferM,
      lineCount: lines.length,
      waypointCount: waypoints.length,
      totalLineLengthM: coveredM,
      pathLengthM,
      photoCount,
      flightTimeS,
    },
  }
}
