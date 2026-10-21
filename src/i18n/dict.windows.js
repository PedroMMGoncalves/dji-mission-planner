/** Janelas e vistas: a ajuda (índice e pesquisa), o aviso antes de usar e a vista 3D. */
export default {
  /* ---- Ajuda: índice e pesquisa ---- */
  'help.close': { pt: 'Fechar a ajuda', en: 'Close the help' },
  'help.search': { pt: 'Procurar na ajuda', en: 'Search the help' },
  'help.searchPlaceholder': {
    pt: 'Procurar (ex.: RTH, bateria, KMZ)',
    en: 'Search (e.g. RTH, battery, KMZ)',
  },
  'help.topics': { pt: 'Tópicos da ajuda', en: 'Help topics' },
  // «12 resultados em 3 tópicos», com o singular de cada parte
  'help.results': { pt: '{results} em {topics}', en: '{results} in {topics}' },
  'help.resultCount': { pt: '{n} resultados', en: '{n} results' },
  'help.resultCountOne': { pt: '1 resultado', en: '1 result' },
  'help.topicCount': { pt: '{n} tópicos', en: '{n} topics' },
  'help.topicCountOne': { pt: '1 tópico', en: '1 topic' },
  'help.noResults': { pt: 'Nada encontrado para «{q}».', en: 'Nothing found for “{q}”.' },
  'help.noResultsHint': {
    pt: 'Experimente outra palavra, ou menos palavras.',
    en: 'Try another word, or fewer words.',
  },
  'help.seeAlso': { pt: 'Ver também', en: 'See also' },

  /* ---- Aviso antes de usar ---- */
  'disc.title': { pt: 'Aviso antes de usar', en: 'Before you use this app' },
  'disc.subtitle': {
    pt: 'Aparece uma vez em cada aparelho, e de novo quando o texto mudar.',
    en: 'Shown once on each device, and again when the text changes.',
  },
  'disc.lang': { pt: 'Língua do aviso', en: 'Language of the disclaimer' },
  'disc.accept': { pt: 'Li e compreendo', en: 'I understand' },
  'disc.newTab': { pt: '(abre noutro separador)', en: '(opens in a new tab)' },

  /* ---- Vista 3D: cabeçalho, legenda nas cores da cena e escala do relevo ---- */
  'map3d.resetTitle': {
    pt: 'Voltar ao enquadramento inicial, de sudeste',
    en: 'Back to the initial view, from the south-east',
  },
  'map3d.flights': { pt: '{n} voos', en: '{n} flights' },
  'map3d.flightsOne': { pt: '1 voo', en: '1 flight' },
  'map3d.flightsRange': {
    pt: '{n} voos ({first} a {last})',
    en: '{n} flights ({first} to {last})',
  },
  'map3d.bases': { pt: '{n} bases', en: '{n} bases' },
  'map3d.basesOne': { pt: '1 base', en: '1 base' },
  'map3d.legendHint': {
    pt: 'Clique numa camada para a esconder',
    en: 'Click a layer to hide it',
  },
  'map3d.layers': { pt: '{n} camadas', en: '{n} layers' },
  'map3d.layersOne': { pt: '1 camada', en: '1 layer' },
  'map3d.terrainFile': { pt: 'MDT local {label} · ~{res} m', en: 'Local DTM {label} · ~{res} m' },
  'map3d.terrainGlobal': { pt: 'Relevo global · ~30 m', en: 'Global terrain · ~30 m' },
  'map3d.scaleAria': {
    pt: 'Escala de cores do relevo, de {min} m a {max} m',
    en: 'Terrain colour scale, from {min} m to {max} m',
  },
  'map3d.scaleLoading': {
    pt: 'Cor pela cota enquanto as imagens de satélite carregam.',
    en: 'Coloured by elevation while the satellite imagery loads.',
  },
  'map3d.scaleFallback': {
    pt: 'Cor pela cota: as imagens de satélite não carregaram.',
    en: 'Coloured by elevation: the satellite imagery did not load.',
  },
  'map3d.scaleImagery': {
    pt: 'Imagens de satélite sobre o relevo, com cotas de {min} m a {max} m.',
    en: 'Satellite imagery over the terrain, with elevations from {min} m to {max} m.',
  },
  'map3d.scaleFlat': {
    pt: 'Relevo plano, à cota de {v} m.',
    en: 'Flat terrain, at an elevation of {v} m.',
  },
  'map3d.exag': { pt: 'Exagero vertical {k}', en: 'Vertical exaggeration {k}' },
  'map3d.areaDesc': { pt: 'Contorno, sobre o relevo', en: 'Outline, on the terrain' },
  'map3d.blocksDesc': {
    pt: 'Contorno e rótulo de cada voo',
    en: 'Outline and label of each flight',
  },
  'map3d.routeBase': { pt: 'Cor da base', en: 'Base colour' },
  'map3d.routePlain': { pt: 'Ciano, com realce âmbar', en: 'Cyan, with an amber glow' },
  'map3d.inBaseColour': { pt: '{n} · na cor da base', en: '{n} · in the base colour' },
  'map3d.photosOver': {
    pt: '{n} · tapam a cor de cada voo',
    en: '{n} · over each flight’s colour',
  },
  'map3d.basesDesc': { pt: '{n} bases e as suas zonas', en: '{n} bases and their zones' },
  'map3d.basesDescOne': { pt: '1 base e a sua zona', en: '1 base and its zone' },
  'map3d.gcpsDesc': { pt: '{n} alvos no solo', en: '{n} ground targets' },
  'map3d.gcpsDescOne': { pt: '1 alvo no solo', en: '1 ground target' },
  'map3d.noteNoGcp': {
    pt: 'Só aparecem as camadas com conteúdo: este plano não tem GCP.',
    en: 'Only the layers with content are listed: this plan has no GCPs.',
  },
  'map3d.hints': { pt: 'Como mexer na vista', en: 'How to move the view' },
  'map3d.hintDrag': { pt: 'Arrastar: rodar', en: 'Drag: rotate' },
  'map3d.hintWheel': { pt: 'Roda do rato: zoom', en: 'Wheel: zoom' },
  'map3d.hintRight': { pt: 'Botão direito: deslocar', en: 'Right button: pan' },
  'map3d.hintTouch': {
    pt: 'Ecrã táctil: um dedo roda, dois dedos aproximam e deslocam',
    en: 'Touch screen: one finger rotates, two fingers zoom and pan',
  },
}
