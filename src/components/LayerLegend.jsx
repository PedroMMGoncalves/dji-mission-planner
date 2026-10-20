/**
 * Legenda das camadas do mapa e da vista 3D: uma caixa que se abre e fecha
 * com um botão, com o símbolo de cada camada e uma caixa para a mostrar ou
 * esconder. Só lista as camadas com conteúdo no modo aberto; o estado
 * (aberta, camadas escondidas) é de quem a usa.
 */
import { useT } from '../i18n.jsx'

/** Símbolo da camada: linha, linha tracejada, ponto, marcador ou área. */
function Swatch({ kind, color }) {
  if (kind === 'dot') {
    return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
  }
  if (kind === 'marker') {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rotate-45 border border-slate-900"
        style={{ background: color }}
      />
    )
  }
  if (kind === 'area') {
    return (
      <span
        className="inline-block h-2.5 w-3.5 rounded-sm border-2"
        style={{ borderColor: color, background: `${color}33` }}
      />
    )
  }
  if (kind === 'dashed') {
    return (
      <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
    )
  }
  return <span className="inline-block h-0.5 w-4" style={{ background: color }} />
}

/**
 * @param {{items: Array<{key: string, label: string, kind: string, color: string}>,
 *   hidden: Set<string>, onToggle: (key: string) => void, open: boolean,
 *   onOpenChange: (open: boolean) => void, className?: string, testId?: string}} props
 */
export default function LayerLegend({
  items,
  hidden,
  onToggle,
  open,
  onOpenChange,
  className = '',
  testId = 'layer-legend',
}) {
  const t = useT()
  if (!items?.length) return null
  return (
    <div
      className={`rounded border border-slate-700 bg-slate-950/85 p-1.5 text-xs text-slate-200 shadow-lg ${className}`}
      data-testid={testId}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 font-medium hover:bg-slate-800"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        data-testid={`${testId}-toggle`}
      >
        <span>{t('legend.title')}</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {items.map((it) => (
            <li key={it.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={!hidden.has(it.key)}
                  onChange={() => onToggle(it.key)}
                  data-testid={`${testId}-${it.key}`}
                />
                <span className="flex w-4 justify-center">
                  <Swatch kind={it.kind} color={it.color} />
                </span>
                <span>{it.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
