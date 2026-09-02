/**
 * Preflight no cabeçalho: uma pastilha com o estado (bloqueios / avisos /
 * pronto) e, quando aberta, a lista dos itens. Os itens vêm de
 * src/mission/preflight.js; as mensagens de i18n/dict.preflight.js.
 */
import { useT } from '../i18n.jsx'
import { preflightCounts } from '../mission/preflight.js'

const LEVEL_STYLE = {
  block: 'border-red-800/60 bg-red-950/40 text-red-200',
  warn: 'border-amber-800/60 bg-amber-950/40 text-amber-200',
  info: 'border-slate-700 bg-slate-900 text-slate-300',
}
const LEVEL_MARK = { block: '⛔', warn: '⚠', info: 'ⓘ' }

export function PreflightPill({ items, open, onToggle }) {
  const t = useT()
  const c = preflightCounts(items)
  const tone =
    c.block > 0
      ? 'border-red-700 text-red-200 hover:bg-red-950/60'
      : c.warn > 0
        ? 'border-amber-700 text-amber-200 hover:bg-amber-950/60'
        : 'border-emerald-700 text-emerald-200 hover:bg-emerald-950/60'
  const label =
    c.block > 0 || c.warn > 0
      ? t('preflight.summary', { b: c.block, w: c.warn })
      : t('preflight.ok')
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={t('preflight.pillTitle')}
      data-testid="preflight-pill"
      className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${tone}`}
    >
      {c.block > 0 ? LEVEL_MARK.block : c.warn > 0 ? LEVEL_MARK.warn : '✓'} {t('preflight.title')}
      <span className="text-xs opacity-80">· {label}</span>
    </button>
  )
}

export function PreflightList({ items }) {
  const t = useT()
  return (
    <div data-testid="preflight-list" className="border-b border-slate-800 bg-slate-950 px-4 py-2">
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li
            key={`${it.code}-${i}`}
            data-level={it.level}
            className={`rounded border px-2 py-1 text-[12px] leading-relaxed ${LEVEL_STYLE[it.level]}`}
          >
            {LEVEL_MARK[it.level]} {t(`preflight.${it.code}`, it.params)}
          </li>
        ))}
      </ul>
    </div>
  )
}
