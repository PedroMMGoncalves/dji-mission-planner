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
    pt: 'Propõe bases para os blocos que nenhuma base vê inteiros dentro do alcance visual; as suas bases ficam onde estão. Depois arraste, retire ou acrescente.',
    en: 'Proposes bases for the blocks that no base sees entirely within visual range; your bases stay where they are. Then drag, remove or add.',
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
