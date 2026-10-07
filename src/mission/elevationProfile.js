import * as turf from '@turf/turf'

/**
 * Amostragem do perfil de elevação (terreno sob a rota contra a altitude de
 * voo). Lógica pura, separada do componente para se poder testar.
 */

const STEP_M = 25 // passo alvo de amostragem do terreno
const MAX_SAMPLES = 2000 // trava de performance: o passo cresce se preciso

/** Mediana de uma lista de números (assume-se não vazia). */
function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Constrói o perfil da seleção.
 *
 * `breaks` são os índices dos waypoints onde começa um voo novo (a rota de
 * todos os blocos com bases): o salto do fim de um bloco ao início do
 * seguinte não se voa, por isso não conta no percurso nem na folga, e abre
 * uma falha no terreno e na linha de voo. Antes era amostrado como se fosse
 * voado e a folga mínima de «Tudo» podia cair num desses saltos.
 *
 * Devolve `{ ok, samples, nodes, totalM, hasTerrain, gMin, gMax, aglMin,
 * aglMax, worst, yMin, yMax, wpCount }`, onde `samples` são as amostras do
 * terreno (`ground` pode ser `null`) e `nodes` os vértices da linha de voo
 * (`gap: true` no primeiro de cada voo depois de um salto).
 *
 * @param {Array<[number, number, number?]>} wps waypoints [lon, lat, alturaRel]
 * @param {{elevationAt?: (lon: number, lat: number) => number|null}|null} terrain
 * @param {number|null} refElev cota a que as alturas relativas se somam
 * @param {number[]|null} [breaks]
 */
export function buildProfile(wps, terrain, refElev, breaks = null) {
  const empty = {
    ok: false,
    samples: [],
    nodes: [],
    totalM: 0,
    hasTerrain: false,
    gMin: null,
    gMax: null,
    aglMin: null,
    aglMax: null,
    worst: null,
    yMin: 0,
    yMax: 1,
    wpCount: 0,
  }

  const raw = Array.isArray(wps) ? wps : []
  // os índices dos saltos referem-se à lista dada; ao filtrar pontos
  // inválidos, o salto passa para o ponto válido seguinte
  const breakSet = new Set(Array.isArray(breaks) ? breaks : [])
  const pts = []
  const jump = []
  let pendingJump = false
  raw.forEach((p, i) => {
    if (breakSet.has(i)) pendingJump = true
    if (!(Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return
    jump.push(pendingJump && pts.length > 0)
    pendingJump = false
    pts.push(p)
  })
  if (pts.length < 2) return empty

  // Alturas relativas: as que faltam herdam a mediana das existentes (voo
  // plano) ou 100 m se nenhum waypoint trouxer altura.
  const given = pts.map((p) => p[2]).filter(Number.isFinite)
  const fallback = given.length > 0 ? median(given) : 100
  const ref = Number.isFinite(refElev) ? refElev : 0
  const alt = pts.map((p) => ref + (Number.isFinite(p[2]) ? p[2] : fallback))

  // Comprimento de cada segmento voado e percurso total (os saltos valem 0)
  const segLen = []
  let totalM = 0
  for (let i = 1; i < pts.length; i++) {
    if (jump[i]) {
      segLen.push(0)
      continue
    }
    const d = turf.distance([pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]], {
      units: 'meters',
    })
    const len = Number.isFinite(d) ? d : 0
    segLen.push(len)
    totalM += len
  }

  // Passo efetivo: nunca abaixo de STEP_M e sempre dentro do orçamento de
  // amostras (cada segmento gasta pelo menos uma).
  const budget = Math.max(2, MAX_SAMPLES - segLen.length)
  const step = Math.max(STEP_M, totalM / budget)

  // O receiver é preservado (algumas fontes de relevo usam closures/estado).
  const sample =
    typeof terrain?.elevationAt === 'function' ? (lon, lat) => terrain.elevationAt(lon, lat) : null

  const samples = []
  const nodes = [{ d: 0, alt: alt[0] }]

  const push = (d, lon, lat, a) => {
    const g = sample ? sample(lon, lat) : null
    samples.push({ d, alt: a, ground: Number.isFinite(g) ? g : null })
  }

  push(0, pts[0][0], pts[0][1], alt[0])

  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (jump[i]) {
      // falha: o terreno e a linha de voo recomeçam no voo seguinte
      samples.push({ d: acc, alt: null, ground: null })
      push(acc, b[0], b[1], alt[i])
      nodes.push({ d: acc, alt: alt[i], gap: true })
      continue
    }
    const len = segLen[i - 1]
    const n = len > 0 ? Math.max(1, Math.ceil(len / step)) : 1
    for (let k = 1; k <= n; k++) {
      const t = k / n
      push(
        acc + len * t,
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        alt[i - 1] + (alt[i] - alt[i - 1]) * t,
      )
    }
    acc += len
    nodes.push({ d: acc, alt: alt[i] })
  }

  // Estatísticas: terreno, AGL real e pior folga (com a distância onde ocorre)
  let gMin = Infinity
  let gMax = -Infinity
  let aglMin = Infinity
  let aglMax = -Infinity
  let worst = null
  for (const s of samples) {
    if (s.ground == null) continue
    if (s.ground < gMin) gMin = s.ground
    if (s.ground > gMax) gMax = s.ground
    const agl = s.alt - s.ground
    if (agl > aglMax) aglMax = agl
    if (agl < aglMin) {
      aglMin = agl
      worst = { d: s.d, alt: s.alt, ground: s.ground, agl }
    }
  }
  const hasTerrain = worst != null

  // Domínio vertical com margem
  let lo = Math.min(...alt)
  let hi = Math.max(...alt)
  if (hasTerrain) {
    lo = Math.min(lo, gMin)
    hi = Math.max(hi, gMax)
  }
  const span = hi - lo
  const pad = Math.max(5, span * 0.1)

  return {
    ok: true,
    samples,
    nodes,
    totalM,
    hasTerrain,
    gMin: hasTerrain ? gMin : null,
    gMax: hasTerrain ? gMax : null,
    aglMin: hasTerrain ? aglMin : null,
    aglMax: hasTerrain ? aglMax : null,
    worst,
    yMin: lo - pad,
    yMax: hi + pad,
    wpCount: pts.length,
  }
}
