/**
 * Atalhos da área que precisam do polígono (depois da geometria): a
 * direcção das linhas pelo declive, relativa ao bloco de referência ou a
 * óptima; a margem em metros; e os minutos de um quadrado com os
 * parâmetros de agora.
 */
import { useCallback, useMemo } from 'react'
import {
  bufferDistanceMeters,
  findOptimalDirection,
  ringToPolygon,
  squareFlightTimeS,
} from '../utils/geo.js'

export function useAreaTools({ areaParams, geom, terrainState, area }) {
  const { setParams, params, speed, spacing, interval } = areaParams
  const { ring, holes, refAzimuth, validation } = geom
  const { slopeHint } = terrainState
  const { photoMode } = area

  const applySlopeAngle = useCallback(() => {
    if (slopeHint) setParams((p) => ({ ...p, angle: Math.round(slopeHint.contourAzimuthDeg) }))
  }, [slopeHint, setParams])

  // a margem em metros do contorno (M3-U22: o Pilot 2 e o UgCS pedem metros)
  const bufferM = useMemo(
    () =>
      ring && params.bufferPct > 0
        ? bufferDistanceMeters(ringToPolygon(ring, holes), params.bufferPct)
        : 0,
    [ring, holes, params.bufferPct],
  )
  // minutos de um quadrado com os parâmetros actuais (M3-U20)
  const squareMinutes = useCallback(
    (sideM) =>
      squareFlightTimeS(sideM, {
        speed,
        spacingM: spacing,
        passes: (params.crosshatch ? 2 : 1) + (params.includeNadir ? 1 : 0),
        stopEveryM: photoMode === 'waypoint' && params.waypointStops === 'all' ? interval : 0,
        overshootM: params.overshoot,
        tieLine: params.tieLine,
        bufferM,
      }) / 60,
    [speed, spacing, params, photoMode, interval, bufferM],
  )

  // Atalhos de direção das linhas relativamente ao bloco/aresta de referência
  const setAngleRelative = useCallback(
    (offsetDeg) => {
      if (refAzimuth == null) return
      setParams((p) => ({ ...p, angle: Math.round((refAzimuth + offsetDeg) % 360) }))
    },
    [refAzimuth, setParams],
  )

  // Direção ótima (T3.2): menor número de troços dentro do polígono real
  const setAngleOptimal = useCallback(() => {
    if (!ring || !validation.valid) return
    const best = findOptimalDirection(ring, spacing)
    if (best != null) setParams((p) => ({ ...p, angle: Math.round(best) }))
  }, [ring, validation.valid, spacing, setParams])

  return {
    applySlopeAngle,
    bufferM,
    squareMinutes,
    setAngleRelative,
    setAngleOptimal,
  }
}
