/**
 * Terreno: relevo global (Terrarium) descarregado automaticamente ou MDT
 * local importado, cobertura da área, opções de terrain follow e sugestões
 * para encostas. O cálculo das alturas por waypoint (terrainResult) fica no
 * App, porque depende do plano e dos blocos; a leitura de ficheiros está em
 * utils/demFile.js e a descarga em utils/terrain.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fitSlopePlane, loadTerrain } from '../utils/terrain.js'
import { loadDemFromFile } from '../utils/demFile.js'
import { DEFAULT_TERRAIN_FOLLOW } from '../mission/defaults.js'
import { isOffline } from '../utils/tileCache.js'

/** O relevo carregado cobre a caixa [oeste, sul, este, norte]? */
function terrainCoversBox(terrain, box) {
  if (terrain.status !== 'ready' || !box || !terrain.data?.bbox) return false
  const [a, b, c, d] = terrain.data.bbox
  return box[0] >= a && box[1] >= b && box[2] <= c && box[3] <= d
}

/**
 * `targetBbox`, quando dado, é a caixa a cobrir com relevo em vez da da área
 * (um projecto com corredor carrega a área e o corredor juntos: ver
 * terrainTargetBbox). Sem ele, tudo como antes: a caixa da área.
 */
export function useTerrain({ ring, ringBbox: areaBbox, ringValid, targetBbox = null }) {
  const ringBbox = targetBbox ?? areaBbox
  const [terrain, setTerrain] = useState({ status: 'idle', data: null, error: null })
  const [terrainFollow, setTerrainFollow] = useState(() => ({ ...DEFAULT_TERRAIN_FOLLOW }))

  const handleLoadTerrain = useCallback(async () => {
    if (!ringBbox) return
    setTerrain({ status: 'loading', data: null, error: null })
    try {
      const m = 0.01 // ~1 km de margem para incluir a base
      const bbox = /** @type {[number, number, number, number]} */ ([
        ringBbox[0] - m,
        ringBbox[1] - m,
        ringBbox[2] + m,
        ringBbox[3] + m,
      ])
      const data = await loadTerrain(bbox)
      setTerrain({ status: 'ready', data, error: null })
    } catch (err) {
      // sem rede, a mensagem diz o que se passa em vez de um HTTP opaco; as
      // areas ja descarregadas continuam a vir da cache persistente
      const offline = isOffline()
        ? 'Sem ligacao a Internet: so as areas ja descarregadas estao na cache. '
        : ''
      setTerrain({
        status: 'error',
        data: null,
        error: offline + (err?.message ?? 'Falha no terreno'),
      })
    }
  }, [ringBbox])

  // Importar um MDT GeoTIFF local (ex.: LiDAR DGT 50 cm/2 m) como fonte
  const handleImportDem = useCallback(
    async (file) => {
      if (!file || !ringBbox) return
      setTerrain({ status: 'loading', data: null, error: null })
      try {
        const data = await loadDemFromFile(file, ringBbox)
        setTerrain({ status: 'ready', data, error: null })
      } catch (err) {
        setTerrain({ status: 'error', data: null, error: err?.message ?? 'Falha ao ler o MDT' })
      }
    },
    [ringBbox],
  )

  // A área está coberta pelo relevo carregado? Mede-se contra a caixa DA
  // ÁREA: um MDT importado para a área continua a cobri-la mesmo depois de
  // se desenhar um corredor ao lado (a caixa conjunta só serve para carregar).
  const terrainCovers = useMemo(() => terrainCoversBox(terrain, areaBbox), [terrain, areaBbox])
  // e a caixa a carregar (área e corredor juntos), para a descarga automática
  const targetCovers = useMemo(() => terrainCoversBox(terrain, ringBbox), [terrain, ringBbox])

  // Descarga automática do relevo global quando a área fica definida:
  // com debounce (não dispara enquanto se arrastam vértices), sem nunca
  // substituir um MDT local importado, e sem repetir sozinha após um erro
  // na mesma área (o botão manual fica como recurso).
  const autoTerrainTriedRef = useRef(null)
  useEffect(() => {
    if (!ringBbox) return
    if (!targetBbox && (!ring || !ringValid)) return
    if (terrain.status === 'loading') return
    if (terrain.data?.source === 'file') return
    if (terrain.status === 'ready' && targetCovers) return
    const key = ringBbox.map((v) => v.toFixed(3)).join(',')
    if (terrain.status === 'error' && autoTerrainTriedRef.current === key) return
    const timer = setTimeout(() => {
      autoTerrainTriedRef.current = key
      handleLoadTerrain()
    }, 1500)
    return () => clearTimeout(timer)
  }, [ring, ringValid, ringBbox, targetBbox, terrain, targetCovers, handleLoadTerrain])

  // Sugestões para encostas íngremes (T4.5): plano médio do terreno na área
  // → linhas ao longo das curvas de nível e gimbal ≈ −(90 − inclinação).
  // Só sugestões; nada é aplicado automaticamente.
  const slopeHint = useMemo(() => {
    if (terrain.status !== 'ready' || !terrainCovers || !ring || !ringValid) return null
    const fit = fitSlopePlane(terrain.data, ring)
    if (!fit || fit.slopeDeg < 8) return null
    const gimbal = Math.max(-90, Math.min(-45, -Math.round((90 - fit.slopeDeg) / 5) * 5))
    return { ...fit, gimbal }
  }, [terrain, terrainCovers, ring, ringValid])

  return {
    terrain,
    setTerrain,
    terrainFollow,
    setTerrainFollow,
    handleLoadTerrain,
    handleImportDem,
    terrainCovers,
    slopeHint,
  }
}
