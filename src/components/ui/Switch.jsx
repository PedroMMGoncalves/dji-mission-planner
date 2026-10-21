import { useId } from 'react'

/**
 * Interruptor do desenho (40 × 24): uma caixa de verificação a sério, com
 * role="switch", desenhada como interruptor. Fica dentro do <label> com o
 * nome, que a liga e a nomeia; a descrição, por baixo do nome, é a
 * descrição do controlo (aria-describedby) e não entra no nome.
 */

/** As classes da caixa desenhada como interruptor (o botão é o ::before). */
export const switchInput =
  "relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-700 transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-slate-300 before:transition-transform before:content-[''] checked:bg-sky-400 checked:before:translate-x-4 checked:before:bg-[#06202E] disabled:cursor-not-allowed disabled:opacity-40"

/**
 * @param {{label: any, description?: any, checked: boolean,
 *   onChange: (checked: boolean) => void, disabled?: boolean, title?: string,
 *   testId?: string, className?: string}} props
 */
export function Switch({
  label,
  description = null,
  checked,
  onChange,
  disabled = false,
  title,
  testId,
  className = '',
}) {
  const id = useId()
  return (
    <label className={`flex items-center justify-between gap-3 ${className}`} title={title}>
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-snug text-slate-100">{label}</span>
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
        aria-describedby={description ? `${id}-desc` : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className={switchInput}
      />
    </label>
  )
}
