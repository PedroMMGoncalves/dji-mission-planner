/**
 * Modo corredor: configuração, plano, pré-visualização, desenho do eixo e
 * exportação. Estado e ligação à interface; a geometria está em
 * utils/corridor.js e os parâmetros de exportação em mission/exportParams.js.
 */
import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_CORRIDOR_CONFIG, corridorBufferRing, generateCorridorPlan } from '../utils/corridor.js'
import { corridorExportParams } from '../mission/exportParams.js'
import { exportWPMLKmz } from '../utils/exporters.js'

export function useCorridorMission({
  sensor,
  speedRange,
  altitude,
  sideOverlap,
  interval,
  missionMode,
  missionName,
  wpml,
  setMode,
  setDraftVertices,
  runExport,
  avisoObturador,
}) {
  const [corridorConfig, setCorridorConfig] = useState(DEFAULT_CORRIDOR_CONFIG)

  // A velocidade guardada pode exceder a aeronave (o painel aceita até
  // 25 m/s): o plano e a exportação usam sempre a versão limitada.
  const corridorSpeed = Math.min(speedRange.max, Math.max(speedRange.min, corridorConfig.speedMS))
  const corridorTriggerWarn = useMemo(() => avisoObturador(corridorSpeed), [avisoObturador, corridorSpeed])

  const setCorridorParam = useCallback((key, value) => {
    setCorridorConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startCorridorDraw = useCallback(() => {
    setMode((m) => (m === 'corridor' ? 'idle' : 'corridor'))
    setDraftVertices([])
  }, [setMode, setDraftVertices])

  const handleFinishCorridor = useCallback(() => {
    setDraftVertices((draft) => {
      const EPS = 1e-6
      const clean = draft.filter(
        (v, i) =>
          i === 0 ||
          Math.abs(v[0] - draft[i - 1][0]) > EPS ||
          Math.abs(v[1] - draft[i - 1][1]) > EPS,
      )
      if (clean.length >= 2) {
        setCorridorConfig((c) => ({ ...c, centreline: clean }))
        setMode('idle')
        return []
      }
      return draft
    })
  }, [setMode, setDraftVertices])

  const clearCorridorAxis = useCallback(() => {
    setCorridorConfig((c) => ({ ...c, centreline: null }))
    setDraftVertices([])
    setMode('idle')
  }, [setMode, setDraftVertices])

  // Sem guarda de missionMode, tal como os planos de fachada e órbita: o
  // resumo do projecto agrega os planos que EXISTEM, seja qual for o
  // separador aberto. A pré-visualização é que depende do modo.
  const corridorPlan = useMemo(() => {
    if (!corridorConfig.centreline) return null
    return generateCorridorPlan(corridorConfig.centreline, {
      sensor,
      altitude,
      bufferM: corridorConfig.bufferM,
      sideOverlapPct: sideOverlap,
      photoIntervalM: interval ?? 0,
      speed: corridorSpeed,
      photoMode: corridorConfig.photoMode,
      simplifyM: corridorConfig.simplifyM,
    })
  }, [corridorConfig, corridorSpeed, sensor, altitude, sideOverlap, interval])

  const corridorPreview = useMemo(() => {
    if (missionMode !== 'corridor') return null
    const axis = corridorConfig.centreline
    if (!axis || axis.length < 2) return null
    return {
      centreline: axis,
      buffer: corridorBufferRing(axis, corridorConfig.bufferM),
      passes: corridorPlan && !corridorPlan.error ? corridorPlan.lines : null,
    }
  }, [missionMode, corridorConfig.centreline, corridorConfig.bufferM, corridorPlan])

  const handleExportCorridor = useCallback(() => {
    if (!corridorPlan || corridorPlan.error) return
    runExport(() =>
      exportWPMLKmz(
        corridorExportParams({
          missionName,
          plan: corridorPlan,
          photoMode: corridorConfig.photoMode,
          altitude,
          speed: corridorSpeed,
          wpml,
          photoIntervalM: interval,
          sensorType: sensor.type,
        }),
      ),
    )
  }, [corridorPlan, corridorConfig.photoMode, corridorSpeed, missionName, altitude, wpml, interval, sensor.type, runExport])

  return {
    corridorConfig,
    setCorridorConfig,
    setCorridorParam,
    corridorSpeed,
    corridorTriggerWarn,
    corridorPlan,
    corridorPreview,
    startCorridorDraw,
    handleFinishCorridor,
    clearCorridorAxis,
    handleExportCorridor,
  }
}
