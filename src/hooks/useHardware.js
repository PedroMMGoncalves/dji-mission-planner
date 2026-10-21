/**
 * Aeronave, payload e bateria da missão: a escolha do operador, as afinações
 * por payload, o equipamento da equipa (Configuração, guardado neste
 * aparelho) e o que daí sai para todos os modos — o sensor resolvido, os
 * enums WPML, o alcance visual, a zona de descolagem e o tempo útil por voo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AIRCRAFT,
  PAYLOADS,
  DEFAULT_CUSTOM_SENSOR,
  DEFAULT_SELECTION,
  aircraftLabel,
  payloadLabel,
} from '../data/drones.js'
import {
  aircraftEquipmentFor,
  loadEquipment,
  resolveMissionBattery,
  saveEquipment,
  vlosFor,
} from '../mission/equipment.js'
import { missionWpml } from '../mission/missionWpml.js'
import { resolveSensor } from '../utils/geo.js'
import { browserStorage } from '../utils/browserStorage.js'

export function useHardware({ t }) {
  // seleção de hardware: aeronave + payload (T1.1)
  const [drone, setDrone] = useState(
    () =>
      /** @type {{aircraftId: string, payloadId: string, rtk?: boolean}} */ ({
        ...DEFAULT_SELECTION,
      }),
  )
  const [custom, setCustom] = useState(DEFAULT_CUSTOM_SENSOR)
  // afinações por payload (T1.2): { [payloadId]: { effectiveFov } }
  const [payloadTuning, setPayloadTuning] = useState(
    /** @type {Record<string, {effectiveFov?: number}>} */ ({}),
  )
  // Equipamento (Configuração): baterias com tempo útil, VLOS e zona de
  // descolagem por aeronave. Vive no browser, à parte do projecto.
  const [equipment, setEquipment] = useState(() => loadEquipment(browserStorage()))
  useEffect(() => {
    saveEquipment(browserStorage(), equipment)
  }, [equipment])
  // zona de descolagem das bases (Configuração): raio e desnível máximo
  const zoneConfig = useMemo(
    () => ({ radiusM: equipment.zoneRadiusM, maxReliefM: equipment.zoneMaxReliefM }),
    [equipment.zoneRadiusM, equipment.zoneMaxReliefM],
  )
  // bateria da missão: tipo e tempo útil acertado para o dia (null = o da
  // bateria); só vale para a aeronave em que foi escolhida
  const [missionBattery, setMissionBattery] = useState(() => ({
    aircraftId: null,
    batteryId: null,
    usefulMin: null,
  }))

  const aircraftRef = useRef(null)
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  // alcance visual da aeronave (Configuração): bases e blocos
  const vlosM = vlosFor(equipment, drone.aircraftId)
  // Escrito num efeito e não durante o render: mutar um ref no corpo do
  // componente é inseguro com renderização concorrente (React pode repetir ou
  // descartar o render). aircraftRef só é lido dentro de callbacks, por acção
  // do utilizador, sempre depois de o efeito ter corrido.
  useEffect(() => {
    aircraftRef.current = aircraft
  })
  const speedRange = aircraft.speedRange ?? { min: 1, max: 20 }

  // rótulo composto para o relatório/checklist: a aeronave, e o payload
  // quando a aeronave tem mais do que um montável
  const hardwareLabel =
    aircraft.payloads.length > 1
      ? `${aircraftLabel(aircraft, t)} + ${payloadLabel(payload, t)}`
      : aircraftLabel(aircraft, t)

  // payload ativo com a afinação aplicada: um LiDAR pode voar com um corte
  // de trabalho do feixe (effectiveFov) mais estreito do que o nominal
  const effectiveFov = payloadTuning[drone.payloadId]?.effectiveFov ?? null
  const activePayload = useMemo(
    () => (payload.type === 'lidar' && effectiveFov ? { ...payload, effectiveFov } : payload),
    [payload, effectiveFov],
  )
  const sensor = useMemo(() => resolveSensor(activePayload, custom), [activePayload, custom])

  const setEffectiveFov = useCallback(
    (value) => {
      setPayloadTuning((m) => {
        const pid = drone.payloadId
        const nominal = PAYLOADS[pid]?.fov
        // clamp to ]5, nominal]; at (or above) nominal the override is removed
        if (!Number.isFinite(value) || !nominal || value >= nominal) {
          const { [pid]: _drop, ...rest } = m
          return rest
        }
        return { ...m, [pid]: { ...m[pid], effectiveFov: Math.max(5, value) } }
      })
    },
    [drone.payloadId],
  )

  // Tempo útil por voo efectivo (min): o acerto da missão, senão o da
  // bateria escolhida no equipamento. JÁ inclui a reserva de aterragem, por
  // isso entra em todo o lado como `batteryMin` com split.reservePct a 0
  // (blocos, lado do quadrado, preflight, resumo, circular).
  const {
    battery: missionBatteryType,
    usefulMin: batteryMin,
    overridden: batteryOverridden,
  } = resolveMissionBattery(equipment, drone.aircraftId, missionBattery)
  const setMissionBatteryId = useCallback(
    (batteryId) => setMissionBattery({ aircraftId: drone.aircraftId, batteryId, usefulMin: null }),
    [drone.aircraftId],
  )
  // editar para o valor da bateria (ou um valor inválido) volta a segui-la
  const setUsefulMin = useCallback(
    (value) => {
      const id = missionBatteryType.id
      const own = missionBatteryType.usefulMin
      setMissionBattery({
        aircraftId: drone.aircraftId,
        batteryId: id,
        usefulMin:
          !Number.isFinite(value) || value <= 0 || value === own
            ? null
            : Math.min(120, Math.max(1, value)),
      })
    },
    [drone.aircraftId, missionBatteryType],
  )

  // Enums WPML: aeronave + payload; o editor custom substitui o enum do
  // payload sempre, e o da aeronave apenas quando a aeronave é CUSTOM
  // (num M300 com payload custom o droneEnumValue continua a ser o do M300)
  const wpml = useMemo(() => missionWpml(aircraft, payload, custom), [aircraft, payload, custom])

  // tipos de bateria da aeronave (selector da missão)
  const equipmentBatteries = aircraftEquipmentFor(equipment, drone.aircraftId).batteries

  return {
    drone,
    setDrone,
    custom,
    setCustom,
    payloadTuning,
    setPayloadTuning,
    equipment,
    setEquipment,
    zoneConfig,
    setMissionBattery,
    aircraftRef,
    aircraft,
    payload,
    vlosM,
    speedRange,
    hardwareLabel,
    effectiveFov,
    activePayload,
    sensor,
    setEffectiveFov,
    missionBatteryType,
    batteryMin,
    batteryOverridden,
    setMissionBatteryId,
    setUsefulMin,
    wpml,
    equipmentBatteries,
  }
}
