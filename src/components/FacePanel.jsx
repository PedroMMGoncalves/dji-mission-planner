import { useT } from '../i18n.jsx'
import { tCount } from '../i18n/format.js'
import { faceExportName } from '../mission/exportParams.js'
import AircraftPicker, { aircraftSummary } from './AircraftPicker.jsx'
import ShotPitches from './ShotPitches.jsx'
import NumberInput from './NumberInput.jsx'
import { fmtDist, fmtTime } from './StatsPanel.jsx'
import { Icon } from './MapOverlay.jsx'
import { Section } from './ui/Section.jsx'
import { Field, fieldInput } from './ui/Field.jsx'
import { IconWarning } from './Icons.jsx'
import {
  Choices,
  Code,
  DrawControls,
  ExportButton,
  FlightBar,
  Grid,
  Hint,
  KmzContents,
  ModePanel,
  Note,
  Part,
  PreflightRow,
  PreflightStatus,
  SafetyBlock,
  StatusBadge,
  StatusDone,
  TakeoffField,
  Tiles,
  anglesText,
  preflightState,
  rthShort,
  safetyEnd,
  setsNote,
  signedText,
  speedUnit,
  takeoffShort,
  useOpenSection,
} from './ModePanel.jsx'
import { Segmented } from './ui/Segmented.jsx'
import { Switch } from './ui/Switch.jsx'

/**
 * E1.1: painel do modo face (serpentina vertical), em seis secções pela
 * ordem do trabalho: aeronave e sensor, o pé da face (desenho e lado do
 * voo), os parâmetros da face (com as passagens e o GSD que dão, e os
 * avisos do afastamento), a captura, a descolagem e a segurança, e o resumo
 * com a exportação. Toda a matemática vive em faceMode.js.
 */

/**
 * O lado do voo visto de cima: a linha desenhada com o seu sentido, o drone
 * do lado escolhido e a face (tracejada) do lado oposto.
 */
