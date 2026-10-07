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
/** Espera antes de recortar de novo o MDT importado (junta mudanças seguidas). */
const FILE_CROP_DELAY_MS = 300
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
 * global que a cubra (ou recorta de novo o MDT importado, se o houver);
 * uma falha volta a tentar sozinha, e o preflight bloqueia a exportação
 * enquanto o relevo não cobrir a rota.
 */
export function useTerrain({
  ring,
  ringBbox: areaBbox,
  ringValid,
  targetBbox = null,
  activeBbox = null,
}) {
  const ringBbox = targetBbox ?? areaBbox
  // o MDT importado recorta-se só para o separador aberto: recortar de novo
  // o ficheiro é barato e a união de todas as geometrias (área e um
  // corredor ao lado) baixava a resolução da grelha (2048 píxeis de lado)
  const fileBox = activeBbox ?? ringBbox
  const [terrain, setTerrain] = useState(
    /** @type {{status: string, data: any, error: string|null, fromFile?: boolean}} */ ({
      status: 'idle',
      data: null,
      error: null,
    }),
  )
  const [terrainFollow, setTerrainFollow] = useState(() => ({ ...DEFAULT_TERRAIN_FOLLOW }))
  // o ficheiro importado é um MDT (só o chão: o caso por omissão, e o relevo
  // global também o é) ou um MDS (com a vegetação e as construções): diz-o
  // o operador ao importar; as bacias de visão só somam vegetação a um MDT
  const [demSurface, setDemSurface] = useState(/** @type {'dtm'|'dsm'} */ ('dtm'))

  // Só o pedido mais recente conta: uma descarga lenta de uma caixa antiga
  // não pode substituir o relevo da geometria actual
  const requestRef = useRef(0)
  // caixa e número de descargas automáticas já tentadas para ela
  const autoRef = useRef({ key: null, attempts: 0 })
  // MDT importado: o ficheiro e a sua extensão completa. Enquanto tocar na
  // caixa a cobrir, o relevo vem dele (recortado de novo quando a caixa
  // cresce ou se volta a um separador que ele cobre), nunca do global.
  const fileRef = useRef(/** @type {{file: any, extent: number[]|null}|null} */ (null))

  const downloadGlobal = useCallback(async () => {
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

  // O botão «Descarregar relevo global» é uma escolha do operador: larga o
  // MDT importado (a descarga automática nunca o faz)
  const handleLoadTerrain = useCallback(() => {
    fileRef.current = null
    return downloadGlobal()
  }, [downloadGlobal])

  const cropFromFile = useCallback(
    async (file) => {
      if (!file || !fileBox) return
      // recortado para esta caixa: a descarga automática não o repete
      autoRef.current = { key: 'file:' + boxKey(fileBox), attempts: 1 }
      const req = ++requestRef.current
      setTerrain({ status: 'loading', data: null, error: null })
      try {
        const data = await loadDemFromFile(file, fileBox)
        if (req !== requestRef.current) return
        fileRef.current = { file, extent: data.fileBbox ?? null }
        setTerrain({ status: 'ready', data, error: null })
      } catch (err) {
        if (req !== requestRef.current) return
        // o erro do ficheiro fica à vista: nada de o tapar logo com o relevo
        // global (o botão manual carrega-o; mudar a geometria também)
        fileRef.current = null
        autoRef.current = { key: boxKey(ringBbox), attempts: Infinity }
        setTerrain({
          status: 'error',
          data: null,
          error: err?.message ?? 'Falha ao ler o MDT',
          fromFile: true,
        })
      }
    },
    [fileBox, ringBbox],
  )

  // Importar um MDT GeoTIFF local (ex.: LiDAR DGT 50 cm/2 m) como fonte
  const handleImportDem = useCallback(
    (file) => {
      if (!file) return
      fileRef.current = { file, extent: null }
      setDemSurface('dtm')
      return cropFromFile(file)
    },
    [cropFromFile],
  )

  // A área está coberta pelo relevo carregado? Mede-se contra a caixa DA
  // ÁREA: um MDT importado para a área continua a cobri-la mesmo depois de
  // se desenhar um corredor ao lado (a caixa conjunta só serve para carregar).
  const terrainCovers = useMemo(() => terrainCoversBox(terrain, areaBbox), [terrain, areaBbox])
  // e a caixa a carregar (área e corredor juntos), para a descarga automática
  const targetCovers = useMemo(() => terrainCoversBox(terrain, ringBbox), [terrain, ringBbox])

  // Relevo automático sempre que a caixa a cobrir não está coberta:
  // - MDT importado que toca na caixa: recorta-se de novo do mesmo ficheiro
  //   (uma vez por caixa; se o ficheiro não chegar, o preflight diz porquê).
  //   A DGT ou o último levantamento valem mais do que os ~30 m globais, e
  //   só o operador troca o ficheiro pelo global;
  // - senão, relevo global: já, numa geometria nova (nada do relevo
  //   carregado lhe toca); com uma espera curta numa geometria editada para
  //   lá dele (não descarregar a cada vértice arrastado);
  // - falha (ou resultado que não cobre a caixa): volta a tentar sozinha
  //   (3 s, 10 s, 30 s) e outra vez quando a ligação volta; o botão manual
  //   continua lá.
  const [onlineTick, setOnlineTick] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => {
      // a falha a ler um ficheiro não é de rede: fica à vista
      if (autoRef.current.attempts !== Infinity)
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
    const f = fileRef.current
    const preferFile = Boolean(f && (!f.extent || bboxIntersects(f.extent, fileBox)))
    if (preferFile) {
      // MDT importado: a caixa é a do separador aberto
      if (terrain.status === 'ready' && terrain.data?.source === 'file') {
        if (terrainCoversBox(terrain, fileBox)) return
      }
      const key = 'file:' + boxKey(fileBox)
      if (autoRef.current.key === key) return // já recortado para esta caixa
      // uma espera curta junta as mudanças seguidas (a rota do separador
      // chega um render depois da geometria): um só recorte
      const timer = setTimeout(() => cropFromFile(f.file), FILE_CROP_DELAY_MS)
      return () => clearTimeout(timer)
    }
    if (terrain.status === 'ready' && targetCovers) return
    const loaded = terrain.status === 'ready' ? terrain.data?.bbox : null
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
      downloadGlobal()
    }, delay)
    return () => clearTimeout(timer)
  }, [
    ring,
    ringValid,
    ringBbox,
    fileBox,
    targetBbox,
    terrain,
    targetCovers,
    downloadGlobal,
    cropFromFile,
    onlineTick,
  ])

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
    // MDT ou MDS do ficheiro importado (o global é sempre MDT)
    demSurface,
    setDemSurface,
  }
}
