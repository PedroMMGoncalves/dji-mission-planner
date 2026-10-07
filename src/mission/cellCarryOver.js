/**
 * Mosaico refeito: o que o operador escolheu célula a célula — a base
 * atribuída à mão e as células desactivadas — passa para as células novas
 * por sobreposição, como mosaicLegacy.js faz com os projectos antigos. O
 * mosaico refaz-se ao mudar o ângulo das faixas, o lado, a orientação, o
 * tempo útil ou a área; sem isto, cada uma destas mudanças deitava fora as
 * escolhas do operador em silêncio. Lógica pura.
 *
 * Regra:
 *  1. Mesma área? A área nova tem de cobrir pelo menos metade da MENOR das
 *     duas áreas (contornos exteriores, sem buracos). Abaixo disso a área
 *     foi substituída — um desenho ou uma importação noutro sítio — e nada
 *     passa. Uma área deslocada inteira (todos os vértices com o mesmo
 *     deslocamento, ±1 m: a pega de mover; também uma cópia exacta noutro
 *     sítio) é a mesma área, e as células
 *     antigas acompanham o deslocamento antes da comparação.
 *  2. Cada célula nova herda da célula antiga que cobre pelo menos metade
 *     da sua área (no máximo uma, porque as antigas não se sobrepõem): a
 *     base escolhida à mão e o estado desactivado. Sem essa célula fica com
 *     a atribuição automática e activa.
 *  3. Uma atribuição manual que nenhuma célula nova herdou perdeu-se e é
 *     contada (`lost`), para o painel das bases o dizer.
 *
 * Células `{ id, ring }` em [lon, lat], anéis abertos ou fechados. Os ids
 * são os de quem chama: índice da célula para as desactivadas, id do bloco
 * para as atribuições (chaves em texto no mapa `manual`).
 */
import * as turf from '@turf/turf'
import { M_PER_DEG_LAT, metersPerDegLonSafe } from '../utils/units.js'

/** Fracção da área de uma célula nova coberta pela antiga para herdar dela. */
export const CARRY_MIN_FRACTION = 0.5
/** Fracção da menor das duas áreas em comum para ser «a mesma área». */
export const SAME_AREA_MIN_FRACTION = 0.5
/** Tolerância (m) para reconhecer uma área deslocada inteira. */
const SHIFT_TOL_M = 1

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])

/** Anel aberto, só com vértices válidos (o fecho repetido sai). */
function openRing(ring) {
  const r = (Array.isArray(ring) ? ring : []).filter(isPoint)
  if (r.length >= 2) {
    const a = r[0]
    const b = r[r.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) return r.slice(0, -1)
  }
  return r
}

/**
 * Deslocamento [dLon, dLat] que leva o anel antigo ao novo quando a área foi
 * movida inteira (mesmos vértices, todos com o mesmo deslocamento, ±1 m);
 * null quando não é uma translação.
 */
export function areaShift(oldRing, newRing) {
  const a = openRing(oldRing)
  const b = openRing(newRing)
  if (a.length < 3 || a.length !== b.length) return null
  const mLon = metersPerDegLonSafe(a[0][1])
  const d = a.map((p, i) => [b[i][0] - p[0], b[i][1] - p[1]])
  const mean = [
    d.reduce((s, v) => s + v[0], 0) / d.length,
    d.reduce((s, v) => s + v[1], 0) / d.length,
  ]
  const off = (v) => Math.hypot((v[0] - mean[0]) * mLon, (v[1] - mean[1]) * M_PER_DEG_LAT)
  return d.every((v) => off(v) <= SHIFT_TOL_M) ? mean : null
}

/**
 * Anel deslocado de `shift` = [dLon, dLat].
 * @param {number[][]} ring
 * @param {number[]} shift
 */
function shifted(ring, shift) {
  const dx = shift?.[0] ?? 0
  const dy = shift?.[1] ?? 0
  return dx === 0 && dy === 0 ? ring : ring.map((p) => [p[0] + dx, p[1] + dy])
}

