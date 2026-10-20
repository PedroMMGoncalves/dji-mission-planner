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
 *
 * Bases múltiplas: `bases` [{id, label, point, radiusM}] e as atribuições
 * manuais `blockBase` {idDoBloco: idDaBase}. A base única antiga
 * (`basePoint`) abre como base A. O mosaico de quadrados passou a
 * buildSquareMosaic (`split.mosaic` 2): as células desactivadas de um
 * projecto anterior são traduzidas para o mosaico novo (mosaicLegacy.js),
 * e as orientações: num mosaico manual mantém-se a guardada, na divisão por
 * bateria os quadrados passam a seguir as faixas.
 *
 * Acções de segurança (`safety`, src/mission/safety.js): fim da missão e
 * sinal perdido, as mesmas em todos os modos. Um projecto sem elas abre com
 * as omissões (regressar à base; interromper e regressar).
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
import { legacyBases, normalizeBases, normalizeBlockBase } from './bases.js'
import { normalizeObstacleM } from './viewshedPlan.js'
import { normalizeSafety } from './safety.js'
import { DEFAULT_ANCHOR, DEFAULT_PARAMS } from './defaults.js'
import { safeFileStem } from '../utils/exporters.js'

export const PROJECT_VERSION = 2
/**
 * Os campos do estado que o projecto guarda (serializeProject) e devolve
 * (normalizeProject), pela ordem do ficheiro. O App monta `projectState` com
 * estes nomes e o teste de ida e volta percorre-os todos: um campo novo
 * esquecido num dos sítios (estado, gravação, leitura, aplicação, esquema)
 * deixava de ir e vir sem nenhum teste o dizer (M3-T4).
 */
export const PROJECT_KEYS = [
  'missionName',
  'drone',
  'custom',
  'payloadTuning',
  'battery',
  'inspectPoints',
  'missionMode',
  'faceConfig',
  'corridorConfig',
  'orbitConfig',
  'circularConfig',
  'params',
  'split',
  'anchor',
  'ring',
  'holes',
  'cells',
  'areaOrigin',
  'bases',
  'blockBase',
  'disabledTiles',
  'terrainFollow',
  'gcpConfig',
  'obstacleHeightM',
  'safety',
  'demFile',
]
/** Esquema JSON (draft 2020-12) do ficheiro v2, servido com a aplicação: public/schema/. */
export const PROJECT_SCHEMA_URL =
  'https://pedrommgoncalves.github.io/dji-mission-planner/schema/project-v2.schema.json'
export const PROJECT_STORAGE_KEY = 'dji-mission-planner:project:v1'
export const MISSION_MODES = ['area', 'face', 'orbit', 'corridor', 'circular']
/** Geração do mosaico de quadrados: 2 = buildSquareMosaic (src/mission/squareMosaic.js). */
export const MOSAIC_VERSION = 2

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
    cells,
    areaOrigin,
    bases,
    blockBase,
    disabledTiles,
    terrainFollow,
    gcpConfig,
    obstacleHeightM,
    demFile,
    safety,
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
    // os índices das células desactivadas são do mosaico desta geração
    split: split ? { ...split, mosaic: MOSAIC_VERSION } : split,
    anchor,
    ring,
    holes,
    // as células de uma área importada em partes («Usar todas as partes como
    // células»): sem elas o projecto reabria só com a maior parte (M3-C3).
    // Com a área vinda da âncora as células regeneram-se dela e não se gravam
    cells: areaOrigin !== 'anchor' && Array.isArray(cells) && cells.length ? cells : undefined,
    areaOrigin,
    bases: (bases ?? []).map((b) => ({
      id: b.id,
      label: b.label,
      point: b.point,
      radiusM: b.radiusM ?? null,
    })),
    blockBase: { ...(blockBase ?? {}) },
    disabledTiles: [...(disabledTiles ?? [])],
    terrainFollow,
    gcpConfig,
    // bacias de visão: vegetação e obstáculos a somar a um MDT (m)
    obstacleHeightM: normalizeObstacleM(obstacleHeightM),
    // fim da missão e sinal perdido (WPML missionConfig)
    safety: normalizeSafety(safety),
    // o ficheiro de relevo não vai no projecto: só o nome e se é MDT ou
    // MDS, para a escolha voltar quando o mesmo ficheiro for reimportado
    demFile: normalizeDemFile(demFile) ?? undefined,
  }
}

