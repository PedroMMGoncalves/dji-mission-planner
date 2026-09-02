/**
 * Modo área, parte 1 — a geometria: anel (desenhado, importado ou gerado
 * pela âncora), grelha de células da âncora, mosaico de quadrados (manual
 * ou dimensionado pela bateria), células desactivadas, histórico de edição
 * (Ctrl+Z) e importação de ficheiros de área. O plano de voo sobre esta
 * geometria fica em useAreaMission, porque depende do terreno, e o terreno
 * (useTerrain) depende do anel daqui — geometria → terreno → plano.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  distanceToArea,
  gridFromAnchor,
  longestEdgeBearing,
  rectangleFromAnchor,
  squareSideForBattery,
  tilePolygonWithSquares,
  validateRing,
} from '../utils/geo.js'
import {
  parseAreaFile,
  reprojectRing,
  simplifyRingIfNeeded,
  CRS_OPTIONS,
} from '../utils/importArea.js'
import { parseWpmlKmz } from '../utils/importWpml.js'
import { DEFAULT_ANCHOR, DEFAULT_SPLIT } from '../mission/defaults.js'

/**
 * @param {object} args
 * @param {string} args.mode modo de interacção corrente ('draw' | 'anchor' | ...)
 * @param {Function} args.setMode
 * @param {Function} args.setDraftVertices
 * @param {number[]|null} args.basePoint base do operador (para o trânsito no mosaico por bateria)
 * @param {number} args.speed velocidade efectiva (m/s)
 * @param {number} args.spacing espaçamento entre linhas (m)
 * @param {number} args.batteryMin duração de bateria efectiva (min)
 * @param {number} args.passes número de passagens (1, 2 ou 3 com nadir extra)
 * @param {Function} args.onImportedMission reimportação de um WPML: recebe {name, altitude, speed}
 * @param {Function} args.t tradução
 */
