/**
 * Parâmetros de voo da área e o que deles sai antes da geometria: a
 * velocidade limitada à aeronave, a pegada, o espaçamento, o intervalo de
 * disparo, o GSD, a densidade LiDAR e os avisos do obturador; os presets, o
 * GSD alvo e o que um WPML reimportado traz. Os atalhos que precisam do
 * polígono (direcção das linhas, margem, minutos de um quadrado) ficam no
 * App, depois da geometria.
 */
import { useCallback, useMemo, useState } from 'react'
import { MISSION_PRESETS } from '../data/drones.js'
import { DEFAULT_PARAMS, clampParam } from '../mission/defaults.js'
import { triggerInterval } from '../mission/triggerInterval.js'
import { computeFootprint, computeGSD, lidarPointDensity, lineSpacing } from '../utils/geo.js'

export function useAreaParams({
  aircraftRef,
  speedRange,
  sensor,
  payload,
  aircraftId,
  setMissionName,
}) {
  const [params, setParams] = useState(() => ({ ...DEFAULT_PARAMS }))

  const setParam = useCallback(
    (key, value) => {
      setParams((p) => {
        if (!Number.isFinite(value) && typeof value === 'number') return p
        // a velocidade é sempre limitada aos limites da aeronave selecionada
        if (key === 'speed') {
          const r = aircraftRef.current?.speedRange ?? { min: 1, max: 20 }
          value = Math.min(r.max, Math.max(r.min, value))
        }
        // os outros parâmetros numéricos dentro dos seus limites (M3-C9)
        return { ...p, [key]: clampParam(key, value) }
      })
    },
    [aircraftRef],
  )

  // A velocidade gravada pode ficar fora dos limites quando a aeronave muda —
  // pelo selector, por carregar um projecto ou por aplicar um preset. Em vez
  // de a corrigir com um efeito (um render extra e uma cascata de estado),
  // limita-se aqui, no render: é este o valor que o painel mostra e que entra
  // no plano, nas estatísticas e na exportação. A escrita já vinha limitada
  // por setParam, pelo que isto só actua quando a aeronave muda por baixo.
  const speed = Math.min(speedRange.max, Math.max(speedRange.min, params.speed))

  // Mesma regra para o corredor, que tem o seu proprio campo de velocidade: o
  // painel aceita ate 25 m/s (normalizeCorridorConfig) e um M3E voa 15. Sem
  // limitar, o WPML saia com autoFlightSpeed acima do que a aeronave faz e o
  // tempo estimado ficava optimista — e e desse tempo que sai o numero de
  // baterias que o operador leva para o campo.

  const footprint = useMemo(
    () => computeFootprint(sensor, params.altitude),
    [sensor, params.altitude],
  )
  // Espaçamento e intervalo de disparo mantêm-se nadir-based mesmo com o
  // gimbal oblíquo — decisão deliberada (R2.4): a pegada oblíqua no chão é
  // maior do que a nadir, pelo que a sobreposição real fica sempre ≥ à
  // pedida (erro conservador). Só o GSD apresentado usa o alcance inclinado.
  const spacing = useMemo(
    () =>
      params.spacingMode === 'manual'
        ? Math.max(1, params.manualSpacing)
        : lineSpacing(footprint.across, params.sideOverlap),
    [footprint, params.sideOverlap, params.spacingMode, params.manualSpacing],
  )
  // intervalo de disparo: automático (pela sobreposição frontal) ou o que o
  // piloto escreve, em metros ou em segundos (src/mission/triggerInterval.js);
  // `interval` é o efectivo, em metros, que o plano, as fotos e os avisos usam
  const trigger = useMemo(
    () =>
      triggerInterval({
        footprintAlong: footprint.along,
        frontOverlapPct: params.frontOverlap,
        triggerMode: params.triggerMode,
        intervalMode: sensor.type === 'camera' ? params.intervalMode : 'auto',
        manualIntervalM: params.manualIntervalM,
        manualIntervalS: params.manualIntervalS,
        speed,
      }),
    [
      footprint,
      params.frontOverlap,
      params.triggerMode,
      params.intervalMode,
      params.manualIntervalM,
      params.manualIntervalS,
      sensor.type,
      speed,
    ],
  )
  const interval = trigger.intervalM
  // com a passagem nadir extra (R2.10) o produto orto é governado pelo GSD
  // nadir — é esse que se mostra e que serve de alvo
  const gsdPitch = params.crosshatch && params.includeNadir ? -90 : params.gimbalPitch
  const gsd = useMemo(
    () => computeGSD(sensor, params.altitude, gsdPitch),
    [sensor, params.altitude, gsdPitch],
  )

  // densidade de pontos LiDAR no solo (T2.1) — só para payloads com PRR
  const pointDensity = useMemo(
    () =>
      sensor.type === 'lidar' && payload.maxPrr
        ? lidarPointDensity({
            prr: payload.maxPrr,
            speed: speed,
            swathM: footprint.across,
            spacingM: spacing,
          })
        : null,
    [sensor.type, payload, speed, footprint, spacing],
  )

  // intervalo entre fotos abaixo do que o obturador consegue?
  const avisoObturador = useCallback(
    (v) => {
      if (interval == null || !(v > 0)) return null
      const minS = payload.minTriggerS ?? 0.7
      const actualS = interval / v
      if (actualS >= minS) return null
      return { actualS, minS, maxSpeed: interval / minS }
    },
    [interval, payload],
  )
  const triggerWarn = useMemo(() => avisoObturador(speed), [avisoObturador, speed])
  // o mesmo aviso para um intervalo que não é o da área (as fotos ao longo
  // de um círculo no modo circular)
  const avisoIntervalo = useCallback(
    (intervalM, v) => {
      if (!(intervalM > 0) || !(v > 0)) return null
      const minS = payload.minTriggerS ?? 0.7
      const actualS = intervalM / v
      if (actualS >= minS) return null
      return { actualS, minS, maxSpeed: intervalM / minS }
    },
    [payload],
  )
  // Reimportar um WPML devolve nome, altitude e velocidade da missão antiga
  const onImportedMission = useCallback(
    ({ name, altitude, speed: s }) => {
      if (name) setMissionName(name)
      setParams((p) => {
        const next = { ...p }
        if (Number.isFinite(altitude)) next.altitude = altitude
        if (Number.isFinite(s)) {
          const r = aircraftRef.current?.speedRange ?? { min: 1, max: 20 }
          next.speed = Math.min(r.max, Math.max(r.min, s))
        }
        return next
      })
    },
    [aircraftRef, setMissionName],
  )

  // Catálogo de presets de missão aplicáveis ao sensor ativo, com a
  // velocidade já resolvida para a aeronave selecionada
  const flightPresets = useMemo(() => {
    const kind = sensor.type === 'lidar' ? 'lidar' : 'camera'
    return MISSION_PRESETS.filter((p) => p.appliesTo === kind).map((p) => ({
      id: p.id,
      name: p.name,
      desc: p.desc,
      values: {
        ...p.values,
        speed: p.speedByProfile?.[aircraftId] ?? p.values.speed,
      },
    }))
  }, [sensor.type, aircraftId])

  const applyPreset = useCallback(
    (presetId) => {
      const preset = flightPresets.find((p) => p.id === presetId)
      if (preset) setParams((prev) => ({ ...prev, ...preset.values }))
    },
    [flightPresets],
  )

  // GSD alvo → altitude (inverso do cálculo do GSD, com o mesmo alcance
  // inclinado do gimbal oblíquo)
  const setAltitudeFromGsd = useCallback(
    (gsdTarget) => {
      if (sensor.type !== 'camera' || !sensor.imageWidth || !(gsdTarget > 0)) return
      const absPitch = Math.max(20, Math.min(90, Math.abs(gsdPitch)))
      const slantToAlt = Math.sin((absPitch * Math.PI) / 180)
      const alt =
        ((gsdTarget * sensor.focalLength * sensor.imageWidth) / (sensor.sensorWidth * 100)) *
        slantToAlt
      setParams((p) => ({ ...p, altitude: Math.round(alt * 10) / 10 }))
    },
    [sensor, gsdPitch],
  )

  return {
    params,
    setParams,
    setParam,
    speed,
    footprint,
    spacing,
    trigger,
    interval,
    gsdPitch,
    gsd,
    pointDensity,
    triggerWarn,
    avisoIntervalo,
    onImportedMission,
    flightPresets,
    applyPreset,
    setAltitudeFromGsd,
  }
}
