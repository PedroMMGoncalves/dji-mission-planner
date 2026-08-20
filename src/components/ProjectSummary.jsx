import { useT } from '../i18n.jsx'

/**
 * E3.2: faixa de resumo do projecto quando há mais do que um plano
 * (área/fachada/órbita) — totais de tempo, baterias e fotos.
 */
export default function ProjectSummary({ summary }) {
  const t = useT()
  if (!summary || summary.plans < 2) return null
  const min = Math.round(summary.flightTimeS / 60)
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded border border-slate-700 bg-slate-950/90 px-3 py-1.5 font-mono text-[11px] text-slate-200">
      {t('ps.line', {
        plans: summary.plans,
        min,
        bat: summary.batteries ?? '—',
        photos: summary.photoCount,
      })}
    </div>
  )
}
