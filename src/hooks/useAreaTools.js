/**
 * Atalhos da área que precisam do polígono (depois da geometria): a
 * direcção das linhas pelo declive, relativa ao bloco de referência ou a
 * óptima; a margem em metros (a do bloco, com a área dividida); e os
 * minutos de um quadrado com os parâmetros de agora.
 */
import { useCallback, useMemo } from 'react'
import {
  bufferDistanceMeters,
  findOptimalDirection,
  ringToPolygon,
  squareFlightTimeS,
} from '../utils/geo.js'
import { cellBuffersM } from '../mission/areaPlan.js'

export function useAreaTools({ areaParams, geom, terrainState, area }) {
  const { setParams, params, speed, spacing, interval } = areaParams
  const { ring, holes, refAzimuth, validation, tileSide = null, gridCells = null } = geom
  const { slopeHint } = terrainState
  const { photoMode } = area

  const applySlopeAngle = useCallback(() => {
    if (slopeHint) setParams((p) => ({ ...p, angle: Math.round(slopeHint.contourAzimuthDeg) }))
  }, [slopeHint, setParams])

  // a margem em metros para cada lado (M3-U22: o Pilot 2 e o UgCS pedem
  // metros): a do bloco, com a área dividida em células (cellBuffersM; no
  // mosaico, a do quadrado de lado `blockSideM`), senão a da área, que é o
  // bloco; na grelha e nas partes importadas, a menor e a maior das células
  const buffer = useMemo(() => {
    const pct = params.bufferPct
    if (!ring || !(pct > 0)) return { m: 0, mMax: 0, blockSideM: null, cells: false }
    if (tileSide > 0) {
      const m = (pct / 100) * (tileSide / 2)
      return { m, mMax: m, blockSideM: tileSide, cells: true }
    }
    if (Array.isArray(gridCells) && gridCells.length) {
      const ms = cellBuffersM(gridCells, { bufferPct: pct })
      return { m: Math.min(...ms), mMax: Math.max(...ms), blockSideM: null, cells: true }
    }
    const m = bufferDistanceMeters(ringToPolygon(ring, holes), pct)
    return { m, mMax: m, blockSideM: null, cells: false }
  }, [ring, holes, params.bufferPct, tileSide, gridCells])
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
        // a margem do quadrado: pct/100 do lado, metade de cada lado (cellBuffersM)
        bufferPct: params.bufferPct,
      }) / 60,
    [speed, spacing, params, photoMode, interval],
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
    bufferM: buffer.m,
    buffer,
    squareMinutes,
    setAngleRelative,
    setAngleOptimal,
  }
}
