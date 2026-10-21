import { useId, useState } from 'react'
import { useT } from '../i18n.jsx'
import { rangeText, tCount } from '../i18n/format.js'
import { CARD, ICON_BUTTON, Icon, PILL, useMedia, useToggleFocus } from './MapOverlay.jsx'

const STATS_COLLAPSED_KEY = 'dji-mission-planner:stats:collapsed'

/**
 * Cartão de métricas calculadas, opaco, à direita do mapa: em cima o voo
 * mais longo com uma barra contra o tempo útil da bateria, e depois três
 * grupos, rótulo à esquerda e valor à direita — qualidade (GSD, pegada,
 * espaçamento, disparo), voo (área, faixas, waypoints, distância, fotos,
 * tempo) e operação (voos, bases, baterias, tempo total). Mostra o separador
 * aberto; os valores perto ou acima de um limite ficam a âmbar ou a vermelho
 * (o preflight tem o aviso completo). Recolhe-se num botão com o GSD e os
 * voos; a escolha fica neste aparelho, e sem ela o cartão começa recolhido
 * num mapa estreito (até 1179 px de janela, onde aberto tapa meio mapa) e
 * aberto nos outros. Sem plano não aparece. `cardRef` é o do cartão aberto:
 * o enquadramento da área fica à esquerda dele.
 */

// os três formatos servem também os resumos dos painéis da face, da órbita,
// do corredor e do circular: os mesmos números, escritos da mesma maneira

