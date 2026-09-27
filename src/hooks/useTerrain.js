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
import { bboxIntersects } from '../mission/corridorTerrain.js'

/** Espera antes de voltar a descarregar quando se edita uma geometria já com relevo. */
const EDIT_DEBOUNCE_MS = 800
/** Novas tentativas automáticas depois de uma falha na mesma caixa. */
const RETRY_DELAYS_MS = [3000, 10000, 30000]

/** Chave de uma caixa para as tentativas automáticas (~10 m). */
const boxKey = (b) => b.map((v) => v.toFixed(4)).join(',')

/** O relevo carregado cobre a caixa [oeste, sul, este, norte]? */
function terrainCoversBox(terrain, box) {
  if (terrain.status !== 'ready' || !box || !terrain.data?.bbox) return false
  const [a, b, c, d] = terrain.data.bbox
  return box[0] >= a && box[1] >= b && box[2] <= c && box[3] <= d
}

/**
 * `targetBbox`, quando dado, é a caixa a cobrir com relevo em vez da da área
 * (todas as geometrias do projecto juntas: ver terrainTargetBbox). Sem ele,
 * a caixa da área.
 *
 * Não há missão sem relevo: as alturas são relativas à descolagem e só o
 * relevo diz a que altura do chão se voa. Cada geometria fechada (área
 * desenhada ou importada, eixo, fachada, órbita) descarrega logo o relevo
 * global que a cubra; uma falha volta a tentar sozinha, e o preflight
 * bloqueia a exportação enquanto o relevo não cobrir a rota.
 */
export function useTerrain({ ring, ringBbox: areaBbox, ringValid, targetBbox = null }) {
  const ringBbox = targetBbox ?? areaBbox
  const [terrain, setTerrain] = useState({ status: 'idle', data: null, error: null })
  const [terrainFollow, setTerrainFollow] = useState(() => ({ ...DEFAULT_TERRAIN_FOLLOW }))

  // Só o pedido mais recente conta: uma descarga lenta de uma caixa antiga
  // não pode substituir o relevo da geometria actual
  const requestRef = useRef(0)
  // caixa e número de descargas automáticas já tentadas para ela
  const autoRef = useRef({ key: null, attempts: 0 })

  const handleLoadTerrain = useCallback(async () => {
    if (!ringBbox) return
    const req = ++requestRef.current
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
      if (req !== requestRef.current) return
      setTerrain({ status: 'ready', data, error: null })
    } catch (err) {
      if (req !== requestRef.current) return
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
      const req = ++requestRef.current
      setTerrain({ status: 'loading', data: null, error: null })
      try {
        const data = await loadDemFromFile(file, ringBbox)
        if (req !== requestRef.current) return
        setTerrain({ status: 'ready', data, error: null })
      } catch (err) {
        if (req !== requestRef.current) return
        // o erro do ficheiro fica à vista: nada de o tapar logo com o relevo
        // global (o botão manual carrega-o; mudar a geometria também)
        autoRef.current = { key: boxKey(ringBbox), attempts: Infinity }
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

  // Descarga automática do relevo global sempre que a caixa a cobrir não
  // está coberta:
  // - geometria nova (nada do relevo carregado lhe toca): já, sem espera;
  // - geometria editada para lá do relevo: com uma espera curta, para não
  //   descarregar a cada vértice arrastado;
  // - falha (ou descarga que não cobre a caixa): volta a tentar sozinha
  //   (3 s, 10 s, 30 s) e outra vez quando a ligação volta; o botão manual
  //   continua lá;
  // - MDT local importado: nunca é substituído enquanto tocar na caixa (a
  //   DGT ou o último levantamento valem mais do que os ~25 m globais; se
  //   não cobrir tudo, o preflight diz porquê). Um MDT de outro sítio, que
  //   não toca na geometria, dá lugar ao relevo global.
  const [onlineTick, setOnlineTick] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => {
      autoRef.current = { ...autoRef.current, attempts: 0 }
      setOnlineTick((n) => n + 1)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  useEffect(() => {
    if (!ringBbox) return
    if (!targetBbox && (!ring || !ringValid)) return
    if (terrain.status === 'loading') return
    const loaded = terrain.status === 'ready' ? terrain.data?.bbox : null
    if (terrain.data?.source === 'file' && bboxIntersects(loaded, ringBbox)) return
    if (terrain.status === 'ready' && targetCovers) return
    const key = boxKey(ringBbox)
    const tried = autoRef.current.key === key ? autoRef.current.attempts : 0
    let delay = bboxIntersects(loaded, ringBbox) ? EDIT_DEBOUNCE_MS : 0
    // já se descarregou para esta caixa e não ficou coberta (falha, ou um
    // resultado curto): espera crescente e um limite, nunca um ciclo
    if (tried > 0) {
      if (tried > RETRY_DELAYS_MS.length) return
      delay = RETRY_DELAYS_MS[tried - 1]
    }
    const timer = setTimeout(() => {
      autoRef.current = { key, attempts: tried + 1 }
      handleLoadTerrain()
    }, delay)
    return () => clearTimeout(timer)
  }, [ring, ringValid, ringBbox, targetBbox, terrain, targetCovers, handleLoadTerrain, onlineTick])

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
