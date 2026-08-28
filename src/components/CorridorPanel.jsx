import { useT } from '../i18n.jsx'
import { IconDownload, IconTrash } from './Icons.jsx'

/**
 * E5.1: painel do modo corredor (cobertura de infraestruturas lineares a
 * partir de um eixo desenhado). Toda a geometria vive em corridor.js; aqui
 * só parâmetros, estatísticas e exportação.
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

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  )
}

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '—')

function duration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CorridorPanel({
  corridorConfig,
  setCorridorParam,
  corridorPlan,
  sensorType,
  mode,
  onStartAxis,
  onFinishAxis,
  onUndoAxisPoint,
  onClearAxis,
  draftCount,
  onExport,
}) {
  const t = useT()
  const drawing = mode === 'corridor'
  // O corredor com LiDAR é um caso de uso real (linhas eléctricas, condutas):
  // o espaçamento sai da largura de varrimento do feixe e a missão não leva
  // acções de câmara. Não é um erro — só não tem disparo para configurar.
  const isLidar = sensorType === 'lidar'
  const axis = corridorConfig.centreline
  const stats = corridorPlan && !corridorPlan.error ? corridorPlan.stats : null
  const errorKey = corridorPlan?.error ? `co.err.${corridorPlan.error}` : null
  // Vêm do motor, já separadas. A subtração que aqui estava (runCount −
  // passCount) anulava uma passagem partida contra uma perdida e calava o
  // aviso justamente quando havia cobertura em falta.
  const splitPasses = stats?.splitPasses ?? 0
  const droppedPasses = stats?.droppedPasses ?? 0

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 lg:w-96">
      <Section title={t('co.axis.title')}>
        {isLidar && (
          <p className="mb-2 rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-400">
            {t('co.lidarNote')}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={drawing ? onFinishAxis : onStartAxis}
            className={`rounded px-2 py-2 text-sm font-medium transition-colors ${
              drawing ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {drawing ? t('co.axis.finish') : t('co.axis.draw')}
          </button>
          <button
            onClick={drawing ? onUndoAxisPoint : onClearAxis}
            disabled={drawing ? draftCount === 0 : !axis}
            className="flex items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {drawing ? t('co.axis.undo') : (<><IconTrash /> {t('co.axis.clear')}</>)}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {drawing
            ? t('co.axis.hint', { n: draftCount })
            : axis
              ? t('co.axis.hint', { n: axis.length })
              : t('co.axis.none')}
        </p>
      </Section>

      <Section title={t('co.params.title')}>
        <Field label={t('co.params.buffer')} suffix="m">
          <NumberInput
            value={corridorConfig.bufferM}
            onChange={(v) => setCorridorParam('bufferM', v)}
            min={1}
            max={5000}
            step={5}
          />
        </Field>
        <p className="mb-3 text-xs text-slate-500">{t('co.params.bufferHint')}</p>

        <Field label={t('co.params.speed')} suffix="m/s">
          <NumberInput
            value={corridorConfig.speedMS}
            onChange={(v) => setCorridorParam('speedMS', v)}
            min={0.5}
            max={25}
            step={0.5}
          />
        </Field>

        {!isLidar && (
          <>
            <div className="mb-2 text-sm text-slate-300">{t('co.params.photoMode')}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ['distance', 'co.params.photoDistance'],
                ['waypoint', 'co.params.photoWaypoint'],
              ].map(([id, key]) => (
                <button
                  key={id}
                  onClick={() => setCorridorParam('photoMode', id)}
                  className={`rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                    corridorConfig.photoMode === id
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{t('co.params.photoHint')}</p>
          </>
        )}
      </Section>

      <Section title={t('co.plan.title')}>
        {errorKey && (
          <p className="mb-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
            ⚠ {t(errorKey)}
          </p>
        )}
        {!axis && !errorKey && <p className="text-xs text-slate-500">{t('co.axis.none')}</p>}
        {stats && (
          <div className="space-y-1.5">
            <Row label={t('co.plan.length')} value={`${fmt(stats.corridorLengthM)} m`} />
            <Row
              label={t('co.plan.passes', { n: stats.passCount, r: stats.runCount })}
              value={`${fmt(stats.spacingM, 1)} m`}
            />
            <Row
              label={droppedPasses > 0 ? t('co.plan.widthRequested') : t('co.plan.width')}
              value={`${fmt(stats.coveredWidthM)} m`}
            />
            <Row label={t('co.plan.waypoints', { n: stats.waypointCount })} value={stats.waypointCount} />
            {stats.photoCount != null && (
              <Row label={t('co.plan.photos', { n: stats.photoCount })} value={stats.photoCount} />
            )}
            <Row label={t('co.plan.distance')} value={`${fmt(stats.pathLengthM)} m`} />
            <Row label={t('co.plan.time')} value={duration(stats.flightTimeS)} />
            {droppedPasses > 0 && (
              <p className="mt-2 rounded border border-red-800 bg-red-950/50 p-2 text-xs leading-relaxed text-red-300">
                ⚠ {t('co.plan.dropped', { n: droppedPasses })}
              </p>
            )}
            {splitPasses > 0 && (
              <p className="mt-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">
                ⚠ {t('co.plan.split', { n: splitPasses })}
              </p>
            )}
            <button
              onClick={onExport}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              <IconDownload /> {t('co.plan.export')}
            </button>
          </div>
        )}
      </Section>
    </div>
  )
}
