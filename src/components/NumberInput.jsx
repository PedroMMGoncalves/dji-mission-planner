import { useEffect, useRef, useState } from 'react'

const INPUT_CLASS =
  'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

/**
 * Campo numérico com rascunho: o que se escreve só chega ao estado quando o
 * operador acaba (ao sair do campo, com Enter, ou 400 ms depois da última
 * tecla se o número já estiver dentro dos limites) e é então levado a
 * [min, max]. Levar cada tecla ao limite estragava a escrita: num campo com
 * mínimo 20, o «1» de «150» passava logo a 20 e o campo acabava em 205; e um
 * «2.» por acabar (vazio para o browser) não pode apagar o valor.
 * `allowEmpty`: o campo vazio devolve null (p. ex. «automática»).
 *
 * @param {{value: any, onChange: (v: any) => void, min?: number, max?: number,
 *   step?: number, wide?: boolean, testId?: string, label?: string,
 *   allowEmpty?: boolean, placeholder?: string, className?: string}} props
 */
export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  wide = false,
  testId,
  label,
  allowEmpty = false,
  placeholder,
  className,
}) {
  const [draft, setDraft] = useState(/** @type {string | null} */ (null))
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined))
  const inRange = (n) => (!Number.isFinite(min) || n >= min) && (!Number.isFinite(max) || n <= max)
  const commit = (raw) => {
    clearTimeout(timer.current)
    setDraft(null)
    if (raw === '' || raw == null) {
      if (allowEmpty && value != null) onChange(null)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    let v = n
    if (Number.isFinite(min)) v = Math.max(min, v)
    if (Number.isFinite(max)) v = Math.min(max, v)
    if (v !== value) onChange(v)
  }
  /** Fim da escrita: aplica o rascunho, ou volta ao valor se ficou por acabar. */
  const finish = (el) => {
    if (draft == null) return
    if (el.validity?.badInput) {
      clearTimeout(timer.current)
      setDraft(null)
      return
    }
    commit(draft)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <input
      type="number"
      aria-label={label}
      data-testid={testId}
      placeholder={placeholder}
      onBlur={(e) => finish(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(e.currentTarget)
      }}
      className={className ?? `${wide ? 'w-28' : 'w-20'} ${INPUT_CLASS}`}
      value={draft ?? value ?? ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        clearTimeout(timer.current)
        // a meio da escrita só se aplica um número já dentro dos limites;
        // o resto (vazio, por acabar, abaixo do mínimo) espera pelo fim
        const n = Number(raw)
        if (raw !== '' && Number.isFinite(n) && inRange(n))
          timer.current = setTimeout(() => commit(raw), 400)
      }}
    />
  )
}
