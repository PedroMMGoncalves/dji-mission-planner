/**
 * Bases de descolagem do projecto: a lista que o operador marca no mapa
 * (A, B, C, ...) e as atribuições manuais de blocos a bases. Lógica pura:
 * criar, mover, retirar, normalizar o que vem de um ficheiro de projecto,
 * converter a base única dos projectos antigos, e escolher a base de
 * referência dos modos que só usam uma.
 *
 * Uma base é `{ id, label, point: [lon, lat], radiusM }`: `id` é estável
 * (as atribuições apontam para ele), `label` é o que aparece no mapa e no
 * campo, `radiusM` null usa o raio da zona do equipamento. A aplicação
 * propõe, nunca move uma base que o operador marcou.
 */
import { baseLabel, distanceM } from './takeoffZones.js'

/** Raio máximo aceite para a zona de uma base (m), o mesmo do equipamento. */
export const BASE_RADIUS_MAX_M = 500

/**
 * Cores das bases no mapa: alternam claras e escuras, para se distinguirem
 * também pela luminosidade (daltonismo, impressão em tons de cinzento).
 */
export const BASE_COLORS = Object.freeze([
  '#38bdf8', // A: azul claro
  '#c2410c', // B: laranja escuro
  '#a3e635', // C: verde-lima claro
  '#7e22ce', // D: roxo escuro
  '#facc15', // E: amarelo claro
  '#be123c', // F: carmim escuro
  '#5eead4', // G: turquesa claro
  '#1d4ed8', // H: azul escuro
])

/** Cor da base na posição `index` da ordem dos rótulos. */
export function baseColor(index) {
  const n = BASE_COLORS.length
  return BASE_COLORS[(((index ?? 0) % n) + n) % n]
}

/**
 * @typedef {{id: string, label: string, point: number[], radiusM: number|null}} Base
 */

const isPoint = (p) =>
  Array.isArray(p) &&
  p.length >= 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90

/** Ordem dos rótulos: A..Z, AA, AB, ... (mais curto primeiro, depois alfabética). */
export function compareLabels(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x.length !== y.length) return x.length - y.length
  return x < y ? -1 : x > y ? 1 : 0
}

/** Bases pela ordem dos rótulos (cópia). */
export function sortedBases(bases) {
  return [...(bases ?? [])].sort((a, b) => compareLabels(a.label, b.label))
}

/** Primeiro rótulo livre (A, B, ...): uma base retirada deixa o seu rótulo para a próxima. */
export function nextBaseLabel(bases) {
  const used = new Set((bases ?? []).map((b) => b.label))
  for (let i = 0; ; i++) {
    const l = baseLabel(i)
    if (!used.has(l)) return l
  }
}

