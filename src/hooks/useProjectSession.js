/**
 * Sessão do projecto (M3-C15): o que o projecto guarda, num só objecto
 * (serializeProject, gravação automática e ficheiro), e a sua reposição a
 * partir de um projecto normalizado (applyNormalized), com a mecânica de
 * useProject (hidratação, gravação, importação). O App dá os valores e os
 * setters; a correspondência entre os dois — um campo guardado, um campo
 * reposto — vive aqui, lado a lado, e não espalhada pelo App.
 */
import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_CUSTOM_SENSOR, DEFAULT_SELECTION } from '../data/drones.js'
import {
  DEFAULT_GCP_CONFIG,
  DEFAULT_MISSION_NAME,
  DEFAULT_PARAMS,
  DEFAULT_TERRAIN_FOLLOW,
} from '../mission/defaults.js'
import { APP_VERSION, versionBefore } from '../mission/project.js'
import { DEFAULT_SAFETY } from '../mission/safety.js'
import { DEFAULT_CIRCULAR_CONFIG } from '../utils/circular.js'
import { DEFAULT_CORRIDOR_CONFIG } from '../utils/corridor.js'
import { DEFAULT_FACE_CONFIG } from '../utils/faceMode.js'
import { normalizeTriggerMode, normalizeWaypointStops } from '../utils/geo.js'
import { DEFAULT_ORBIT_CONFIG } from '../utils/orbit.js'
import { followBatteryIfEqual } from '../mission/equipment.js'
import { useProject } from './useProject.js'

/**
 * @param {object} args
 * @param {Record<string, any>} args.values o estado que o projecto guarda
 * @param {Record<string, any>} args.setters quem o repõe (e os refs/callbacks do App)
 * @param {any} args.equipment equipamento configurado (a bateria do projecto segue-o se for igual)
 * @param {() => void} args.onLoaded chamado quando um projecto com área foi carregado
 * @param {(key: string, vars?: object) => string} args.t
 */
