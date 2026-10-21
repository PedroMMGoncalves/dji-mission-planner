/**
 * Controlo segmentado do desenho: botões lado a lado numa calha, o
 * escolhido realçado (aria-pressed). Um grupo (role="group") com nome.
 * Uma opção com `onClick` é uma acção (não fica premida, salvo `pressed`);
 * as outras escolhem `value` com `onChange`. `columns` dá as colunas da
 * grelha (classes, ex.: «grid-cols-2 lg:grid-cols-4»).
 */

// classes inteiras, para o Tailwind as encontrar
const COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }

const TONE = {
  sky: {
    rail: 'border border-slate-800 bg-field',
    on: 'bg-[#1E3A52] font-semibold text-[#E0F2FE]',
    off: 'font-medium text-slate-200 hover:bg-raised',
  },
  emerald: {
    rail: 'bg-[#0A1E18]',
    on: 'bg-emerald-500 font-semibold text-[#04241A]',
    off: 'font-medium text-[#9DD9C0] hover:bg-[#0F2A22]',
  },
}

/**
 * @typedef {object} SegmentedOption
 * @property {any} value
 * @property {any} label
 * @property {string} [ariaLabel] nome completo, quando o rótulo é curto
 * @property {string} [title]
 * @property {string} [testId]
 * @property {boolean} [disabled]
 * @property {boolean} [pressed] estado próprio (numa acção)
 * @property {() => void} [onClick] uma acção em vez de uma escolha
 * @property {string} [className] classes a mais (a cor de uma acção)
 */

/**
 * @param {{label: string, options: SegmentedOption[], value?: any,
 *   onChange?: (value: any) => void, columns?: string, tone?: 'sky'|'emerald',
 *   title?: string, testId?: string, className?: string}} props
 */
export function Segmented({
  label,
  options,
  value,
  onChange,
  columns,
  tone = 'sky',
  title,
  testId,
  className = '',
}) {
  const c = TONE[tone] ?? TONE.sky
  const cols = columns ?? COLS[options.length] ?? 'grid-cols-4'
  return (
    <div
      role="group"
      aria-label={label}
      title={title}
      data-testid={testId}
      className={`grid gap-1 rounded-[9px] p-[3px] ${c.rail} ${cols} ${className}`}
    >
      {options.map((o) => {
        const pressed = o.pressed ?? (o.onClick ? undefined : value === o.value)
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={pressed}
            aria-label={o.ariaLabel}
            title={o.title}
            data-testid={o.testId}
            disabled={o.disabled}
            onClick={() => (o.onClick ? o.onClick() : onChange?.(o.value))}
            className={`min-h-8 rounded-md px-1 text-[12.5px] leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
              pressed ? c.on : c.off
            } ${o.className ?? ''}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
