import { useT } from '../i18n.jsx'

/**
 * Nota branda quando a missão precisa de mais voos do que os conjuntos de
 * baterias que a equipa tem (flightsVsSets, mission/equipment.js). Só
 * aparece com a contagem conhecida — não bloqueia nada: recarregar no campo
 * é uma opção.
 * @param {{check: {flights: number, sets: number|null, short: boolean}|null, battery: string}} props
 */
export default function BatterySetsNote({ check, battery }) {
  const t = useT()
  if (!check?.short) return null
  return (
    <p
      data-testid="sets-note"
      className="mt-2 rounded border border-slate-700 bg-slate-800/60 p-2 text-[11px] leading-relaxed text-slate-300"
    >
      {t('sets.short', { flights: check.flights, sets: check.sets, battery })}
    </p>
  )
}
