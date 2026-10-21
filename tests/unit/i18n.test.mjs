/*
 * Pacote R-C da revisao do codigo (M3-T13): o dicionario PT/EN contra o
 * codigo. Hoje esta coerente so por cuidado — retirar uma chave usada num
 * componente ou acrescentar uma {variavel} so numa lingua passava em tudo e
 * o operador via a chave crua ou um {x} por substituir.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import DICT from '../../src/i18n.jsx'
import * as dicts from '../../src/i18n/dict.bases.js'
import cardsDict from '../../src/i18n/dict.cards.js'
import errorsDict from '../../src/i18n/dict.errors.js'
import controlPanelDict from '../../src/i18n/dict.controlPanel.js'
import missionModesDict from '../../src/i18n/dict.missionModes.js'
import preflightDict from '../../src/i18n/dict.preflight.js'
import settingsDict from '../../src/i18n/dict.settings.js'
import windowsDict from '../../src/i18n/dict.windows.js'
import { FINISH_ACTIONS, RC_LOST_ACTIONS, RC_LOST_MODES } from '../../src/utils/exporters.js'

const SRC = new URL('../../src/', import.meta.url).pathname

/** Todos os ficheiros .js/.jsx de src, recursivamente. */
function sources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(js|jsx)$/.test(name)) out.push(p)
  }
  return out
}
const code = sources().map((p) => ({ p, text: readFileSync(p, 'utf8') }))
const vars = (s) => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort()

describe('M3-T13: o dicionario contra o codigo', () => {
  test("cada t('literal') do codigo tem entrada", () => {
    const faltam = []
    for (const { p, text } of code) {
      // o proprio i18n.jsx explica o uso com t('chave') num comentario
      if (p.endsWith('/i18n.jsx')) continue
      for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g))
        if (!DICT[m[1]]) faltam.push(`${p}: ${m[1]}`)
      for (const m of text.matchAll(/\btranslate\(\s*[a-zA-Z]+,\s*'([^']+)'/g))
        if (!DICT[m[1]]) faltam.push(`${p}: ${m[1]}`)
    }
    expect(faltam).toEqual([])
    expect(Object.keys(DICT).length).toBeGreaterThan(700)
  })

  test('todas as entradas tem PT e EN, e as mesmas {variaveis} nas duas linguas', () => {
    const problemas = []
    for (const [k, v] of Object.entries(DICT)) {
      if (!v || typeof v.pt !== 'string' || !v.pt.trim()) problemas.push(`${k}: sem pt`)
      if (!v || typeof v.en !== 'string' || !v.en.trim()) problemas.push(`${k}: sem en`)
      if (v?.pt && v?.en && vars(v.pt).join() !== vars(v.en).join())
        problemas.push(`${k}: {${vars(v.pt)}} vs {${vars(v.en)}}`)
    }
    expect(problemas).toEqual([])
  })

  test('nenhuma chave definida em dois ficheiros (o spread esconderia a primeira)', () => {
    const base = readFileSync(join(SRC, 'i18n.jsx'), 'utf8')
    const baseKeys = [...base.matchAll(/^\s{2}'([a-zA-Z0-9.-]+)':/gm)].map((m) => m[1])
    const parts = [
      ['i18n.jsx', baseKeys],
      ['dict.controlPanel.js', Object.keys(controlPanelDict)],
      ['dict.missionModes.js', Object.keys(missionModesDict)],
      ['dict.preflight.js', Object.keys(preflightDict)],
      ['dict.settings.js', Object.keys(settingsDict)],
      ['dict.bases.js', Object.keys(dicts.default ?? dicts)],
      ['dict.cards.js', Object.keys(cardsDict)],
      ['dict.errors.js', Object.keys(errorsDict)],
      ['dict.windows.js', Object.keys(windowsDict)],
    ]
    const vistas = new Map()
    const duplicadas = []
    for (const [file, keys] of parts)
      for (const k of keys) {
        if (vistas.has(k)) duplicadas.push(`${k} em ${vistas.get(k)} e ${file}`)
        else vistas.set(k, file)
      }
    expect(duplicadas).toEqual([])
    expect(vistas.size).toBe(Object.keys(DICT).length)
  })

  test('M3-C11: cada erro com codigo (AppError, avisos do relevo) tem texto, e nenhum Error cru em portugues', () => {
    const codigos = new Set()
    const crus = []
    for (const { p, text } of code) {
      if (p.endsWith('appError.js')) continue
      for (const m of text.matchAll(/new AppError\(\s*'([a-z.-]+)'/g)) codigos.add(m[1])
      for (const m of text.matchAll(/\bwarn\(\s*'([a-z.-]+)'/g)) codigos.add(m[1])
      for (const m of text.matchAll(/parseXml\([^)]*,\s*'([a-z.-]+)'\s*\)/g)) codigos.add(m[1])
      // um Error com texto em portugues (acentos) chegava cru ao ecra, tambem em EN
      for (const m of text.matchAll(/new Error\(\s*[`']([^`']*)[`']/g))
        if (/[áéíóúâêôãõç]/i.test(m[1])) crus.push(`${p.slice(SRC.length)}: ${m[1].slice(0, 60)}`)
    }
    expect(codigos.size).toBeGreaterThan(30)
    for (const c of codigos) expect(DICT[`err.${c}`], `err.${c}`).toBeTruthy()
    expect(crus).toEqual([])
  })

  test('cada codigo do preflight tem mensagem', () => {
    const src = readFileSync(join(SRC, 'mission', 'preflight.js'), 'utf8')
    const codigos = [
      ...new Set([...src.matchAll(/item\('[a-z]+', '([a-z0-9-]+)'/g)].map((m) => m[1])),
    ]
    expect(codigos.length).toBeGreaterThan(40)
    const semMensagem = codigos.filter((c) => !DICT[`preflight.${c}`])
    expect(semMensagem).toEqual([])
  })

  test('as familias dinamicas cobrem os enums', () => {
    for (const a of FINISH_ACTIONS) expect(DICT[`safety.finish.${a}`], a).toBeTruthy()
    for (const a of RC_LOST_MODES) expect(DICT[`safety.rcLost.${a}`], a).toBeTruthy()
    for (const a of RC_LOST_ACTIONS) expect(DICT[`safety.rcAction.${a}`], a).toBeTruthy()
    // o resumo das accoes de seguranca nos paineis da face, orbita, corredor e circular
    for (const a of FINISH_ACTIONS) expect(DICT[`mp.safety.end.${a}`], a).toBeTruthy()
    for (const a of RC_LOST_ACTIONS) expect(DICT[`mp.safety.act.${a}`], a).toBeTruthy()
  })
})
