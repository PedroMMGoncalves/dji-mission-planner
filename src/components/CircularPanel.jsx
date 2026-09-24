import { useT } from '../i18n.jsx'
import { IconDownload, IconTrash } from './Icons.jsx'
import { MAX_CIRCLES } from '../utils/circular.js'

/**
 * Painel do modo circular («circlegrammetry»): a área é o polígono do modo
 * Área; aqui só o raio, a sobreposição entre círculos, o gimbal, a
 * velocidade, as estatísticas e a exportação. Geometria em utils/circular.js.
 */

function Field({ label, suffix, children }) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-300">
      <span className="flex-1">{label}</span>
      {children}
      {suffix && <span className="w-8 text-xs text-slate-500">{suffix}</span>}
    </label>
  )
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number"
      className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function Section({ title, children }) {
  return (
    <div className="border-b border-slate-800 px-4 py-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-sky-400">
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function CircularPanel({
  circularConfig,
  setCircularParam,
  circularPlan,
  advice,
  blocks,
  usableMin,
  triggerWarn,
  altitude,
  frontOverlap,
  areaStats,
  areaKind,
  terrainFollow,
  setTerrainFollow,
  terrainReady,
  mode,
  draftCount,
  hasRing,
  onStartDraw,
  onUndoVertex,
  onFinishDraw,
  onClear,
  onExportSingle,
  onExportBlocks,
}) {
  const t = useT()
  const drawing = mode === 'draw'
  const stats = circularPlan && !circularPlan.error ? circularPlan.stats : null
  const errorKey = circularPlan?.error ? `ci.err.${circularPlan.error}` : null
  const pitchAbs = Math.abs(circularConfig.gimbalPitch)
  const axisGroundM = pitchAbs > 0 ? altitude / Math.tan((pitchAbs * Math.PI) / 180) : Infinity

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 lg:w-96">
      {/* Área: o mesmo polígono do modo Área */}
      <Section title={t('ci.area.title')}>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={drawing ? onFinishDraw : onStartDraw}
            className={`rounded px-2 py-2 text-sm font-medium transition-colors ${
              drawing
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {drawing ? t('ci.area.finish') : t('ci.area.draw')}
          </button>
          <button
            onClick={drawing ? onUndoVertex : onClear}
            disabled={drawing ? draftCount === 0 : !hasRing}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {drawing ? (
              t('ci.area.undo')
            ) : (
              <>
                <IconTrash /> {t('ci.area.clear')}
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {drawing
            ? t('ci.area.hint', { n: draftCount })
            : hasRing
              ? t('ci.area.shared')
              : t('ci.area.none')}
        </p>
      </Section>

      {/* Círculos */}
      <Section title={t('ci.params.title')}>
        <Field label={t('ci.params.radius')} suffix="m">
          <NumberInput
            value={circularConfig.radiusM}
            min={5}
            max={500}
            step={5}
            onChange={(v) => setCircularParam('radiusM', Math.max(5, Math.min(500, v)))}
          />
        </Field>
        <Field label={t('ci.params.overlap')} suffix="%">
          <NumberInput
            value={circularConfig.overlapPct}
            min={0}
            max={90}
            step={1}
            onChange={(v) => setCircularParam('overlapPct', Math.max(0, Math.min(90, v)))}
          />
        </Field>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
          {t('ci.params.overlapHint')}
        </p>
        {advice && (
          <div
            className="mb-3 rounded border border-sky-900/60 bg-sky-950/30 p-2 text-[11px] leading-relaxed text-sky-200"
            data-testid="circular-advice"
          >
            {t('ci.advice', {
              p: circularConfig.overlapPct,
              cols: advice.cols,
              rows: advice.rows,
              n: advice.count,
              min: advice.minPct,
              max: advice.maxPct,
            })}
            {advice.maxPct !== circularConfig.overlapPct && (
              <button
                onClick={() => setCircularParam('overlapPct', advice.maxPct)}
                className="ml-2 rounded bg-sky-800/70 px-1.5 py-0.5 font-semibold text-sky-100 hover:bg-sky-700"
              >
                {t('ci.adviceApply', { max: advice.maxPct })}
              </button>
            )}
          </div>
        )}
        <Field label={t('ci.params.pitch')} suffix="°">
          <NumberInput
            value={circularConfig.gimbalPitch}
            min={-90}
            max={-20}
            step={5}
            onChange={(v) => setCircularParam('gimbalPitch', Math.max(-90, Math.min(-20, v)))}
          />
        </Field>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
          {t('ci.params.pitchHint', {
            d: Number.isFinite(axisGroundM) ? Math.round(axisGroundM) : '∞',
          })}
        </p>
        {triggerWarn && (
          <p className="mb-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            ⚠{' '}
            {t('cp.flight.triggerFast', {
              s: triggerWarn.actualS.toFixed(2),
              min: triggerWarn.minS.toFixed(1),
              vmax: triggerWarn.maxSpeed.toFixed(1),
            })}
          </p>
        )}
        <Field label={t('ci.params.speed')} suffix="m/s">
          <NumberInput
            value={circularConfig.speedMS}
            min={1}
            max={15}
            step={0.5}
            onChange={(v) => setCircularParam('speedMS', Math.max(1, Math.min(15, v)))}
          />
        </Field>
        <Field label={t('ci.params.angle')} suffix="°">
          <input
            type="number"
            className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            value={circularConfig.angleDeg ?? ''}
            placeholder={t('ci.params.angleAuto')}
            min={0}
            max={179}
            step={1}
            onChange={(e) =>
              setCircularParam(
                'angleDeg',
                e.target.value === '' ? null : ((Number(e.target.value) % 180) + 180) % 180,
              )
            }
          />
        </Field>
        <p className="text-[11px] leading-relaxed text-slate-500">
          {t('ci.params.altitudeNote', { h: altitude, f: frontOverlap })}
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(terrainFollow?.enabled)}
            disabled={!terrainReady}
            onChange={(e) => setTerrainFollow((f) => ({ ...f, enabled: e.target.checked }))}
          />
          {t('ci.terrain.follow')}
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t('ci.terrain.hint')}</p>
      </Section>

      {/* Plano e exportação */}
      <Section title={t('ci.plan.title')}>
        {errorKey && (
          <p className="mb-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
            ⚠ {t(errorKey, { n: circularPlan.count ?? '', max: MAX_CIRCLES })}
          </p>
        )}
        {!hasRing && !errorKey && <p className="text-xs text-slate-500">{t('ci.area.none')}</p>}
        {stats && (
          <div className="space-y-1 font-mono text-xs text-slate-300">
            <p>{t('ci.plan.circles', { n: stats.circleCount, pts: stats.pointsPerCircle })}</p>
            <p>{t('ci.plan.photos', { n: stats.photoCount })}</p>
            <p>
              {t('ci.plan.extension', {
                a: Math.round(stats.extensionAlongM),
                b: Math.round(stats.extensionAcrossM),
              })}
            </p>
            {stats.gsdCm != null && <p>{t('ci.plan.gsd', { v: stats.gsdCm.toFixed(2) })}</p>}
            <p>
              {t('ci.plan.path', { km: (stats.pathLengthM / 1000).toFixed(2) })} ·{' '}
              {t('ci.plan.time', { min: Math.round((stats.flightTimeS ?? 0) / 60) })}
            </p>
            {stats.path3D && (
              <p className="text-slate-400">
                {t('ci.plan.terrain', { n: stats.terrainMissing ?? 0 })}
              </p>
            )}
            {areaStats && Number.isFinite(areaStats.flightTimeS) && (
              <p className="text-slate-400">
                {t('ci.plan.vsArea', {
                  kind: t(
                    areaKind === 'crosshatch' ? 'ci.plan.kindCrosshatch' : 'ci.plan.kindSerpentine',
                  ),
                  min: Math.round(areaStats.flightTimeS / 60),
                })}
              </p>
            )}
            {blocks?.length > 1 && usableMin != null && (
              <p className="text-slate-400">
                {t('ci.plan.blocks', { n: blocks.length, min: Math.round(usableMin) })}
              </p>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-1 gap-2">
          <button
            onClick={onExportSingle}
            disabled={!stats}
            className="flex items-center justify-center gap-1.5 rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('ci.exportSingle')}
          </button>
          <button
            onClick={onExportBlocks}
            disabled={!stats || !(blocks?.length > 1)}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('ci.exportBlocks')}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{t('ci.exportHint')}</p>
      </Section>
    </div>
  )
}
