import { useT } from '../i18n.jsx'
import { IconDownload, IconTarget, IconTrash } from './Icons.jsx'

/**
 * E1.2: painel do modo órbita (círculos multi-nível em torno de um POI).
 * Toda a matemática vive em orbit.js; aqui só parâmetros, estatísticas e
 * exportação (missão única ou um KMZ por nível).
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

export default function OrbitPanel({
  orbitConfig,
  setOrbitParam,
  orbitPlan,
  cameraOk,
  gsdAtRadius,
  onGsdTarget,
  mode,
  onStartPoi,
  onClearPoi,
  onExportSingle,
  onExportPerLevel,
}) {
  const t = useT()
  const stats = orbitPlan && !orbitPlan.error ? orbitPlan.stats : null

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 lg:w-96">
      {/* POI */}
      <Section title={t('op.poi.title')}>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onStartPoi}
            className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-medium transition-colors ${
              mode === 'orbit'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <IconTarget /> {t('op.poi.mark')}
          </button>
          <button
            onClick={onClearPoi}
            disabled={!orbitConfig.poi}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-red-900/60 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconTrash /> {t('op.poi.clear')}
          </button>
        </div>
        {mode === 'orbit' && <p className="mt-2 text-xs text-slate-400">{t('op.poi.hint')}</p>}
        {orbitConfig.poi && (
          <p className="mt-1.5 font-mono text-[11px] text-slate-400">
            {orbitConfig.poi[1].toFixed(6)}, {orbitConfig.poi[0].toFixed(6)}
          </p>
        )}
        <Field label={t('op.poi.height')} suffix="m">
          <NumberInput
            value={orbitConfig.poiHeightM}
            min={-50}
            max={300}
            onChange={(v) => setOrbitParam('poiHeightM', v)}
          />
        </Field>
        <p className="text-[11px] leading-relaxed text-slate-500">{t('op.poi.heightHint')}</p>
      </Section>

      {/* Geometria */}
      <Section title={t('op.geom.title')}>
        <Field label={t('op.geom.radius')} suffix="m">
          <NumberInput
            value={orbitConfig.radiusM}
            min={5}
            max={500}
            onChange={(v) => setOrbitParam('radiusM', v)}
          />
        </Field>
        {cameraOk && gsdAtRadius != null && (
          <Field label={t('op.geom.gsdTarget')} suffix="cm/px">
            <NumberInput
              value={Number(gsdAtRadius.toFixed(2))}
              min={0.1}
              step={0.1}
              onChange={onGsdTarget}
            />
          </Field>
        )}
        <Field label={t('op.geom.levels')}>
          <NumberInput
            value={orbitConfig.levelCount}
            min={1}
            max={12}
            onChange={(v) => setOrbitParam('levelCount', Math.round(v))}
          />
        </Field>
        <Field label={t('op.geom.firstLevel')} suffix="m">
          <NumberInput
            value={orbitConfig.levelStartM}
            min={2}
            max={300}
            onChange={(v) => setOrbitParam('levelStartM', v)}
          />
        </Field>
        <Field label={t('op.geom.step')} suffix="m">
          <NumberInput
            value={orbitConfig.levelStepM}
            min={1}
            max={100}
            onChange={(v) => setOrbitParam('levelStepM', v)}
          />
        </Field>
        <Field label={t('op.geom.overlap')} suffix="%">
          <NumberInput
            value={orbitConfig.horizontalOverlapPct}
            min={0}
            max={95}
            onChange={(v) => setOrbitParam('horizontalOverlapPct', v)}
          />
        </Field>
        <label className="mt-1 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={orbitConfig.clockwise}
            onChange={(e) => setOrbitParam('clockwise', e.target.checked)}
          />
          {t('op.geom.clockwise')}
        </label>
        {!cameraOk && (
          <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[11px] leading-relaxed text-amber-200">
            ⚠ {t('op.lidarNote')}
          </p>
        )}
      </Section>

      {/* Plano e exportação */}
      <Section title={t('op.plan.title')}>
        {!orbitConfig.poi && (
          <p className="text-xs leading-relaxed text-slate-500">{t('op.plan.noPoi')}</p>
        )}
        {stats && (
          <div className="space-y-1 font-mono text-xs text-slate-300">
            <p>{t('op.plan.rings', { n: stats.levelCount, pts: stats.pointsPerOrbit })}</p>
            <p>{t('op.plan.photos', { n: stats.photoCount })}</p>
            {stats.gsdCm != null && <p>{t('op.plan.gsd', { v: stats.gsdCm.toFixed(2) })}</p>}
            <p>
              {t('op.plan.path', { km: (stats.pathLengthM / 1000).toFixed(2) })} ·{' '}
              {t('op.plan.time', { min: Math.round((stats.flightTimeS ?? 0) / 60) })}
            </p>
            {orbitPlan.perLevel && (
              <p className="text-slate-400">
                {t('op.plan.gimbals', {
                  v: orbitPlan.perLevel.map((l) => `${l.gimbalPitch}°`).join(' / '),
                })}
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
            <IconDownload /> {t('op.exportSingle')}
          </button>
          <button
            onClick={onExportPerLevel}
            disabled={!stats || stats.levelCount < 2}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload /> {t('op.exportPerLevel')}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{t('op.exportHint')}</p>
      </Section>
    </div>
  )
}
