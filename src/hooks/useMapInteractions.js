/**
 * O que o mapa faz com cada clique, conforme a ferramenta activa (área,
 * base, linha de base da face, eixo do corredor, POI da órbita, pontos de
 * inspecção), o duplo clique que conclui o desenho, o teclado nos desenhos
 * (Backspace, Delete, Ctrl+Z e Esc) e a troca de separador.
 */
import { useCallback, useEffect } from 'react'
import { addBase } from '../mission/bases.js'

export function useMapInteractions({
  handleAreaClick,
  mode,
  bases,
  pushHistory,
  setBases,
  setSelectedBaseId,
  setMode,
  setDraftVertices,
  setOrbitConfig,
  addInspectPoint,
  setMissionMode,
  enableCircular,
  handleFinishFace,
  handleFinishCorridor,
  handleFinishDraw,
}) {
  const handleMapClick = useCallback(
    (lonlat) => {
      if (handleAreaClick(lonlat)) return
      if (mode === 'base') {
        // "Marcar base" acrescenta uma base (A, B, C...) e selecciona-a
        const res = addBase(bases, lonlat)
        if (res.base) pushHistory()
        setBases(res.bases)
        if (res.base) setSelectedBaseId(res.base.id)
        setMode('idle')
      } else if (mode === 'face' || mode === 'corridor') {
        setDraftVertices((d) => [...d, lonlat])
      } else if (mode === 'orbit') {
        setOrbitConfig((c) => ({ ...c, poi: lonlat }))
        setMode('idle')
      } else if (mode === 'inspect') {
        addInspectPoint(lonlat)
      }
    },
    [
      mode,
      handleAreaClick,
      addInspectPoint,
      setOrbitConfig,
      bases,
      pushHistory,
      setBases,
      setSelectedBaseId,
      setMode,
      setDraftVertices,
    ],
  )

  /* ---------------------- Interacções comuns -------------------------- */
  const changeMissionMode = useCallback(
    (m) => {
      setMissionMode(m)
      setMode('idle')
      setDraftVertices([])
      // abrir o separador circular é escolher essa missão: passa a existir
      if (m === 'circular') enableCircular()
    },
    [enableCircular, setMissionMode, setMode, setDraftVertices],
  )

  // o duplo clique no mapa conclui o desenho activo (área, baseline ou eixo)
  const handleFinishAny = useCallback(() => {
    if (mode === 'face') handleFinishFace()
    else if (mode === 'corridor') handleFinishCorridor()
    else handleFinishDraw()
  }, [mode, handleFinishFace, handleFinishCorridor, handleFinishDraw])

  const removeLastDraftVertex = useCallback(() => {
    setDraftVertices((d) => d.slice(0, -1))
  }, [setDraftVertices])

  // Teclado nos desenhos (polígono, linha de base, eixo): Backspace/Delete
  // ou Ctrl+Z anulam o último ponto (o Ctrl+Z das edições da área fica de
  // fora enquanto se desenha), Escape cancela o desenho (ignorado quando o
  // foco está num input)
  useEffect(() => {
    if (mode !== 'draw' && mode !== 'face' && mode !== 'corridor') return
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const undo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'
      if (e.key === 'Backspace' || e.key === 'Delete' || undo) {
        e.preventDefault()
        removeLastDraftVertex()
      } else if (e.key === 'Escape') {
        setMode('idle')
        setDraftVertices([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, removeLastDraftVertex, setMode, setDraftVertices])

  return {
    handleMapClick,
    changeMissionMode,
    handleFinishAny,
    removeLastDraftVertex,
  }
}
