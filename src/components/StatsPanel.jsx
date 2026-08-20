import { useT } from '../i18n.jsx'

/** Painel de métricas calculadas, sobreposto ao mapa (canto inferior direito). */

function fmtDist(m) {
  if (m == null) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`
}

function fmtTime(s) {
  if (s == null) return '—'
  const min = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${min} min ${sec.toString().padStart(2, '0')} s`
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded bg-slate-900/90 px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-sky-300">{value}</div>
    </div>
  )
}

export default function StatsPanel({ gsd, footprint, spacing, pointDensity, interval, triggerMode, speed, stats, baseDistance, blockCount }) {
  const t = useT()
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] grid max-w-md grid-cols-2 gap-1.5 sm:grid-cols-3">
      {pointDensity != null ? (
        <Stat
          label={t('stats.density')}
          value={`${Math.round(pointDensity.single)} (${Math.round(pointDensity.overlap)}) pts/m²`}
          hint={t('stats.densityHint')}
        />
      ) : (
        <Stat label={t('stats.gsd')} value={gsd != null ? `${gsd.toFixed(2)} cm/px` : '—'} />
      )}
      <Stat
        label={t('stats.footprint')}
        value={
          footprint
            ? footprint.along != null
              ? `${footprint.across.toFixed(0)} × ${footprint.along.toFixed(0)} m`
              : t('stats.swath', { v: footprint.across.toFixed(0) })
            : '—'
        }
      />
      <Stat label={t('stats.spacing')} value={spacing != null ? `${spacing.toFixed(1)} m` : '—'} />
      <Stat
        label={t('stats.interval')}
        value={
          interval != null
            ? triggerMode === 'time'
              ? `${(interval / speed).toFixed(1)} s`
              : `${interval.toFixed(1)} m`
            : '—'
        }
      />
      <Stat label={t('stats.area')} value={stats ? `${stats.areaHa.toFixed(2)} ha` : '—'} />
      <Stat label={t('stats.lines')} value={stats ? stats.lineCount : '—'} />
      <Stat label={t('stats.waypoints')} value={stats ? stats.waypointCount : '—'} />
      <Stat label={t('stats.totalDist')} value={stats ? fmtDist(stats.pathLengthM) : '—'} />
      <Stat label={t('stats.photos')} value={stats?.photoCount ?? '—'} />
      <Stat label={t('stats.time')} value={stats ? fmtTime(stats.flightTimeS) : '—'} />
      {baseDistance != null && (
        <Stat
          label={t('stats.baseToArea')}
          value={baseDistance === 0 ? t('stats.insideArea') : fmtDist(baseDistance)}
        />
      )}
      {blockCount != null && <Stat label={t('stats.blocks')} value={blockCount} />}
    </div>
  )
}
