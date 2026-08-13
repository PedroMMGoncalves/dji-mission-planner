/**
 * Dicionário de Hardware — perfis da frota de drones/sensores.
 *
 * Estrutura expansível: para adicionar um novo drone basta acrescentar uma
 * entrada a este objeto. Campos:
 *  - label:        nome apresentado no dropdown
 *  - type:         'camera' (fotogrametria) | 'custom' (câmara manual ou LiDAR)
 *  - camera:       descrição da câmara
 *  - sensorWidth:  largura física do sensor (mm) — usada no cálculo da pegada transversal
 *  - sensorHeight: altura física do sensor (mm) — usada no cálculo da pegada longitudinal
 *  - focalLength:  distância focal real da lente (mm)
 *  - imageWidth:   largura da imagem (px) — usada no cálculo do GSD
 *  - imageHeight:  altura da imagem (px)
 *  - payloadLabel: identificador do payload (informativo)
 *  - wpml:         enums oficiais DJI usados no template.kml / waylines.wpml
 *                  (droneEnumValue / payloadEnumValue — confirmar na documentação
 *                  WPML da DJI se a app Pilot 2 rejeitar a importação)
 */
export const DRONE_PROFILES = {
  M3E: {
    id: 'M3E',
    label: 'DJI Mavic 3 Enterprise (M3E)',
    type: 'camera',
    camera: 'Wide RGB — CMOS 4/3"',
    sensorWidth: 17.3,
    sensorHeight: 13.0,
    focalLength: 12.2,
    imageWidth: 5280,
    imageHeight: 3956,
    payloadLabel: 'XT24',
    wpml: {
      droneEnumValue: 77,
      droneSubEnumValue: 0,
      payloadEnumValue: 66,
      payloadSubEnumValue: 0,
      payloadPositionIndex: 0,
    },
  },

  M4T: {
    id: 'M4T',
    label: 'DJI Matrice 4T (M4T)',
    type: 'camera',
    camera: 'Wide RGB — CMOS 4/3"',
    sensorWidth: 17.3,
    sensorHeight: 13.0,
    focalLength: 12.2,
    imageWidth: 5280,
    imageHeight: 3956,
    payloadLabel: 'XT24',
    wpml: {
      droneEnumValue: 99,
      droneSubEnumValue: 1,
      payloadEnumValue: 89,
      payloadSubEnumValue: 0,
      payloadPositionIndex: 0,
    },
  },

  M300RTK: {
    id: 'M300RTK',
    label: 'DJI Matrice 300 RTK + Zenmuse P1',
    type: 'camera',
    camera: 'Zenmuse P1 — Full Frame 35 mm',
    sensorWidth: 35.9,
    sensorHeight: 24.0,
    focalLength: 35.0,
    imageWidth: 8192,
    imageHeight: 5460,
    payloadLabel: 'P1',
    wpml: {
      droneEnumValue: 60,
      droneSubEnumValue: 0,
      payloadEnumValue: 50,
      payloadSubEnumValue: 0,
      payloadPositionIndex: 0,
    },
  },

  CUSTOM: {
    id: 'CUSTOM',
    label: 'Custom / LiDAR',
    type: 'custom',
    camera: 'Definido manualmente',
    payloadLabel: '—',
    // Enums por defeito para o perfil custom (editáveis na interface):
    wpml: {
      droneEnumValue: 60,
      droneSubEnumValue: 0,
      payloadEnumValue: 50,
      payloadSubEnumValue: 0,
      payloadPositionIndex: 0,
    },
  },
}

/**
 * Catálogo de presets de missão — tipos de levantamento típicos, cada um com
 * uma combinação recomendada de sobreposições, velocidade, gimbal e dupla
 * grelha. `appliesTo` filtra por tipo de sensor ('camera' | 'lidar');
 * `speedByProfile` afina a velocidade para drones específicos. Os textos são
 * bilingues ({ pt, en }) e resolvidos na interface. Lista expansível — basta
 * acrescentar entradas.
 */
export const MISSION_PRESETS = [
  {
    id: 'ortho-quality',
    appliesTo: 'camera',
    name: { pt: 'Ortofoto 2D · Qualidade', en: '2D Ortho · Quality' },
    desc: {
      pt: 'Cartografia de referência: 80/70% de sobreposição, gimbal a nadir.',
      en: 'Reference mapping: 80/70% overlap, nadir gimbal.',
    },
    values: { frontOverlap: 80, sideOverlap: 70, speed: 8, gimbalPitch: -90, crosshatch: false },
    speedByProfile: { M300RTK: 7 },
  },
  {
    id: 'ortho-fast',
    appliesTo: 'camera',
    name: { pt: 'Ortofoto 2D · Rápida', en: '2D Ortho · Fast' },
    desc: {
      pt: 'Reconhecimento expedito: 70/60%, velocidade alta.',
      en: 'Quick reconnaissance: 70/60% overlap, high speed.',
    },
    values: { frontOverlap: 70, sideOverlap: 60, speed: 10, gimbalPitch: -90, crosshatch: false },
  },
  {
    id: 'model-3d',
    appliesTo: 'camera',
    name: { pt: 'Modelo 3D · Dupla grelha', en: '3D Model · Crosshatch' },
    desc: {
      pt: 'Reconstrução 3D: dupla grelha perpendicular com câmara oblíqua a −60°.',
      en: '3D reconstruction: perpendicular double grid with the camera at −60°.',
    },
    values: { frontOverlap: 80, sideOverlap: 75, speed: 6, gimbalPitch: -60, crosshatch: true },
  },
  {
    id: 'multispectral',
    appliesTo: 'camera',
    name: { pt: 'Multiespectral · Agricultura', en: 'Multispectral · Agriculture' },
    desc: {
      pt: '80/80% e voo lento; fotografar o painel radiométrico e voar perto do meio-dia solar.',
      en: '80/80% overlap and slow flight; photograph the radiometric panel and fly near solar noon.',
    },
    values: { frontOverlap: 80, sideOverlap: 80, speed: 5, gimbalPitch: -90, crosshatch: false },
  },
  {
    id: 'lidar-standard',
    appliesTo: 'lidar',
    name: { pt: 'LiDAR · Standard', en: 'LiDAR · Standard' },
    desc: {
      pt: 'Levantamento LiDAR corrente: 50% de sobreposição lateral a 5 m/s.',
      en: 'Standard LiDAR survey: 50% side overlap at 5 m/s.',
    },
    values: { sideOverlap: 50, speed: 5, gimbalPitch: -90, crosshatch: false },
  },
  {
    id: 'lidar-dense',
    appliesTo: 'lidar',
    name: { pt: 'LiDAR · Denso', en: 'LiDAR · Dense' },
    desc: {
      pt: 'Nuvem densa (vegetação/detalhe): 70% lateral a 4 m/s.',
      en: 'Dense point cloud (vegetation/detail): 70% side overlap at 4 m/s.',
    },
    values: { sideOverlap: 70, speed: 4, gimbalPitch: -90, crosshatch: false },
  },
]

/** Valores iniciais do sensor custom (câmara manual ou LiDAR por FOV). */
export const DEFAULT_CUSTOM_SENSOR = {
  mode: 'camera', // 'camera' | 'lidar'
  sensorWidth: 17.3,
  sensorHeight: 13.0,
  focalLength: 12.2,
  imageWidth: 5280,
  fov: 70, // abertura total do feixe LiDAR, em graus
  droneEnumValue: 60,
  payloadEnumValue: 50,
}
