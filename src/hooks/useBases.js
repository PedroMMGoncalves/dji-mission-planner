/**
 * Bases de descolagem (A, B, ...): pontos do operador, cada um com a sua
 * zona (src/mission/bases.js). useBasesState tem o estado — antes da
 * geometria da área, que leva as bases no Ctrl+Z —; useBaseActions o que
 * precisa dos blocos e das zonas: as linhas do painel, o arrasto, a remoção,
 * o raio, «Propor bases» e a atribuição de blocos com a base seleccionada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignBlockBase,
  blockClickTarget,
  moveBase,
  removeBase as removeBaseFrom,
  setBaseRadius,
} from '../mission/bases.js'
import { summarizeBases } from '../mission/baseLayout.js'
import { viewshedTerrainModel } from '../mission/viewshedPlan.js'
import { useBaseProposal } from './useBaseProposal.js'

export function useBasesState() {
  // Bases de descolagem (A, B, ...): pontos do operador, cada um com a sua
  // zona (src/mission/bases.js). Os modos de rota única usam a mais próxima.
  const [bases, setBases] = useState(/** @type {any[]} */ ([]))
  // atribuições manuais de blocos a bases, feitas na disposição de blocos
  // `key` (null = adoptar a actual, ao abrir um projecto), com as células e
  // o contorno dela: refeito o mosaico, passam para os blocos novos por
  // sobreposição, e `lost` conta as que não passaram (useAreaMission)
  const [blockBaseState, setBlockBaseState] = useState(() => ({
    key: /** @type {string|null} */ (null),
    map: /** @type {Record<string, string>} */ ({}),
    cells: /** @type {Array<{id: number, ring: number[][]}>|null} */ (null),
    ring: /** @type {number[][]|null} */ (null),
    lost: 0,
  }))
  const [selectedBaseId, setSelectedBaseId] = useState(null)
  // As bases e as atribuições entram no histórico de edição da área (Ctrl+Z,
  // useAreaGeometry): um passo leva o estado inteiro de antes da edição
  const basesSnapshotRef = useRef({ bases, blockBaseState })
  useEffect(() => {
    basesSnapshotRef.current = { bases, blockBaseState }
  }, [bases, blockBaseState])
  const basesHistory = useMemo(
    () => ({
      capture: () => basesSnapshotRef.current,
      restore: (snap) => {
        setBases(snap.bases)
        setBlockBaseState(snap.blockBaseState)
        setSelectedBaseId((sel) => (snap.bases.some((b) => b.id === sel) ? sel : null))
      },
    }),
    [],
  )
  // a última proposta: {added, outOfVlos, poorSites} ou {cancelled: true}
  const [baseProposal, setBaseProposal] = useState(null)

  return {
    bases,
    setBases,
    blockBaseState,
    setBlockBaseState,
    selectedBaseId,
    setSelectedBaseId,
    basesHistory,
    baseProposal,
    setBaseProposal,
  }
}

