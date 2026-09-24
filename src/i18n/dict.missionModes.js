/**
 * Dicionário dos modos de missão (Ronda 3, E1.x). PT em norma pré-AO90.
 */
export default {
  /* ---- Selector de modo (E1.0, modelo A) ---- */
  'mode.area': { pt: 'Área', en: 'Area' },
  'mode.face': { pt: 'Fachada', en: 'Face' },
  'mode.orbit': { pt: 'Órbita', en: 'Orbit' },
  'mode.corridor': { pt: 'Corredor', en: 'Corridor' },
  'mode.circular': { pt: 'Circular', en: 'Circular' },

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
  'co.params.stops': { pt: 'Paragem nos waypoints', en: 'Stop at waypoints' },
  'co.params.stopsCorners': { pt: 'Só nos cantos', en: 'Corners only' },
  'co.params.stopsAll': { pt: 'Em todos', en: 'At every waypoint' },
  'co.params.stopsHint': {
    pt: 'Só nos cantos: pára no fim de cada troço e passa sem parar pelas fotos e pelas dobras das passagens. Em todos: pára em cada waypoint, e o tempo previsto conta as paragens.',
    en: 'Corners only: stops at the end of each run and flies through photo points and pass bends. At every waypoint: stops at each one, and the estimated time counts the stops.',
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
  'op.capture.title': { pt: 'Captura', en: 'Capture' },
  'op.capture.photo': { pt: 'Fotografia (anéis)', en: 'Photo (rings)' },
  'op.capture.video': { pt: 'Vídeo (espiral)', en: 'Video (spiral)' },
  'op.capture.photoHint': {
    pt: 'Anéis a altura constante, uma foto em cada waypoint: altura, gimbal e sobreposição iguais em todo o nível, para fotogrametria.',
    en: 'Constant-height rings, one photo at every waypoint: same height, gimbal and overlap across each level, for photogrammetry.',
  },
  'op.capture.videoHint': {
    pt: 'Espiral contínua do primeiro ao último nível, uma volta por passo, a gravar do primeiro ao último ponto (startRecord/stopRecord). Sem fotografias: a câmara não fotografa enquanto grava.',
    en: 'Continuous spiral from the first to the last level, one turn per step, recording from the first to the last point (startRecord/stopRecord). No photos: the camera cannot shoot while recording.',
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
  'op.plan.spiral': {
    pt: 'espiral: {turns} voltas, {h0} → {h1} m, {pts} pontos/volta',
    en: 'spiral: {turns} turns, {h0} → {h1} m, {pts} points/turn',
  },
  'op.plan.video': {
    pt: 'vídeo contínuo, ~{min} min de gravação',
    en: 'continuous video, ~{min} min of recording',
  },
  'op.plan.gimbalsVideo': { pt: 'gimbal de {a}° a {b}°', en: 'gimbal from {a}° to {b}°' },
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
  'op.exportHintVideo': {
    pt: 'Voo curvo contínuo, rumo ao POI, gimbal a reapontar ao centro em cada ponto; grava do primeiro ao último ponto. Um só KMZ: a gravação não se fatia por nível. Alturas relativas ao ponto de descolagem.',
    en: 'Continuous curved flight, heading at the POI, gimbal re-aimed at the centre at every point; records from the first to the last point. A single KMZ: the recording is not split per level. Heights relative to the takeoff point.',
  },

  /* ---- Painel circular (circlegrammetry) ---- */
  'ci.area.title': { pt: 'Área a Cobrir', en: 'Area to Cover' },
  'ci.area.draw': { pt: 'Desenhar', en: 'Draw' },
  'ci.area.finish': { pt: 'Concluir', en: 'Finish' },
  'ci.area.undo': { pt: 'Anular ponto', en: 'Undo point' },
  'ci.area.clear': { pt: 'Limpar', en: 'Clear' },
  'ci.area.hint': {
    pt: '{n} vértice(s). Clique no mapa para desenhar o polígono; duplo clique ou Concluir para fechar.',
    en: '{n} vertex(es). Click the map to draw the polygon; double-click or Finish to close it.',
  },
  'ci.area.none': {
    pt: 'Desenhe a área no mapa, ou importe-a no separador Área: o polígono é o mesmo.',
    en: 'Draw the area on the map, or import it in the Area tab: the polygon is shared.',
  },
  'ci.area.shared': {
    pt: 'A área é a mesma do separador Área (mover, editar vértices e importar funcionam lá).',
    en: 'Same polygon as the Area tab (move, vertex editing and import live there).',
  },
  'ci.params.title': { pt: 'Círculos', en: 'Circles' },
  'ci.params.radius': { pt: 'Raio', en: 'Radius' },
  'ci.params.overlap': { pt: 'Sobreposição entre círculos', en: 'Circle overlap' },
  'ci.params.overlapHint': {
    pt: 'Passo entre centros = 2R × (1 − sobreposição). O tempo sobe em degraus, um por círculo a mais; dentro de um degrau, mais sobreposição é menos voo fora da área.',
    en: 'Centre spacing = 2R × (1 − overlap). Time rises in steps, one per extra circle; within a step, more overlap means less flying outside the area.',
  },
  'ci.params.pitch': { pt: 'Inclinação do gimbal', en: 'Gimbal pitch' },
  'ci.params.pitchHint': {
    pt: 'Fixa em todos os pontos, com o rumo ao centro do círculo. −45° é o valor do estudo de referência; o eixo óptico toca o chão a {d} m do drone.',
    en: 'Fixed at every point, heading at the circle centre. −45° is the reference study value; the optical axis meets the ground {d} m from the drone.',
  },
  'ci.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'ci.params.angle': { pt: 'Rumo das fiadas', en: 'Row heading' },
  'ci.params.angleAuto': { pt: 'Aresta mais longa', en: 'Longest edge' },
  'ci.params.altitudeNote': {
    pt: 'Altura e sobreposição frontal (fotos ao longo do círculo) são as do separador Área: {h} m, {f} %.',
    en: 'Height and front overlap (photos along the circle) come from the Area tab: {h} m, {f} %.',
  },
  'ci.advice': {
    pt: 'Com {p} %: {cols} × {rows} = {n} círculos. O mesmo número mantém-se de {min} % a {max} %; no topo do intervalo os círculos saem menos da área.',
    en: 'At {p} %: {cols} × {rows} = {n} circles. The same count holds from {min} % to {max} %; at the top of the range the circles overshoot the area less.',
  },
  'ci.adviceApply': { pt: 'Usar {max} %', en: 'Use {max} %' },
  'ci.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'ci.plan.circles': { pt: '{n} círculos × {pts} pontos', en: '{n} circles × {pts} points' },
  'ci.plan.photos': { pt: '{n} fotos (1 por ponto)', en: '{n} photos (1 per point)' },
  'ci.plan.extension': {
    pt: 'sai da área {a} m ao longo, {b} m de través',
    en: 'overshoots the area by {a} m along, {b} m across',
  },
  'ci.plan.gsd': { pt: 'GSD {v} cm/px no eixo óptico', en: 'GSD {v} cm/px on the optical axis' },
  'ci.plan.path': { pt: 'percurso {km} km', en: 'path {km} km' },
  'ci.plan.time': { pt: '~{min} min', en: '~{min} min' },
  'ci.plan.terrain': {
    pt: 'seguimento de terreno por ponto ({n} pontos fora do relevo mantêm a AGL)',
    en: 'per-point terrain following ({n} points outside the DEM keep the AGL)',
  },
  'ci.plan.vsArea': {
    pt: 'grelha do separador Área ({kind}): ~{min} min',
    en: 'Area-tab grid ({kind}): ~{min} min',
  },
  'ci.plan.kindSerpentine': { pt: 'serpentina', en: 'serpentine' },
  'ci.plan.kindCrosshatch': { pt: 'dupla grelha', en: 'double grid' },
  'ci.plan.blocks': {
    pt: '{n} blocos por bateria ({min} min úteis)',
    en: '{n} blocks per battery ({min} usable min)',
  },
  'ci.terrain.follow': {
    pt: 'Seguir terreno (altura por ponto)',
    en: 'Follow terrain (per-point height)',
  },
  'ci.terrain.hint': {
    pt: 'Cada ponto sobe ou desce com o relevo debaixo dele, em relação à cota de referência (base com relevo, senão a mínima da área). Precisa de relevo carregado que cubra a área.',
    en: 'Each point rises or drops with the terrain beneath it, relative to the reference elevation (base with terrain, otherwise the area minimum). Needs loaded terrain covering the area.',
  },
  'ci.exportSingle': { pt: 'Exportar missão única (KMZ)', en: 'Export single mission (KMZ)' },
  'ci.exportBlocks': {
    pt: 'Exportar um KMZ por bloco (ZIP)',
    en: 'Export one KMZ per block (ZIP)',
  },
  'ci.exportHint': {
    pt: 'Voo curvo contínuo, rumo ao centro do círculo, gimbal fixo e uma foto em cada ponto; cada círculo entra e sai pelo ponto virado ao anterior. Alturas relativas ao ponto de descolagem.',
    en: 'Continuous curved flight, heading at the circle centre, fixed gimbal and one photo per point; each circle enters and exits at the point facing the previous one. Heights relative to the takeoff point.',
  },
  'ci.err.invalid-area': { pt: 'Polígono inválido.', en: 'Invalid polygon.' },
  'ci.err.invalid-radius': { pt: 'O raio tem de ser positivo.', en: 'Radius must be positive.' },
  'ci.err.invalid-altitude': {
    pt: 'A altura tem de ser positiva.',
    en: 'Height must be positive.',
  },
  'ci.err.too-many-circles': {
    pt: 'Demasiados círculos ({n}, máximo {max}): aumente o raio ou baixe a sobreposição.',
    en: 'Too many circles ({n}, maximum {max}): increase the radius or lower the overlap.',
  },
}