export function useAreaGeometry({
  mode,
  setMode,
  setDraftVertices,
  basePoint,
  speed,
  spacing,
  batteryMin,
  passes,
  onImportedMission,
  t,
}) {
  const [ring, setRing] = useState(null) // anel aberto [[lon,lat], ...]
  const [areaOrigin, setAreaOrigin] = useState(null) // 'draw' | 'anchor' | null
  const [anchor, setAnchor] = useState(() => ({ ...DEFAULT_ANCHOR }))
  const [gridCells, setGridCells] = useState(null) // anéis das células da grelha
  const [split, setSplit] = useState(() => ({ ...DEFAULT_SPLIT }))
  const [disabledTiles, setDisabledTiles] = useState(() => new Set())
  const [importState, setImportState] = useState(null) // {ring, filename} à espera de CRS
  const [importError, setImportError] = useState(null)
  // aviso brando da importação (ex.: MultiPolygon com partes ignoradas)
  const [importWarning, setImportWarning] = useState(null)
  const [fitKey, setFitKey] = useState(0) // sinal para enquadrar o mapa na área

  // Histórico de edição unificado (Ctrl+Z): geometria da área + seleção de células
  const editHistoryRef = useRef([])
  const ringSnapshotRef = useRef(null)
  const tilesSnapshotRef = useRef(new Set())
  const skipTileResetRef = useRef(false)

  const setAnchorParam = useCallback((key, value) => {
    setAnchor((a) => {
      // no modo quadrado, o lado único controla comprimento e largura
      if (a.shape === 'square' && (key === 'length' || key === 'width')) {
        return { ...a, length: value, width: value }
      }
      return { ...a, [key]: value }
    })
  }, [])

  const setSplitParam = useCallback((key, value) => {
    setSplit((s) => ({ ...s, [key]: value }))
  }, [])

  /* ------- Modo âncora → retângulo perfeito ou grelha de células ------- */
  // O anel é estado com várias origens — desenho no mapa, importação de
  // ficheiro, âncora. Derivá-lo do render exigiria uma só fonte de verdade
  // para a área, o que é uma reestruturação do componente e não um acerto
  // local; fica registado em vez de forçado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (anchor.center && anchor.length > 0 && anchor.width > 0) {
      const cols = Math.max(1, Math.round(anchor.cols))
      const rows = Math.max(1, Math.round(anchor.rows))
      if (cols * rows > 1) {
        const grid = gridFromAnchor(
          anchor.center,
          anchor.length,
          anchor.width,
          anchor.orientation,
          cols,
          rows,
        )
        setRing(grid.outline)
        setGridCells(grid.cells)
      } else {
        setRing(rectangleFromAnchor(anchor.center, anchor.length, anchor.width, anchor.orientation))
        setGridCells(null)
      }
      setAreaOrigin('anchor')
    }
  }, [anchor])
  /* eslint-enable react-hooks/set-state-in-effect */

  const validation = useMemo(
    () => (ring ? validateRing(ring) : { valid: false, kinks: [] }),
    [ring],
  )

  const ringBbox = useMemo(() => {
    if (!ring) return null
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    ring.forEach(([x, y]) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    return [minX, minY, maxX, maxY]
  }, [ring])

  // Mosaico de quadrados: manual ('tiles') ou dimensionado pela bateria
  // ('battery' — lado calculado a partir do tempo útil e do teto VLOS)
  const tilesResult = useMemo(() => {
    if (!ring || !validation.valid || gridCells) return null
    if (split.mode !== 'tiles' && split.mode !== 'battery') return null
    let side = split.tileSize
    if (split.mode === 'battery') {
      const dist = basePoint ? distanceToArea(basePoint, ring) : null
      const transitS = dist != null ? (2 * dist) / (speed || 10) : 0
      side = squareSideForBattery({
        batteryMin,
        reservePct: split.reservePct,
        speed,
        spacingM: spacing,
        transitS,
        maxSideM: split.maxSide,
        // O lado do quadrado dimensionado por bateria depende do número de
        // passagens (cross-hatch e passagem nadir extra multiplicam o voo por
        // célula). Sem esta dependência o lado ficava preso ao valor anterior
        // ao ligar/desligar o cross-hatch, e a célula podia exceder o que uma
        // bateria voa.
        passes,
      })
    }
    return { cells: tilePolygonWithSquares(ring, side, split.tileOrientation), side }
  }, [
    ring,
    validation.valid,
    gridCells,
    split.mode,
    split.tileSize,
    split.tileOrientation,
    batteryMin,
    split.reservePct,
    split.maxSide,
    speed,
    spacing,
    basePoint,
    passes,
  ])

  const tiles = Array.isArray(tilesResult?.cells) ? tilesResult.cells : null
  const tilesError = tilesResult?.cells?.error ?? null
  const tileSide = tilesResult?.side ?? null

  // espelhos do estado atual, para os snapshots do histórico
  useEffect(() => {
    ringSnapshotRef.current = ring
  }, [ring])
  useEffect(() => {
    tilesSnapshotRef.current = disabledTiles
  }, [disabledTiles])

  const pushHistory = useCallback(() => {
    editHistoryRef.current.push({
      ring: ringSnapshotRef.current,
      tiles: new Set(tilesSnapshotRef.current),
    })
    if (editHistoryRef.current.length > 100) editHistoryRef.current.shift()
  }, [])

  const undoEdit = useCallback(() => {
    const prev = editHistoryRef.current.pop()
    if (!prev) return
    skipTileResetRef.current = true
    setRing(prev.ring)
    setDisabledTiles(new Set(prev.tiles))
  }, [])

  // regenerar o mosaico limpa a seleção de células desativadas
  useEffect(() => {
    if (skipTileResetRef.current) {
      skipTileResetRef.current = false
      return
    }
    setDisabledTiles(new Set())
  }, [ring, split.mode, tileSide, split.tileOrientation])

  const toggleTile = useCallback(
    (index) => {
      pushHistory()
      setDisabledTiles((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
    },
    [pushHistory],
  )

  const restoreAllTiles = useCallback(() => {
    pushHistory()
    setDisabledTiles(new Set())
  }, [pushHistory])

  // Ctrl+Z desfaz a última edição (vértices, área ou células)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (editHistoryRef.current.length > 0) {
        e.preventDefault()
        undoEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoEdit])

  // Células ativas: grelha da âncora, ou mosaico sem as células removidas
  const activeCells = useMemo(() => {
    if (gridCells) return gridCells
    if (tiles) {
      const kept = tiles.filter((_, i) => !disabledTiles.has(i))
      return kept.length > 0 ? kept : null
    }
    return null
  }, [gridCells, tiles, disabledTiles])

  // Direção de referência: orientação do bloco (âncora) ou aresta mais longa
  const refAzimuth = useMemo(() => {
    if (!ring) return null
    if (areaOrigin === 'anchor') return ((anchor.orientation % 180) + 180) % 180
    return longestEdgeBearing(ring)
  }, [ring, areaOrigin, anchor.orientation])

  const baseDistance = useMemo(
    () => (basePoint && ring ? distanceToArea(basePoint, ring) : null),
    [basePoint, ring],
  )

  /* --------------------------- Desenho -------------------------------- */
  const startDraw = useCallback(() => {
    setMode('draw')
    setDraftVertices([])
    setRing(null)
    setAreaOrigin(null)
    setGridCells(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [setMode, setDraftVertices])

  const startAnchor = useCallback(
    (shape = 'rect') => {
      setMode('anchor')
      setDraftVertices([])
      setRing(null)
      setAreaOrigin(null)
      setAnchor((a) => ({
        ...a,
        center: null,
        shape,
        width: shape === 'square' ? a.length : a.width,
      }))
    },
    [setMode, setDraftVertices],
  )

  const clearAll = useCallback(() => {
    pushHistory()
    setMode('idle')
    setDraftVertices([])
    setRing(null)
    setAreaOrigin(null)
    setGridCells(null)
    setAnchor((a) => ({ ...a, center: null }))
  }, [pushHistory, setMode, setDraftVertices])

  const handleFinishDraw = useCallback(() => {
    setDraftVertices((draft) => {
      // remove vértices quase-duplicados consecutivos (ex.: 2.º clique do
      // duplo-clique, com tolerância para o jitter de ~1 píxel)
      const EPS = 1e-6
      const clean = draft.filter(
        (v, i) =>
          i === 0 ||
          Math.abs(v[0] - draft[i - 1][0]) > EPS ||
          Math.abs(v[1] - draft[i - 1][1]) > EPS,
      )
      if (clean.length >= 3) {
        pushHistory()
        setRing(clean)
        setAreaOrigin('draw')
        setMode('idle')
        return []
      }
      return draft
    })
  }, [pushHistory, setMode, setDraftVertices])

  /** Clique no mapa nos modos da área; devolve true se o consumiu. */
  const handleAreaClick = useCallback(
    (lonlat) => {
      if (mode === 'draw') {
        setDraftVertices((d) => [...d, lonlat])
        return true
      }
      if (mode === 'anchor') {
        setAnchor((a) => ({ ...a, center: lonlat }))
        return true
      }
      return false
    },
    [mode, setDraftVertices],
  )

  const handleVertexDrag = useCallback(
    (index, lonlat) => {
      pushHistory()
      setRing((r) => (r ? r.map((v, i) => (i === index ? lonlat : v)) : r))
    },
    [pushHistory],
  )

  const handleVertexInsert = useCallback(
    (index, lonlat) => {
      pushHistory()
      setRing((r) => {
        if (!r) return r
        const next = [...r]
        next.splice(index, 0, lonlat)
        return next
      })
      setAreaOrigin('draw') // deixou de ser um retângulo perfeito
    },
    [pushHistory],
  )

  const handleVertexDelete = useCallback(
    (index) => {
      pushHistory()
      setRing((r) => (r && r.length > 3 ? r.filter((_, i) => i !== index) : r))
    },
    [pushHistory],
  )

  const handleAnchorDrag = useCallback((lonlat) => {
    setAnchor((a) => ({ ...a, center: lonlat }))
  }, [])

  /* ------------------------ Importação de áreas ----------------------- */
  const applyImportedRing = useCallback(
    (rawRing) => {
      pushHistory()
      const clean = simplifyRingIfNeeded(rawRing)
      setMode('idle')
      setDraftVertices([])
      setGridCells(null)
      setAnchor((a) => ({ ...a, center: null }))
      setRing(clean)
      setAreaOrigin('draw')
      setImportState(null)
      setImportError(null)
      setFitKey((k) => k + 1)
    },
    [pushHistory, setMode, setDraftVertices],
  )

  const handleImportFile = useCallback(
    async (file) => {
      if (!file) return
      setImportError(null)
      setImportWarning(null)
      try {
        // Reimportar uma missão WPML existente: reconstrói a área a partir
        // dos waypoints e recupera altitude/velocidade/nome
        if (file.name.toLowerCase().endsWith('.kmz')) {
          const res = await parseWpmlKmz(file)
          applyImportedRing(res.ring)
          onImportedMission?.({ name: res.name, altitude: res.altitude, speed: res.speed })
          return
        }
        const result = await parseAreaFile(file)
        if (result.needsCrs) {
          setImportState({
            ring: result.ring,
            filename: file.name,
            discardedParts: result.discardedParts,
          })
        } else {
          applyImportedRing(result.ring)
          // O import escolhe o maior polígono de um MultiPolygon e deitava os
          // outros fora em silêncio — o operador ficava a planear uma parte
          // da área convencido de que tinha a área toda.
          if (result.discardedParts > 0) {
            setImportWarning(t('cp.area.importDiscarded', { n: result.discardedParts }))
          }
        }
      } catch (err) {
        setImportError(err?.message ?? 'Falha ao ler o ficheiro')
        setImportState(null)
      }
    },
    [applyImportedRing, onImportedMission, t],
  )

  const handleImportCrs = useCallback(
    (code) => {
      if (!importState) return
      const crs = CRS_OPTIONS.find((c) => c.code === code)
      if (!crs) return
      try {
        applyImportedRing(reprojectRing(importState.ring, crs.def))
        if (importState.discardedParts > 0) {
          setImportWarning(t('cp.area.importDiscarded', { n: importState.discardedParts }))
        }
      } catch {
        setImportError('Falha na conversão de coordenadas')
        setImportState(null)
      }
    },
    [importState, applyImportedRing, t],
  )

  const cancelImport = useCallback(() => {
    setImportState(null)
    setImportError(null)
    setImportWarning(null)
  }, [])

  /** Reposição da geometria a partir de um projecto normalizado (mission/project.js). */
  const applyProjectGeometry = useCallback((n) => {
    skipTileResetRef.current = true
    if (n.split) setSplit((prev) => ({ ...prev, ...n.split }))
    if (n.anchor) setAnchor((prev) => ({ ...prev, ...n.anchor }))
    if (n.ring) setRing(n.ring)
    setAreaOrigin(n.areaOrigin)
    setDisabledTiles(n.disabledTiles)
  }, [])

  return {
    ring,
    areaOrigin,
    anchor,
    setAnchorParam,
    gridCells,
    split,
    setSplitParam,
    disabledTiles,
    validation,
    ringBbox,
    tiles,
    tilesError,
    tileSide,
    activeCells,
    refAzimuth,
    baseDistance,
    undoEdit,
    toggleTile,
    restoreAllTiles,
    startDraw,
    startAnchor,
    clearAll,
    handleFinishDraw,
    handleAreaClick,
    handleVertexDrag,
    handleVertexInsert,
    handleVertexDelete,
    handleAnchorDrag,
    importState,
    importError,
    setImportError,
    importWarning,
    handleImportFile,
    handleImportCrs,
    cancelImport,
    fitKey,
    setFitKey,
    applyProjectGeometry,
  }
}
