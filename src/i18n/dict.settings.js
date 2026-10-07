/** Configuração (equipamento por aeronave) e bateria da missão. */
export default {
  'app.settings': { pt: 'Configuração', en: 'Settings' },
  'app.settingsTitle': {
    pt: 'Configuração: baterias, alcance visual e zona de descolagem por aeronave',
    en: 'Settings: batteries, visual range and take-off zone per aircraft',
  },

  /* ---- Janela Configuração ---- */
  'set.title': { pt: 'Configuração', en: 'Settings' },
  'set.close': { pt: 'Fechar', en: 'Close' },
  'set.closeTitle': { pt: 'Fechar (Esc)', en: 'Close (Esc)' },
  'set.intro': {
    pt: 'Equipamento da equipa, guardado neste browser e à parte dos projectos. Leve-o para outro computador com Exportar / Importar.',
    en: 'The team’s equipment, stored in this browser and apart from the projects. Take it to another computer with Export / Import.',
  },
  'set.aircraftTitle': { pt: 'Equipamento por aeronave', en: 'Equipment per aircraft' },
  'set.vlos': { pt: 'Alcance visual (VLOS)', en: 'Visual line of sight (VLOS)' },
  'set.vlosHint': {
    pt: 'Distância a que o piloto mantém esta aeronave à vista.',
    en: 'Distance at which the pilot keeps this aircraft in sight.',
  },
  'set.batteriesTitle': { pt: 'Baterias', en: 'Batteries' },
  'set.batteriesHint': {
    pt: 'Tempo útil = minutos de voo por conjunto já descontada a reserva com que aterra (15-20 %). Não há reserva aplicada por cima.',
    en: 'Useful time = flight minutes per set with the landing reserve (15-20 %) already taken off. No further reserve is applied.',
  },
  'set.batteryLabel': { pt: 'Nome', en: 'Name' },
  'set.usefulMin': { pt: 'Tempo útil por conjunto', en: 'Useful time per set' },
  'set.count': { pt: 'Conjuntos na equipa', en: 'Sets the team has' },
  'set.countPlaceholder': { pt: 'opcional', en: 'optional' },
  'set.default': { pt: 'Por omissão', en: 'Default' },
  'set.defaultTitle': {
    pt: 'Bateria com que as missões desta aeronave abrem',
    en: 'Battery the missions for this aircraft start with',
  },
  'set.estimated': {
    pt: 'estimado — sem dados de campo; acerte com o tempo que voa de facto',
    en: 'estimated — no field data; adjust to the time it actually flies',
  },
  'set.remove': { pt: 'Retirar', en: 'Remove' },
  'set.removeTitle': {
    pt: 'Retirar este tipo de bateria (fica sempre pelo menos um)',
    en: 'Remove this battery type (at least one always stays)',
  },
  'set.add': { pt: '+ Acrescentar tipo de bateria', en: '+ Add battery type' },
  'set.newBattery': { pt: 'Bateria nova', en: 'New battery' },
  'set.zoneTitle': { pt: 'Zona de descolagem', en: 'Take-off zone' },
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
  'set.fileTitle': { pt: 'Ficheiro', en: 'File' },
  'set.export': { pt: 'Exportar', en: 'Export' },
  'set.exportTitle': {
    pt: 'Descarregar a configuração num ficheiro JSON',
    en: 'Download the settings as a JSON file',
  },
  'set.import': { pt: 'Importar', en: 'Import' },
  'set.importTitle': {
    pt: 'Abrir um ficheiro de configuração exportado (substitui a actual)',
    en: 'Open an exported settings file (replaces the current one)',
  },
  'set.imported': { pt: 'Configuração importada.', en: 'Settings imported.' },
  'set.restore': { pt: 'Repor valores por omissão', en: 'Restore defaults' },
  'set.restoreConfirm': {
    pt: 'Repor todas as aeronaves e a zona de descolagem nos valores por omissão? Perde as baterias e os tempos que introduziu.',
    en: 'Restore every aircraft and the take-off zone to the defaults? The batteries and times you entered are lost.',
  },
  'set.restoreYes': { pt: 'Repor', en: 'Restore' },
  'set.restoreNo': { pt: 'Cancelar', en: 'Cancel' },
  'set.restored': { pt: 'Valores por omissão repostos.', en: 'Defaults restored.' },

  /* ---- Bateria da missão (divisão por bateria) ---- */
  'cp.split.batteryType': { pt: 'Bateria', en: 'Battery' },
  'cp.split.usefulMin': { pt: 'Tempo útil por voo', en: 'Useful time per flight' },
  'cp.split.usefulReset': { pt: '↺ {min}', en: '↺ {min}' },
  'cp.split.usefulResetTitle': {
    pt: 'Voltar ao tempo útil da bateria ({min} min)',
    en: 'Back to the battery’s useful time ({min} min)',
  },
  'cp.split.usefulHint': {
    pt: 'Já descontada a reserva com que aterra. Acerte-o para as condições do dia (vento, frio); os tipos de bateria configuram-se em',
    en: 'With the landing reserve already taken off. Adjust it for the day’s conditions (wind, cold); battery types are set up in',
  },
  'cp.split.estimated': {
    pt: 'Tempo útil estimado, sem dados de campo para esta aeronave.',
    en: 'Estimated useful time, no field data for this aircraft.',
  },
  'sets.short': {
    pt: 'A missão precisa de {flights} voos e a equipa tem {sets} conjuntos de {battery}: conte com recarregar no campo.',
    en: 'The mission needs {flights} flights and the team has {sets} sets of {battery}: plan on recharging in the field.',
  },
}
