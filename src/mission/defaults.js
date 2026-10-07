/**
 * Valores por omissão do estado que o ficheiro de projecto guarda. Ficam
 * num módulo puro para o App, os hooks, o esquema JSON e os testes
 * partirem da mesma forma.
 */

/** Parâmetros de voo da missão de área. */
export const DEFAULT_PARAMS = {
  altitude: 100,
  speed: 10,
  frontOverlap: 80,
  sideOverlap: 70,
  angle: 90,
  bufferPct: 0,
  triggerMode: 'distance', // 'distance' | 'waypoint'
  spacingMode: 'auto', // 'auto' (sobreposição) | 'manual' (distância em m)
  manualSpacing: 50,
  crosshatch: false, // dupla grelha perpendicular (3D)
  includeNadir: false, // passagem nadir extra no fim do crosshatch — R2.10
  gimbalPitch: -90, // inclinação da câmara: -90 nadir · -60/-45 oblíqua
  overshoot: 0, // prolongamento de cada faixa nos dois extremos (m) — T2.2
  tieLine: false, // fiada de amarração perpendicular no fim — T2.3
  waypointStops: 'corners', // 'corners' | 'all': paragem só nos cantos das faixas, ou em todos os waypoints
}

/** Divisão da missão em blocos. */
export const DEFAULT_SPLIT = {
  mode: 'none', // 'none' | 'area' | 'battery' | 'tiles'
  maxAreaHa: 20,
  // Reserva sobre a bateria: 0, porque o tempo útil por voo (equipamento,
  // Configuração) já desconta a reserva com que se aterra. Só os projectos
  // antigos traziam 30 %, que a leitura incorpora no tempo útil (project.js).
  reservePct: 0,
  maxSide: 500, // teto do lado do bloco por bateria (conforto VLOS)
  tileSize: 250, // lado dos quadrados do mosaico (m)
  tileOrientation: 0, // azimute da malha do mosaico (quando não segue as faixas)
  // quadrados com as arestas paralelas às linhas de voo (mosaicOrientationForLines)
  tileOrientationAuto: true,
  mosaic: 2, // geração do mosaico: 2 = buildSquareMosaic (project.js, MOSAIC_VERSION)
}

/** Rectângulo ou grelha gerados a partir de um ponto-âncora. */
export const DEFAULT_ANCHOR = {
  center: null,
  length: 500,
  width: 300,
  orientation: 90,
  shape: 'rect', // 'rect' | 'square'
  cols: 1, // grelha de blocos: colunas ao longo da orientação
  rows: 1, // grelha de blocos: linhas perpendiculares
}

export const DEFAULT_TERRAIN_FOLLOW = { enabled: false, tolerance: 5 }

export const DEFAULT_GCP_CONFIG = { enabled: false, count: null } // null = auto
