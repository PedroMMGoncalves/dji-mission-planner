/**
 * Dicionário dos modos de missão (Ronda 3, E1.x). PT em norma pré-AO90.
 */
export default {
  /* ---- Selector de modo (E1.0, modelo A) ---- */
  'mode.area': { pt: 'Área', en: 'Area' },
  'mode.face': { pt: 'Fachada', en: 'Face' },
  'mode.orbit': { pt: 'Órbita', en: 'Orbit' },

  /* ---- Painel de fachada (E1.1) ---- */
  'fp.baseline.title': { pt: 'Pé da Face (baseline)', en: 'Face Foot (baseline)' },
  'fp.baseline.draw': { pt: 'Desenhar', en: 'Draw' },
  'fp.baseline.clear': { pt: 'Limpar', en: 'Clear' },
  'fp.baseline.hint': {
    pt: '{n} vértice(s). Clique no mapa ao longo do pé da face; duplo clique ou Concluir para terminar. O sentido do desenho define a esquerda/direita.',
    en: '{n} vertex(es). Click along the foot of the face; double-click or Finish to end. The drawing direction defines left/right.',
  },
  'fp.baseline.undo': { pt: 'Anular ponto', en: 'Undo point' },
  'fp.baseline.finish': { pt: 'Concluir', en: 'Finish' },
  'fp.cameraRequired': {
    pt: 'O modo fachada precisa de um payload de câmara — seleccione uma câmara no modo Área.',
    en: 'Face mode needs a camera payload — select a camera in Area mode.',
  },
  'fp.params.title': { pt: 'Parâmetros da Face', en: 'Face Parameters' },
  'fp.params.height': { pt: 'Altura da face', en: 'Face height' },
  'fp.params.standoff': { pt: 'Afastamento (standoff)', en: 'Standoff' },
  'fp.params.side': { pt: 'Lado do voo', en: 'Flight side' },
  'fp.params.sideLeft': { pt: 'Esquerda', en: 'Left' },
  'fp.params.sideRight': { pt: 'Direita', en: 'Right' },
  'fp.params.sideHint': {
    pt: 'Lado relativo ao sentido em que desenhou a baseline; a face fica do lado oposto ao drone.',
    en: 'Side relative to the direction the baseline was drawn; the face sits opposite the drone.',
  },
  'fp.params.vOverlap': { pt: 'Sobreposição vertical', en: 'Vertical overlap' },
  'fp.params.hOverlap': { pt: 'Sobreposição horizontal', en: 'Horizontal overlap' },
  'fp.params.gimbal': { pt: 'Pitch do gimbal', en: 'Gimbal pitch' },
  'fp.params.minClearance': { pt: 'Folga mínima', en: 'Minimum clearance' },
  'fp.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'fp.plan.noBaseline': {
    pt: 'Desenhe o pé da face no mapa para gerar as passagens.',
    en: 'Draw the foot of the face on the map to generate the passes.',
  },
  'fp.plan.passes': { pt: '{n} passagens × {pts} pontos', en: '{n} passes × {pts} points' },
  'fp.plan.photos': { pt: '{n} fotos (1 por waypoint)', en: '{n} photos (1 per waypoint)' },
  'fp.plan.gsd': { pt: 'GSD {v} cm/px na face', en: 'GSD {v} cm/px on the face' },
  'fp.plan.vstep': { pt: 'passo vertical {v} m', en: 'vertical step {v} m' },
  'fp.plan.path': { pt: 'percurso {km} km', en: 'path {km} km' },
  'fp.plan.time': { pt: '~{min} min', en: '~{min} min' },
  'fp.warn.unverified': {
    pt: 'Afastamento NÃO verificado contra o terreno: sem MDT/DSM local carregado, os tiles globais não têm resolução à escala de uma face. Importe um GeoTIFF local no modo Área (secção Terreno) para activar a verificação de folga.',
    en: 'Standoff NOT verified against the terrain: without a local DEM/DSM, global tiles lack resolution at face scale. Import a local GeoTIFF in Area mode (Terrain section) to enable the clearance check.',
  },
  'fp.warn.clearance': {
    pt: 'Folga abaixo de {min} m nas passagens {passes} — o corredor de voo corta a superfície do DSM. Aumente o afastamento ou a folga admissível conscientemente.',
    en: 'Clearance below {min} m on passes {passes} — the flight corridor clips the DSM surface. Raise the standoff or knowingly adjust the allowed clearance.',
  },
  'fp.warn.clearanceOk': {
    pt: 'Folga verificada contra o DSM local: todas as passagens ≥ {min} m.',
    en: 'Clearance verified against the local DSM: all passes ≥ {min} m.',
  },
  'fp.warn.noData': {
    pt: 'O DSM local não cobre a zona da face — afastamento por verificar.',
    en: 'The local DSM does not cover the face area — standoff unverified.',
  },
  'fp.error.camera-required': {
    pt: 'Payload sem câmara — o modo fachada precisa de óptica de câmara.',
    en: 'Payload has no camera — face mode needs camera optics.',
  },
  'fp.error.invalid-dimensions': {
    pt: 'Altura e afastamento têm de ser positivos.',
    en: 'Height and standoff must be positive.',
  },
  'fp.error.overlap-too-high': {
    pt: 'Sobreposição demasiado alta para a pegada a esta distância.',
    en: 'Overlap too high for the footprint at this distance.',
  },
  'fp.export': { pt: 'Exportar WPML (KMZ)', en: 'Export WPML (KMZ)' },
  'fp.exportHint': {
    pt: 'Alturas relativas ao ponto de descolagem: descole à cota do pé da face, ou ajuste as alturas. Rumo fixo e uma foto em cada waypoint.',
    en: 'Heights relative to the takeoff point: take off at the face-foot elevation, or adjust heights. Fixed heading and one photo at every waypoint.',
  },

  /* ---- Painel de órbita (E1.2) ---- */
  'op.poi.title': { pt: 'Ponto de Interesse (POI)', en: 'Point of Interest (POI)' },
  'op.poi.mark': { pt: 'Marcar POI', en: 'Mark POI' },
  'op.poi.clear': { pt: 'Remover', en: 'Remove' },
  'op.poi.hint': {
    pt: 'Clique no mapa sobre o centro do alvo. O marcador fica arrastável.',
    en: 'Click the map on the target centre. The marker stays draggable.',
  },
  'op.poi.height': { pt: 'Cota do centro do alvo', en: 'Target centre height' },
  'op.poi.heightHint': {
    pt: 'Acima do ponto de descolagem — o gimbal de cada nível aponta a esta cota.',
    en: 'Above the takeoff point — each level’s gimbal aims at this height.',
  },
  'op.geom.title': { pt: 'Geometria da Órbita', en: 'Orbit Geometry' },
  'op.geom.radius': { pt: 'Raio', en: 'Radius' },
  'op.geom.gsdTarget': { pt: 'GSD alvo à distância', en: 'Target GSD at range' },
  'op.geom.levels': { pt: 'Número de níveis', en: 'Number of levels' },
  'op.geom.firstLevel': { pt: 'Primeiro nível', en: 'First level' },
  'op.geom.step': { pt: 'Passo vertical', en: 'Vertical step' },
  'op.geom.overlap': { pt: 'Sobreposição horizontal', en: 'Horizontal overlap' },
  'op.geom.clockwise': { pt: 'Sentido horário', en: 'Clockwise' },
  'op.lidarNote': {
    pt: 'Sem câmara activa os pontos por volta usam um passo por omissão (24/volta).',
    en: 'Without an active camera the points per orbit fall back to a default (24/orbit).',
  },
  'op.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'op.plan.noPoi': {
    pt: 'Marque o POI no mapa para gerar as órbitas.',
    en: 'Mark the POI on the map to generate the orbits.',
  },
  'op.plan.rings': { pt: '{n} níveis × {pts} pontos/volta', en: '{n} levels × {pts} points/orbit' },
  'op.plan.photos': { pt: '{n} fotos (1 por waypoint)', en: '{n} photos (1 per waypoint)' },
  'op.plan.gsd': { pt: 'GSD {v} cm/px no alvo', en: 'GSD {v} cm/px at the target' },
  'op.plan.path': { pt: 'percurso {km} km', en: 'path {km} km' },
  'op.plan.time': { pt: '~{min} min', en: '~{min} min' },
  'op.plan.gimbals': { pt: 'gimbal por nível: {v}', en: 'gimbal per level: {v}' },
  'op.exportSingle': { pt: 'Exportar missão única (KMZ)', en: 'Export single mission (KMZ)' },
  'op.exportPerLevel': { pt: 'Exportar um KMZ por nível (ZIP)', en: 'Export one KMZ per level (ZIP)' },
  /* ---- Resumo do projecto (E3.2) ---- */
  'ps.line': {
    pt: '{plans} planos · {min} min de voo · {bat} baterias · {photos} fotos',
    en: '{plans} plans · {min} min of flight · {bat} batteries · {photos} photos',
  },

  'op.exportHint': {
    pt: 'Voo curvo contínuo (toPointAndPassWithContinuityCurvature), rumo ao POI e uma foto em cada waypoint. Alturas relativas ao ponto de descolagem.',
    en: 'Continuous curved flight (toPointAndPassWithContinuityCurvature), heading at the POI and one photo per waypoint. Heights relative to the takeoff point.',
  },
}
