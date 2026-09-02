/**
 * Dicionário dos modos de missão (Ronda 3, E1.x). PT em norma pré-AO90.
 */
export default {
  /* ---- Selector de modo (E1.0, modelo A) ---- */
  'mode.area': { pt: 'Área', en: 'Area' },
  'mode.face': { pt: 'Fachada', en: 'Face' },
  'mode.orbit': { pt: 'Órbita', en: 'Orbit' },
  'mode.corridor': { pt: 'Corredor', en: 'Corridor' },

  /* ---- Painel de corredor (E5.1) ---- */
  'co.axis.title': { pt: 'Eixo do Corredor', en: 'Corridor Centreline' },
  'co.axis.draw': { pt: 'Desenhar', en: 'Draw' },
  'co.axis.clear': { pt: 'Limpar', en: 'Clear' },
  'co.axis.finish': { pt: 'Concluir', en: 'Finish' },
  'co.axis.undo': { pt: 'Anular ponto', en: 'Undo point' },
  'co.axis.hint': {
    pt: '{n} vértice(s). Clique ao longo do eixo (estrada, conduta, linha de água); duplo clique ou Concluir para terminar.',
    en: '{n} vertex(es). Click along the centreline (road, pipeline, watercourse); double-click or Finish to end.',
  },
  'co.axis.none': {
    pt: 'Desenhe o eixo no mapa para gerar as passagens do corredor.',
    en: 'Draw the centreline on the map to generate the corridor passes.',
  },
  'co.lidarNote': {
    pt: 'Payload LiDAR: o espaçamento das passagens sai da largura de varrimento do feixe e a missão não leva acções de câmara, pelo que não há disparo a configurar.',
    en: 'LiDAR payload: pass spacing comes from the beam swath width and the mission carries no camera actions, so there is no trigger to configure.',
  },
  'co.params.title': { pt: 'Parâmetros do Corredor', en: 'Corridor Parameters' },
  'co.params.buffer': { pt: 'Meia-largura', en: 'Half-width' },
  'co.params.bufferHint': {
    pt: 'Distância coberta de cada lado do eixo; a largura total é o dobro. O número de passagens sai daqui, da altitude e da sobreposição lateral.',
    en: 'Distance covered on each side of the centreline; total width is twice this. The pass count follows from it, the altitude and the side overlap.',
  },
  'co.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'co.params.photoMode': { pt: 'Disparo', en: 'Trigger' },
  'co.params.photoDistance': { pt: 'Por distância', en: 'By distance' },
  'co.params.photoWaypoint': { pt: 'Por waypoint', en: 'Per waypoint' },
  'co.params.photoHint': {
    pt: 'Por distância: o disparo é feito a cada X metros ao longo da rota. Por waypoint: cada posição de fotografia é um waypoint com acção própria.',
    en: 'By distance: the camera triggers every X metres along the route. Per waypoint: each photo position is a waypoint with its own action.',
  },
  'co.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'co.plan.length': { pt: 'Comprimento do eixo', en: 'Centreline length' },
  'co.plan.passes': { pt: '{n} passagens ({r} troços)', en: '{n} passes ({r} runs)' },
  'co.plan.width': { pt: 'Largura coberta', en: 'Covered width' },
  'co.plan.spacing': { pt: 'Espaçamento', en: 'Line spacing' },
  'co.plan.waypoints': { pt: '{n} waypoints', en: '{n} waypoints' },
  'co.plan.photos': { pt: '{n} fotos', en: '{n} photos' },
  'co.plan.distance': { pt: 'Distância de voo', en: 'Flight distance' },
  'co.plan.time': { pt: 'Tempo estimado', en: 'Estimated time' },
  'co.err.corridor-too-long': {
    pt: 'O corredor é longo demais para ser amostrado com esta sobreposição (as passagens exteriores são mais compridas do que o eixo): a passagem teria de ser cosida com um segmento recto que sai do corredor. Divida o eixo em troços, suba a altitude ou baixe a sobreposição lateral.',
    en: 'The corridor is too long to sample at this overlap (the outer passes are longer than the centreline): the pass would have to be stitched with a straight segment that leaves the corridor. Split the centreline, raise the altitude, or lower the side overlap.',
  },
  'co.plan.dropped': {
    pt: '{n} passagem(ns) não pôde(puderam) ser voada(s): nessa(s) faixa(s) a curvatura do eixo é mais apertada do que a distância ao eixo, e o corredor fica SEM COBERTURA aí. A largura indicada é a pedida, não a coberta. Reduza a meia-largura, suavize a curva ou voe essa faixa à parte.',
    en: '{n} pass(es) could not be flown: there the centreline curves tighter than the pass distance, and the corridor is LEFT UNCOVERED. The width shown is the requested one, not the covered one. Reduce the half-width, ease the bend, or fly that strip separately.',
  },
  'co.plan.widthRequested': {
    pt: 'Largura pedida (não coberta)',
    en: 'Requested width (not covered)',
  },
  'co.plan.split': {
    pt: 'Curvatura mais apertada do que o desvio: {n} passagem(ns) partida(s) em troços; a cobertura pára onde deixaria de ser geometricamente possível.',
    en: 'Curvature tighter than the offset: {n} pass(es) split into runs; coverage stops where it would no longer be geometrically possible.',
  },
  'co.plan.export': { pt: 'Exportar WPML (KMZ)', en: 'Export WPML (KMZ)' },
  'co.err.invalid-buffer': { pt: 'Meia-largura inválida.', en: 'Invalid half-width.' },
  'co.err.invalid-altitude': { pt: 'Altitude inválida.', en: 'Invalid altitude.' },
  'co.err.overlap-too-high': {
    pt: 'Sobreposição lateral demasiado alta para gerar passagens.',
    en: 'Side overlap too high to generate passes.',
  },
  'co.err.sensor-required': {
    pt: 'É necessário um payload de câmara.',
    en: 'A camera payload is required.',
  },
  'co.err.invalid-footprint': { pt: 'Pegada da câmara inválida.', en: 'Invalid camera footprint.' },
  'co.err.degenerate-centreline': { pt: 'Eixo degenerado.', en: 'Degenerate centreline.' },
  'co.err.too-many-passes': {
    pt: 'A meia-largura pedida exige mais passagens do que um plano admite. Reduza a meia-largura, suba a altitude ou baixe a sobreposição lateral.',
    en: 'The requested half-width needs more passes than one plan allows. Reduce the half-width, raise the altitude, or lower the side overlap.',
  },
  'co.err.no-coverage': {
    pt: 'Nenhuma passagem é geometricamente possível com estes parâmetros.',
    en: 'No pass is geometrically possible with these parameters.',
  },
  'co.err.invalid-latitude': {
    pt: 'Latitude fora do domínio suportado.',
    en: 'Latitude outside the supported domain.',
  },

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
  'fp.params.speed': { pt: 'Velocidade', en: 'Speed' },
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
  'fp.warn.bottom': {
    pt: 'Piso de segurança de {floor} m: os primeiros {n} m no pé da face ficam sem cobertura — a esta distância a imagem tem {img} m de altura e a passagem mais baixa não pode descer mais. Aumente o afastamento para alargar a imagem, ou fotografe o pé da face à parte.',
    en: 'Safety floor of {floor} m: the bottom {n} m of the face are left uncovered — at this distance the image is {img} m tall and the lowest pass cannot go any lower. Raise the standoff to widen the image, or shoot the foot of the face separately.',
  },
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
  'op.geom.speed': { pt: 'Velocidade', en: 'Speed' },
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
  'op.exportPerLevel': {
    pt: 'Exportar um KMZ por nível (ZIP)',
    en: 'Export one KMZ per level (ZIP)',
  },
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
