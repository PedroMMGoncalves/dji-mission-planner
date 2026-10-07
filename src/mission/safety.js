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
import { FINISH_ACTIONS, RC_LOST_ACTIONS, RC_LOST_MODES } from '../utils/exporters.js'

export { FINISH_ACTIONS, RC_LOST_ACTIONS, RC_LOST_MODES }

/**
 * @typedef {object} SafetyActions
 * @property {string} finishAction goHome | noAction | autoLand | gotoFirstWaypoint
 * @property {string} exitOnRCLost executeLostAction | goContinue
 * @property {string} executeRCLostAction goBack | landing | hover
 */

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
  return {
    finishAction: one(o.finishAction, FINISH_ACTIONS, DEFAULT_SAFETY.finishAction),
    exitOnRCLost: one(o.exitOnRCLost, RC_LOST_MODES, DEFAULT_SAFETY.exitOnRCLost),
    executeRCLostAction: one(
      o.executeRCLostAction,
      RC_LOST_ACTIONS,
      DEFAULT_SAFETY.executeRCLostAction,
    ),
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
