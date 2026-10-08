/** Bases de descolagem múltiplas: painel, mapa e mosaico (src/mission/bases.js, baseLayout.js). */
export default {
  'bases.title': { pt: 'Bases de descolagem', en: 'Take-off bases' },
  'bases.vlos': { pt: 'alcance visual {m} m', en: 'visual range {m} m' },
  'bases.none': {
    pt: 'Sem bases: as alturas referem-se à cota mínima do relevo debaixo da rota. Marque uma ou mais bases, ou proponha-as a partir dos blocos.',
    en: 'No bases: heights refer to the lowest terrain under the route. Set one or more bases, or propose them from the blocks.',
  },
  'bases.propose': { pt: 'Propor bases', en: 'Propose bases' },
  'bases.proposeTitle': {
    pt: 'Propõe bases para os blocos que nenhuma base vê inteiros dentro do alcance visual; as suas bases ficam onde estão. Com relevo, prefere sítios planos e altos com o rádio livre (zona de Fresnel) para os blocos que servem, nunca um sítio baixo. Depois arraste, retire ou acrescente.',
    en: 'Proposes bases for the blocks that no base sees entirely within visual range; your bases stay where they are. With terrain it prefers flat, high sites with a clear radio link (Fresnel zone) to the blocks they serve, never a low one. Then drag, remove or add.',
  },
  'bases.proposing': { pt: 'A propor bases… {pct} %', en: 'Proposing bases… {pct} %' },
  'bases.proposeCancel': { pt: 'Cancelar', en: 'Cancel' },
  'bases.proposeCancelled': {
    pt: 'Proposta cancelada: as bases ficaram como estavam.',
    en: 'Proposal cancelled: the bases are as they were.',
  },
  'bases.proposeNeedsBlocks': {
    pt: 'Divida a área em blocos (bateria ou mosaico) para propor bases.',
    en: 'Split the area into blocks (battery or mosaic) to propose bases.',
  },
  'bases.proposed': {
    pt: '{n} base(s) proposta(s). Arraste-as para onde pode descolar; o raio da zona cobre o resto.',
    en: '{n} base(s) proposed. Drag them to where you can take off; the zone radius covers the rest.',
  },
  'bases.proposedNone': {
    pt: 'Todos os blocos já têm uma base que os vê inteiros dentro do alcance visual.',
    en: 'Every block already has a base that sees it entirely within visual range.',
  },
  'bases.proposedOut': {
    pt: '{n} bloco(s) maiores do que o alcance visual: ficaram com base própria no centro, mas não cabem.',
    en: '{n} block(s) larger than the visual range: they got their own base at the centre, but do not fit.',
  },
  'bases.carryLost': {
    pt: '{n} atribuições manuais não passaram para o novo mosaico: esses blocos ficaram com a base automática.',
    en: '{n} manual assignments did not carry over to the new mosaic: those blocks got the automatic base.',
  },
  'bases.carryLostOne': {
    pt: '1 atribuição manual não passou para o novo mosaico: esse bloco ficou com a base automática.',
    en: '1 manual assignment did not carry over to the new mosaic: that block got the automatic base.',
  },
  'bases.carryDismiss': { pt: 'Dispensar o aviso', en: 'Dismiss this notice' },
  'bases.proposedRadio': {
    pt: '{n} base(s) sem sítio com o rádio livre em 95 % de cada um dos seus blocos: ficou o melhor que havia (ver as bacias de visão e o preflight).',
    en: '{n} base(s) without a site with a clear radio link over 95 % of each of their blocks: the best available was used (see the viewsheds and preflight).',
  },
  'bases.maxPerBase': {
    pt: 'no máximo {n} voos por base',
    en: 'at most {n} flights per base',
  },
  'bases.clickAssignOff': {
    pt: 'Clique num bloco no mapa: activa / desactiva. Para passar blocos a uma base, carregue em «Juntar blocos a esta base» (ou no pino dela) e clique nos blocos.',
    en: 'Click a block on the map: enable / disable. To move blocks to a base, press “Gather blocks to this base” (or its pin) and click the blocks.',
  },
  'bases.clickAssignOn': {
    pt: 'Base {label} seleccionada: clique num bloco para o passar para {label}. Esc (ou um clique no pino) desselecciona.',
    en: 'Base {label} selected: click a block to move it to {label}. Esc (or a click on the pin) deselects.',
  },
  'bases.label': { pt: 'Base {label}', en: 'Base {label}' },
  'bases.noFlights': { pt: 'sem voos', en: 'no flights' },
  'bases.gather': { pt: 'Juntar blocos a esta base', en: 'Gather blocks to this base' },
  'bases.gatherTitle': {
    pt: 'Depois clique no mapa nos blocos que quer passar para a base {label} (o rótulo ou o quadrado), um a um. Um clique num bloco que já é dela deixa-o lá. «Terminar» ou Esc acaba.',
    en: 'Then click on the map the blocks you want to move to base {label} (their label or square), one by one. Clicking a block that is already its own leaves it there. “Done” or Esc ends.',
  },
  'bases.gatherOn': {
    pt: 'A juntar blocos à base {label}: clique nos blocos no mapa.',
    en: 'Gathering blocks to base {label}: click the blocks on the map.',
  },
  'bases.gatherDone': { pt: 'Terminar', en: 'Done' },
  'bases.flights': { pt: 'voos {list}', en: 'flights {list}' },
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
  'bases.radius': { pt: 'Raio', en: 'Radius' },
  'bases.radiusTitle': {
    pt: 'Raio pedido para a zona desta base (vazio = o da Configuração, {r} m)',
    en: 'Requested zone radius for this base (empty = the one in Settings, {r} m)',
  },
  'bases.remove': { pt: 'Retirar a base {label}', en: 'Remove base {label}' },
  'bases.select': {
    pt: 'Seleccionar a base {label} (mostra a zona no mapa)',
    en: 'Select base {label} (shows its zone on the map)',
  },
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
  'bases.export.all': { pt: 'Todos os voos (ZIP)', en: 'All flights (ZIP)' },
  'bases.export.allTitle': {
    pt: 'Um KMZ por voo, pela ordem de voo, num ZIP: {file}',
    en: 'One KMZ per flight, in flight order, in a ZIP: {file}',
  },
  'bases.export.byBase': {
    pt: 'Todos os voos por base (ZIP)',
    en: 'All flights by base (ZIP)',
  },
  'bases.export.byBaseTitle': {
    pt: 'Um ZIP com uma pasta por base (base-A/, base-B/…): com vários pilotos, cada um leva as pastas das suas bases. {file}',
    en: 'One ZIP with a folder per base (base-A/, base-B/…): with several pilots, each takes the folders of their bases. {file}',
  },
  'bases.export.base': { pt: 'Voos da base {label} (ZIP)', en: 'Base {label} flights (ZIP)' },
  'bases.export.baseTitle': {
    pt: 'Só os voos da base {label} ({list}): {file}',
    en: 'Only the flights of base {label} ({list}): {file}',
  },
  'bases.export.one': { pt: 'Um voo (KMZ)', en: 'One flight (KMZ)' },
  'bases.export.oneSelect': { pt: 'Voo a exportar', en: 'Flight to export' },
  'bases.export.blocked': {
    pt: 'O preflight bloqueia a exportação: veja a lista ao lado do botão de exportar.',
    en: 'Preflight blocks the export: see the list next to the export button.',
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
  'bases.kml.basesFolder': { pt: 'Bases', en: 'Bases' },
  'bases.kml.zonesFolder': { pt: 'Zonas de descolagem', en: 'Take-off zones' },
  'bases.kml.blocksFolder': { pt: 'Blocos (voos)', en: 'Blocks (flights)' },
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
    pt: 'voo {flight}: {min} min com trânsito · {file}',
    en: 'flight {flight}: {min} min incl. transit · {file}',
  },
  'bases.kml.block': { pt: 'bloco {id}', en: 'block {id}' },
  'bases.kml.time': {
    pt: '{min} min com trânsito',
    en: '{min} min incl. transit',
  },
  /* ---- Ficha de campo por base (checklist e relatório) ---- */
  'bases.sheet.title': {
    pt: 'Bases de descolagem — ficha de campo',
    en: 'Take-off bases — field sheet',
  },
  'bases.sheet.coords': { pt: 'Coordenadas (WGS84)', en: 'Coordinates (WGS84)' },
  'bases.sheet.open': { pt: 'abrir no mapa', en: 'open in maps' },
  'bases.sheet.openGeo': { pt: 'aplicação (geo:)', en: 'app (geo:)' },
  'bases.sheet.zone': { pt: 'Zona', en: 'Zone' },
  'bases.sheet.ref': { pt: 'Cota de referência', en: 'Reference elevation' },
  'bases.sheet.refValue': {
    pt: '{ref} m · voo entre 0 e +{gain} m acima do planeado',
    en: '{ref} m · flight between 0 and +{gain} m above plan',
  },
  'bases.sheet.batteries': { pt: 'Conjuntos de baterias', en: 'Battery sets' },
  'bases.sheet.setsKnown': {
    pt: '{flights} necessários · a equipa tem {sets}',
    en: '{flights} needed · the team has {sets}',
  },
  'bases.sheet.setsUnknown': {
    pt: '{flights} necessários (contagem da equipa por definir na Configuração)',
    en: '{flights} needed (team count not set in Settings)',
  },
  'bases.sheet.setsShort': {
    pt: 'recarregar no campo ou voltar noutro dia',
    en: 'recharge in the field or come back another day',
  },
  'bases.sheet.vlos': { pt: 'Alcance visual', en: 'Visual range' },
  'bases.sheet.vlosValue': {
    pt: '{vlos} m · pior caso dos voos {worst} m',
    en: '{vlos} m · worst case of the flights {worst} m',
  },
  'bases.sheet.flight': { pt: 'Voo', en: 'Flight' },
  'bases.sheet.time': { pt: 'Tempo (min)', en: 'Time (min)' },
  'bases.sheet.transit': { pt: 'dos quais trânsito', en: 'of which transit' },
  'bases.sheet.file': { pt: 'Ficheiro KMZ', en: 'KMZ file' },
  'bases.sheet.total': { pt: 'Total da base', en: 'Base total' },
  'bases.sheet.outOfVlos': { pt: 'fora do alcance visual', en: 'beyond visual range' },
  'bases.sheet.view': { pt: 'Vista da base', en: 'Seen from base' },
  'bases.sheet.viewTerrain': { pt: 'Bacias de visão', en: 'Viewsheds' },
  /* ---- Bacias de visão (src/mission/viewshedPlan.js) ---- */
  'bases.view.title': { pt: 'Bacias de visão', en: 'Viewsheds' },
  'bases.view.layer': { pt: 'Mostrar no mapa', en: 'Show on the map' },
  'bases.view.layerTitle': {
    pt: 'Pinta no mapa, a laranja, as partes de cada bloco em que o drone fica atrás do relevo visto do ponto da base, e a percentagem visível de cada bloco.',
    en: 'Paints on the map, in orange, the parts of each block where the aircraft is behind the terrain seen from the base point, and the visible percentage of each block.',
  },
  'bases.view.flights': { pt: 'Vista: {list}', en: 'Seen: {list}' },
  'bases.view.visible': { pt: '{flight} {pct} %', en: '{flight} {pct} %' },
  'bases.view.hidden': {
    pt: '{flight} {pct} % (tapado a ~{m} m do operador)',
    en: '{flight} {pct} % (blocked at ~{m} m from the operator)',
  },
  'bases.view.eye': {
    pt: 'olhos a {m} m {dir} da base',
    en: 'eyes {m} m {dir} of the base',
  },
  'bases.view.eyeTitle': {
    pt: 'O melhor ponto da zona de descolagem para ver este voo: o operador anda até lá (a vista conta a partir dele).',
    en: 'The best point of the take-off zone to watch this flight: the operator walks there (the view is counted from it).',
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
    pt: 'tapado a ~{m} m do operador',
    en: 'blocked at ~{m} m from the operator',
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
    pt: 'Altura de árvores, edifícios e escombreiras (0-60 m) somada ao relevo nas linhas de vista e no rádio, a mais de 30 m da base, desta missão. Só com um MDT ou o relevo global; um MDS importado já os tem.',
    en: 'Height of trees, buildings and spoil heaps (0-60 m) added to the terrain in the sight lines and the radio check, more than 30 m from the base, for this mission. Only with a DTM or the global terrain; an imported DSM already has them.',
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
    pt: 'Arestas dos quadrados ao longo das linhas de voo ({deg}°); desligue para escolher a orientação.',
    en: 'Square edges along the flight lines ({deg}°); turn off to choose the orientation.',
  },
  'cp.split.transitCorner': {
    pt: '(com o trânsito de uma base num canto do bloco, {r} m de zona)',
    en: '(including transit from a base at a corner of the block, {r} m zone)',
  },
}
