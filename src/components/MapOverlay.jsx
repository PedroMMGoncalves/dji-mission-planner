/**
 * Peças comuns ao que flutua por cima do mapa e à barra dos modos (barra de
 * desenho, primeiros passos, métricas, legenda): o ícone em traço, as
 * classes repetidas — o cartão opaco, o botão recolhido em pastilha e o
 * anel do foco —, o foco que acompanha o botão de abrir e fechar e a
 * largura do ecrã (as media queries das classes, lidas no código).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

/** Anel do foco do teclado nos botões. */
export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400'

/** Cartão opaco por cima do mapa (métricas, legenda, primeiros passos). */
export const CARD =
  'rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-[0_16px_40px_rgba(0,0,0,0.5)]'

/** Botão em pastilha de um cartão recolhido (métricas, legenda, primeiros passos). */
export const PILL = `flex h-10 items-center gap-2 whitespace-nowrap rounded-[10px] border border-slate-700 bg-slate-900 px-3 text-[13px] font-medium text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors hover:bg-slate-800 ${FOCUS} focus-visible:outline-offset-2`

/** Botão só com ícone, no cabeçalho de um cartão (recolher, esconder). */
export const ICON_BUTTON = `flex items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 ${FOCUS}`

/**
 * Ícone em traço na cor do texto (viewBox de 24): `d` é o caminho, ou
 * `children` as formas.
 * @param {{d?: string, size?: number, sw?: number, className?: string, children?: any}} props
 */
export function Icon({ d, size = 16, sw = 2, className = '', children = null }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {d ? <path d={d} /> : children}
    </svg>
  )
}

/**
 * Um cartão que se recolhe num botão troca de botão ao abrir e ao fechar
 * (a seta no cabeçalho, a pastilha): o foco passa para o botão novo, em vez
 * de cair no corpo da página. `mark()` antes de mudar `open`; `ref` nos dois.
 * @param {boolean} open
 */
export function useToggleFocus(open) {
  const ref = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const pending = useRef(false)
  useEffect(() => {
    if (pending.current) ref.current?.focus()
    pending.current = false
  }, [open])
  return { ref, mark: () => (pending.current = true) }
}

/**
 * Se a media query `query` se verifica agora, e acompanha as mudanças (a
 * janela que se estreita): para o código decidir o mesmo que as classes
 * `lg:`, `min-[1180px]:`, … decidem no ecrã.
 * @param {string} query
 */
export function useMedia(query) {
  const subscribe = useCallback(
    (/** @type {() => void} */ onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
