/**
 * Dicionário dos modos de missão (Ronda 3, E1.x). PT em norma pré-AO90.
 */
export default {
  /* ---- Selector de modo (E1.0, modelo A) ---- */
  'mode.area': { pt: 'Área', en: 'Area' },
  'mode.face': { pt: 'Face', en: 'Face' },
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
    pt: 'Distância coberta de cada lado do eixo; a largura total é o dobro. O número de passagens sai daqui, da altura de voo e da sobreposição lateral.',
    en: 'Distance covered on each side of the centreline; total width is twice this. The pass count follows from it, the flight height and the side overlap.',
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
  'co.terrain.title': { pt: 'Relevo e Base', en: 'Terrain and base' },
  'co.terrain.follow': {
    pt: 'Seguir terreno (cada passagem sobre o seu solo)',
    en: 'Follow terrain (each pass over its own ground)',
  },
  'co.terrain.hint': {
    pt: 'Cada passagem sobe e desce com o relevo debaixo dela e dos 30 m de cada lado, sem tecto (a altura é decisão do piloto); as dobras ficam e acrescentam-se os pontos que a tolerância exigir. A área e o corredor partilham o relevo carregado: um só MDT da DGT, ou o último levantamento da equipa, serve os dois.',
    en: 'Each pass rises and drops with the terrain beneath it and 30 m to each side, with no ceiling (the pilot decides the height); bends are kept and the points the tolerance requires are added. Area and corridor share the loaded terrain: one DGT DTM, or the team’s latest survey, serves both.',
  },
  'co.terrain.outOfCoverage': {
    pt: 'O corredor sai fora do relevo carregado: volte a descarregar ou importe um MDT que o cubra.',
    en: 'The corridor extends beyond the loaded terrain: download it again or import a DTM that covers it.',
  },
  'co.terrain.refBase': {
    pt: 'Alturas relativas à base marcada, à cota {elev} m.',
    en: 'Heights relative to the marked base, at {elev} m.',
  },
  'co.terrain.refMin': {
    pt: 'Sem base sobre o relevo: alturas relativas à cota mínima debaixo da rota, {elev} m. Descolar mais acima põe a aeronave mais alta, nunca mais baixa.',
    en: 'No base on the terrain: heights relative to the minimum elevation under the route, {elev} m. Taking off higher puts the aircraft higher, never lower.',
  },
  'co.terrain.err.terrain-not-loaded': {
    pt: 'O relevo carregado não cobre o corredor.',
    en: 'The loaded terrain does not cover the corridor.',
  },
  'co.terrain.err.ref-outside-terrain': {
    pt: 'Sem cota de referência: nem a base nem a rota estão sobre o relevo carregado. Carregue relevo que cubra a base ou a rota.',
    en: 'No reference elevation: neither the base nor the route lies on the loaded terrain. Load terrain that covers the base or the route.',
  },
  'co.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'co.plan.length': { pt: 'Comprimento do eixo', en: 'Centreline length' },
  'co.plan.passes': { pt: '{n} passagens ({r} troços)', en: '{n} passes ({r} runs)' },
  'co.plan.width': { pt: 'Largura coberta', en: 'Covered width' },
  'co.plan.fromArea': {
    pt: 'Altura {h} m · sobreposição {f}/{s} % (do separador Área, cartão 3).',
    en: 'Height {h} m · overlap {f}/{s} % (from the Area tab, card 3).',
  },
  'co.plan.waypoints': { pt: '{n} waypoints', en: '{n} waypoints' },
  'co.plan.photos': { pt: '{n} fotos', en: '{n} photos' },
  'co.plan.distance': { pt: 'Distância de voo', en: 'Flight distance' },
  'co.plan.time': { pt: 'Tempo estimado', en: 'Estimated time' },
  'co.err.corridor-too-long': {
    pt: 'O corredor é longo demais para ser amostrado com esta sobreposição (as passagens exteriores são mais compridas do que o eixo): a passagem teria de ser cosida com um segmento recto que sai do corredor. Divida o eixo em troços, suba a altura de voo ou baixe a sobreposição lateral.',
    en: 'The corridor is too long to sample at this overlap (the outer passes are longer than the centreline): the pass would have to be stitched with a straight segment that leaves the corridor. Split the centreline, raise the flight height, or lower the side overlap.',
  },
  'co.plan.dropped': {
    pt: 'Passagens que não podem ser voadas: {n}. Nelas, a curvatura do eixo é mais apertada do que a distância ao eixo, e o corredor fica SEM COBERTURA aí. A largura indicada é a pedida, não a coberta. Reduza a meia-largura, suavize a curva ou voe essas passagens à parte.',
    en: '{n} pass(es) could not be flown: there the centreline curves tighter than the pass distance, and the corridor is LEFT UNCOVERED. The width shown is the requested one, not the covered one. Reduce the half-width, ease the bend, or fly those passes separately.',
  },
  'co.plan.widthRequested': {
    pt: 'Largura pedida (não coberta)',
    en: 'Requested width (not covered)',
  },
  'co.plan.split': {
    pt: 'Curvatura mais apertada do que a distância ao eixo: {n} passagem(ns) partida(s) em troços; a cobertura pára onde deixaria de ser geometricamente possível.',
    en: 'Curvature tighter than the pass distance: {n} pass(es) split into runs; coverage stops where it would no longer be geometrically possible.',
  },
  'co.err.invalid-buffer': { pt: 'Meia-largura inválida.', en: 'Invalid half-width.' },
  'co.err.invalid-altitude': { pt: 'Altura inválida.', en: 'Invalid height.' },
  'co.err.overlap-too-high': {
    pt: 'Sobreposição lateral demasiado alta para gerar passagens.',
    en: 'Side overlap too high to generate passes.',
  },
  'co.err.sensor-required': {
    pt: 'É necessário um payload de câmara.',
    en: 'A camera payload is required.',
  },
  'co.err.invalid-footprint': { pt: 'Pegada da câmara inválida.', en: 'Invalid camera footprint.' },
  'co.err.degenerate-centreline': {
    pt: 'Eixo inválido: precisa de pelo menos dois vértices distintos. Desenhe-o de novo.',
    en: 'Invalid centreline: it needs at least two distinct vertices. Draw it again.',
  },
  'co.err.too-many-passes': {
    pt: 'A meia-largura pedida exige mais passagens do que um plano admite. Reduza a meia-largura, suba a altura de voo ou baixe a sobreposição lateral.',
    en: 'The requested half-width needs more passes than one plan allows. Reduce the half-width, raise the flight height, or lower the side overlap.',
  },
  'orb.err.invalid-radius': {
    pt: 'A órbita precisa de um POI e de um raio maior do que zero.',
    en: 'The orbit needs a POI and a radius greater than zero.',
  },
  'orb.err.invalid-levels': {
    pt: 'Os níveis da órbita são inválidos: alturas crescentes, do mínimo ao máximo, com pelo menos um nível.',
    en: 'The orbit levels are invalid: increasing heights from minimum to maximum, with at least one level.',
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
    pt: 'O modo Face precisa de um payload de câmara — escolha uma em «Aeronave e sensor», acima.',
    en: 'Face mode needs a camera payload — choose one in “Aircraft and sensor”, above.',
  },
  'fp.params.title': { pt: 'Parâmetros da Face', en: 'Face Parameters' },
  'fp.params.height': { pt: 'Altura da face', en: 'Face height' },
  'fp.params.standoff': { pt: 'Afastamento (standoff)', en: 'Standoff' },
  'fp.params.side': { pt: 'Lado do voo', en: 'Flight side' },
  'fp.params.sideLeft': { pt: 'Esquerda', en: 'Left' },
  'fp.params.sideRight': { pt: 'Direita', en: 'Right' },
  'fp.params.sideHint': {
    pt: 'Lado relativo ao sentido em que desenhou o pé da face; a face fica do lado oposto ao drone.',
    en: 'Side relative to the direction the baseline was drawn; the face sits opposite the drone.',
  },
  'fp.params.vOverlap': { pt: 'Sobreposição vertical', en: 'Vertical overlap' },
  'fp.params.hOverlap': { pt: 'Sobreposição horizontal', en: 'Horizontal overlap' },
  'fp.params.gimbal': { pt: 'Inclinação do gimbal', en: 'Gimbal pitch' },
  'fp.params.minClearance': { pt: 'Folga mínima', en: 'Minimum clearance' },
  'fp.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'fp.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'fp.plan.noBaseline': {
    pt: 'Desenhe o pé da face no mapa para gerar as passagens.',
    en: 'Draw the foot of the face on the map to generate the passes.',
  },
  'fp.plan.passes': { pt: '{n} passagens × {pts} pontos', en: '{n} passes × {pts} points' },
  'fp.plan.photos': { pt: '{n} fotos (1 por waypoint)', en: '{n} photos (1 per waypoint)' },
  'fp.plan.photosMulti': {
    pt: '{n} fotos ({k} por waypoint, uma por inclinação)',
    en: '{n} photos ({k} per waypoint, one per pitch)',
  },
  'fp.plan.gsd': { pt: 'GSD {v} cm/px na face', en: 'GSD {v} cm/px on the face' },
  'fp.plan.vstep': { pt: 'passo vertical {v} m', en: 'vertical step {v} m' },
  'fp.plan.path': { pt: 'percurso {km} km', en: 'path {km} km' },
  'fp.plan.time': { pt: '~{min} min', en: '~{min} min' },
  'fp.warn.bottom': {
    pt: 'Altura mínima de segurança de {floor} m: os primeiros {n} m no pé da face ficam sem cobertura — a esta distância a imagem tem {img} m de altura e a passagem mais baixa não pode descer mais. Aumente o afastamento para a imagem cobrir mais altura, ou fotografe o pé da face à parte.',
    en: 'Safety floor of {floor} m: the bottom {n} m of the face are left uncovered — at this distance the image is {img} m tall and the lowest pass cannot go any lower. Raise the standoff so that the image covers more height, or shoot the foot of the face separately.',
  },
  'fp.warn.unverified': {
    pt: 'Afastamento NÃO verificado contra o terreno: sem MDT/MDS local carregado, os tiles globais não têm resolução à escala de uma face. Importe um GeoTIFF no separador Área, cartão 2 (Área e relevo), para activar a verificação de folga.',
    en: 'Standoff NOT verified against the terrain: without a local DTM/DSM, global tiles lack resolution at face scale. Import a GeoTIFF in the Area tab, card 2 (Area and terrain), to enable the clearance check.',
  },
  'fp.warn.clearance': {
    pt: 'Folga abaixo de {min} m nas passagens {passes} — o corredor de voo corta a superfície do modelo local (MDT/MDS). Aumente o afastamento ou, conscientemente, reduza a «Folga mínima».',
    en: 'Clearance below {min} m on passes {passes} — the flight corridor clips the local model surface (DTM/DSM). Raise the standoff or knowingly lower the “Minimum clearance”.',
  },
  'fp.warn.clearanceOk': {
    pt: 'Folga verificada contra o modelo local (MDT/MDS): todas as passagens ≥ {min} m.',
    en: 'Clearance verified against the local DTM/DSM: all passes ≥ {min} m.',
  },
  'fp.warn.noData': {
    pt: 'O modelo local (MDT/MDS) não cobre a zona da face — afastamento por verificar.',
    en: 'The local DTM/DSM does not cover the face area — standoff unverified.',
  },
  'fp.error.camera-required': {
    pt: 'Payload sem câmara — o modo Face precisa de óptica de câmara.',
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
  'fp.error.pitch-too-steep': {
    pt: 'Inclinação da câmara demasiado íngreme para ver a face a esta distância.',
    en: 'Camera pitch too steep to see the face at this distance.',
  },
  'fp.error.standoff-corner': {
    pt: 'Num canto o drone ficaria a menos do afastamento pedido da face (canto demasiado fechado ou troço mais curto do que o afastamento permite). Abra o canto, reduza o afastamento ou parta o pé da face em dois troços.',
    en: 'At a corner the drone would be closer to the face than the requested standoff (corner too tight, or a segment shorter than the standoff allows). Open the corner, reduce the standoff or split the face foot into two segments.',
  },
  'fp.exportHint': {
    pt: 'Alturas relativas à descolagem escolhida no cartão 2 (o pé da face, ou uma base). Rumo próprio e uma foto em cada waypoint.',
    en: 'Heights relative to the take-off chosen in card 2 (the foot of the face, or a base). Own heading and one photo at every waypoint.',
  },
  'fp.exportHintMulti': {
    pt: 'Alturas relativas à descolagem escolhida no cartão 2 (o pé da face, ou uma base). Rumo próprio e, em cada waypoint, paragem e uma foto por inclinação.',
    en: 'Heights relative to the take-off chosen in card 2 (the foot of the face, or a base). Own heading and, at every waypoint, a stop and one photo per pitch.',
  },

  /* ---- Painel de órbita (E1.2) ---- */
  'op.poi.title': { pt: 'Ponto de Interesse (POI)', en: 'Point of Interest (POI)' },
  'op.poi.mark': { pt: 'Marcar POI', en: 'Mark POI' },
  'op.poi.clear': { pt: 'Remover', en: 'Remove' },
  'op.poi.hint': {
    pt: 'Clique no mapa sobre o centro do alvo. O marcador fica arrastável.',
    en: 'Click the map on the target centre. The marker stays draggable.',
  },
  'op.poi.height': { pt: 'Altura do centro do alvo', en: 'Target centre height' },
  'op.poi.heightHint': {
    pt: 'Acima do chão no POI: o gimbal de cada nível aponta a esta altura.',
    en: 'Above the ground at the POI: each level’s gimbal aims at this height.',
  },
  'op.capture.title': { pt: 'Captura', en: 'Capture' },
  'op.capture.photo': { pt: 'Fotografia (anéis)', en: 'Photo (rings)' },
  'op.capture.video': { pt: 'Vídeo (espiral)', en: 'Video (spiral)' },
  'op.capture.photoHint': {
    pt: 'Anéis a altura constante, uma foto em cada waypoint: altura, gimbal e sobreposição iguais em todo o nível, para fotogrametria.',
    en: 'Constant-height rings, one photo at every waypoint: same height, gimbal and overlap across each level, for photogrammetry.',
  },
  'op.capture.videoHint': {
    pt: 'Espiral contínua do primeiro ao último nível, uma volta por passo, a gravar do primeiro ao último ponto (startRecord/stopRecord). Sem fotografias: a câmara não fotografa enquanto grava. O gimbal roda de forma uniforme ao longo de cada troço, sem degraus (gimbalEvenlyRotate).',
    en: 'Continuous spiral from the first to the last level, one turn per step, recording from the first to the last point (startRecord/stopRecord). No photos: the camera cannot shoot while recording. The gimbal turns evenly along each segment, without steps (gimbalEvenlyRotate).',
  },
  'op.capture.multi': {
    pt: 'Várias inclinações (com paragem)',
    en: 'Several pitches (with stops)',
  },
  'op.capture.multiHint': {
    pt: 'Anéis a altura constante; em cada ponto a aeronave pára, espera o tempo pedido e tira uma foto por inclinação, pela ordem abaixo: vê por baixo dos beirais e por cima das coberturas. Fotos e tempo multiplicam-se pelo número de inclinações.',
    en: 'Constant-height rings; at each point the aircraft stops, waits the time set and takes one photo per pitch, in the order below: it sees under eaves and over roofs. Photos and time multiply by the number of pitches.',
  },
  'op.capture.hover': { pt: 'Espera ao chegar', en: 'Wait on arrival' },
  /* ---- Várias inclinações (com paragem), órbita e face ---- */
  'shots.title': {
    pt: 'Inclinações do gimbal, por ordem de disparo',
    en: 'Gimbal pitches, in shooting order',
  },
  'shots.angle': { pt: 'Inclinação {n}', en: 'Pitch {n}' },
  'shots.remove': { pt: 'Retirar a inclinação {n}', en: 'Remove pitch {n}' },
  'shots.add': { pt: '+ inclinação', en: '+ pitch' },
  'shots.hint': {
    pt: 'De {lo}° a {hi}°: o ângulo para cima fica 5° abaixo do limite do gimbal ({max}°). Em cada ponto: gimbal, espera (só antes da primeira) e foto, por cada inclinação.',
    en: 'From {lo}° to {hi}°: the upward angle stays 5° below the gimbal limit ({max}°). At each point: gimbal, wait (before the first only) and photo, for each pitch.',
  },
  'op.geom.title': { pt: 'Geometria da Órbita', en: 'Orbit Geometry' },
  'op.geom.radius': { pt: 'Raio', en: 'Radius' },
  'op.geom.gsdTarget': { pt: 'GSD pretendido no alvo', en: 'Target GSD at range' },
  'op.geom.levels': { pt: 'Número de níveis', en: 'Number of levels' },
  'op.geom.firstLevel': { pt: 'Primeiro nível', en: 'First level' },
  'op.geom.step': { pt: 'Passo vertical', en: 'Vertical step' },
  'op.geom.overlap': { pt: 'Sobreposição horizontal', en: 'Horizontal overlap' },
  'op.geom.clockwise': { pt: 'Sentido horário', en: 'Clockwise' },
  'op.geom.speed': { pt: 'Velocidade', en: 'Speed' },
  'op.lidarNote': {
    pt: 'Sem câmara não há fotos, e os pontos por volta usam um passo por omissão (24/volta). Para fotografar, escolha uma câmara em «Aeronave e sensor», acima.',
    en: 'Without a camera there are no photos, and the points per turn fall back to a default (24/turn). To take photos, choose a camera in “Aircraft and sensor”, above.',
  },
  'op.plan.title': { pt: 'Plano e Exportação', en: 'Plan and Export' },
  'op.plan.noPoi': {
    pt: 'Marque o POI no mapa para gerar as órbitas.',
    en: 'Mark the POI on the map to generate the orbits.',
  },
  'op.plan.rings': { pt: '{n} níveis × {pts} pontos/volta', en: '{n} levels × {pts} points/turn' },
  'op.plan.photos': { pt: '{n} fotos (1 por waypoint)', en: '{n} photos (1 per waypoint)' },
  'op.plan.photosMulti': {
    pt: '{n} fotos ({k} por waypoint, uma por inclinação)',
    en: '{n} photos ({k} per waypoint, one per pitch)',
  },
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
  'op.plan.gimbalsMulti': {
    pt: 'gimbal em cada ponto: {v}',
    en: 'gimbal at each point: {v}',
  },
  'op.exportPerLevel': {
    pt: 'Exportar um KMZ por nível (ZIP)',
    en: 'Export one KMZ per level (ZIP)',
  },
  /* ---- Resumo do projecto (E3.2) ---- */
  'ps.line': {
    pt: '{plans} planos · {min} min de voo · {bat} conjuntos de baterias · {photos} fotos',
    en: '{plans} plans · {min} min of flight · {bat} battery sets · {photos} photos',
  },

  'op.exportHint': {
    pt: 'Voo curvo contínuo (toPointAndPassWithContinuityCurvature), rumo ao POI e uma foto em cada waypoint. Alturas relativas ao ponto de descolagem.',
    en: 'Continuous curved flight (toPointAndPassWithContinuityCurvature), heading at the POI and one photo per waypoint. Heights relative to the take-off point.',
  },
  'op.exportHintMulti': {
    pt: 'Paragem em cada waypoint (toPointAndStopWithDiscontinuityCurvature), rumo ao POI e, em cada ponto, uma foto por inclinação. Alturas relativas ao ponto de descolagem.',
    en: 'Stop at every waypoint (toPointAndStopWithDiscontinuityCurvature), heading at the POI and, at each point, one photo per pitch. Heights relative to the take-off point.',
  },
  'op.exportHintVideo': {
    pt: 'Voo curvo contínuo, rumo ao POI, gimbal a reapontar ao centro em cada ponto; grava do primeiro ao último ponto. Um só KMZ: a gravação não se fatia por nível. Alturas relativas ao ponto de descolagem.',
    en: 'Continuous curved flight, heading at the POI, gimbal re-aimed at the centre at every point; records from the first to the last point. A single KMZ: the recording is not split per level. Heights relative to the take-off point.',
  },

  /* ---- Painel circular (circlegrammetry) ---- */
  'ci.area.title': { pt: 'Área a Cobrir', en: 'Area to Cover' },
  'ci.area.draw': { pt: 'Desenhar', en: 'Draw' },
  'ci.area.finish': { pt: 'Concluir', en: 'Finish' },
  'ci.area.undo': { pt: 'Anular ponto', en: 'Undo point' },
  'ci.area.clear': { pt: 'Limpar', en: 'Clear' },
  'ci.area.hint': {
    pt: '{n} vértice(s). Clique no mapa para desenhar o polígono; clique no primeiro vértice, duplo clique ou Concluir para fechar.',
    en: '{n} vertex(es). Click the map to draw the polygon; click the first vertex, double-click or Finish to close it.',
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
    pt: 'Fixa em todos os pontos, com o rumo ao centro do círculo. −45° é o valor do estudo de referência; o eixo óptico intersecta o solo a {d} m do drone.',
    en: 'Fixed at every point, heading at the circle centre. −45° is the reference study value; the optical axis meets the ground {d} m from the drone.',
  },
  'ci.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'ci.params.angle': { pt: 'Azimute das filas', en: 'Row azimuth' },
  'ci.params.angleAuto': { pt: 'auto', en: 'auto' },
  'ci.params.altitudeNote': {
    pt: 'Altura e sobreposição frontal (fotos ao longo do círculo) são as do separador Área: {h} m, {f} %.',
    en: 'Height and forward overlap (photos along the circle) come from the Area tab: {h} m, {f} %.',
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
    pt: 'seguimento de terreno por ponto ({n} pontos sem relevo usam a cota mais alta do seu círculo)',
    en: 'per-point terrain following ({n} points without terrain use the highest elevation of their circle)',
  },
  'ci.terrain.outOfCoverage': {
    pt: 'Os círculos saem fora do relevo carregado (saem da área até um raio): descarregue o relevo global ou importe um MDT que os cubra.',
    en: 'The circles extend beyond the loaded terrain (they overshoot the area by up to one radius): download the global terrain or import a DTM that covers them.',
  },
  'ci.terrain.err.terrain-not-loaded': {
    pt: 'O relevo carregado não cobre os círculos.',
    en: 'The loaded terrain does not cover the circles.',
  },
  'ci.terrain.err.ref-outside-terrain': {
    pt: 'Sem cota de referência: nem a base nem a rota estão sobre o relevo carregado. Carregue relevo que cubra a base ou a rota.',
    en: 'No reference elevation: neither the base nor the route lies on the loaded terrain. Load terrain that covers the base or the route.',
  },
  'ci.terrain.err.terrain-nodata': {
    pt: '{n} círculo(s) sem nenhum dado de relevo: não há altura segura para eles. Importe um MDT que os cubra ou desligue «Seguir terreno».',
    en: '{n} circle(s) without any terrain data: there is no safe height for them. Import a DTM that covers them or turn off “Follow terrain”.',
  },
  'ci.remove': {
    pt: 'Retirar a missão circular do projecto',
    en: 'Remove the circular mission from the project',
  },
  'ci.removeHint': {
    pt: 'A missão circular usa o polígono da área e passa a existir quando se abre este separador; retirada, deixa de contar no resumo do projecto.',
    en: 'The circular mission uses the area polygon and exists once this tab is opened; removed, it no longer counts in the project summary.',
  },
  'ci.plan.vsArea': {
    pt: 'grelha do separador Área ({kind}): ~{min} min',
    en: 'Area-tab grid ({kind}): ~{min} min',
  },
  'ci.plan.kindSerpentine': { pt: 'serpentina', en: 'serpentine' },
  'ci.plan.kindCrosshatch': { pt: 'dupla grelha', en: 'crosshatch' },
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
  'ci.exportBlocks': {
    pt: 'Exportar um KMZ por bloco (ZIP)',
    en: 'Export one KMZ per block (ZIP)',
  },
  'ci.exportHint': {
    pt: 'Voo curvo contínuo, rumo ao centro do círculo, gimbal fixo e uma foto em cada ponto; cada círculo entra e sai pelo ponto virado ao anterior. Alturas relativas ao ponto de descolagem.',
    en: 'Continuous curved flight, heading at the circle centre, fixed gimbal and one photo per point; each circle enters and exits at the point facing the previous one. Heights relative to the take-off point.',
  },
  'ci.err.invalid-area': { pt: 'Polígono inválido.', en: 'Invalid polygon.' },
  'ci.err.invalid-radius': { pt: 'O raio tem de ser positivo.', en: 'Radius must be positive.' },
  'ci.err.pitch-too-shallow': {
    pt: 'Inclinação da câmara demasiado rasa: o topo da imagem seria céu. Incline mais a câmara.',
    en: 'Camera pitch too shallow: the top of the image would be sky. Tilt the camera further down.',
  },
  'ci.err.invalid-altitude': {
    pt: 'A altura tem de ser positiva.',
    en: 'Height must be positive.',
  },
  'ci.err.too-many-circles': {
    pt: 'Demasiados círculos ({n}, máximo {max}): aumente o raio ou baixe a sobreposição.',
    en: 'Too many circles ({n}, maximum {max}): increase the radius or lower the overlap.',
  },

  /* ---- Corredor em vários voos, parâmetros próprios, espera e descolagem ---- */
  'co.params.own': { pt: 'Altura e sobreposições próprias', en: 'Own height and overlaps' },
  'co.params.altitude': { pt: 'Altura acima da descolagem', en: 'Height above take-off' },
  'co.params.frontOverlap': { pt: 'Sobreposição frontal', en: 'Forward overlap' },
  'co.params.sideOverlap': { pt: 'Sobreposição lateral', en: 'Side overlap' },
  'co.split.title': { pt: 'Divisão em voos', en: 'Split into flights' },
  'co.split.none': { pt: 'Nenhuma', en: 'None' },
  'co.split.battery': { pt: 'Por bateria', en: 'By battery' },
  'co.split.hint': {
    pt: 'Corta o eixo em troços iguais, cada um um voo que cabe na bateria (com 5 % de margem); os troços sobrepõem-se uma pegada no corte. Cada voo descola da base mais próxima, ou à cota mínima do seu troço, e sai num KMZ próprio, dentro de um ZIP.',
    en: 'Cuts the centreline into equal stretches, each one a flight that fits the battery (with a 5 % margin); stretches overlap by one footprint at each cut. Each flight takes off from the nearest base, or at the lowest elevation of its stretch, and is written to its own KMZ inside a ZIP.',
  },
  'co.split.summary': {
    pt: '{n} voos; o mais longo {max} (tempo útil {usable} min)',
    en: '{n} flights; the longest {max} (usable time {usable} min)',
  },
  'co.split.flight': { pt: '{label}: {time} · base {base}', en: '{label}: {time} · base {base}' },
  'co.split.err.too-many-flights': {
    pt: 'Seriam precisos mais de 60 voos: aumente o tempo útil da bateria ou reduza a largura do corredor.',
    en: 'More than 60 flights would be needed: increase the usable battery time or narrow the corridor.',
  },
  'ci.params.own': {
    pt: 'Altura e sobreposição frontal próprias',
    en: 'Own height and forward overlap',
  },
  'ci.params.altitude': { pt: 'Altura acima da descolagem', en: 'Height above take-off' },
  'ci.params.frontOverlap': { pt: 'Sobreposição frontal', en: 'Forward overlap' },
  'fp.params.hover': { pt: 'Espera em cada foto', en: 'Wait at each photo' },
  'fp.capture.title': { pt: 'Captura', en: 'Capture' },
  'fp.capture.single': { pt: 'Uma foto por ponto', en: 'One photo per point' },
  'fp.capture.multi': {
    pt: 'Várias inclinações (com paragem)',
    en: 'Several pitches (with stops)',
  },
  'fp.capture.multiHint': {
    pt: 'Em cada ponto, uma foto por inclinação, pela ordem acima, com a espera antes da primeira: vê por baixo dos beirados e das varandas. As passagens continuam espaçadas para a «Inclinação do gimbal» acima; fotos e tempo multiplicam-se pelo número de inclinações.',
    en: 'At each point, one photo per pitch, in the order above, with the wait before the first: it sees under eaves and balconies. The passes are still spaced for the “Gimbal pitch” above; photos and time multiply by the number of pitches.',
  },
  'fp.params.hoverHint': {
    pt: 'A aeronave pára e espera antes de cada disparo (acção hover do WPML): útil com pouca luz ou com a câmara térmica. Conta no tempo de voo.',
    en: 'The aircraft stops and waits before each shot (WPML hover action): useful in low light or with the thermal camera. It counts in the flight time.',
  },
  'fp.params.extendEnds': {
    pt: 'Prolongar as pontas meia imagem',
    en: 'Extend the ends by half an image',
  },
  'fp.params.extendEndsHint': {
    pt: 'A primeira e a última coluna de fotos ficam {m} m para lá das pontas da face, para as pontas terem a mesma sobreposição do resto. Desligue junto a outras paredes.',
    en: 'The first and last photo columns sit {m} m beyond the ends of the face, so the ends get the same overlap as the rest. Switch it off next to other walls.',
  },
  'fp.takeoff.foot': { pt: 'No pé da face', en: 'At the foot of the face' },
  'fp.takeoff.footHint': {
    pt: 'Alturas relativas ao pé da face: descole à cota dele, ou escolha a base de onde vai descolar.',
    en: 'Heights relative to the foot of the face: take off at its elevation, or choose the base you will take off from.',
  },
  'op.takeoff.poi': { pt: 'No chão do POI', en: 'On the ground at the POI' },
  'op.takeoff.poiHint': {
    pt: 'Alturas relativas ao chão do POI: descole à cota dele, ou escolha a base de onde vai descolar.',
    en: 'Heights relative to the ground at the POI: take off at its elevation, or choose the base you will take off from.',
  },
}
