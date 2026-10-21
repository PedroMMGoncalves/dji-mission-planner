/**
 * KML dos blocos (secção 7 da revisão da exportação): um KML por bloco — o
 * polígono do bloco e nada mais, o ficheiro que o DJI Pilot 2 aceita para
 * definir uma missão de mapeamento (o comando calcula a rota dele) —, em
 * dois ZIP, como os KMZ dos voos: todos soltos (`blocksKmlAll`,
 * `…_kml.zip`) ou numa pasta por base (`blocksKmlByBase`,
 * `…_kml-por-base.zip`), esta com `mapa/` em cada base: o KML «Bases e
 * blocos» dessa base (o ponto com a ficha, a zona, os contornos), para o
 * Google Earth ou o telemóvel. Lógica pura: o App só descarrega.
 *
 *  - Pastas por `baseFolder` (base-A/, …; sem base, sem-base/), como no ZIP
 *    dos voos por base.
 *  - Nomes dos KML de bloco por `flightFiles` com o tipo `poligono`
 *    (`<missao>_poligono_A-1.kml`): a mesma ordem, os mesmos zeros e o mesmo
 *    desempate dos KMZ, e a missão de mapeamento nunca fica com o nome da
 *    rota WPML do mesmo voo na biblioteca do Pilot 2. Um bloco de faixas
 *    com mais de uma peça (um U) dá um KML por peça: `_A-1a.kml`, `_A-1b.kml`.
 *    Os dois ZIP levam os mesmos ficheiros de bloco, com os mesmos nomes.
 *  - Cada KML de bloco é `buildAreaKML(contorno, nome)` sem extras — o
 *    ficheiro que já funciona —, com o nome igual no ficheiro, no Document
 *    e no Placemark, e sem buracos (K-B1): os blocos com buracos interiores
 *    entram nos avisos; os recortados na fronteira já fazem parte do
 *    contorno.
 */
import { buildAreaKML, buildExportName } from '../utils/exporters.js'
import { blockOutlines, buildBasesKML } from './basesKml.js'
import { baseFolder, flightFiles } from './flightFiles.js'

/** Sufixo da peça k de um bloco com várias: a, b, c… */
const pieceSuffix = (k) =>
  String.fromCharCode(97 + (k % 26)) + (k >= 26 ? String(Math.floor(k / 26)) : '')

/**
 * @typedef {object} KmlEntry
 * @property {string} path  caminho dentro do ZIP (`<nome>.kml` na raiz, `base-A/<nome>.kml`, `base-A/mapa/<nome>.kml`)
 * @property {string} text  o KML
 * @property {number|null} blockId
 * @property {string|null} baseLabel
 */

/**
 * Os KML de polígono dos blocos, pela ordem de voo, cada um na pasta que
 * `folderOf(voo)` dá ('' = raiz do ZIP), e os avisos.
 * @param {{missionName: string, list: any[], layout: any, spacingM: number|null,
 *   area: {ring: number[][], holes?: number[][][]}|null}} args
 * @param {(f: import('./flightFiles.js').FlightFile) => string} folderOf
 */
function blockPolygonEntries({ missionName, list, layout, spacingM, area }, folderOf) {
  const entries = []
  const warnings = []
  const byId = new Map(list.map((b) => [b.id, b]))
  const names = flightFiles({
    baseName: buildExportName(missionName, 'poligono'),
    blockIds: list.map((b) => b.id),
    layout,
  })
  for (const f of names) {
    const block = byId.get(f.blockId)
    const pieces = blockOutlines(block, { spacingM, area })
    if (pieces.length === 0) {
      warnings.push({ code: 'no-outline', blockId: f.blockId, label: f.flightLabel })
      continue
    }
    const holes = pieces.reduce((s, p) => s + p.holes.length, 0)
    if (holes > 0)
      warnings.push({ code: 'holes', blockId: f.blockId, label: f.flightLabel, n: holes })
    const folder = folderOf(f)
    pieces.forEach((piece, k) => {
      const stem = pieces.length > 1 ? `${f.name}${pieceSuffix(k)}` : f.name
      entries.push({
        path: folder ? `${folder}/${stem}.kml` : `${stem}.kml`,
        text: buildAreaKML(piece.ring, stem),
        blockId: f.blockId,
        baseLabel: f.baseLabel ?? null,
      })
    })
  }
  return { entries, warnings }
}

