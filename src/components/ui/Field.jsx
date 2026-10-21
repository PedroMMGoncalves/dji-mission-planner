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
 * `hint`, por baixo, fora do rótulo (não entra no nome do campo).
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
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-slate-400">
        <span>{label}</span>
        <span className={fieldBox}>
          {children}
          {unit != null && (
            <span className="flex-none text-[12.5px] font-normal text-slate-400">{unit}</span>
          )}
        </span>
      </label>
      {hint && <p className="text-xs leading-snug text-slate-400">{hint}</p>}
    </div>
  )
}
