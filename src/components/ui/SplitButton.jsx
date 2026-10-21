import { IconChevronDown } from '../Icons.jsx'
import { Menu, useMenu } from './Menu.jsx'

/**
 * Botão partido: a parte principal faz a acção principal; a seta abre o
 * menu (Menu) com as outras. Sem `items`, fica só o botão principal. A seta
 * não segue o `disabled` da principal: com a principal desligada (o
 * preflight bloqueia) as outras podem continuar disponíveis, e a seta passa
 * ao tom neutro para não parecer meio botão aceso.
 * @param {{label: any, icon?: any, title?: string, disabled?: boolean,
 *   onClick: () => void, menuLabel: string, menuId?: string,
 *   items?: import('./Menu.jsx').MenuItem[], onOpen?: () => void,
 *   testId?: string}} props
 */
export function SplitButton({
  label,
  icon = null,
  title,
  disabled = false,
  onClick,
  menuLabel,
  menuId,
  items = [],
  onOpen,
  testId,
}) {
  const menu = useMenu({ onOpen })
  const hasMenu = items.length > 0
  const main = disabled
    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
    : 'bg-sky-400 text-[#06202E] hover:bg-sky-300'
  return (
    <div className="relative flex">
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`flex h-9 items-center gap-2 whitespace-nowrap px-3.5 text-[13px] font-semibold transition-colors ${main} ${
          hasMenu ? 'rounded-l-lg' : 'rounded-lg'
        }`}
      >
        {icon}
        {label}
      </button>
      {hasMenu && (
        <button
          type="button"
          {...menu.triggerProps}
          aria-controls={menu.open ? menuId : undefined}
          aria-label={menuLabel}
          title={menuLabel}
          className={`flex h-9 w-[34px] items-center justify-center rounded-r-lg border-l transition-colors ${
            disabled
              ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              : 'border-[#06202E]/35 bg-sky-400 text-[#06202E] hover:bg-sky-300'
          }`}
        >
          <IconChevronDown
            className={`h-4 w-4 transition-transform ${menu.open ? 'rotate-180' : ''}`}
          />
        </button>
      )}
      {hasMenu && (
        <Menu
          id={menuId}
          open={menu.open}
          start={menu.start}
          close={menu.close}
          triggerRef={menu.triggerRef}
          label={menuLabel}
          items={items}
          className="right-0 w-80"
        />
      )}
    </div>
  )
}
