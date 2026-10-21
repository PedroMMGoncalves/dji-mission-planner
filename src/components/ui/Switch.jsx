import { useId } from 'react'

/**
 * Interruptor do desenho (40 × 24): uma caixa de verificação a sério, com
 * role="switch", desenhada como interruptor. Fica dentro do <label> com o
 * nome, que a liga e a nomeia; a descrição, por baixo do nome, é a
 * descrição do controlo (aria-describedby) e não entra no nome. `extra`,
 * a cinzento a seguir ao rótulo, faz parte do nome; `describedBy` junta
 * uma descrição que está fora (uma nota por baixo do interruptor).
 */

/** As classes da caixa desenhada como interruptor (o botão é o ::before). */
export const switchInput =
  "relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-700 transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-slate-300 before:transition-transform before:content-[''] checked:bg-sky-400 checked:before:translate-x-4 checked:before:bg-[#06202E] disabled:cursor-not-allowed disabled:opacity-40"

/**
 * @param {{label: any, extra?: any, description?: any, checked: boolean,
 *   onChange: (checked: boolean) => void, disabled?: boolean, title?: string,
 *   testId?: string, describedBy?: string, className?: string}} props
 */
export function Switch({
  label,
  extra = null,
  description = null,
  checked,
  onChange,
  disabled = false,
  title,
  testId,
  describedBy,
  className = '',
}) {
  const id = useId()
  const desc = [description ? `${id}-desc` : null, describedBy].filter(Boolean).join(' ')
  return (
    <label
      className={`flex items-center justify-between gap-3 ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
      title={title}
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-snug text-slate-100">
          {label}
          {extra && <span className="text-slate-400"> {extra}</span>}
        </span>
        {description && (
          // fora do nome, mas a descrição do interruptor
          <span
            id={`${id}-desc`}
            aria-hidden="true"
            className="mt-0.5 block text-xs leading-snug text-slate-400"
          >
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        aria-describedby={desc || undefined}
        onChange={(e) => onChange(e.target.checked)}
        className={switchInput}
      />
    </label>
  )
}
