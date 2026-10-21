import { useEffect, useState } from 'react'

/**
 * Secções em acordeão, como no desenho (o painel da área e os dos outros
 * modos): uma aberta de cada vez, ou nenhuma. Abrir uma fecha a que estava
 * aberta, e carregar no título da aberta fecha-a.
 *
 * A secção aberta é, da que pesa mais para a que pesa menos:
 * - a que se abriu sozinha (`show`), por ter passado a ter o que mostrar (um
 *   erro, um modo do mapa): não é a escolha do operador e não se grava; o
 *   clique seguinte, ou recarregar, volta à escolha dele;
 * - a escolha do operador (`toggle`, o clique no título): uma secção, ou
 *   nenhuma. Com `storageKey` fica neste aparelho (o id da secção, ou null
 *   com todas fechadas); uma escolha gravada que não esteja em `ids` não
 *   conta;
 * - sem escolha, `fallback`, que pode seguir o estado (no painel da área,
 *   «Área e relevo» sem área e «Parâmetros de voo» quando ela chega). Quando
 *   muda, abre-se a nova, a menos que o operador já tenha escolhido ou que
 *   uma secção se abra sozinha no mesmo render (o aviso da importação ganha
 *   aos parâmetros de voo).
 *
 * @param {string|null} fallback a secção aberta enquanto o operador não escolheu
 * @param {{storageKey?: string|null, ids?: readonly string[]|null}} [opts]
 * @returns {{open: string|null, isOpen: (id: string) => boolean,
 *   toggle: (id: string) => void, show: (id: string) => void}}
 */
export function useAccordion(fallback, { storageKey = null, ids = null } = {}) {
  const [state, setState] = useState(() => ({
    // undefined: o operador ainda não escolheu; null: fechou todas
    chosen: readChoice(storageKey, ids),
    // a que se abriu sozinha, por cima da escolha (undefined: nenhuma)
    shown: /** @type {string|undefined} */ (undefined),
    fallback,
  }))
  // a omissão mudou: sem escolha do operador abre-se ela, e não a que antes
  // se abriu sozinha
  if (state.fallback !== fallback)
    setState((s) => ({ ...s, fallback, shown: s.chosen === undefined ? undefined : s.shown }))
  useEffect(() => {
    if (!storageKey || state.chosen === undefined) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.chosen))
    } catch {
      /* sem armazenamento: fica só nesta sessão */
    }
  }, [storageKey, state.chosen])
  const open = openOf(state)
  return {
    open,
    isOpen: (id) => open === id,
    toggle: (id) =>
      setState((s) => ({ ...s, chosen: openOf(s) === id ? null : id, shown: undefined })),
    show: (id) => setState((s) => (openOf(s) === id ? s : { ...s, shown: id })),
  }
}

/**
 * A secção aberta num estado do acordeão.
 * @param {{chosen: string|null|undefined, shown: string|undefined, fallback: string|null}} s
 */
function openOf(s) {
  if (s.shown !== undefined) return s.shown
  return s.chosen === undefined ? s.fallback : s.chosen
}

/**
 * A escolha gravada em `key`: o id de uma das `ids`, null (todas fechadas),
 * ou undefined quando não há (sem armazenamento, nada gravado, outra coisa).
 * @param {string|null} key
 * @param {readonly string[]|null} ids
 * @returns {string|null|undefined}
 */
function readChoice(key, ids) {
  if (!key) return undefined
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return undefined
    const v = JSON.parse(raw)
    if (v === null) return null
    return typeof v === 'string' && (!ids || ids.includes(v)) ? v : undefined
  } catch {
    return undefined
  }
}
