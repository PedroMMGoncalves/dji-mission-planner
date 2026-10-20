/**
 * Erro com código e variáveis (M3-C11/M3-U18 da revisão do código). A
 * mensagem fica em português — para o registo, os testes e quem não passa
 * pelos painéis — e os painéis traduzem o código (`err.<code>`, em
 * src/i18n/dict.errors.js) com as variáveis, em PT ou EN; antes as mensagens
 * saíam cruas e em português também na interface em inglês.
 */
import errorsDict from '../i18n/dict.errors.js'

/**
 * A mensagem em português de um código, com as variáveis — a do dicionário,
 * para o texto não viver em dois sítios; sem entrada, o código.
 * @param {string} code
 * @param {Record<string, any>} [params]
 */
export function ptMessage(code, params = {}) {
  const entry = errorsDict[`err.${code}`]
  if (!entry) return code
  return entry.pt.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}

export class AppError extends Error {
  /**
   * @param {string} code chave `err.<code>` do dicionário
   * @param {Record<string, any>} [params] variáveis da mensagem
   */
  constructor(code, params = {}) {
    super(ptMessage(code, params))
    this.name = 'AppError'
    this.code = code
    this.params = params
  }
}

/**
 * @typedef {{code: string|null, params: Record<string, any>, message: string}} ErrorInfo
 */

/**
 * O código, as variáveis e a mensagem de um erro qualquer (um AppError, um
 * objecto já com `code`, um Error ou um texto), para guardar no estado.
 * @param {any} err
 * @returns {ErrorInfo}
 */
export function errorInfo(err) {
  if (err instanceof AppError)
    return { code: err.code, params: err.params ?? {}, message: err.message }
  if (err && typeof err === 'object' && typeof err.code === 'string')
    return { code: err.code, params: err.params ?? {}, message: String(err.message ?? '') }
  return { code: null, params: {}, message: String(err?.message ?? err ?? '') }
}

/**
 * O texto para o ecrã: a tradução do código com as variáveis; sem código, ou
 * sem tradução, a mensagem. Um texto já pronto passa tal e qual.
 * @param {ErrorInfo|string|null|undefined} info
 * @param {(key: string, vars?: Record<string, any>) => string} t
 */
export function errorText(info, t) {
  if (!info) return ''
  if (typeof info === 'string') return info
  if (info.code) {
    const key = `err.${info.code}`
    const msg = t(key, info.params ?? {})
    if (msg !== key) return msg
  }
  return info.message ?? ''
}

/**
 * O erro do relevo (useTerrain): a nota de «sem rede» antes do texto.
 * @param {(ErrorInfo & {offline?: boolean})|string|null|undefined} err
 * @param {(key: string, vars?: Record<string, any>) => string} t
 */
export function terrainErrorText(err, t) {
  if (!err) return ''
  const txt = errorText(err, t)
  return typeof err === 'object' && err.offline ? `${t('err.terrain.offline')} ${txt}` : txt
}
