/**
 * Bacias de visão da missão de área, calculadas sem prender a interface.
 *
 * Os trabalhos (um por bloco com base) e a sua chave vêm de
 * src/mission/viewshedPlan.js. Aqui só se agenda:
 *  - espera de DEBOUNCE_MS depois da última mudança (arrastar uma base,
 *    editar a área, mudar a altura), para não calcular a cada passo;
 *  - só os trabalhos sem resultado guardado para a mesma chave: mover a
 *    base A refaz os blocos de A, um Ctrl+Z reaproveita o que já havia;
 *  - fatias de SLICE_MS (cada uma testa o relógio a cada ponto da grelha)
 *    separadas por um setTimeout, para o browser tratar o rato e o desenho
 *    entre elas; uma mudança a meio cancela a corrida e recomeça (o que já
 *    acabou fica guardado);
 *  - o resultado entra no estado de uma vez, no fim da corrida (uma só
 *    nova renderização, não uma por bloco).
 */
import { useEffect, useMemo, useState } from 'react'
import { createViewshedRun, viewshedsByBlock } from '../mission/viewshedPlan.js'

/** Espera depois da última mudança antes de calcular (ms). */
export const DEBOUNCE_MS = 350
/** Duração máxima de cada fatia de cálculo (ms). */
export const SLICE_MS = 12
/** Resultados guardados no máximo (os mais antigos saem primeiro). */
const CACHE_MAX = 2000

const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

/** Identidade de cada relevo carregado (o mesmo objecto, a mesma chave). */
const terrainIds = new WeakMap()
let nextTerrainId = 1
export function terrainIdentity(data) {
  if (!data || typeof data !== 'object') return ''
  if (!terrainIds.has(data)) terrainIds.set(data, nextTerrainId++)
  return String(terrainIds.get(data))
}

/**
 * @param {object} args
 * @param {import('../mission/viewshedPlan.js').ViewshedJob[]} args.jobs
 * @param {((lon: number, lat: number) => number|null)|null} args.elevationAt
 * @param {number} args.eyeHeightM
 * @param {number} [args.antennaHeightM]
 * @param {number} [args.obstacleM] vegetação e obstáculos somados ao relevo (já 0 com um MDS)
 * @param {number} [args.resolutionM]
 */
export function useViewsheds({
  jobs,
  elevationAt,
  eyeHeightM,
  antennaHeightM,
  obstacleM = 0,
  resolutionM = 0,
}) {
  // resultados acabados, pela chave do trabalho (substituído no fim de cada corrida)
  const [results, setResults] = useState(() => new Map())
  const [running, setRunning] = useState(false)
  // a lista de chaves decide se há trabalho novo; a identidade do array não
  const jobsKey = useMemo(() => jobs.map((j) => j.key).join('\n'), [jobs])

  useEffect(() => {
    if (typeof elevationAt !== 'function' || jobs.length === 0) return
    const todo = jobs.filter((j) => !results.has(j.key))
    if (todo.length === 0) return
    let cancelled = false
    let timer = null
    let committed = false
    const run = createViewshedRun(todo, {
      elevationAt,
      eyeHeightM,
      antennaHeightM,
      obstacleM,
      resolutionM,
    })
    const commit = () => {
      committed = true
      setResults((prev) => {
        const next = new Map(prev)
        for (const [k, v] of run.results) {
          next.delete(k)
          next.set(k, v)
        }
        // os mais antigos saem primeiro; os de agora ficam sempre
        const live = new Set(jobs.map((j) => j.key))
        for (const k of next.keys()) {
          if (next.size <= CACHE_MAX) break
          if (!live.has(k)) next.delete(k)
        }
        return next
      })
    }
    const slice = () => {
      timer = null
      if (cancelled) return
      const t0 = now()
      const finished = run.step(() => now() - t0 >= SLICE_MS)
      if (cancelled) return
      if (finished) {
        setRunning(false)
        commit()
      } else timer = setTimeout(slice, 0)
    }
    timer = setTimeout(() => {
      setRunning(true)
      slice()
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
      // o que acabou antes da mudança fica guardado para a corrida seguinte
      if (!committed && run.results.size > 0) commit()
      setRunning(false)
    }
    // jobsKey resume `jobs`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsKey, results, elevationAt, eyeHeightM, antennaHeightM, obstacleM, resolutionM])

  // byBlock só muda com os trabalhos ou os resultados (não com `running`)
  const v = useMemo(() => viewshedsByBlock(jobs, results), [jobs, results])
  return { ...v, running: running || v.pending > 0 }
}
