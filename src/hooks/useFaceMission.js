/**
 * Modo fachada: linha de base, plano de passagens empilhadas, folga contra
 * MDT local, pré-visualização e exportação. A geometria está em
 * utils/faceMode.js.
 */
import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_FACE_CONFIG, checkFaceClearance, generateFacePlan } from '../utils/faceMode.js'
import { headingTicks } from '../utils/preview.js'
import { faceExportParams } from '../mission/exportParams.js'
import { exportWPMLKmz } from '../utils/exporters.js'

export function useFaceMission({ sensor, terrain, missionMode, missionName, wpml, setMode, setDraftVertices, runExport }) {
  const [faceConfig, setFaceConfig] = useState(() => ({ ...DEFAULT_FACE_CONFIG }))

  const setFaceParam = useCallback((key, value) => {
    setFaceConfig((c) => ({ ...c, [key]: value }))
  }, [])

  const startFaceDraw = useCallback(() => {
    setMode((m) => (m === 'face' ? 'idle' : 'face'))
    setDraftVertices([])
  }, [setMode, setDraftVertices])

  const handleFinishFace = useCallback(() => {
    setDraftVertices((draft) => {
      const EPS = 1e-6
      const clean = draft.filter(
        (v, i) =>
          i === 0 ||
          Math.abs(v[0] - draft[i - 1][0]) > EPS ||
          Math.abs(v[1] - draft[i - 1][1]) > EPS,
      )
      if (clean.length >= 2) {
        setFaceConfig((c) => ({ ...c, baseline: clean }))
        setMode('idle')
        return []
      }
      return draft
    })
  }, [setMode, setDraftVertices])

  const clearFaceBaseline = useCallback(() => {
    setFaceConfig((c) => ({ ...c, baseline: null }))
    setDraftVertices([])
    setMode('idle')
  }, [setMode, setDraftVertices])

  const facePlan = useMemo(() => {
    if (!faceConfig.baseline || sensor.type !== 'camera') return null
    return generateFacePlan(faceConfig.baseline, {
      sensor,
      faceHeightM: faceConfig.heightM,
      standoffM: faceConfig.standoffM,
      side: faceConfig.side,
      verticalOverlapPct: faceConfig.verticalOverlapPct,
      horizontalOverlapPct: faceConfig.horizontalOverlapPct,
      gimbalPitch: faceConfig.gimbalPitch,
      // a velocidade é um parâmetro explícito da fachada — o tempo estimado
      // usa exactamente o valor que a exportação escreve
      speed: faceConfig.speedMS,
    })
  }, [faceConfig, sensor])

  // folga só contra DSM LOCAL; com Terrarium fica "standoff não verificado"
  const dsmLoaded = terrain.status === 'ready' && terrain.data?.source === 'file'
  const faceClearance = useMemo(() => {
    if (!facePlan || facePlan.error || !dsmLoaded) return null
    return checkFaceClearance(facePlan, terrain.data.elevationAt, {
      minClearanceM: faceConfig.minClearanceM,
    })
  }, [facePlan, dsmLoaded, terrain.data, faceConfig.minClearanceM])

  const facePreview = useMemo(() => {
    if (missionMode !== 'face') return null
    const ok = facePlan && !facePlan.error ? facePlan : null
    return {
      baseline: faceConfig.baseline,
      offsetLine: ok?.offsetLine ?? null,
      ticks: ok
        ? headingTicks(ok.waypoints, ok.perWaypoint, {
            lengthM: Math.min(12, faceConfig.standoffM * 0.4),
            limit: ok.stats.pointsPerPass,
          })
        : null,
    }
  }, [missionMode, facePlan, faceConfig.baseline, faceConfig.standoffM])

  const handleExportFace = useCallback(() => {
    if (!facePlan || facePlan.error) return
    runExport(() =>
      exportWPMLKmz(
        faceExportParams({
          missionName,
          plan: facePlan,
          speed: faceConfig.speedMS,
          wpml,
          gimbalPitch: faceConfig.gimbalPitch,
          sensorType: sensor.type,
        }),
      ),
    )
  }, [facePlan, missionName, faceConfig.speedMS, wpml, faceConfig.gimbalPitch, sensor.type, runExport])

  return {
    faceConfig,
    setFaceConfig,
    setFaceParam,
    startFaceDraw,
    handleFinishFace,
    clearFaceBaseline,
    facePlan,
    dsmLoaded,
    faceClearance,
    facePreview,
    handleExportFace,
  }
}