/**
 * Nome e tipo (MDT/MDS) do ficheiro de relevo importado, ou null.
 * @param {any} v
 * @returns {{label: string, surface: 'dtm'|'dsm'}|null}
 */
export function normalizeDemFile(v) {
  if (!isObject(v) || typeof v.label !== 'string') return null
  const label = v.label.trim().slice(0, 200)
  if (!label) return null
  return { label, surface: v.surface === 'dsm' ? 'dsm' : 'dtm' }
}

/** Nome do ficheiro de projecto a partir do nome da missão. */
export function projectFileName(missionName) {
  // a mesma regra dos KML e KMZ (safeFileStem, K-E3): «Évora» dava
  // `-vora-projeto.json` ao lado de `Evora_area.kmz` (M3-T15)
  return `${safeFileStem(missionName)}-projecto.json`
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
 *  - disabledTiles: Set; ring só quando é array
 *  - bases: lista normalizada (a `basePoint` antiga passa a base A);
 *    blockBase: só atribuições a bases existentes
 *  - split.tileOrientationAuto: os projectos anteriores ao campo ficam com a
 *    orientação guardada num mosaico manual e seguem as faixas na divisão
 *    por bateria (que não tinha orientação na interface)
 *  - obstacleHeightM: vegetação e obstáculos das bacias de visão, 0-60 m
 *  - demFile: nome e tipo (MDT/MDS) do ficheiro de relevo importado, ou null
 *    (0 nos projectos anteriores)
 *  - safety: acções de segurança, sempre presente (as omissões nos
 *    projectos anteriores)
 *  - legacyMosaic: {disabled: Set, basePoint} quando um projecto anterior ao
 *    mosaico novo tinha células desactivadas; disabledTiles fica vazio até a
 *    geometria as traduzir (legacyDisabledForMosaic)
 */
export function normalizeProject(p) {
  if (!p || (p.version !== 1 && p.version !== 2)) return null
  // Geometria validada à entrada (M3-C5): um anel, um buraco, uma célula ou
  // um centro com coordenadas que não são números deixavam a página em
  // branco — e, vindos do localStorage, em todos os arranques. Um ficheiro
  // assim é recusado (null), não aberto a meio
  const ring = p.ring == null ? null : Array.isArray(p.ring) ? p.ring : undefined
  if (ring === undefined || (ring && !validRing(ring))) return null
  const holes = Array.isArray(p.holes) ? p.holes : []
  if (!holes.every((h) => validRing(h))) return null
  const cells = Array.isArray(p.cells) ? p.cells : null
  if (cells && !cells.every((c) => validRing(c))) return null
  const out = {}
  if (typeof p.missionName === 'string') out.missionName = p.missionName.trim().slice(0, 200)
  if (p.drone || p.droneId) out.drone = migrateDroneSelection(p.drone ?? p.droneId)
  if (isObject(p.custom)) out.custom = p.custom
  if (isObject(p.payloadTuning)) out.payloadTuning = p.payloadTuning
  if (isObject(p.params)) out.params = normalizeParams(p.params)
  const { batteryMin: _v1BatteryMin, ...restSplit } = isObject(p.split) ? p.split : {}
  out.battery = readMissionBattery(p, out.drone ?? DEFAULT_SELECTION)
  // a reserva já está no tempo útil: os consumidores (blocos, lado do
  // quadrado, preflight, resumo) recebem reservePct 0 e não a aplicam outra vez
  out.split = { ...restSplit, reservePct: 0 }
  if (typeof restSplit.tileOrientationAuto !== 'boolean')
    out.split.tileOrientationAuto = restSplit.mode !== 'tiles'
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
    // só pontos com coordenadas; um id que não seja inteiro é refeito
    const pts = p.inspectPoints.filter((q) => isObject(q) && isPoint(q.point))
    let next = pts.reduce((mx, q) => (Number.isInteger(q.id) ? Math.max(mx, q.id + 1) : mx), 1)
    out.inspectPoints = pts.map((q) => (Number.isInteger(q.id) ? q : { ...q, id: next++ }))
    out.nextInspectId = next
  }
  if (isObject(p.anchor)) out.anchor = normalizeAnchor(p.anchor)
  if (ring) out.ring = ring
  out.holes = holes
  if (cells && cells.length) out.cells = cells
  out.areaOrigin = p.areaOrigin === 'draw' || p.areaOrigin === 'anchor' ? p.areaOrigin : null
  out.bases = Array.isArray(p.bases) ? normalizeBases(p.bases) : legacyBases(p.basePoint)
  out.blockBase = normalizeBlockBase(p.blockBase, out.bases)
  const disabled = new Set(
    (Array.isArray(p.disabledTiles) ? p.disabledTiles : []).filter(
      (i) => Number.isInteger(i) && i >= 0,
    ),
  )
  const legacyMosaic =
    restSplit.mosaic !== MOSAIC_VERSION &&
    (restSplit.mode === 'tiles' || restSplit.mode === 'battery') &&
    disabled.size > 0
  if (legacyMosaic) {
    out.legacyMosaic = {
      disabled,
      basePoint: Array.isArray(p.basePoint) ? p.basePoint : null,
      tileOrientation: Number.isFinite(restSplit.tileOrientation) ? restSplit.tileOrientation : 0,
    }
    out.disabledTiles = new Set()
  } else out.disabledTiles = disabled
  out.split.mosaic = MOSAIC_VERSION
  if (isObject(p.terrainFollow)) out.terrainFollow = p.terrainFollow
  if (isObject(p.gcpConfig)) out.gcpConfig = p.gcpConfig
  out.obstacleHeightM = normalizeObstacleM(p.obstacleHeightM)
  out.demFile = normalizeDemFile(p.demFile)
  out.safety = normalizeSafety(p.safety)
  return out
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** [lon, lat] (ou [lon, lat, h]) com números finitos. */
export function isPoint(v) {
  return (
    Array.isArray(v) &&
    (v.length === 2 || v.length === 3) &&
    v.every((c) => typeof c === 'number' && Number.isFinite(c))
  )
}

/** Anel com pelo menos 3 vértices, todos pontos válidos. */
export function validRing(r) {
  return Array.isArray(r) && r.length >= 3 && r.every(isPoint)
}

/**
 * Âncora lida de um ficheiro: o centro é um ponto ou null, as dimensões são
 * números positivos, a forma é conhecida, colunas e linhas são inteiros;
 * o que não cumprir cai para a omissão (não vale a pena recusar o projecto
 * por uma âncora mal escrita — o anel gravado é o que conta).
 */
export function normalizeAnchor(a) {
  const out = { ...DEFAULT_ANCHOR }
  if (!isObject(a)) return out
  out.center = isPoint(a.center) ? a.center : null
  for (const k of ['length', 'width']) if (positive(a[k])) out[k] = a[k]
  if (typeof a.orientation === 'number' && Number.isFinite(a.orientation))
    out.orientation = ((a.orientation % 360) + 360) % 360
  if (a.shape === 'rect' || a.shape === 'square') out.shape = a.shape
  for (const k of ['cols', 'rows']) if (Number.isInteger(a[k]) && a[k] >= 1) out[k] = a[k]
  return out
}

/**
 * Parâmetros de voo lidos de um ficheiro: só as chaves que existem na
 * omissão, cada uma com o tipo da omissão (números finitos, booleanos,
 * texto); o resto fica de fora e o App preenche com DEFAULT_PARAMS.
 */
export function normalizeParams(params) {
  const out = {}
  if (!isObject(params)) return out
  for (const [k, def] of Object.entries(DEFAULT_PARAMS)) {
    const v = params[k]
    if (v === undefined) continue
    if (typeof def === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    } else if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[k] = v
    } else if (typeof v === typeof def) out[k] = v
  }
  return out
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
