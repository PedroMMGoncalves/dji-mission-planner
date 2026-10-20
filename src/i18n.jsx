import { createContext, useContext, useMemo } from 'react'
import controlPanelDict from './i18n/dict.controlPanel.js'
import missionModesDict from './i18n/dict.missionModes.js'
import preflightDict from './i18n/dict.preflight.js'
import settingsDict from './i18n/dict.settings.js'
import basesDict from './i18n/dict.bases.js'
import cardsDict from './i18n/dict.cards.js'
import errorsDict from './i18n/dict.errors.js'

/**
 * Internacionalização PT/EN.
 *
 * Uso: envolver a app em <LangContext.Provider value={lang}> e, nos
 * componentes, `const t = useT()` seguido de `t('chave')` ou
 * `t('chave', { n: 3 })` para interpolar `{n}`. Chaves em falta caem para
 * pt e, em último caso, para a própria chave (visível, para ser corrigida).
 */

export const LANGS = [
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
]

export const LangContext = createContext('pt')

export function useLang() {
  return useContext(LangContext)
}

/** Tradução pura: a mesma de `useT`, para quem não pode usar hooks (fronteiras de erro). */
export function translate(lang, key, vars) {
  const entry = DICT[key]
  let s = entry ? (entry[lang] ?? entry.pt) : key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

export function useT() {
  const lang = useContext(LangContext)
  // memoizada por língua (M3-C8): uma função nova em cada render era
  // dependência do seguimento de terreno e das fichas de campo, que se
  // refaziam — com a rota, a folga, o preflight e o mapa — a cada tecla no
  // nome da missão (4,6 s de tarefas longas em 10 teclas numa área de 5 × 4 km)
  return useMemo(() => (key, vars) => translate(lang, key, vars), [lang])
}

const BASE_DICT = {
  /* ---- Cabeçalho ---- */
  'app.subtitle': {
    pt: 'Grelhas fotogramétricas / LiDAR · exportação KML & WPML para DJI Pilot 2',
    en: 'Photogrammetry / LiDAR grids · KML & WPML export for DJI Pilot 2',
  },
  'app.helpTitle': {
    pt: 'Instruções e informação da aplicação',
    en: 'Instructions and app information',
  },
  /* ---- Falhas de exportação (E4.1) ---- */
  'export.failed': {
    pt: 'A exportação foi cancelada e o ficheiro não foi escrito.',
    en: 'Export cancelled; no file was written.',
  },
  'export.err.unknown': {
    pt: 'Erro inesperado ao escrever o ficheiro: {d}',
    en: 'Unexpected error while writing the file: {d}',
  },
  'export.err.no-waypoints': { pt: 'O plano não tem waypoints.', en: 'The plan has no waypoints.' },
  'export.err.too-few-waypoints': {
    pt: 'Uma rota precisa de pelo menos dois waypoints: o Pilot 2 não aceita um só.',
    en: 'A route needs at least two waypoints: Pilot 2 does not accept a single one.',
  },
  'export.err.duplicate-file-name': {
    pt: 'Dois ficheiros com o mesmo nome no ZIP.',
    en: 'Two files with the same name in the ZIP.',
  },
  'export.err.too-many-waypoints': {
    pt: 'O plano excede os 65536 waypoints que uma rota WPML admite.',
    en: 'The plan exceeds the 65536 waypoints a WPML route allows.',
  },
  'export.err.waypoint-malformed': { pt: 'Waypoint malformado.', en: 'Malformed waypoint.' },
  'export.err.waypoint-not-finite': {
    pt: 'Coordenada não numérica num waypoint.',
    en: 'Non-numeric coordinate in a waypoint.',
  },
  'export.err.waypoint-out-of-range': {
    pt: 'Coordenada fora do alcance geográfico válido.',
    en: 'Coordinate outside the valid geographic range.',
  },
  'export.err.height-not-finite': {
    pt: 'Altura não numérica num waypoint (verifique o seguimento de terreno).',
    en: 'Non-numeric height in a waypoint (check terrain follow).',
  },
  'export.err.altitude-not-finite': { pt: 'Altitude inválida.', en: 'Invalid altitude.' },
  'export.err.altitude-not-positive': {
    pt: 'A altitude tem de ser positiva.',
    en: 'The altitude must be positive.',
  },
  'export.err.speed-out-of-range': {
    pt: 'Velocidade fora do intervalo admissível.',
    en: 'Speed outside the admissible range.',
  },
  'export.err.per-waypoint-not-finite': {
    pt: 'Uma acção por waypoint tem um rumo ou um pitch que não é número ({d}). A exportação foi travada — sem isto o valor entrava tal e qual no ficheiro e só o comando o recusaria, já no campo.',
    en: 'A per-waypoint action has a non-numeric heading or pitch ({d}). Export was stopped — without this the value would land verbatim in the file and only the controller would reject it, already in the field.',
  },
  'export.err.per-waypoint-invalid': {
    pt: 'Uma entrada de acções por waypoint tem um formato inesperado ({d}).',
    en: 'A per-waypoint action entry has an unexpected shape ({d}).',
  },
  'export.err.param-out-of-range': {
    pt: 'Parâmetro de missão fora do intervalo admissível.',
    en: 'Mission parameter outside the admissible range.',
  },
  'export.err.speed-invalid': { pt: 'Velocidade inválida.', en: 'Invalid speed.' },
  'export.err.wpml-enums-missing': {
    pt: 'Perfil de aeronave/payload sem os enums WPML necessários.',
    en: 'Aircraft/payload profile is missing the required WPML enums.',
  },
  'export.err.param-not-finite': {
    pt: 'Parâmetro de missão não numérico.',
    en: 'Non-numeric mission parameter.',
  },
  'export.err.ring-too-short': {
    pt: 'A área precisa de pelo menos três vértices.',
    en: 'The area needs at least three vertices.',
  },
  'app.view3d': { pt: 'Vista 3D', en: '3D View' },
  'app.view3dReady': {
    pt: 'Ver as linhas de voo em 3D sobre o relevo',
    en: 'View the flight lines in 3D over the terrain',
  },
  'app.view3dNotReady': {
    pt: 'Carregue primeiro o relevo (secção Terreno) e gere um plano',
    en: 'Load the terrain first (Terrain section) and generate a plan',
  },
  'app.checklist': { pt: 'Checklist de campo', en: 'Field checklist' },
  'app.checklistTitle': {
    pt: 'Checklist de campo UAV (pré-campo, durante, pós-campo) + relatório de missão',
    en: 'UAV field checklist (pre-field, in-field, post-field) + mission report',
  },
  'app.exportKml': { pt: 'Exportar KML da área', en: 'Export area KML' },
  'map.moveArea': {
    pt: 'Arrastar para mover a área inteira (a base fica no sítio)',
    en: 'Drag to move the whole area (the base stays)',
  },
  'map.closePolygon': {
    pt: 'Clique para fechar o polígono',
    en: 'Click to close the polygon',
  },
  'app.exportKmlTitle': {
    pt: 'Só o polígono da área, para definir o levantamento no DJI Pilot 2',
    en: 'The area polygon only, to set the survey up in DJI Pilot 2',
  },
  'app.kmlHoleNote': {
    pt: 'O buraco fica de fora do KML (o Pilot 2 não tem zonas de exclusão): a missão do Pilot 2 vai cobri-lo.',
    en: 'The hole is left out of the KML (Pilot 2 has no exclusion zones): the Pilot 2 mission will cover it.',
  },
  'app.kmlHolesNote': {
    pt: 'Os {n} buracos ficam de fora do KML (o Pilot 2 não tem zonas de exclusão): a missão do Pilot 2 vai cobri-los.',
    en: 'The {n} holes are left out of the KML (Pilot 2 has no exclusion zones): the Pilot 2 mission will cover them.',
  },
  'app.kmlPartsNote': {
    pt: 'A área tem {n} partes: o KML leva só a maior.',
    en: 'The area has {n} parts: the KML carries only the largest.',
  },
  'app.kmlCellNote': {
    pt: 'A célula desactivada fica dentro do polígono do KML.',
    en: 'The disabled cell stays inside the KML polygon.',
  },
  'app.kmlCellsNote': {
    pt: 'As {n} células desactivadas ficam dentro do polígono do KML.',
    en: 'The {n} disabled cells stay inside the KML polygon.',
  },
  'app.exportWpml': { pt: 'Exportar WPML Avançado (KMZ)', en: 'Export Advanced WPML (KMZ)' },
  'app.exportWpmlTitle': {
    pt: 'Missão completa DJI (wpmz/template.kml + waylines.wpml)',
    en: 'Full DJI mission (wpmz/template.kml + waylines.wpml)',
  },
  'app.loading3d': { pt: 'A carregar a vista 3D…', en: 'Loading 3D view…' },
  'app.report': { pt: 'Relatório', en: 'Report' },
  'app.reportTitle': {
    pt: 'Relatório imprimível do plano de missão (mapa, parâmetros, blocos, GCPs)',
    en: 'Printable mission plan report (map, parameters, blocks, GCPs)',
  },
  'app.loadingReport': { pt: 'A preparar o relatório…', en: 'Preparing the report…' },
  /* ---- Fronteiras de erro (M3-C4) ---- */
  'app.errTitle': { pt: 'Algo correu mal', en: 'Something went wrong' },
  'app.errWindow': { pt: 'Esta janela não abriu: {msg}', en: 'This window could not open: {msg}' },
  'app.errApp': { pt: 'A aplicação parou: {msg}', en: 'The application stopped: {msg}' },
  'app.errOffline': {
    pt: 'Sem rede, uma janela que ainda não tinha sido aberta nesta sessão pode não carregar; o planeador e o projecto continuam como estavam.',
    en: 'Without a network, a window not yet opened in this session may fail to load; the planner and the project are unchanged.',
  },
  'app.errClose': { pt: 'Fechar', en: 'Close' },
  'app.errReload': { pt: 'Recarregar a página', en: 'Reload the page' },
  'app.errClearProject': {
    pt: 'Guardar uma cópia do projecto gravado e recarregar sem ele',
    en: 'Keep a copy of the stored project and reload without it',
  },
  /* ---- Ficheiro de projecto ---- */
  'project.err.invalid': {
    pt: 'Este ficheiro não é um projecto do planeador (um .json guardado com «Guardar projecto»), ou tem coordenadas inválidas.',
    en: 'This file is not a planner project (a .json saved with “Save project”), or it has invalid coordinates.',
  },
  'project.err.rejected': {
    pt: 'O projecto gravado neste browser não foi lido (de outra versão, ou danificado). Ficou guardado numa cópia ({key}) e não foi substituído.',
    en: 'The project stored in this browser could not be read (another version, or damaged). It was kept as a copy ({key}) and not overwritten.',
  },

  /* ---- Painel de métricas ---- */
  'stats.gsd': { pt: 'GSD', en: 'GSD' },
  'stats.gsdCentre': { pt: 'GSD (centro do quadro)', en: 'GSD (frame centre)' },
  'stats.gsdCentreHint': {
    pt: 'Com o gimbal oblíquo o GSD usa o alcance inclinado ao centro do quadro (altitude ÷ sin|pitch|); nos bordos superiores do quadro é pior.',
    en: 'With an oblique gimbal the GSD uses the slant range to the frame centre (altitude ÷ sin|pitch|); the upper frame edges are worse.',
  },
  'stats.gsdOblique': { pt: 'n/a (oblíqua)', en: 'n/a (oblique)' },
  'stats.gsdRangeHint': {
    pt: 'Intervalo [pior, melhor] com o erro de posicionamento e o relevo dentro da área (ver Métodos §2).',
    en: 'Range [worst, best] with positioning error and relief inside the area (see Methods §2).',
  },
  'stats.overlapRange': { pt: 'Sobreposição real', en: 'Actual overlap' },
  'stats.overlapRangeHint': {
    pt: 'Frontal / lateral no pior caso do posicionamento e do relevo; o mínimo habitual é 60 / 50 %.',
    en: 'Front / side in the worst case of positioning and relief; the usual minimum is 60 / 50 %.',
  },
  'stats.density': { pt: 'Densidade LiDAR', en: 'LiDAR density' },
  'stats.densityHint': {
    pt: 'Média na área, PRR ÷ (velocidade × espaçamento), com o PRR de retorno único — conservador, multi-eco aumenta. Entre parênteses: o mínimo de uma só passagem, PRR ÷ (velocidade × faixa).',
    en: 'Area mean, PRR ÷ (speed × line spacing), using the single-return PRR — conservative, multi-echo raises it. In parentheses: the single-pass minimum, PRR ÷ (speed × swath).',
  },
  'stats.footprint': { pt: 'Pegada no chão', en: 'Ground footprint' },
  'stats.swath': { pt: 'faixa {v} m', en: 'swath {v} m' },
  'stats.spacing': { pt: 'Espaç. faixas', en: 'Line spacing' },
  'stats.interval': { pt: 'Intervalo disparo', en: 'Trigger interval' },
  'stats.area': { pt: 'Área', en: 'Area' },
  'stats.lines': { pt: 'Nº de faixas', en: 'No. of lines' },
  'stats.circles': { pt: 'Nº de círculos', en: 'No. of circles' },
  'stats.waypoints': { pt: 'Waypoints', en: 'Waypoints' },
  'stats.totalDist': { pt: 'Distância total', en: 'Total distance' },
  'stats.photos': { pt: 'Nº de fotos', en: 'No. of photos' },
  'stats.photosHint': {
    pt: 'Total (o disparo por distância cobre também o overshoot) e, entre parênteses, as fotos sobre a área.',
    en: 'Total (the distance trigger also fires along the overshoot) and, in parentheses, the photos over the area.',
  },
  'stats.time': { pt: 'Tempo na rota (sem trânsito)', en: 'Time on route (no transit)' },
  'stats.baseToArea': { pt: 'Base → área', en: 'Base → area' },
  'stats.insideArea': { pt: 'dentro da área', en: 'inside the area' },
  'stats.groupQuality': { pt: 'Qualidade', en: 'Quality' },
  'stats.groupFlight': { pt: 'Voo', en: 'Flight' },
  'stats.groupOps': { pt: 'Operação', en: 'Operation' },
  'stats.passes': { pt: 'Nº de passagens', en: 'No. of passes' },
  'stats.levels': { pt: 'Nº de níveis', en: 'No. of levels' },
  'stats.intervalWarnHint': {
    pt: 'Abaixo do intervalo mínimo da câmara a esta velocidade: ver o preflight.',
    en: 'Below the camera’s minimum interval at this speed: see the preflight.',
  },
  'stats.flights': { pt: 'Voos', en: 'Flights' },
  'stats.hide': { pt: 'Recolher as métricas', en: 'Collapse the metrics' },
  'stats.show': { pt: 'Métricas', en: 'Metrics' },
  'stats.flightsBases': { pt: '{n} · {b} bases', en: '{n} · {b} bases' },
  'stats.batteries': { pt: 'Conjuntos de baterias', en: 'Battery sets' },
  'stats.setsNeeded': { pt: '{n} precisos', en: '{n} needed' },
  'stats.setsVs': { pt: '{n} precisos · {s} na equipa', en: '{n} needed · {s} in the team' },
  'stats.setsShortHint': {
    pt: 'A missão pede mais voos do que os conjuntos de baterias que a equipa tem.',
    en: 'The mission needs more flights than the battery sets the team has.',
  },
  'stats.longest': { pt: 'Voo mais longo / útil', en: 'Longest flight / useful' },
  'stats.vsBattery': { pt: 'Voo / tempo útil', en: 'Flight / useful time' },
  'stats.longestHint': {
    pt: 'Com o trânsito desde a base, contra o tempo útil de uma bateria. Âmbar acima de 90 %, vermelho acima de 100 %.',
    en: 'Including transit from the base, against the useful time of one battery. Amber above 90 %, red above 100 %.',
  },
  'stats.totalTime': { pt: 'Tempo total com trânsitos', en: 'Total time with transits' },
  'stats.totalTimeHint': {
    pt: 'Soma de todos os voos, com os trânsitos; sem trocas de bateria nem mudanças de base.',
    en: 'Sum of all flights, with transits; without battery swaps or base moves.',
  },

  /* ---- Vista 3D ---- */
  'map3d.title': { pt: 'Vista 3D', en: '3D View' },
  'map3d.exaggeration': { pt: 'Exagero', en: 'Exaggeration' },
  'map3d.reset': { pt: '↺ Repor vista', en: '↺ Reset view' },
  'map3d.close': { pt: '✕ Fechar', en: '✕ Close' },
  'map3d.noWebgl': {
    pt: 'A vista 3D não abre neste browser (sem WebGL): {msg}. O planeador continua; feche esta janela.',
    en: 'The 3D view cannot open in this browser (no WebGL): {msg}. The planner carries on; close this window.',
  },

  /* ---- Ajuda ---- */
  'help.instructions': { pt: 'Instruções', en: 'Instructions' },
  'help.about': { pt: 'Acerca', en: 'About' },
  'help.closeTitle': { pt: 'Fechar (Esc)', en: 'Close (Esc)' },

  /* ---- Camadas do mapa ---- */
  'map.hybrid': { pt: 'Híbrido (Esri)', en: 'Hybrid (Esri)' },
  'map.satellite': { pt: 'Satélite (Esri)', en: 'Satellite (Esri)' },
  'map.topo': { pt: 'Topográfico (Esri)', en: 'Topographic (Esri)' },
  'map.municipalities': { pt: 'Municípios (CAOP)', en: 'Municipalities (CAOP)' },
  'map.parishes': { pt: 'Freguesias (CAOP)', en: 'Parishes (CAOP)' },
  'map.viewsheds': { pt: 'Bacias de visão', en: 'Viewsheds' },
  'map.viewshedRadio': { pt: '{vis} % · rádio −{pct} %', en: '{vis} % · radio −{pct} %' },
}

const DICT = {
  ...BASE_DICT,
  ...controlPanelDict,
  ...missionModesDict,
  ...preflightDict,
  ...settingsDict,
  ...basesDict,
  ...cardsDict,
  ...errorsDict,
}

export default DICT
