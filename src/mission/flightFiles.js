/**
 * Ficheiros dos voos de uma missão de área dividida em blocos: um KMZ por
 * voo, com o rótulo do voo no nome (A-1, B-3), e a escolha do que sai —
 * todos os voos, os de uma base, ou um só. Lógica pura: o hook de área e a
 * checklist de campo usam os mesmos nomes.
 *
 *  - KMZ de um voo: `<missao>_<tipo>[-variantes]_<voo>.kmz`, ex.:
 *    `corta-norte_area-tf_A-1.kmz`. O nome é também o título da missão
 *    dentro do KMZ (o `<name>` do template.kml), que é o que o Pilot 2 lista.
 *  - ZIP de todos os voos: `<missao>_<tipo>[-variantes]_voos.zip`; de uma
 *    base: `..._base-B.zip`. Os KMZ entram pela ordem de voo.
 *  - Com 10 voos ou mais o número leva zeros à esquerda no nome do ficheiro
 *    (A-01 ... B-10), para a lista do Pilot 2, ordenada pelo nome, sair pela
 *    ordem de voo; o rótulo no mapa continua A-1.
 *  - Uma missão sem divisão continua a sair num só KMZ com o nome de sempre
 *    (buildExportName), sem sufixo de voo.
 */
import { buildExportName } from '../utils/exporters.js'

/**
 * Nome base das exportações da área (sem extensão): o nome da missão, o
 * tipo e as variantes que mudam o voo (E3.1).
 * @param {{missionName: string, crosshatch?: boolean, includeNadir?: boolean,
 *   tieLine?: boolean, terrainOk?: boolean}} opts
 */
export function areaExportName({
  missionName,
  crosshatch = false,
  includeNadir = false,
  tieLine = false,
  terrainOk = false,
}) {
  return buildExportName(missionName, 'area', {
    variant: [
      crosshatch && 'crosshatch',
      crosshatch && includeNadir && 'nadir',
      tieLine && 'tie',
      terrainOk && 'tf',
    ],
  })
}

/** Algarismos do maior número de voo (1 até 9 voos, 2 até 99, ...). */
export function flightDigits(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1
  return String(n).length
}

/**
 * Parte do nome do ficheiro que identifica o voo: o rótulo ("A-1", ou "1"
 * sem bases), com o número a `digits` algarismos e só com letras,
 * algarismos, '-' e '_' (o Pilot 2 lista as missões pelo nome do ficheiro).
 * Um voo sem base ("?-3", que o preflight bloqueia) fica "x-3".
 * @param {string|number} label
 * @param {number} [digits]
 */
export function flightToken(label, digits = 1) {
  const raw = String(label ?? '').trim()
  const m = /^(.*?)(\d+)$/.exec(raw)
  const padded = m ? `${m[1]}${m[2].padStart(Math.max(1, digits), '0')}` : raw
  const safe = padded
    .replace(/\?/g, 'x')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe || 'voo'
}

/**
 * @typedef {object} FlightFile
 * @property {number} blockId
 * @property {number} flight        número do voo (1..n), a ordem de voo
 * @property {string} flightLabel   rótulo do mapa ("A-1")
 * @property {string|null} baseId
 * @property {string|null} baseLabel
 * @property {string} name          nome sem extensão (também o título no KMZ)
 * @property {string} file          `${name}.kmz`
 */

/**
 * Os voos pela ordem de voo, com o nome do ficheiro de cada um. `layout` é
 * o de layoutBlocks (src/mission/baseLayout.js); sem ele, ou para um bloco
 * que não conhece, a ordem e o número são os do id do bloco. Os nomes são
 * únicos: uma colisão (não acontece com rótulos de layoutBlocks) leva o id
 * do bloco a seguir.
 * @param {{baseName: string, blockIds: number[], layout?: any}} args
 * @returns {FlightFile[]}
 */
export function flightFiles({ baseName, blockIds, layout = null }) {
  if (!Array.isArray(blockIds) || blockIds.length === 0) return []
  const rows = blockIds.map((id) => {
    const info = layout?.byBlock?.[id] ?? null
    const flight = Number.isFinite(info?.flight) && info.flight > 0 ? info.flight : null
    return {
      blockId: id,
      flight,
      flightLabel: info?.flightLabel || String(id),
      baseId: info?.baseId ?? null,
      baseLabel: info?.baseLabel ?? null,
    }
  })
  rows.sort((a, b) => (a.flight ?? a.blockId) - (b.flight ?? b.blockId) || a.blockId - b.blockId)
  const maxN = rows.reduce((m, r) => Math.max(m, r.flight ?? r.blockId), 0)
  const digits = Math.max(flightDigits(rows.length), flightDigits(maxN))
  const used = new Set()
  return rows.map((r, i) => {
    let name = `${baseName}_${flightToken(r.flightLabel, digits)}`
    if (used.has(name)) name = `${name}-b${r.blockId}`
    used.add(name)
    return { ...r, flight: r.flight ?? i + 1, name, file: `${name}.kmz` }
  })
}

/**
 * Escolha do que se exporta: `{kind: 'all'}`, `{kind: 'base', baseId}` ou
 * `{kind: 'flight', blockId}`.
 * @typedef {{kind: string, baseId?: string|null, blockId?: number}} FlightSelection
 */

/**
 * Os itens (FlightFile, ou blocos com `id`/`blockId` e `baseId`) que a
 * escolha leva, pela ordem em que vêm.
 * @param {any[]} items
 * @param {FlightSelection|null|undefined} sel
 * @returns {any[]}
 */
export function selectFlights(items, sel) {
  const list = Array.isArray(items) ? items : []
  if (!sel || sel.kind === 'all') return [...list]
  if (sel.kind === 'base') return list.filter((x) => x.baseId != null && x.baseId === sel.baseId)
  if (sel.kind === 'flight')
    return list.filter((x) => (x.blockId ?? x.id) === sel.blockId).slice(0, 1)
  return []
}

/**
 * Nome do ZIP (sem extensão) de uma escolha: `<base>_voos` para todos, e
 * `<base>_base-B` para os de uma base (rótulo `baseLabel`).
 * @param {string} baseName
 * @param {FlightSelection|null|undefined} sel
 * @param {string|null} [baseLabel]
 */
export function flightsArchiveName(baseName, sel, baseLabel = null) {
  if (sel?.kind === 'base') {
    const label = String(baseLabel ?? '').replace(/[^\w-]+/g, '') || 'x'
    return `${baseName}_base-${label}`
  }
  return `${baseName}_voos`
}

/**
 * Opções de exportação para o painel das bases: as bases com voos (pela
 * ordem dos rótulos, com os nomes dos seus ficheiros) e os voos todos.
 * @param {FlightFile[]} files
 * @param {Array<{id: string, label: string}>} baseRows summarizeBases
 */
export function exportChoices(files, baseRows) {
  const bases = (baseRows ?? [])
    .map((b) => ({
      id: b.id,
      label: b.label,
      files: (files ?? []).filter((f) => f.baseId === b.id),
    }))
    .filter((b) => b.files.length > 0)
  return { flights: files ?? [], bases }
}