export function useBaseActions({
  hw,
  basesState,
  geom,
  terrainState,
  area,
  viewshedState,
  missionMode,
  mode,
  setMode,
  corridorBase,
  circularBase,
  obstacleM,
  altitudeM,
  overlayOpen,
}) {
  const { equipment, vlosM } = hw
  const {
    bases,
    setBases,
    blockBaseState,
    setBlockBaseState,
    selectedBaseId,
    setSelectedBaseId,
    setBaseProposal,
  } = basesState
  const { ring, disabledTiles, toggleTile, pushHistory } = geom
  const { terrain, terrainCovers, demSurface } = terrainState
  const {
    layoutKey,
    layoutCells,
    manualLost,
    blockBase: blockBaseEffective,
    blocks,
    zones,
    baseLayout,
    refBase,
  } = area
  const { viewshedTf } = viewshedState

  // Disposição de blocos nova: as atribuições lidas de um projecto adoptam-na
  // (key null); refeito o mosaico, ficam as que passaram por sobreposição
  // (calculadas em useAreaMission) e a contagem das que se perderam. Sem
  // blocos fica tudo como estava, para voltar quando os blocos voltarem.
  useEffect(() => {
    if (!layoutKey || blockBaseState.key === layoutKey) return
    setBlockBaseState({
      key: layoutKey,
      map: blockBaseEffective,
      cells: layoutCells,
      ring,
      lost: manualLost,
    })
  }, [
    blockBaseState.key,
    layoutKey,
    blockBaseEffective,
    layoutCells,
    ring,
    manualLost,
    setBlockBaseState,
  ])

  // atribuições manuais novas, na disposição de blocos de agora
  const setManualBlockBase = useCallback(
    (map) =>
      setBlockBaseState((st) => ({ key: layoutKey, map, cells: layoutCells, ring, lost: st.lost })),
    [layoutKey, layoutCells, ring, setBlockBaseState],
  )

  // bases para o painel e o mapa: zona, cota de referência e voos de cada uma
  const baseRows = useMemo(
    () =>
      summarizeBases({
        bases,
        zones,
        layout: baseLayout,
        defaultRadiusM: equipment.zoneRadiusM,
      }),
    [bases, zones, baseLayout, equipment.zoneRadiusM],
  )

  // arrastar uma base: só o operador a move (um passo do Ctrl+Z por arrasto)
  const handleBaseDrag = useCallback(
    (id, lonlat) => {
      pushHistory()
      setBases((bs) => moveBase(bs, id, lonlat))
      setSelectedBaseId(id)
    },
    [pushHistory, setBases, setSelectedBaseId],
  )

  const startBase = useCallback(() => {
    setMode((m) => (m === 'base' ? 'idle' : 'base'))
  }, [setMode])

  // retirar uma base: os blocos atribuídos à mão a ela voltam à automática
  // (as atribuições guardadas, que podem ser de outra disposição de blocos)
  const removeBaseById = useCallback(
    (id) => {
      pushHistory()
      const res = removeBaseFrom(bases, blockBaseState.map, id)
      setBases(res.bases)
      setBlockBaseState((st) => ({ ...st, map: res.blockBase }))
      setSelectedBaseId((sel) => (sel === id ? null : sel))
      setMode((m) => (m === 'base' ? 'idle' : m))
    },
    [
      bases,
      blockBaseState.map,
      pushHistory,
      setBases,
      setBlockBaseState,
      setSelectedBaseId,
      setMode,
    ],
  )

  // "Remover base": a seleccionada, senão a de referência do separador
  // aberto (a única, num projecto com uma base)
  const removeBase = useCallback(() => {
    const ref =
      missionMode === 'corridor'
        ? corridorBase
        : missionMode === 'circular'
          ? circularBase
          : (refBase ?? null)
    const id = bases.some((b) => b.id === selectedBaseId) ? selectedBaseId : ref?.id
    if (id) removeBaseById(id)
  }, [missionMode, corridorBase, circularBase, refBase, bases, selectedBaseId, removeBaseById])

  // raio da zona: o que se escreve num campo, tecla a tecla, é um só passo
  // do Ctrl+Z (`edit` muda a cada vez que o campo ganha o foco)
  const setBaseRadiusById = useCallback(
    (id, r, edit = null) => {
      pushHistory(edit ? `radius:${id}:${edit}` : null)
      setBases((bs) => setBaseRadius(bs, id, r))
    },
    [pushHistory, setBases],
  )

  // "Propor bases": bases novas só para os blocos que nenhuma base vê
  // inteiros; as do operador ficam onde estão. Com relevo, sítios planos e
  // altos com o rádio livre para os blocos que servem (src/mission/baseSites.js),
  // em fatias (useBaseProposal): o painel diz «A propor bases…» e deixa
  // cancelar. Sem relevo, a cobertura de sempre.
  const {
    start: startProposal,
    cancel: cancelProposalRun,
    running: proposing,
    progress: proposeProgress,
  } = useBaseProposal()
  const proposeBasesForBlocks = useCallback(() => {
    if (!blocks?.length) return
    const ready = terrain.status === 'ready' && terrainCovers
    const model = ready
      ? viewshedTerrainModel(terrain.data, {
          surface: terrain.data?.source === 'file' ? demSurface : 'dtm',
          obstacleM,
        })
      : null
    setBaseProposal(null)
    startProposal(
      {
        blocks,
        bases,
        zones,
        manual: blockBaseEffective,
        vlosM,
        defaultRadiusM: equipment.zoneRadiusM,
        maxBlocksPerBase: equipment.maxFlightsPerBase ?? 0,
        maxReliefM: equipment.zoneMaxReliefM,
        terrain: model
          ? { elevationAt: terrain.data.elevationAt, obstacleM: model.obstacleM }
          : null,
        altitudeM: altitudeM,
        terrainFollow: viewshedTf,
        eyeHeightM: equipment.eyeHeightM,
        antennaHeightM: equipment.antennaHeightM,
      },
      (res) => {
        if (res.added > 0) {
          pushHistory()
          setBases(res.bases)
          setManualBlockBase(res.blockBase)
        }
        setBaseProposal({ added: res.added, outOfVlos: res.outOfVlos, poorSites: res.poorSites })
      },
    )
  }, [
    blocks,
    bases,
    zones,
    blockBaseEffective,
    vlosM,
    equipment,
    pushHistory,
    setManualBlockBase,
    terrain,
    terrainCovers,
    demSurface,
    obstacleM,
    viewshedTf,
    altitudeM,
    startProposal,
    setBaseProposal,
    setBases,
  ])
  const cancelProposal = useCallback(() => {
    if (cancelProposalRun()) setBaseProposal({ cancelled: true })
  }, [cancelProposalRun, setBaseProposal])
  // uma edição a meio da proposta: o resultado já não seria o desta área
  useEffect(() => {
    cancelProposalRun()
  }, [cancelProposalRun, blocks, bases, blockBaseEffective, terrain.data])

  // Base seleccionada (o pino ou o rótulo na lista) = destino dos blocos:
  // clicar num bloco passa-o para ela; sem base seleccionada, o clique
  // activa/desactiva a célula. Esc ou um novo clique no pino desselecciona.
  const assignMode =
    missionMode === 'area' &&
    mode === 'idle' &&
    Boolean(blocks?.length) &&
    bases.some((b) => b.id === selectedBaseId)
  const assignBlock = useCallback(
    (blockId) => {
      if (!baseLayout?.byBlock[blockId]) return
      const target = blockClickTarget(selectedBaseId, baseLayout.byBlock[blockId].baseId)
      if (!target) return
      pushHistory()
      setManualBlockBase(assignBlockBase(blockBaseEffective, blockId, bases, { baseId: target }))
    },
    [bases, baseLayout, selectedBaseId, blockBaseEffective, pushHistory, setManualBlockBase],
  )

  // clique numa célula do mosaico: passar o bloco para a base seleccionada,
  // ou activar/desactivar a célula
  const handleTileClick = useCallback(
    (index) => {
      if (assignMode) {
        if (!disabledTiles.has(index)) assignBlock(index + 1)
        return
      }
      toggleTile(index)
    },
    [assignMode, disabledTiles, assignBlock, toggleTile],
  )
  const handleBlockClick = useCallback(
    (blockId) => {
      if (assignMode) assignBlock(blockId)
    },
    [assignMode, assignBlock],
  )
  // o pino da base selecciona-a; um segundo clique desselecciona
  const handleBaseSelect = useCallback(
    (id) => setSelectedBaseId((sel) => (sel === id ? null : id)),
    [setSelectedBaseId],
  )
  // Esc desselecciona a base (fora dos campos de texto e dos desenhos). O
  // Esc fecha primeiro o que está por cima: com uma janela (3D, perfil,
  // ajuda, relatório, configuração, aviso) ou uma gaveta aberta, a base fica
  useEffect(() => {
    if (!selectedBaseId || mode !== 'idle' || overlayOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (document.querySelector('[data-testid^="drawer-"]:not([hidden]), [aria-modal="true"]'))
        return
      setSelectedBaseId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedBaseId, mode, overlayOpen, setSelectedBaseId])

  return {
    baseRows,
    handleBaseDrag,
    startBase,
    removeBaseById,
    removeBase,
    setBaseRadiusById,
    proposeBasesForBlocks,
    cancelProposal,
    proposing,
    proposeProgress,
    assignMode,
    handleTileClick,
    handleBlockClick,
    handleBaseSelect,
  }
}
