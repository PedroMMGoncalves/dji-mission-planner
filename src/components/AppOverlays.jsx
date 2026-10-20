/**
 * As janelas por cima do planeador: ajuda, configuração, aviso antes de
 * usar, e as que se carregam sob demanda (perfil de elevação, relatório e
 * vista 3D), cada uma com a sua ErrorBoundary.
 */
import { useT } from '../i18n.jsx'
import { lazy, Suspense } from 'react'
import { serializeProject } from '../mission/project.js'
import HelpModal from './HelpModal.jsx'
import SettingsModal from './SettingsModal.jsx'
import DisclaimerModal from './DisclaimerModal.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// carregados sob demanda
const Map3D = lazy(() => import('./Map3D.jsx'))
const MissionReport = lazy(() => import('./MissionReport.jsx'))
const ElevationProfile = lazy(() => import('./ElevationProfile.jsx'))

export default function AppOverlays({
  hw,
  basesState,
  areaParams,
  corridor,
  inspect,
  geom,
  terrainState,
  corridorOnTerrain,
  area,
  circular,
  baseActions,
  routeView,
  safetyChecks,
  sheets,
  preflightState,
  session,
  showHelp,
  setShowHelp,
  setDisclaimer,
  showSettings,
  setShowSettings,
  disclaimer,
  lang,
  setLang,
  closeDisclaimer,
  showProfile,
  setShowProfile,
  missionMode,
  showReport,
  setShowReport,
  missionName,
  show3d,
  setShow3d,
}) {
  const { equipment, setEquipment, drone, hardwareLabel } = hw
  const { bases } = basesState
  const { params, speed, spacing, interval, gsd } = areaParams
  const { corridorPreview } = corridor
  const { inspectPoints } = inspect
  const { ring } = geom
  const { terrain, terrainFollow } = terrainState
  const { corridorReference } = corridorOnTerrain
  const { reference, blocks, planOk, gcps } = area
  const { circularReference } = circular
  const { baseRows } = baseActions
  const { view3d, profileBlocks, view3dColors, photos3d } = routeView
  const { rthInfo } = safetyChecks
  const { fieldSheets, fieldSheetsDay } = sheets
  const { uncertainty, blur, preflight } = preflightState
  const { projectState } = session
  const t = useT()
  return (
    <>
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          onShowDisclaimer={() => {
            setShowHelp(false)
            setDisclaimer('review')
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          equipment={equipment}
          setEquipment={setEquipment}
          initialAircraftId={drone.aircraftId}
          onClose={() => setShowSettings(false)}
        />
      )}
      {disclaimer && (
        <DisclaimerModal
          lang={lang}
          setLang={setLang}
          onAccept={closeDisclaimer}
          dismissable={disclaimer === 'review'}
        />
      )}

      {showProfile && terrain.status === 'ready' && view3d && (
        <ErrorBoundary onClose={() => setShowProfile(false)}>
          <Suspense fallback={null}>
            <ElevationProfile
              terrain={terrain.data}
              waypoints={view3d.waypoints}
              breaks={view3d.breaks ?? null}
              refElev={view3d.refElev ?? 0}
              reference={
                missionMode === 'area'
                  ? reference
                  : missionMode === 'corridor'
                    ? corridorReference
                    : missionMode === 'circular'
                      ? circularReference
                      : null
              }
              blocks={profileBlocks}
              onClose={() => setShowProfile(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showReport && planOk && (
        <ErrorBoundary onClose={() => setShowReport(false)}>
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">
                {t('app.loadingReport')}
              </div>
            }
          >
            <MissionReport
              missionName={missionName}
              droneLabel={hardwareLabel}
              inspectPoints={inspectPoints}
              // a mesma velocidade limitada que entra no plano e no ficheiro
              params={params.speed === speed ? params : { ...params, speed }}
              spacing={spacing}
              interval={interval}
              gsd={gsd}
              stats={planOk.stats}
              blocks={blocks}
              ring={ring}
              basePoints={bases.map((b) => b.point)}
              baseSheets={missionMode === 'area' ? fieldSheets : []}
              terrainFollowOn={Boolean(terrainFollow?.enabled)}
              rthInfo={rthInfo}
              daySheets={missionMode === 'area' ? fieldSheetsDay : null}
              gcps={gcps}
              lines={planOk.lines}
              reproducibility={{
                version: import.meta.env.APP_VERSION,
                projectJson: JSON.stringify(serializeProject(projectState)),
                uncertainty,
                blur,
                terrainDatum: terrain.data?.verticalDatum ?? null,
                preflight,
              }}
              onClose={() => setShowReport(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {show3d && terrain.status === 'ready' && view3d && (
        <ErrorBoundary onClose={() => setShow3d(false)}>
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">
                {t('app.loading3d')}
              </div>
            }
          >
            <Map3D
              terrain={terrain.data}
              ring={
                missionMode === 'area' || missionMode === 'circular'
                  ? ring
                  : missionMode === 'corridor'
                    ? (corridorPreview?.buffer ?? null)
                    : null
              }
              waypoints={view3d.waypoints}
              refElev={view3d.refElev}
              breaks={view3d.breaks ?? null}
              pieceColors={view3dColors?.pieces ?? null}
              blocks3d={view3dColors?.blocks ?? null}
              bases3d={baseRows.map((b) => ({
                point: b.point,
                label: b.label,
                color: b.color,
                radiusM: b.radiusM,
              }))}
              gcps={missionMode === 'area' ? gcps : null}
              photos={photos3d}
              onClose={() => setShow3d(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}
