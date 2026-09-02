/**
 * Leitura de XML tolerante a prefixos de namespace — partilhada pelos dois
 * importadores (missões WPML e áreas KML).
 *
 * Porquê não `querySelector`: os ficheiros que chegam aqui declaram o
 * namespace de maneiras diferentes (`<Polygon>`, `<kml:Polygon>`,
 * `<wpml:executeHeight>`), e um selector CSS obriga a ter um DOM completo de
 * browser. Procurar sempre pelo NOME LOCAL da tag resolve as duas coisas: é
 * indiferente ao prefixo e corre em cima de qualquer parser de XML, o que
 * torna estes módulos testáveis fora do browser.
 *
 * Convenção: `node.nodeType === 1` é um elemento (Node.ELEMENT_NODE).
 */

/** Nome da tag sem prefixo: `wpml:executeHeight` → `executeHeight`. */
export function localNameOf(node) {
  return (
    node.localName ||
    String(node.nodeName || '')
      .split(':')
      .pop()
  )
}

/** Filhos DIRECTOS que são elementos. */
export function elementChildren(node) {
  const out = []
  const kids = node?.childNodes || []
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].nodeType === 1) out.push(kids[i])
  }
  return out
}

/** Primeiro filho DIRECTO com este nome local (ex.: `<name>` do Folder). */
export function childNamed(node, name) {
  return elementChildren(node).find((el) => localNameOf(el) === name) || null
}

/** Todos os descendentes com este nome local, por ordem do documento. */
export function findAll(node, name, out = []) {
  for (const el of elementChildren(node)) {
    if (localNameOf(el) === name) out.push(el)
    findAll(el, name, out)
  }
  return out
}

/** Primeiro descendente com este nome local. */
export function findFirst(node, name) {
  for (const el of elementChildren(node)) {
    if (localNameOf(el) === name) return el
    const deep = findFirst(el, name)
    if (deep) return deep
  }
  return null
}

/** Texto de um elemento, aparado; string vazia se não houver. */
export function textOf(el) {
  const t = el?.textContent
  return typeof t === 'string' ? t.trim() : ''
}

/**
 * Lê XML e devolve o documento, ou lança `Error(errorMessage)`.
 *
 * Os parsers falham de DUAS maneiras conforme o ambiente, e ambas contam
 * como ficheiro ilegível: os browsers devolvem sempre um documento, com um
 * elemento `<parsererror>` na raiz (ou logo abaixo dela); os parsers
 * estritos (ex.: @xmldom/xmldom, usado pelos testes) atiram uma excepção.
 */
export function parseXml(text, errorMessage) {
  let doc
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml')
  } catch {
    throw new Error(errorMessage)
  }
  const root = doc?.documentElement
  const failed =
    !root ||
    localNameOf(root) === 'parsererror' ||
    elementChildren(root).some((el) => localNameOf(el) === 'parsererror')
  if (failed) throw new Error(errorMessage)
  return doc
}
