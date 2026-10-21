import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Menu de acções (role="menu"), aberto por um botão (useMenu): abre por
 * baixo dele e o foco entra no primeiro item (no último, com a seta para
 * cima); as setas, Home e End movem-no pelos itens activos, Enter e Espaço
 * escolhem (o clique do próprio botão), Esc e Tab fecham e devolvem o foco
 * ao botão, e um clique fora fecha sem lhe mexer. Os itens só existem com
 * o menu aberto.
 */

/**
 * Estado de um menu e as propriedades do botão que o abre. `onOpen`, se
 * dado, é chamado ao abrir (fechar o que estiver aberto ao lado).
 * @param {{onOpen?: () => void}} [opts]
 */
export function useMenu({ onOpen } = {}) {
  // null fechado; 'first' | 'last': o item que recebe o foco ao abrir
  const [start, setStart] = useState(/** @type {null|'first'|'last'} */ (null))
  const triggerRef = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const close = useCallback((returnFocus = false) => {
    setStart(null)
    if (returnFocus) triggerRef.current?.focus()
  }, [])
  const openAt = (where) => {
    if (start === null) onOpen?.()
    setStart(where)
  }
  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': /** @type {'menu'} */ ('menu'),
    'aria-expanded': start !== null,
    onClick: () => (start === null ? openAt('first') : close()),
    onKeyDown: (e) => {
      if (e.key === 'Escape' && start !== null) {
        e.preventDefault()
        e.stopPropagation()
        close(false)
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      openAt(e.key === 'ArrowUp' ? 'last' : 'first')
    },
  }
  return { open: start !== null, start: start ?? 'first', close, triggerRef, triggerProps }
}

/**
 * @typedef {object} MenuItem
 * @property {string} key
 * @property {any} label
 * @property {any} [description] linha por baixo do nome, mais pequena
 * @property {string} [title] dica (a mesma do botão equivalente no painel)
 * @property {boolean} [disabled]
 * @property {any} [icon]
 * @property {string} [testId]
 * @property {() => void} onSelect
 */

/**
 * O menu aberto. `className` dá a largura e o lado (ex.: «right-0 w-80»);
 * fica dentro do ecrã mesmo quando o botão está encostado a um bordo.
 * @param {{id?: string, open: boolean, start?: 'first'|'last', label: string,
 *   items: MenuItem[], close: (returnFocus?: boolean) => void,
 *   triggerRef: {current: HTMLElement|null}, className?: string}} props
 */
export function Menu({
  id,
  open,
  start = 'first',
  label,
  items,
  close,
  triggerRef,
  className = '',
}) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  useEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const enabled = el.querySelectorAll('[role="menuitem"]:not([disabled])')
    const first = start === 'last' ? enabled[enabled.length - 1] : enabled[0]
    // sem itens activos (sem plano, por exemplo) o foco fica no próprio
    // menu, para o Esc o fechar e o leitor de ecrã o anunciar
    if (first instanceof HTMLElement) first.focus()
    else el.focus()
    // encostado a um bordo (o cabeçalho partido em duas linhas), desliza
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const dx = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0
    if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`
    const outside = (e) => {
      if (!el.contains(e.target) && !triggerRef.current?.contains(e.target)) close(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, start, close, triggerRef])
  if (!open) return null
  const onKeyDown = (e) => {
    const enabled = [...e.currentTarget.querySelectorAll('[role="menuitem"]:not([disabled])')]
    const i = enabled.indexOf(document.activeElement)
    const go = (j) => {
      e.preventDefault()
      enabled[(j + enabled.length) % enabled.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i < 0 ? enabled.length - 1 : i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(enabled.length - 1)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      // o Esc é deste menu: nem a gaveta nem a base seleccionada o recebem
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }
  return (
    <div
      ref={ref}
      id={id}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`absolute top-full z-10 mt-2 rounded-xl border border-slate-700 bg-slate-900 p-1.5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none ${className}`}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={it.disabled}
          title={it.title}
          data-testid={it.testId}
          onClick={() => {
            close(true)
            it.onSelect()
          }}
          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-slate-100 transition-colors hover:bg-raised focus:bg-raised focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {it.icon}
          <span className="min-w-0">
            <span className="block">{it.label}</span>
            {it.description && (
              <span className="mt-0.5 block text-xs font-normal leading-snug text-slate-400">
                {it.description}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
