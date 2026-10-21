import { useEffect } from 'react'
import { IconClose } from '../Icons.jsx'

/**
 * Janelas do desenho (configuração, ajuda, aviso, perfil, vista 3D): o fundo
 * que escurece o ecrã sem o desfocar, a caixa, o cabeçalho com o ícone, o
 * título e a linha de baixo, os botões de fechar e o foco — entra na janela
 * ao abrir, o Tab dá a volta dentro dela e, ao fechar, volta a quem a
 * abriu.
 */

/** O fundo por baixo de uma janela; a camada (z-index) junta-a cada janela. */
export const BACKDROP = 'fixed inset-0 flex items-center justify-center p-4'

/** A caixa da janela: opaca, com contorno e sombra (largura e altura são de cada uma). */
export const WINDOW =
  'flex max-h-full w-full flex-col overflow-hidden rounded-xl border bg-slate-900 text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.6)] outline-none'

/** Caixa do ícone do cabeçalho (configuração, ajuda). */
export const ICON_BOX =
  'flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-[#16223A] text-sky-300'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * O foco de uma janela modal: ao abrir vai para `initial` (ou para a
 * janela, que leva tabIndex -1), o Tab e o Shift+Tab dão a volta dentro
 * dela, e ao fechar volta ao elemento que o tinha (o botão que a abriu).
 * @param {{current: HTMLElement|null}} ref a janela
 * @param {{current: HTMLElement|null}} [initial]
 */
export function useDialogFocus(ref, initial) {
  useEffect(() => {
    const before = document.activeElement
    const box = ref.current
    ;(initial?.current ?? box)?.focus({ preventScroll: true })
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Tab' || !box) return
      // só os que se vêem: as secções escondidas não entram na volta
      const items = [...box.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      )
      const active = document.activeElement
      const first = /** @type {HTMLElement|undefined} */ (items[0])
      const last = /** @type {HTMLElement|undefined} */ (items[items.length - 1])
      if (!first || !last) return
      if (!box.contains(active) || (e.shiftKey ? active === first : active === last)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true })
    }
    // só ao abrir e ao fechar a janela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * Cabeçalho de uma janela: o ícone na sua caixa, o título (`id`, o nome da
 * janela para o leitor de ecrã), a linha de baixo (`subtitleId`, a descrição)
 * e, à direita, `children` (a língua, o botão de fechar).
 * @param {{id: string, icon: any, iconClass?: string, title: any, subtitle?: any,
 *   subtitleId?: string, inline?: boolean, className?: string, titleClass?: string,
 *   children?: any}} props `inline`: a linha de baixo ao lado do título
 */
export function WindowHeader({
  id,
  icon,
  iconClass = ICON_BOX,
  title,
  subtitle = null,
  subtitleId,
  inline = false,
  className = 'py-3.5 pl-5 pr-3.5',
  titleClass = 'text-[17px]',
  children = null,
}) {
  return (
    <div className={`flex flex-none items-center gap-3 border-b border-slate-800 ${className}`}>
      <span aria-hidden="true" className={iconClass}>
        {icon}
      </span>
      <div className={`min-w-0 flex-1 ${inline ? 'flex flex-wrap items-baseline gap-x-2.5' : ''}`}>
        <h2 id={id} className={`m-0 font-semibold leading-snug tracking-[-0.01em] ${titleClass}`}>
          {title}
        </h2>
        {subtitle != null && (
          <p
            id={subtitleId}
            className={`m-0 text-[12.5px] leading-snug text-slate-400 ${inline ? '' : 'mt-0.5'}`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * Botão de fechar só com a cruz (40 × 40): o nome diz o que fecha
 * («Fechar a ajuda»), a dica o atalho («Fechar (Esc)»).
 * @param {{label: string, title: string, onClick: () => void}} props
 */
export function CloseIconButton({ label, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-raised hover:text-slate-100"
    >
      <IconClose className="h-[18px] w-[18px]" />
    </button>
  )
}

/**
 * Botão «Fechar» com a tecla Esc à vista (perfil, vista 3D).
 * @param {{text: string, onClick: () => void, title?: string}} props
 */
export function CloseKeyButton({ text, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-keyshortcuts="Escape"
      className="flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-lg border border-slate-700 bg-surface pl-3 pr-2 text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised"
    >
      <IconClose className="h-4 w-4" />
      {text}
      <kbd
        aria-hidden="true"
        className="hidden h-5 items-center rounded-[5px] border border-slate-700 bg-field px-1.5 font-sans text-[11px] font-medium text-slate-300 sm:inline-flex"
      >
        Esc
      </kbd>
    </button>
  )
}
