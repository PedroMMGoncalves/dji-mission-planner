/**
 * Hardware dictionary — aircraft and payloads, decoupled (T1.1).
 *
 * AIRCRAFT holds what belongs to the airframe: mission speed limits, default
 * battery duration, the WPML drone enums and the list of mountable payloads.
 * PAYLOADS holds what belongs to the sensor: optics (camera) or beam geometry
 * (lidar), trigger limits and the WPML payload enums. Integrated drones list
 * exactly one payload (the UI only shows the payload dropdown when there is a
 * choice); modular aircraft (M300) list several, including CUSTOM.
 *
 * Aircraft fields:
 *  - label:      name shown in the dropdown
 *  - speedRange: mission speed limits (m/s), clamped in the UI
 *  - batteryMin: default battery duration (min, DJI spec max) — per-combo
 *                overrides arrive with T1.4
 *  - wpml:       { droneEnumValue, droneSubEnumValue } for template/waylines
 *  - payloads:   ids into PAYLOADS, first entry is the default
 *
 * Payload fields:
 *  - label:        short name (payload dropdown / composed hardware label)
 *  - desc:         descriptive text for the specs line
 *  - payloadLabel: short code for the specs line
 *  - type:         'camera' | 'lidar' | 'custom' (manual camera or LiDAR)
 *  - camera optics: sensorWidth/sensorHeight (mm), focalLength (mm, real),
 *                   imageWidth/imageHeight (px)
 *  - lidar geometry: fov (deg, nominal), effectiveFov (deg, working cut),
 *                    maxPrr (pts/s) — used from T1.2 on
 *  - minTriggerS:  minimum interval between camera triggers (s)
 *  - maxAglM:      optional operational AGL ceiling (warning, T1.3)
 *  - wpml:         { payloadEnumValue, payloadSubEnumValue,
 *                    payloadPositionIndex } (confirm against DJI WPML docs
 *                    if Pilot 2 rejects the import)
 */
export const AIRCRAFT = {
  M3E: {
    id: 'M3E',
    label: 'DJI Mavic 3 Enterprise (M3E)',
    speedRange: { min: 1, max: 15 },
    batteryMin: 45,
    // Hovering accuracy from the DJI spec sheet (dji.com/mavic-3-enterprise/specs,
    // checked 2026-09-02): vertical +-0.1 m (vision) / +-0.5 m (GNSS),
    // horizontal +-0.3 m (vision) / +-0.5 m (high-precision positioning);
    // with the RTK module 1 cm + 1 ppm (H) and 1.5 cm + 1 ppm (V). The GNSS
    // figures used here are the conservative ones (route-following error
    // is larger than hovering error; to be calibrated with flight logs).
    positioning: {
      gnss: { verticalM: 0.5, horizontalM: 1.5 },
      rtk: { verticalM: 0.03, horizontalM: 0.02 },
    },
    maxClimbMS: 6, // max ascent speed, normal mode (spec sheet)
    wpml: { droneEnumValue: 77, droneSubEnumValue: 0 },
    payloads: ['M3E_WIDE'],
  },

  M4T: {
    id: 'M4T',
    label: 'DJI Matrice 4T (M4T)',
    speedRange: { min: 1, max: 15 },
    batteryMin: 49,
    // Same positioning class as the M3E (DJI Matrice 4 series spec sheet,
    // checked 2026-09-02); RTK module optional.
    positioning: {
      gnss: { verticalM: 0.5, horizontalM: 1.5 },
      rtk: { verticalM: 0.03, horizontalM: 0.02 },
    },
    maxClimbMS: 6,
    wpml: { droneEnumValue: 99, droneSubEnumValue: 1 },
    payloads: ['M4T_WIDE'],
  },

  M300RTK: {
    id: 'M300RTK',
    label: 'DJI Matrice 300 RTK',
    speedRange: { min: 1, max: 17 },
    batteryMin: 55,
    // M300 RTK spec sheet: hovering accuracy vertical +-0.1 m (vision) /
    // +-0.5 m (GNSS), horizontal +-0.3 m (vision) / +-1.5 m (GNSS); RTK
    // 1 cm + 1 ppm (H), 1.5 cm + 1 ppm (V). Max ascent 5 m/s (P mode).
    positioning: {
      gnss: { verticalM: 0.5, horizontalM: 1.5 },
      rtk: { verticalM: 0.03, horizontalM: 0.02 },
    },
    maxClimbMS: 5,
    wpml: { droneEnumValue: 60, droneSubEnumValue: 0 },
    payloads: ['P1', 'MAPPER_PLUS', 'CUSTOM'],
  },

  CUSTOM: {
    id: 'CUSTOM',
    label: 'Custom',
    speedRange: { min: 1, max: 20 },
    batteryMin: 25,
    positioning: {
      gnss: { verticalM: 1, horizontalM: 2 },
      rtk: { verticalM: 0.05, horizontalM: 0.03 },
    },
    maxClimbMS: 4,
    // Default enums, editable in the custom editor of the UI:
    wpml: { droneEnumValue: 60, droneSubEnumValue: 0 },
    payloads: ['CUSTOM'],
  },
}

