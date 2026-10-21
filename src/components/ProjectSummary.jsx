import { useT } from '../i18n.jsx'

/**
 * E3.2: resumo do projecto quando há mais do que um plano
 * (área/fachada/órbita) — totais de tempo, baterias e fotos. Fica na coluna
 * da direita do mapa, por cima do cartão de métricas (quem a usa posiciona).
 */
export default function ProjectSummary({ summary }) {
  const t = useT()
  if (!summary || summary.plans < 2) return null
  const min = Math.round(summary.flightTimeS / 60)
  return (
    <div className="max-w-72 rounded-[10px] border border-slate-700 bg-slate-900 px-3 py-2 text-[12.5px] tabular-nums leading-snug text-slate-200 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      {t('ps.line', {
        plans: summary.plans,
        min,
        bat: summary.batteries ?? '—',
        photos: summary.photoCount,
      })}
    </div>
  )
}