/**
 * As entradas do ZIP «KML: todos os blocos», soltos na raiz pela ordem de
 * voo (o par do ZIP de todos os voos), e os avisos. Com ou sem bases: sem
 * elas os nomes levam o número do bloco (`_poligono_3.kml`).
 * @param {object} args
 * @param {string} args.missionName  nome da missão (o prefixo dos ficheiros sai de buildExportName)
 * @param {any[]} args.blocks        blocos do plano (id, cellRing?, cellHoles?, lines?, waypoints)
 * @param {any} [args.layout]        layoutBlocks (ordem de voo, rótulos, bases)
 * @param {number|null} [args.spacingM]  espaçamento das faixas (contornos exactos dos blocos de faixas)
 * @param {{ring: number[][], holes?: number[][][]}|null} [args.area]
 * @returns {{entries: KmlEntry[], warnings: Array<{code: string, blockId?: number, label?: string, n?: number}>}}
 */
export function blocksKmlAll({ missionName, blocks, layout = null, spacingM = null, area = null }) {
  const list = Array.isArray(blocks) ? blocks : []
  if (list.length === 0) return { entries: [], warnings: [] }
  return blockPolygonEntries({ missionName, list, layout, spacingM, area }, () => '')
}

/**
 * As entradas do ZIP «KML por base», pela ordem de voo, e os avisos.
 * @param {object} args
 * @param {string} args.missionName  nome da missão (o prefixo dos ficheiros sai de buildExportName)
 * @param {any[]} args.blocks        blocos do plano (id, cellRing?, cellHoles?, lines?, waypoints)
 * @param {any} args.layout          layoutBlocks (ordem de voo, rótulos, bases)
 * @param {any[]} [args.sheets]      baseFieldSheets, para o `mapa/` de cada base
 * @param {import('./flightFiles.js').FlightFile[]} [args.files] os KMZ dos voos (a descrição dos blocos no mapa)
 * @param {number|null} [args.spacingM]  espaçamento das faixas (contornos exactos dos blocos de faixas)
 * @param {{ring: number[][], holes?: number[][][]}|null} [args.area]
 * @param {(key: string, vars?: Record<string, any>) => string} [t]
 * @returns {{entries: KmlEntry[], warnings: Array<{code: string, blockId?: number, label?: string, n?: number}>}}
 */
export function blocksKmlByBase(
  { missionName, blocks, layout, sheets = [], files = [], spacingM = null, area = null },
  t = undefined,
) {
  const list = Array.isArray(blocks) ? blocks : []
  if (list.length === 0) return { entries: [], warnings: [] }
  const { entries, warnings } = blockPolygonEntries(
    { missionName, list, layout, spacingM, area },
    (f) => baseFolder(f.baseLabel),
  )
  // o mapa de cada base, só com os blocos dela
  const stem = buildExportName(missionName, 'mapa')
  for (const s of sheets ?? []) {
    const mine = list.filter((b) => layout?.byBlock?.[b.id]?.baseLabel === s.label)
    if (mine.length === 0) continue
    const folder = baseFolder(s.label)
    entries.push({
      path: `${folder}/mapa/${stem}_${folder}.kml`,
      text: buildBasesKML(
        {
          name: `${missionName} — ${s.label}`,
          sheets: [s],
          blocks: mine,
          layout,
          files,
          spacingM,
          area,
        },
        t,
      ),
      blockId: null,
      baseLabel: s.label,
    })
  }
  return { entries, warnings }
}
