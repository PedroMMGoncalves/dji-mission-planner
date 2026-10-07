/**
 * Ficheiro de projecto (e gravação automática): o que se guarda e como se
 * lê um projecto guardado — de hoje ou de uma versão antiga. Lógica pura;
 * o App.jsx só distribui o resultado pelo estado.
 *
 * v1: droneId (perfil único) · v2: drone {aircraftId, payloadId}, e a duração
 * de bateria passou de `split.batteryMin` para `batteryByCombo`. Desde o
 * equipamento (Configuração), a missão guarda `battery` {batteryId,
 * usefulMin}: o tempo útil por voo, já com a reserva de aterragem, e a
 * reserva `split.reservePct` fica a 0. Um projecto sem `battery` é anterior:
 * abre com o tempo útil equivalente (legacyUsefulMin), para os blocos não
 * mudarem.
 */
import {
  AIRCRAFT,
  DEFAULT_SELECTION,
  batteryMinFor,
  migrateDroneSelection,
} from '../data/drones.js'
import { EQUIPMENT_LIMITS, legacyUsefulMin } from './equipment.js'
import { normalizeFaceConfig } from '../utils/faceMode.js'
import { normalizeOrbitConfig } from '../utils/orbit.js'
import { normalizeCorridorConfig } from '../utils/corridor.js'
import { normalizeCircularConfig } from '../utils/circular.js'

export const PROJECT_VERSION = 2
/** Esquema JSON (draft 2020-12) do ficheiro v2, servido com a aplicação: public/schema/. */
export const PROJECT_SCHEMA_URL =
  'https://pedrommgoncalves.github.io/dji-mission-planner/schema/project-v2.schema.json'
export const PROJECT_STORAGE_KEY = 'dji-mission-planner:project:v1'
export const MISSION_MODES = ['area', 'face', 'orbit', 'corridor', 'circular']

/** Objecto serializável com tudo o que o projecto guarda (a mesma forma do autosave). */
export function serializeProject(state) {
  const {
    missionName,
    drone,
    custom,
    payloadTuning,
    battery,
    inspectPoints,
    missionMode,
    faceConfig,
    corridorConfig,
    orbitConfig,
    circularConfig,
    params,
    split,
    anchor,
    ring,
    holes,
    areaOrigin,
    basePoint,
    disabledTiles,
    terrainFollow,
    gcpConfig,
  } = state
  return {
    $schema: PROJECT_SCHEMA_URL,
    version: PROJECT_VERSION,
    missionName,
    drone,
    custom,
    payloadTuning,
    // bateria da missão: o tipo e o tempo útil efectivo (o que dimensionou os blocos)
    battery: battery
      ? { batteryId: battery.batteryId ?? null, usefulMin: battery.usefulMin }
      : undefined,
    inspectPoints,
    missionMode,
    faceConfig,
    corridorConfig,
    orbitConfig,
    circularConfig,
    params,
    split,
    anchor,
    ring,
    holes,
    areaOrigin,
    basePoint,
    disabledTiles: [...(disabledTiles ?? [])],
    terrainFollow,
    gcpConfig,
  }
}

/** Nome do ficheiro de projecto a partir do nome da missão. */
export function projectFileName(missionName) {
  return `${
    String(missionName ?? '')
      .trim()
      .replace(/[^\w-]+/g, '-') || 'missao'
  }-projeto.json`
}

/**
 * Lê um projecto guardado (v1 ou v2). Devolve null se não for um projecto;
 * senão um objecto só com os campos presentes e já normalizados, pronto a
 * ser distribuído pelo estado. Campos:
 *  - drone: selecção migrada (v1 droneId → v2), ou ausente
 *  - battery: {aircraftId, batteryId, usefulMin} — sempre presente; ver
 *    readMissionBattery (migração dos projectos anteriores ao equipamento)
 *  - split: sem o batteryMin antigo e sempre com reservePct 0 (a reserva
 *    vive no tempo útil)
 *  - inspectPoints: só os pontos com coordenadas; nextInspectId para o contador
 *  - disabledTiles: Set; ring/basePoint só quando são arrays
 */
