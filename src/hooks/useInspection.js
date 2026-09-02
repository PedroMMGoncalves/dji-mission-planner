/**
 * Pontos de inspecção (R2.9): lista de pontos avulsos com rumo e pitch por
 * ponto, ordenação e exportação como missão própria.
 */
import { useCallback, useRef, useState } from 'react'
import { nearestNeighbourOrder, reorderList } from '../utils/inspect.js'
import { inspectionExportParams } from '../mission/exportParams.js'
import { exportWPMLKmz } from '../utils/exporters.js'

export function useInspection({ basePoint, altitude, speed, gimbalPitch, sensorType, missionName, wpml, setMode, runExport }) {
  const [inspectPoints, setInspectPoints] = useState([])
  const inspectSeqRef = useRef(1)

  const startInspect = useCallback(() => {
    setMode((m) => (m === 'inspect' ? 'idle' : 'inspect'))
  }, [setMode])

  /** Novo ponto no clique do mapa, com a altitude corrente e o rumo/pitch a seguir a rota. */
  const addInspectPoint = useCallback(
    (lonlat) => {
      const n = inspectSeqRef.current++
      setInspectPoints((pts) => [
        ...pts,
        {
          id: n,
          label: `P${String(n).padStart(2, '0')}`,
          point: lonlat,
          heightM: altitude,
          heading: null, // null = segue a rota (followWayline)
          gimbalPitch: null, // null = mantém o pitch em vigor
          photo: true,
        },
      ])
    },
    [altitude],
  )

  const updateInspectPoint = useCallback((id, patch) => {
    setInspectPoints((pts) => pts.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const removeInspectPoint = useCallback((id) => {
    setInspectPoints((pts) => pts.filter((p) => p.id !== id))
  }, [])

  const moveInspectPoint = useCallback((id, dir) => {
    setInspectPoints((pts) => {
      const i = pts.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= pts.length) return pts
      const next = pts.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])

  const reorderInspectPoints = useCallback((from, to) => {
    setInspectPoints((pts) => reorderList(pts, from, to))
  }, [])

  const suggestInspectOrder = useCallback(() => {
    setInspectPoints((pts) => nearestNeighbourOrder(pts, basePoint ?? null))
  }, [basePoint])

  const handleInspectDrag = useCallback((id, lonlat) => {
    setInspectPoints((pts) => pts.map((p) => (p.id === id ? { ...p, point: lonlat } : p)))
  }, [])

  const handleExportInspection = useCallback(() => {
    if (inspectPoints.length === 0) return
    runExport(() =>
      exportWPMLKmz(
        inspectionExportParams({ missionName, points: inspectPoints, altitude, speed, wpml, gimbalPitch, sensorType }),
      ),
    )
  }, [inspectPoints, missionName, altitude, speed, wpml, gimbalPitch, sensorType, runExport])

  return {
    inspectPoints,
    setInspectPoints,
    inspectSeqRef,
    startInspect,
    addInspectPoint,
    updateInspectPoint,
    removeInspectPoint,
    moveInspectPoint,
    reorderInspectPoints,
    suggestInspectOrder,
    handleInspectDrag,
    handleExportInspection,
  }
}
