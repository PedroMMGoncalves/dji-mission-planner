/**
 * Erros com código (src/utils/appError.js): a mensagem em português vem do
 * dicionário (src/i18n/dict.errors.js), para o texto não viver em dois
 * sítios; o estado guarda o código e as variáveis de qualquer erro
 * (errorInfo); os painéis traduzem o código na língua da interface e, sem
 * tradução, mostram a mensagem (errorText); o erro do relevo leva à frente a
 * nota de «sem rede» (terrainErrorText).
 */
import { describe, expect, test } from 'vitest'
import { translate } from '../../src/i18n.jsx'
import errorsDict from '../../src/i18n/dict.errors.js'
import {
  AppError,
  errorInfo,
  errorText,
  ptMessage,
  terrainErrorText,
} from '../../src/utils/appError.js'

const pt = (key, v) => translate('pt', key, v)
const en = (key, v) => translate('en', key, v)
const vars = (s) => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1])

describe('mensagem em português de um código', () => {
  test('a do dicionário, com as variáveis', () => {
    expect(ptMessage('import.read-failed', { d: 'sem permissão' })).toBe(
      'Falha ao ler o ficheiro: sem permissão',
    )
    expect(ptMessage('wpml.height-mode', { mode: 'WGS84' })).toBe(
      'KMZ com alturas em WGS84: só se importam missões com alturas relativas ao ponto de descolagem (relativeToStartPoint).',
    )
  })

  test('variável em falta fica à vista; os valores entram tal e qual, mesmo com «$»', () => {
    expect(ptMessage('import.read-failed')).toBe('Falha ao ler o ficheiro: {d}')
    expect(ptMessage('import.read-failed', { d: 'C:\\$& e $1.tif' })).toBe(
      'Falha ao ler o ficheiro: C:\\$& e $1.tif',
    )
    expect(ptMessage('import.no-polygon-lines', { what: 'KML', n: 0 })).toMatch(
      /^O KML tem 0 linha/,
    )
  })

  test('código sem entrada no dicionário: o próprio código', () => {
    expect(ptMessage('nao.existe', { d: 1 })).toBe('nao.existe')
  })

  test('cada erro do dicionário: a mensagem do AppError é a tradução portuguesa', () => {
    const codigos = Object.keys(errorsDict).map((k) => k.slice('err.'.length))
    expect(codigos.length).toBeGreaterThan(30)
    for (const code of codigos) {
      const params = Object.fromEntries(vars(errorsDict[`err.${code}`].pt).map((v, i) => [v, i]))
      const err = new AppError(code, params)
      expect(err.message, code).toBe(pt(`err.${code}`, params))
      expect(err.message, code).not.toMatch(/\{[a-zA-Z0-9_]+\}/)
    }
  })
})

describe('AppError', () => {
  test('um Error com nome, código e variáveis', () => {
    const err = new AppError('dem.generic', { d: 'x' })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AppError')
    expect(err.code).toBe('dem.generic')
    expect(err.params).toEqual({ d: 'x' })
    expect(new AppError('terrain.generic').params).toEqual({})
    expect(new AppError('terrain.generic').message).toBe('Falha ao obter o relevo.')
  })
})

describe('o erro guardado no estado (errorInfo)', () => {
  test('AppError: código, variáveis e mensagem', () => {
    const err = new AppError('import.read-failed', { d: 'disco' })
    expect(errorInfo(err)).toEqual({
      code: 'import.read-failed',
      params: { d: 'disco' },
      message: 'Falha ao ler o ficheiro: disco',
    })
  })

  test('um objecto já com código (de um worker, ou já guardado): o mesmo, com o que faltar', () => {
    expect(errorInfo({ code: 'terrain.generic', params: { d: 1 }, message: 'm' })).toEqual({
      code: 'terrain.generic',
      params: { d: 1 },
      message: 'm',
    })
    expect(errorInfo({ code: 'terrain.generic' })).toEqual({
      code: 'terrain.generic',
      params: {},
      message: '',
    })
    // um erro do sistema também traz código (texto): passa, e o painel cai na mensagem
    const enoent = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    expect(errorInfo(enoent)).toEqual({
      code: 'ENOENT',
      params: {},
      message: 'ENOENT: no such file',
    })
  })

  test('Error, DOMException (código numérico), texto, nada: só a mensagem', () => {
    expect(errorInfo(new Error('falhou'))).toEqual({ code: null, params: {}, message: 'falhou' })
    const quota = new DOMException('quota cheia', 'QuotaExceededError')
    expect(typeof quota.code).toBe('number')
    expect(errorInfo(quota)).toEqual({ code: null, params: {}, message: 'quota cheia' })
    expect(errorInfo('texto')).toEqual({ code: null, params: {}, message: 'texto' })
    expect(errorInfo(404)).toEqual({ code: null, params: {}, message: '404' })
    expect(errorInfo(null)).toEqual({ code: null, params: {}, message: '' })
    expect(errorInfo(undefined)).toEqual({ code: null, params: {}, message: '' })
  })
})

describe('o texto para o ecrã (errorText)', () => {
  test('o código traduzido na língua da interface, com as variáveis', () => {
    const info = errorInfo(new AppError('import.read-failed', { d: 'disco' }))
    expect(errorText(info, pt)).toBe('Falha ao ler o ficheiro: disco')
    expect(errorText(info, en)).toBe('Could not read the file: disco')
    // sem variáveis guardadas, o texto leva o nome delas
    expect(errorText({ code: 'import.read-failed', message: '' }, en)).toBe(
      'Could not read the file: {d}',
    )
  })

  test('sem código ou sem tradução: a mensagem', () => {
    expect(errorText(errorInfo(new Error('rede em baixo')), en)).toBe('rede em baixo')
    const enoent = errorInfo(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }))
    expect(errorText(enoent, en)).toBe('ENOENT: no such file')
    expect(errorText({ code: null, params: {} }, pt)).toBe('')
  })

  test('texto já pronto passa tal e qual; nada dá vazio', () => {
    expect(errorText('Aviso já traduzido', en)).toBe('Aviso já traduzido')
    for (const v of [null, undefined, '']) expect(errorText(v, pt)).toBe('')
  })
})

describe('o erro do relevo (terrainErrorText)', () => {
  const info = errorInfo(new AppError('terrain.download-failed'))

  test('sem rede, a nota antes do texto, na língua da interface', () => {
    const offline = { ...errorInfo(new AppError('terrain.generic')), offline: true }
    expect(terrainErrorText(offline, pt)).toBe(
      'Sem ligação à Internet: só as áreas já descarregadas estão na cache. Falha ao obter o relevo.',
    )
    expect(terrainErrorText(offline, en)).toBe(
      'No Internet connection: only the areas already downloaded are in the cache. Could not load the terrain.',
    )
  })

  test('com rede, ou um texto, só o erro; sem erro, vazio', () => {
    expect(terrainErrorText({ ...info, offline: false }, en)).toBe(
      'Could not download the global terrain: check the connection and retry, or import a DTM.',
    )
    expect(terrainErrorText(info, pt)).toBe(errorText(info, pt))
    expect(terrainErrorText('Relevo indisponível', pt)).toBe('Relevo indisponível')
    expect(terrainErrorText(null, pt)).toBe('')
    expect(terrainErrorText(undefined, pt)).toBe('')
  })
})
