import { useT } from '../i18n.jsx'
import { IconCheck, IconDownload, IconPolygon, IconTrash } from './Icons.jsx'

/**
 * E1.1: painel do modo fachada (serpentina vertical). Toda a matemática vive
 * em faceMode.js; aqui só parâmetros, estatísticas, avisos e exportação.
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

export default function FacePanel({
  faceConfig,
  setFaceParam,
  facePlan,
  faceClearance,
  dsmLoaded,
  cameraOk,
  mode,
  draftCount,
  onStartDraw,
  onUndoVertex,
  onFinishDraw,
  onClearBaseline,
  onExport,
}) {
  const t = useT()
  const stats = facePlan && !facePlan.error ? facePlan.stats : null

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 lg:w-96">
      {/* Baseline (pé da face) */}
      <Section title={t('fp.baseline.title')}>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onStartDraw}
            className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-medium transition-colors ${
              mode === 'face'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconPolygon /> {t('fp.baseline.draw')}
          </button>
          <button
            onClick={onClearBaseline}
            disabled={!faceConfig.baseline && draftCount === 0}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-red-900/60 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconTrash /> {t('fp.baseline.clear')}
          </button>
        </div>
        {mode === 'face' && (
          <div className="mt-2 space-y-2">
            <p className="text-xs leading-relaxed text-slate-400">
              {t('fp.baseline.hint', { n: draftCount })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onUndoVertex}
                disabled={draftCount === 0}
                className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↩ {t('fp.baseline.undo')}
              </button>
              <button
                onClick={onFinishDraw}
                disabled={draftCount < 2}
                className="flex items-center justify-center gap-1.5 rounded bg-emerald-600 px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconCheck /> {t('fp.baseline.finish')}
              </button>
            </div>
          </div>
        )}
        {!cameraOk && (
          <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            ⚠ {t('fp.cameraRequired')}
          </p>
        )}
      </Section>

      {/* Parâmetros da face */}
      <Section title={t('fp.params.title')}>
        <Field label={t('fp.params.height')} suffix="m">
          <NumberInput
            value={faceConfig.heightM}
            min={2}
            max={500}
            onChange={(v) => setFaceParam('heightM', v)}
          />
        </Field>
        <Field label={t('fp.params.standoff')} suffix="m">
          <NumberInput
            value={faceConfig.standoffM}
            min={5}
            max={200}
            onChange={(v) => setFaceParam('standoffM', v)}
          />
        </Field>
        <Field label={t('fp.params.side')}>
          <select
            className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            value={faceConfig.side}
            onChange={(e) => setFaceParam('side', e.target.value)}
          >
            <option value="left">{t('fp.params.sideLeft')}</option>
            <option value="right">{t('fp.params.sideRight')}</option>
          </select>
        </Field>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-500">{t('fp.params.sideHint')}</p>
        <Field label={t('fp.params.vOverlap')} suffix="%">
          <NumberInput
            value={faceConfig.verticalOverlapPct}
            min={0}
            max={95}
            onChange={(v) => setFaceParam('verticalOverlapPct', v)}
          />
        </Field>
        <Field label={t('fp.params.hOverlap')} suffix="%">
          <NumberInput
            value={faceConfig.horizontalOverlapPct}
            min={0}
            max={95}
            onChange={(v) => setFaceParam('horizontalOverlapPct', v)}
          />
        </Field>
        <Field label={t('fp.params.gimbal')} suffix="°">
          <NumberInput
            value={faceConfig.gimbalPitch}
            min={-90}
            max={45}
            step={5}
            onChange={(v) => setFaceParam('gimbalPitch', v)}
          />
        </Field>
        <Field label={t('fp.params.minClearance')} suffix="m">
          <NumberInput
            value={faceConfig.minClearanceM}
            min={2}
            max={100}
            onChange={(v) => setFaceParam('minClearanceM', v)}
          />
        </Field>
        <Field label={t('fp.params.speed')} suffix="m/s">
          <NumberInput
            value={faceConfig.speedMS}
            min={1}
            max={10}
            step={0.5}
            onChange={(v) => setFaceParam('speedMS', Math.max(1, Math.min(10, v)))}
          />
        </Field>
      </Section>

      {/* Plano e avisos */}
      <Section title={t('fp.plan.title')}>
        {!faceConfig.baseline && (
          <p className="text-xs leading-relaxed text-slate-500">{t('fp.plan.noBaseline')}</p>
        )}
        {facePlan?.error && (
          <p className="rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
            ⚠ {t(`fp.error.${facePlan.error}`)}
          </p>
        )}
        {stats && (
          <div className="space-y-1 font-mono text-xs text-slate-300">
            <p>{t('fp.plan.passes', { n: stats.passCount, pts: stats.pointsPerPass })}</p>
            <p>{t('fp.plan.photos', { n: stats.photoCount })}</p>
            <p>
              {t('fp.plan.gsd', { v: stats.gsdCm?.toFixed(2) })} ·{' '}
              {t('fp.plan.vstep', { v: (stats.vStepM ?? stats.imageHeightM).toFixed(1) })}
            </p>
            <p>
              {t('fp.plan.path', { km: (stats.pathLengthM / 1000).toFixed(2) })} ·{' '}
              {t('fp.plan.time', { min: Math.round((stats.flightTimeS ?? 0) / 60) })}
            </p>
          </div>
        )}

        {stats && !dsmLoaded && (
          <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            ⚠ {t('fp.warn.unverified')}
          </p>
        )}
        {stats && dsmLoaded && faceClearance && !faceClearance.ok && (
          <p className="mt-2 rounded border border-red-800/60 bg-red-950/40 p-2 text-[11px] leading-relaxed text-red-200">
            ⚠{' '}
            {t('fp.warn.clearance', {
              passes: faceClearance.passes.join(', '),
              min: faceClearance.minClearanceM,
            })}
          </p>
        )}
        {stats && dsmLoaded && faceClearance?.ok && (
          <p className="mt-2 rounded border border-emerald-800 bg-emerald-950/40 p-2 text-[11px] leading-relaxed text-emerald-200">
            {t('fp.warn.clearanceOk', { min: faceClearance.minClearanceM })}
          </p>
        )}
        {stats && dsmLoaded && faceClearance == null && (
          <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            ⚠ {t('fp.warn.noData')}
          </p>
        )}

        <button
          onClick={onExport}
          disabled={!stats}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconDownload /> {t('fp.export')}
        </button>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{t('fp.exportHint')}</p>
      </Section>
    </div>
  )
}
