import { createContext, useContext } from 'react'
import controlPanelDict from './i18n/dict.controlPanel.js'

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

export function useT() {
  const lang = useContext(LangContext)
  return (key, vars) => {
    const entry = DICT[key]
    let s = entry ? (entry[lang] ?? entry.pt) : key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }
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
  'app.exportKml': { pt: 'Exportar KML Simples', en: 'Export Simple KML' },
  'app.exportKmlTitle': {
    pt: 'Polígono 2D da área (KML padrão)',
    en: '2D polygon of the area (standard KML)',
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

  /* ---- Painel de métricas ---- */
  'stats.gsd': { pt: 'GSD', en: 'GSD' },
  'stats.density': { pt: 'Densidade LiDAR', en: 'LiDAR density' },
  'stats.densityHint': {
    pt: 'PRR ÷ (velocidade × faixa), com o PRR de retorno único — conservador, multi-eco aumenta. Entre parênteses: densidade na banda de sobreposição lateral (2 passagens).',
    en: 'PRR ÷ (speed × swath), using the single-return PRR — conservative, multi-echo raises it. In parentheses: density in the side-overlap band (2 passes).',
  },
  'stats.footprint': { pt: 'Pegada no chão', en: 'Ground footprint' },
  'stats.swath': { pt: 'faixa {v} m', en: 'swath {v} m' },
  'stats.spacing': { pt: 'Espaç. faixas', en: 'Line spacing' },
  'stats.interval': { pt: 'Intervalo disparo', en: 'Trigger interval' },
  'stats.area': { pt: 'Área', en: 'Area' },
  'stats.lines': { pt: 'Nº de faixas', en: 'No. of lines' },
  'stats.waypoints': { pt: 'Waypoints', en: 'Waypoints' },
  'stats.totalDist': { pt: 'Distância total', en: 'Total distance' },
  'stats.photos': { pt: 'Nº de fotos', en: 'No. of photos' },
  'stats.time': { pt: 'Tempo estimado', en: 'Estimated time' },
  'stats.baseToArea': { pt: 'Base → área', en: 'Base → area' },
  'stats.insideArea': { pt: 'dentro da área', en: 'inside the area' },
  'stats.blocks': { pt: 'Blocos de voo', en: 'Flight blocks' },

  /* ---- Vista 3D ---- */
  'map3d.title': { pt: 'Vista 3D', en: '3D View' },
  'map3d.exaggeration': { pt: 'Exagero', en: 'Exaggeration' },
  'map3d.reset': { pt: '↺ Repor vista', en: '↺ Reset view' },
  'map3d.close': { pt: '✕ Fechar', en: '✕ Close' },

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
}

const DICT = { ...BASE_DICT, ...controlPanelDict }

export default DICT