/** Id novo, que nunca repete um id existente (b1, b2, ...). */
function nextBaseId(bases) {
  let n = 0
  for (const b of bases ?? []) {
    const m = /^b(\d+)$/.exec(String(b.id))
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `b${n + 1}`
}

/** Raio pedido para a zona: null (o do equipamento) ou 0-500 m. */
export function normalizeRadius(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(BASE_RADIUS_MAX_M, Math.max(0, n))
}

/**
 * Acrescenta uma base no ponto dado, com o primeiro rótulo livre.
 * @param {Base[]} bases
 * @param {number[]} point
 * @returns {{bases: Base[], base: Base|null}}
 */
export function addBase(bases, point) {
  if (!isPoint(point)) return { bases: bases ?? [], base: null }
  const base = {
    id: nextBaseId(bases),
    label: nextBaseLabel(bases),
    point: [point[0], point[1]],
    radiusM: null,
  }
  return { bases: [...(bases ?? []), base], base }
}

/** Move a base `id` para `point` (só por acção do operador). */
export function moveBase(bases, id, point) {
  if (!isPoint(point)) return bases
  return (bases ?? []).map((b) => (b.id === id ? { ...b, point: [point[0], point[1]] } : b))
}

/** Raio pedido da zona da base `id` (null = o do equipamento). */
export function setBaseRadius(bases, id, radiusM) {
  return (bases ?? []).map((b) => (b.id === id ? { ...b, radiusM: normalizeRadius(radiusM) } : b))
}

/**
 * Retira a base `id` e as atribuições manuais que apontavam para ela (os
 * blocos voltam à atribuição automática).
 * @returns {{bases: Base[], blockBase: Record<string, string>}}
 */
export function removeBase(bases, blockBase, id) {
  const kept = (bases ?? []).filter((b) => b.id !== id)
  /** @type {Record<string, string>} */
  const map = {}
  for (const [k, v] of Object.entries(blockBase ?? {})) if (v !== id) map[k] = v
  return { bases: kept, blockBase: map }
}

/**
 * Atribuição manual de um bloco: `baseId` escolhido, ou, sem ele, a base
 * seguinte (pela ordem dos rótulos) à `currentBaseId` — clicar no bloco
 * percorre as bases. Devolve o mapa novo.
 * @param {Record<string, string>} blockBase
 * @param {number|string} blockId
 * @param {Base[]} bases
 * @param {{baseId?: string|null, currentBaseId?: string|null}} [opts]
 */
export function assignBlockBase(
  blockBase,
  blockId,
  bases,
  { baseId = null, currentBaseId = null } = {},
) {
  const order = sortedBases(bases)
  if (order.length === 0) return blockBase ?? {}
  let target = baseId != null ? order.find((b) => b.id === baseId) : null
  if (!target) {
    const i = order.findIndex((b) => b.id === currentBaseId)
    target = order[(i + 1) % order.length]
  }
  return { ...(blockBase ?? {}), [String(blockId)]: target.id }
}

/**
 * Bases lidas de um projecto: só entradas com ponto válido; ids repetidos ou
 * em falta são refeitos, rótulos repetidos ou em falta recebem o primeiro
 * livre, raio normalizado.
 * @param {any} raw
 * @returns {Base[]}
 */
export function normalizeBases(raw) {
  if (!Array.isArray(raw)) return []
  const valid = raw.filter((r) => r && typeof r === 'object' && isPoint(r.point))
  const cleanId = (r) => (typeof r.id === 'string' ? r.id.trim() : '')
  const rawIds = new Set(valid.map(cleanId).filter(Boolean))
  const usedIds = new Set()
  let counter = 0
  const freshId = () => {
    let id
    do id = `b${++counter}`
    while (rawIds.has(id) || usedIds.has(id))
    return id
  }
  /** @type {Base[]} */
  const out = []
  for (const r of valid) {
    const wanted = cleanId(r)
    const id = wanted && !usedIds.has(wanted) ? wanted : freshId()
    usedIds.add(id)
    const label = typeof r.label === 'string' ? r.label.trim().toUpperCase() : ''
    const labelOk = /^[A-Z]{1,3}$/.test(label) && !out.some((b) => b.label === label)
    out.push({
      id,
      label: labelOk ? label : '',
      point: [r.point[0], r.point[1]],
      radiusM: normalizeRadius(r.radiusM),
    })
  }
  // rótulos em falta ou repetidos: o primeiro livre, depois de lidos os bons
  for (const b of out) if (!b.label) b.label = nextBaseLabel(out)
  return out
}

/**
 * Atribuições manuais lidas de um projecto: chave = id do bloco (inteiro ≥ 1,
 * em texto), valor = id de uma base existente.
 * @param {any} raw
 * @param {Base[]} bases
 * @returns {Record<string, string>}
 */
export function normalizeBlockBase(raw, bases) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const ids = new Set((bases ?? []).map((b) => b.id))
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[1-9]\d*$/.test(k) || typeof v !== 'string' || !ids.has(v)) continue
    out[k] = v
  }
  return out
}

/** Projectos anteriores às bases múltiplas: a base única passa a base A. */
export function legacyBases(basePoint) {
  return isPoint(basePoint)
    ? [{ id: 'b1', label: 'A', point: [basePoint[0], basePoint[1]], radiusM: null }]
    : []
}

/**
 * Base de referência de um modo que usa uma só base (corredor, circular,
 * inspecção, área sem blocos): a mais próxima da rota ou geometria desse
 * modo (`points`), e a primeira pela ordem dos rótulos quando não há pontos.
 * Com uma só base é sempre essa — os modos comportam-se como antes.
 * @param {Base[]} bases
 * @param {number[][]|null} [points]
 * @returns {Base|null}
 */
export function nearestBase(bases, points = null) {
  const order = sortedBases(bases)
  if (order.length === 0) return null
  const pts = (points ?? []).filter(isPoint)
  if (order.length === 1 || pts.length === 0) return order[0]
  // amostra no máximo ~500 pontos da rota: chega para escolher a base
  const step = Math.max(1, Math.ceil(pts.length / 500))
  let best = order[0]
  let bestD = Infinity
  for (const b of order) {
    let d = Infinity
    for (let i = 0; i < pts.length; i += step) d = Math.min(d, distanceM(b.point, pts[i]))
    d = Math.min(d, distanceM(b.point, pts[pts.length - 1]))
    if (d < bestD - 1e-6) {
      bestD = d
      best = b
    }
  }
  return best
}