/** Área (m², sempre positiva) de um polígono local [[x, y], ...]. */
function shoelace(pts) {
  let s = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1])
  return Math.abs(s) / 2
}

/** Sinal da área (positivo = anti-horário). */
function signedArea(pts) {
  let s = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  return s / 2
}

/** Polígono convexo (vértices colineares aceites)? */
function isConvex(pts) {
  let sign = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const c = pts[(i + 2) % n]
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cr) < 1e-6) continue
    const s = Math.sign(cr)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/**
 * Sutherland–Hodgman: `subject` (qualquer) recortado por `clip` (convexo).
 * A área do resultado é a da intersecção, mesmo com o sujeito côncavo.
 */
function clipConvex(subject, clip) {
  const c = signedArea(clip) < 0 ? [...clip].reverse() : clip
  let out = subject
  for (let i = 0; i < c.length && out.length > 0; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
    const cut = (p, q) => {
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const den = (b[0] - a[0]) * dy - (b[1] - a[1]) * dx
      if (den === 0) return p
      const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / -den
      return [p[0] + t * dx, p[1] + t * dy]
    }
    const input = out
    out = []
    for (let k = 0; k < input.length; k++) {
      const p = input[k]
      const q = input[(k + 1) % input.length]
      const pin = inside(p)
      const qin = inside(q)
      if (pin) out.push(p)
      if (pin !== qin) out.push(cut(p, q))
    }
  }
  return out
}

/** Área em comum (m²) de dois anéis [lon, lat] abertos; turf só quando nenhum é convexo. */
function overlapM2(a, b, frame) {
  const la = a.map(frame)
  const lb = b.map(frame)
  if (isConvex(lb)) return shoelace(clipConvex(la, lb))
  if (isConvex(la)) return shoelace(clipConvex(lb, la))
  try {
    const pa = turf.polygon([[...a, a[0]]])
    const x = turf.intersect(turf.featureCollection([pa, turf.polygon([[...b, b[0]]])]))
    // turf.area dá m² geodésicos: a fracção de `a` passa para a escala local
    return x ? (turf.area(x) / turf.area(pa)) * shoelace(la) : 0
  } catch {
    return 0 // geometria degenerada: sem sobreposição
  }
}

function bboxOf(ring) {
  let b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring)
    b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
  return b
}
const bboxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

/** Projecção local em metros à volta da latitude `lat0`. */
function localFrame(lat0) {
  const mLon = metersPerDegLonSafe(lat0)
  return (p) => [p[0] * mLon, p[1] * M_PER_DEG_LAT]
}

/**
 * A área nova é a mesma que a antiga (regra 1)? Devolve também o
 * deslocamento a aplicar às células antigas (0 quando a área não se moveu
 * inteira).
 * @returns {{same: boolean, shift: number[], fraction: number}}
 */
export function sameArea(oldRing, newRing) {
  const a0 = openRing(oldRing)
  const b = openRing(newRing)
  if (a0.length < 3 || b.length < 3) return { same: false, shift: [0, 0], fraction: 0 }
  const shift = areaShift(a0, b)
  if (shift) return { same: true, shift, fraction: 1 }
  let fraction = 0
  if (bboxesMeet(bboxOf(a0), bboxOf(b))) {
    const frame = localFrame(b[0][1])
    const la = a0.map(frame)
    const lb = b.map(frame)
    if (isConvex(la) || isConvex(lb)) {
      const small = Math.min(shoelace(la), shoelace(lb))
      fraction = small > 0 ? overlapM2(a0, b, frame) / small : 0
    } else {
      // duas áreas côncavas: tudo medido pelo turf, para a fracção ser coerente
      try {
        const pa = turf.polygon([[...a0, a0[0]]])
        const pb = turf.polygon([[...b, b[0]]])
        const x = turf.intersect(turf.featureCollection([pa, pb]))
        const small = Math.min(turf.area(pa), turf.area(pb))
        fraction = x && small > 0 ? turf.area(x) / small : 0
      } catch {
        fraction = 0
      }
    }
  }
  return { same: fraction >= SAME_AREA_MIN_FRACTION, shift: [0, 0], fraction }
}

