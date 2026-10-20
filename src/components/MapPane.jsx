/**
 * A área do mapa: o resumo do projecto, o mapa (desenho, área, blocos,
 * bases, fotos, pré-visualizações dos modos, bacias de visão) e o painel de
 * métricas do separador aberto.
 */
import ProjectSummary from './ProjectSummary.jsx'
import MapView from './MapView.jsx'
import StatsPanel from './StatsPanel.jsx'

export default function MapPane({
  projectSummary,
  mode,
  draftVertices,
  ring,
  holes,
  validation,
  anchor,
  bases,
  baseRows,
  selectedBaseId,
  handleBaseSelect,
  baseLayout,
  missionMode,
  assignMode,
  handleBlockClick,
  planOk,
  blocks,
  gridCells,
  tiles,
  disabledTiles,
  handleTileClick,
  gcps,
  handleGcpDrag,
  mapPhotoPoints,
  inspectPoints,
  handleInspectDrag,
  facePreview,
  corridorPreview,
  orbitPreview,
  circularPreview,
  handleOrbitPoiDrag,
  fitKey,
  split,
  handleMapClick,
  handleVertexDrag,
  handleVertexInsert,
  handleVertexDelete,
  handleAreaMove,
  handleBaseDrag,
  handleFinishAny,
  viewshedByBlock,
  viewshedLayerOn,
  setViewshedLayerOn,
  uncertainty,
  gsd,
  gsdPitch,
  footprint,
  spacing,
  pointDensity,
  interval,
  trigger,
  params,
  speed,
  modeStats,
  statsOps,
  circularTriggerWarn,
  corridorTriggerWarn,
  triggerWarn,
  areaBaseDistance,
}) {
  return (
    <>
      <main className="relative min-w-0 flex-1">
        <ProjectSummary summary={projectSummary} />
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
        />
        <StatsPanel
          uncertainty={uncertainty}
          gsd={gsd}
          gimbalPitch={gsdPitch}
          footprint={footprint}
          spacing={spacing}
          pointDensity={pointDensity}
          interval={interval}
          intervalS={trigger.seconds}
          intervalManual={trigger.manual}
          triggerMode={params.triggerMode}
          speed={speed}
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
      </main>
    </>
  )
}
