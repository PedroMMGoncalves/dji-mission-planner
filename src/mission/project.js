/**
 * Ficheiro de projecto (e gravação automática): o que se guarda e como se
 * lê um projecto guardado — de hoje ou de uma versão antiga. Lógica pura;
 * o App.jsx só distribui o resultado pelo estado.
 *
 * v1: droneId (perfil único) · v2: drone {aircraftId, payloadId}, e a duração
 * de bateria passou de `split.batteryMin` para `batteryByCombo`.
 */
import { migrateDroneSelection } from '../data/drones.js'
import { normalizeFaceConfig } from '../utils/faceMode.js'
import { normalizeOrbitConfig } from '../utils/orbit.js'
import { normalizeCorridorConfig } from '../utils/corridor.js'

export const PROJECT_VERSION = 2
/** Esquema JSON (draft 2020-12) do ficheiro v2, servido com a aplicação: public/schema/. */
export const PROJECT_SCHEMA_URL =
  'https://pedrommgoncalves.github.io/dji-mission-planner/schema/project-v2.schema.json'
export const PROJECT_STORAGE_KEY = 'dji-mission-planner:project:v1'
export const MISSION_MODES = ['area', 'face', 'orbit', 'corridor']

/** Objecto serializável com tudo o que o projecto guarda (a mesma forma do autosave). */
export function serializeProject(state) {
  const {
    missionName,
    drone,
    custom,
    payloadTuning,
    batteryByCombo,
    inspectPoints,
    missionMode,
    faceConfig,
    corridorConfig,
    orbitConfig,
    params,
    split,
    anchor,
    ring,
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
    batteryByCombo,
    inspectPoints,
    missionMode,
    faceConfig,
    corridorConfig,
    orbitConfig,
    params,
    split,
    anchor,
    ring,
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
 *  - split: sem o batteryMin antigo; legacyBatteryMin à parte, para ser
 *    guardado como override da combinação seleccionada
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
  if (p.split) {
    const { batteryMin: legacyBatteryMin, ...restSplit } = p.split
    out.split = restSplit
    if (Number.isFinite(legacyBatteryMin)) out.legacyBatteryMin = legacyBatteryMin
  }
  if (p.batteryByCombo && typeof p.batteryByCombo === 'object')
    out.batteryByCombo = p.batteryByCombo
  if (MISSION_MODES.includes(p.missionMode)) out.missionMode = p.missionMode
  if (p.faceConfig) out.faceConfig = normalizeFaceConfig(p.faceConfig)
  if (p.orbitConfig) out.orbitConfig = normalizeOrbitConfig(p.orbitConfig)
  if (p.corridorConfig) out.corridorConfig = normalizeCorridorConfig(p.corridorConfig)
  if (Array.isArray(p.inspectPoints)) {
    out.inspectPoints = p.inspectPoints.filter((q) => q && Array.isArray(q.point))
    out.nextInspectId = out.inspectPoints.reduce((mx, q) => Math.max(mx, (q.id ?? 0) + 1), 1)
  }
  if (p.anchor) out.anchor = p.anchor
  if (Array.isArray(p.ring)) out.ring = p.ring
  out.areaOrigin = p.areaOrigin ?? null
  out.basePoint = Array.isArray(p.basePoint) ? p.basePoint : null
  out.disabledTiles = new Set(Array.isArray(p.disabledTiles) ? p.disabledTiles : [])
  if (p.terrainFollow) out.terrainFollow = p.terrainFollow
  if (p.gcpConfig) out.gcpConfig = p.gcpConfig
  return out
}
