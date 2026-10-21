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

/** @returns {(key: string, vars?: Record<string, any>) => string} */
export function useT() {
  const lang = useContext(LangContext)
  // memoizada por língua (M3-C8): uma função nova em cada render era
  // dependência do seguimento de terreno e das fichas de campo, que se
  // refaziam — com a rota, a folga, o preflight e o mapa — a cada tecla no
  // nome da missão (4,6 s de tarefas longas em 10 teclas numa área de 5 × 4 km)
  return useMemo(
    () =>
      (key, vars = undefined) =>
        translate(lang, key, vars),
    [lang],
  )
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
  'app.help': { pt: 'Ajuda', en: 'Help' },
  'app.lang': { pt: 'Língua', en: 'Language' },
  'app.views': { pt: 'Vistas', en: 'Views' },
  // o projecto no cabeçalho: o nome da missão, se está gravado, e o menu
  'app.project.menu': { pt: 'Projecto', en: 'Project' },
  'app.project.title': {
    pt: 'Projecto: mudar o nome, guardar, abrir',
    en: 'Project: rename, save, open',
  },
  'app.project.label': { pt: 'Projecto {name}, {state}', en: 'Project {name}, {state}' },
  // antes da primeira gravação automática, sem o estado
  'app.project.labelPending': { pt: 'Projecto {name}', en: 'Project {name}' },
  'app.project.saved': { pt: 'gravado', en: 'saved' },
  'app.project.notSaved': { pt: 'não gravado', en: 'not saved' },
  'app.project.notSavedTitle': {
    pt: 'O browser recusou a gravação automática: use «Guardar projecto» para não perder o trabalho.',
    en: 'The browser refused the automatic save: use “Save project” so you do not lose your work.',
  },
  'app.project.rename': { pt: 'Mudar o nome', en: 'Rename' },
  // a seta do botão de exportar: as outras exportações do separador, com
  // os nomes do painel e uma linha a dizer o que sai
  'app.exportMore': { pt: 'Outras exportações', en: 'Other exports' },
  'app.menu.areaKml': {
    pt: 'O polígono da área, para o Pilot 2',
    en: 'The area polygon, for Pilot 2',
  },
  'app.menu.all': {
    pt: 'Um KMZ por voo, pela ordem de voo',
    en: 'One KMZ per flight, in flight order',
  },
  'app.menu.byBase': {
    pt: 'Uma pasta por base, para vários pilotos',
    en: 'One folder per base, for several pilots',
  },
  'app.menu.kmlAll': {
    pt: 'Um KML por bloco, para a missão de mapeamento do Pilot 2',
    en: 'One KML per block, for a Pilot 2 mapping mission',
  },
  'app.menu.kmlByBase': {
    pt: 'Uma pasta por base e um KML por bloco',
    en: 'One folder per base and one KML per block',
  },
  'app.menu.basesKml': {
    pt: 'As bases, as zonas e os blocos, para o Google Earth',
    en: 'The bases, zones and blocks, for Google Earth',
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
    pt: 'O plano excede os 65\u00a0536 waypoints que uma rota WPML admite.',
    en: 'The plan exceeds the 65,536 waypoints a WPML route allows.',
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
    en: 'Non-numeric height in a waypoint (check terrain following).',
  },
  'export.err.altitude-not-finite': { pt: 'Altura inválida.', en: 'Invalid height.' },
  'export.err.altitude-not-positive': {
    pt: 'A altura tem de ser positiva.',
    en: 'The height must be positive.',
  },
  'export.err.speed-out-of-range': {
    pt: 'Velocidade fora do intervalo admissível: reveja os parâmetros do plano.',
    en: 'Speed outside the admissible range: check the plan parameters.',
  },
  'export.err.per-waypoint-not-finite': {
    pt: 'Uma acção por waypoint tem um rumo ou uma inclinação que não é número ({d}). A exportação foi travada — sem isto o valor entrava tal e qual no ficheiro e só o comando o recusaria, já no campo.',
    en: 'A per-waypoint action has a non-numeric heading or pitch ({d}). Export was stopped — without this the value would land verbatim in the file and only the controller would reject it, already in the field.',
  },
  'export.err.per-waypoint-invalid': {
    pt: 'Uma entrada de acções por waypoint tem um formato inesperado ({d}).',
    en: 'A per-waypoint action entry has an unexpected shape ({d}).',
  },
  'export.err.param-out-of-range': {
    pt: 'Parâmetro de missão fora do intervalo admissível: reveja os parâmetros do plano.',
    en: 'Mission parameter outside the admissible range: check the plan parameters.',
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
    pt: 'Carregue primeiro o relevo (cartão 2, Área e relevo) e gere um plano',
    en: 'Load the terrain first (card 2, Area and terrain) and generate a plan',
  },
  'app.checklist': { pt: 'Checklist de campo', en: 'Field checklist' },
  'app.checklistTitle': {
    pt: 'Checklist de campo UAS (pré-campo, durante, pós-campo) + relatório de missão',
    en: 'UAS field checklist (pre-field, in-field, post-field) + mission report',
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
    pt: 'A célula desactivada fica dentro do polígono do KML: a missão do Pilot 2 vai cobri-la.',
    en: 'The disabled cell stays inside the KML polygon: the Pilot 2 mission will cover it.',
  },
  'app.kmlCellsNote': {
    pt: 'As {n} células desactivadas ficam dentro do polígono do KML: a missão do Pilot 2 vai cobri-las.',
    en: 'The {n} disabled cells stay inside the KML polygon: the Pilot 2 mission will cover them.',
  },
  // um só nome para a exportação da missão do separador aberto (cabeçalho e
  // painéis), com o que o clique escreve: {ext} é KMZ ou ZIP
  'app.exportWpml': { pt: 'Exportar WPML Avançado ({ext})', en: 'Export Advanced WPML ({ext})' },
  'app.exportWpmlTitle': {
    pt: 'Missão completa DJI (wpmz/template.kml + waylines.wpml)',
    en: 'Full DJI mission (wpmz/template.kml + waylines.wpml)',
  },
  // a área em vários voos: qual dos ZIP de «Exportar voos» o botão escreve
  'app.exportWpmlAllTitle': {
    pt: 'Um KMZ por voo, todos soltos num ZIP ({file}): o mesmo que «Todos os voos (KMZ, ZIP)» em «Exportar voos».',
    en: 'One KMZ per flight, all loose in a ZIP ({file}): the same as “All flights (KMZ, ZIP)” under “Export flights”.',
  },
  'app.exportWpmlByBaseTitle': {
    pt: 'Um KMZ por voo, numa pasta por base ({file}): o mesmo que «Voos por base (KMZ, ZIP)» em «Exportar voos».',
    en: 'One KMZ per flight, in one folder per base ({file}): the same as “Flights by base (KMZ, ZIP)” under “Export flights”.',
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
  'stats.gsdCentre': { pt: 'GSD (centro da imagem)', en: 'GSD (frame centre)' },
  'stats.gsdCentreHint': {
    pt: 'Com o gimbal oblíquo o GSD usa a distância inclinada ao centro da imagem (altura ÷ sen|pitch|); nos bordos superiores da imagem é pior.',
    en: 'With an oblique gimbal the GSD uses the slant range to the frame centre (height ÷ sin|pitch|); the upper frame edges are worse.',
  },
  'stats.gsdOblique': { pt: '— (oblíqua)', en: 'n/a (oblique)' },
  'stats.gsdRangeHint': {
    pt: 'Intervalo [pior, melhor] com o erro de posicionamento e o relevo dentro da área (ver Métodos §2).',
    en: 'Range [worst, best] with positioning error and relief inside the area (see Methods §2).',
  },
  'stats.overlapRange': { pt: 'Sobreposição efectiva', en: 'Effective overlap' },
  'stats.overlapRangeHint': {
    pt: 'Frontal / lateral no pior caso do posicionamento e do relevo; o mínimo habitual é 60 / 50 %.',
    en: 'Forward / side in the worst case of positioning and relief; the usual minimum is 60 / 50 %.',
  },
  'stats.density': { pt: 'Densidade LiDAR', en: 'LiDAR density' },
  'stats.densityHint': {
    pt: 'Média na área, PRR ÷ (velocidade × espaçamento), com o PRR (taxa de repetição de impulsos) de retorno único — conservador; com retornos múltiplos aumenta. Entre parênteses: o mínimo de uma só passagem, PRR ÷ (velocidade × largura de varrimento).',
    en: 'Area mean, PRR ÷ (speed × line spacing), using the single-return PRR (pulse repetition rate) — conservative; multiple returns raise it. In parentheses: the single-pass minimum, PRR ÷ (speed × swath).',
  },
  'stats.footprint': { pt: 'Pegada no solo', en: 'Ground footprint' },
  'stats.swath': { pt: 'largura {v} m', en: 'swath {v} m' },
  'stats.spacing': { pt: 'Espaçamento entre faixas', en: 'Line spacing' },
  'stats.interval': { pt: 'Intervalo de disparo', en: 'Trigger interval' },
  'stats.area': { pt: 'Área', en: 'Area' },
  'stats.lines': { pt: 'Faixas', en: 'Lines' },
  'stats.circles': { pt: 'Círculos', en: 'Circles' },
  'stats.waypoints': { pt: 'Waypoints', en: 'Waypoints' },
  'stats.totalDist': { pt: 'Distância total', en: 'Total distance' },
  'stats.photos': { pt: 'Fotos', en: 'Photos' },
  'stats.photosHint': {
    pt: 'Total (o disparo por distância cobre também o prolongamento) e, entre parênteses, as fotos sobre a área.',
    en: 'Total (the distance trigger also fires along the overshoot) and, in parentheses, the photos over the area.',
  },
  'stats.time': { pt: 'Tempo na missão (sem deslocação)', en: 'Mission time (no transit)' },
  'stats.missionTime': { pt: 'Tempo na missão', en: 'Mission time' },
  'stats.baseToArea': { pt: 'Base → área', en: 'Base → area' },
  'stats.insideArea': { pt: 'dentro da área', en: 'inside the area' },
  'stats.groupQuality': { pt: 'Qualidade', en: 'Quality' },
  'stats.groupFlight': { pt: 'Voo', en: 'Flight' },
  'stats.groupOps': { pt: 'Operação', en: 'Operation' },
  'stats.passes': { pt: 'Passagens', en: 'Passes' },
  'stats.levels': { pt: 'Níveis', en: 'Levels' },
  'stats.intervalWarnHint': {
    pt: 'Abaixo do intervalo mínimo da câmara a esta velocidade: ver o preflight.',
    en: 'Below the camera’s minimum interval at this speed: see the preflight.',
  },
  'stats.flights': { pt: 'Voos', en: 'Flights' },
  'stats.title': { pt: 'Métricas', en: 'Metrics' },
  'stats.hide': { pt: 'Recolher as métricas', en: 'Collapse the metrics' },
  'stats.show': { pt: 'Mostrar as métricas', en: 'Show the metrics' },
  'stats.basesN': { pt: '{b} bases', en: '{b} bases' },
  'stats.basesNOne': { pt: '1 base', en: '1 base' },
  'stats.flightsN': { pt: '{n} voos', en: '{n} flights' },
  'stats.flightsNOne': { pt: '1 voo', en: '1 flight' },
  'stats.batteries': { pt: 'Conjuntos de baterias', en: 'Battery sets' },
  'stats.setsNeeded': { pt: '{n} necessários', en: '{n} needed' },
  'stats.setsNeededOne': { pt: '1 necessário', en: '1 needed' },
  'stats.setsVs': { pt: '{n} necessários · {s} na equipa', en: '{n} needed · {s} in the team' },
  'stats.setsVsOne': { pt: '1 necessário · {s} na equipa', en: '1 needed · {s} in the team' },
  'stats.setsShortHint': {
    pt: 'A missão pede mais voos do que os conjuntos de baterias que a equipa tem: conte com recarregar no campo.',
    en: 'The mission needs more flights than the battery sets the team has: plan on recharging in the field.',
  },
  'stats.longest': { pt: 'Voo mais longo', en: 'Longest flight' },
  'stats.longestOf': { pt: 'Voo mais longo · {label}', en: 'Longest flight · {label}' },
  'stats.vsBattery': { pt: 'Duração do voo', en: 'Flight time' },
  'stats.ofUseful': { pt: 'de {u}', en: 'of {u}' },
  'stats.usefulPct': {
    pt: '{p} % do tempo útil da bateria',
    en: "{p} % of the battery's usable time",
  },
  'stats.longestHint': {
    pt: 'Com a deslocação desde a base, contra o tempo útil de um conjunto de baterias. Âmbar acima de 90 %, vermelho acima de 100 %.',
    en: 'Including transit from the base, against the usable time of one battery set. Amber above 90 %, red above 100 %.',
  },
  'stats.totalTime': { pt: 'Com as deslocações', en: 'Including transit' },
  'stats.totalTimeHint': {
    pt: 'Soma de todos os voos, com as deslocações; sem trocas de bateria nem mudanças de base.',
    en: 'Sum of all flights, including transit; without battery swaps or base moves.',
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
  'map.zoomIn': { pt: 'Aproximar', en: 'Zoom in' },
  'map.zoomOut': { pt: 'Afastar', en: 'Zoom out' },
  'map.layers': { pt: 'Camadas do mapa', en: 'Map layers' },
  'map.drawTools': { pt: 'Desenhar no mapa', en: 'Draw on the map' },
  'map.toolBase': { pt: 'Base', en: 'Base' },
  'map.toolInspect': { pt: 'Inspecção', en: 'Inspection' },

  /* ---- Primeiros passos (primeiro ecrã, sem área) ---- */
  'guide.title': { pt: 'Primeiros passos', en: 'First steps' },
  'guide.count': { pt: '{n} de {total}', en: '{n} of {total}' },
  'guide.hide': { pt: 'Esconder os primeiros passos', en: 'Hide the first steps' },
  'guide.now': { pt: 'Passo 1 · agora', en: 'Step 1 · now' },
  'guide.step': { pt: 'Passo {n}', en: 'Step {n}' },
  'guide.s1': { pt: 'Desenhe ou importe a área', en: 'Draw or import the area' },
  'guide.s1Polygon': {
    pt: 'clique em cada vértice e feche no primeiro, ou com duplo clique. Esc cancela.',
    en: 'click each vertex and close on the first one, or with a double-click. Esc cancels.',
  },
  'guide.s1ShapesLead': { pt: 'Rectângulo e Quadrado:', en: 'Rectangle and Square:' },
  'guide.s1Shapes': {
    pt: 'clique no centro e acerte as medidas no painel.',
    en: 'click the centre and set the size in the panel.',
  },
  'guide.s1Import': {
    pt: 'Ou importe um ficheiro no cartão 2: KML, GeoJSON, SHP (.zip) ou KMZ WPML.',
    en: 'Or import a file in card 2: KML, GeoJSON, SHP (.zip) or WPML KMZ.',
  },
  'guide.s2': { pt: 'Relevo', en: 'Terrain' },
  'guide.s2Text': {
    pt: 'MDT local (GeoTIFF LiDAR da DGT) ou relevo global de ~30 m, no cartão 2.',
    en: 'Local DTM (DGT LiDAR GeoTIFF) or ~30 m global terrain, in card 2.',
  },
  'guide.s3': { pt: 'Parâmetros de voo', en: 'Flight parameters' },
  'guide.s3Text': {
    pt: 'Altura, GSD e sobreposições, no cartão 3. O plano e as métricas aparecem no mapa.',
    en: 'Height, GSD and overlaps, in card 3. The plan and the metrics appear on the map.',
  },
  'guide.project': {
    pt: 'Já tem um plano gravado? Abra o projecto (.json) com',
    en: 'Already have a saved plan? Open the project (.json) with',
  },

  /* ---- Legenda das camadas, vista 3D, intervalo manual e descolagem da face e da órbita ---- */
  'legend.title': { pt: 'Legenda', en: 'Legend' },
  'legend.area': { pt: 'Área', en: 'Area' },
  'legend.buffer': { pt: 'Margem', en: 'Buffer' },
  'legend.lines': { pt: 'Faixas e rota', en: 'Lines and route' },
  'legend.photos': { pt: 'Fotos', en: 'Photos' },
  'legend.gcps': { pt: 'GCP', en: 'GCP' },
  'legend.bases': { pt: 'Bases e zonas de descolagem', en: 'Bases and take-off zones' },
  'legend.inspect': { pt: 'Pontos de inspecção', en: 'Inspection points' },
  'legend.corridor': { pt: 'Corredor', en: 'Corridor' },
  'legend.face': { pt: 'Face', en: 'Face' },
  'legend.orbit': { pt: 'Órbita', en: 'Orbit' },
  'legend.circular': { pt: 'Circular', en: 'Circular' },
  'legend.terrain': { pt: 'Relevo', en: 'Terrain' },
  'legend.blocks': { pt: 'Blocos', en: 'Blocks' },
  'legend.route': { pt: 'Rota', en: 'Route' },
  'legend.waypoints': { pt: 'Waypoints', en: 'Waypoints' },
  'legend.hint': { pt: 'mostrar no mapa', en: 'show on the map' },
  'legend.expand': { pt: 'Mostrar a legenda', en: 'Show the legend' },
  'legend.collapse': { pt: 'Recolher a legenda', en: 'Collapse the legend' },
  'legend.groupMission': { pt: 'Missão', en: 'Mission' },
  'legend.groupAnalysis': { pt: 'Análise', en: 'Analysis' },
  'legend.areaBlocks': { pt: 'Área e blocos', en: 'Area and blocks' },
  'legend.blocksBase': {
    pt: 'Cada bloco na cor da sua base',
    en: "Each block in its base's colour",
  },
  'legend.linesBase': { pt: 'Na cor da base', en: "In the base's colour" },
  'legend.linesBlock': { pt: 'Uma cor por bloco', en: 'One colour per block' },
  'legend.start': { pt: 'início', en: 'start' },
  'legend.end': { pt: 'fim', en: 'end' },
  'legend.photosDesc': { pt: 'Onde a câmara dispara', en: 'Where the camera fires' },
  'legend.basesDesc': {
    pt: '{n} bases · a tracejado, o raio pedido se foi reduzido',
    en: '{n} bases · dashed, the requested radius if it was reduced',
  },
  'legend.basesDescOne': {
    pt: '1 base · a tracejado, o raio pedido se foi reduzido',
    en: '1 base · dashed, the requested radius if it was reduced',
  },
  'legend.viewshedOn': {
    pt: 'Ligada · lembrada neste aparelho',
    en: 'On · remembered on this device',
  },
  'legend.viewshedOff': {
    pt: 'Desligada · lembrada neste aparelho',
    en: 'Off · remembered on this device',
  },
  'legend.viewshedHidden': {
    pt: 'Atrás do relevo, visto da base',
    en: 'Behind the terrain, seen from the base',
  },
  'legend.viewshedRadio': {
    pt: 'À vista, mas com o rádio em risco',
    en: 'In view, but with the radio link at risk',
  },
  'legend.viewshedPct': {
    pt: 'No centro de cada bloco, a parte à vista',
    en: 'At the centre of each block, the share in view',
  },
  'legend.note': {
    pt: 'Só aparecem as camadas com conteúdo.',
    en: 'Only the layers with content are listed.',
  },
  'map3d.imageryOk': { pt: 'Imagens © Esri', en: 'Imagery © Esri' },
  'map3d.imageryLoading': { pt: 'A carregar imagens…', en: 'Loading imagery…' },
  'map3d.imageryFallback': {
    pt: 'Relevo sombreado (sem imagens)',
    en: 'Shaded relief (no imagery)',
  },
  'map3d.controlsHint': {
    pt: 'Arrastar: rodar · Roda do rato: zoom · Botão direito: deslocar · Esc: fechar',
    en: 'Drag: rotate · Wheel: zoom · Right button: pan · Esc: close',
  },
  'map3d.noTerrain': {
    pt: 'Sem relevo carregado: descarregue o relevo da área para ver a missão em 3D.',
    en: "No terrain loaded: download the area's terrain to see the mission in 3D.",
  },
  'stats.intervalManual': { pt: 'manual', en: 'manual' },
  'takeoff.label': { pt: 'Descolagem', en: 'Take-off' },
  'takeoff.base': { pt: 'Na base {label}', en: 'At base {label}' },
  'takeoff.baseHint': {
    pt: 'As alturas exportadas são relativas à base {base} (cota {elev} m): o chão do alvo está a {dh} m dela, e essa diferença soma-se às alturas do plano.',
    en: 'Exported heights are relative to base {base} (elevation {elev} m): the target ground is {dh} m from it, and that difference is added to the plan heights.',
  },
  'takeoff.err.base-missing': {
    pt: 'A base escolhida já não existe no projecto: escolha outra descolagem.',
    en: 'The chosen base is no longer in the project: choose another take-off.',
  },
  'takeoff.err.terrain-missing': {
    pt: 'Sem relevo carregado: carregue-o para converter as alturas para a base.',
    en: 'No terrain loaded: load it to convert the heights to the base.',
  },
  'takeoff.err.ref-outside-terrain': {
    pt: 'O relevo carregado não cobre a base e o alvo: carregue relevo que cubra os dois.',
    en: 'The loaded terrain does not cover both the base and the target: load terrain that covers both.',
  },
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