export function useProjectSession({ values, setters, equipment, onLoaded, t }) {
  const {
    missionName,
    drone,
    custom,
    payloadTuning,
    missionBatteryType,
    batteryMin,
    inspectPoints,
    missionMode,
    faceConfig,
    corridorConfig,
    orbitConfig,
    circularConfig,
    params,
    split,
    anchor,
    ring,
    holes,
    gridCells,
    areaOrigin,
    bases,
    blockBaseEffective,
    disabledTiles,
    terrainFollow,
    gcpConfig,
    obstacleM,
    safety,
    demFileLabel,
    demSurface,
    demMemory,
  } = values
  const {
    setMissionName,
    setDrone,
    setCustom,
    setPayloadTuning,
    setParams,
    setMissionBattery,
    setMissionMode,
    setFaceConfig,
    setOrbitConfig,
    setCorridorConfig,
    setCircularConfig,
    setInspectPoints,
    inspectSeqRef,
    applyProjectGeometry,
    setBases,
    setBlockBaseState,
    setSelectedBaseId,
    setBaseProposal,
    setTerrainFollow,
    setGcpConfig,
    setObstacleM,
    setDemMemory,
    setSafety,
  } = setters
  // a versão que gravou o projecto aberto, quando é anterior à actual (M3-U17)
  const [projectVersion, setProjectVersion] = useState(null)
  const dismissVersionNote = useCallback(() => setProjectVersion(null), [])
  // o erro de um projecto que não abre fica no cartão 1, junto de «Abrir
  // projecto» (M3-U18); o da área continua no cartão 2
  const [projectError, setProjectError] = useState(null)

  // Um projecto aberto parte das OMISSÕES e escreve todos os campos, presentes
  // ou não (M3-C1): antes fundia-se no estado corrente (`{...prev, ...n.x}`),
  // e um projecto v1 aberto por cima de uma sessão herdava o prolongamento, a
  // fiada, a margem e o seguir terreno que nunca teve
  const applyNormalized = useCallback(
    (n) => {
      // a versão que gravou: só interessa quando é anterior à actual (ou falta)
      setProjectVersion(
        APP_VERSION && (n.appVersion == null || versionBefore(n.appVersion, APP_VERSION))
          ? { saved: n.appVersion ?? null, now: APP_VERSION }
          : null,
      )
      setMissionName(n.missionName || DEFAULT_MISSION_NAME)
      setDrone(n.drone ?? { ...DEFAULT_SELECTION })
      setCustom({ ...DEFAULT_CUSTOM_SENSOR, ...(n.custom ?? {}) })
      setPayloadTuning(n.payloadTuning ?? {})
      setParams({
        ...DEFAULT_PARAMS,
        ...(n.params ?? {}),
        // triggerMode desconhecido (ou ausente) carrega como distância
        triggerMode: normalizeTriggerMode(n.params?.triggerMode),
        // projectos anteriores ao parâmetro abrem com paragem só nos cantos
        waypointStops: normalizeWaypointStops(n.params?.waypointStops),
      })
      // bateria da missão (os projectos antigos já vêm convertidos em tempo
      // útil, project.js): igual ao do equipamento, passa a segui-lo
      if (n.battery) setMissionBattery(followBatteryIfEqual(equipment, n.battery))
      setMissionMode(n.missionMode ?? 'area')
      setFaceConfig(n.faceConfig ?? { ...DEFAULT_FACE_CONFIG })
      setOrbitConfig(n.orbitConfig ?? { ...DEFAULT_ORBIT_CONFIG })
      setCorridorConfig(n.corridorConfig ?? { ...DEFAULT_CORRIDOR_CONFIG })
      setCircularConfig(n.circularConfig ?? { ...DEFAULT_CIRCULAR_CONFIG })
      setInspectPoints(n.inspectPoints ?? [])
      inspectSeqRef.current = n.nextInspectId ?? 1
      applyProjectGeometry(n) // split, anchor, ring, células, origem e células desactivadas
      // bases (a base única antiga abre como A) e as atribuições manuais,
      // que valem para a disposição de blocos que o projecto reabre
      setBases(n.bases ?? [])
      setBlockBaseState({ key: null, map: n.blockBase ?? {}, cells: null, ring: null, lost: 0 })
      setSelectedBaseId(null)
      setBaseProposal(null)
      setTerrainFollow({ ...DEFAULT_TERRAIN_FOLLOW, ...(n.terrainFollow ?? {}) })
      setGcpConfig({ ...DEFAULT_GCP_CONFIG, ...(n.gcpConfig ?? {}) })
      setObstacleM(n.obstacleHeightM ?? 0)
      setDemMemory(n.demFile ?? null)
      // projectos anteriores às acções de segurança abrem com as omissões
      setSafety(n.safety ?? { ...DEFAULT_SAFETY })
    },
    [
      setMissionName,
      setDrone,
      setCustom,
      setPayloadTuning,
      setParams,
      setMissionBattery,
      setMissionMode,
      setFaceConfig,
      setOrbitConfig,
      setCorridorConfig,
      setCircularConfig,
      setInspectPoints,
      inspectSeqRef,
      applyProjectGeometry,
      setBases,
      setBlockBaseState,
      setSelectedBaseId,
      setBaseProposal,
      setTerrainFollow,
      setGcpConfig,
      setObstacleM,
      setDemMemory,
      setSafety,
      equipment,
    ],
  )

  // a bateria tal como o projecto a guarda: o tipo e o tempo útil efectivo
  const projectBattery = useMemo(
    () => ({ batteryId: missionBatteryType.id, usefulMin: batteryMin }),
    [missionBatteryType.id, batteryMin],
  )
  // ficheiro de relevo a gravar no projecto: com um ficheiro carregado, o
  // dele; sem ele (ainda por reimportar), o do projecto aberto. Depende só
  // de valores simples: o relevo recortado de novo (outro objecto, o mesmo
  // ficheiro) não pode reiniciar a espera da gravação automática
  const projectDemFile = useMemo(
    () => (demFileLabel ? { label: demFileLabel, surface: demSurface } : demMemory),
    [demFileLabel, demSurface, demMemory],
  )
  // tudo o que o projecto guarda, num só objecto (autosave e ficheiro)
  const projectState = useMemo(
    () => ({
      missionName,
      drone,
      custom,
      payloadTuning,
      battery: projectBattery,
      inspectPoints,
      missionMode,
      faceConfig,
      corridorConfig,
      orbitConfig,
      circularConfig,
      params,
      split,
      anchor,
      ring,
      holes,
      // as células de uma importação em partes (project.js deixa de fora as da âncora)
      cells: gridCells,
      areaOrigin,
      bases,
      // só as atribuições que valem para os blocos de agora
      blockBase: blockBaseEffective,
      disabledTiles,
      terrainFollow,
      gcpConfig,
      obstacleHeightM: obstacleM,
      safety,
      demFile: projectDemFile,
    }),
    [
      missionName,
      drone,
      custom,
      payloadTuning,
      projectBattery,
      inspectPoints,
      missionMode,
      faceConfig,
      corridorConfig,
      orbitConfig,
      circularConfig,
      params,
      split,
      anchor,
      ring,
      holes,
      gridCells,
      areaOrigin,
      bases,
      blockBaseEffective,
      disabledTiles,
      terrainFollow,
      gcpConfig,
      obstacleM,
      safety,
      projectDemFile,
    ],
  )

  const { exportProject, importProject, autosaveFailed } = useProject({
    state: projectState,
    missionName,
    applyNormalized,
    onLoaded,
    setImportError: setProjectError,
    t,
  })

  return {
    projectState,
    applyNormalized,
    exportProject,
    importProject,
    projectVersion,
    dismissVersionNote,
    projectError,
    // o browser recusou a última gravação automática (o cabeçalho di-lo)
    autosaveFailed,
  }
}
