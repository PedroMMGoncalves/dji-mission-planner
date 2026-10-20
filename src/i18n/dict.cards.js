/** Painéis em cartões e gavetas (src/components/Cards.jsx) e acções de segurança. */
export default {
  'cards.more': { pt: 'Mais opções', en: 'More options' },
  'cards.moreFor': { pt: 'Mais opções: {title}', en: 'More options: {title}' },
  'cards.drawerTitle': { pt: '{title} — mais opções', en: '{title} — more options' },
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
  'cards.splitNone': {
    pt: 'Sem divisão: a missão sai num só voo. Escolhida uma divisão, as opções dela aparecem aqui.',
    en: 'No split: the mission is a single flight. Once a split is chosen, its options appear here.',
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
  'cards.bases.noView': {
    pt: 'As bacias de visão aparecem aqui quando a área está dividida em voos e há bases.',
    en: 'Viewsheds appear here once the area is split into flights and there are bases.',
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
  'cards.summary.exportMissionTitle': {
    pt: 'A mesma exportação do botão «Exportar WPML Avançado» do cabeçalho, atrás do preflight.',
    en: 'The same export as the header “Export Advanced WPML” button, behind the preflight.',
  },
  'cards.summary.exportArea': { pt: 'Área em KML', en: 'Area as KML' },
  'cards.summary.exportAreaTitle': {
    pt: 'O polígono da área em KML (o mesmo do botão «Exportar KML da área» do cabeçalho).',
    en: 'The area polygon as KML (the same as the header “Export area KML” button).',
  },

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
  'safety.takeoffHeight': { pt: 'Altura de segurança na descolagem', en: 'Take-off safety height' },
  'safety.rthHeight': { pt: 'Altura de regresso (RTH)', en: 'Return-to-home (RTH) height' },
  'safety.auto': { pt: 'auto', en: 'auto' },
  'safety.heightsHint': {
    pt: 'Vazio = automática: 30 m de subida vertical antes da deslocação, e o RTH acima do ponto mais alto de cada voo (no mínimo 100 m). Um valor escrito vale para todos os voos e entra nas verificações da deslocação; a aeronave pode impor os seus limites.',
    en: 'Empty = automatic: a 30 m vertical climb before the transit, and the RTH above the highest point of each flight (at least 100 m). A typed value applies to every flight and to the transit checks; the aircraft may impose its own limits.',
  },
}
