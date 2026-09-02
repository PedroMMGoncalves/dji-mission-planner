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

export function useTerrain({ ring, ringBbox, ringValid }) {
  const [terrain, setTerrain] = useState({ status: 'idle', data: null, error: null })
  const [terrainFollow, setTerrainFollow] = useState({ enabled: false, tolerance: 5 })

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
      setTerrain({ status: 'error', data: null, error: err?.message ?? 'Falha no terreno' })
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

  // a área ainda está coberta pelo terreno carregado?
  const terrainCovers = useMemo(() => {
    if (terrain.status !== 'ready' || !ringBbox || !terrain.data?.bbox) return false
    const [a, b, c, d] = terrain.data.bbox
    return ringBbox[0] >= a && ringBbox[1] >= b && ringBbox[2] <= c && ringBbox[3] <= d
  }, [terrain, ringBbox])

  // Descarga automática do relevo global quando a área fica definida:
  // com debounce (não dispara enquanto se arrastam vértices), sem nunca
  // substituir um MDT local importado, e sem repetir sozinha após um erro
  // na mesma área (o botão manual fica como recurso).
  const autoTerrainTriedRef = useRef(null)
  useEffect(() => {
    if (!ring || !ringValid || !ringBbox) return
    if (terrain.status === 'loading') return
    if (terrain.data?.source === 'file') return
    if (terrain.status === 'ready' && terrainCovers) return
    const key = ringBbox.map((v) => v.toFixed(3)).join(',')
    if (terrain.status === 'error' && autoTerrainTriedRef.current === key) return
    const timer = setTimeout(() => {
      autoTerrainTriedRef.current = key
      handleLoadTerrain()
    }, 1500)
    return () => clearTimeout(timer)
  }, [ring, ringValid, ringBbox, terrain, terrainCovers, handleLoadTerrain])

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
