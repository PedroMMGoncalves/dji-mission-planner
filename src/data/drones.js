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
