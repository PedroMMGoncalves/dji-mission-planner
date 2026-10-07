/**
 * Equipamento (Configuração > Equipamento): definições operacionais por
 * aeronave que não mudam de missão para missão — alcance visual (VLOS),
 * tipos de bateria com o tempo de voo ÚTIL de cada conjunto, quantos
 * conjuntos a equipa tem — e os valores por omissão da zona de descolagem.
 * Guardado no browser (localStorage), à parte do projecto. Lógica pura: a
 * interface só lê e escreve o objecto devolvido por normalizeEquipment.
 *
 * Tempo útil: minutos de voo por conjunto de baterias JÁ descontada a
 * reserva com que o operador aterra (15-20 %). Não há reserva aplicada por
 * cima — ao contrário do modelo antigo (batteryByCombo com a duração
 * NOMINAL e split.reservePct à parte), que legacyUsefulMin converte.
 *
 * Os enums WPML continuam em src/data/drones.js; aqui só entram os ids de
 * AIRCRAFT. Uma aeronave acrescentada ao catálogo recebe valores por omissão
 * razoáveis (ver defaultAircraftEquipment) sem tocar neste ficheiro.
 */
import { AIRCRAFT } from '../data/drones.js'

export const EQUIPMENT_KEY = 'dji-mission-planner:equipment'
export const EQUIPMENT_VERSION = 1
/** Marcador do ficheiro exportado (equipmentToJson / equipmentFromJson). */
export const EQUIPMENT_KIND = 'dji-mission-planner/equipment'

/**
 * @typedef {object} Battery
 * @property {string} id         identificador único dentro da aeronave
 * @property {string} label      nome mostrado (ex.: "TB60")
 * @property {number} usefulMin  minutos úteis por conjunto (já sem a reserva de aterragem)
 * @property {number|null} count conjuntos que a equipa tem; null = desconhecido
 * @property {boolean} estimated true quando o tempo é estimado, sem dados de campo
 */

/**
 * @typedef {object} AircraftEquipment
 * @property {number} vlosM            distância a que o operador mantém a aeronave à vista (m)
 * @property {Battery[]} batteries     pelo menos uma
 * @property {string} defaultBatteryId id de uma das baterias
 */

/**
 * @typedef {object} Equipment
 * @property {number} version
 * @property {number} zoneRadiusM     raio da zona de descolagem (m)
 * @property {number} zoneMaxReliefM  desnível máximo aceite na zona de descolagem (m)
 * @property {Object<string, AircraftEquipment>} aircraft  chaves = ids de AIRCRAFT
 */

/**
 * @typedef {object} StorageLike
 * @property {(key: string) => (string|null)} getItem
 * @property {(key: string, value: string) => void} setItem
 */

const LIMITS = {
  vlosM: { min: 50, max: 5000 },
  usefulMin: { min: 1, max: 120 },
  count: { min: 0, max: 999 },
  zoneRadiusM: { min: 0, max: 500 },
  zoneMaxReliefM: { min: 1, max: 100 },
}

const DEFAULT_ZONE_RADIUS_M = 100
const DEFAULT_ZONE_MAX_RELIEF_M = 10
const GENERIC_VLOS_M = 500
/** Fracção da duração nominal (DJI) tomada como útil quando não há dados de campo. */
const GENERIC_USEFUL_FRACTION = 0.6

/**
 * Valores conhecidos por aeronave. M300 RTK: tempos medidos no campo pela
 * equipa (TB60 25 min, TB65 28 min úteis). Os restantes ainda não têm dados
 * de campo: são estimativas, marcadas `estimated: true`.
 * O M300 abre na TB60 — a mais curta das duas, logo a mais conservadora.
 * @type {Object<string, {vlosM: number, batteries: Battery[], defaultBatteryId: string}>}
 */
