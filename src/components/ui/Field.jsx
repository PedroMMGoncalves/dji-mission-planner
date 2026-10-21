import { Children, cloneElement, isValidElement, useId } from 'react'

/**
 * Campo do desenho: o rótulo por cima e a unidade dentro da caixa, à
 * direita do valor. A caixa é a do Field; o <input> lá dentro (um
 * NumberInput, um <input> ou um <select>) leva `fieldInput`, sem contorno
 * próprio, e a caixa mostra o foco:
 *
 *   <Field label="Altura AGL" unit="m">
 *     <NumberInput value={v} onChange={set} className={fieldInput} />
 *   </Field>
 *
 * `hint`, por baixo, fora do rótulo (não entra no nome do campo): é a
 * descrição do controlo (aria-describedby), o primeiro elemento lá dentro.
 */

/** Caixa do campo: contorno, fundo e o foco de quem está dentro dela. */
export const fieldBox =
  'flex h-10 min-w-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-field px-2.5 transition-colors focus-within:border-sky-400'

/** O controlo dentro da caixa: sem contorno, números alinhados, sem as setas do browser. */
export const fieldInput =
  'w-full min-w-0 flex-1 bg-transparent text-sm font-medium tabular-nums text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

/**
 * @param {{label: any, unit?: any, hint?: any, className?: string, children?: any}} props
 */
export function Field({ label, unit = null, hint = null, className = '', children = null }) {
  const hintId = useId()
  // a dica descreve o controlo: o primeiro elemento dentro da caixa
  const kids = Children.toArray(children)
  const at = hint ? kids.findIndex((c) => isValidElement(c)) : -1
  const control =
    at < 0
      ? children
      : kids.map((c, i) => {
          if (i !== at) return c
          const el = /** @type {import('react').ReactElement<any>} */ (c)
          const ids = [el.props['aria-describedby'], hintId].filter(Boolean).join(' ')
          return cloneElement(el, { 'aria-describedby': ids })
        })
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-slate-400">
        <span>{label}</span>
        <span className={fieldBox}>
          {control}
          {unit != null && (
            <span className="flex-none text-[12.5px] font-normal text-slate-400">{unit}</span>
          )}
        </span>
      </label>
      {hint && (
        <p id={hintId} className="text-xs leading-snug text-slate-400">
          {hint}
        </p>
      )}
    </div>
  )
}