export function normalizeProject(p) {
  if (!p || (p.version !== 1 && p.version !== 2)) return null
  const out = {}
  if (typeof p.missionName === 'string') out.missionName = p.missionName
  if (p.drone || p.droneId) out.drone = migrateDroneSelection(p.drone ?? p.droneId)
  if (p.custom) out.custom = p.custom
  if (p.payloadTuning && typeof p.payloadTuning === 'object') out.payloadTuning = p.payloadTuning
  if (p.params) out.params = p.params
  const { batteryMin: _v1BatteryMin, ...restSplit } = isObject(p.split) ? p.split : {}
  out.battery = readMissionBattery(p, out.drone ?? DEFAULT_SELECTION)
  // a reserva já está no tempo útil: os consumidores (blocos, lado do
  // quadrado, preflight, resumo) recebem reservePct 0 e não a aplicam outra vez
  out.split = { ...restSplit, reservePct: 0 }
  if (MISSION_MODES.includes(p.missionMode)) out.missionMode = p.missionMode
  if (p.faceConfig) out.faceConfig = normalizeFaceConfig(p.faceConfig)
  if (p.orbitConfig) out.orbitConfig = normalizeOrbitConfig(p.orbitConfig)
  if (p.corridorConfig) out.corridorConfig = normalizeCorridorConfig(p.corridorConfig)
  if (p.circularConfig) out.circularConfig = normalizeCircularConfig(p.circularConfig)
  // projectos guardados antes do marcador `enabled`: a missão circular existia
  // se o projecto foi guardado no separador circular
  if (out.circularConfig && p.circularConfig.enabled === undefined && p.missionMode === 'circular')
    out.circularConfig.enabled = true
  if (Array.isArray(p.inspectPoints)) {
    out.inspectPoints = p.inspectPoints.filter((q) => q && Array.isArray(q.point))
    out.nextInspectId = out.inspectPoints.reduce((mx, q) => Math.max(mx, (q.id ?? 0) + 1), 1)
  }
  if (p.anchor) out.anchor = p.anchor
  if (Array.isArray(p.ring)) out.ring = p.ring
  out.holes = Array.isArray(p.holes) ? p.holes.filter((h) => Array.isArray(h) && h.length >= 3) : []
  out.areaOrigin = p.areaOrigin ?? null
  out.basePoint = Array.isArray(p.basePoint) ? p.basePoint : null
  out.disabledTiles = new Set(Array.isArray(p.disabledTiles) ? p.disabledTiles : [])
  if (p.terrainFollow) out.terrainFollow = p.terrainFollow
  if (p.gcpConfig) out.gcpConfig = p.gcpConfig
  return out
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Número finito positivo, ou null. */
function positive(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/** Tempo útil limitado ao intervalo do equipamento (1-120 min), ou null. */
function clampUseful(v) {
  const n = positive(v)
  if (n === null) return null
  const { min, max } = EQUIPMENT_LIMITS.usefulMin
  return Math.min(max, Math.max(min, n))
}

/**
 * Bateria da missão guardada no projecto, já com a reserva incorporada:
 *  - com `battery` (projectos de hoje): o tipo e o tempo útil guardados. Uma
 *    reserva > 0 ao lado (ficheiro editado à mão) entra no tempo útil, para
 *    não ficar escondida;
 *  - sem `battery` (projectos anteriores ao equipamento): a duração NOMINAL
 *    (split.batteryMin do v1, o override de batteryByCombo da combinação, ou
 *    a da aeronave no catálogo) com a reserva split.reservePct (30 % quando
 *    falta) passa a tempo útil por legacyUsefulMin — os blocos ficam como
 *    estavam (ao meio minuto). O tipo fica por escolher (a bateria por
 *    omissão do equipamento).
 * @param {any} p projecto lido
 * @param {{aircraftId: string, payloadId: string}} drone selecção já migrada
 * @returns {{aircraftId: string, batteryId: string|null, usefulMin: number|null}}
 */
function readMissionBattery(p, drone) {
  const reserve = isObject(p.split) ? positive(p.split.reservePct) : null
  if (isObject(p.battery)) {
    const id = typeof p.battery.batteryId === 'string' ? p.battery.batteryId.trim() : ''
    let usefulMin = clampUseful(p.battery.usefulMin)
    if (usefulMin !== null && reserve !== null)
      usefulMin = clampUseful(legacyUsefulMin(usefulMin, reserve))
    return { aircraftId: drone.aircraftId, batteryId: id || null, usefulMin }
  }
  const aircraft = AIRCRAFT[drone.aircraftId] ?? AIRCRAFT[DEFAULT_SELECTION.aircraftId]
  const nominal =
    positive(isObject(p.split) ? p.split.batteryMin : null) ??
    batteryMinFor(aircraft, drone.payloadId, isObject(p.batteryByCombo) ? p.batteryByCombo : {})
  const legacyReserve =
    isObject(p.split) && Number.isFinite(p.split.reservePct) ? p.split.reservePct : 30
  return {
    aircraftId: drone.aircraftId,
    batteryId: null,
    usefulMin: clampUseful(legacyUsefulMin(nominal, legacyReserve)),
  }
}