function SideSketch({ side }) {
  const t = useT()
  const left = side !== 'right'
  return (
    <svg
      role="img"
      aria-label={t(left ? 'fp.side.sketchLeft' : 'fp.side.sketchRight')}
      width="104"
      height="44"
      viewBox="0 0 104 44"
      fill="none"
      className="flex-none"
    >
      {/* à direita, o mesmo desenho espelhado em torno da linha */}
      <g transform={left ? undefined : 'matrix(1 0 0 -1 0 56)'}>
        <path d="M48 12.5v13" stroke="#8391A8" strokeWidth="1.4" strokeDasharray="2 3" />
        <circle cx="48" cy="8" r="4.5" fill="#38BDF8" />
        <path
          d="M10 32.5l-4 8M20 32.5l-4 8M30 32.5l-4 8M40 32.5l-4 8M50 32.5l-4 8M60 32.5l-4 8M70 32.5l-4 8M80 32.5l-4 8"
          stroke="#8391A8"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
      <path d="M4 28h86" stroke="#7DD3FC" strokeWidth="2" strokeLinecap="round" />
      <path
        d="m85 23.5 6.5 4.5-6.5 4.5"
        stroke="#7DD3FC"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function FacePanel({
  // grupos do App: hw (useHardware) e face (useFaceMission)
  hw,
  face,
  // intervalo do gimbal do payload activo, para as várias inclinações
  gimbalRange = null,
  faceClearance,
  dsmLoaded,
  cameraOk,
  mode,
  draftCount,
  onUndoVertex,
  onExport,
  // a dica do botão de exportar do cabeçalho: é o mesmo botão
  exportTitle = undefined,
  exportBlocked = false,
  // acções de segurança da missão (fim, sinal perdido): src/mission/safety.js
  safety = null,
  setSafety = (_next) => {},
  // bases do projecto e a descolagem escolhida (takeoffReference)
  bases = [],
  takeoff = null,
  rthInfo = null,
  // o resumo: os números do cartão de métricas (useMissionOps), os itens do
  // preflight e o botão que abre a lista dele, e o nome do ficheiro
  ops = null,
  preflight = [],
  onShowPreflight = null,
  missionName = '',
  // a ligação do aviso do afastamento: abre o separador Área (o GeoTIFF)
  onOpenArea = null,
}) {
  // aeronave e sensor do projecto (a mesma escolha do cartão 1 da área)
  const { drone = null, setDrone = null, sensor = null } = hw
  const {
    faceConfig,
    setFaceParam,
    facePlan,
    startFaceDraw: onStartDraw,
    handleFinishFace: onFinishDraw,
    clearFaceBaseline: onClearBaseline,
  } = face
  const t = useT()
  const stats = facePlan && !facePlan.error ? facePlan.stats : null
  // várias inclinações: cada waypoint tira uma foto por inclinação
  const shotsPerPoint = stats?.shotsPerPoint > 1 ? stats.shotsPerPoint : null
  const multi = faceConfig.capture === 'multi'
  const drawing = mode === 'face'
  const section = useOpenSection(faceConfig.baseline ? 'fachada-2' : 'fachada-1')
  const pf = preflightState(preflight)

  // os avisos da face, onde se decide o afastamento (a lista do preflight
  // tem os mesmos): o pé por cobrir, a folga por verificar ou curta
  const warnings = []
  if (stats && stats.uncoveredBottomM > 0.5) warnings.push(['warn', 'bottom'])
  if (stats && !dsmLoaded) warnings.push(['warn', 'unverified'])
  if (stats && dsmLoaded && faceClearance && !faceClearance.ok)
    warnings.push(['block', 'clearance'])
  if (stats && dsmLoaded && faceClearance == null) warnings.push(['warn', 'noData'])
  const warnLabel = warnings.length
    ? `${tCount(t, 'mp.warnN', warnings.length, { n: warnings.length })}: ${warnings
        .map(([, k]) => t(`fp.short.${k}`))
        .join(', ')}`
    : ''

  const shots = stats ? (facePlan.perWaypoint?.[0]?.shots ?? null) : null
  const fileName = stats ? `${faceExportName(missionName, facePlan)}.kmz` : null

  return (
    <ModePanel
      title={t('mode.face')}
      description={t('fp.panel.description')}
      label={t('fp.panel.label')}
    >
      {drone && setDrone && (
        <Section
          n={1}
          title={t('ap.title')}
          summary={aircraftSummary(t, drone, sensor, 'gimbal')}
          {...section('fachada-aeronave')}
        >
          <AircraftPicker drone={drone} setDrone={setDrone} sensor={sensor} />
        </Section>
      )}

      {/* o pé da face: desenho e lado do voo */}
      <Section
        n={2}
        title={t('fp.baseline.title')}
        summary={
          drawing
            ? tCount(t, 'mp.drawingN', draftCount, { n: draftCount })
            : faceConfig.baseline
              ? t(faceConfig.side === 'right' ? 'fp.baseline.drawnRight' : 'fp.baseline.drawnLeft')
              : t('mp.toDraw')
        }
        status={faceConfig.baseline && !drawing ? <StatusDone label={t('mp.drawn')} /> : null}
        {...section('fachada-1')}
      >
        <DrawControls
          label={t('fp.baseline.draw')}
          icon={
            <Icon size={15} sw={1.8}>
              <path d="M3.5 18.5 9 10.5l5 3.5 6.5-8.5" />
              <circle cx="3.5" cy="18.5" r="1.6" />
              <circle cx="9" cy="10.5" r="1.6" />
              <circle cx="14" cy="14" r="1.6" />
              <circle cx="20.5" cy="5.5" r="1.6" />
            </Icon>
          }
          drawing={drawing}
          onDraw={onStartDraw}
          clearLabel={t('fp.baseline.clear')}
          onClear={onClearBaseline}
          clearDisabled={!faceConfig.baseline && draftCount === 0}
          count={draftCount}
          hint={t('fp.baseline.hint')}
          onUndo={onUndoVertex}
          onFinish={onFinishDraw}
        />
        <Hint>{t('fp.baseline.direction')}</Hint>
        {!cameraOk && <Note tone="warn">{t('fp.cameraRequired')}</Note>}
        <Part divided>
          <Segmented
            caption
            label={t('fp.params.side')}
            value={faceConfig.side === 'right' ? 'right' : 'left'}
            onChange={(v) => setFaceParam('side', v)}
            testId="face-side"
            options={[
              { value: 'left', label: t('fp.params.sideLeft') },
              { value: 'right', label: t('fp.params.sideRight') },
            ]}
            after={<SideSketch side={faceConfig.side} />}
          />
          <Hint>{t('fp.params.sideHint')}</Hint>
        </Part>
      </Section>

      {/* parâmetros da face: o que dão e os avisos do afastamento */}
      <Section
        n={3}
        title={t('fp.params.title')}
        summary={t('fp.params.summary', {
          h: faceConfig.heightM,
          s: faceConfig.standoffM,
          v: faceConfig.verticalOverlapPct,
          o: faceConfig.horizontalOverlapPct,
        })}
        status={
          warnings.length ? (
            <StatusBadge
              tone={warnings.some(([tone]) => tone === 'block') ? 'block' : 'warn'}
              icon={<IconWarning className="h-3 w-3" />}
              value={warnings.length}
              label={warnLabel}
            />
          ) : null
        }
        {...section('fachada-2')}
      >
        <Grid>
          <Field label={t('fp.params.height')} unit="m">
            <NumberInput
              value={faceConfig.heightM}
              min={2}
              max={500}
              className={fieldInput}
              onChange={(v) => setFaceParam('heightM', v)}
            />
          </Field>
          <Field label={t('fp.params.standoff')} unit="m">
            <NumberInput
              value={faceConfig.standoffM}
              min={5}
              max={200}
              className={fieldInput}
              onChange={(v) => setFaceParam('standoffM', v)}
            />
          </Field>
          <Field label={t('fp.params.vOverlap')} unit="%">
            <NumberInput
              value={faceConfig.verticalOverlapPct}
              min={0}
              max={95}
              className={fieldInput}
              onChange={(v) => setFaceParam('verticalOverlapPct', v)}
            />
          </Field>
          <Field label={t('fp.params.hOverlap')} unit="%">
            <NumberInput
              value={faceConfig.horizontalOverlapPct}
              min={0}
              max={95}
              className={fieldInput}
              onChange={(v) => setFaceParam('horizontalOverlapPct', v)}
            />
          </Field>
          <Field label={t('fp.params.minClearance')} unit="m">
            <NumberInput
              value={faceConfig.minClearanceM}
              min={2}
              max={100}
              className={fieldInput}
              onChange={(v) => setFaceParam('minClearanceM', v)}
            />
          </Field>
          <Field label={t('fp.params.speed')} unit={speedUnit(t, 1, 10)}>
            <NumberInput
              value={faceConfig.speedMS}
              min={1}
              max={10}
              step={0.5}
              className={fieldInput}
              onChange={(v) => setFaceParam('speedMS', Math.max(1, Math.min(10, v)))}
            />
          </Field>
        </Grid>
        <Part divided>
          <Switch
            label={t('fp.params.extendEnds')}
            checked={faceConfig.extendEnds !== false}
            onChange={(v) => setFaceParam('extendEnds', v)}
            testId="face-extend-ends"
          />
          <Hint>
            {t('fp.params.extendEndsHint', {
              m:
                facePlan?.stats?.endExtensionM != null
                  ? facePlan.stats.endExtensionM.toFixed(1)
                  : '—',
            })}
          </Hint>
        </Part>
        {facePlan?.error && <Note tone="block">{t(`fp.error.${facePlan.error}`)}</Note>}
        {stats && (
          <Note
            tone="result"
            // a vírgula fica com o negrito: a frase continua no texto
            lead={`${t('fp.plan.passes', { n: stats.passCount, pts: stats.pointsPerPass })},`}
          >
            {t('fp.result', {
              v: (stats.vStepM ?? stats.imageHeightM).toFixed(1),
              gsd: stats.gsdCm?.toFixed(2),
            })}
          </Note>
        )}
        {stats && stats.uncoveredBottomM > 0.5 && (
          <Note tone="warn">
            {t('fp.warn.bottom', {
              floor: stats.minHeightM,
              n: stats.uncoveredBottomM.toFixed(1),
              img: stats.imageHeightM.toFixed(1),
            })}
          </Note>
        )}
        {stats && !dsmLoaded && (
          <Note tone="warn" lead={t('fp.warn.unverifiedLead')}>
            {t('fp.warn.unverified')}
            {onOpenArea && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onOpenArea}
                  title={t('fp.warn.importDemHint')}
                  className="rounded text-left text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  {t('fp.warn.importDem')}
                </button>
              </>
            )}
          </Note>
        )}
        {stats && dsmLoaded && faceClearance && !faceClearance.ok && (
          <Note tone="block">
            {t('fp.warn.clearance', {
              passes: faceClearance.passes.join(', '),
              min: faceClearance.minClearanceM,
            })}
          </Note>
        )}
        {stats && dsmLoaded && faceClearance?.ok && (
          <Note tone="ok">{t('fp.warn.clearanceOk', { min: faceClearance.minClearanceM })}</Note>
        )}
        {stats && dsmLoaded && faceClearance == null && (
          <Note tone="warn">{t('fp.warn.noData')}</Note>
        )}
      </Section>

      {/* captura: uma foto por ponto, ou várias inclinações com paragem */}
      <Section
        n={4}
        title={t('fp.capture.title')}
        summary={[
          multi
            ? t('mp.multiSummary', {
                list: anglesText(t, shots ?? faceConfig.multiPitches ?? []),
              })
            : t('fp.capture.summarySingle', { p: signedText(faceConfig.gimbalPitch) }),
          faceConfig.hoverS > 0 ? t('mp.hoverShort', { s: faceConfig.hoverS }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        {...section('fachada-captura')}
      >
        <Choices
          name="face-capture"
          label={t('fp.capture.title')}
          testId="face-capture"
          value={multi ? 'multi' : 'single'}
          onChange={(v) => setFaceParam('capture', v)}
          options={[
            {
              value: 'single',
              title: t('fp.capture.single'),
              desc: t('fp.capture.singleDesc'),
            },
            { value: 'multi', title: t('fp.capture.multi'), desc: t('fp.capture.multiDesc') },
          ]}
        />
        {multi && (
          <ShotPitches
            pitches={faceConfig.multiPitches}
            onChange={(list) => setFaceParam('multiPitches', list)}
            range={gimbalRange}
            testId="face-shots"
          />
        )}
        <Part divided>
          <Grid>
            <Field label={t('fp.params.gimbal')} unit="°">
              <NumberInput
                value={faceConfig.gimbalPitch}
                min={-90}
                max={45}
                step={5}
                className={fieldInput}
                onChange={(v) => setFaceParam('gimbalPitch', v)}
              />
            </Field>
            <Field label={t('fp.params.hover')} unit="s">
              <NumberInput
                value={faceConfig.hoverS}
                min={0}
                max={60}
                step={0.5}
                className={fieldInput}
                onChange={(v) => setFaceParam('hoverS', Math.max(0, Math.min(60, v)))}
              />
            </Field>
          </Grid>
          <Hint>{t('fp.capture.hint')}</Hint>
        </Part>
      </Section>

      {/* descolagem e segurança */}
      <Section
        n={5}
        title={t('mp.takeoffSafety')}
        summary={[
          takeoffShort(t, takeoff, t('fp.takeoff.footShort')),
          safetyEnd(t, safety),
          rthShort(t, rthInfo),
        ]
          .filter(Boolean)
          .join(' · ')}
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
        {...section('fachada-seguranca')}
      >
        <TakeoffField
          value={faceConfig.takeoffBaseId}
          onChange={(v) => setFaceParam('takeoffBaseId', v)}
          bases={bases}
          takeoff={takeoff}
          targetLabel={t('fp.takeoff.foot')}
          targetHint={t('fp.takeoff.footHint')}
          otherHint={t('fp.takeoff.other')}
          testId="face-takeoff"
        />
        <SafetyBlock safety={safety} setSafety={setSafety} rthInfo={rthInfo} nested />
      </Section>

      {/* resumo e exportar */}
      <Section
        n={6}
        title={t('cards.summary')}
        summary={
          stats
            ? [
                tCount(t, 'mp.photosN', stats.photoCount, { n: stats.photoCount }),
                fmtTime(stats.flightTimeS),
                pf?.block
                  ? tCount(t, 'mp.blockersN', pf.block, { n: pf.block })
                  : t('mp.noBlockers'),
              ].join(' · ')
            : t('mp.noPlan')
        }
        status={stats ? <PreflightStatus state={pf} /> : null}
        {...section('fachada-4')}
      >
        {!faceConfig.baseline && <Hint>{t('fp.plan.noBaseline')}</Hint>}
        {faceConfig.baseline && !cameraOk && <Note tone="warn">{t('fp.cameraRequired')}</Note>}
        {facePlan?.error && <Note tone="block">{t(`fp.error.${facePlan.error}`)}</Note>}
        {stats && (
          <>
            <Tiles
              tiles={[
                {
                  label: t('stats.passes'),
                  value: `${stats.passCount} × ${stats.pointsPerPass}`,
                  sub: t('fp.tile.passesSub', {
                    v: (stats.vStepM ?? stats.imageHeightM).toFixed(1),
                  }),
                },
                {
                  label: t('stats.photos'),
                  value: stats.photoCount,
                  sub: shotsPerPoint
                    ? t('mp.tile.photosMulti', { n: stats.waypointCount, k: shotsPerPoint })
                    : t('mp.tile.photosOne'),
                },
                {
                  label: t('fp.tile.gsd'),
                  value: stats.gsdCm != null ? `${stats.gsdCm.toFixed(2)} cm/px` : '—',
                  sub: t('fp.tile.gsdSub', { d: stats.standoffM }),
                },
                {
                  label: t('mp.tile.path'),
                  value: fmtDist(stats.pathLengthM),
                  sub: t('mp.tile.speed', { v: faceConfig.speedMS }),
                },
              ]}
            />
            <FlightBar ops={ops} note={setsNote(t, ops)} />
          </>
        )}
        <PreflightRow state={stats ? pf : null} onShow={onShowPreflight} />
        {exportBlocked && <Note tone="block">{t('app.exportBlockedHint')}</Note>}
        <ExportButton onClick={onExport} disabled={!stats || exportBlocked} title={exportTitle} />
        {fileName && (
          <Hint className="[overflow-wrap:anywhere]">
            {t('mp.fileName')} <Code>{fileName}</Code>. {t('mp.sameAsHeader')}
          </Hint>
        )}
        {stats && (
          <KmzContents
            lines={[
              t('fp.kmz.waypoints'),
              shotsPerPoint ? t('fp.kmz.multi', { k: shotsPerPoint }) : t('fp.kmz.single'),
              takeoff?.mode === 'base' && takeoff.base
                ? t('fp.kmz.heightsBase', { b: takeoff.base.label })
                : t('fp.kmz.heightsFoot'),
              t('mp.kmz.safety', { n: 5 }),
            ]}
          />
        )}
      </Section>
    </ModePanel>
  )
}
