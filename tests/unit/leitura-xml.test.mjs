/**
 * Leitura de XML tolerante (src/utils/xml.js), partilhada pelos importadores
 * de missões e de áreas: o nome local sem prefixo, também em nós sem
 * localName; nós vazios ou nulos; a procura nos filhos directos e em
 * profundidade; e as maneiras de um parser dizer que o XML é ilegível — a
 * excepção dos parsers estritos e o <parsererror> dos browsers, na raiz
 * (Firefox) ou logo abaixo dela (Chrome) —, com e sem código de erro.
 */
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  childNamed,
  elementChildren,
  findAll,
  findFirst,
  localNameOf,
  parseXml,
  textOf,
} from '../../src/utils/xml.js'

const xml = (s) => new XmlDomParser().parseFromString(s, 'application/xml')

describe('nomes, filhos e texto', () => {
  test('o nome local sem prefixo, também em nós sem localName', () => {
    expect(localNameOf({ localName: 'Polygon', nodeName: 'kml:Polygon' })).toBe('Polygon')
    expect(localNameOf({ nodeName: 'wpml:executeHeight' })).toBe('executeHeight')
    expect(localNameOf({ nodeName: 'name' })).toBe('name')
    expect(localNameOf({})).toBe('')
  })

  test('nó vazio ou nulo: sem filhos, sem descendentes, sem texto', () => {
    expect(elementChildren(null)).toEqual([])
    expect(elementChildren({})).toEqual([])
    expect(childNamed(null, 'name')).toBeNull()
    expect(findAll(null, 'Placemark')).toEqual([])
    expect(findFirst(null, 'Placemark')).toBeNull()
    expect(textOf(null)).toBe('')
    expect(textOf({ textContent: null })).toBe('')
    expect(textOf({ textContent: '  12 ' })).toBe('12')
  })

  test('procura pelo nome local: só nos filhos directos, ou em profundidade', () => {
    const doc = xml(
      '<kml xmlns:kml="urn:k" xmlns:wpml="urn:w"><Document><kml:name>A</kml:name>' +
        '<Folder><name>B</name><wpml:index>3</wpml:index></Folder></Document></kml>',
    )
    const docEl = findFirst(doc, 'Document')
    expect(textOf(childNamed(docEl, 'name'))).toBe('A')
    expect(childNamed(docEl, 'index')).toBeNull()
    expect(textOf(findFirst(docEl, 'index'))).toBe('3')
    expect(findAll(doc, 'name').map(textOf)).toEqual(['A', 'B'])
  })
})

describe('XML ilegível: as maneiras de o parser o dizer', () => {
  afterEach(() => vi.unstubAllGlobals())
  /** Põe no lugar do DOMParser do browser um que devolve (ou lança) o que `parse` disser. */
  const parser = (parse) =>
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString(texto) {
          return parse(texto)
        }
      },
    )

  test('o parser estrito lança: o erro com o código, ou com a mensagem dada sem código', () => {
    parser(() => {
      throw new Error('mal formado')
    })
    expect(() => parseXml('<a>', 'XML ilegível', 'wpml.xml-invalid')).toThrow(
      expect.objectContaining({ name: 'AppError', code: 'wpml.xml-invalid' }),
    )
    expect(() => parseXml('<a>', 'XML ilegível')).toThrow('XML ilegível')
  })

  test('o browser devolve um <parsererror> na raiz ou logo abaixo dela; ou nem raiz há', () => {
    parser(() => xml('<parsererror xmlns="http://www.w3.org/1999/xhtml">erro</parsererror>'))
    expect(() => parseXml('x', 'KML inválido')).toThrow('KML inválido')
    parser(() => xml('<kml><parsererror>linha 1</parsererror><Document/></kml>'))
    expect(() => parseXml('x', 'KML inválido', 'import.kml-invalid')).toThrow(
      expect.objectContaining({ code: 'import.kml-invalid' }),
    )
    parser(() => ({ documentElement: null }))
    expect(() => parseXml('x', 'KML inválido')).toThrow('KML inválido')
    // um documento bom passa tal e qual
    parser(() => xml('<kml><Document/></kml>'))
    expect(localNameOf(parseXml('x', 'KML inválido').documentElement)).toBe('kml')
  })
})
