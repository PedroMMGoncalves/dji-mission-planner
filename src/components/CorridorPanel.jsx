import { useId, useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { rangeText, tCount } from '../i18n/format.js'
import { FLIGHT_COLORS } from '../hooks/useCorridorMission.js'
import { OPS_NEAR_FRAC } from '../mission/opsSummary.js'
import { computeGSD } from '../utils/geo.js'
import { errorText, terrainErrorText as terrainErrText } from '../utils/appError.js'
import AircraftPicker, { aircraftSummary } from './AircraftPicker.jsx'
import NumberInput from './NumberInput.jsx'
import { fmtClock, fmtDist, fmtTime } from './StatsPanel.jsx'
import { Icon } from './MapOverlay.jsx'
import {
  IconChart,
  IconFolder,
  IconHelipad,
  IconMountain,
  IconTrash,
  IconWarning,
} from './Icons.jsx'
import { MoreButton, Section } from './ui/Section.jsx'
import { Button } from './ui/Button.jsx'
import { Field, fieldBox, fieldInput } from './ui/Field.jsx'
import { Table } from './ui/Table.jsx'
import {
  DrawControls,
  ExportButton,
  FlightBar,
  Grid,
  Hint,
  InlineField,
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
  Tiles,
  ToolButton,
  boldText,
  joinList,
  preflightState,
  rthHeight,
  safetySummary,
  speedUnit,
  useOpenSection,
} from './ModePanel.jsx'
import { Segmented } from './ui/Segmented.jsx'
import { Switch } from './ui/Switch.jsx'

/**
 * E5.1: painel do modo corredor (cobertura de infraestruturas lineares a
 * partir de um eixo desenhado), em sete secções pela ordem do trabalho:
 * aeronave e sensor, o eixo e a largura (com as passagens que dão), os
 * parâmetros de voo, o relevo, os voos e as bases, as acções de segurança e
 * o resumo com a exportação. Toda a geometria vive em corridor.js.
 */

/** Mensagem de um erro do seguimento de terreno; o texto cru quando não há tradução. */
function terrainErrorText(code, t) {
  const key = `co.terrain.err.${code}`
  const msg = t(key)
  return msg === key ? String(code) : msg
}

/** Tinta legível sobre a cor de uma base: as cores alternam claras e escuras (bases.js). */
const baseInk = (index) => (index % 2 ? '#FFFFFF' : '#0A0F1C')

/** O rótulo de uma base, num círculo da cor dela. */
function BaseBadge({ row, size = 'h-5 w-5 text-[11px]' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center rounded-full font-bold ${size}`}
      style={{ background: row?.color ?? '#27354F', color: row ? baseInk(row.index) : '#E6EDF7' }}
    >
      {row?.label ?? '—'}
    </span>
  )
}

export default function CorridorPanel({
  // grupos do App: hw (useHardware), corridor (useCorridorMission),
  // corridorOnTerrain (useCorridorRoute), terrainState (useTerrain) e
  // baseActions (useBaseActions)
  hw,
  corridor,
  corridorOnTerrain,
  terrainState,
  baseActions,
  corridorConfig,
  sensorType,
  mode,
  onUndoAxisPoint,
  draftCount,
  onExport,
  // a dica do botão de exportar do cabeçalho: é o mesmo botão
  exportTitle = undefined,
  exportBlocked = false,
  // acções de segurança da missão (fim, sinal perdido): src/mission/safety.js
  safety = null,
  setSafety = (_next) => {},
  rthInfo = null,
  // altitude e sobreposições do separador Área, que o corredor usa (M3-U7)
  areaParams = null,
  onShowProfile,
  // o resumo: os números do cartão de métricas (useMissionOps), cada voo
  // com o seu trânsito, os itens do preflight e o botão que abre a lista dele
  ops = null,
  flightOps = null,
  preflight = [],
  onShowPreflight = null,
}) {
  const {
    // aeronave e sensor do projecto (a mesma escolha do cartão 1 da área)
    drone = null,
    setDrone = null,
    sensor = null,
    // tempo útil por voo (min), para o resumo dos voos
    batteryMin: usableMin = null,
    speedRange = { min: 1, max: 15 },
  } = hw
  const {
    corridorTriggerWarn: triggerWarn,
    setCorridorParam,
    startCorridorDraw: onStartAxis,
    handleFinishCorridor: onFinishAxis,
    clearCorridorAxis: onClearAxis,
    // divisão em voos (useCorridorMission): os voos, ou o erro
    corridorSplit = null,
    // altura, sobreposições e intervalo que o corredor usa (os seus ou os da área)
    corridorFlight = null,
  } = corridor
  const {
    corridorRoute: corridorPlan,
    corridorCovers,
    corridorTerrain,
    corridorReference,
    // o que onExport escreve: um KMZ, ou um ZIP com um KMZ por voo
    corridorExportKind = 'kmz',
  } = corridorOnTerrain
  // relevo e seguimento de terreno (partilhados com a área)
  const {
    terrain,
    terrainFollow,
    setTerrainFollow,
    handleLoadTerrain: onLoadTerrain,
    handleImportDem: onImportDem,
  } = terrainState
  const { startBase: onStartBase, removeBaseById, baseRows = [] } = baseActions
  const t = useT()
  const demFileRef = useRef(null)
  const howId = useId()
  const bufferHintId = useId()
  // «Como o corredor segue o relevo»: a explicação inteira, que a dica encurtou
  const [howOpen, setHowOpen] = useState(false)
  const section = useOpenSection('corredor-1')
  const pf = preflightState(preflight)
  const terrainReady = terrain?.status === 'ready'
  const tfOk = corridorTerrain && !corridorTerrain.error ? corridorTerrain : null
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
  const own = corridorConfig.ownParams === true
  const flight = corridorFlight ?? {
    altitude: corridorConfig.altitude,
    frontOverlap: corridorConfig.frontOverlap,
    sideOverlap: corridorConfig.sideOverlap,
    interval: null,
  }
  const flights = corridorPlan?.flights?.length > 1 ? corridorPlan.flights : null
  const rowOf = (id) => baseRows.find((b) => b.id === id) ?? null
  // a base de onde descola o voo mais longo (a barra do voo diz a deslocação)
  const longestBase = flights?.find((f) => f.label === ops?.longest?.label)?.base ?? null
  const usable = Number.isFinite(usableMin) ? Math.round(usableMin) : '—'
  const basesText =
    baseRows.length === 0
      ? t('co.bases.none')
      : tCount(t, 'co.bases.list', baseRows.length, {
          list: joinList(
            t,
            baseRows.map((b) => b.label),
          ),
        })
  const terrainSource = terrainReady
    ? terrain.data?.source === 'file'
      ? terrain.data.label
      : t('co.terrain.global')
    : terrain?.status === 'loading'
      ? t('cp.terrain.loading')
      : t('co.terrain.noTerrain')
  // a mesma fonte, em minúsculas, no resumo da secção
  const terrainShort = terrainReady
    ? terrain.data?.source === 'file'
      ? terrain.data.label
      : t('co.terrain.globalShort')
    : terrain?.status === 'loading'
      ? t('cp.terrain.loading')
      : t('co.terrain.noTerrainShort')

  return (
    <ModePanel
      title={t('mode.corridor')}
      description={t('co.panel.description')}
      label={t('co.panel.label')}
    >
      {drone && setDrone && (
        <Section
          n={1}
          title={t('ap.title')}
          summary={aircraftSummary(t, drone, sensor, 'focal')}
          {...section('corredor-aeronave')}
        >
          <AircraftPicker drone={drone} setDrone={setDrone} sensor={sensor} />
        </Section>
      )}

      {/* o eixo e a largura: o desenho, a meia-largura e as passagens que dão */}
      <Section
        n={2}
        title={t('co.axis.title')}
        summary={
          drawing
            ? tCount(t, 'mp.drawingN', draftCount, { n: draftCount })
            : axis
              ? t('co.axis.summary', {
                  len: stats ? Math.round(stats.corridorLengthM) : '—',
                  b: corridorConfig.bufferM,
                })
              : t('co.axis.summaryNone', { b: corridorConfig.bufferM })
        }
        status={
          errorKey || droppedPasses > 0 ? (
            <StatusBadge
              tone="block"
              icon={<IconWarning className="h-3 w-3" />}
              value="1"
              label={errorKey ? t(errorKey) : t('co.short.dropped', { n: droppedPasses })}
            />
          ) : axis && stats && !drawing ? (
            <StatusDone label={t('mp.ready')} />
          ) : null
        }
        {...section('corredor-1')}
      >
        {isLidar && <Note tone="info">{t('co.lidarNote')}</Note>}
        <DrawControls
          label={t('co.axis.draw')}
          icon={
            <Icon size={15} sw={1.8} d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          }
          drawing={drawing}
          onDraw={onStartAxis}
          clearLabel={t('co.axis.clear')}
          onClear={onClearAxis}
          clearDisabled={!axis && draftCount === 0}
          count={draftCount}
          hint={t('co.axis.hint')}
          onUndo={onUndoAxisPoint}
          onFinish={onFinishAxis}
        />
        {!drawing && <Hint>{t(axis ? 'co.axis.hint' : 'co.axis.none')}</Hint>}
        <Grid>
          {/* a explicação antiga da meia-largura fica na dica do campo, e
              para o leitor de ecrã na descrição dele (a dica é só do rato) */}
          <div title={t('co.params.bufferHint')} className="min-w-0">
            <Field label={t('co.params.buffer')} unit="m">
              <NumberInput
                value={corridorConfig.bufferM}
                onChange={(v) => setCorridorParam('bufferM', v)}
                min={1}
                max={5000}
                step={5}
                aria-describedby={bufferHintId}
                className={fieldInput}
              />
            </Field>
            <span id={bufferHintId} className="sr-only">
              {t('co.params.bufferHint')}
            </span>
          </div>
          <Readout
            label={droppedPasses > 0 ? t('co.plan.widthRequested') : t('co.plan.width')}
            value={`${2 * corridorConfig.bufferM} m`}
            extra={t('co.width.double')}
          />
        </Grid>
        {errorKey && <Note tone="block">{t(errorKey)}</Note>}
        {stats && (
          <Note
            tone="result"
            lead={tCount(t, 'co.result.passes', stats.passCount, {
              n: stats.passCount,
              s: stats.spacingM.toFixed(1),
            })}
          >
            {t('co.result.rest', {
              runs: tCount(t, 'co.result.runs', stats.runCount, { r: stats.runCount }),
              h: flight.altitude,
              o: flight.sideOverlap,
            })}
          </Note>
        )}
        {droppedPasses > 0 && (
          <Note tone="block">{t('co.plan.dropped', { n: droppedPasses })}</Note>
        )}
        {splitPasses > 0 && <Note tone="warn">{t('co.plan.split', { n: splitPasses })}</Note>}
      </Section>

      {/* parâmetros de voo: altura e sobreposições, velocidade, disparo, paragens */}
      <Section
        n={3}
        title={t('cards.flight')}
        summary={[
          own ? t('co.flight.own') : null,
          `${flight.altitude} m`,
          isLidar ? `${flight.sideOverlap} %` : `${flight.frontOverlap}/${flight.sideOverlap} %`,
          `${corridorConfig.speedMS} m/s`,
          isLidar
            ? null
            : t(
                corridorConfig.photoMode === 'waypoint'
                  ? 'co.flight.byWaypoint'
                  : 'co.flight.byDistance',
              ),
        ]
          .filter(Boolean)
          .join(' · ')}
        {...section('corredor-2')}
      >
        <Part>
          {/* altura e sobreposições próprias, ou as do separador Área */}
          <Switch
            label={t('co.params.own')}
            checked={own}
            testId="corridor-own-params"
            onChange={(on) => {
              // ao ligar, começa nos valores da área
              if (on && areaParams) {
                setCorridorParam('altitude', areaParams.altitude)
                setCorridorParam('frontOverlap', areaParams.frontOverlap)
                setCorridorParam('sideOverlap', areaParams.sideOverlap)
              }
              setCorridorParam('ownParams', on)
            }}
          />
          {own ? (
            <>
              <Grid>
                <Field label={t('co.params.altitude')} unit="m">
                  <NumberInput
                    value={corridorConfig.altitude}
                    onChange={(v) => setCorridorParam('altitude', Math.max(5, Math.min(1500, v)))}
                    min={5}
                    max={1500}
                    className={fieldInput}
                  />
                </Field>
                {!isLidar && (
                  <Field label={t('co.params.frontOverlap')} unit="%">
                    <NumberInput
                      value={corridorConfig.frontOverlap}
                      onChange={(v) =>
                        setCorridorParam('frontOverlap', Math.max(10, Math.min(95, v)))
                      }
                      min={10}
                      max={95}
                      className={fieldInput}
                    />
                  </Field>
                )}
                <Field label={t('co.params.sideOverlap')} unit="%">
                  <NumberInput
                    value={corridorConfig.sideOverlap}
                    onChange={(v) => setCorridorParam('sideOverlap', Math.max(10, Math.min(95, v)))}
                    min={10}
                    max={95}
                    className={fieldInput}
                  />
                </Field>
              </Grid>
              <Hint>{t('co.params.ownHint')}</Hint>
            </>
          ) : (
            areaParams && (
              <Note tone="neutral">
                {t('co.params.fromArea')}{' '}
                {boldText(t('co.params.fromAreaHeight'), [`${areaParams.altitude} m`])}
                {' · '}
                {isLidar
                  ? boldText(t('co.params.fromAreaSide'), [`${areaParams.sideOverlap} %`])
                  : boldText(t('co.params.fromAreaOverlap'), [
                      `${areaParams.frontOverlap}/${areaParams.sideOverlap} %`,
                    ])}
                {sensor?.type === 'camera' &&
                  ` · ${t('co.params.fromAreaGsd', {
                    v: computeGSD(sensor, areaParams.altitude, -90).toFixed(2),
                  })}`}
              </Note>
            )
          )}
        </Part>
        <Grid>
          <Field label={t('co.params.speed')} unit={speedUnit(t, speedRange.min, speedRange.max)}>
            <NumberInput
              value={corridorConfig.speedMS}
              onChange={(v) => setCorridorParam('speedMS', v)}
              min={0.5}
              max={25}
              step={0.5}
              className={fieldInput}
            />
          </Field>
          {!isLidar && (
            <Readout
              label={t('stats.interval')}
              value={Number.isFinite(flight.interval) ? `${flight.interval.toFixed(1)} m` : '—'}
            />
          )}
        </Grid>
        {triggerWarn && (
          <Note tone="warn">
            {t('cp.flight.triggerFast', {
              s: triggerWarn.actualS.toFixed(2),
              min: triggerWarn.minS.toFixed(1),
              vmax: triggerWarn.maxSpeed.toFixed(1),
            })}
          </Note>
        )}
        {!isLidar && (
          <Part>
            <Segmented
              caption
              label={t('co.params.photoMode')}
              value={corridorConfig.photoMode === 'waypoint' ? 'waypoint' : 'distance'}
              onChange={(v) => setCorridorParam('photoMode', v)}
              testId="corridor-photo-mode"
              options={[
                { value: 'distance', label: t('co.params.photoDistance') },
                { value: 'waypoint', label: t('co.params.photoWaypoint') },
              ]}
            />
            <Hint>
              {t('co.params.photoHint', {
                m: Number.isFinite(flight.interval) ? flight.interval.toFixed(1) : '—',
              })}
            </Hint>
          </Part>
        )}
        {/* as dobras das passagens existem também com LiDAR */}
        <Part>
          <Segmented
            caption
            label={t('co.params.stops')}
            value={corridorConfig.waypointStops === 'all' ? 'all' : 'corners'}
            onChange={(v) => setCorridorParam('waypointStops', v)}
            testId="corridor-stops"
            options={[
              { value: 'corners', label: t('co.params.stopsCorners') },
              { value: 'all', label: t('co.params.stopsAll') },
            ]}
          />
          <Hint>{t('co.params.stopsHint')}</Hint>
        </Part>
      </Section>

      {/* relevo: a fonte, o seguimento de terreno por passagem, a referência */}
      <Section
        n={4}
        title={t('co.terrain.title')}
        summary={[
          t(terrainFollow?.enabled ? 'co.terrain.followOn' : 'co.terrain.followOff'),
          terrainShort,
        ].join(' · ')}
        status={
          terrainFollow?.enabled && corridorTerrain?.error ? (
            <StatusBadge
              tone="block"
              icon={<IconWarning className="h-3 w-3" />}
              value="1"
              label={terrainErrorText(corridorTerrain.error, t)}
            />
          ) : terrainReady && axis && !corridorCovers ? (
            <StatusBadge
              tone="warn"
              icon={<IconWarning className="h-3 w-3" />}
              value="1"
              label={t('co.terrain.outOfCoverage')}
            />
          ) : null
        }
        {...section('corredor-3')}
      >
        <div className="flex flex-col gap-2.5 rounded-[9px] border border-slate-800 bg-sunken p-3">
          <div className="flex items-start gap-2.5">
            <IconMountain className="mt-px h-[18px] w-[18px] flex-none text-sky-300" />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-slate-100 [overflow-wrap:anywhere]">
                {terrainReady && terrain.data?.source === 'file'
                  ? `${t('cp.terrain.localDem')} ${terrain.data.label}`
                  : terrainSource}
              </div>
              <div className="mt-0.5 text-xs leading-normal text-slate-300">
                {[
                  terrainReady && terrain.data?.source === 'file'
                    ? t('cp.terrain.demGrid', {
                        crs: terrain.data.crsCode,
                        res: terrain.data.resolutionM?.toFixed(1),
                      })
                    : null,
                  terrainReady
                    ? t(
                        !axis
                          ? 'co.terrain.sameAsArea'
                          : corridorCovers
                            ? 'co.terrain.covers'
                            : 'co.terrain.notCovers',
                      )
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              size="md"
              className="w-full"
              onClick={onLoadTerrain}
              disabled={!axis || terrain?.status === 'loading'}
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
              disabled={!axis || terrain?.status === 'loading'}
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
        {terrainReady && axis && !corridorCovers && (
          <Note tone="warn">{t('co.terrain.outOfCoverage')}</Note>
        )}
        <Part>
          <Switch
            label={t('mp.followTerrain')}
            extra={t('co.terrain.followWhat')}
            checked={Boolean(terrainFollow?.enabled)}
            // ligar exige relevo que cubra o corredor; desligar, nunca
            disabled={!terrainFollow?.enabled && !(terrainReady && corridorCovers)}
            onChange={(on) => setTerrainFollow({ ...terrainFollow, enabled: on })}
          />
          <Hint>{t('co.terrain.hintShort')}</Hint>
          {terrainFollow?.enabled && (
            <InlineField label={t('cp.terrain.tolerance')} unit="m" boxClass={fieldBox}>
              <NumberInput
                value={terrainFollow.tolerance}
                min={1}
                max={20}
                className={fieldInput}
                onChange={(v) => setTerrainFollow({ ...terrainFollow, tolerance: v })}
              />
            </InlineField>
          )}
        </Part>
        {tfOk && (
          <Note tone="neutral">
            {t('cp.terrain.result', {
              range: rangeText(tfOk.elevMin, tfOk.elevMax, Math.round),
              n: tfOk.waypoints.length,
              ref: Math.round(tfOk.refElev),
            })}
            {tfOk.warnings?.map((w, i) => (
              <span key={i} className="mt-1 block text-amber-300">
                ⚠ {errorText(w, t)}
              </span>
            ))}
          </Note>
        )}
        {terrainFollow?.enabled && corridorTerrain?.error && (
          <Note tone="block">{terrainErrorText(corridorTerrain.error, t)}</Note>
        )}
        {corridorReference && Number.isFinite(corridorReference.elev) && (
          <>
            <KeyLine
              label={t('co.terrain.refLabel')}
              value={`${Math.round(corridorReference.elev)} m`}
              extra={`· ${t(corridorReference.source === 'base' ? 'co.terrain.refBaseShort' : 'co.terrain.refMinShort')}`}
            />
            {/* sem base, à vista (era só a dica do rato): descolar mais acima
                põe a aeronave mais alta, nunca mais baixa */}
            {corridorReference.source !== 'base' && (
              <Hint>{t('co.terrain.refMin', { elev: Math.round(corridorReference.elev) })}</Hint>
            )}
          </>
        )}
        <Button
          size="field"
          className="w-full"
          onClick={onShowProfile}
          disabled={!(terrainReady && corridorCovers && stats)}
          icon={<IconChart className="h-[15px] w-[15px]" />}
        >
          {t('cp.terrain.profile')}
        </Button>
        <MoreButton
          label={t('co.terrain.how')}
          expanded={howOpen}
          controls={howId}
          onClick={() => setHowOpen((v) => !v)}
        />
        <p id={howId} hidden={!howOpen} className="text-xs leading-normal text-slate-300">
          {t('co.terrain.hint')}
        </p>
      </Section>

      {/* voos e bases: a divisão pela bateria, os voos e as bases */}
      <Section
        n={5}
        title={t('co.flights.title')}
        summary={[
          flights
            ? tCount(t, 'stats.flightsN', flights.length, { n: flights.length })
            : t('co.flights.one'),
          basesText,
        ].join(' · ')}
        status={
          stats && ops?.longestFrac != null ? (
            <LongestBadge ops={ops} label={longestLabel(t, ops)} />
          ) : null
        }
        {...section('corredor-voos')}
      >
        <Part>
          {/* divisão em voos: um só, ou troços do eixo que cabem na bateria */}
          <Segmented
            caption
            label={t('co.split.title')}
            value={corridorConfig.split === 'battery' ? 'battery' : 'none'}
            onChange={(v) => setCorridorParam('split', v)}
            testId="corridor-split"
            options={[
              { value: 'none', label: t('co.split.none') },
              { value: 'battery', label: t('co.split.battery') },
            ]}
          />
          <Hint>{t('co.split.hint', { usable })}</Hint>
        </Part>
        {corridorConfig.split === 'battery' && corridorSplit?.error === 'too-many-flights' && (
          <Note tone="block">{t(`co.split.err.${corridorSplit.error}`)}</Note>
        )}
        {flights && (
          <div data-testid="corridor-flights">
            <Table
              label={t('co.flights.table')}
              columns={[
                { key: 'f', label: t('co.flights.flight') },
                { key: 'b', label: t('co.flights.base') },
                { key: 'own', label: t('co.flights.stretch'), align: 'right' },
                { key: 'all', label: t('co.flights.withTransit'), align: 'right' },
              ]}
              rows={flights.map((f, i) => {
                const op = flightOps?.find((o) => o.label === f.label) ?? null
                const total = op ? op.timeS + (op.ops?.transitS ?? 0) : null
                const frac = total != null && ops?.usefulS ? total / ops.usefulS : null
                const tone =
                  frac == null
                    ? ''
                    : frac > 1
                      ? 'text-red-300'
                      : frac > OPS_NEAR_FRAC
                        ? 'text-amber-300'
                        : ''
                const row = f.base ? rowOf(f.base.id) : null
                return {
                  key: f.label,
                  cells: [
                    <span key="f" className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-[9px] w-[9px] flex-none rounded-full"
                        style={{ background: FLIGHT_COLORS[i % FLIGHT_COLORS.length] }}
                      />
                      {f.label}
                    </span>,
                    <span key="b" className="flex items-center gap-1.5">
                      <BaseBadge row={row} />
                      <span className="sr-only">{f.base?.label ?? '—'}</span>
                    </span>,
                    <span key="own" className="text-slate-200">
                      {fmtClock(f.route.stats?.flightTimeS)}
                    </span>,
                    <span key="all" className={`font-semibold ${tone}`}>
                      {total != null ? fmtClock(total) : '—'}
                    </span>,
                  ],
                }
              })}
            />
          </div>
        )}
        {stats && (
          <FlightBar
            ops={ops}
            lead={longestBase ? t('mp.flight.fromBase', { b: longestBase.label }) : null}
          />
        )}
        <Part divided>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13.5px] text-slate-100">
              {t('co.bases.title')} <span className="text-slate-400">· {baseRows.length}</span>
            </span>
            <span className="text-xs text-slate-400">{t('co.bases.nearest')}</span>
          </div>
          {baseRows.length > 0 && (
            <ul className="m-0 list-none overflow-hidden rounded-[9px] border border-slate-800 p-0">
              {baseRows.map((b, i) => {
                const own = flights?.filter((f) => f.base?.id === b.id).map((f) => f.label) ?? []
                return (
                  <li
                    key={b.id}
                    className={`flex min-h-[44px] items-center gap-2.5 pl-3 pr-1 ${i ? 'border-t border-raised' : ''}`}
                  >
                    <BaseBadge row={b} size="h-[22px] w-[22px] text-[11.5px]" />
                    <span className="min-w-0 flex-1 text-[13px] text-slate-100">
                      {t('mp.base', { label: b.label })}
                      {own.length > 0 && (
                        <span className="text-slate-400">
                          {' · '}
                          {tCount(t, 'co.bases.flights', own.length, {
                            list: joinList(t, own),
                          })}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={t('bases.remove', { label: b.label })}
                      title={t('bases.remove', { label: b.label })}
                      onClick={() => removeBaseById(b.id)}
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-950/40"
                    >
                      <IconTrash className="h-[15px] w-[15px]" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <ToolButton
            outline
            pressed={mode === 'base'}
            onClick={onStartBase}
            title={t('cp.area.baseTitle')}
            icon={<IconHelipad className="h-[15px] w-[15px]" />}
          >
            {t('cp.area.markBase')}
          </ToolButton>
          {mode === 'base' && <Hint>{t('cp.area.baseHint')}</Hint>}
          <Hint>{t('co.bases.hint', { usable })}</Hint>
        </Part>
      </Section>

      <Section
        n={6}
        title={t('safety.title')}
        summary={[safetySummary(t, safety), rthHeight(rthInfo)].filter(Boolean).join(' · ')}
        {...section('corredor-seguranca')}
      >
        <SafetyBlock safety={safety} setSafety={setSafety} rthInfo={rthInfo} />
      </Section>

      {/* resumo e exportar */}
      <Section
        n={7}
        title={t('cards.summary')}
        summary={
          stats
            ? [
                flights
                  ? tCount(t, 'stats.flightsN', flights.length, { n: flights.length })
                  : stats.photoCount != null
                    ? tCount(t, 'mp.photosN', stats.photoCount, { n: stats.photoCount })
                    : tCount(t, 'mp.waypointsN', stats.waypointCount, { n: stats.waypointCount }),
                fmtTime(ops?.totalS ?? stats.flightTimeS),
              ].join(' · ')
            : t('mp.noPlan')
        }
        status={stats ? <PreflightStatus state={pf} /> : null}
        {...section('corredor-5')}
      >
        {errorKey && <Note tone="block">{t(errorKey)}</Note>}
        {!axis && !errorKey && <Hint>{t('co.axis.none')}</Hint>}
        {stats && (
          <>
            <Tiles
              tiles={[
                {
                  label: t('cards.summary.flights'),
                  value: ops?.flights ?? (flights ? flights.length : 1),
                  sub: ops?.bases
                    ? tCount(t, 'co.tile.flightsSub', ops.bases, { n: ops.bases })
                    : t('co.bases.none'),
                },
                {
                  label: t('mp.tile.totalTime'),
                  value: fmtTime(ops?.totalS ?? stats.flightTimeS),
                  sub: t('mp.tile.inMission', { t: fmtTime(stats.flightTimeS) }),
                },
                {
                  label: t('co.tile.batteries'),
                  value: ops?.sets ?? ops?.flights ?? 1,
                  sub: tCount(t, 'co.tile.batteriesSub', ops?.sets ?? ops?.flights ?? 1),
                },
                stats.photoCount != null
                  ? {
                      label: t('stats.photos'),
                      value: stats.photoCount,
                      sub: tCount(t, 'mp.waypointsN', stats.waypointCount, {
                        n: stats.waypointCount,
                      }),
                    }
                  : { label: t('stats.waypoints'), value: stats.waypointCount },
              ]}
            />
            <Rows
              rows={[
                [t('co.plan.length'), `${Math.round(stats.corridorLengthM)} m`],
                [
                  t('stats.passes'),
                  t('co.plan.passesValue', {
                    n: stats.passCount,
                    s: stats.spacingM.toFixed(1),
                  }),
                  ` · ${tCount(t, 'co.plan.runs', stats.runCount, { r: stats.runCount })}`,
                ],
                [
                  droppedPasses > 0 ? t('co.plan.widthRequested') : t('co.plan.width'),
                  `${Math.round(stats.coveredWidthM)} m`,
                ],
                [t('co.plan.distance'), fmtDist(stats.pathLengthM)],
              ]}
            />
          </>
        )}
        <PreflightRow state={stats ? pf : null} onShow={onShowPreflight} />
        {exportBlocked && <Note tone="block">{t('app.exportBlockedHint')}</Note>}
        <ExportButton
          kind={corridorExportKind}
          onClick={onExport}
          disabled={!stats || exportBlocked}
          title={exportTitle}
        />
        {stats && (
          <Hint>
            {flights
              ? t('co.export.zip', {
                  list: joinList(
                    t,
                    flights.map((f) => f.label),
                  ),
                })
              : t('co.export.kmz')}
          </Hint>
        )}
      </Section>
    </ModePanel>
  )
}

/** A frase da etiqueta do voo mais longo («Voo mais longo a 91 % do tempo útil»). */
function longestLabel(t, ops) {
  return ops?.longestFrac != null
    ? t('mp.longestBadge', { p: Math.round(ops.longestFrac * 100) })
    : ''
}
