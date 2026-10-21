import { useId, useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { MAX_CIRCLES } from '../utils/circular.js'
import { terrainErrorText as terrainErrText } from '../utils/appError.js'
import AircraftPicker, { aircraftSummary } from './AircraftPicker.jsx'
import NumberInput from './NumberInput.jsx'
import BatterySetsNote from './BatterySetsNote.jsx'
import { fmtDist, fmtTime } from './StatsPanel.jsx'
import { Icon } from './MapOverlay.jsx'
import { IconFolder, IconMountain, IconTrash, IconWarning } from './Icons.jsx'
import { Section } from './ui/Section.jsx'
import { Button } from './ui/Button.jsx'
import { Field, fieldInput } from './ui/Field.jsx'
import {
  DrawControls,
  ExportButton,
  ExportRow,
  FlightBar,
  Grid,
  Hint,
  KeyLine,
  LongestBadge,
  ModePanel,
  Note,
  Part,
  PreflightRow,
  PreflightStatus,
  Readout,
  Rows,
  SafetyBlock,
  StatusBadge,
  StatusDone,
  Switch,
  Tiles,
  boldText,
  preflightState,
  rthHeight,
  safetySummary,
  signedText,
  speedUnit,
  useOpenSection,
} from './ModePanel.jsx'

/**
 * Painel do modo circular («circlegrammetry»), em sete secções pela ordem
 * do trabalho: aeronave e sensor, a área (o polígono do modo Área), os
 * círculos (com o número que dão e o conselho da sobreposição), os
 * parâmetros de voo e o relevo, os voos e as baterias, as acções de
 * segurança e o resumo com a exportação. Geometria em utils/circular.js.
 */

/** Mensagem de um erro do seguimento de terreno do circular. */
function terrainErrorText(res, t) {
  const key = `ci.terrain.err.${res.error}`
  const msg = t(key, { n: res.emptyCircles ?? '' })
  return msg === key ? String(res.error) : msg
}

export default function CircularPanel({
  // grupos do App: hw (useHardware), circular (useCircularMission),
  // terrainState (useTerrain) e geom (useAreaGeometry)
  hw,
  circular,
  terrainState,
  geom,
  circularConfig,
  setsCheck = null,
  batteryLabel = '',
  // altura e sobreposição frontal que o circular usa (as suas ou as da área)
  altitude,
  frontOverlap,
  // as da área, para começar nelas ao ligar as próprias
  areaParams = null,
  areaStats,
  areaKind,
  terrainReady,
  mode,
  draftCount,
  hasRing,
  onUndoVertex,
  onExportSingle,
  // a dica do botão de exportar do cabeçalho: é o mesmo botão
  exportTitle = undefined,
  onExportBlocks,
  exportBlocked = false,
  // acções de segurança da missão (fim, sinal perdido): src/mission/safety.js
  safety = null,
  setSafety = (_next) => {},
  rthInfo = null,
  onRemove,
  // o resumo: os números do cartão de métricas (useMissionOps), os itens do
  // preflight e o botão que abre a lista dele
  ops = null,
  preflight = [],
  onShowPreflight = null,
}) {
  // aeronave e sensor do projecto (a mesma escolha do cartão 1 da área)
  const { drone = null, setDrone = null, sensor = null, speedRange = { min: 1, max: 15 } } = hw
  const {
    setCircularParam,
    circularPlan,
    circularAdvice: advice,
    circularBlocks: blocks,
    circularUsableMin: usableMin,
    circularTriggerWarn: triggerWarn,
    circularTerrain = null,
    circularCovers = false,
  } = circular
  const {
    terrain,
    terrainFollow,
    setTerrainFollow,
    handleLoadTerrain: onLoadTerrain,
    handleImportDem: onImportDem,
  } = terrainState
  // o polígono é o do modo Área: desenhar, acabar e limpar são os dele
  const { startDraw: onStartDraw, handleFinishDraw: onFinishDraw, clearAll: onClear } = geom
  const t = useT()
  const demFileRef = useRef(null)
  const howId = useId()
  // «Como funciona»: a conta do passo entre centros, que o conselho encurtou
  const [howOpen, setHowOpen] = useState(false)
  const section = useOpenSection(hasRing ? 'circular-2' : 'circular-1')
  const pf = preflightState(preflight)
  const drawing = mode === 'draw'
  const stats = circularPlan && !circularPlan.error ? circularPlan.stats : null
  const errorKey = circularPlan?.error ? `ci.err.${circularPlan.error}` : null
  const errorText = errorKey ? t(errorKey, { n: circularPlan.count ?? '', max: MAX_CIRCLES }) : null
  // quanto os círculos saem da área, no conselho da sobreposição
  const extAlong = stats ? Math.round(stats.extensionAlongM) : '—'
  const extAcross = stats ? Math.round(stats.extensionAcrossM) : '—'
  // «Como funciona», no fim do conselho (ou sozinho, sem ele)
  const howLink = (
    <button
      type="button"
      aria-expanded={howOpen}
      aria-controls={howId}
      onClick={() => setHowOpen((v) => !v)}
      className="rounded text-left text-[12.5px] text-sky-300 underline underline-offset-2 hover:text-sky-200"
    >
      {t('ci.params.how')}
    </button>
  )
  const pitchAbs = Math.abs(circularConfig.gimbalPitch)
  const axisGroundM = pitchAbs > 0 ? altitude / Math.tan((pitchAbs * Math.PI) / 180) : Infinity
  const nBlocks = blocks?.length > 1 ? blocks.length : 0
  const usable = usableMin != null ? Math.round(usableMin) : '—'
  const areaHa = stats?.areaHa ?? areaStats?.areaHa ?? null
  const own = circularConfig.ownParams === true
  const terrainSource =
    terrain?.status === 'ready'
      ? terrain.data?.source === 'file'
        ? `${t('cp.terrain.localDem')} ${terrain.data.label}`
        : t('co.terrain.global')
      : terrain?.status === 'loading'
        ? t('cp.terrain.loading')
        : t('co.terrain.noTerrain')

  return (
    <ModePanel
      title={t('mode.circular')}
      description={t('ci.panel.description')}
      label={t('ci.panel.label')}
    >
      {drone && setDrone && (
        <Section
          n={1}
          title={t('ap.title')}
          summary={aircraftSummary(t, drone, sensor, 'focal')}
          {...section('circular-aeronave')}
        >
          <AircraftPicker drone={drone} setDrone={setDrone} sensor={sensor} />
        </Section>
      )}

      {/* a área: o mesmo polígono do modo Área */}
      <Section
        n={2}
        title={t('ci.area.title')}
        summary={
          drawing
            ? tCount(t, 'mp.drawingN', draftCount, { n: draftCount })
            : hasRing
              ? areaHa != null
                ? t('ci.area.summary', { ha: areaHa.toFixed(2) })
                : t('ci.area.summaryShared')
              : t('mp.toDraw')
        }
        status={hasRing && !drawing ? <StatusDone label={t('mp.ready')} /> : null}
        {...section('circular-1')}
      >
        {hasRing && (
          <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
            <span className="text-slate-100">
              {t('ci.area.shared')} <span className="text-slate-400">· {t('ci.area.tab')}</span>
            </span>
            {areaHa != null && (
              <span className="font-semibold tabular-nums text-slate-100">
                {areaHa.toFixed(2)} ha
              </span>
            )}
          </div>
        )}
        <DrawControls
          label={t('cp.area.polygon')}
          title={t('cp.area.polygonTitle')}
          icon={<Icon size={15} sw={1.8} d="M12 2.5 21.5 9.4 17.9 20.5H6.1L2.5 9.4z" />}
          drawing={drawing}
          onDraw={onStartDraw}
          clearLabel={t('cp.area.clear')}
          onClear={onClear}
          clearDisabled={!hasRing && draftCount === 0}
          count={draftCount}
          hint={t('ci.area.hint')}
          onUndo={onUndoVertex}
          onFinish={onFinishDraw}
          minVertices={3}
        />
        {!drawing && <Hint>{t(hasRing ? 'ci.area.sharedHint' : 'ci.area.none')}</Hint>}
      </Section>

      {/* os círculos: raio, sobreposição e azimute, e o número que dão */}
      <Section
        n={3}
        title={t('ci.params.title')}
        summary={
          stats
            ? t('ci.params.summary', {
                n: stats.circleCount,
                r: circularConfig.radiusM,
                o: circularConfig.overlapPct,
              })
            : t('ci.params.summaryNone', {
                r: circularConfig.radiusM,
                o: circularConfig.overlapPct,
              })
        }
        status={
          errorText ? (
            <StatusBadge
              tone="block"
              icon={<IconWarning className="h-3 w-3" />}
              value="1"
              label={errorText}
            />
          ) : stats ? (
            <StatusDone label={t('mp.ready')} />
          ) : null
        }
        {...section('circular-2')}
      >
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-end gap-3">
          <Field label={t('ci.params.radius')} unit="m">
            <NumberInput
              value={circularConfig.radiusM}
              min={5}
              max={500}
              step={5}
              className={fieldInput}
              onChange={(v) => setCircularParam('radiusM', Math.max(5, Math.min(500, v)))}
            />
          </Field>
          <Field label={t('ci.params.overlap')} unit={t('ci.params.overlapUnit')}>
            <NumberInput
              value={circularConfig.overlapPct}
              min={0}
              max={90}
              step={1}
              className={fieldInput}
              onChange={(v) => setCircularParam('overlapPct', Math.max(0, Math.min(90, v)))}
            />
          </Field>
          <Field label={t('ci.params.angle')} unit="°">
            <input
              type="number"
              className={fieldInput}
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
          <Readout
            label={t('ci.params.step')}
            value={stats ? `${Math.round(stats.stepM)} m` : '—'}
            extra={t('ci.params.stepFormula', { p: circularConfig.overlapPct })}
          />
        </div>
        {errorText && <Note tone="block">{errorText}</Note>}
        {advice && (
          <Note
            tone="result"
            testId="circular-advice"
            lead={t('ci.advice.lead', { cols: advice.cols, rows: advice.rows, n: advice.count })}
          >
            {t(advice.minPct === advice.maxPct ? 'ci.adviceExact' : 'ci.advice', {
              p: circularConfig.overlapPct,
              min: advice.minPct,
              max: advice.maxPct,
              a: extAlong,
              b: extAcross,
              ext: stats ? t('ci.plan.extension', { a: extAlong, b: extAcross }) : '',
            })}
            {advice.maxPct !== circularConfig.overlapPct && (
              <button
                type="button"
                onClick={() => setCircularParam('overlapPct', advice.maxPct)}
                className="ml-1.5 rounded-md bg-sky-900/70 px-1.5 py-0.5 font-semibold text-sky-100 transition-colors hover:bg-sky-800"
              >
                {t('ci.adviceApply', { max: advice.maxPct })}
              </button>
            )}{' '}
            {howLink}
          </Note>
        )}
        {!advice && <div>{howLink}</div>}
        <p id={howId} hidden={!howOpen} className="text-xs leading-normal text-slate-300">
          {t('ci.params.overlapHint')}
        </p>
      </Section>

      {/* parâmetros de voo: gimbal, velocidade, altura e sobreposição, relevo */}
      <Section
        n={4}
        title={t('cards.flight')}
        summary={t('ci.flight.summary', {
          p: signedText(circularConfig.gimbalPitch),
          v: circularConfig.speedMS,
          h: altitude,
          f: frontOverlap,
        })}
        status={
          terrainFollow?.enabled && circularTerrain?.error ? (
            <StatusBadge
              tone="block"
              icon={<IconWarning className="h-3 w-3" />}
              value="1"
              label={terrainErrorText(circularTerrain, t)}
            />
          ) : null
        }
        {...section('circular-voo')}
      >
        <Part>
          <Grid>
            <Field label={t('ci.params.pitch')} unit={t('ci.params.pitchUnit')}>
              <NumberInput
                value={circularConfig.gimbalPitch}
                min={-90}
                max={-20}
                step={5}
                className={fieldInput}
                onChange={(v) => setCircularParam('gimbalPitch', Math.max(-90, Math.min(-20, v)))}
              />
            </Field>
            <Field label={t('ci.params.speed')} unit={speedUnit(t, speedRange.min, speedRange.max)}>
              <NumberInput
                value={circularConfig.speedMS}
                min={1}
                max={15}
                step={0.5}
                className={fieldInput}
                onChange={(v) => setCircularParam('speedMS', Math.max(1, Math.min(15, v)))}
              />
            </Field>
          </Grid>
          <Hint>
            {t('ci.params.pitchHint', {
              d: Number.isFinite(axisGroundM) ? Math.round(axisGroundM) : '∞',
            })}
          </Hint>
          {stats?.gsdCm != null && (
            <KeyLine label={t('ci.plan.gsdLabel')} value={`${stats.gsdCm.toFixed(2)} cm/px`} />
          )}
        </Part>
        {triggerWarn && (
          <Note tone="warn">
            {t('cp.flight.triggerFast', {
              s: triggerWarn.actualS.toFixed(2),
              min: triggerWarn.minS.toFixed(1),
              vmax: triggerWarn.maxSpeed.toFixed(1),
            })}
          </Note>
        )}
        <Part>
          {/* altura e sobreposição frontal próprias, ou as do separador Área */}
          <Switch
            label={t('ci.params.own')}
            checked={own}
            testId="circular-own-params"
            onChange={(on) => {
              // ao ligar, começa nos valores da área
              if (on && areaParams) {
                setCircularParam('altitude', areaParams.altitude)
                setCircularParam('frontOverlap', areaParams.frontOverlap)
              }
              setCircularParam('ownParams', on)
            }}
          />
          {own ? (
            <>
              <Grid>
                <Field label={t('ci.params.altitude')} unit="m">
                  <NumberInput
                    value={circularConfig.altitude}
                    min={5}
                    max={1500}
                    className={fieldInput}
                    onChange={(v) => setCircularParam('altitude', Math.max(5, Math.min(1500, v)))}
                  />
                </Field>
                <Field label={t('ci.params.frontOverlap')} unit="%">
                  <NumberInput
                    value={circularConfig.frontOverlap}
                    min={10}
                    max={95}
                    className={fieldInput}
                    onChange={(v) =>
                      setCircularParam('frontOverlap', Math.max(10, Math.min(95, v)))
                    }
                  />
                </Field>
              </Grid>
              <Hint>{t('ci.params.ownHint')}</Hint>
            </>
          ) : (
            <Note tone="neutral">
              {t('co.params.fromArea')} {boldText(t('co.params.fromAreaHeight'), [`${altitude} m`])}
              {' · '}
              {boldText(t('ci.params.fromAreaFront'), [`${frontOverlap} %`])}
            </Note>
          )}
        </Part>
        <Part divided>
          <Switch
            label={t('mp.followTerrain')}
            extra={t('ci.terrain.followWhat')}
            checked={Boolean(terrainFollow?.enabled)}
            // ligar exige relevo que cubra os círculos; desligar, nunca
            disabled={!terrainFollow?.enabled && !(terrainReady && circularCovers)}
            onChange={(on) => setTerrainFollow((f) => ({ ...f, enabled: on }))}
          />
          <Hint>{t('ci.terrain.hint')}</Hint>
          {terrainReady && stats && !circularCovers && (
            <Note tone="warn">{t('ci.terrain.outOfCoverage')}</Note>
          )}
          {terrainFollow?.enabled && circularTerrain?.error && (
            <Note tone="block">{terrainErrorText(circularTerrain, t)}</Note>
          )}
          {stats?.path3D && (
            <Note tone="neutral">{t('ci.plan.terrain', { n: stats.terrainMissing ?? 0 })}</Note>
          )}
          <div className="flex flex-col gap-2.5 rounded-[9px] border border-slate-800 bg-sunken p-3">
            <div className="flex items-start gap-2.5">
              <IconMountain className="mt-px h-[18px] w-[18px] flex-none text-sky-300" />
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-slate-100 [overflow-wrap:anywhere]">
                  {terrainSource}
                </div>
                {terrain?.status === 'ready' && (
                  <div className="mt-0.5 text-xs leading-normal text-slate-300">
                    {t('ci.terrain.shared')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                size="md"
                className="w-full"
                onClick={onLoadTerrain}
                disabled={!hasRing || terrain?.status === 'loading'}
                icon={<IconMountain className="h-3.5 w-3.5" />}
              >
                {terrain?.status === 'loading'
                  ? t('cp.terrain.loading')
                  : t('cp.terrain.downloadGlobal')}
              </Button>
              <Button
                size="md"
                className="w-full"
                onClick={() => demFileRef.current?.click()}
                disabled={!hasRing || terrain?.status === 'loading'}
                title={t('cp.terrain.importDemTitle')}
                icon={<IconFolder className="h-3.5 w-3.5" />}
              >
                {t('cp.terrain.importDem')}
              </Button>
              <input
                ref={demFileRef}
                type="file"
                accept=".tif,.tiff"
                className="hidden"
                onChange={(e) => {
                  onImportDem(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          {terrain?.status === 'error' && (
            <Note tone="block">{terrainErrText(terrain.error, t)}</Note>
          )}
        </Part>
      </Section>

      {/* voos e baterias: os blocos de círculos que cabem no tempo útil */}
      <Section
        n={5}
        title={t('ci.blocks.title')}
        summary={
          nBlocks
            ? t('ci.blocks.count', { n: nBlocks })
            : stats
              ? t('ci.blocks.one')
              : t('mp.noPlan')
        }
        status={
          stats && ops?.longestFrac != null ? (
            <LongestBadge
              ops={ops}
              label={t('mp.longestBadge', { p: Math.round(ops.longestFrac * 100) })}
            />
          ) : null
        }
        {...section('circular-voos')}
      >
        {stats ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13.5px] text-slate-100">
                {nBlocks ? t('ci.blocks.count', { n: nBlocks }) : t('ci.blocks.one')}
              </span>
              <span className="text-[12.5px] tabular-nums text-slate-400">
                {t('ci.blocks.usable', { min: usable })}
              </span>
            </div>
            <FlightBar
              ops={ops}
              label={nBlocks ? t('ci.blocks.longest') : null}
              margin={t('ci.blocks.margin')}
            />
            <Hint>{t('ci.blocks.hint')}</Hint>
            {ops && (
              <Rows
                rows={[
                  [t('mp.tile.totalTime'), fmtTime(ops.totalS)],
                  [
                    t('cards.summary.sets'),
                    tCount(t, 'stats.setsNeeded', ops.flights, { n: ops.flights }),
                  ],
                ]}
              />
            )}
            <BatterySetsNote check={setsCheck} battery={batteryLabel} />
          </>
        ) : (
          <Hint>{t('ci.blocks.hint')}</Hint>
        )}
      </Section>

      <Section
        n={6}
        title={t('safety.title')}
        summary={[safetySummary(t, safety), rthHeight(rthInfo)].filter(Boolean).join(' · ')}
        {...section('circular-seguranca')}
      >
        <SafetyBlock safety={safety} setSafety={setSafety} rthInfo={rthInfo} />
      </Section>

      {/* resumo e exportar: missão única (a do cabeçalho) ou um KMZ por bloco */}
      <Section
        n={7}
        title={t('cards.summary')}
        summary={
          stats
            ? [
                tCount(t, 'mp.photosN', stats.photoCount, { n: stats.photoCount }),
                fmtTime(ops?.totalS ?? stats.flightTimeS),
              ].join(' · ')
            : t('mp.noPlan')
        }
        status={stats ? <PreflightStatus state={pf} /> : null}
        {...section('circular-4')}
      >
        {errorText && <Note tone="block">{errorText}</Note>}
        {!hasRing && !errorKey && <Hint>{t('ci.area.none')}</Hint>}
        {stats && (
          <>
            <Tiles
              tiles={[
                {
                  label: t('stats.circles'),
                  value: stats.circleCount,
                  sub: t('ci.tile.circlesSub', { pts: stats.pointsPerCircle }),
                  testId: 'circular-circles',
                },
                {
                  label: t('stats.photos'),
                  value: stats.photoCount,
                  sub: t('mp.tile.photosOne'),
                },
                {
                  label: t('mp.tile.totalTime'),
                  value: fmtTime(ops?.totalS ?? stats.flightTimeS),
                  sub: nBlocks ? t('ci.tile.blocks', { n: nBlocks }) : t('ci.blocks.one'),
                },
                {
                  label: t('mp.tile.path'),
                  value: fmtDist(stats.pathLengthM),
                  sub: tCount(t, 'mp.waypointsN', stats.waypointCount, {
                    n: stats.waypointCount,
                  }),
                },
              ]}
            />
            <Rows
              rows={[
                ...(stats.gsdCm != null
                  ? [[t('ci.plan.gsdLabel'), `${stats.gsdCm.toFixed(2)} cm/px`]]
                  : []),
                ...(areaHa != null ? [[t('stats.area'), `${areaHa.toFixed(2)} ha`]] : []),
                ...(areaStats && Number.isFinite(areaStats.flightTimeS)
                  ? [
                      [
                        t('ci.plan.vsAreaLabel', {
                          kind: t(
                            areaKind === 'crosshatch'
                              ? 'ci.plan.kindCrosshatch'
                              : 'ci.plan.kindSerpentine',
                          ),
                        }),
                        t('ci.plan.vsAreaValue', {
                          min: Math.round(areaStats.flightTimeS / 60),
                        }),
                      ],
                    ]
                  : []),
              ]}
            />
          </>
        )}
        <PreflightRow state={stats ? pf : null} onShow={onShowPreflight} />
        {exportBlocked && <Note tone="block">{t('app.exportBlockedHint')}</Note>}
        <ExportButton
          onClick={onExportSingle}
          disabled={!stats || exportBlocked}
          title={exportTitle}
        />
        <ExportRow
          label={t('ci.exportBlocks')}
          description={
            nBlocks ? t('ci.blocksExport.desc', { n: nBlocks }) : t('ci.blocksExport.one')
          }
          onClick={onExportBlocks}
          disabled={!stats || !(blocks?.length > 1) || exportBlocked}
        />
        <Hint>{t('ci.exportHint')}</Hint>
        {onRemove && (
          <Part divided className="gap-1">
            <Button
              variant="danger"
              size="field"
              className="justify-start self-start px-0.5"
              onClick={onRemove}
              icon={<IconTrash className="h-[15px] w-[15px]" />}
            >
              {t('ci.remove')}
            </Button>
            <Hint>{t('ci.removeHint')}</Hint>
          </Part>
        )}
      </Section>
    </ModePanel>
  )
}
