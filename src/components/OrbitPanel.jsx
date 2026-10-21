import { useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { orbitExportName } from '../mission/exportParams.js'
import AircraftPicker, { aircraftSummary } from './AircraftPicker.jsx'
import ShotPitches from './ShotPitches.jsx'
import NumberInput from './NumberInput.jsx'
import { fmtDist, fmtTime } from './StatsPanel.jsx'
import { Icon } from './MapOverlay.jsx'
import { IconTarget, IconTrash, IconWarning } from './Icons.jsx'
import { Section } from './ui/Section.jsx'
import { Button } from './ui/Button.jsx'
import { Field, fieldBox, fieldInput } from './ui/Field.jsx'
import {
  Choices,
  Code,
  ExportButton,
  ExportRow,
  FlightBar,
  Grid,
  Hint,
  InlineField,
  KeyLine,
  KmzContents,
  ModePanel,
  Note,
  Part,
  PreflightRow,
  PreflightStatus,
  SafetyBlock,
  Select,
  StatusBadge,
  StatusDone,
  TakeoffField,
  Tiles,
  ToolButton,
  anglesText,
  codeText,
  joinList,
  preflightState,
  rthShort,
  safetyEnd,
  setsNote,
  signedText,
  speedUnit,
  takeoffShort,
  useOpenSection,
} from './ModePanel.jsx'

/** Os modos de captura, pela ordem das frases de «O que vai no KMZ». */
const KMZ_CAPTURES = ['photo', 'multi', 'video']

/**
 * E1.2: painel do modo órbita (círculos multi-nível em torno de um POI), em
 * seis secções pela ordem do trabalho: aeronave e sensor, o POI, a
 * geometria (com os anéis que dá), a captura, a descolagem e a segurança, e
 * o resumo com a exportação (missão única ou um KMZ por nível). Toda a
 * matemática vive em orbit.js.
 */

/**
 * Os anéis vistos de lado, à escala das alturas: o chão do POI em baixo e
 * um anel por nível, com as alturas que cabem escritas à direita.
 */
function RingsSketch({ heights, label }) {
  const top = Math.max(...heights, 1)
  const y = (h) => 72 - (h / top) * 60
  // de cima para baixo, só os rótulos a 12 px ou mais do anterior
  const labelled = []
  let last = -Infinity
  for (const h of [...heights].sort((a, b) => b - a)) {
    if (y(h) - last < 12) continue
    labelled.push(h)
    last = y(h)
  }
  return (
    <svg
      role="img"
      aria-label={label}
      width="146"
      height="78"
      viewBox="0 0 146 78"
      fill="none"
      className="flex-none"
    >
      <path d="M2 72h112" stroke="#2C4A68" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M58 72V3" stroke="#2C4A68" strokeWidth="1" strokeDasharray="2 3" />
      {heights.map((h, i) => (
        <ellipse key={i} cx="58" cy={y(h)} rx="50" ry="4" stroke="#38BDF8" strokeWidth="1.5" />
      ))}
      <circle cx="58" cy="72" r="3.5" fill="#0B1D2E" stroke="#E6EDF7" strokeWidth="1.5" />
      {labelled.map((h) => (
        <text
          key={h}
          x="113"
          y={y(h) + 4}
          fill="#AEB9CC"
          fontSize="11.5"
          fontFamily="Inter Variable, Inter, system-ui, sans-serif"
        >
          {`${Math.round(h)} m`}
        </text>
      ))}
    </svg>
  )
}

/** Seta da volta: no sentido dos ponteiros do relógio, ou ao contrário. */
function TurnIcon({ clockwise }) {
  return (
    <Icon size={15} className={`text-sky-300 ${clockwise ? '' : '-scale-x-100'}`}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </Icon>
  )
}

export default function OrbitPanel({
  // grupos do App: hw (useHardware), orbit (useOrbitMission) e
  // preflightState (usePreflight)
  hw,
  orbit,
  preflightState: preflightGroup,
  // intervalo do gimbal do payload activo, para as várias inclinações
  gimbalRange = null,
  cameraOk,
  mode,
  onExportSingle,
  // a dica do botão de exportar do cabeçalho: é o mesmo botão
  exportTitle = undefined,
  onExportPerLevel,
  // acções de segurança da missão (fim, sinal perdido): src/mission/safety.js
  safety = null,
  setSafety = (_next) => {},
  rthInfo = null,
  // bases do projecto e a descolagem escolhida (takeoffReference)
  bases = [],
  takeoff = null,
  // o resumo: os números do cartão de métricas (useMissionOps), o botão que
  // abre a lista do preflight e o nome do ficheiro
  ops = null,
  onShowPreflight = null,
  missionName = '',
}) {
  // aeronave e sensor do projecto (a mesma escolha do cartão 1 da área)
  const { drone = null, setDrone = null, sensor = null } = hw
  const {
    orbitConfig,
    setOrbitParam,
    orbitPlan,
    gsdAtRadius,
    setRadiusFromGsd: onGsdTarget,
    startOrbitPoi: onStartPoi,
    clearOrbitPoi: onClearPoi,
  } = orbit
  const {
    // obturador: a corda entre fotos contra o intervalo mínimo do payload
    orbitTriggerWarn: triggerWarn = null,
    exportBlocked = false,
    preflight = [],
  } = preflightGroup
  const t = useT()
  const stats = orbitPlan && !orbitPlan.error ? orbitPlan.stats : null
  const video = orbitConfig.capture === 'video'
  const multi = orbitConfig.capture === 'multi'
  const marking = mode === 'orbit'
  const pitches = (orbitPlan?.perWaypoint ?? []).map((w) => w.gimbalPitch)
  // várias inclinações: as que cada ponto dispara, pela ordem (o plano
  // guarda-as em cada waypoint; perLevel só leva a primeira)
  const shots = stats?.capture === 'multi' ? (orbitPlan.perWaypoint?.[0]?.shots ?? null) : null
  const shotsPerPoint = shots && shots.length > 1 ? shots.length : null
  const section = useOpenSection(orbitConfig.poi ? 'orbita-3' : 'orbita-1')
  const pf = preflightState(preflight)
  const poi = orbitConfig.poi
  const poiText = poi ? `${poi[1].toFixed(6)}, ${poi[0].toFixed(6)}` : null
  // as alturas dos níveis: as do plano, ou as escritas antes de haver POI
  const heights =
    stats?.heights ??
    Array.from(
      { length: Math.max(1, orbitConfig.levelCount) },
      (_, i) => orbitConfig.levelStartM + i * orbitConfig.levelStepM,
    )
  const h0 = Math.round(heights[0])
  const h1 = Math.round(heights[heights.length - 1])
  const where = takeoffShort(t, takeoff, t('op.takeoff.poiShort'))
  // gimbal: o intervalo da espiral, ou um por nível; com várias inclinações
  // são as da secção 4, que as mostra (os campos e o resumo)
  const gimbalLine = !stats
    ? null
    : video && pitches.length > 0
      ? t('op.plan.gimbalsVideo', {
          a: signedText(Math.max(...pitches)),
          b: signedText(Math.min(...pitches)),
        })
      : shots
        ? null
        : orbitPlan.perLevel
          ? t('op.plan.gimbals', {
              v: orbitPlan.perLevel.map((l) => `${signedText(l.gimbalPitch)}°`).join(' / '),
            })
          : null
  const perLevelOff = !stats || stats.levelCount < 2 || video || exportBlocked
  const fileStem = stats ? orbitExportName(missionName, orbitPlan) : ''
  // «O que vai no KMZ»: uma frase por modo de captura, com os nomes do WPML
  const kmzMultiNoWait = codeText(t('op.kmz.multiNoWait'), [
    'toPointAndStopWithDiscontinuityCurvature',
  ])
  const kmzByCapture = {
    photo: codeText(t('op.kmz.photo'), ['toPointAndPassWithContinuityCurvature']),
    multi:
      orbitConfig.hoverS > 0
        ? codeText(t('op.kmz.multi', { s: orbitConfig.hoverS }), [
            'toPointAndStopWithDiscontinuityCurvature',
          ])
        : kmzMultiNoWait,
    video: codeText(t('op.kmz.video'), ['startRecord', 'stopRecord', 'gimbalEvenlyRotate']),
  }
  const kmzCurrent = KMZ_CAPTURES.includes(orbitConfig.capture) ? orbitConfig.capture : 'photo'

  return (
    <ModePanel
      title={t('mode.orbit')}
      description={t('op.panel.description')}
      label={t('op.panel.label')}
    >
      {drone && setDrone && (
        <Section
          n={1}
          title={t('ap.title')}
          summary={aircraftSummary(t, drone, sensor, 'gimbal')}
          {...section('orbita-aeronave')}
        >
          <AircraftPicker drone={drone} setDrone={setDrone} sensor={sensor} />
        </Section>
      )}

      {/* o POI: marcar no mapa e a altura do centro do alvo */}
      <Section
        n={2}
        title={t('op.poi.title')}
        summary={
          poiText
            ? t('op.poi.summary', { poi: poiText, h: orbitConfig.poiHeightM })
            : marking
              ? t('op.poi.marking')
              : t('op.poi.none')
        }
        status={poi && !marking ? <StatusDone label={t('op.poi.marked')} /> : null}
        {...section('orbita-1')}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <ToolButton
            pressed={marking}
            onClick={onStartPoi}
            icon={<IconTarget className="h-[15px] w-[15px]" />}
          >
            {t('op.poi.mark')}
          </ToolButton>
          <Button
            variant="danger"
            size="field"
            onClick={onClearPoi}
            disabled={!poi}
            icon={<IconTrash className="h-[15px] w-[15px]" />}
          >
            {t('op.poi.clear')}
          </Button>
        </div>
        {poiText && <KeyLine label={t('op.poi.centre')} value={poiText} />}
        <Hint>{t('op.poi.hint')}</Hint>
        <Part divided>
          <InlineField label={t('op.poi.height')} unit="m" boxClass={fieldBox}>
            <NumberInput
              value={orbitConfig.poiHeightM}
              min={-50}
              max={300}
              className={fieldInput}
              onChange={(v) => setOrbitParam('poiHeightM', v)}
            />
          </InlineField>
          <Hint>{t('op.poi.heightHint')}</Hint>
        </Part>
      </Section>

      {/* geometria: raio (ou GSD), níveis, sobreposição, velocidade, sentido */}
      <Section
        n={3}
        title={t('op.geom.title')}
        summary={
          heights.length > 1
            ? t('op.geom.summary', {
                r: orbitConfig.radiusM,
                n: heights.length,
                h0,
                h1,
                o: orbitConfig.horizontalOverlapPct,
              })
            : t('op.geom.summaryOne', {
                r: orbitConfig.radiusM,
                h0,
                o: orbitConfig.horizontalOverlapPct,
              })
        }
        {...section('orbita-3')}
      >
        <Part>
          <Grid>
            <Field label={t('op.geom.radius')} unit="m">
              <NumberInput
                value={orbitConfig.radiusM}
                min={5}
                max={500}
                className={fieldInput}
                onChange={(v) => setOrbitParam('radiusM', v)}
              />
            </Field>
            {cameraOk && gsdAtRadius != null && (
              <Field label={t('op.geom.gsdTarget')} unit="cm/px">
                <NumberInput
                  value={Number(gsdAtRadius.toFixed(2))}
                  min={0.1}
                  step={0.1}
                  className={fieldInput}
                  onChange={onGsdTarget}
                />
              </Field>
            )}
          </Grid>
          {cameraOk && gsdAtRadius != null && <Hint>{t('op.geom.gsdHint')}</Hint>}
        </Part>
        <Grid>
          <Field label={t('op.geom.levels')} unit="1–12">
            <NumberInput
              value={orbitConfig.levelCount}
              min={1}
              max={12}
              className={fieldInput}
              onChange={(v) => setOrbitParam('levelCount', Math.round(v))}
            />
          </Field>
          <Field label={t('op.geom.firstLevel')} unit="m">
            <NumberInput
              value={orbitConfig.levelStartM}
              min={2}
              max={300}
              className={fieldInput}
              onChange={(v) => setOrbitParam('levelStartM', v)}
            />
          </Field>
          <Field label={t('op.geom.step')} unit="m">
            <NumberInput
              value={orbitConfig.levelStepM}
              min={1}
              max={100}
              className={fieldInput}
              onChange={(v) => setOrbitParam('levelStepM', v)}
            />
          </Field>
          <Field label={t('op.geom.overlap')} unit="%">
            <NumberInput
              value={orbitConfig.horizontalOverlapPct}
              min={0}
              max={95}
              className={fieldInput}
              onChange={(v) => setOrbitParam('horizontalOverlapPct', v)}
            />
          </Field>
          <Field label={t('op.geom.speed')} unit={speedUnit(t, 1, 10)}>
            <NumberInput
              value={orbitConfig.speedMS}
              min={1}
              max={10}
              step={0.5}
              className={fieldInput}
              onChange={(v) => setOrbitParam('speedMS', Math.max(1, Math.min(10, v)))}
            />
          </Field>
          <Select
            label={t('op.geom.direction')}
            value={orbitConfig.clockwise ? 'cw' : 'ccw'}
            onChange={(v) => setOrbitParam('clockwise', v === 'cw')}
            icon={<TurnIcon clockwise={orbitConfig.clockwise} />}
            testId="orbit-direction"
          >
            <option value="cw">{t('op.geom.cw')}</option>
            <option value="ccw">{t('op.geom.ccw')}</option>
          </Select>
        </Grid>
        {triggerWarn && (
          <Note tone="warn" testId="orbit-trigger-warn">
            {t('cp.flight.triggerFast', {
              s: triggerWarn.actualS.toFixed(2),
              min: triggerWarn.minS.toFixed(1),
              vmax: triggerWarn.maxSpeed.toFixed(1),
            })}
          </Note>
        )}
        {stats && (
          <div className="flex items-center gap-3 rounded-lg border border-[#1D3A55] bg-[#0B1D2E] px-3 py-2.5">
            <RingsSketch
              heights={stats.heights}
              label={t('op.result.sketch', {
                n: stats.heights.length,
                r: stats.radiusM,
                list: joinList(
                  t,
                  stats.heights.map((h) => String(Math.round(h))),
                ),
              })}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[12.5px] leading-[1.45] text-[#C9E6F7]">
              <strong className="font-semibold text-sky-100">
                {video
                  ? t('op.result.spiral', { n: stats.turnCount, r: stats.radiusM })
                  : tCount(t, 'op.result.rings', stats.levelCount, {
                      n: stats.levelCount,
                      r: stats.radiusM,
                    })}
              </strong>
              <span>{t('op.result.points', { pts: stats.pointsPerOrbit })}</span>
              <span>
                {video ? t('op.result.heightsVideo', { h0, h1 }) : t('op.result.heights')}
              </span>
              {gimbalLine && <span className="text-slate-300">{gimbalLine}</span>}
            </div>
          </div>
        )}
        {!cameraOk && <Note tone="warn">{t('op.lidarNote')}</Note>}
      </Section>

      {/* captura: anéis com fotografia, espiral em vídeo ou várias inclinações */}
      <Section
        n={4}
        title={t('op.capture.title')}
        summary={
          multi
            ? [
                t('mp.multiSummary', {
                  list: anglesText(t, shots ?? orbitConfig.multiPitches ?? []),
                }),
                orbitConfig.hoverS > 0 ? t('mp.hoverShort', { s: orbitConfig.hoverS }) : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : t(video ? 'op.capture.video' : 'op.capture.photo')
        }
        {...section('orbita-2')}
      >
        <Choices
          name="orbit-capture"
          label={t('op.capture.title')}
          value={orbitConfig.capture}
          onChange={(v) => setOrbitParam('capture', v)}
          options={['photo', 'video', 'multi'].map((c) => ({
            value: c,
            title: t(`op.capture.${c}`),
            desc: t(`op.capture.${c}Desc`),
            testId: `orbit-capture-${c}`,
          }))}
        />
        {multi && (
          <>
            <ShotPitches
              pitches={orbitConfig.multiPitches}
              onChange={(list) => setOrbitParam('multiPitches', list)}
              range={gimbalRange}
              testId="orbit-shots"
              levels
            />
            <Part divided>
              <InlineField label={t('op.capture.hover')} unit="s" boxClass={fieldBox}>
                <NumberInput
                  value={orbitConfig.hoverS ?? 0}
                  min={0}
                  max={60}
                  step={0.5}
                  className={fieldInput}
                  onChange={(v) => setOrbitParam('hoverS', v)}
                />
              </InlineField>
              <Hint>{t('op.capture.hoverHint')}</Hint>
            </Part>
          </>
        )}
      </Section>

      {/* descolagem e segurança */}
      <Section
        n={5}
        title={t('mp.takeoffSafety')}
        summary={[where, safetyEnd(t, safety), rthShort(t, rthInfo)].filter(Boolean).join(' · ')}
        status={
          takeoff?.error ? (
            <StatusBadge
              tone="block"
              icon={<IconWarning className="h-3 w-3" />}
              value="1"
              label={t(`takeoff.err.${takeoff.error}`)}
            />
          ) : null
        }
        {...section('orbita-seguranca')}
      >
        <TakeoffField
          value={orbitConfig.takeoffBaseId}
          onChange={(v) => setOrbitParam('takeoffBaseId', v)}
          bases={bases}
          takeoff={takeoff}
          targetLabel={t('op.takeoff.poi')}
          targetHint={t('op.takeoff.poiHint')}
          otherHint={t('op.takeoff.other')}
          testId="orbit-takeoff"
        />
        <SafetyBlock safety={safety} setSafety={setSafety} rthInfo={rthInfo} nested />
      </Section>

      {/* resumo e exportar: missão única (a do cabeçalho) ou um KMZ por nível */}
      <Section
        n={6}
        title={t('cards.summary')}
        summary={
          stats
            ? [
                video
                  ? t('op.capture.video')
                  : tCount(t, 'mp.photosN', stats.photoCount, { n: stats.photoCount }),
                fmtTime(stats.flightTimeS),
                pf?.block
                  ? tCount(t, 'mp.blockersN', pf.block, { n: pf.block })
                  : t('mp.noBlockers'),
              ].join(' · ')
            : t('mp.noPlan')
        }
        status={stats ? <PreflightStatus state={pf} /> : null}
        {...section('orbita-5')}
      >
        {!poi && <Hint>{t('op.plan.noPoi')}</Hint>}
        {orbitPlan?.error && <Note tone="block">{t(`orb.err.${orbitPlan.error}`)}</Note>}
        {stats && (
          <>
            <Tiles
              tiles={[
                video
                  ? {
                      label: t('op.tile.turns'),
                      value: stats.turnCount,
                      sub: t('op.result.points', { pts: stats.pointsPerOrbit }),
                    }
                  : {
                      label: t('stats.levels'),
                      value: stats.levelCount,
                      sub: t('op.result.points', { pts: stats.pointsPerOrbit }),
                    },
                video
                  ? {
                      label: t('op.tile.video'),
                      value: fmtTime(stats.flightTimeS),
                      sub: t('op.tile.videoSub'),
                    }
                  : {
                      label: t('stats.photos'),
                      value: stats.photoCount,
                      sub: shotsPerPoint
                        ? t('mp.tile.photosMulti', { n: stats.waypointCount, k: shotsPerPoint })
                        : t('mp.tile.photosOne'),
                    },
                {
                  label: t('op.tile.gsd'),
                  value: stats.gsdCm != null ? `${stats.gsdCm.toFixed(2)} cm/px` : '—',
                  sub: t('fp.tile.gsdSub', { d: stats.radiusM }),
                },
                {
                  label: t('mp.tile.path'),
                  value: fmtDist(stats.pathLengthM),
                  sub: t('mp.tile.speed', { v: orbitConfig.speedMS }),
                },
              ]}
            />
            <FlightBar ops={ops} note={setsNote(t, ops)} />
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
          label={t('op.exportPerLevel')}
          description={
            video
              ? t('op.perLevel.video')
              : stats && stats.levelCount > 1
                ? t('op.perLevel.desc', { n: stats.levelCount })
                : t('op.perLevel.one')
          }
          onClick={onExportPerLevel}
          disabled={perLevelOff}
        />
        {stats && (
          <Hint className="[overflow-wrap:anywhere]">
            {t('mp.fileName')} <Code>{`${fileStem}.kmz`}</Code>
            {perLevelOff ? (
              <>. {t('mp.sameAsHeader')}</>
            ) : (
              <>
                ; {t('op.perLevelFile')} <Code>{`${fileStem}_blocos.zip`}</Code>.{' '}
                {t('op.sameAsHeader')}
              </>
            )}
          </Hint>
        )}
        {stats && (
          <KmzContents
            lines={[
              t('op.kmz.heading'),
              // o modo escolhido primeiro, os outros dois depois
              kmzByCapture[kmzCurrent],
              <>
                {KMZ_CAPTURES.filter((c) => c !== kmzCurrent).map((c, i) => (
                  <span key={c}>
                    {i > 0 && ' '}
                    {c === 'multi' ? kmzMultiNoWait : kmzByCapture[c]}
                  </span>
                ))}
              </>,
              takeoff?.mode === 'base' && takeoff.base
                ? t('op.kmz.heightsBase', { b: takeoff.base.label })
                : t('op.kmz.heightsPoi'),
            ]}
          />
        )}
      </Section>
    </ModePanel>
  )
}
