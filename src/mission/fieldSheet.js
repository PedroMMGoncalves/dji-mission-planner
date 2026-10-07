/**
 * Ficha de campo por base, para a checklist de campo e o relatório da
 * missão: onde fica a base (coordenadas e ligação para a aplicação de
 * mapas), a zona de descolagem, a cota de referência e o ganho, os voos
 * com o tempo (trânsito incluído) e o nome do KMZ de cada um, os conjuntos
 * de baterias que a base pede contra os que a equipa tem, e o alcance
 * visual usado. Lógica pura sobre summarizeBases, layoutBlocks e
 * flightFiles; a interface só formata.
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
 */

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
}) {
  if (!layout?.hasBases || !Array.isArray(blocks) || blocks.length === 0) return []
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const fileOf = new Map((files ?? []).map((f) => [f.blockId, f.file]))
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
        }
      })
      const worst = flights.map((f) => f.worstVlosM).filter(fin)
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
        flights,
        totalS: flights.reduce((s, f) => s + f.totalS, 0),
        sets: flightsVsSets(equipment, aircraftId, batteryId, flights.length),
        vlosM,
        worstVlosM: worst.length ? Math.max(...worst) : null,
      }
    })
}
