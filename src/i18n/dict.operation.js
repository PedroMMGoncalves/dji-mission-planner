/**
 * A operação do dia (o painel à direita do mapa: os voos pela ordem de voo,
 * o seguinte e os feitos) e o ecrã estreito do tablet (o cabeçalho numa
 * linha, com o menu «Mais», e o painel de parâmetros que se recolhe).
 */
export default {
  /* ---- Operação do dia: abrir, fechar e o cabeçalho ---- */
  'day.title': { pt: 'Operação do dia', en: 'Operation of the day' },
  'day.openTitle': {
    pt: 'Os voos pela ordem de voo, o seguinte e os já feitos, uma linha por voo com a sua base',
    en: 'The flights in flying order, the next one and those already done, one row per flight with its base',
  },
  'day.close': { pt: 'Fechar a operação do dia', en: 'Close the operation of the day' },
  'day.inOrder': { pt: 'Pela ordem de voo', en: 'In flying order' },
  // «20 voos em 20 bases»
  'day.flightsIn': { pt: '{flights} em {bases}', en: '{flights} from {bases}' },
  'day.battery': { pt: '{battery} ({min} min úteis)', en: '{battery} ({min} min usable)' },

  /* ---- Os três números do dia ---- */
  'day.needed': { pt: 'necessários', en: 'needed' },
  'day.neededOne': { pt: 'necessário', en: 'needed' },
  'day.team': { pt: 'na equipa: {s}', en: 'in the team: {s}' },
  'day.teamUnknown': { pt: 'na equipa: por definir', en: 'in the team: not set' },
  'day.setInSettings': { pt: 'Definir na Configuração', en: 'Set in the settings' },
  'day.setInSettingsTitle': {
    pt: 'Os conjuntos de baterias da equipa e o tempo útil de cada um, na Configuração (Aeronaves e baterias)',
    en: 'The team’s battery sets and the usable time of each, in the settings (Aircraft and batteries)',
  },
  'day.totalTime': { pt: 'Tempo total', en: 'Total time' },
  'day.withTransit': { pt: 'com deslocações', en: 'with transit' },
  'day.inMission': { pt: '{t} na missão', en: '{t} in the mission' },
  'day.ofUseful': { pt: 'de {u} úteis · {p} %', en: 'of {u} usable · {p} %' },
  'day.longestBar': {
    pt: '{flight} ocupa {p} % do tempo útil da bateria',
    en: '{flight} takes {p} % of the battery’s usable time',
  },
  'day.setsShort': { pt: 'Faltam conjuntos de baterias.', en: 'Not enough battery sets.' },

  /* ---- O voo seguinte ---- */
  'day.next': { pt: 'A seguir', en: 'Next' },
  'day.nextFlight': { pt: 'Base {base} · voo {flight}', en: 'Base {base} · flight {flight}' },
  'day.minTransit': { pt: '{min} min com deslocação', en: '{min} min incl. transit' },
  'day.pctBattery': { pt: '{p} % da bateria', en: '{p} % of the battery' },
  'day.vlos': { pt: 'VLOS {v} m', en: 'VLOS {v} m' },
  'day.zone': {
    pt: 'Zona de descolagem {r} m, sem redução',
    en: 'Take-off zone {r} m, not reduced',
  },
  'day.zoneReduced': {
    pt: 'Zona de descolagem {r} m, reduzida: {relief} m de desnível a {at} m',
    en: 'Take-off zone {r} m, reduced: {relief} m of relief at {at} m',
  },
  'day.zoneNoTerrain': {
    pt: 'Zona de descolagem {r} m, fora do relevo carregado (cota de referência desconhecida)',
    en: 'Take-off zone {r} m, outside the loaded elevation data (reference elevation unknown)',
  },
  // «Ver no mapa» e o nome inteiro da acção, que começa por ele (o botão do
  // voo seguinte; na linha, a base é o rótulo e este nome a descrição)
  'day.showOnMap': { pt: 'Ver no mapa', en: 'Show on the map' },
  'day.showFlight': {
    pt: 'Ver no mapa: voo {flight} (base {base})',
    en: 'Show on the map: flight {flight} (base {base})',
  },
  // «Marcar feito» e o nome inteiro (o botão do voo seguinte e a caixa de
  // cada linha), e a dica, que começa por ele
  'day.markDone': { pt: 'Marcar feito', en: 'Mark done' },
  'day.markFlight': { pt: 'Marcar feito: voo {flight}', en: 'Mark done: flight {flight}' },
  'day.markTitle': {
    pt: 'Marcar feito: voo {flight}. Escreve a hora de agora na «Hora fim» do voo, no registo de voos da checklist de campo',
    en: 'Mark done: flight {flight}. Writes the current time as the flight’s “End time”, in the field checklist’s flight log',
  },
  'day.allDone': {
    pt: 'Os {n} voos estão marcados como feitos.',
    en: 'All {n} flights are marked as done.',
  },
  'day.allDoneOne': {
    pt: 'O voo está marcado como feito.',
    en: 'The flight is marked as done.',
  },

  /* ---- A ordem do dia ---- */
  'day.order': { pt: 'Ordem do dia', en: 'Order of the day' },
  'day.doneOf': { pt: 'Feitos {done} de {total}', en: '{done} of {total} done' },
  'day.left': {
    pt: 'faltam {n} voos e {n} conjuntos',
    en: '{n} flights and {n} sets to go',
  },
  'day.leftOne': { pt: 'falta 1 voo e 1 conjunto', en: '1 flight and 1 set to go' },
  'day.logNote': {
    pt: 'Feito é o voo com a «Hora fim» no registo de voos da checklist de campo: o mesmo registo, aqui e lá.',
    en: 'A flight is done when it has an “End time” in the field checklist’s flight log: the same log, here and there.',
  },
  'day.legendBlock': { pt: 'no bloco', en: 'in the block' },
  'day.legendTransit': { pt: 'deslocação (ida e volta)', en: 'transit (there and back)' },
  'day.legendLimit': { pt: '{p} % do tempo útil', en: '{p} % of usable time' },
  'day.legendScale': { pt: 'barra: {u} úteis', en: 'bar: {u} usable' },
  'day.estimated': { pt: '(estimado)', en: '(estimated)' },
  'day.list': { pt: 'Voos pela ordem do dia', en: 'Flights in the order of the day' },
  'day.col.done': { pt: 'Feito', en: 'Done' },
  'day.col.base': { pt: 'Base', en: 'Base' },
  'day.col.flight': { pt: 'Voo', en: 'Flight' },
  'day.col.bar': { pt: 'Tempo contra os {u} úteis', en: 'Time against the {u} usable' },
  'day.col.time': { pt: 'Tempo', en: 'Time' },
  'day.col.pct': { pt: '% útil', en: '% usable' },
  'day.col.vlos': { pt: 'VLOS', en: 'VLOS' },
  'day.setsN': { pt: '{n} conjuntos', en: '{n} sets' },
  'day.setsNOne': { pt: '1 conjunto', en: '1 set' },
  'day.barLabel': {
    pt: '{flight}: {min} min com deslocação, {p} % do tempo útil',
    en: '{flight}: {min} min incl. transit, {p} % of usable time',
  },
  'day.areaKm': { pt: '{ha} ha · {km} km', en: '{ha} ha · {km} km' },
  'day.longestNote': { pt: 'o mais longo', en: 'the longest' },
  'day.transit': { pt: 'desloc. {min} min', en: 'transit {min} min' },
  'day.vlosOver': {
    pt: 'Passa a distância VLOS da aeronave ({v} m)',
    en: 'Beyond the aircraft’s VLOS range ({v} m)',
  },

  /* ---- O total do dia ---- */
  'day.dayTotal': { pt: 'Total do dia', en: 'Day total' },
  'day.totalNote': {
    pt: 'Sem trocas de bateria nem mudanças de base · VLOS contra {v} m',
    en: 'Without battery swaps or base moves · VLOS against {v} m',
  },
  'day.adjustUseful': { pt: 'Ajustar o tempo útil', en: 'Adjust the usable time' },
  'day.adjustUsefulTitle': {
    pt: 'O tempo útil por voo, para o vento e o frio do dia, na secção «Divisão em voos» do painel',
    en: 'The usable time per flight, for the day’s wind and cold, in the panel’s “Split into flights” section',
  },

  /* ---- O voo em foco no mapa ---- */
  'day.mapNext': { pt: 'A seguir · base {base} · {flight}', en: 'Next · base {base} · {flight}' },
  'day.mapFlight': { pt: 'Base {base} · {flight}', en: 'Base {base} · {flight}' },
  'day.mapDone': { pt: '{text} · feito', en: '{text} · done' },

  /* ---- Tablet: o menu «Mais» do cabeçalho e o painel que se recolhe ---- */
  'app.more': { pt: 'Mais: configuração, ajuda e língua', en: 'More: settings, help and language' },
  'app.moreViews': {
    pt: 'Mais: vistas, configuração, ajuda e língua',
    en: 'More: views, settings, help and language',
  },
  'mode.panel': { pt: 'Painel', en: 'Panel' },
  'mode.panelName': { pt: 'Painel de parâmetros', en: 'Parameters panel' },
  'mode.panelTitle': {
    pt: 'Mostrar ou esconder o painel de parâmetros',
    en: 'Show or hide the parameters panel',
  },
  'mode.panelCollapse': { pt: 'Recolher o painel', en: 'Collapse the panel' },
}