/**
 * Célula antiga de que cada célula nova herda (regra 2): a que cobre pelo
 * menos metade da sua área. `only` limita a procura às células antigas que
 * interessam (as desactivadas, as atribuídas à mão).
 * @param {Array<{id: any, ring: number[][]}>} oldCells
 * @param {Array<{id: any, ring: number[][]}>} newCells
 * @param {{shift?: number[], only?: Set<string>|null}} [opts] ids de `only` em texto
 * @returns {Map<string, string>} id novo → id antigo (em texto)
 */
export function matchCells(oldCells, newCells, { shift = [0, 0], only = null } = {}) {
  const out = new Map()
  const olds = (oldCells ?? [])
    .filter((c) => !only || only.has(String(c.id)))
    .map((c) => ({ id: String(c.id), ring: shifted(openRing(c.ring), shift) }))
    .filter((c) => c.ring.length >= 3)
    .map((c) => ({ ...c, bbox: bboxOf(c.ring) }))
  if (olds.length === 0) return out
  const frame = localFrame(olds[0].ring[0][1])
  for (const cell of newCells ?? []) {
    const ring = openRing(cell?.ring)
    if (ring.length < 3) continue
    const area = shoelace(ring.map(frame))
    if (!(area > 0)) continue
    const bbox = bboxOf(ring)
    let best = null
    let bestFrac = CARRY_MIN_FRACTION - 1e-9
    for (const o of olds) {
      if (!bboxesMeet(bbox, o.bbox)) continue
      const frac = overlapM2(ring, o.ring, frame) / area
      if (frac > bestFrac) {
        bestFrac = frac
        best = o.id
      }
    }
    if (best !== null) out.set(String(cell.id), best)
  }
  return out
}

/**
 * Escolhas do mosaico antigo passadas para o novo.
 * @param {object} args
 * @param {number[][]|null} args.oldRing contorno da área do mosaico antigo
 * @param {number[][]|null} args.newRing contorno da área do mosaico novo
 * @param {Array<{id: any, ring: number[][]}>|null} args.oldCells
 * @param {Array<{id: any, ring: number[][]}>|null} args.newCells
 * @param {Iterable<any>} [args.disabled] ids antigos desactivados
 * @param {Record<string, string>} [args.manual] id antigo → id da base
 * @returns {{disabled: Set<any>, manual: Record<string, string>, lost: number,
 *   sameArea: boolean}} `disabled` com os ids novos (tal como vêm em `newCells`)
 */
export function carryOverCells({
  oldRing,
  newRing,
  oldCells,
  newCells,
  disabled = [],
  manual = {},
}) {
  const oldIds = new Set((oldCells ?? []).map((c) => String(c.id)))
  const manualOld = Object.entries(manual ?? {}).filter(([k]) => oldIds.has(String(k)))
  const off = new Set([...(disabled ?? [])].map(String).filter((k) => oldIds.has(k)))
  /** @type {Record<string, string>} */
  const map = {}
  const none = { disabled: new Set(), manual: map, lost: manualOld.length, sameArea: false }
  if (!Array.isArray(oldCells) || !Array.isArray(newCells)) return none
  if (manualOld.length === 0 && off.size === 0) return { ...none, sameArea: true }
  const area = sameArea(oldRing, newRing)
  if (!area.same) return none
  const only = new Set([...off, ...manualOld.map(([k]) => String(k))])
  const parent = matchCells(oldCells, newCells, { shift: area.shift, only })
  const byOld = new Map(manualOld.map(([k, v]) => [String(k), v]))
  const outOff = new Set()
  const inherited = new Set()
  for (const cell of newCells) {
    const p = parent.get(String(cell.id))
    if (p === undefined) continue
    if (off.has(p)) outOff.add(cell.id)
    if (byOld.has(p)) {
      map[String(cell.id)] = byOld.get(p)
      inherited.add(p)
    }
  }
  const lost = manualOld.filter(([k]) => !inherited.has(String(k))).length
  return { disabled: outOff, manual: map, lost, sameArea: true }
}