export const PAYLOADS = {
  M3E_WIDE: {
    id: 'M3E_WIDE',
    label: 'Wide RGB',
    desc: 'Wide RGB — CMOS 4/3"',
    payloadLabel: 'XT24',
    type: 'camera',
    sensorWidth: 17.3,
    sensorHeight: 13.0,
    focalLength: 12.2,
    imageWidth: 5280,
    imageHeight: 3956,
    minTriggerS: 0.7,
    wpml: { payloadEnumValue: 66, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
  },

  M4T_WIDE: {
    // T0.1 STILL OPEN: the optics below are M3E-class placeholders. The real
    // M4T wide camera is a 1/1.3" 48 MP unit (DJI: FOV 82 deg, 8064x6048,
    // 24 mm equivalent) — values will be replaced from the EXIF of a real
    // photo. Until then footprint/GSD for M4T are NOT to be trusted.
    id: 'M4T_WIDE',
    label: 'Wide RGB',
    desc: 'Wide RGB — CMOS 4/3"',
    payloadLabel: 'XT24',
    type: 'camera',
    sensorWidth: 17.3,
    sensorHeight: 13.0,
    focalLength: 12.2,
    imageWidth: 5280,
    imageHeight: 3956,
    minTriggerS: 0.7,
    wpml: { payloadEnumValue: 89, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
  },

  P1: {
    id: 'P1',
    label: 'Zenmuse P1',
    desc: 'Zenmuse P1 — Full Frame 35 mm',
    payloadLabel: 'P1',
    type: 'camera',
    sensorWidth: 35.9,
    sensorHeight: 24.0,
    focalLength: 35.0,
    imageWidth: 8192,
    imageHeight: 5460,
    minTriggerS: 0.7,
    wpml: { payloadEnumValue: 50, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
  },

  MAPPER_PLUS: {
    // YellowScan Mapper+ (Livox AVIA) on the M300 Skyport mount.
    // Source: yellowscan.com/products/mapper-plus (checked 2026-08-18):
    // FOV 70.4 deg nominal, 240 kHz PRR (single return), 100 m max AGL.
    // payloadEnumValue 65534 = "PSDK Payload Device", the documented enum
    // for third-party payloads (DJI WPML common-element table).
    id: 'MAPPER_PLUS',
    label: 'YellowScan Mapper+',
    desc: 'YellowScan Mapper+ — LiDAR Livox AVIA',
    payloadLabel: 'Mapper+',
    type: 'lidar',
    fov: 70.4, // nominal full beam aperture (deg)
    effectiveFov: null, // working cut set in the UI; null = fly the nominal
    maxPrr: 240000, // pts/s, single-return figure (T2.1 density estimator)
    maxAglM: 100, // operational ceiling (T1.3 warning)
    wpml: { payloadEnumValue: 65534, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
  },

  CUSTOM: {
    id: 'CUSTOM',
    label: 'Custom / LiDAR',
    desc: 'Definido manualmente',
    payloadLabel: '—',
    type: 'custom',
    minTriggerS: 0.7,
    // Default enums, editable in the custom editor of the UI:
    wpml: { payloadEnumValue: 50, payloadSubEnumValue: 0, payloadPositionIndex: 0 },
  },
}

/** Default hardware selection for new projects and failed migrations. */
export const DEFAULT_SELECTION = { aircraftId: 'M3E', payloadId: 'M3E_WIDE' }

// Legacy single-id profiles (pre-T1.1) mapped to aircraft + sole payload.
const LEGACY_DRONE_IDS = {
  M3E: { aircraftId: 'M3E', payloadId: 'M3E_WIDE' },
  M4T: { aircraftId: 'M4T', payloadId: 'M4T_WIDE' },
  M300RTK: { aircraftId: 'M300RTK', payloadId: 'P1' },
  CUSTOM: { aircraftId: 'CUSTOM', payloadId: 'CUSTOM' },
}

/**
 * Normalises any stored hardware selection to a valid pair:
 *  - legacy `droneId` strings (projects saved before T1.1) map to their
 *    aircraft + sole payload;
 *  - `{ aircraftId, payloadId }` objects are validated against the catalog,
 *    with the payload snapped to the aircraft's list when incompatible.
 * Unknown ids fall back to DEFAULT_SELECTION with a console warning — this
 * function never throws, so old saved projects always load.
 */
export function migrateDroneSelection(stored) {
  if (typeof stored === 'string') {
    const hit = LEGACY_DRONE_IDS[stored]
    if (hit) return { ...hit }
    console.warn(`[drones] unknown legacy droneId "${stored}" — using default`)
    return { ...DEFAULT_SELECTION }
  }
  if (stored && typeof stored === 'object') {
    const aircraft = AIRCRAFT[stored.aircraftId]
    if (!aircraft) {
      console.warn(`[drones] unknown aircraftId "${stored.aircraftId}" — using default`)
      return { ...DEFAULT_SELECTION }
    }
    if (!aircraft.payloads.includes(stored.payloadId)) {
      console.warn(
        `[drones] payload "${stored.payloadId}" not available on ${aircraft.id} — using ${aircraft.payloads[0]}`,
      )
      return { aircraftId: aircraft.id, payloadId: aircraft.payloads[0], rtk: stored.rtk === true }
    }
    return { aircraftId: aircraft.id, payloadId: stored.payloadId, rtk: stored.rtk === true }
  }
  return { ...DEFAULT_SELECTION }
}

/**
 * Positioning error budget (metres, 1-sigma-ish envelope from the spec
 * sheets) for the selected aircraft, with or without RTK.
 */
export function positioningError(aircraft, rtk = false) {
  const p = aircraft?.positioning ?? {
    gnss: { verticalM: 1, horizontalM: 2 },
    rtk: { verticalM: 0.05, horizontalM: 0.03 },
  }
  return rtk ? { ...p.rtk, mode: 'rtk' } : { ...p.gnss, mode: 'gnss' }
}

/**
 * AGL-ceiling check for payloads with an operational limit (T1.3), e.g. a
 * LiDAR rated to 100 m. With terrain follow the route holds the nominal
 * altitude within +tolerance of the ground, so that envelope is what gets
 * compared; without it the nominal altitude is the height at the reference
 * point (larger deviations over rough ground surface via terrain warnings).
 * Returns { cap, worstAgl } when exceeded, null otherwise.
 */
export function aglCapWarning(
  payload,
  altitudeM,
  { terrainFollowActive = false, toleranceM = 0 } = {},
) {
  const cap = payload?.maxAglM
  if (!cap || !Number.isFinite(altitudeM)) return null
  const worstAgl = terrainFollowActive ? altitudeM + Math.max(0, toleranceM) : altitudeM
  return worstAgl > cap ? { cap, worstAgl } : null
}

/**
 * Battery duration (min) for an aircraft+payload combo (T1.4): the per-combo
 * override when one is stored (a heavy payload shortens real endurance),
 * otherwise the aircraft default.
 */
export function batteryMinFor(aircraft, payloadId, overrides = {}) {
  const o = overrides[`${aircraft.id}:${payloadId}`]
  return Number.isFinite(o) && o > 0 ? o : aircraft.batteryMin
}

/**
 * Catálogo de presets de missão — tipos de levantamento típicos, cada um com
 * uma combinação recomendada de sobreposições, velocidade, gimbal e dupla
 * grelha. `appliesTo` filtra por tipo de sensor ('camera' | 'lidar');
 * `speedByProfile` afina a velocidade para aeronaves específicas (chaves =
 * ids de AIRCRAFT). Os textos são bilingues ({ pt, en }) e resolvidos na
 * interface. Lista expansível — basta acrescentar entradas.
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
