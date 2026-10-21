/**
 * Botões do desenho de Outubro de 2026: uma só acção principal por ecrã
 * (`primary`, na cor de acento), as secundárias com contorno, as discretas
 * sem fundo (`ghost`) e as que apagam (`danger`, só o texto vermelho;
 * `dangerSolid` para confirmar). `buttonClass` dá só as classes, para um
 * elemento que não é um <button> ou que junta as suas.
 */

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed'

const VARIANT = {
  primary:
    'bg-sky-400 font-semibold text-[#06202E] hover:bg-sky-300 disabled:bg-slate-800 disabled:text-slate-400',
  secondary:
    'border border-slate-700 text-slate-100 hover:border-slate-600 hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent',
  ghost:
    'text-slate-200 hover:bg-raised hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent',
  danger: 'text-red-300 hover:bg-red-950/40 disabled:opacity-40',
  dangerSolid: 'bg-red-400 font-semibold text-[#2B1215] hover:bg-red-300 disabled:opacity-40',
}

const SIZE = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-[13px]',
  lg: 'h-11 px-4 text-sm',
  // quadrado, só com o ícone (dê-lhe aria-label)
  icon: 'h-9 w-9 text-[13px]',
}

/**
 * Classes de um botão.
 * @param {'primary'|'secondary'|'ghost'|'danger'|'dangerSolid'} [variant]
 * @param {'sm'|'md'|'lg'|'icon'} [size]
 */
export function buttonClass(variant = 'secondary', size = 'md') {
  return `${BASE} ${VARIANT[variant] ?? VARIANT.secondary} ${SIZE[size] ?? SIZE.md}`
}

/**
 * Botão com uma variante e um tamanho; `icon` vai antes do texto. O resto
 * das propriedades passa ao <button> (onClick, disabled, title, aria-*...).
 * @param {{variant?: 'primary'|'secondary'|'ghost'|'danger'|'dangerSolid',
 *   size?: 'sm'|'md'|'lg'|'icon', icon?: any, className?: string,
 *   type?: 'button'|'submit'|'reset', children?: any} & Record<string, any>} props
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon = null,
  className = '',
  type = 'button',
  children = null,
  ...rest
}) {
  return (
    <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}