const PRESETS = {
  M300RTK: {
    vlosM: 1000,
    batteries: [
      { id: 'TB60', label: 'TB60', usefulMin: 25, count: null, estimated: false },
      { id: 'TB65', label: 'TB65', usefulMin: 28, count: null, estimated: false },
    ],
    defaultBatteryId: 'TB60',
  },
  M3E: {
    vlosM: 500,
    batteries: [
      { id: 'padrao', label: 'Bateria padrão', usefulMin: 30, count: null, estimated: true },
    ],
    defaultBatteryId: 'padrao',
  },
  M4T: {
    vlosM: 500,
    batteries: [
      { id: 'padrao', label: 'Bateria padrão', usefulMin: 32, count: null, estimated: true },
    ],
    defaultBatteryId: 'padrao',
  },
  CUSTOM: {
    vlosM: 500,
    batteries: [
      { id: 'padrao', label: 'Bateria padrão', usefulMin: 18, count: null, estimated: true },
    ],
    defaultBatteryId: 'padrao',
  },
}

/** Número finito a partir de um número ou de texto numérico; senão null. */
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Limita v a [min, max]; fallback quando v não é um número. */
function clampNum(v, { min, max }, fallback) {
  const n = toNumber(v)
  if (n === null) return fallback
  return Math.min(max, Math.max(min, n))
}

