/** Painéis em cartões e gavetas (src/components/Cards.jsx) e acções de segurança. */
export default {
  'cards.more': { pt: 'Mais opções', en: 'More options' },
  'cards.moreFor': { pt: 'Mais opções: {title}', en: 'More options: {title}' },
  'cards.close': { pt: 'Fechar as opções de {title}', en: 'Close the {title} options' },
  'cards.closeTitle': { pt: 'Fechar (Esc)', en: 'Close (Esc)' },
  'cards.panel': { pt: 'Painel da missão', en: 'Mission panel' },
  'cards.missionName': { pt: 'Nome da missão', en: 'Mission name' },
  'cards.aircraft': { pt: 'Aeronave', en: 'Aircraft' },
  /* ---- Aeronave e sensor no topo dos outros modos (AircraftPicker) ---- */
  'ap.title': { pt: 'Aeronave e sensor', en: 'Aircraft and sensor' },
  'ap.camera': {
    pt: '{camera} · focal {focal} mm · gimbal de {min}° a {max}°',
    en: '{camera} · focal length {focal} mm · gimbal from {min}° to {max}°',
  },
  'ap.noCamera': {
    pt: '{desc}: sem câmara, esta missão não tira fotos. Para fotografar, escolha um payload de câmara.',
    en: '{desc}: no camera, so this mission takes no photos. To take photos, choose a camera payload.',
  },
  'ap.custom': {
    pt: 'O sensor próprio edita-se no cartão 1 do separador Área.',
    en: 'The custom sensor is edited in card 1 of the Area tab.',
  },
  'cards.crs': { pt: 'Sistema de coordenadas do ficheiro', en: 'Coordinate system of the file' },
  'cards.lineAzimuth': { pt: 'Azimute das faixas (°)', en: 'Line azimuth (°)' },
  'cards.inspectName': { pt: 'Nome do ponto {n}', en: 'Name of point {n}' },
  'cards.mission': { pt: 'Missão', en: 'Mission' },
  'cards.area': { pt: 'Área e relevo', en: 'Area and terrain' },
  'cards.flight': { pt: 'Parâmetros de voo', en: 'Flight parameters' },
  'cards.split': { pt: 'Divisão em voos', en: 'Split into flights' },
  'cards.bases': { pt: 'Bases e segurança', en: 'Bases and safety' },
  'cards.extras': { pt: 'Extras', en: 'Extras' },
  'cards.summary': { pt: 'Resumo e exportar', en: 'Summary and export' },
  'cards.lines': { pt: 'Linhas de voo', en: 'Flight lines' },
  'cards.capture': { pt: 'Disparo e câmara', en: 'Trigger and camera' },
  'cards.passes': { pt: 'Passagens extra', en: 'Extra passes' },
  'cards.anchorShape': { pt: 'Forma centrada num ponto', en: 'Shape centred on a point' },
  'cards.terrainSource': { pt: 'Fonte do relevo', en: 'Terrain source' },
  'cards.terrainReload': {
    pt: 'Reimportar o MDT ou voltar ao relevo global',
    en: 'Re-import the DTM or go back to global terrain',
  },
  'cards.slope': { pt: 'Declive', en: 'Slope' },
  'cards.slopeAvailable': {
    pt: 'Declive médio de {slope}°: há uma sugestão de azimute das faixas em «Mais opções».',
    en: 'Mean slope of {slope}°: a line-azimuth suggestion is under “More options”.',
  },
  'cards.cells': { pt: 'Células e blocos', en: 'Cells and blocks' },
  'cards.preset': { pt: 'Tipo de levantamento', en: 'Survey type' },
  'cards.sensor': { pt: 'Sensor', en: 'Sensor' },
  'cards.extras.summary': {
    pt: 'GCPs: {gcp} · pontos de inspecção: {n}',
    en: 'GCPs: {gcp} · inspection points: {n}',
  },
  'cards.extras.gcpOff': { pt: 'não planeados', en: 'not planned' },
  'cards.extras.inspecting': {
    pt: 'A marcar pontos de inspecção: cada clique no mapa acrescenta um. A lista e a exportação estão em «Mais opções».',
    en: 'Placing inspection points: each click on the map adds one. The list and the export are under “More options”.',
  },
  'cards.summary.flights': { pt: 'Voos', en: 'Flights' },
  'cards.summary.sets': { pt: 'Conjuntos de baterias', en: 'Battery sets' },
  'cards.summary.setsValue': {
    pt: '{n} necessários · {s} na equipa',
    en: '{n} needed · {s} in the team',
  },
  'cards.summary.setsValueOne': {
    pt: '1 necessário · {s} na equipa',
    en: '1 needed · {s} in the team',
  },
  'cards.summary.setsUnknown': { pt: '{n} necessários', en: '{n} needed' },
  'cards.summary.setsUnknownOne': { pt: '1 necessário', en: '1 needed' },
  'cards.summary.longest': {
    pt: 'Voo mais longo / tempo útil',
    en: 'Longest flight / usable time',
  },
  'cards.versionNote': {
    pt: 'Projecto gravado com a versão {v}; esta é a {now}. Desde então mudou:',
    en: 'Project saved with version {v}; this is {now}. Since then:',
  },
  'cards.versionNoteOld': {
    pt: 'Projecto gravado por uma versão anterior à {now}. Desde então mudou:',
    en: 'Project saved by a version earlier than {now}. Since then:',
  },
  'cards.versionNoteHint': {
    pt: 'Reveja o plano antes de reexportar: o quadrado ou o voo com o mesmo rótulo pode já não ser o mesmo.',
    en: 'Review the plan before re-exporting: the square or flight with the same label may no longer be the same one.',
  },
  'cards.versionNoteClose': { pt: 'Entendido', en: 'Got it' },

  // acções de segurança (src/mission/safety.js)
  'safety.title': { pt: 'Acções de segurança', en: 'Safety actions' },
  'safety.finish': { pt: 'No fim da missão', en: 'At the end of the mission' },
  'safety.finishHint': {
    pt: 'O que a aeronave faz depois do último waypoint. Por omissão regressa ao ponto de descolagem, à altura de regresso.',
    en: 'What the aircraft does after the last waypoint. By default it returns to the take-off point at the return height.',
  },
  'safety.finish.goHome': {
    pt: 'Regressar ao ponto de descolagem (RTH)',
    en: 'Return to home (RTH)',
  },
  'safety.finish.noAction': { pt: 'Pairar no último ponto', en: 'Hover at the last point' },
  'safety.finish.autoLand': { pt: 'Aterrar no local', en: 'Land in place' },
  'safety.finish.gotoFirstWaypoint': {
    pt: 'Voltar ao primeiro waypoint',
    en: 'Go back to the first waypoint',
  },
  'safety.rcLost': { pt: 'Perda de sinal', en: 'Signal loss' },
  'safety.rcLost.executeLostAction': { pt: 'Interromper a missão', en: 'Stop the mission' },
  'safety.rcLost.goContinue': {
    pt: 'Continuar a missão até ao fim',
    en: 'Continue the mission to the end',
  },
  'safety.rcLostHint': {
    pt: 'Se o sinal do comando se perder, a missão pára e a aeronave executa a acção abaixo.',
    en: 'If the remote controller signal is lost, the mission stops and the aircraft performs the action below.',
  },
  'safety.rcLostContinueHint': {
    pt: 'Sem sinal, a aeronave acaba a rota sem comando e depois executa a acção de fim da missão.',
    en: 'Without signal the aircraft finishes the route uncontrolled and then performs the end-of-mission action.',
  },
  'safety.rcLostAction': { pt: 'Acção ao interromper', en: 'Action when stopped' },
  'safety.rcLostActionHint': {
    pt: 'Só se aplica quando a perda de sinal interrompe a missão.',
    en: 'Only applies when the signal loss stops the mission.',
  },
  'safety.rcAction.goBack': {
    pt: 'Regressar ao ponto de descolagem (RTH)',
    en: 'Return to home (RTH)',
  },
  'safety.rcAction.landing': { pt: 'Aterrar', en: 'Land' },
  'safety.rcAction.hover': { pt: 'Pairar', en: 'Hover' },
  'safety.checklist': {
    pt: 'Acções de segurança no KMZ',
    en: 'Safety actions in the KMZ',
  },
  'safety.checklistLine': {
    pt: 'No fim da missão: {finish} · perda de sinal: {lost}',
    en: 'At the end of the mission: {finish} · signal loss: {lost}',
  },
  'safety.checklistStop': { pt: '{mode}, depois {action}', en: '{mode}, then {action}' },
  'safety.rth': {
    pt: 'Regresso (RTH): {rth} m acima da descolagem · altura de segurança na descolagem: {takeoff} m',
    en: 'Return (RTH): {rth} m above take-off · take-off safety height: {takeoff} m',
  },
  'safety.rthHint': {
    pt: 'Escritos no KMZ: sem valor escrito, o RTH fica acima do ponto mais alto da rota (mínimo 100 m); tem de livrar o relevo e os obstáculos no regresso.',
    en: 'Written in the KMZ: with no typed value, the RTH sits above the highest point of the route (minimum 100 m); it must clear the terrain and obstacles on the way back.',
  },
  'cards.summary.blocked': {
    pt: 'Exportação bloqueada pelo preflight:',
    en: 'Export blocked by the preflight:',
  },
  'cards.summary.seeAll': { pt: 'Ver todos no preflight', en: 'See all in the preflight' },
  'safety.checklistHint': {
    pt: 'Confirmar no DJI Pilot 2, ao abrir a rota, que são estas; a altura de regresso (RTH) do comando tem de livrar o relevo e os obstáculos.',
    en: 'Confirm in DJI Pilot 2, when opening the route, that these are the ones; the controller return (RTH) height must clear the terrain and obstacles.',
  },

  /* ---- Alturas de segurança escritas pelo piloto ---- */
  // curto, para caber ao lado do RTH (as duas dicas por baixo dizem o que é)
  'safety.takeoffHeight': { pt: 'Altura na descolagem', en: 'Take-off height' },
  'safety.rthHeight': { pt: 'Altura de regresso (RTH)', en: 'Return-to-home (RTH) height' },
  'safety.auto': { pt: 'auto', en: 'auto' },
  'safety.heightsHint': {
    pt: 'Vazio = automática: 30 m de subida vertical antes da deslocação, e o RTH acima do ponto mais alto de cada voo (no mínimo 100 m). Um valor escrito vale para todos os voos e entra nas verificações da deslocação; a aeronave pode impor os seus limites.',
    en: 'Empty = automatic: a 30 m vertical climb before the transit, and the RTH above the highest point of each flight (at least 100 m). A typed value applies to every flight and to the transit checks; the aircraft may impose its own limits.',
  },

  /* ---- Painel da área em secções (desenho aprovado, Outubro de 2026) ---- */
  'cards.areaSubtitle': {
    pt: 'Grelha sobre um polígono, para fotogrametria ou LiDAR',
    en: 'A grid over a polygon, for photogrammetry or LiDAR',
  },
  // a gaveta: o nome da secção e, por baixo, isto
  'cards.drawerSub': { pt: 'mais opções', en: 'more options' },
  // o que cada «Mais opções ›» abre
  'cards.moreAircraft': { pt: 'Mais opções da aeronave', en: 'More aircraft options' },
  'cards.moreArea': { pt: 'Datum vertical e mais opções', en: 'Vertical datum and more options' },
  'cards.moreFlight': {
    pt: 'Linhas de voo, disparo e câmara',
    en: 'Flight lines, trigger and camera',
  },
  'cards.moreCells': {
    pt: 'Células e orientação dos quadrados',
    en: 'Cells and square orientation',
  },
  'cards.sensorKind': { pt: 'Tipo de sensor', en: 'Sensor type' },
  'cards.extras.gcp': { pt: 'Pontos de apoio (GCP)', en: 'Ground control points (GCP)' },
  'cards.extras.inspect': { pt: 'Pontos de inspecção', en: 'Inspection points' },
  // a tabela dos voos da divisão
  'cards.col.flight': { pt: 'Voo', en: 'Flight' },
  'cards.col.area': { pt: 'Área', en: 'Area' },
  'cards.col.distance': { pt: 'Distância', en: 'Distance' },
  'cards.col.time': { pt: 'Tempo', en: 'Time' },
  'cards.flightsAll': { pt: 'Ver os {n} voos', en: 'See the {n} flights' },
  'cards.flightsFew': { pt: 'Ver menos voos', en: 'See fewer flights' },
  // por baixo dos interruptores da gaveta dos parâmetros de voo
  'cards.spacingAuto': {
    pt: 'Automático: {m} m, pela sobreposição lateral',
    en: 'Automatic: {m} m, from the side overlap',
  },
  'cards.spacingAutoNoValue': {
    pt: 'Automático, pela sobreposição lateral',
    en: 'Automatic, from the side overlap',
  },
  'cards.spacingManual': {
    pt: 'Manual: a distância escrita, em vez da sobreposição lateral',
    en: 'Manual: the typed distance, instead of the side overlap',
  },
  'cards.intervalAuto': {
    pt: 'Automático: {m} m, pela sobreposição frontal',
    en: 'Automatic: {m} m, from the forward overlap',
  },
  'cards.intervalAutoNoValue': {
    pt: 'Automático, pela sobreposição frontal',
    en: 'Automatic, from the forward overlap',
  },
  'cards.intervalManual': {
    pt: 'Manual: o ficheiro leva o valor escrito',
    en: 'Manual: the file carries the typed value',
  },
  /* ---- o essencial de uma secção fechada, numa linha ---- */
  'cards.sum.rtkOn': { pt: 'RTK ligado', en: 'RTK on' },
  'cards.sum.rtkOff': { pt: 'RTK desligado', en: 'RTK off' },
  'cards.sum.noArea': {
    pt: 'Sem área: desenhe-a no mapa ou importe-a',
    en: 'No area: draw it on the map or import it',
  },
  'cards.sum.dtmFile': { pt: 'MDT local {label} ({res} m)', en: 'local DTM {label} ({res} m)' },
  'cards.sum.dsmFile': { pt: 'MDS local {label} ({res} m)', en: 'local DSM {label} ({res} m)' },
  'cards.sum.terrainGlobal': { pt: 'relevo global (~30 m)', en: 'global terrain (~30 m)' },
  'cards.sum.noTerrain': { pt: 'sem relevo', en: 'no terrain' },
  'cards.sum.invalid': { pt: 'Polígono inválido', en: 'Invalid polygon' },
  'cards.sum.planError': { pt: 'O plano não sai: veja o aviso', en: 'No plan: see the notice' },
  'cards.sum.terrainError': { pt: 'Sem relevo sobre a área', en: 'No terrain over the area' },
  'cards.sum.datum': { pt: 'Datum vertical: {datum}', en: 'Vertical datum: {datum}' },
  'cards.sum.agl': { pt: '{m} m AGL', en: '{m} m AGL' },
  'cards.sum.rel': { pt: '{m} m acima da descolagem', en: '{m} m above take-off' },
  'cards.sum.tf': { pt: 'segue o terreno', en: 'follows the terrain' },
  'cards.sum.flights': { pt: '{n} voos de {range} min', en: '{n} flights of {range} min' },
  'cards.sum.flightsOne': { pt: '1 voo de {range} min', en: '1 flight of {range} min' },
  'cards.sum.splitNone': { pt: 'Nenhuma · um só voo', en: 'None · a single flight' },
  'cards.sum.grid': { pt: 'Grelha de blocos', en: 'Block grid' },
  'cards.sum.noBases': { pt: 'sem bases', en: 'no bases' },
  'cards.sum.takeoff': { pt: 'descolagem a {m} m', en: 'take-off at {m} m' },
  'cards.sum.noPlan': { pt: 'Sem plano', en: 'No plan' },
  'cards.sum.ready': { pt: 'sem bloqueios', en: 'no blockers' },
  'cards.sum.blocked': { pt: 'exportação bloqueada', en: 'export blocked' },
  'cards.sum.spacing': { pt: '{m} m entre faixas', en: '{m} m between lines' },
  'cards.sum.spacingManual': {
    pt: '{m} m entre faixas (manual)',
    en: '{m} m between lines (manual)',
  },
  'cards.sum.buffer': { pt: 'margem {pct} %', en: 'buffer {pct} %' },
  'cards.sum.trigger.distance': { pt: 'Por distância', en: 'By distance' },
  'cards.sum.trigger.time': { pt: 'Por tempo', en: 'By time' },
  'cards.sum.trigger.waypoint': { pt: 'Uma foto por waypoint', en: 'One photo per waypoint' },
  'cards.sum.intervalManual': { pt: 'intervalo manual', en: 'manual interval' },
  'cards.sum.gimbal': { pt: 'gimbal {deg}°', en: 'gimbal {deg}°' },
  'cards.sum.headingRoute': { pt: 'segue a rota', en: 'follows the route' },
  'cards.sum.headingFixed': { pt: 'rumo fixo a {deg}°', en: 'fixed heading {deg}°' },
  'cards.sum.cross': { pt: 'Dupla grelha', en: 'Crosshatch' },
  'cards.sum.crossNadir': { pt: 'Dupla grelha e nadir extra', en: 'Crosshatch and extra nadir' },
  'cards.sum.tie': { pt: 'faixa de amarração', en: 'tie line' },
  'cards.sum.passesNone': {
    pt: 'Sem dupla grelha nem faixa de amarração',
    en: 'No crosshatch or tie line',
  },
  'cards.sum.points': { pt: '{n} pontos', en: '{n} points' },
  'cards.sum.pointsOne': { pt: '1 ponto', en: '1 point' },
  // o estado à direita do título (o nome do ícone)
  'cards.status.ready': { pt: 'Pronto', en: 'Ready' },
  'cards.status.exportReady': { pt: 'Pronto a exportar', en: 'Ready to export' },
  'cards.status.blocked': { pt: 'Exportação bloqueada', en: 'Export blocked' },
  'cards.status.error': { pt: 'Com erros', en: 'Has errors' },
  /* ---- os números da secção «Resumo e exportar» ---- */
  'cards.tile.inBases': { pt: 'em {n} bases', en: 'from {n} bases' },
  'cards.tile.inBasesOne': { pt: 'em 1 base', en: 'from 1 base' },
  'cards.tile.total': { pt: 'Tempo total', en: 'Total time' },
  'cards.tile.inMission': { pt: '{time} na missão', en: '{time} on the mission' },
  'cards.tile.needed': { pt: 'necessários · {s} na equipa', en: 'needed · {s} in the team' },
  'cards.tile.neededOne': { pt: 'necessário · {s} na equipa', en: 'needed · {s} in the team' },
  'cards.tile.neededOnly': { pt: 'necessários', en: 'needed' },
  'cards.tile.neededOnlyOne': { pt: 'necessário', en: 'needed' },
  'cards.tile.photos': { pt: '{n} fotos', en: '{n} photos' },
  'cards.tile.photosOne': { pt: '1 foto', en: '1 photo' },
  /* ---- as acções de segurança numa linha ---- */
  'safety.finishShort.goHome': { pt: 'RTH no fim', en: 'RTH at the end' },
  'safety.finishShort.noAction': { pt: 'pairar no fim', en: 'hover at the end' },
  'safety.finishShort.autoLand': { pt: 'aterrar no fim', en: 'land at the end' },
  'safety.finishShort.gotoFirstWaypoint': {
    pt: '1.º waypoint no fim',
    en: '1st waypoint at the end',
  },
  'safety.lostShort.goContinue': { pt: 'sinal perdido: continuar', en: 'signal lost: continue' },
  'safety.lostShort.stop': {
    pt: 'sinal perdido: interromper e {action}',
    en: 'signal lost: stop and {action}',
  },
  'safety.actionShort.goBack': { pt: 'RTH', en: 'RTH' },
  'safety.actionShort.landing': { pt: 'aterrar', en: 'land' },
  'safety.actionShort.hover': { pt: 'pairar', en: 'hover' },
}
