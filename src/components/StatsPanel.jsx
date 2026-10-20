import { useState } from 'react'
import { useT } from '../i18n.jsx'

const STATS_COLLAPSED_KEY = 'dji-mission-planner:stats:collapsed'

/**
 * Painel de métricas calculadas, sobreposto ao mapa (canto inferior
 * direito), em três grupos: qualidade (GSD, pegada, espaçamento, disparo),
 * voo (linhas, waypoints, distância, fotos, tempo) e operação (voos, bases,
 * baterias, voo mais longo contra o tempo útil, tempo total). Mostra o
 * separador aberto; os valores perto ou acima de um limite ficam a âmbar ou
 * a vermelho (o preflight tem o aviso completo).
 */

function fmtDist(m) {
  if (m == null) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`
}

/** Duração: «12 min 05 s», ou «17 h 19 min» a partir de uma hora. */
function fmtTime(s) {
  if (!Number.isFinite(s)) return '—'
  const t = Math.round(s)
  if (t >= 3600) {
    const h = Math.floor(t / 3600)
    const min = Math.round((t % 3600) / 60)
    return min === 60 ? `${h + 1} h 00 min` : `${h} h ${String(min).padStart(2, '0')} min`
  }
  return `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, '0')} s`
}

/** mm:ss (ou h:mm:ss) para comparar um voo com o tempo útil da bateria. */
function fmtClock(s) {
  if (!Number.isFinite(s)) return '—'
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const TONE = { ok: 'text-sky-300', near: 'text-amber-300', over: 'text-red-300' }

/** @param {{label: any, value: any, hint?: any, tone?: string, testId?: string}} props */
function Stat({ label, value, hint, tone = 'ok', testId }) {
  // os mosaicos recebem o rato (a dica do `title`); o contentor continua a
  // deixar passar os cliques para o mapa entre eles (M3-U13)
  return (
    <div
      className="pointer-events-auto rounded bg-slate-900/90 px-3 py-2"
      title={hint}
      data-testid={testId}
    >
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`font-mono text-sm ${TONE[tone] ?? TONE.ok}`} data-tone={tone}>
        {value}
      </div>
    </div>
  )
}

function Group({ title, children }) {
  return (
    <>
      <div className="col-span-full mt-1 px-1 text-xs font-semibold uppercase tracking-widest text-slate-400 first:mt-0">
        {title}
      </div>
      {children}
    </>
  )
}

/** Rótulo e valor do «nº de linhas» de cada modo. */
function countOf(missionMode, stats) {
  if (!stats) return { key: 'stats.lines', value: '—' }
  if (stats.circleCount != null) return { key: 'stats.circles', value: stats.circleCount }
  if (missionMode === 'orbit' && stats.levelCount != null)
    return { key: 'stats.levels', value: stats.levelCount }
  if ((missionMode === 'face' || missionMode === 'corridor') && stats.passCount != null)
    return { key: 'stats.passes', value: stats.passCount }
  return { key: 'stats.lines', value: stats.lineCount ?? '—' }
}

export default function StatsPanel({
  missionMode = 'area',
  gsd,
  gimbalPitch = -90,
  footprint,
  spacing,
  pointDensity,
  interval,
  triggerMode,
  speed,
  stats,
  ops = null,
  shutterWarn = false,
  baseDistance,
  uncertainty = null,
}) {
  const t = useT()
  // a fachada e a órbita têm geometria própria: o GSD vem do plano delas, e
  // a pegada, o espaçamento e o intervalo das grelhas não se aplicam
  const gridMode =
    missionMode === 'area' || missionMode === 'circular' || missionMode === 'corridor'
  const count = countOf(missionMode, stats)
  // recolhível (M3-U23): 16 mosaicos tapam ~450 px do mapa num tablet
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STATS_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(STATS_COLLAPSED_KEY, v ? '0' : '1')
      } catch {
        /* sem armazenamento: fica só nesta sessão */
      }
      return !v
    })
  }
  const toggleBtn = (
    <button
      type="button"
      data-testid="stats-toggle"
      onClick={toggle}
      aria-expanded={!collapsed}
      className="pointer-events-auto col-span-full justify-self-end rounded border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
    >
      {collapsed ? t('stats.show') : t('stats.hide')}
    </button>
  )
  if (collapsed)
    return (
      <div
        data-testid="stats-panel"
        className="pointer-events-none absolute bottom-4 right-4 z-[1000] grid"
      >
        {toggleBtn}
      </div>
    )
  return (
    <div
      data-testid="stats-panel"
      className="pointer-events-none absolute bottom-4 right-4 z-[1000] grid max-w-md grid-cols-2 gap-1.5 sm:grid-cols-3"
    >
      {toggleBtn}
      <Group title={t('stats.groupQuality')}>
        {pointDensity != null ? (
          <Stat
            label={t('stats.density')}
            value={`${Math.round(pointDensity.mean ?? pointDensity.overlap)} (${Math.round(pointDensity.single)}) pts/m²`}
            hint={t('stats.densityHint')}
          />
        ) : gridMode ? (
          <Stat
            label={t(gimbalPitch === -90 ? 'stats.gsd' : 'stats.gsdCentre')}
            value={
              gsd != null
                ? uncertainty?.gsd
                  ? `${gsd.toFixed(2)} (${uncertainty.gsd[0].toFixed(2)}–${uncertainty.gsd[1].toFixed(2)}) cm/px`
                  : `${gsd.toFixed(2)} cm/px`
                : t('stats.gsdOblique')
            }
            hint={
              gimbalPitch === -90
                ? uncertainty?.gsd
                  ? t('stats.gsdRangeHint')
                  : undefined
                : t('stats.gsdCentreHint')
            }
          />
        ) : (
          <Stat
            label={t('stats.gsd')}
            value={Number.isFinite(stats?.gsdCm) ? `${stats.gsdCm.toFixed(2)} cm/px` : '—'}
          />
        )}
        {missionMode === 'area' && uncertainty?.front && uncertainty?.side && (
          <Stat
            label={t('stats.overlapRange')}
            value={`${Math.round(uncertainty.front[0])}–${Math.round(uncertainty.front[1])} / ${Math.round(uncertainty.side[0])}–${Math.round(uncertainty.side[1])} %`}
            hint={t('stats.overlapRangeHint')}
          />
        )}
        {gridMode && (
          <>
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
            <Stat
              label={t('stats.spacing')}
              value={spacing != null ? `${spacing.toFixed(1)} m` : '—'}
            />
            <Stat
              label={t('stats.interval')}
              value={
                interval != null
                  ? triggerMode === 'time'
                    ? `${(interval / speed).toFixed(1)} s`
                    : `${interval.toFixed(1)} m`
                  : '—'
              }
              tone={shutterWarn ? 'near' : 'ok'}
              hint={shutterWarn ? t('stats.intervalWarnHint') : undefined}
              testId="stats-interval"
            />
          </>
        )}
      </Group>

      <Group title={t('stats.groupFlight')}>
        {Number.isFinite(stats?.areaHa) && (
          <Stat label={t('stats.area')} value={`${stats.areaHa.toFixed(2)} ha`} />
        )}
        <Stat label={t(count.key)} value={count.value} />
        <Stat label={t('stats.waypoints')} value={stats?.waypointCount ?? '—'} />
        <Stat label={t('stats.totalDist')} value={stats ? fmtDist(stats.pathLengthM) : '—'} />
        <Stat
          label={t('stats.photos')}
          value={
            stats?.photoCountArea != null
              ? `${stats.photoCount} (${stats.photoCountArea})`
              : (stats?.photoCount ?? '—')
          }
          hint={stats?.photoCountArea != null ? t('stats.photosHint') : undefined}
        />
        <Stat label={t('stats.time')} value={stats ? fmtTime(stats.flightTimeS) : '—'} />
        {baseDistance != null && (
          <Stat
            label={t('stats.baseToArea')}
            value={baseDistance === 0 ? t('stats.insideArea') : fmtDist(baseDistance)}
          />
        )}
      </Group>

      {ops && (
        <Group title={t('stats.groupOps')}>
          <Stat
            testId="stats-flights"
            label={t('stats.flights')}
            value={
              ops.bases > 0
                ? t('stats.flightsBases', { n: ops.flights, b: ops.bases })
                : String(ops.flights)
            }
          />
          <Stat
            testId="stats-sets"
            label={t('stats.batteries')}
            value={
              ops.sets == null
                ? t('stats.setsNeeded', { n: ops.flights })
                : t('stats.setsVs', { n: ops.flights, s: ops.sets })
            }
            tone={ops.short ? 'near' : 'ok'}
            hint={ops.short ? t('stats.setsShortHint') : undefined}
          />
          <Stat
            testId="stats-longest"
            label={t(ops.flights > 1 ? 'stats.longest' : 'stats.vsBattery')}
            value={`${ops.flights > 1 && ops.longest.label ? `${ops.longest.label} ` : ''}${fmtClock(ops.longest.timeS)}${
              ops.usefulS ? ` / ${fmtClock(ops.usefulS)}` : ''
            }`}
            tone={ops.level}
            hint={t('stats.longestHint')}
          />
          {ops.flights > 1 && (
            <Stat
              testId="stats-total"
              label={t('stats.totalTime')}
              value={fmtTime(ops.totalS)}
              hint={t('stats.totalTimeHint')}
            />
          )}
        </Group>
      )}
    </div>
  )
}
