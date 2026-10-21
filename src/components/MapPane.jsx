/**
 * A área do mapa: o mapa (desenho, área, blocos, bases, fotos,
 * pré-visualizações dos modos, bacias de visão, legenda) e, por cima dele, a
 * barra de desenho do modo Área (com os primeiros passos, sem área), e à
 * direita o resumo do projecto e o cartão de métricas do separador aberto.
 * Nada disto empurra o mapa: tudo flutua por cima, nos cantos.
 */
import { useMemo } from 'react'
import ProjectSummary from './ProjectSummary.jsx'
import MapView from './MapView.jsx'
import StatsPanel from './StatsPanel.jsx'
import MapDrawTools from './MapDrawTools.jsx'
import FirstSteps from './FirstSteps.jsx'
import { qualityStatsFor } from '../mission/qualityStats.js'

export default function MapPane({
  hw,
  basesState,
  areaParams,
  corridor,
  orbit,
  face,
  inspect,
  geom,
  area,
  circular,
  ops,
  viewshedState,
  baseActions,
  mapActions,
  routeView,
  preflightState,
  mode,
  draftVertices,
  missionMode,
  handleGcpDrag,
  viewshedLayerOn,
  setViewshedLayerOn,
}) {
  const { sensor, payload } = hw
  const { bases, selectedBaseId } = basesState
  const {
    gsd,
    gsdPitch,
    footprint,
    spacing,
    pointDensity,
    interval,
    trigger,
    params,
    speed,
    triggerWarn,
  } = areaParams
  const { corridorPreview, corridorTriggerWarn, corridorFlight, corridorSpeed } = corridor
  const { orbitPreview, handleOrbitPoiDrag } = orbit
  const { facePreview } = face
  const { inspectPoints, handleInspectDrag, startInspect } = inspect
  const {
    ring,
    holes,
    validation,
    anchor,
    gridCells,
    tiles,
    disabledTiles,
    fitKey,
    split,
    handleVertexDrag,
    handleVertexInsert,
    handleVertexDelete,
    handleAreaMove,
    startDraw,
    startAnchor,
  } = geom
  const { baseLayout, planOk, blocks, gcps } = area
  const {
    circularPreview,
    circularTriggerWarn,
    circularFlight,
    circularSpeed,
    circularPlan,
    circularConfig,
  } = circular
  const { projectSummary, modeStats, statsOps, areaBaseDistance } = ops
  const { viewshedByBlock } = viewshedState
  const {
    baseRows,
    handleBaseSelect,
    assignMode,
    handleBlockClick,
    handleTileClick,
    handleBaseDrag,
    startBase,
  } = baseActions
  const { handleMapClick, handleFinishAny } = mapActions
  const { mapPhotoPoints } = routeView
  const { uncertainty } = preflightState
  // o grupo «Qualidade» das métricas é o do separador aberto: o corredor e
  // o circular mostravam o GSD, a pegada, o espaçamento e o intervalo da
  // grelha da área, com o intervalo da incerteza dela
  const circularAltitude = circularFlight.altitude
  const circularPitch = circularConfig.gimbalPitch
  const quality = useMemo(
    () =>
      qualityStatsFor(missionMode, {
        area: {
          gsd,
          gsdPitch,
          uncertainty,
          footprint,
          spacing,
          interval,
          intervalS: trigger.seconds,
          intervalManual: trigger.manual,
          triggerMode: params.triggerMode,
          speed,
          pointDensity,
        },
        sensor,
        payload,
        corridorFlight,
        corridorSpeed,
        circularFlight: { altitude: circularAltitude },
        circularPitch,
        circularStats: circularPlan && !circularPlan.error ? circularPlan.stats : null,
        circularSpeed,
      }),
    [
      missionMode,
      gsd,
      gsdPitch,
      uncertainty,
      footprint,
      spacing,
      interval,
      trigger,
      params.triggerMode,
      speed,
      pointDensity,
      sensor,
      payload,
      corridorFlight,
      corridorSpeed,
      circularAltitude,
      circularPitch,
      circularPlan,
      circularSpeed,
    ],
  )
  // a barra de desenho é a do modo Área (os outros modos desenham pelo
  // painel); sem área e sem ferramenta activa, os primeiros passos por baixo
  const drawTools = missionMode === 'area'
  return (
    <>
      <main className="relative min-w-0 flex-1">
        <MapView
          mode={mode}
          draftVertices={draftVertices}
          ring={ring}
          holes={holes}
          valid={validation.valid}
          kinks={validation.kinks}
          anchorCenter={anchor.center}
          bases={baseRows}
          selectedBaseId={selectedBaseId}
          onBaseSelect={handleBaseSelect}
          baseLayout={missionMode === 'area' ? baseLayout : null}
          assignMode={assignMode}
          onBlockClick={handleBlockClick}
          // no modo circular a grelha da area ficava por cima dos circulos
          plan={missionMode === 'circular' ? null : planOk}
          blocks={missionMode === 'circular' ? null : blocks}
          gridCells={gridCells}
          tiles={tiles}
          disabledTiles={disabledTiles}
          onTileToggle={handleTileClick}
          gcps={gcps}
          onGcpDrag={handleGcpDrag}
          photoPoints={mapPhotoPoints}
          inspectPoints={inspectPoints}
          onInspectDrag={handleInspectDrag}
          facePreview={facePreview}
          corridorPreview={corridorPreview}
          orbitPreview={orbitPreview}
          circularPreview={circularPreview}
          onOrbitPoiDrag={handleOrbitPoiDrag}
          fitKey={fitKey}
          editable={!gridCells && split.mode !== 'tiles' && split.mode !== 'battery'}
          areaMovable={missionMode === 'area' || missionMode === 'circular'}
          onMapClick={handleMapClick}
          onVertexDrag={handleVertexDrag}
          onVertexInsert={handleVertexInsert}
          onVertexDelete={handleVertexDelete}
          onAreaMove={handleAreaMove}
          onBaseDrag={handleBaseDrag}
          onFinishDraw={handleFinishAny}
          viewsheds={missionMode === 'area' ? viewshedByBlock : null}
          viewshedLayerOn={viewshedLayerOn}
          onViewshedLayer={setViewshedLayerOn}
          bufferOn={params.bufferPct > 0}
        />
        {drawTools && (
          <MapDrawTools
            mode={mode}
            anchorShape={anchor.shape}
            hasArea={Boolean(ring)}
            onDraw={startDraw}
            onAnchor={startAnchor}
            onBase={startBase}
            onInspect={startInspect}
          />
        )}
        {drawTools && !ring && mode === 'idle' && <FirstSteps />}
        {/* à direita: o resumo do projecto e as métricas, por baixo da barra
            de desenho enquanto o mapa é estreito para as duas lado a lado */}
        <div
          className={`pointer-events-none absolute right-4 z-[1000] flex flex-col items-end gap-2 ${
            drawTools
              ? 'top-[70px] max-h-[calc(100%-86px)] min-[1360px]:top-4 min-[1360px]:max-h-[calc(100%-32px)]'
              : 'top-4 max-h-[calc(100%-32px)]'
          }`}
        >
          <ProjectSummary summary={projectSummary} />
          <StatsPanel
            uncertainty={quality.uncertainty}
            gsd={quality.gsd}
            gimbalPitch={quality.gimbalPitch}
            footprint={quality.footprint}
            spacing={quality.spacing}
            pointDensity={quality.pointDensity}
            interval={quality.interval}
            intervalS={quality.intervalS}
            intervalManual={quality.intervalManual}
            triggerMode={quality.triggerMode}
            speed={quality.speed}
            missionMode={missionMode}
            stats={modeStats}
            ops={statsOps}
            shutterWarn={Boolean(
              missionMode === 'circular'
                ? circularTriggerWarn
                : missionMode === 'corridor'
                  ? corridorTriggerWarn
                  : missionMode === 'area'
                    ? triggerWarn
                    : null,
            )}
            baseDistance={missionMode === 'area' && bases.length <= 1 ? areaBaseDistance : null}
          />
        </div>
      </main>
    </>
  )
}
