/**
 * Formatação dos textos dos dicionários: um intervalo «a–b» que fica num só
 * valor quando as duas pontas, tal como se mostram, são iguais («150–150 m»
 * era o que a ficha dizia com a altura do 1.º waypoint igual à máxima), e a
 * escolha entre a chave do singular e a do plural de uma contagem («1
 * necessários»). Lógica pura; os componentes só chamam.
 */

/**
 * «150–180», ou «150» quando as duas pontas, já formatadas por `fmt`, são
 * iguais: compara-se o que se mostra, não os números.
 * @param {number} a
 * @param {number} b
 * @param {(v: number) => string|number} [fmt]
 * @param {string} [sep] separador entre as pontas
 */
export function rangeText(a, b, fmt = (v) => String(v), sep = '–') {
  const x = String(fmt(a))
  const y = String(fmt(b))
  return x === y ? x : `${x}${sep}${y}`
}

/**
 * A chave do singular (`${key}One`) com n = 1, a do plural (`key`) com o
 * resto: «1 necessário» / «{n} necessários». As variáveis são as de quem
 * chama (a chave do singular pode usar menos).
 * @param {(key: string, vars?: Record<string, any>) => string} t
 * @param {string} key chave do plural; o singular é `${key}One`
 * @param {number} n
 * @param {Record<string, any>} [vars]
 */
export function tCount(t, key, n, vars = {}) {
  return t(n === 1 ? `${key}One` : key, vars)
}