const roundHalf = (x) => Math.round(x * 2) / 2

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Texto aparado, ou '' quando não é texto. */
function cleanText(v) {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Equipamento por omissão de uma aeronave: o preset quando existe, senão
 * valores genéricos derivados do catálogo (útil = 60 % da duração nominal,
 * estimado; VLOS 500 m). Devolve sempre cópias novas.
 * @param {{id: string, batteryMin?: number}} aircraft
 * @returns {AircraftEquipment}
 */
export function defaultAircraftEquipment(aircraft) {
  const preset = PRESETS[aircraft?.id]
  if (preset) {
    return {
      vlosM: preset.vlosM,
      batteries: preset.batteries.map((b) => ({ ...b })),
      defaultBatteryId: preset.defaultBatteryId,
    }
  }
  const nominal = toNumber(aircraft?.batteryMin)
  const useful = nominal && nominal > 0 ? Math.round(nominal * GENERIC_USEFUL_FRACTION) : 15
  return {
    vlosM: GENERIC_VLOS_M,
    batteries: [
      {
        id: 'padrao',
        label: 'Bateria padrão',
        usefulMin: clampNum(useful, LIMITS.usefulMin, 15),
        count: null,
        estimated: true,
      },
    ],
    defaultBatteryId: 'padrao',
  }
}

/**
 * Equipamento por omissão: todas as aeronaves do catálogo AIRCRAFT.
 * @returns {Equipment}
 */
export function defaultEquipment() {
  /** @type {Object<string, AircraftEquipment>} */
  const aircraft = {}
  for (const a of Object.values(AIRCRAFT)) aircraft[a.id] = defaultAircraftEquipment(a)
  return {
    version: EQUIPMENT_VERSION,
    zoneRadiusM: DEFAULT_ZONE_RADIUS_M,
    zoneMaxReliefM: DEFAULT_ZONE_MAX_RELIEF_M,
    aircraft,
  }
}

/** count: null (desconhecido) ou inteiro 0-999. */
function normalizeCount(v) {
  const n = toNumber(v)
  if (n === null) return null
  return Math.round(Math.min(LIMITS.count.max, Math.max(LIMITS.count.min, n)))
}

/**
 * Lista de baterias de uma aeronave. Entradas que não são objectos são
 * descartadas; ids repetidos ganham sufixo (-2, -3, ...); campos em falta
 * vêm da bateria por omissão com o mesmo id (ou da primeira por omissão).
 * Lista vazia ou inválida → as baterias por omissão.
 * @param {any} raw
 * @param {Battery[]} defaults
 * @returns {Battery[]}
 */
function normalizeBatteries(raw, defaults) {
  if (!Array.isArray(raw)) return defaults.map((b) => ({ ...b }))
  /** @type {Battery[]} */
  const out = []
  const used = new Set()
  raw.forEach((b, i) => {
    if (!isPlainObject(b)) return
    const baseId = cleanText(b.id) || cleanText(b.label) || `bateria-${i + 1}`
    let id = baseId
    for (let k = 2; used.has(id); k++) id = `${baseId}-${k}`
    used.add(id)
    const ref = defaults.find((d) => d.id === baseId) ?? defaults[0]
    const useful = clampNum(b.usefulMin, LIMITS.usefulMin, ref.usefulMin)
    out.push({
      id,
      label: cleanText(b.label) || (ref.id === baseId ? ref.label : baseId),
      usefulMin: Math.round(useful * 10) / 10,
      count: normalizeCount(b.count),
      estimated:
        typeof b.estimated === 'boolean' ? b.estimated : ref.id === baseId ? ref.estimated : false,
    })
  })
  return out.length ? out : defaults.map((b) => ({ ...b }))
}

/**
 * @param {any} raw
 * @param {AircraftEquipment} def
 * @returns {AircraftEquipment}
 */
function normalizeAircraftEquipment(raw, def) {
  if (!isPlainObject(raw)) return def
  const batteries = normalizeBatteries(raw.batteries, def.batteries)
  const wanted = cleanText(raw.defaultBatteryId)
  const defaultBatteryId = batteries.some((b) => b.id === wanted)
    ? wanted
    : batteries.some((b) => b.id === def.defaultBatteryId)
      ? def.defaultBatteryId
      : batteries[0].id
  return {
    vlosM: Math.round(clampNum(raw.vlosM, LIMITS.vlosM, def.vlosM)),
    batteries,
    defaultBatteryId,
  }
}

/**
 * Devolve sempre um equipamento válido a partir de qualquer valor (guardado,
 * importado ou lixo): preenche aeronaves e campos em falta com os valores
 * por omissão, descarta aeronaves que já não estão no catálogo, limita os
 * números (vlosM 50-5000, usefulMin 1-120, count null ou inteiro 0-999,
 * zoneRadiusM 0-500, zoneMaxReliefM 1-100), garante ids de bateria únicos,
 * nomes aparados e não vazios e defaultBatteryId válido. Nunca lança.
 * @param {any} raw
 * @returns {Equipment}
 */
export function normalizeEquipment(raw) {
  const def = defaultEquipment()
  if (!isPlainObject(raw)) return def
  const rawAircraft = isPlainObject(raw.aircraft) ? raw.aircraft : {}
  /** @type {Object<string, AircraftEquipment>} */
  const aircraft = {}
  for (const id of Object.keys(def.aircraft)) {
    aircraft[id] = normalizeAircraftEquipment(
      Object.prototype.hasOwnProperty.call(rawAircraft, id) ? rawAircraft[id] : null,
      def.aircraft[id],
    )
  }
  return {
    version: EQUIPMENT_VERSION,
    zoneRadiusM: clampNum(raw.zoneRadiusM, LIMITS.zoneRadiusM, def.zoneRadiusM),
    zoneMaxReliefM: clampNum(raw.zoneMaxReliefM, LIMITS.zoneMaxReliefM, def.zoneMaxReliefM),
    aircraft,
  }
}

/**
 * Lê o equipamento guardado no browser. `storage` pode faltar ou lançar
 * (modo privado, cookies bloqueados): nesse caso, ou com conteúdo
 * corrompido, devolve os valores por omissão.
 * @param {StorageLike|null|undefined} storage
 * @returns {Equipment}
 */
export function loadEquipment(storage) {
  try {
    const text = storage?.getItem(EQUIPMENT_KEY)
    if (!text) return defaultEquipment()
    return normalizeEquipment(JSON.parse(text))
  } catch {
    return defaultEquipment()
  }
}

/**
 * Guarda o equipamento (normalizado) no browser. Devolve true se gravou,
 * false se o storage falta ou recusou (quota, modo privado).
 * @param {StorageLike|null|undefined} storage
 * @param {any} eq
 * @returns {boolean}
 */
export function saveEquipment(storage, eq) {
  if (!storage) return false
  try {
    storage.setItem(EQUIPMENT_KEY, JSON.stringify(normalizeEquipment(eq)))
    return true
  } catch {
    return false
  }
}

/**
 * Texto JSON (indentado) para exportar o equipamento para um ficheiro e o
 * levar para outro computador; leva o marcador `kind`.
 * @param {any} eq
 * @returns {string}
 */
export function equipmentToJson(eq) {
  return JSON.stringify({ kind: EQUIPMENT_KIND, ...normalizeEquipment(eq) }, null, 2)
}

/**
 * Lê um ficheiro exportado por equipmentToJson. Lança um Error com
 * mensagem em português quando o texto não é JSON ou não é um ficheiro de
 * equipamento (`kind` errado ou ausente); senão devolve-o normalizado.
 * @param {string} text
 * @returns {Equipment}
 */
export function equipmentFromJson(text) {
  let data
  try {
    data = JSON.parse(String(text))
  } catch {
    throw new Error('Ficheiro de equipamento inválido: o conteúdo não é JSON.')
  }
  if (!isPlainObject(data) || data.kind !== EQUIPMENT_KIND) {
    throw new Error(
      `Este ficheiro não é uma configuração de equipamento (esperado kind "${EQUIPMENT_KIND}").`,
    )
  }
  return normalizeEquipment(data)
}

/**
 * Equipamento de uma aeronave, com recurso aos valores por omissão quando
 * `eq` não a tem (ou não está normalizado). Ids fora do catálogo usam os
 * valores genéricos.
 * @param {Equipment|null|undefined} eq
 * @param {string} aircraftId
 * @returns {AircraftEquipment}
 */
export function aircraftEquipmentFor(eq, aircraftId) {
  const a = eq?.aircraft?.[aircraftId]
  if (a && Array.isArray(a.batteries) && a.batteries.length) return a
  return defaultAircraftEquipment(AIRCRAFT[aircraftId] ?? { id: aircraftId })
}

/**
 * Bateria de uma aeronave: a pedida, ou a bateria por omissão quando o id
 * falta ou já não existe (ou a primeira, se defaultBatteryId estiver errado).
 * @param {Equipment|null|undefined} eq
 * @param {string} aircraftId
 * @param {string|null} [batteryId]
 * @returns {Battery}
 */
export function batteryFor(eq, aircraftId, batteryId) {
  const a = aircraftEquipmentFor(eq, aircraftId)
  return (
    (batteryId != null && a.batteries.find((b) => b.id === batteryId)) ||
    a.batteries.find((b) => b.id === a.defaultBatteryId) ||
    a.batteries[0]
  )
}

/**
 * Minutos úteis por conjunto de baterias (já sem a reserva de aterragem).
 * @param {Equipment|null|undefined} eq
 * @param {string} aircraftId
 * @param {string|null} [batteryId]
 * @returns {number}
 */
export function usefulMinFor(eq, aircraftId, batteryId) {
  return batteryFor(eq, aircraftId, batteryId).usefulMin
}

/**
 * Alcance visual (VLOS) da aeronave, em metros.
 * @param {Equipment|null|undefined} eq
 * @param {string} aircraftId
 * @returns {number}
 */
export function vlosFor(eq, aircraftId) {
  return aircraftEquipmentFor(eq, aircraftId).vlosM
}

/**
 * Migração de projectos antigos: converte a duração NOMINAL guardada em
 * `batteryByCombo` ("<aeronave>:<payload>" → minutos) e a reserva
 * `split.reservePct` (por omissão 30 %) em minutos úteis:
 * nominal × (1 − reserva/100), arredondado ao meio minuto. A reserva é
 * limitada a 0-95 %, como em usableBatteryMin (preflight.js).
 * Ex.: 55 min com 30 % → 38.5 min. Devolve null se a duração não for válida.
 * @param {number} nominalMin
 * @param {number} [reservePct=30]
 * @returns {number|null}
 */
export function legacyUsefulMin(nominalMin, reservePct = 30) {
  const nominal = toNumber(nominalMin)
  if (nominal === null || nominal <= 0) return null
  const reserve = toNumber(reservePct) ?? 30
  const useful = nominal * (1 - Math.min(95, Math.max(0, reserve)) / 100)
  return roundHalf(useful)
}

/**
 * Voos de uma missão contra os conjuntos de baterias da equipa, para o
 * aviso "a missão precisa de 9 voos, tem 6 conjuntos". `sets` é null quando
 * a contagem é desconhecida (e então `short` é false).
 * @param {Equipment|null|undefined} eq
 * @param {string} aircraftId
 * @param {string|null|undefined} batteryId
 * @param {number} flights
 * @returns {{flights: number, sets: number|null, short: boolean}}
 */
export function flightsVsSets(eq, aircraftId, batteryId, flights) {
  const n = toNumber(flights)
  const f = n === null ? 0 : Math.max(0, Math.ceil(n))
  const sets = batteryFor(eq, aircraftId, batteryId).count ?? null
  return { flights: f, sets, short: sets !== null && f > sets }
}