/** Distância: «266.3 m», ou «31.38 km» a partir de um quilómetro. */
export function fmtDist(m) {
  if (m == null) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`
}

/** Duração: «12 min 05 s», ou «17 h 19 min» a partir de uma hora. */
export function fmtTime(s) {
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
export function fmtClock(s) {
  if (!Number.isFinite(s)) return '—'
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const TONE = { ok: '', near: 'text-amber-300', over: 'text-red-300' }
const BAR = { ok: 'bg-sky-400', near: 'bg-amber-500', over: 'bg-red-400' }

/**
 * Uma linha: o rótulo à esquerda, o valor à direita (com um complemento a
 * cinzento, p. ex. o intervalo do GSD). A dica do `title` explica o número.
 * @param {{label: any, value: any, extra?: any, hint?: any, tone?: string, testId?: string}} props
 */
function Row({ label, value, extra = null, hint, tone = 'ok', testId }) {
  return (
    <div
      className="flex min-h-[26px] items-baseline justify-between gap-3 text-[12.5px]"
      title={hint}
      data-testid={testId}
    >
      <span className="text-slate-300">{label}</span>
      <span
        className={`whitespace-nowrap text-right tabular-nums ${TONE[tone] ?? TONE.ok}`}
        data-tone={tone}
      >
        {value}
        {extra != null && extra !== '' && <span className="text-slate-400">{extra}</span>}
      </span>
    </div>
  )
}

function Group({ title, first = false, children }) {
  return (
    <div className={`px-3.5 pb-1.5 pt-2.5 ${first ? '' : 'border-t border-slate-800'}`}>
      <div className="mb-1 text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] text-slate-400">
        {title}
      </div>
      {children}
    </div>
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
  // segundos do disparo por tempo como vão para o ficheiro (por defeito à
  // décima; o arredondamento ao mais próximo podia mostrar 2,2 s e escrever 2,1 s)
  intervalS = null,
  // intervalo escrito pelo piloto, e não calculado pela sobreposição
  intervalManual = false,
  triggerMode,
  speed,
  stats,
  ops = null,
  shutterWarn = false,
  baseDistance,
  uncertainty = null,
  cardRef = null,
}) {
  const t = useT()
  const bodyId = useId()
  // recolhível (M3-U23): num tablet o cartão tapa meio mapa. A escolha do
  // operador ('1' recolhido, '0' aberto) manda; sem ela, decide a largura:
  // recolhido num mapa estreito
  const narrow = useMedia('(max-width: 1179px)')
  const [chosen, setChosen] = useState(() => {
    try {
      const v = localStorage.getItem(STATS_COLLAPSED_KEY)
      return v === '1' ? true : v === '0' ? false : null
    } catch {
      return null
    }
  })
  const collapsed = chosen ?? narrow
  const { ref: toggleRef, mark: markToggle } = useToggleFocus(collapsed)
  // sem plano não há números: nada de traços por cima do mapa
  if (!stats) return null
  const toggle = () => {
    const next = !collapsed
    markToggle()
    try {
      localStorage.setItem(STATS_COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      /* sem armazenamento: fica só nesta sessão */
    }
    setChosen(next)
  }
  // a fachada e a órbita têm geometria própria: o GSD vem do plano delas, e
  // a pegada, o espaçamento e o intervalo das grelhas não se aplicam
  const gridMode =
    missionMode === 'area' || missionMode === 'circular' || missionMode === 'corridor'
  // os valores são os do separador aberto (src/mission/qualityStats.js): uma
  // métrica que o modo não tem fica de fora, em vez de «—» ou do número da
  // área; na área mostra-se tudo, como sempre
  const omit = (v) => missionMode !== 'area' && v == null
  const count = countOf(missionMode, stats)
  // o intervalo [pior, melhor] do GSD só quando, a 2 casas, ainda é um
  // intervalo: com RTK e terreno plano as pontas caíam no próprio valor e
  // o cartão dizia «2.69 (2.69–2.69)»
  const f2 = (v) => v.toFixed(2)
  const gsdRange =
    gsd != null && uncertainty?.gsd ? rangeText(uncertainty.gsd[0], uncertainty.gsd[1], f2) : null
  const gsdRangeShown = gsdRange != null && gsdRange !== f2(gsd) ? gsdRange : null
  const density =
    pointDensity != null ? Math.round(pointDensity.mean ?? pointDensity.overlap) : null
  const modeGsd = Number.isFinite(stats.gsdCm) ? `${stats.gsdCm.toFixed(2)} cm/px` : null

  if (collapsed) {
    // recolhido: o essencial no próprio botão (o GSD, ou a densidade LiDAR, e os voos)
    const quality =
      density != null
        ? `${density} pts/m²`
        : gridMode
          ? gsd != null
            ? `${f2(gsd)} cm/px`
            : null
          : modeGsd
    const parts = [
      quality,
      ops ? tCount(t, 'stats.flightsN', ops.flights, { n: ops.flights }) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <div data-testid="stats-panel" className="pointer-events-auto">
        <button
          type="button"
          ref={toggleRef}
          data-testid="stats-toggle"
          onClick={toggle}
          aria-expanded="false"
          aria-controls={bodyId}
          title={t('stats.show')}
          className={PILL}
        >
          <Icon d="M3 3v18h18M8 17v-5M13 17V8M18 17v-8" className="text-sky-300" />
          {t('stats.title')}
          {parts && <span className="text-slate-400">· {parts}</span>}
          <Icon d="m6 9 6 6 6-6" className="text-slate-400" />
        </button>
      </div>
    )
  }

  const pct = ops?.longestFrac != null ? Math.round(ops.longestFrac * 100) : null
  const level = ops?.level ?? 'ok'
  return (
    <section
      ref={cardRef}
      data-testid="stats-panel"
      aria-labelledby="stats-title"
      className={`pointer-events-auto flex max-h-full min-h-0 w-72 flex-col overflow-hidden ${CARD}`}
    >
      <div className="flex shrink-0 items-center border-b border-slate-800 py-2 pl-3.5 pr-2">
        <h2 id="stats-title" className="m-0 flex-1 text-[13.5px] font-semibold">
          {t('stats.title')}
        </h2>
        <button
          type="button"
          ref={toggleRef}
          data-testid="stats-toggle"
          onClick={toggle}
          aria-expanded="true"
          aria-controls={bodyId}
          aria-label={t('stats.hide')}
          title={t('stats.hide')}
          className={`h-8 w-8 ${ICON_BUTTON}`}
        >
          <Icon d="m18 15-6-6-6 6" />
        </button>
      </div>

      <div id={bodyId} className="min-h-0 overflow-y-auto pb-1.5">
        {/* o voo mais longo (ou o único) contra o tempo útil da bateria */}
        {ops && (
          <div
            data-testid="stats-longest"
            title={t('stats.longestHint')}
            className="border-b border-slate-800 px-3.5 py-3"
          >
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-slate-300">
                {ops.flights > 1
                  ? ops.longest.label
                    ? t('stats.longestOf', { label: ops.longest.label })
                    : t('stats.longest')
                  : t('stats.vsBattery')}
              </span>
              <span
                className={`whitespace-nowrap text-sm font-semibold tabular-nums ${TONE[level] ?? TONE.ok}`}
                data-tone={level}
              >
                {fmtClock(ops.longest.timeS)}
                {ops.usefulS ? (
                  <span className="text-[12.5px] font-normal text-slate-400">
                    {' '}
                    {t('stats.ofUseful', { u: fmtClock(ops.usefulS) })}
                  </span>
                ) : null}
              </span>
            </div>
            {pct != null && (
              <>
                <div
                  aria-hidden="true"
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"
                >
                  <div
                    className={`h-full rounded-full ${BAR[level] ?? BAR.ok}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[11.5px] leading-tight text-slate-400">
                  {t('stats.usefulPct', { p: pct })}
                </div>
              </>
            )}
          </div>
        )}

        <Group title={t('stats.groupQuality')} first>
          {density != null ? (
            <Row
              label={t('stats.density')}
              value={`${density} pts/m²`}
              extra={` (${Math.round(pointDensity.single)})`}
              hint={t('stats.densityHint')}
            />
          ) : gridMode ? (
            !omit(gsd) && (
              <Row
                label={t(gimbalPitch === -90 ? 'stats.gsd' : 'stats.gsdCentre')}
                value={gsd != null ? `${f2(gsd)} cm/px` : t('stats.gsdOblique')}
                extra={gsd != null && gsdRangeShown ? ` (${gsdRangeShown})` : null}
                hint={
                  gimbalPitch === -90
                    ? gsdRangeShown
                      ? t('stats.gsdRangeHint')
                      : undefined
                    : t('stats.gsdCentreHint')
                }
              />
            )
          ) : (
            <Row label={t('stats.gsd')} value={modeGsd ?? '—'} />
          )}
          {missionMode === 'area' && uncertainty?.front && uncertainty?.side && (
            <Row
              label={t('stats.overlapRange')}
              value={`${rangeText(uncertainty.front[0], uncertainty.front[1], Math.round)} / ${rangeText(uncertainty.side[0], uncertainty.side[1], Math.round)} %`}
              hint={t('stats.overlapRangeHint')}
            />
          )}
          {gridMode && (
            <>
              {!omit(footprint) && (
                <Row
                  label={t('stats.footprint')}
                  value={
                    footprint
                      ? footprint.along != null
                        ? `${footprint.across.toFixed(0)} × ${footprint.along.toFixed(0)} m`
                        : t('stats.swath', { v: footprint.across.toFixed(0) })
                      : '—'
                  }
                />
              )}
              {!omit(spacing) && (
                <Row
                  label={t('stats.spacing')}
                  value={spacing != null ? `${spacing.toFixed(1)} m` : '—'}
                />
              )}
              {!omit(interval) && (
                <Row
                  label={t('stats.interval')}
                  value={
                    interval != null
                      ? triggerMode === 'time'
                        ? `${(intervalS ?? Math.floor((interval / speed) * 10 + 1e-9) / 10).toFixed(1)} s`
                        : `${interval.toFixed(1)} m`
                      : '—'
                  }
                  extra={
                    interval != null && intervalManual ? ` · ${t('stats.intervalManual')}` : null
                  }
                  tone={shutterWarn ? 'near' : 'ok'}
                  hint={shutterWarn ? t('stats.intervalWarnHint') : undefined}
                  testId="stats-interval"
                />
              )}
            </>
          )}
        </Group>

        <Group title={t('stats.groupFlight')}>
          {Number.isFinite(stats.areaHa) && (
            <Row label={t('stats.area')} value={`${stats.areaHa.toFixed(2)} ha`} />
          )}
          <Row label={t(count.key)} value={count.value} />
          <Row label={t('stats.waypoints')} value={stats.waypointCount ?? '—'} />
          <Row label={t('stats.totalDist')} value={fmtDist(stats.pathLengthM)} />
          <Row
            label={t('stats.photos')}
            value={stats.photoCount ?? '—'}
            extra={stats.photoCountArea != null ? ` (${stats.photoCountArea})` : null}
            hint={stats.photoCountArea != null ? t('stats.photosHint') : undefined}
          />
          <Row
            label={t('stats.missionTime')}
            value={fmtTime(stats.flightTimeS)}
            hint={t('stats.time')}
          />
          {baseDistance != null && (
            <Row
              label={t('stats.baseToArea')}
              value={baseDistance === 0 ? t('stats.insideArea') : fmtDist(baseDistance)}
            />
          )}
        </Group>

        {ops && (
          <Group title={t('stats.groupOps')}>
            <Row
              testId="stats-flights"
              label={t('stats.flights')}
              value={String(ops.flights)}
              extra={
                ops.bases > 0
                  ? ` · ${tCount(t, 'stats.basesN', ops.bases, { b: ops.bases })}`
                  : null
              }
            />
            <Row
              testId="stats-sets"
              label={t('stats.batteries')}
              value={
                ops.sets == null
                  ? tCount(t, 'stats.setsNeeded', ops.flights, { n: ops.flights })
                  : tCount(t, 'stats.setsVs', ops.flights, { n: ops.flights, s: ops.sets })
              }
              tone={ops.short ? 'near' : 'ok'}
              hint={ops.short ? t('stats.setsShortHint') : undefined}
            />
            {ops.flights > 1 && (
              <Row
                testId="stats-total"
                label={t('stats.totalTime')}
                value={fmtTime(ops.totalS)}
                hint={t('stats.totalTimeHint')}
              />
            )}
          </Group>
        )}
      </div>
    </section>
  )
}
