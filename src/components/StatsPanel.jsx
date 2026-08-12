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

function Stat({ label, value }) {
  return (
    <div className="rounded bg-slate-900/90 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-sky-300">{value}</div>
    </div>
  )
}

export default function StatsPanel({ gsd, footprint, spacing, interval, triggerMode, speed, stats, baseDistance }) {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] grid max-w-md grid-cols-2 gap-1.5 sm:grid-cols-3">
      <Stat label="GSD" value={gsd != null ? `${gsd.toFixed(2)} cm/px` : '—'} />
      <Stat
        label="Pegada no chão"
        value={
          footprint
            ? footprint.along != null
              ? `${footprint.across.toFixed(0)} × ${footprint.along.toFixed(0)} m`
              : `faixa ${footprint.across.toFixed(0)} m`
            : '—'
        }
      />
      <Stat label="Espaç. faixas" value={spacing != null ? `${spacing.toFixed(1)} m` : '—'} />
      <Stat
        label="Intervalo disparo"
        value={
          interval != null
            ? triggerMode === 'time'
              ? `${(interval / speed).toFixed(1)} s`
              : `${interval.toFixed(1)} m`
            : '—'
        }
      />
      <Stat label="Área" value={stats ? `${stats.areaHa.toFixed(2)} ha` : '—'} />
      <Stat label="Nº de faixas" value={stats ? stats.lineCount : '—'} />
      <Stat label="Waypoints" value={stats ? stats.waypointCount : '—'} />
      <Stat label="Distância total" value={stats ? fmtDist(stats.pathLengthM) : '—'} />
      <Stat label="Nº de fotos" value={stats?.photoCount ?? '—'} />
      <Stat label="Tempo estimado" value={stats ? fmtTime(stats.flightTimeS) : '—'} />
      {baseDistance != null && (
        <Stat
          label="Base → área"
          value={baseDistance === 0 ? 'dentro da área' : fmtDist(baseDistance)}
        />
      )}
    </div>
  )
}
