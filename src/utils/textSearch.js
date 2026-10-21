/**
 * Pesquisa na ajuda: os termos de uma pesquisa e onde aparecem num texto,
 * sem distinguir maiúsculas nem acentos («seguranca» encontra «segurança»,
 * «rth» encontra «RTH»), no princípio de uma palavra («descola» encontra
 * «descolagem», «rth» não encontra «Earth»). Lógica pura; a janela da
 * ajuda filtra os tópicos e realça os intervalos devolvidos.
 */

/** Uma letra ou um algarismo: o que continua uma palavra. */
const WORD = /[\p{L}\p{N}]/u

/** Uma letra sem acentos e em minúscula (pode dar nenhuma ou várias). */
const fold = (/** @type {string} */ c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Os termos de uma pesquisa: as palavras, sem acentos e em minúsculas, sem
 * repetidos. Com menos de duas letras não se procura nada (uma letra
 * acenderia a ajuda inteira).
 * @param {string} query
 * @returns {string[]}
 */
export function searchTerms(query) {
  const q = String(query ?? '').trim()
  if (q.length < 2) return []
  return [
    ...new Set(
      q
        .split(/\s+/)
        .map((w) => [...w].map(fold).join(''))
        .filter(Boolean),
    ),
  ]
}

/**
 * Onde aparecem os termos em `text`, no princípio de uma palavra: os
 * intervalos [início, fim) no texto original, por ordem e juntos quando se
 * tocam, e quantas vezes aparece cada termo (pela ordem de `terms`).
 * @param {string} text
 * @param {string[]} terms os de searchTerms
 * @returns {{ranges: Array<[number, number]>, counts: number[]}}
 */
export function findTerms(text, terms) {
  // o texto comparável e, para cada letra dele, a posição no original
  let norm = ''
  const at = []
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i])
    norm += f
    for (let k = 0; k < f.length; k++) at.push(i)
  }
  /** @type {Array<[number, number]>} */
  const found = []
  const counts = terms.map((term) => {
    let n = 0
    // um termo vazio estaria em toda a parte (e o ciclo não pararia)
    if (!term) return n
    // um termo que começa por uma letra não conta a meio de uma palavra
    // («rth» em «Earth»); um que começa por um sinal («-1») conta em todo o lado
    const word = WORD.test(term[0])
    for (let i = norm.indexOf(term); i >= 0; i = norm.indexOf(term, i + 1)) {
      if (word && i > 0 && WORD.test(norm[i - 1])) continue
      found.push([at[i], at[i + term.length - 1] + 1])
      n += 1
    }
    return n
  })
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  /** @type {Array<[number, number]>} */
  const ranges = []
  for (const [a, b] of found) {
    const last = ranges[ranges.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else ranges.push([a, b])
  }
  return { ranges, counts }
}
