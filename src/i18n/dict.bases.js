/** Bases de descolagem múltiplas: painel, mapa e mosaico (src/mission/bases.js, baseLayout.js). */
export default {
  'bases.title': { pt: 'Bases de descolagem', en: 'Take-off bases' },
  'bases.vlos': { pt: 'distância VLOS {m} m', en: 'VLOS range {m} m' },
  // a linha por cima da tabela das bases: quantas, a distância VLOS e o raio
  'bases.count': { pt: '{n} bases', en: '{n} bases' },
  'bases.countOne': { pt: '1 base', en: '1 base' },
  'bases.radiusDefault': { pt: 'raio {r} m', en: 'radius {r} m' },
  'bases.reducedWarn': {
    pt: '{n} bases com a zona reduzida',
    en: '{n} bases with a reduced zone',
  },
  'bases.reducedWarnOne': {
    pt: '1 base com a zona reduzida',
    en: '1 base with a reduced zone',
  },
  'bases.reducedWhy': {
    pt: 'pelo desnível perto do ponto.',
    en: 'because of the relief near the point.',
  },
  // as colunas da tabela das bases
  'bases.col.base': { pt: 'Base', en: 'Base' },
  'bases.col.flights': { pt: 'Voos', en: 'Flights' },
  'bases.col.zone': { pt: 'Zona', en: 'Zone' },
  'bases.col.ref': { pt: 'Cota', en: 'Elevation' },
  'bases.col.detail': { pt: 'Detalhe', en: 'Details' },
  'bases.none': {
    pt: 'Sem bases: as alturas referem-se à cota mínima do relevo debaixo da rota. Marque uma ou mais bases, ou proponha-as a partir dos blocos.',
    en: 'No bases: heights refer to the lowest terrain under the route. Set one or more bases, or propose them from the blocks.',
  },
  'bases.propose': { pt: 'Propor bases', en: 'Propose bases' },
  'bases.proposeTitle': {
    pt: 'Propõe bases para os blocos que nenhuma base vê inteiros dentro da distância VLOS; as suas bases ficam onde estão. Com relevo, prefere sítios planos e altos com o rádio livre (zona de Fresnel) para os blocos que servem, nunca um sítio baixo. Depois arraste, retire ou acrescente.',
    en: 'Proposes bases for the blocks that no base sees entirely within VLOS range; your bases stay where they are. With terrain it prefers flat, high sites with a clear radio link (Fresnel zone) to the blocks they serve, never a low one. Then drag, remove or add.',
  },
  'bases.proposing': { pt: 'A propor bases… {pct} %', en: 'Proposing bases… {pct} %' },
  'bases.proposeCancel': { pt: 'Cancelar', en: 'Cancel' },
  'bases.proposeCancelled': {
    pt: 'Proposta cancelada: as bases ficaram como estavam.',
    en: 'Proposal cancelled: the bases are as they were.',
  },
  'bases.proposeNeedsBlocks': {
    pt: 'Divida a área em blocos (bateria ou quadrícula) para propor bases.',
    en: 'Split the area into blocks (battery or tiles) to propose bases.',
  },
  'bases.proposed': {
    pt: '{n} base(s) proposta(s). Arraste-as para onde pode descolar; o raio da zona cobre o resto.',
    en: '{n} base(s) proposed. Drag them to where you can take off; the zone radius covers the rest.',
  },
  'bases.proposedNone': {
    pt: 'Todos os blocos já têm uma base que os vê inteiros dentro da distância VLOS.',
    en: 'Every block already has a base that sees it entirely within VLOS range.',
  },
  'bases.proposedOut': {
    pt: '{n} bloco(s) maiores do que a distância VLOS: ficaram com base própria no centro, mas continuam a excedê-la. Divida-os em blocos mais pequenos.',
    en: '{n} block(s) larger than the VLOS range: they got their own base at the centre, but still exceed it. Split them into smaller blocks.',
  },
  'bases.carryLost': {
    pt: '{n} atribuições manuais não passaram para a nova divisão: esses blocos ficaram com a base automática.',
    en: '{n} manual assignments did not carry over to the new split: those blocks got the automatic base.',
  },
  'bases.carryLostOne': {
    pt: '1 atribuição manual não passou para a nova divisão: esse bloco ficou com a base automática.',
    en: '1 manual assignment did not carry over to the new split: that block got the automatic base.',
  },
  'bases.carryDismiss': { pt: 'Dispensar o aviso', en: 'Dismiss this notice' },
  'bases.proposedRadio': {
    pt: '{n} base(s) sem sítio com o rádio livre em 95 % de cada um dos seus blocos: ficou o melhor que havia (ver as bacias de visão e o preflight).',
    en: '{n} base(s) without a site with a clear radio link over 95 % of each of their blocks: the best available was used (see the viewsheds and the preflight).',
  },
  'bases.maxPerBase': {
    pt: 'no máximo {n} voos por base',
    en: 'at most {n} flights per base',
  },
  'bases.clickAssignOff': {
    pt: 'Clique num bloco no mapa: activa / desactiva. Para passar blocos a uma base, carregue em «Atribuir blocos a esta base» (ou no marcador dela) e clique nos blocos.',
    en: 'Click a block on the map: enable / disable. To move blocks to a base, press “Assign blocks to this base” (or its marker) and click the blocks.',
  },
  'bases.clickAssignOn': {
    pt: 'Base {label} seleccionada: clique num bloco para o passar para {label}. Esc (ou um clique no marcador) desselecciona.',
    en: 'Base {label} selected: click a block to move it to {label}. Esc (or a click on the marker) deselects.',
  },
  'bases.label': { pt: 'Base {label}', en: 'Base {label}' },
  'bases.noFlights': { pt: 'sem voos', en: 'no flights' },
  'bases.gather': { pt: 'Atribuir blocos a esta base', en: 'Assign blocks to this base' },
  'bases.gatherTitle': {
    pt: 'Depois clique no mapa nos blocos que quer passar para a base {label} (o rótulo ou o quadrado), um a um. Um clique num bloco que já é dela deixa-o lá. «Terminar» ou Esc acaba.',
    en: 'Then click on the map the blocks you want to move to base {label} (their label or square), one by one. Clicking a block that is already its own leaves it there. “Done” or Esc ends.',
  },
  'bases.gatherOn': {
    pt: 'A atribuir blocos à base {label}: clique nos blocos no mapa.',
    en: 'Assigning blocks to base {label}: click the blocks on the map.',
  },
  'bases.gatherDone': { pt: 'Terminar', en: 'Done' },
  'bases.showZone': { pt: 'Mostrar a zona no mapa', en: 'Show the zone on the map' },
  'bases.showZoneTitle': {
    pt: 'A zona de descolagem da base {label} no mapa (com o raio pedido a tracejado, se foi reduzido). Outro clique ou Esc esconde-a.',
    en: 'The take-off zone of base {label} on the map (with the requested radius dashed, if it was reduced). Another click or Esc hides it.',
  },
  'bases.flights': { pt: 'voos {list}', en: 'flights {list}' },
  'bases.flightsOne': { pt: 'voo {list}', en: 'flight {list}' },
  'bases.zone': { pt: 'zona {r} m', en: 'zone {r} m' },
  'bases.zoneReduced': {
    pt: 'zona reduzida a {r} m (pedidos {req} m): {relief} m de desnível a {at} m',
    en: 'zone reduced to {r} m ({req} m requested): {relief} m of relief at {at} m',
  },
  'bases.zoneNoTerrain': {
    pt: 'fora do relevo carregado: cota de referência desconhecida',
    en: 'outside the loaded elevation data: reference elevation unknown',
  },
  'bases.zoneWaiting': {
    pt: 'zona {r} m (à espera do relevo)',
    en: 'zone {r} m (waiting for terrain)',
  },
  'bases.gain': {
    pt: 'cota de referência {ref} m · voo entre 0 e +{gain} m acima do planeado',
    en: 'reference elevation {ref} m · flight between 0 and +{gain} m above plan',
  },
  'bases.radius': { pt: 'Raio da zona', en: 'Zone radius' },
  'bases.radiusTitle': {
    pt: 'Raio pedido para a zona desta base (vazio = o da Configuração, {r} m)',
    en: 'Requested zone radius for this base (empty = the one in Settings, {r} m)',
  },
  'bases.remove': { pt: 'Retirar a base {label}', en: 'Remove base {label}' },
  'bases.markerTitle': {
    pt: 'Base {label}: arraste para mover, clique para seleccionar',
    en: 'Base {label}: drag to move, click to select',
  },
  'bases.flightLabel': {
    pt: 'Voo {flight} (bloco {id})',
    en: 'Flight {flight} (block {id})',
  },
  /* ---- Exportação por voo / por base (src/mission/flightFiles.js) ---- */
  'bases.export.title': { pt: 'Exportar voos', en: 'Export flights' },
  // dois pares iguais: os KMZ (a rota) e os KML (o polígono), todos soltos
  // num ZIP ou numa pasta por base
  'bases.export.kmzGroup': { pt: 'KMZ: a rota de cada voo', en: 'KMZ: the route of each flight' },
  'bases.export.kmlGroup': {
    pt: 'KML: o polígono de cada bloco',
    en: 'KML: the polygon of each block',
  },
  'bases.export.all': { pt: 'Todos os voos (KMZ, ZIP)', en: 'All flights (KMZ, ZIP)' },
  'bases.export.allTitle': {
    pt: 'Um KMZ por voo, pela ordem de voo, num ZIP: {file}',
    en: 'One KMZ per flight, in flight order, in a ZIP: {file}',
  },
  'bases.export.byBase': {
    pt: 'Voos por base (KMZ, ZIP)',
    en: 'Flights by base (KMZ, ZIP)',
  },
  'bases.export.byBaseTitle': {
    pt: 'Um ZIP com uma pasta por base (base-A/, base-B/…): com vários pilotos, cada um leva as pastas das suas bases. {file}',
    en: 'One ZIP with a folder per base (base-A/, base-B/…): with several pilots, each takes the folders of their bases. {file}',
  },
  'bases.export.one': { pt: 'Um voo (KMZ)', en: 'One flight (KMZ)' },
  'bases.export.oneSelect': { pt: 'Voo a exportar', en: 'Flight to export' },
  'bases.export.blocked': {
    pt: 'O preflight bloqueia a exportação: veja a lista ao lado do botão de exportar.',
    en: 'The preflight blocks the export: see the list next to the export button.',
  },
  'bases.export.names': {
    pt: 'O nome de cada KMZ é o do voo no mapa (ex.: {example}), e é o que o Pilot 2 mostra.',
    en: 'Each KMZ is named after its flight on the map (e.g. {example}), which is what Pilot 2 shows.',
  },
  'bases.export.kml': { pt: 'Bases e blocos (KML)', en: 'Bases and blocks (KML)' },
  'bases.export.kmlTitle': {
    pt: 'Para o Google Earth ou o telemóvel: bases com a ficha, zonas de descolagem e blocos com o rótulo do voo. Não é para o Pilot 2.',
    en: 'For Google Earth or a phone: bases with their sheet, take-off zones and blocks labelled with their flight. Not for Pilot 2.',
  },
  'bases.export.kmlAll': { pt: 'Todos os blocos (KML, ZIP)', en: 'All blocks (KML, ZIP)' },
  'bases.export.kmlAllTitle': {
    pt: 'Um ZIP com um KML por bloco, todos soltos, pela ordem de voo — só o polígono, para a missão de mapeamento do Pilot 2, que calcula a sua própria rota (confirme no comando a altura, o ângulo das faixas e o tempo). Os buracos ficam de fora. {file}',
    en: 'One ZIP with one KML per block, all loose, in flight order — the polygon only, for the Pilot 2 mapping mission, which plans its own route (check height, line angle and time on the controller). Holes are left out. {file}',
  },
  'bases.export.kmlByBase': { pt: 'Blocos por base (KML, ZIP)', en: 'Blocks by base (KML, ZIP)' },
  'bases.export.kmlByBaseTitle': {
    pt: 'Um ZIP com uma pasta por base e, em cada uma, um KML por bloco — só o polígono, para a missão de mapeamento do Pilot 2, que calcula a sua própria rota (confirme no comando a altura, o ângulo das faixas e o tempo) — e mapa/ com a base, a zona e os blocos, para o Google Earth ou o telemóvel. Os buracos ficam de fora. {file}',
    en: 'One ZIP with a folder per base and, in each, one KML per block — the polygon only, for the Pilot 2 mapping mission, which plans its own route (check height, line angle and time on the controller) — plus mapa/ with the base, the zone and the blocks, for Google Earth or a phone. Holes are left out. {file}',
  },
  'bases.kml.noBaseFolder': { pt: 'Blocos sem base', en: 'Blocks without a base' },
  'bases.kml.navigate': { pt: 'Abrir no Google Maps', en: 'Open in Google Maps' },
  'bases.kml.zone': {
    pt: 'descolar até {r} m do ponto',
    en: 'take off within {r} m of the point',
  },
  'bases.kml.zoneReduced': {
    pt: 'descolar até {r} m do ponto (reduzida de {req} m: {relief} m de desnível a {at} m)',
    en: 'take off within {r} m of the point (reduced from {req} m: {relief} m of relief at {at} m)',
  },
  'bases.kml.zoneName': { pt: 'Zona {label} ({r} m)', en: 'Zone {label} ({r} m)' },
  'bases.kml.flight': {
    pt: 'voo {flight}: {min} min com deslocação · {file}',
    en: 'flight {flight}: {min} min incl. transit · {file}',
  },
  'bases.kml.block': { pt: 'bloco {id}', en: 'block {id}' },
  'bases.kml.time': {
    pt: '{min} min com deslocação',
    en: '{min} min incl. transit',
  },
  /* ---- Ficha de campo por base (checklist e relatório) ---- */
  'bases.sheet.title': {
    pt: 'Bases de descolagem — ficha de campo',
    en: 'Take-off bases — field sheet',
  },
  'bases.sheet.open': { pt: 'abrir no mapa', en: 'open in maps' },
  'bases.sheet.openGeo': { pt: 'aplicação (geo:)', en: 'app (geo:)' },
  'bases.sheet.zone': { pt: 'Zona', en: 'Zone' },
  'bases.sheet.ref': { pt: 'Cota de referência', en: 'Reference elevation' },
  'bases.sheet.refValue': {
    pt: '{ref} m · voo entre 0 e +{gain} m acima do planeado',
    en: '{ref} m · flight between 0 and +{gain} m above plan',
  },
  'bases.sheet.rth': { pt: 'Regresso (RTH)', en: 'Return (RTH)' },
  'bases.sheet.heights': { pt: 'Altura no comando', en: 'Height on the controller' },
  'bases.sheet.heightsValue': {
    pt: '{range} m (rel. à descolagem)',
    en: '{range} m (rel. to take-off)',
  },
  'bases.sheet.pctUseful': { pt: '% do tempo útil', en: '% of usable time' },
  'bases.sheet.params': { pt: 'Parâmetros', en: 'Parameters' },
  'bases.sheet.paramsValue': {
    pt: 'altura {alt} m · {v} m/s · sobreposição {f}/{s} % · GSD {gsd} cm/px',
    en: 'height {alt} m · {v} m/s · overlap {f}/{s} % · GSD {gsd} cm/px',
  },
  'bases.sheet.day': {
    pt: 'Dia: {flights} voos · conjuntos de baterias: {sets} necessários · {team} na equipa',
    en: 'Day: {flights} flights · battery sets: {sets} needed · {team} in the team',
  },
  'bases.sheet.dayOne': {
    pt: 'Dia: 1 voo · conjuntos de baterias: 1 necessário · {team} na equipa',
    en: 'Day: 1 flight · battery sets: 1 needed · {team} in the team',
  },
  'bases.sheet.dayUnknown': {
    pt: 'Dia: {flights} voos · conjuntos de baterias: {sets} necessários (conjuntos da equipa por definir na Configuração)',
    en: 'Day: {flights} flights · battery sets: {sets} needed (team’s sets not set in Settings)',
  },
  'bases.sheet.dayUnknownOne': {
    pt: 'Dia: 1 voo · conjuntos de baterias: 1 necessário (conjuntos da equipa por definir na Configuração)',
    en: 'Day: 1 flight · battery sets: 1 needed (team’s sets not set in Settings)',
  },
  'bases.sheet.rthValue': {
    pt: '{rth} m acima da descolagem (a maior entre os voos desta base) · altura de segurança na descolagem: {takeoff} m',
    en: '{rth} m above take-off (the highest among this base’s flights) · take-off safety height: {takeoff} m',
  },
  'bases.sheet.batteries': { pt: 'Conjuntos de baterias', en: 'Battery sets' },
  'bases.sheet.setsKnown': {
    pt: '{flights} necessários · {sets} na equipa',
    en: '{flights} needed · {sets} in the team',
  },
  'bases.sheet.setsKnownOne': {
    pt: '1 necessário · {sets} na equipa',
    en: '1 needed · {sets} in the team',
  },
  'bases.sheet.setsUnknown': {
    pt: '{flights} necessários (conjuntos da equipa por definir na Configuração)',
    en: '{flights} needed (team’s sets not set in Settings)',
  },
  'bases.sheet.setsUnknownOne': {
    pt: '1 necessário (conjuntos da equipa por definir na Configuração)',
    en: '1 needed (team’s sets not set in Settings)',
  },
  'bases.sheet.setsShort': {
    pt: 'recarregar no campo ou voltar noutro dia',
    en: 'recharge in the field or come back another day',
  },
  'bases.sheet.vlos': { pt: 'Distância VLOS', en: 'VLOS range' },
  'bases.sheet.vlosValue': {
    pt: '{vlos} m · pior caso dos voos {worst} m',
    en: '{vlos} m · worst case of the flights {worst} m',
  },
  'bases.sheet.flight': { pt: 'Voo', en: 'Flight' },
  'bases.sheet.time': { pt: 'Tempo (min)', en: 'Time (min)' },
  'bases.sheet.transit': { pt: 'dos quais deslocação', en: 'of which transit' },
  'bases.sheet.file': { pt: 'Ficheiro KMZ', en: 'KMZ file' },
  'bases.sheet.total': { pt: 'Total da base', en: 'Base total' },
  'bases.sheet.outOfVlos': { pt: 'fora da distância VLOS', en: 'beyond VLOS range' },
  'bases.sheet.view': { pt: 'Vista da base', en: 'Seen from base' },
  'bases.sheet.viewTerrain': { pt: 'Bacias de visão', en: 'Viewsheds' },
  /* ---- Folha A4 de cada base (a ficha da checklist, com o código QR) ---- */
  'bases.a4.title': { pt: 'Ficha de campo da base {label}', en: 'Field sheet of base {label}' },
  'bases.a4.flight': { pt: 'Voo {list}', en: 'Flight {list}' },
  'bases.a4.flights': { pt: 'Voos {list}', en: 'Flights {list}' },
  'bases.a4.order': { pt: '{n}.º voo de {total}', en: 'flight {n} of {total}' },
  'bases.a4.orderMany': { pt: 'voos {range} de {total}', en: 'flights {range} of {total}' },
  'bases.a4.prev': { pt: 'antes {flight}', en: 'after {flight}' },
  'bases.a4.next': { pt: 'depois {flight}', en: 'before {flight}' },
  'bases.a4.sub': { pt: 'Ficha de campo', en: 'Field sheet' },
  'bases.a4.date': { pt: 'Data', en: 'Date' },
  'bases.a4.pilot': { pt: 'Piloto', en: 'Pilot' },
  'bases.a4.warnDropTitle': {
    pt: 'Descole a menos de {r} m do ponto.',
    en: 'Take off within {r} m of the point.',
  },
  'bases.a4.warnDrop': {
    pt: 'Há {relief} m de desnível a {at} m da base (zona pedida: {req} m): mais longe, o voo pode ficar até {drop} m mais baixo do que o planeado. Sem sítio plano, mova a base.',
    en: 'There are {relief} m of relief at {at} m from the base ({req} m zone requested): further out, the flight may be up to {drop} m lower than planned. With no flat ground, move the base.',
  },
  'bases.a4.warnReduced': {
    pt: 'Há {relief} m de desnível a {at} m da base (zona pedida: {req} m).',
    en: 'There are {relief} m of relief at {at} m from the base ({req} m zone requested).',
  },
  'bases.a4.warnZeroTitle': {
    pt: 'Descole no ponto marcado.',
    en: 'Take off at the marked point.',
  },
  'bases.a4.warnZero': {
    pt: 'Já a {at} m do ponto há {relief} m de desnível (zona pedida: {req} m): mais longe, o voo pode ficar até {drop} m mais baixo do que o planeado. Sem sítio plano, mova a base.',
    en: 'Already at {at} m from the point there are {relief} m of relief ({req} m zone requested): further out, the flight may be up to {drop} m lower than planned. With no flat ground, move the base.',
  },
  'bases.a4.warnNoTerrain': {
    pt: 'Base fora do relevo carregado: cota de referência desconhecida e zona por medir.',
    en: 'Base outside the loaded terrain: reference elevation unknown and zone not measured.',
  },
  'bases.a4.zone': { pt: 'Zona de descolagem', en: 'Take-off zone' },
  'bases.a4.zoneSub': { pt: 'raio · pedidos {req} m', en: 'radius · {req} m requested' },
  'bases.a4.zoneSubFull': { pt: 'raio', en: 'radius' },
  'bases.a4.zoneSubNoTerrain': {
    pt: 'raio pedido, por medir',
    en: 'requested radius, not measured',
  },
  'bases.a4.relTakeoff': { pt: 'rel. à descolagem', en: 'rel. to take-off' },
  'bases.a4.aboveTakeoff': { pt: 'acima da descolagem', en: 'above take-off' },
  'bases.a4.time': { pt: 'Tempo do voo', en: 'Flight time' },
  'bases.a4.timeMany': { pt: 'Tempo dos voos', en: 'Time of the flights' },
  'bases.a4.useful': { pt: '{pct} % de {useful} min úteis', en: '{pct} % of {useful} usable min' },
  'bases.a4.usefulMany': {
    pt: 'máx. {pct} % de {useful} min úteis',
    en: 'max {pct} % of {useful} usable min',
  },
  'bases.a4.withTransit': { pt: 'com a deslocação', en: 'incl. transit' },
  'bases.a4.manyFlights': { pt: '{n} voos, com a deslocação', en: '{n} flights, incl. transit' },
  'bases.a4.where': { pt: 'Onde descolar', en: 'Where to take off' },
  'bases.a4.point': { pt: 'Ponto da base (WGS84)', en: 'Base point (WGS84)' },
  'bases.a4.qrHint': {
    pt: 'Leia o código com o telemóvel para abrir o ponto no Google Maps e seguir até lá.',
    en: 'Scan the code with a phone to open the point in Google Maps and navigate there.',
  },
  'bases.a4.qrLabel': {
    pt: 'Código QR com a ligação do Google Maps para o ponto da base {label}, {coords}',
    en: 'QR code with the Google Maps link to the point of base {label}, {coords}',
  },
  'bases.a4.distance': { pt: 'Distância ao ponto da base', en: 'Distance from the base point' },
  'bases.a4.relief': { pt: '{m} m de desnível', en: '{m} m of relief' },
  'bases.a4.requested': { pt: '{m} m pedidos', en: '{m} m requested' },
  'bases.a4.here': { pt: 'descolar aqui', en: 'take off here' },
  'bases.a4.reducedZone': {
    pt: 'zona pedida, reduzida pelo desnível',
    en: 'requested zone, reduced by the relief',
  },
  'bases.a4.diagram': {
    pt: 'Zona de descolagem da base {label}: até {r} m do ponto.',
    en: 'Take-off zone of base {label}: within {r} m of the point.',
  },
  'bases.a4.diagramReduced': {
    pt: 'Zona de descolagem da base {label}: até {r} m do ponto. Há {relief} m de desnível a {at} m; a zona pedida era de {req} m.',
    en: 'Take-off zone of base {label}: within {r} m of the point. There are {relief} m of relief at {at} m; the requested zone was {req} m.',
  },
  'bases.a4.heights': { pt: 'Alturas e alcance', en: 'Heights and range' },
  'bases.a4.gain': { pt: 'Voo acima do planeado', en: 'Flight above plan' },
  'bases.a4.gainValue': { pt: 'entre 0 e +{gain} m', en: 'between 0 and +{gain} m' },
  'bases.a4.takeoff': { pt: 'Altura de segurança na descolagem', en: 'Take-off safety height' },
  'bases.a4.vlosValue': {
    pt: '{vlos} m · pior caso {worst} m',
    en: '{vlos} m · worst case {worst} m',
  },
  'bases.a4.sets': { pt: '{n} necessários', en: '{n} needed' },
  'bases.a4.setsOne': { pt: '1 necessário', en: '1 needed' },
  'bases.a4.setsTeam': { pt: '{sets} na equipa', en: '{sets} in the team' },
  'bases.a4.setsUnknown': {
    pt: 'Conjuntos da equipa por definir na Configuração.',
    en: 'Team’s battery sets not set in Settings.',
  },
  'bases.a4.flightTable': { pt: 'Voo desta base', en: 'Flight from this base' },
  'bases.a4.flightTableMany': { pt: 'Voos desta base', en: 'Flights from this base' },
  'bases.a4.file': { pt: 'Ficheiro KMZ (abrir no Pilot 2)', en: 'KMZ file (open in Pilot 2)' },
  'bases.a4.total': { pt: 'Tempo total', en: 'Total time' },
  'bases.a4.transit': { pt: 'Deslocação', en: 'Transit' },
  'bases.a4.check': {
    pt: 'Ao abrir {flights} no DJI Pilot 2, confira:',
    en: 'When opening {flights} in DJI Pilot 2, check:',
  },
  'bases.a4.safety': {
    pt: 'no fim da missão: {finish} · perda de sinal: {lost}',
    en: 'at the end of the mission: {finish} · signal loss: {lost}',
  },
  'bases.a4.before': { pt: 'Antes de descolar · críticos', en: 'Before take-off · critical' },
  'bases.a4.beforeZone': {
    pt: 'Descolar a menos de {r} m do ponto',
    en: 'Take off within {r} m of the point',
  },
  'bases.a4.beforeZero': { pt: 'Descolar no ponto marcado', en: 'Take off at the marked point' },
  'bases.a4.log': { pt: 'Registo do voo {flight}', en: 'Log of flight {flight}' },
  'bases.a4.logMany': { pt: 'Registo dos voos', en: 'Flight log' },
  'bases.a4.start': { pt: 'Hora início', en: 'Start time' },
  'bases.a4.end': { pt: 'Hora fim', en: 'End time' },
  'bases.a4.duration': { pt: 'Duração (min)', en: 'Duration (min)' },
  'bases.a4.planned': { pt: 'previstos {m}', en: '{m} planned' },
  'bases.a4.batteries': { pt: 'Bateria(s)', en: 'Battery(ies)' },
  'bases.a4.images': { pt: 'N.º imagens', en: 'No. of images' },
  'bases.a4.weather': { pt: 'Meteo', en: 'Weather' },
  'bases.a4.notes': { pt: 'Observações', en: 'Remarks' },
  'bases.a4.signature': { pt: 'Assinatura do piloto', en: 'Pilot’s signature' },
  'bases.a4.hour': { pt: 'Hora', en: 'Time' },
  'bases.a4.view': {
    pt: 'Vista da base: {model}{caveat}; do melhor ponto da zona de descolagem de cada voo (com vegetação somada, do ponto da base), à altura dos olhos da Configuração.',
    en: 'Seen from the base: {model}{caveat}; from the best point of each flight’s take-off zone (with vegetation added, from the base point), at the eye height in Settings.',
  },
  'bases.a4.viewDtm': {
    pt: ', que não tem árvores, edifícios nem escombreiras',
    en: ', which has no trees, buildings or spoil heaps',
  },
  'bases.a4.viewDsm': {
    pt: ' (já com a vegetação e as construções)',
    en: ' (already with the vegetation and buildings)',
  },
  'bases.a4.footer': {
    pt: 'ficha da base {label} ({n} de {total})',
    en: 'sheet of base {label} ({n} of {total})',
  },
  /* ---- Bacias de visão (src/mission/viewshedPlan.js) ---- */
  'bases.view.title': { pt: 'Bacias de visão', en: 'Viewsheds' },
  'bases.view.layer': { pt: 'Mostrar no mapa', en: 'Show on the map' },
  'bases.view.layerTitle': {
    pt: 'Pinta no mapa, a laranja, as partes de cada bloco em que a aeronave fica atrás do relevo visto do ponto da base, e a percentagem visível de cada bloco.',
    en: 'Paints on the map, in orange, the parts of each block where the aircraft is behind the terrain seen from the base point, and the visible percentage of each block.',
  },
  'bases.view.flights': { pt: 'Vista: {list}', en: 'Seen: {list}' },
  'bases.view.visible': { pt: '{flight} {pct} %', en: '{flight} {pct} %' },
  'bases.view.hidden': {
    pt: '{flight} {pct} % (tapado a ~{m} m do piloto)',
    en: '{flight} {pct} % (blocked at ~{m} m from the pilot)',
  },
  'bases.view.eye': {
    pt: 'olhos a {m} m {dir} da base',
    en: 'eyes {m} m {dir} of the base',
  },
  'bases.view.eyeTitle': {
    pt: 'O melhor ponto da zona de descolagem para ver este voo: o piloto anda até lá (a vista conta a partir dele).',
    en: 'The best point of the take-off zone to watch this flight: the pilot walks there (the view is counted from it).',
  },
  'bases.dir.N': { pt: 'N', en: 'N' },
  'bases.dir.NE': { pt: 'NE', en: 'NE' },
  'bases.dir.E': { pt: 'E', en: 'E' },
  'bases.dir.SE': { pt: 'SE', en: 'SE' },
  'bases.dir.S': { pt: 'S', en: 'S' },
  'bases.dir.SW': { pt: 'SO', en: 'SW' },
  'bases.dir.W': { pt: 'O', en: 'W' },
  'bases.dir.NW': { pt: 'NO', en: 'NW' },
  'bases.view.visiblePct': { pt: '{pct} % visível', en: '{pct} % visible' },
  'bases.view.hiddenAt': {
    pt: 'tapado a ~{m} m do piloto',
    en: 'blocked at ~{m} m from the pilot',
  },
  'bases.view.noTerrain': {
    pt: 'À espera do relevo carregado sobre a área.',
    en: 'Waiting for terrain loaded over the area.',
  },
  'bases.view.pending': { pt: 'a calcular…', en: 'computing…' },
  'bases.view.model': { pt: 'Relevo: {model}.', en: 'Terrain: {model}.' },
  'bases.view.global': { pt: 'relevo global ~30 m', en: 'global terrain ~30 m' },
  'bases.view.file': {
    pt: 'MDT importado «{label}» ({res} m)',
    en: 'imported DTM “{label}” ({res} m)',
  },
  'bases.view.fileDsm': {
    pt: 'MDS importado «{label}» ({res} m)',
    en: 'imported DSM “{label}” ({res} m)',
  },
  'bases.view.fileDsmNoLabel': { pt: 'MDS importado ({res} m)', en: 'imported DSM ({res} m)' },
  'bases.view.plusObstacle': {
    pt: '+ {m} m de vegetação e obstáculos',
    en: '+ {m} m of vegetation and obstacles',
  },
  'bases.view.caveatDsm': {
    pt: 'O MDS já tem a vegetação e as construções: não se lhe soma nada.',
    en: 'The DSM already has the vegetation and buildings: nothing is added to it.',
  },
  'bases.view.caveatObstacle': {
    pt: 'Os {m} m somam-se a todo o relevo a mais de 30 m da base (pessimista em campo aberto); com o MDS da equipa o resultado fica mais próximo do que se vê.',
    en: 'The {m} m are added to all terrain more than 30 m from the base (pessimistic in open ground); the team’s DSM gives a result closer to what you see.',
  },
  'bases.view.radioRule': {
    pt: 'Rádio: 60 % da 1.ª zona de Fresnel a 2,4 GHz livre, da antena do comando.',
    en: 'Radio: 60 % of the 1st Fresnel zone at 2.4 GHz clear, from the controller antenna.',
  },
  'bases.view.radio': {
    pt: '[rádio em risco em {pct} %, a ~{m} m]',
    en: '[radio at risk in {pct} %, at ~{m} m]',
  },
  'bases.view.radioAt': {
    pt: 'rádio em risco em {pct} % (Fresnel a ~{m} m)',
    en: 'radio at risk in {pct} % (Fresnel at ~{m} m)',
  },
  'bases.view.obstacle': {
    pt: 'Vegetação e obstáculos a somar ao relevo',
    en: 'Vegetation and obstacles added to the terrain',
  },
  'bases.view.obstacleTitle': {
    pt: 'Altura de árvores, edifícios e escombreiras (0–60 m) somada ao relevo nas linhas de vista e no rádio, a mais de 30 m da base, desta missão. Só com um MDT ou o relevo global; um MDS importado já os tem.',
    en: 'Height of trees, buildings and spoil heaps (0–60 m) added to the terrain in the sight lines and the radio check, more than 30 m from the base, for this mission. Only with a DTM or the global terrain; an imported DSM already has them.',
  },
  'bases.view.fileNoLabel': { pt: 'MDT importado ({res} m)', en: 'imported DTM ({res} m)' },
  'bases.view.caveat': {
    pt: 'Um MDT não tem árvores, edifícios nem escombreiras: some a sua altura em «Vegetação e obstáculos», ou importe o MDS da equipa, que dá um resultado mais próximo do que se vê.',
    en: 'A DTM has no trees, buildings or spoil heaps: add their height in “Vegetation and obstacles”, or import the team’s DSM, which gives a result closer to what you see.',
  },
  'bases.view.point': {
    pt: 'Vistas do melhor ponto da zona de descolagem para cada voo («olhos a X m … da base»; com vegetação somada, do ponto da base), à altura dos olhos da Configuração.',
    en: 'Seen from the best point of the take-off zone for each flight (“eyes X m … of the base”; with vegetation added, from the base point), at the eye height in Settings.',
  },
  'cp.split.orientationAuto': {
    pt: 'Quadrados paralelos às faixas',
    en: 'Squares parallel to the flight lines',
  },
  'cp.split.orientationAutoHint': {
    pt: 'Lados dos quadrados ao longo das linhas de voo ({deg}°); desligue para escolher a orientação.',
    en: 'Square edges along the flight lines ({deg}°); turn off to choose the orientation.',
  },
  'cp.split.transitCorner': {
    pt: '(com a deslocação de uma base num canto do bloco, {r} m de zona)',
    en: '(including transit from a base at a corner of the block, {r} m zone)',
  },
}
