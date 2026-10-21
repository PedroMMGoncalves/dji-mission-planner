import { useId } from 'react'
import { useT } from '../i18n.jsx'
import NumberInput from './NumberInput.jsx'
import { IconClose } from './Icons.jsx'
import { Icon } from './MapOverlay.jsx'
import { Hint, signedText } from './ModePanel.jsx'
import { fieldBox, fieldInput } from './ui/Field.jsx'
import { MAX_SHOTS, SHOT_UP_MARGIN_DEG, shotPitches } from '../mission/gimbal.js'

/**
 * Inclinações das «várias inclinações (com paragem)», na órbita e na face:
 * um campo por ângulo, pela ordem de disparo (1 a MAX_SHOTS), entre o limite
 * de baixo do gimbal e o de cima menos SHOT_UP_MARGIN_DEG; acrescentar e
 * retirar ângulos. `pitches` é a lista escrita (null = por omissão: −45°, 0°
 * e o limite de cima menos a margem), `range` o intervalo do gimbal;
 * `levels` (na órbita) diz na dica que são as mesmas em todos os níveis.
 * @param {{pitches: number[]|null, onChange: (list: number[]) => void,
 *   range: {min: number, max: number}|null, testId?: string, levels?: boolean}} props
 */
export default function ShotPitches({
  pitches,
  onChange,
  range,
  testId = 'shot-pitches',
  levels = false,
}) {
  const t = useT()
  const titleId = useId()
  const list = shotPitches(pitches, range)
  const lo = Number.isFinite(range?.min) ? range.min : -90
  const hi = (Number.isFinite(range?.max) ? range.max : 30) - SHOT_UP_MARGIN_DEG
  // um ângulo que ainda não está na lista, para o «+»
  const nextAngle = [0, -90, -30, 15, -60, hi].find((a) => a >= lo && a <= hi && !list.includes(a))
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span id={titleId} className="text-xs text-slate-400">
        {t('shots.title')}
      </span>
      <div role="group" aria-labelledby={titleId} className="grid grid-cols-2 gap-2">
        {list.map((p, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1">
            <label className={`${fieldBox} flex-1 gap-2`}>
              <span
                aria-hidden="true"
                className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#1A2742] text-[11px] font-semibold text-slate-300"
              >
                {i + 1}
              </span>
              <NumberInput
                value={p}
                min={lo}
                max={hi}
                step={5}
                label={t('shots.angle', { n: i + 1 })}
                testId={`${testId}-${i}`}
                className={fieldInput}
                onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
              />
              <span className="flex-none text-[12.5px] text-slate-400">°</span>
            </label>
            {list.length > 1 && (
              <button
                type="button"
                aria-label={t('shots.remove', { n: i + 1 })}
                title={t('shots.remove', { n: i + 1 })}
                className="flex h-10 w-8 flex-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-raised hover:text-slate-100"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                <IconClose className="h-[15px] w-[15px]" />
              </button>
            )}
          </div>
        ))}
        {list.length < MAX_SHOTS && nextAngle != null && (
          <button
            type="button"
            data-testid={`${testId}-add`}
            aria-label={t('shots.addName')}
            title={t('shots.addName')}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2C4A68] text-[13px] font-medium text-sky-300 transition-colors hover:bg-raised"
            onClick={() => onChange([...list, nextAngle])}
          >
            <Icon size={15} d="M12 5v14M5 12h14" />
            {t('shots.add')}
          </button>
        )}
      </div>
      <Hint>
        {t(levels ? 'shots.hintLevels' : 'shots.hint', {
          lo: signedText(lo),
          hi: signedText(hi),
          max: Number.isFinite(range?.max) ? signedText(range.max) : '—',
          n: MAX_SHOTS,
          k: list.length,
        })}
      </Hint>
    </div>
  )
}
