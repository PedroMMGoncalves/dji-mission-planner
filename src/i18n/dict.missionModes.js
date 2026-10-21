/**
 * Dicionário dos modos de missão (Ronda 3, E1.x). PT em norma pré-AO90.
 */
export default {
  /* ---- Barra dos modos (E1.0, modelo A) ---- */
  'mode.nav': { pt: 'Tipo de missão', en: 'Mission type' },
  'mode.area': { pt: 'Área', en: 'Area' },
  'mode.face': { pt: 'Face', en: 'Face' },
  'mode.orbit': { pt: 'Órbita', en: 'Orbit' },
  'mode.corridor': { pt: 'Corredor', en: 'Corridor' },
  'mode.circular': { pt: 'Circular', en: 'Circular' },

  /* ---- Peças comuns aos painéis dos outros modos (ModePanel.jsx) ---- */
  // antes do último elemento de uma lista: «−45°, 0° e 30°»
  'mp.and': { pt: ' e ', en: ' and ' },
  'mp.aircraftShared': {
    pt: 'A aeronave é a do projecto: mudá-la aqui muda-a também na Área e nos outros modos.',
    en: 'The aircraft is the project’s: changing it here also changes it in the Area tab and the other modes.',
  },
  'mp.aircraft.gimbal': { pt: 'gimbal {min}° a {max}°', en: 'gimbal {min}° to {max}°' },
  'mp.aircraft.focal': { pt: 'focal {f} mm', en: 'focal length {f} mm' },
  'mp.vertices': { pt: '{n} vértices.', en: '{n} vertices.' },
  'mp.verticesOne': { pt: '1 vértice.', en: '1 vertex.' },
  'mp.drawingN': { pt: 'A desenhar: {n} vértices', en: 'Drawing: {n} vertices' },
  'mp.drawingNOne': { pt: 'A desenhar: 1 vértice', en: 'Drawing: 1 vertex' },
  'mp.toDraw': { pt: 'Por desenhar', en: 'Not drawn yet' },
  'mp.drawn': { pt: 'Desenhado', en: 'Drawn' },
  'mp.ready': { pt: 'Pronto', en: 'Ready' },
  'mp.noPlan': { pt: 'Sem plano ainda', en: 'No plan yet' },
  'mp.photosN': { pt: '{n} fotos', en: '{n} photos' },
  'mp.photosNOne': { pt: '1 foto', en: '1 photo' },
  'mp.waypointsN': { pt: '{n} waypoints', en: '{n} waypoints' },
  'mp.waypointsNOne': { pt: '1 waypoint', en: '1 waypoint' },
  'mp.blockersN': { pt: '{n} bloqueios', en: '{n} blockers' },
  'mp.blockersNOne': { pt: '1 bloqueio', en: '1 blocker' },
  'mp.noBlockers': { pt: 'sem bloqueios', en: 'no blockers' },
  'mp.warnN': { pt: '{n} avisos', en: '{n} warnings' },
  'mp.warnNOne': { pt: '1 aviso', en: '1 warning' },
  'mp.setsN': { pt: '{n} conjuntos de baterias', en: '{n} battery sets' },
  'mp.setsNOne': { pt: '1 conjunto de baterias', en: '1 battery set' },
  // {range}: o intervalo da aeronave (rangeText), «1–15»
  'mp.speedUnit': { pt: 'm/s · {range}', en: 'm/s · {range}' },
  'mp.hoverShort': { pt: 'espera {s} s', en: 'wait {s} s' },
  'mp.multiSummary': { pt: 'Várias inclinações: {list}', en: 'Several pitches: {list}' },
  'mp.followTerrain': { pt: 'Seguir terreno', en: 'Follow terrain' },
  'mp.base': { pt: 'Base {label}', en: 'Base {label}' },
  'mp.takeoffSafety': { pt: 'Descolagem e segurança', en: 'Take-off and safety' },
  'mp.tile.photosMulti': { pt: '{n} pontos × {k}', en: '{n} points × {k}' },
  'mp.tile.photosOne': { pt: '1 por ponto', en: '1 per point' },
  'mp.tile.speed': { pt: 'a {v} m/s', en: 'at {v} m/s' },
  'mp.tile.totalTime': { pt: 'Tempo total', en: 'Total time' },
  'mp.tile.inMission': { pt: '{t} na missão', en: '{t} in the mission' },
  'mp.tile.path': {
    pt: 'Percurso',
    en: 'Flight path',
  },
  'mp.flight.single': {
    pt: 'Voo único',
    en: 'Single flight',
  },
  'mp.flight.pct': {
    pt: '{p} % do tempo útil',
    en: '{p} % of the usable time',
  },
  'mp.flight.near': {
    pt: '(âmbar acima de 90 %)',
    en: '(amber above 90 %)',
  },
  'mp.flight.over': {
    pt: '(vermelho acima de 100 %)',
    en: '(red above 100 %)',
  },
  'mp.flight.fromBase': {
    pt: 'Com a deslocação desde a base {b}',
    en: 'Including the transit from base {b}',
  },
  // com uma base escolhida; {other} lembra a outra escolha (o chão do alvo)
  'mp.takeoff.baseHint': {
    pt: 'Alturas exportadas relativas à base {base} (cota {elev} m): o chão do alvo está a {dh} m dela, e a diferença soma-se às alturas do plano. {other}',
    en: 'Exported heights relative to base {base} (elevation {elev} m): the target ground is {dh} m from it, and the difference is added to the plan heights. {other}',
  },
  'mp.longestBadge': {
    pt: 'Voo mais longo a {p} % do tempo útil',
    en: 'Longest flight at {p} % of the usable time',
  },
  // «2 bloqueios no preflight», «3 avisos no preflight»
  'mp.inPreflight': { pt: '{n} no preflight', en: '{n} in the preflight' },
  'mp.preflightSee': { pt: 'Ver a lista do preflight', en: 'See the preflight list' },
  'mp.preflightSeeShort': { pt: 'Ver', en: 'See' },
  'mp.fileName': { pt: 'Sai como', en: 'Saved as' },
  'mp.sameAsHeader': {
    pt: 'É o mesmo botão do cabeçalho.',
    en: 'It is the same button as in the header.',
  },
  'mp.kmz': { pt: 'O que vai no KMZ', en: 'What goes into the KMZ' },

  'mp.kmz.safety': {
    pt: 'As acções de segurança e as alturas de regresso e de descolagem da secção {n}.',
    en: 'The safety actions and the return and take-off heights from section {n}.',
  },
  'mp.rthShort': { pt: 'regresso a {m} m', en: 'return at {m} m' },
  // as acções de segurança numa linha (o resumo da secção)
  'mp.safety.summary': {
    pt: '{finish} no fim · sinal perdido: {lost}',
    en: '{finish} at the end · signal lost: {lost}',
  },
  'mp.safety.rthBoth': {
    pt: 'RTH no fim e ao perder o sinal',
    en: 'RTH at the end and on signal loss',
  },
  'mp.safety.endShort': { pt: '{finish} no fim', en: '{finish} at the end' },
  'mp.safety.end.goHome': { pt: 'RTH', en: 'RTH' },
  'mp.safety.end.noAction': { pt: 'Pairar', en: 'Hover' },
  'mp.safety.end.autoLand': { pt: 'Aterrar', en: 'Land' },
  'mp.safety.end.gotoFirstWaypoint': {
    pt: 'Voltar ao 1.º waypoint',
    en: 'Back to the 1st waypoint',
  },
  'mp.safety.stop': { pt: 'interromper e {action}', en: 'stop and {action}' },
  'mp.safety.act.goBack': { pt: 'RTH', en: 'RTH' },
  'mp.safety.act.landing': { pt: 'aterrar', en: 'land' },
  'mp.safety.act.hover': { pt: 'pairar', en: 'hover' },
  'mp.safety.continue': { pt: 'continuar a missão', en: 'continue the mission' },

  /* ---- Painel de corredor (E5.1) ---- */
  'co.panel.label': {
    pt: 'Parâmetros da missão de corredor',
    en: 'Corridor mission parameters',
  },
  'co.panel.description': {
    pt: 'Passagens ao longo de um eixo: estrada, conduta, linha de água',
    en: 'Passes along a centreline: road, pipeline, watercourse',
  },
  'co.axis.title': { pt: 'Eixo e largura', en: 'Centreline and width' },
  'co.axis.draw': { pt: 'Desenhar o eixo', en: 'Draw the centreline' },
  'co.axis.clear': { pt: 'Limpar', en: 'Clear' },
  'co.axis.hint': {
    pt: 'Clique ao longo do eixo no mapa; duplo clique ou Concluir para terminar.',
    en: 'Click along the centreline on the map; double-click or Finish to end.',
  },
  'co.axis.none': {
    pt: 'Desenhe o eixo no mapa para gerar as passagens do corredor.',
    en: 'Draw the centreline on the map to generate the corridor passes.',
  },
  'co.axis.summary': { pt: '{len} m · meia-largura {b} m', en: '{len} m · half-width {b} m' },
  'co.axis.summaryNone': {
    pt: 'Por desenhar · meia-largura {b} m',
    en: 'Not drawn yet · half-width {b} m',
  },
  'co.lidarNote': {
    pt: 'Payload LiDAR: o espaçamento das passagens sai da largura de varrimento do feixe e a missão não leva acções de câmara, pelo que não há disparo a configurar.',
    en: 'LiDAR payload: pass spacing comes from the beam swath width and the mission carries no camera actions, so there is no trigger to configure.',
  },
  'co.params.buffer': { pt: 'Meia-largura', en: 'Half-width' },
  'co.params.bufferHint': {
    pt: 'Distância coberta de cada lado do eixo; a largura total é o dobro. O número de passagens sai daqui, da altura de voo e da sobreposição lateral.',
    en: 'Distance covered on each side of the centreline; total width is twice this. The pass count follows from it, the flight height and the side overlap.',
  },
  'co.width.double': { pt: 'o dobro', en: 'twice' },
  // o que a meia-largura dá: «10 passagens a 42.5 m em 10 troços, para…»
  'co.result.passes': { pt: '{n} passagens a {s} m', en: '{n} passes at {s} m' },
  'co.result.passesOne': { pt: '1 passagem', en: '1 pass' },
  'co.result.runs': { pt: 'em {r} troços', en: 'in {r} runs' },
  'co.result.runsOne': { pt: 'em 1 troço', en: 'in 1 run' },
  'co.result.rest': {
    pt: '{runs}, para a altura de {h} m e a sobreposição lateral de {o} %.',
    en: '{runs}, for the {h} m height and the {o} % side overlap.',
  },
  'co.short.dropped': {
    pt: '{n} passagem(ns) sem cobertura',
    en: '{n} pass(es) not covered',
  },
  'co.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'co.params.photoMode': { pt: 'Disparo', en: 'Trigger' },
  'co.params.photoDistance': { pt: 'Por distância', en: 'By distance' },
  'co.params.photoWaypoint': { pt: 'Por waypoint', en: 'Per waypoint' },
  'co.params.photoHint': {
    pt: 'Uma foto a cada {m} m da rota. Por waypoint, cada foto é um waypoint com acção própria.',
    en: 'One photo every {m} m along the route. Per waypoint, each photo is a waypoint with its own action.',
  },
  'co.params.stops': { pt: 'Paragem nos waypoints', en: 'Stop at waypoints' },
  'co.params.stopsCorners': { pt: 'Só nos cantos', en: 'Corners only' },
  'co.params.stopsAll': { pt: 'Em todos', en: 'At every waypoint' },
  'co.params.stopsHint': {
    pt: 'Só nos cantos, pára no fim de cada troço e passa sem parar pelas fotos e pelas dobras. Em todos, pára em cada waypoint e o tempo previsto conta as paragens.',
    en: 'Corners only stops at the end of each run and flies through photo points and bends. At every waypoint stops at each one, and the estimated time counts the stops.',
  },
  'co.flight.own': { pt: 'Próprias', en: 'Own' },
  'co.flight.byDistance': { pt: 'por distância', en: 'by distance' },
  'co.flight.byWaypoint': { pt: 'por waypoint', en: 'per waypoint' },
  'co.terrain.title': { pt: 'Relevo', en: 'Terrain' },
  'co.terrain.followWhat': {
    pt: '(cada passagem sobre o seu solo)',
    en: '(each pass over its own ground)',
  },
  'co.terrain.followOn': { pt: 'Segue o terreno', en: 'Follows the terrain' },
  'co.terrain.followOff': { pt: 'Sem seguir o terreno', en: 'Not following the terrain' },
  'co.terrain.hintShort': {
    pt: 'Cada passagem sobe e desce com o relevo debaixo dela e nos 30 m de cada lado, sem tecto. Ligado, pede a tolerância vertical.',
    en: 'Each pass rises and drops with the terrain beneath it and 30 m to each side, with no ceiling. When on, it asks for the vertical tolerance.',
  },
  'co.terrain.how': {
    pt: 'Como o corredor segue o relevo',
    en: 'How the corridor follows the terrain',
  },
  'co.terrain.hint': {
    pt: 'Cada passagem sobe e desce com o relevo debaixo dela e dos 30 m de cada lado, sem tecto (a altura é decisão do piloto); as dobras ficam e acrescentam-se os pontos que a tolerância exigir. A área e o corredor partilham o relevo carregado: um só MDT da DGT, ou o último levantamento da equipa, serve os dois.',
    en: 'Each pass rises and drops with the terrain beneath it and 30 m to each side, with no ceiling (the pilot decides the height); bends are kept and the points the tolerance requires are added. Area and corridor share the loaded terrain: one DGT DTM, or the team’s latest survey, serves both.',
  },
  'co.terrain.global': { pt: 'Relevo global (~30 m)', en: 'Global terrain (~30 m)' },
  'co.terrain.noTerrain': { pt: 'Sem relevo carregado', en: 'No terrain loaded' },
  // a fonte do relevo no resumo da secção
  'co.terrain.globalShort': { pt: 'relevo global', en: 'global terrain' },
  'co.terrain.noTerrainShort': { pt: 'sem relevo', en: 'no terrain' },
  'co.terrain.sameAsArea': { pt: 'O mesmo relevo da área', en: 'The same terrain as the area' },
  'co.terrain.covers': {
    pt: 'Cobre o corredor · o mesmo relevo da área',
    en: 'Covers the corridor · the same terrain as the area',
  },
  'co.terrain.notCovers': {
    pt: 'Não cobre o corredor todo · o mesmo relevo da área',
    en: 'Does not cover the whole corridor · the same terrain as the area',
  },
  'co.terrain.outOfCoverage': {
    pt: 'O corredor sai fora do relevo carregado: volte a descarregar ou importe um MDT que o cubra.',
    en: 'The corridor extends beyond the loaded terrain: download it again or import a DTM that covers it.',
  },
  'co.terrain.refLabel': {
    pt: 'Cota de referência das alturas',
    en: 'Reference elevation of the heights',
  },
  'co.terrain.refBaseShort': { pt: 'base marcada', en: 'marked base' },
  'co.terrain.refMinShort': { pt: 'mínima debaixo da rota', en: 'minimum under the route' },
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
  'co.plan.length': { pt: 'Comprimento do eixo', en: 'Centreline length' },
  'co.plan.passesValue': { pt: '{n} a {s} m', en: '{n} at {s} m' },
  'co.plan.width': { pt: 'Largura coberta', en: 'Covered width' },
  'co.plan.distance': { pt: 'Distância de voo', en: 'Flight distance' },
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
  'fp.panel.label': { pt: 'Parâmetros da missão de face', en: 'Face mission parameters' },
  'fp.panel.description': {
    pt: 'Serpentina vertical ao longo de um talude, afloramento ou fachada',
    en: 'Vertical serpentine along a slope, outcrop or façade',
  },
  'fp.baseline.title': { pt: 'Pé da face', en: 'Foot of the face' },
  'fp.baseline.draw': { pt: 'Desenhar', en: 'Draw' },
  'fp.baseline.clear': { pt: 'Limpar', en: 'Clear' },
  'fp.baseline.hint': {
    pt: 'Clique no mapa ao longo do pé da face; duplo clique ou Concluir para terminar.',
    en: 'Click on the map along the foot of the face; double-click or Finish to end.',
  },
  'fp.baseline.direction': {
    pt: 'O sentido em que desenha define a esquerda e a direita da linha.',
    en: 'The direction you draw in defines the left and right of the line.',
  },
  'fp.baseline.drawnLeft': {
    pt: 'Desenhado no mapa · voo à esquerda',
    en: 'Drawn on the map · flight on the left',
  },
  'fp.baseline.drawnRight': {
    pt: 'Desenhado no mapa · voo à direita',
    en: 'Drawn on the map · flight on the right',
  },
  'fp.cameraRequired': {
    pt: 'O modo Face precisa de um payload de câmara — escolha uma em «Aeronave e sensor», acima.',
    en: 'Face mode needs a camera payload — choose one in “Aircraft and sensor”, above.',
  },
  'fp.params.title': { pt: 'Parâmetros da face', en: 'Face parameters' },
  'fp.params.summary': {
    pt: 'Altura {h} m · afastamento {s} m · {v}/{o} %',
    en: 'Height {h} m · standoff {s} m · {v}/{o} %',
  },
  'fp.params.height': { pt: 'Altura da face', en: 'Face height' },
  'fp.params.standoff': { pt: 'Afastamento (standoff)', en: 'Standoff' },
  'fp.params.side': { pt: 'Lado do voo', en: 'Flight side' },
  'fp.params.sideLeft': { pt: 'Esquerda', en: 'Left' },
  'fp.params.sideRight': { pt: 'Direita', en: 'Right' },
  'fp.params.sideHint': {
    pt: 'Em relação ao sentido do desenho; a face fica do lado oposto ao drone.',
    en: 'Relative to the drawing direction; the face sits opposite the drone.',
  },
  'fp.side.sketchLeft': {
    pt: 'Visto de cima: a linha desenhada com o seu sentido, o drone à esquerda dela e a face do lado oposto',
    en: 'Seen from above: the drawn line with its direction, the drone on its left and the face on the opposite side',
  },
  'fp.side.sketchRight': {
    pt: 'Visto de cima: a linha desenhada com o seu sentido, o drone à direita dela e a face do lado oposto',
    en: 'Seen from above: the drawn line with its direction, the drone on its right and the face on the opposite side',
  },
  'fp.params.vOverlap': { pt: 'Sobreposição vertical', en: 'Vertical overlap' },
  'fp.params.hOverlap': { pt: 'Sobreposição horizontal', en: 'Horizontal overlap' },
  'fp.params.gimbal': { pt: 'Inclinação do gimbal', en: 'Gimbal pitch' },
  'fp.params.minClearance': { pt: 'Folga mínima', en: 'Minimum clearance' },
  'fp.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'fp.plan.noBaseline': {
    pt: 'Desenhe o pé da face no mapa para gerar as passagens.',
    en: 'Draw the foot of the face on the map to generate the passes.',
  },
  'fp.plan.passes': { pt: '{n} passagens × {pts} pontos', en: '{n} passes × {pts} points' },
  // o resto da frase da caixa azul, depois de «2 passagens × 25 pontos,»
  'fp.result': {
    pt: 'com {v} m de passo vertical · GSD de {gsd} cm/px na face',
    en: 'with a {v} m vertical step · GSD of {gsd} cm/px on the face',
  },
  'fp.tile.passesSub': { pt: 'pontos, passo {v} m', en: 'points, {v} m step' },
  'fp.tile.gsd': { pt: 'GSD na face', en: 'GSD on the face' },
  'fp.tile.gsdSub': { pt: 'a {d} m', en: 'at {d} m' },
  'fp.warn.bottom': {
    pt: 'Altura mínima de segurança de {floor} m: os primeiros {n} m no pé da face ficam sem cobertura — a esta distância a imagem tem {img} m de altura e a passagem mais baixa não pode descer mais. Aumente o afastamento para a imagem cobrir mais altura, ou fotografe o pé da face à parte.',
    en: 'Safety floor of {floor} m: the bottom {n} m of the face are left uncovered — at this distance the image is {img} m tall and the lowest pass cannot go any lower. Raise the standoff so that the image covers more height, or shoot the foot of the face separately.',
  },
  'fp.warn.unverifiedLead': {
    pt: 'Afastamento não verificado contra o terreno.',
    en: 'Standoff not verified against the terrain.',
  },
  'fp.warn.unverified': {
    pt: 'Sem MDT/MDS local, o relevo global não tem resolução à escala de uma face e a folga mínima fica por medir.',
    en: 'Without a local DTM/DSM, the global terrain lacks resolution at face scale and the minimum clearance cannot be measured.',
  },
  'fp.warn.importDem': {
    pt: 'Importar um GeoTIFF em Área e relevo',
    en: 'Import a GeoTIFF in Area and terrain',
  },
  'fp.warn.importDemHint': {
    pt: 'Abre o separador Área: um GeoTIFF importado em «Área e relevo» activa a verificação de folga.',
    en: 'Opens the Area tab: a GeoTIFF imported in “Area and terrain” enables the clearance check.',
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
  // os avisos da secção, em poucas palavras (a dica da etiqueta)
  'fp.short.bottom': { pt: 'pé da face por cobrir', en: 'foot of the face not covered' },
  'fp.short.unverified': { pt: 'afastamento não verificado', en: 'standoff not verified' },
  'fp.short.clearance': { pt: 'folga abaixo do mínimo', en: 'clearance below the minimum' },
  'fp.short.noData': { pt: 'face fora do modelo local', en: 'face outside the local model' },
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
  'fp.kmz.waypoints': {
    pt: 'Um waypoint por posição de foto, com rumo próprio, virado para a face.',
    en: 'One waypoint per photo position, with its own heading, facing the face.',
  },
  'fp.kmz.single': {
    pt: 'Em cada ponto: paragem e uma foto, com a espera antes dela, se a houver.',
    en: 'At each point: a stop and one photo, with the wait before it, if any.',
  },

  'fp.kmz.multi': {
    pt: 'Em cada ponto: gimbal e foto, por cada uma das {k} inclinações; a espera, se a houver, só antes da primeira.',
    en: 'At each point: gimbal and photo, for each of the {k} pitches; the wait, if any, only before the first.',
  },
  'fp.kmz.heightsBase': {
    pt: 'Alturas relativas à descolagem escolhida (a base {b}, ou o pé da face).',
    en: 'Heights relative to the chosen take-off (base {b}, or the foot of the face).',
  },
  'fp.kmz.heightsFoot': {
    pt: 'Alturas relativas à descolagem escolhida (o pé da face, ou uma base).',
    en: 'Heights relative to the chosen take-off (the foot of the face, or a base).',
  },
  'fp.takeoff.other': {
    pt: 'A outra escolha é descolar no pé da face, à cota dele.',
    en: 'The other choice is to take off at the foot of the face, at its elevation.',
  },

  /* ---- Painel de órbita (E1.2) ---- */
  'op.panel.label': { pt: 'Parâmetros da missão de órbita', en: 'Orbit mission parameters' },
  'op.panel.description': {
    pt: 'Anéis a várias alturas em torno de um ponto: chaminé, antena ou afloramento',
    en: 'Rings at several heights around a point: chimney, antenna or outcrop',
  },
  'op.poi.title': { pt: 'Ponto de interesse (POI)', en: 'Point of interest (POI)' },
  'op.poi.mark': { pt: 'Marcar POI', en: 'Mark POI' },
  'op.poi.clear': { pt: 'Remover', en: 'Remove' },
  'op.poi.hint': {
    pt: 'Clique no mapa sobre o centro do alvo; o marcador fica arrastável.',
    en: 'Click the map on the target centre; the marker stays draggable.',
  },

  'op.poi.centre': { pt: 'Centro do alvo', en: 'Target centre' },
  'op.poi.summary': { pt: '{poi} · centro a {h} m', en: '{poi} · centre at {h} m' },
  'op.poi.marking': {
    pt: 'A marcar: clique no centro do alvo',
    en: 'Marking: click the target centre',
  },
  'op.poi.none': { pt: 'Por marcar', en: 'Not marked yet' },
  'op.poi.marked': { pt: 'Marcado', en: 'Marked' },
  'op.poi.height': { pt: 'Altura do centro do alvo', en: 'Target centre height' },
  'op.poi.heightHint': {
    pt: 'Acima do chão no POI. Em fotografia e em vídeo, o gimbal de cada nível aponta a esta altura; com várias inclinações valem os ângulos da secção 4.',
    en: 'Above the ground at the POI. In photo and video, each level’s gimbal aims at this height; with several pitches, the angles of section 4 apply.',
  },
  'op.capture.title': { pt: 'Captura', en: 'Capture' },
  'op.capture.photo': { pt: 'Fotografia (anéis)', en: 'Photo (rings)' },
  'op.capture.video': { pt: 'Vídeo (espiral)', en: 'Video (spiral)' },
  'op.capture.multi': {
    pt: 'Várias inclinações (com paragem)',
    en: 'Several pitches (with stops)',
  },
  'op.capture.photoDesc': {
    pt: 'Uma foto por ponto, com altura, gimbal e sobreposição iguais em cada nível: fotogrametria.',
    en: 'One photo per point, with the same height, gimbal and overlap across each level: photogrammetry.',
  },
  'op.capture.videoDesc': {
    pt: 'Espiral contínua, uma volta por passo, a gravar do primeiro ao último ponto; sem fotos.',
    en: 'Continuous spiral, one turn per step, recording from the first to the last point; no photos.',
  },
  'op.capture.multiDesc': {
    pt: 'Pára em cada ponto e tira uma foto por inclinação: vê por baixo dos beirais e por cima das coberturas.',
    en: 'Stops at each point and takes one photo per pitch: it sees under eaves and over roofs.',
  },
  'op.capture.hover': { pt: 'Espera ao chegar', en: 'Wait on arrival' },
  'op.capture.hoverHint': {
    pt: 'Em cada ponto, antes da primeira foto; conta no tempo de voo.',
    en: 'At each point, before the first photo; it counts in the flight time.',
  },
  /* ---- Várias inclinações (com paragem), órbita e face ---- */
  'shots.title': {
    pt: 'Inclinações do gimbal, por ordem de disparo',
    en: 'Gimbal pitches, in shooting order',
  },
  'shots.angle': { pt: 'Inclinação {n}', en: 'Pitch {n}' },
  'shots.remove': { pt: 'Retirar a inclinação {n}', en: 'Remove pitch {n}' },
  'shots.add': { pt: 'Inclinação', en: 'Pitch' },
  'shots.addName': { pt: 'Acrescentar uma inclinação', en: 'Add a pitch' },
  'shots.hint': {
    pt: 'De {lo}° a {hi}° (o limite do gimbal, {max}°, menos 5°), até {n} por ponto. Em cada ponto: gimbal, espera (só antes da primeira) e foto, por inclinação; fotos e tempo multiplicam-se por {k}.',
    en: 'From {lo}° to {hi}° (the gimbal limit, {max}°, minus 5°), up to {n} per point. At each point: gimbal, wait (before the first only) and photo, per pitch; photos and time multiply by {k}.',
  },
  'shots.hintLevels': {
    pt: 'De {lo}° a {hi}° (o limite do gimbal, {max}°, menos 5°), até {n} por ponto, iguais em todos os níveis. Em cada ponto: gimbal, espera (só antes da primeira) e foto, por inclinação; fotos e tempo multiplicam-se por {k}.',
    en: 'From {lo}° to {hi}° (the gimbal limit, {max}°, minus 5°), up to {n} per point, the same at every level. At each point: gimbal, wait (before the first only) and photo, per pitch; photos and time multiply by {k}.',
  },
  'op.geom.title': { pt: 'Geometria da órbita', en: 'Orbit geometry' },
  'op.geom.summary': {
    pt: 'Raio {r} m · {n} níveis de {h0} a {h1} m · {o} %',
    en: 'Radius {r} m · {n} levels from {h0} to {h1} m · {o} %',
  },
  'op.geom.summaryOne': {
    pt: 'Raio {r} m · 1 nível a {h0} m · {o} %',
    en: 'Radius {r} m · 1 level at {h0} m · {o} %',
  },
  'op.geom.radius': { pt: 'Raio', en: 'Radius' },
  'op.geom.gsdTarget': { pt: 'GSD pretendido no alvo', en: 'Target GSD at range' },
  'op.geom.gsdHint': {
    pt: 'O raio e o GSD andam juntos: escrever um acerta o outro.',
    en: 'Radius and GSD go together: typing one sets the other.',
  },
  'op.geom.levels': { pt: 'Número de níveis', en: 'Number of levels' },
  'op.geom.firstLevel': { pt: 'Primeiro nível', en: 'First level' },
  'op.geom.step': { pt: 'Passo vertical', en: 'Vertical step' },
  'op.geom.overlap': { pt: 'Sobreposição horizontal', en: 'Horizontal overlap' },
  'op.geom.direction': { pt: 'Sentido da volta', en: 'Turn direction' },
  'op.geom.cw': { pt: 'Horário', en: 'Clockwise' },
  'op.geom.ccw': { pt: 'Anti-horário', en: 'Anticlockwise' },
  'op.geom.speed': { pt: 'Velocidade', en: 'Speed' },
  'op.lidarNote': {
    pt: 'Sem câmara não há fotos, e os pontos por volta usam um passo por omissão (24/volta). Para fotografar, escolha uma câmara em «Aeronave e sensor», acima.',
    en: 'Without a camera there are no photos, and the points per turn fall back to a default (24/turn). To take photos, choose a camera in “Aircraft and sensor”, above.',
  },
  // a caixa dos anéis, por baixo da geometria
  'op.result.rings': { pt: '{n} anéis, raio {r} m', en: '{n} rings, radius {r} m' },
  'op.result.ringsOne': { pt: '1 anel, raio {r} m', en: '1 ring, radius {r} m' },
  'op.result.spiral': {
    pt: 'Espiral de {n} voltas, raio {r} m',
    en: 'Spiral of {n} turns, radius {r} m',
  },
  'op.result.points': { pt: '{pts} pontos por volta', en: '{pts} points per turn' },
  'op.result.heights': {
    pt: 'alturas acima do chão do POI',
    en: 'heights above the ground at the POI',
  },
  'op.result.heightsVideo': {
    pt: 'de {h0} a {h1} m acima do chão do POI',
    en: 'from {h0} to {h1} m above the ground at the POI',
  },
  'op.result.sketch': {
    pt: 'Vista de lado: {n} anéis de {r} m de raio, a {list} m acima do chão do POI',
    en: 'Side view: {n} rings of {r} m radius, at {list} m above the ground at the POI',
  },
  'op.plan.noPoi': {
    pt: 'Marque o POI no mapa para gerar as órbitas.',
    en: 'Mark the POI on the map to generate the orbits.',
  },
  'op.plan.gimbalsVideo': { pt: 'gimbal de {a}° a {b}°', en: 'gimbal from {a}° to {b}°' },
  'op.plan.gimbals': { pt: 'gimbal por nível: {v}', en: 'gimbal per level: {v}' },
  'op.tile.turns': { pt: 'Voltas', en: 'Turns' },
  'op.tile.video': { pt: 'Gravação', en: 'Recording' },
  'op.tile.videoSub': { pt: 'vídeo contínuo, sem fotos', en: 'continuous video, no photos' },
  'op.tile.gsd': { pt: 'GSD no alvo', en: 'GSD at the target' },
  'op.exportPerLevel': {
    pt: 'Exportar um KMZ por nível (ZIP)',
    en: 'Export one KMZ per level (ZIP)',
  },
  'op.perLevel.desc': {
    pt: '{n} KMZ, um por nível; não existe em vídeo',
    en: '{n} KMZ, one per level; not available in video',
  },
  'op.perLevelFile': { pt: 'por nível,', en: 'per level,' },
  'op.sameAsHeader': {
    pt: 'O KMZ é o mesmo do botão do cabeçalho.',
    en: 'The KMZ is the same as the header button’s.',
  },
  'op.perLevel.one': { pt: 'Só com dois níveis ou mais', en: 'Only with two levels or more' },
  'op.perLevel.video': {
    pt: 'Não existe em vídeo: a gravação é uma só e não se fatia por nível',
    en: 'Not in video: the recording is a single one and is not split per level',
  },
  'op.kmz.heading': {
    pt: 'Rumo ao POI em todos os pontos.',
    en: 'Heading at the POI at every point.',
  },
  // {c1}, {c2}…: os nomes técnicos do WPML, em letra de código
  'op.kmz.photo': {
    pt: 'Em fotografia, voo curvo contínuo ({c1}) e uma foto por ponto.',
    en: 'In photo, continuous curved flight ({c1}) and one photo per point.',
  },

  'op.kmz.multi': {
    pt: 'Com várias inclinações, pára em cada ponto ({c1}), espera {s} s e tira uma foto por inclinação.',
    en: 'With several pitches, it stops at each point ({c1}), waits {s} s and takes one photo per pitch.',
  },

  'op.kmz.video': {
    pt: 'Em vídeo, um só KMZ a gravar do primeiro ao último ponto ({c1}/{c2}), com o gimbal a reapontar ao centro e a rodar sem degraus ({c3}); a câmara não fotografa enquanto grava.',
    en: 'In video, a single KMZ recording from the first to the last point ({c1}/{c2}), with the gimbal re-aimed at the centre and turning without steps ({c3}); the camera cannot shoot while recording.',
  }, // sem espera, ou quando não é o modo escolhido
  'op.kmz.multiNoWait': {
    pt: 'Com várias inclinações, pára em cada ponto ({c1}) e tira uma foto por inclinação.',
    en: 'With several pitches, it stops at each point ({c1}) and takes one photo per pitch.',
  },
  'op.kmz.heightsBase': {
    pt: 'Alturas relativas à descolagem escolhida (a base {b}, ou o chão do POI); as acções de segurança e as alturas da secção 5.',
    en: 'Heights relative to the chosen take-off (base {b}, or the ground at the POI); the safety actions and heights from section 5.',
  },
  'op.kmz.heightsPoi': {
    pt: 'Alturas relativas à descolagem escolhida (o chão do POI, ou uma base); as acções de segurança e as alturas da secção 5.',
    en: 'Heights relative to the chosen take-off (the ground at the POI, or a base); the safety actions and heights from section 5.',
  },
  'op.takeoff.other': {
    pt: 'A outra escolha é descolar no chão do POI, à cota dele.',
    en: 'The other choice is to take off on the ground at the POI, at its elevation.',
  },

  /* ---- Resumo do projecto (E3.2) ---- */
  'ps.line': {
    pt: '{plans} planos · {min} min de voo · {bat} conjuntos de baterias · {photos} fotos',
    en: '{plans} plans · {min} min of flight · {bat} battery sets · {photos} photos',
  },

  /* ---- Painel circular (circlegrammetry) ---- */
  'ci.panel.label': { pt: 'Parâmetros da missão circular', en: 'Circular mission parameters' },
  'ci.panel.description': {
    pt: 'Círculos com a câmara oblíqua sobre a área (circlegrammetry)',
    en: 'Circles with the oblique camera over the area (circlegrammetry)',
  },
  'ci.area.title': { pt: 'Área a cobrir', en: 'Area to cover' },
  'ci.area.hint': {
    pt: 'Clique no mapa para desenhar o polígono; clique no primeiro vértice, duplo clique ou Concluir para fechar.',
    en: 'Click the map to draw the polygon; click the first vertex, double-click or Finish to close it.',
  },
  'ci.area.none': {
    pt: 'Desenhe a área no mapa, ou importe-a no separador Área: o polígono é o mesmo.',
    en: 'Draw the area on the map, or import it in the Area tab: the polygon is shared.',
  },
  'ci.area.shared': { pt: 'Polígono partilhado', en: 'Shared polygon' },
  'ci.area.tab': { pt: 'separador Área', en: 'Area tab' },
  'ci.area.sharedHint': {
    pt: 'Mover, editar vértices e importar fazem-se no separador Área.',
    en: 'Moving, vertex editing and import are done in the Area tab.',
  },
  'ci.area.summary': { pt: '{ha} ha · polígono da Área', en: '{ha} ha · Area polygon' },
  'ci.area.summaryShared': { pt: 'Polígono da Área', en: 'Area polygon' },
  'ci.params.title': { pt: 'Círculos', en: 'Circles' },
  'ci.params.summary': {
    pt: '{n} círculos de {r} m · {o} %',
    en: '{n} circles of {r} m · {o} %',
  },
  'ci.params.summaryNone': { pt: 'Raio {r} m · {o} %', en: 'Radius {r} m · {o} %' },
  'ci.params.radius': { pt: 'Raio', en: 'Radius' },
  'ci.params.overlap': { pt: 'Sobreposição entre círculos', en: 'Circle overlap' },
  'ci.params.overlapUnit': { pt: '% · 0–90', en: '% · 0–90' },
  'ci.params.overlapHint': {
    pt: 'Passo entre centros = 2R × (1 − sobreposição). O tempo sobe em degraus, um por círculo a mais; dentro de um degrau, mais sobreposição é menos voo fora da área.',
    en: 'Centre spacing = 2R × (1 − overlap). Time rises in steps, one per extra circle; within a step, more overlap means less flying outside the area.',
  },
  'ci.params.how': { pt: 'Como funciona', en: 'How it works' },
  'ci.params.step': { pt: 'Passo entre centros', en: 'Centre spacing' },
  'ci.params.stepFormula': { pt: '2R × (1 − {p} %)', en: '2R × (1 − {p} %)' },
  'ci.params.pitch': { pt: 'Inclinação do gimbal', en: 'Gimbal pitch' },
  'ci.params.pitchUnit': { pt: '° · −90 a −20', en: '° · −90 to −20' },
  'ci.params.pitchHint': {
    pt: 'Gimbal fixo em todos os pontos, rumo ao centro do círculo; −45° é o valor do estudo de referência. O eixo óptico toca o solo a {d} m do drone.',
    en: 'Fixed gimbal at every point, heading at the circle centre; −45° is the reference study value. The optical axis meets the ground {d} m from the drone.',
  },
  'ci.params.speed': { pt: 'Velocidade', en: 'Speed' },
  'ci.params.angle': { pt: 'Azimute das filas', en: 'Row azimuth' },
  'ci.params.angleAuto': { pt: 'auto', en: 'auto' },
  'ci.flight.summary': {
    pt: 'Gimbal {p}° · {v} m/s · {h} m · {f} %',
    en: 'Gimbal {p}° · {v} m/s · {h} m · {f} %',
  },
  // o conselho da sobreposição: «17 × 9 = 153 círculos com 50 %. …»
  'ci.advice.lead': { pt: '{cols} × {rows} = {n} círculos', en: '{cols} × {rows} = {n} circles' },
  'ci.advice': {
    pt: 'com {p} %. O mesmo número mantém-se de {min} % a {max} %; no topo do intervalo os círculos saem menos da área{ext}.',
    en: 'at {p} %. The same count holds from {min} % to {max} %; at the top of the range the circles overshoot the area less{ext}.',
  },
  // sem intervalo (o número só se tem com esta sobreposição): «de 50 % a 50 %»
  // não diz nada
  'ci.adviceExact': {
    pt: 'com {p} %; outra sobreposição muda o número. Os círculos saem da área {a} m ao longo e {b} m de través.',
    en: 'at {p} %; another overlap changes the count. The circles overshoot the area by {a} m along and {b} m across.',
  },
  'ci.adviceApply': { pt: 'Usar {max} %', en: 'Use {max} %' },
  // dentro de ci.advice, depois de «saem menos da área»
  'ci.plan.extension': {
    pt: ' (agora {a} m ao longo, {b} m de través)',
    en: ' (now {a} m along, {b} m across)',
  },
  'ci.plan.gsdLabel': { pt: 'GSD no eixo óptico', en: 'GSD on the optical axis' },
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
    pt: 'Deixa de contar no resumo do projecto; volta a existir quando se abre este separador. A área fica.',
    en: 'It no longer counts in the project summary; it comes back when this tab is opened. The area stays.',
  },
  'ci.plan.vsAreaLabel': {
    pt: 'Grelha do separador Área ({kind})',
    en: 'Area-tab grid ({kind})',
  },
  'ci.plan.vsAreaValue': { pt: '~{min} min', en: '~{min} min' },
  'ci.plan.kindSerpentine': { pt: 'serpentina', en: 'serpentine' },
  'ci.plan.kindCrosshatch': { pt: 'dupla grelha', en: 'crosshatch' },
  'ci.terrain.followWhat': { pt: '(altura por ponto)', en: '(per-point height)' },
  'ci.terrain.hint': {
    pt: 'Cada ponto sobe ou desce com o relevo debaixo dele, a partir da cota de referência (base com relevo, senão a mínima da área). Precisa de relevo que cubra os círculos, que saem da área até um raio.',
    en: 'Each point rises or drops with the terrain beneath it, from the reference elevation (base with terrain, otherwise the area minimum). It needs terrain covering the circles, which overshoot the area by up to one radius.',
  },
  'ci.terrain.shared': { pt: 'O mesmo relevo da área', en: 'The same terrain as the area' },
  'ci.blocks.title': { pt: 'Voos e baterias', en: 'Flights and batteries' },
  'ci.blocks.count': { pt: '{n} blocos, um por bateria', en: '{n} blocks, one per battery' },
  'ci.blocks.one': {
    pt: 'Um só voo: cabe numa bateria',
    en: 'A single flight: it fits one battery',
  },
  'ci.blocks.usable': { pt: '{min} min úteis cada', en: '{min} usable min each' },
  'ci.blocks.longest': {
    pt: 'Bloco mais longo',
    en: 'Longest block',
  },
  // depois do âmbar da barra: «99 % do tempo útil (âmbar acima de 90 %): quase sem folga…»
  'ci.blocks.margin': {
    pt: 'quase sem folga para o vento e o frio',
    en: 'barely any margin for wind and cold',
  },
  'ci.blocks.hint': {
    pt: 'Os círculos juntam-se em blocos, pela ordem de voo, até encher o tempo útil; a deslocação desde a base conta. O tempo útil é o do separador Área (Divisão em voos).',
    en: 'Circles are grouped into blocks, in flight order, until the usable time is full; the transit from the base counts. The usable time is the Area tab’s (Split into flights).',
  },
  'ci.tile.circlesSub': { pt: '× {pts} pontos', en: '× {pts} points' },
  'ci.tile.blocks': { pt: '{n} blocos', en: '{n} blocks' },
  'ci.exportBlocks': {
    pt: 'Exportar um KMZ por bloco (ZIP)',
    en: 'Export one KMZ per block (ZIP)',
  },
  'ci.blocksExport.desc': {
    pt: '{n} KMZ, um por bloco de bateria',
    en: '{n} KMZ, one per battery block',
  },
  'ci.blocksExport.one': {
    pt: 'Só com dois blocos ou mais: a missão cabe numa bateria',
    en: 'Only with two blocks or more: the mission fits one battery',
  },
  'ci.exportHint': {
    pt: 'Voo curvo contínuo, rumo ao centro do círculo, gimbal fixo e uma foto por ponto; cada círculo entra e sai pelo ponto virado ao anterior. Alturas relativas ao ponto de descolagem.',
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
  'co.params.ownHint': {
    pt: 'Começam nos valores do separador Área; só valem para este corredor.',
    en: 'They start at the Area tab values; they only apply to this corridor.',
  },
  // «As do separador Área (Parâmetros de voo): 100 m acima da descolagem · …»
  'co.params.fromArea': {
    pt: 'As do separador Área (Parâmetros de voo):',
    en: 'The Area tab’s (Flight parameters):',
  },
  // {b1}: o valor, a negrito
  'co.params.fromAreaHeight': { pt: '{b1} acima da descolagem', en: '{b1} above take-off' },
  'co.params.fromAreaOverlap': { pt: 'sobreposição {b1}', en: 'overlap {b1}' },
  'co.params.fromAreaSide': { pt: 'sobreposição lateral {b1}', en: 'side overlap {b1}' },
  'co.params.fromAreaGsd': { pt: 'GSD {v} cm/px', en: 'GSD {v} cm/px' },
  'co.params.altitude': { pt: 'Altura acima da descolagem', en: 'Height above take-off' },
  'co.params.frontOverlap': { pt: 'Sobreposição frontal', en: 'Forward overlap' },
  'co.params.sideOverlap': { pt: 'Sobreposição lateral', en: 'Side overlap' },
  'co.flights.title': { pt: 'Voos e bases', en: 'Flights and bases' },
  'co.flights.one': { pt: 'Um só voo', en: 'A single flight' },
  'co.flights.table': { pt: 'Voos do corredor', en: 'Corridor flights' },
  'co.flights.flight': { pt: 'Voo', en: 'Flight' },
  'co.flights.base': { pt: 'Base', en: 'Base' },
  'co.flights.stretch': { pt: 'No troço', en: 'On the stretch' },
  'co.flights.withTransit': { pt: 'Com deslocação', en: 'With transit' },
  'co.split.title': { pt: 'Divisão em voos', en: 'Split into flights' },
  'co.split.none': { pt: 'Nenhuma', en: 'None' },
  'co.split.battery': { pt: 'Por bateria', en: 'By battery' },
  'co.split.hint': {
    pt: 'Troços iguais do eixo, cada um num voo que cabe nos {usable} min úteis (com 5 % de margem); os troços sobrepõem-se uma pegada no corte. Cada voo descola da base mais próxima, ou à cota mínima do seu troço.',
    en: 'Equal stretches of the centreline, each one a flight that fits the {usable} usable min (with a 5 % margin); stretches overlap by one footprint at each cut. Each flight takes off from the nearest base, or at the lowest elevation of its stretch.',
  },
  'co.tile.flightsSub': {
    pt: 'em {n} bases',
    en: 'from {n} bases',
  },
  'co.tile.flightsSubOne': {
    pt: 'em 1 base',
    en: 'from 1 base',
  },
  'co.tile.batteries': {
    pt: 'Baterias',
    en: 'Batteries',
  },
  'co.tile.batteriesSub': {
    pt: 'conjuntos necessários',
    en: 'sets needed',
  },
  'co.tile.batteriesSubOne': {
    pt: 'conjunto necessário',
    en: 'set needed',
  },
  'co.plan.runs': {
    pt: '{r} troços',
    en: '{r} runs',
  },
  'co.plan.runsOne': {
    pt: '1 troço',
    en: '1 run',
  },

  'co.split.err.too-many-flights': {
    pt: 'Seriam precisos mais de 60 voos: aumente o tempo útil da bateria ou reduza a largura do corredor.',
    en: 'More than 60 flights would be needed: increase the usable battery time or narrow the corridor.',
  },
  'co.bases.title': { pt: 'Bases', en: 'Bases' },
  'co.bases.nearest': { pt: 'cada voo usa a mais próxima', en: 'each flight uses the nearest' },
  'co.bases.none': { pt: 'sem bases', en: 'no bases' },
  'co.bases.list': { pt: 'bases {list}', en: 'bases {list}' },
  'co.bases.listOne': { pt: 'base {list}', en: 'base {list}' },
  'co.bases.flights': { pt: 'voos {list}', en: 'flights {list}' },
  'co.bases.flightsOne': { pt: 'voo {list}', en: 'flight {list}' },
  'co.bases.hint': {
    pt: 'Cada voo descola da sua base: as alturas do KMZ são relativas a ela. Tempo útil de {usable} min: o do separador Área (Divisão em voos).',
    en: 'Each flight takes off from its base: the KMZ heights are relative to it. Usable time of {usable} min: the Area tab’s (Split into flights).',
  },
  'co.export.zip': {
    pt: 'Um KMZ por voo ({list}) dentro de um ZIP. Com a divisão «Nenhuma», sai um só KMZ.',
    en: 'One KMZ per flight ({list}) inside a ZIP. With the “None” split, a single KMZ.',
  },
  'co.export.kmz': {
    pt: 'Um só KMZ com todas as passagens; com a divisão «Por bateria», um KMZ por voo dentro de um ZIP.',
    en: 'A single KMZ with every pass; with the “By battery” split, one KMZ per flight inside a ZIP.',
  },
  'ci.params.own': {
    pt: 'Altura e sobreposição frontal próprias',
    en: 'Own height and forward overlap',
  },
  'ci.params.ownHint': {
    pt: 'Começam nos valores do separador Área; só valem para o circular.',
    en: 'They start at the Area tab values; they only apply to the circular mission.',
  },
  'ci.params.fromAreaFront': {
    pt: 'sobreposição frontal {b1} (fotos ao longo do círculo)',
    en: 'forward overlap {b1} (photos along the circle)',
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
  'fp.capture.singleDesc': {
    pt: 'Com a inclinação do gimbal escrita abaixo.',
    en: 'At the gimbal pitch set below.',
  },
  'fp.capture.multiDesc': {
    pt: 'Pára em cada ponto e tira uma foto por inclinação: vê por baixo dos beirados e das varandas.',
    en: 'Stops at each point and takes one photo per pitch: it sees under eaves and balconies.',
  },
  'fp.capture.summarySingle': {
    pt: 'Uma foto por ponto · gimbal {p}°',
    en: 'One photo per point · gimbal {p}°',
  },
  'fp.capture.hint': {
    pt: 'Com várias inclinações, a inclinação do gimbal só espaça as passagens. A espera é um hover do WPML antes do disparo (com várias inclinações, só antes da primeira), para pouca luz ou a câmara térmica; conta no tempo de voo.',
    en: 'With several pitches, the gimbal pitch only spaces the passes. The wait is a WPML hover before the shot (with several pitches, before the first only), for low light or the thermal camera; it counts in the flight time.',
  },
  'fp.params.extendEnds': {
    pt: 'Prolongar as pontas meia imagem',
    en: 'Extend the ends by half an image',
  },
  'fp.params.extendEndsHint': {
    pt: 'A primeira e a última coluna de fotos ficam {m} m para lá das pontas, com a sobreposição do resto. Desligue junto a outras paredes.',
    en: 'The first and last photo columns sit {m} m beyond the ends, with the same overlap as the rest. Switch it off next to other walls.',
  },
  'fp.takeoff.foot': { pt: 'No pé da face', en: 'At the foot of the face' },
  'fp.takeoff.footShort': { pt: 'Pé da face', en: 'Foot of the face' },
  'fp.takeoff.footHint': {
    pt: 'Alturas relativas ao pé da face: descole à cota dele, ou escolha a base de onde vai descolar.',
    en: 'Heights relative to the foot of the face: take off at its elevation, or choose the base you will take off from.',
  },
  'op.takeoff.poi': { pt: 'No chão do POI', en: 'On the ground at the POI' },
  'op.takeoff.poiShort': { pt: 'Chão do POI', en: 'Ground at the POI' },
  'op.takeoff.poiHint': {
    pt: 'Alturas relativas ao chão do POI: descole à cota dele, ou escolha a base de onde vai descolar.',
    en: 'Heights relative to the ground at the POI: take off at its elevation, or choose the base you will take off from.',
  },
}
