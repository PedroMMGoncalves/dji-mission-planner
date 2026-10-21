/** Configuração (equipamento por aeronave) e bateria da missão. */
export default {
  'app.settings': { pt: 'Configuração', en: 'Settings' },
  'app.settingsTitle': {
    pt: 'Configuração: baterias, distância VLOS e zona de descolagem por aeronave',
    en: 'Settings: batteries, VLOS range and take-off zone per aircraft',
  },

  /* ---- Janela Configuração ---- */
  'set.title': { pt: 'Configuração', en: 'Settings' },
  'set.close': { pt: 'Fechar', en: 'Close' },
  'set.closeLabel': { pt: 'Fechar a configuração', en: 'Close the settings' },
  'set.closeTitle': { pt: 'Fechar (Esc)', en: 'Close (Esc)' },
  'set.intro': {
    pt: 'Equipamento da equipa, guardado neste browser e à parte dos projectos.',
    en: 'The team’s equipment, stored in this browser and apart from the projects.',
  },
  // as quatro secções, no índice à esquerda
  'set.sections': { pt: 'Secções da configuração', en: 'Settings sections' },
  'set.secAircraft': { pt: 'Aeronaves e baterias', en: 'Aircraft and batteries' },
  'set.secAircraftDesc': {
    pt: 'Distância VLOS e tempo útil, por aeronave',
    en: 'VLOS range and usable time, per aircraft',
  },
  'set.secZoneDesc': {
    pt: 'Raio, desnível e voos por base',
    en: 'Radius, relief and flights per base',
  },
  'set.secPilotDesc': {
    pt: 'Olhos e comando, para as bacias de visão',
    en: 'Eyes and controller, for the viewsheds',
  },
  'set.secData': { pt: 'Ficheiro e dados', en: 'File and data' },
  'set.secDataDesc': {
    pt: 'Exportar, importar, repor e cache',
    en: 'Export, import, restore and cache',
  },
  'set.sectionsNote': {
    pt: 'Só a primeira secção muda com a aeronave. As outras valem para todas.',
    en: 'Only the first section changes with the aircraft. The others apply to all of them.',
  },
  'set.autosave': {
    pt: 'Cada alteração fica guardada neste browser.',
    en: 'Every change is kept in this browser.',
  },
  'set.aircraftTitle': { pt: 'Aeronave', en: 'Aircraft' },
  'set.perAircraft': {
    pt: 'VLOS e baterias guardam-se por aeronave',
    en: 'VLOS and batteries are kept per aircraft',
  },
  'set.inProject': { pt: 'usada no projecto aberto', en: 'used in the open project' },
  'set.vlos': { pt: 'Distância VLOS', en: 'VLOS range' },
  'set.vlosHint': {
    pt: 'Distância a que o piloto mantém esta aeronave à vista. A proposta de bases e o preflight usam-na.',
    en: 'Distance at which the pilot keeps this aircraft in sight. The base proposal and the preflight use it.',
  },
  'set.batteriesTitle': { pt: 'Baterias', en: 'Batteries' },
  'set.batteriesNote': {
    pt: 'Tempo útil por conjunto, já sem a reserva de aterragem',
    en: 'Usable time per set, without the landing reserve',
  },
  'set.batteriesHint': {
    pt: 'Tempo útil = minutos de voo por conjunto, já descontada a reserva com que aterra (15–20 %); não há reserva aplicada por cima. Por omissão: a bateria com que abrem as missões desta aeronave. Com os conjuntos indicados, a app avisa quando a missão precisa de mais voos do que conjuntos.',
    en: 'Usable time = flight minutes per set, with the landing reserve (15–20 %) already deducted; no further reserve is applied. Default: the battery the missions for this aircraft start with. With the sets filled in, the app warns when the mission needs more flights than sets.',
  },
  'set.batteryLabel': { pt: 'Nome', en: 'Name' },
  'set.nameAria': { pt: 'Nome da bateria', en: 'Battery name' },
  'set.usefulMin': { pt: 'Tempo útil', en: 'Usable time' },
  'set.usefulAria': {
    pt: 'Tempo útil por conjunto, em minutos: {name}',
    en: 'Usable time per set, in minutes: {name}',
  },
  'set.count': { pt: 'Conjuntos na equipa', en: 'Sets the team has' },
  'set.countAria': { pt: 'Conjuntos na equipa: {name}', en: 'Sets the team has: {name}' },
  'set.countPlaceholder': { pt: 'opcional', en: 'optional' },
  'set.default': { pt: 'Por omissão', en: 'Default' },
  'set.defaultAria': { pt: 'Bateria por omissão: {name}', en: 'Default battery: {name}' },
  'set.defaultTitle': {
    pt: 'Bateria com que as missões desta aeronave abrem',
    en: 'Battery the missions for this aircraft start with',
  },
  'set.estimated': {
    pt: 'Tempo estimado, sem dados de campo: acerte-o com o tempo que voa de facto.',
    en: 'Estimated time, no field data: adjust it to the time it actually flies.',
  },
  'set.remove': { pt: 'Retirar', en: 'Remove' },
  'set.removeTitle': {
    pt: 'Retirar este tipo de bateria (fica sempre pelo menos um)',
    en: 'Remove this battery type (at least one always stays)',
  },
  'set.add': { pt: 'Acrescentar tipo de bateria', en: 'Add battery type' },
  'set.newBattery': { pt: 'Bateria nova', en: 'New battery' },
  'set.zoneTitle': { pt: 'Zona de descolagem', en: 'Take-off zone' },
  'set.zoneIntro': {
    pt: 'Valores por omissão de todas as bases, em todas as aeronaves. O raio de cada base também se muda na lista de bases (cartão 5).',
    en: 'Defaults for every base, on every aircraft. Each base’s radius can also be changed in the list of bases (card 5).',
  },
  'set.zoneRadius': { pt: 'Raio da zona', en: 'Zone radius' },
  'set.zoneRadiusHint': {
    pt: 'Até onde do ponto da base pode descolar no campo; o planeamento assume o pior caso dentro deste círculo.',
    en: 'How far from the base point you may take off in the field; planning assumes the worst case inside this circle.',
  },
  'set.zoneRelief': { pt: 'Desnível máximo', en: 'Max. relief' },
  'set.zoneReliefHint': {
    pt: 'Desnível aceite dentro da zona; acima dele o raio é reduzido, para a cota de referência não cair num fundo de corta.',
    en: 'Relief accepted inside the zone; above it the radius shrinks, so the reference elevation does not drop into a pit floor.',
  },
  'set.maxFlightsPerBase': { pt: 'Máximo de voos por base', en: 'Max. flights per base' },
  'set.maxFlightsPerBaseHint': {
    pt: 'Limite de voos que a proposta de bases dá a cada base (0 = sem limite, só a distância VLOS). As escolhas manuais não são limitadas.',
    en: 'How many flights the base proposal gives each base (0 = no limit, only the VLOS range). Manual choices are not limited.',
  },
  'set.flightsUnit': { pt: 'voos', en: 'flights' },
  // o esquema da zona: como o mapa a desenha na base seleccionada
  'set.zoneMapAria': {
    pt: 'Esquema de uma base: o raio pedido a tracejado, a zona reduzida a cheio e, ao lado, o desnível que a reduziu',
    en: 'Sketch of a base: the requested radius dashed, the reduced zone filled and, beside it, the relief that reduced it',
  },
  'set.zoneMapTitle': {
    pt: 'No mapa, na base seleccionada',
    en: 'On the map, at the selected base',
  },
  'set.zoneMapRequested': {
    pt: 'Raio pedido ({r} m), a tracejado quando foi reduzido',
    en: 'Requested radius ({r} m), dashed when it was reduced',
  },
  'set.zoneMapZone': {
    pt: 'Zona onde pode descolar, a cheio',
    en: 'Zone you may take off from, filled',
  },
  'set.zoneMapRelief': {
    pt: 'Desnível acima do máximo: o preflight avisa quanto mais baixo pode ficar o voo',
    en: 'Relief above the maximum: the preflight says how much lower the flight may be',
  },
  'set.operatorTitle': { pt: 'Piloto', en: 'Pilot' },
  'set.pilotIntro': {
    pt: 'Valem para todas as aeronaves. Entram nas bacias de visão, calculadas a partir da zona de cada base.',
    en: 'They apply to every aircraft. They go into the viewsheds, computed from each base’s zone.',
  },
  'set.eyeHeight': { pt: 'Altura dos olhos', en: 'Eye height' },
  'set.eyeHeightHint': {
    pt: 'Altura dos olhos do piloto acima do solo no ponto da base (1–5 m; 1,7 m de pé). Usada nas bacias de visão: que partes de cada bloco ficam atrás do relevo vistas da base.',
    en: 'Height of the pilot’s eyes above the ground at the base point (1–5 m; 1.7 m standing). Used in the viewsheds: which parts of each block are behind the terrain seen from the base.',
  },
  'set.antennaHeight': { pt: 'Altura do comando (antena)', en: 'Controller (antenna) height' },
  'set.antennaHeightHint': {
    pt: 'Altura das antenas do comando acima do solo no ponto da base (1–5 m; 1,5 m nas mãos). Usada no rádio das bacias de visão: 60 % da primeira zona de Fresnel a 2,4 GHz livre de relevo.',
    en: 'Height of the controller antennas above the ground at the base point (1–5 m; 1.5 m hand-held). Used for the radio check of the viewsheds: 60 % of the first Fresnel zone at 2.4 GHz clear of terrain.',
  },
  // o esquema da linha de vista e da zona de Fresnel
  'set.losAria': {
    pt: 'Perfil: do ponto da base, a linha de vista dos olhos até à aeronave e, à volta da ligação do comando, a zona de Fresnel, livre do relevo',
    en: 'Profile: from the base point, the line of sight from the eyes to the aircraft and, around the controller link, the Fresnel zone, clear of the terrain',
  },
  'set.losLine': {
    pt: 'Linha de vista, dos olhos ({h} m)',
    en: 'Line of sight, from the eyes ({h} m)',
  },
  'set.losFresnel': {
    pt: 'Zona de Fresnel do rádio, do comando ({h} m)',
    en: 'Radio Fresnel zone, from the controller ({h} m)',
  },
  'set.losMap': {
    pt: 'No mapa, com as bacias de visão ligadas: a laranja o que fica atrás do relevo; a amarelo tracejado o que está à vista mas com o rádio em risco.',
    en: 'On the map, with the viewsheds on: in orange what is behind the terrain; in dashed yellow what is in sight but with the radio link at risk.',
  },
  'set.fileTitle': { pt: 'Levar para outro computador', en: 'Take it to another computer' },
  'set.export': { pt: 'Exportar', en: 'Export' },
  'set.exportTitle': {
    pt: 'Descarregar a configuração num ficheiro JSON',
    en: 'Download the settings as a JSON file',
  },
  'set.exportDesc': {
    pt: 'Descarrega a configuração num ficheiro JSON:',
    en: 'Downloads the settings as a JSON file:',
  },
  'set.import': { pt: 'Importar', en: 'Import' },
  'set.importTitle': {
    pt: 'Abrir um ficheiro de configuração exportado (substitui a actual)',
    en: 'Open an exported settings file (replaces the current one)',
  },
  'set.importDesc': {
    pt: 'Abre um ficheiro de configuração exportado; substitui a actual.',
    en: 'Opens an exported settings file; it replaces the current one.',
  },
  'set.imported': { pt: 'Configuração importada.', en: 'Settings imported.' },
  'set.restore': { pt: 'Repor valores por omissão', en: 'Restore defaults' },
  'set.restoreDesc': {
    pt: 'Todas as aeronaves, a zona de descolagem e as alturas do piloto voltam aos valores de origem.',
    en: 'Every aircraft, the take-off zone and the pilot heights go back to their original values.',
  },
  'set.restoreConfirm': {
    pt: 'Repor todos os valores por omissão?',
    en: 'Restore all the defaults?',
  },
  'set.restoreLoss': {
    pt: 'Perde as baterias e os tempos que introduziu.',
    en: 'The batteries and times you entered are lost.',
  },
  'set.restoreYes': { pt: 'Repor', en: 'Restore' },
  'set.restoreNo': { pt: 'Cancelar', en: 'Cancel' },
  'set.restored': { pt: 'Valores por omissão repostos.', en: 'Defaults restored.' },

  /* ---- Bateria da missão (divisão por bateria) ---- */
  'cp.split.batteryType': { pt: 'Bateria', en: 'Battery' },
  'cp.split.usefulMin': { pt: 'Tempo útil por voo', en: 'Usable time per flight' },
  'cp.split.usefulReset': { pt: '↺ {min}', en: '↺ {min}' },
  'cp.split.usefulResetTitle': {
    pt: 'Voltar ao tempo útil da bateria ({min} min)',
    en: 'Back to the battery’s usable time ({min} min)',
  },
  'cp.split.usefulHint': {
    pt: 'Já descontada a reserva com que aterra. Acerte-o para as condições do dia (vento, frio); os tipos de bateria configuram-se em',
    en: 'With the landing reserve already deducted. Adjust it for the day’s conditions (wind, cold); battery types are set up in',
  },
  'cp.split.estimated': {
    pt: 'Tempo útil estimado, sem dados de campo para esta aeronave.',
    en: 'Estimated usable time, no field data for this aircraft.',
  },
  'sets.short': {
    pt: 'A missão precisa de {flights} voos e a equipa tem {sets} conjuntos de {battery}: conte com recarregar no campo.',
    en: 'The mission needs {flights} flights and the team has {sets} sets of {battery}: plan on recharging in the field.',
  },
  'set.defaultBattery': { pt: 'Bateria de origem', en: 'Stock battery' },
  'set.clearCache': { pt: 'Limpar a cache do relevo', en: 'Clear the terrain cache' },
  // o rótulo curto do botão, debaixo do título «Cache do relevo»; o nome e a dica são os de cima
  'set.clearCacheShort': { pt: 'Limpar a cache', en: 'Clear the cache' },
  'set.cacheTitle': { pt: 'Cache do relevo', en: 'Terrain cache' },
  'set.cacheDesc': {
    pt: 'O relevo global já descarregado fica neste browser: as áreas já vistas carregam sem rede, também no campo. Depois de a limpar, voltam a ser descarregadas quando forem precisas.',
    en: 'The global terrain already downloaded stays in this browser: areas already seen load without a network, in the field too. Once cleared, they are downloaded again when needed.',
  },
  'set.cacheCleared': {
    pt: 'Cache do relevo apagada: as áreas voltam a ser descarregadas quando forem precisas.',
    en: 'Terrain cache cleared: areas will be downloaded again when needed.',
  },
  'set.cacheEmpty': {
    pt: 'Não havia cache do relevo neste browser.',
    en: 'There was no terrain cache in this browser.',
  },
  'set.storageUsed': {
    pt: 'Armazenamento usado pela aplicação: ~{mb} MB.',
    en: 'Storage used by the application: ~{mb} MB.',
  },
}
