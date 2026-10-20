import { useT } from '../i18n.jsx'
import NumberInput from './NumberInput.jsx'
import { MAX_SHOTS, SHOT_UP_MARGIN_DEG, shotPitches } from '../mission/gimbal.js'

/**
 * Inclinações das «várias inclinações (com paragem)», na órbita e na face:
 * um campo por ângulo, pela ordem de disparo (1 a MAX_SHOTS), entre o limite
 * de baixo do gimbal e o de cima menos SHOT_UP_MARGIN_DEG; acrescentar e
 * retirar ângulos. `pitches` é a lista escrita (null = por omissão: −45°, 0°
 * e o limite de cima menos a margem), `range` o intervalo do gimbal.
 * @param {{pitches: number[]|null, onChange: (list: number[]) => void,
 *   range: {min: number, max: number}|null, testId?: string}} props
 */
export default function ShotPitches({ pitches, onChange, range, testId = 'shot-pitches' }) {
  const t = useT()
  const list = shotPitches(pitches, range)
  const lo = Number.isFinite(range?.min) ? range.min : -90
  const hi = (Number.isFinite(range?.max) ? range.max : 30) - SHOT_UP_MARGIN_DEG
  // um ângulo que ainda não está na lista, para o «+»
  const nextAngle = [0, -90, -30, 15, -60, hi].find((a) => a >= lo && a <= hi && !list.includes(a))
  return (
    <div className="mb-2" data-testid={testId}>
      <p className="mb-1 text-sm text-slate-300">{t('shots.title')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {list.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <NumberInput
              value={p}
              min={lo}
              max={hi}
              step={5}
              label={t('shots.angle', { n: i + 1 })}
              testId={`${testId}-${i}`}
              onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
            />
            <span className="text-xs text-slate-400">°</span>
            {list.length > 1 && (
              <button
                type="button"
                aria-label={t('shots.remove', { n: i + 1 })}
                className="rounded px-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {list.length < MAX_SHOTS && nextAngle != null && (
          <button
            type="button"
            data-testid={`${testId}-add`}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-600 hover:text-sky-200"
            onClick={() => onChange([...list, nextAngle])}
          >
            {t('shots.add')}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {t('shots.hint', { lo, hi, max: Number.isFinite(range?.max) ? range.max : '—' })}
      </p>
    </div>
  )
}
