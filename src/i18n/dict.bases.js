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
    pt: 'Propõe bases para os blocos que nenhuma base vê inteiros dentro do alcance visual; as suas bases ficam onde estão. Com seguir terreno, prefere sítios baixos, que deixem os blocos com pelo menos 20 m de altura relativa. Depois arraste, retire ou acrescente.',
    en: 'Proposes bases for the blocks that no base sees entirely within visual range; your bases stay where they are. With terrain following it prefers low sites that leave the blocks at least 20 m of relative height. Then drag, remove or add.',
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
  'bases.proposedHigh': {
    pt: '{n} base(s) sem sítio baixo que chegue: alguns dos seus blocos ficam com menos de 20 m de altura relativa (ver o preflight).',
    en: '{n} base(s) without a low enough site: some of their blocks get less than 20 m of relative height (see preflight).',
  },
  'bases.maxPerBase': {
    pt: 'no máximo {n} voos por base',
    en: 'at most {n} flights per base',
  },
  'bases.clickMode': { pt: 'Clique num bloco no mapa', en: 'Click a block on the map' },
  'bases.clickToggle': { pt: 'Activar / desactivar', en: 'Enable / disable' },
  'bases.clickAssign': { pt: 'Atribuir base', en: 'Assign base' },
  'bases.clickAssignHint': {
    pt: 'Com uma base seleccionada, o bloco passa para ela; sem selecção, para a base seguinte.',
    en: 'With a base selected the block goes to it; with none selected, to the next base.',
  },
  'bases.label': { pt: 'Base {label}', en: 'Base {label}' },
  'bases.noFlights': { pt: 'sem voos', en: 'no flights' },
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
