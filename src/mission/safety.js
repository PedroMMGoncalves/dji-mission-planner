/**
 * Acções de segurança da missão, escritas no `missionConfig` do WPML de todos
 * os modos: o que a aeronave faz no fim da missão (`finishAction`) e quando
 * perde o sinal do comando (`exitOnRCLost`: interromper e executar
 * `executeRCLostAction`, ou continuar a rota). Os valores são os do
 * exportador (FINISH_ACTIONS, RC_LOST_MODES, RC_LOST_ACTIONS); por omissão,
 * os de sempre: regressar à base no fim, e interromper e regressar com o
 * sinal perdido. Guardam-se no projecto (`safety`); um projecto anterior abre
 * com as omissões.
 */
import {
  FINISH_ACTIONS,
  MAX_RTH_HEIGHT_M,
  MAX_TAKEOFF_SECURITY_HEIGHT_M,
  MIN_TAKEOFF_SECURITY_HEIGHT_M,
  RC_LOST_ACTIONS,
  RC_LOST_MODES,
} from '../utils/exporters.js'

export { FINISH_ACTIONS, RC_LOST_ACTIONS, RC_LOST_MODES }

/**
 * @typedef {object} SafetyActions
 * @property {string} finishAction goHome | noAction | autoLand | gotoFirstWaypoint
 * @property {string} exitOnRCLost executeLostAction | goContinue
 * @property {string} executeRCLostAction goBack | landing | hover
 * @property {number|null} [takeOffSecurityHeightM] subida vertical antes da
 *   deslocação (takeOffSecurityHeight); ausente = a omissão do exportador (30 m)
 * @property {number|null} [rthHeightM] altura de regresso (globalRTHHeight);
 *   ausente = automática, acima do ponto mais alto de cada voo
 */

/** Altura de regresso mínima aceite no campo (m): a das aeronaves DJI suportadas. */
export const MIN_RTH_HEIGHT_M = 20

/** @type {Readonly<SafetyActions>} */
export const DEFAULT_SAFETY = Object.freeze({
  finishAction: 'goHome',
  exitOnRCLost: 'executeLostAction',
  executeRCLostAction: 'goBack',
})

/**
 * Acções de segurança válidas: cada campo desconhecido ou em falta volta à
 * omissão (projectos antigos, ficheiros editados à mão).
 * @param {any} v
 * @returns {SafetyActions}
 */
export function normalizeSafety(v) {
  const o = v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const one = (value, list, fallback) => (list.includes(value) ? value : fallback)
  // alturas: um número dentro dos limites da especificação, ou null (automática)
  const height = (value, lo, hi) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : null
  const optional = (key, value) => (value == null ? {} : { [key]: value })
  return {
    finishAction: one(o.finishAction, FINISH_ACTIONS, DEFAULT_SAFETY.finishAction),
    exitOnRCLost: one(o.exitOnRCLost, RC_LOST_MODES, DEFAULT_SAFETY.exitOnRCLost),
    executeRCLostAction: one(
      o.executeRCLostAction,
      RC_LOST_ACTIONS,
      DEFAULT_SAFETY.executeRCLostAction,
    ),
    // só quando escritas: um projecto sem elas volta a gravar-se igual
    ...optional(
      'takeOffSecurityHeightM',
      height(
        o.takeOffSecurityHeightM,
        MIN_TAKEOFF_SECURITY_HEIGHT_M,
        MAX_TAKEOFF_SECURITY_HEIGHT_M,
      ),
    ),
    ...optional('rthHeightM', height(o.rthHeightM, MIN_RTH_HEIGHT_M, MAX_RTH_HEIGHT_M)),
  }
}

/**
 * Os três campos que os parâmetros de exportação levam para o missionConfig
 * (exportWPMLKmz / exportBlocksZip); sem escolha, as omissões.
 * @param {any} [safety]
 * @returns {SafetyActions}
 */
export function safetyParams(safety) {
  return normalizeSafety(safety)
}
