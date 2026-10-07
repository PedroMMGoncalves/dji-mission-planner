/**
 * «Propor bases» sem prender a interface.
 *
 * A proposta (src/mission/baseSites.js, createBaseProposalRun) procura os
 * altos do relevo e vê cada bloco de cada candidato numa bacia de visão
 * grosseira, com o rádio: centenas de milhares de leituras do relevo com
 * ~150 blocos. Aqui só se agenda, como em useViewsheds:
 *  - fatias de SLICE_MS (o relógio é visto a cada passo pequeno da corrida)
 *    separadas por um setTimeout, para o browser tratar o rato e o desenho;
 *  - o progresso para o painel, no máximo a cada PROGRESS_MS;
 *  - `cancel()` pára a corrida (botão «Cancelar», ou uma edição a meio: o
 *    resultado já não seria o da área de agora); nada muda nas bases;
 *  - no fim, `onDone(resultado)` uma vez. O resultado é o mesmo com
 *    quaisquer fatias.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createBaseProposalRun } from '../mission/baseSites.js'
import { SLICE_MS } from './useViewsheds.js'

/** Intervalo mínimo entre actualizações do progresso no painel (ms). */
const PROGRESS_MS = 100

const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

/**
 * @returns {{running: boolean, progress: number,
 *   start: (args: Parameters<typeof createBaseProposalRun>[0],
 *     onDone: (res: import('../mission/baseLayout.js').ProposalOutcome) => void) => void,
 *   cancel: () => boolean}}
 *   `cancel()` devolve true quando havia uma corrida a parar
 */
export function useBaseProposal() {
  const [status, setStatus] = useState(/** @type {{progress: number}|null} */ (null))
  // corrida em curso: o temporizador da próxima fatia e um número que muda a
  // cada início ou cancelamento (uma fatia de uma corrida antiga não faz nada)
  const ref = useRef(
    /** @type {{timer: any, active: boolean, token: number}} */ ({
      timer: null,
      active: false,
      token: 0,
    }),
  )

  const cancel = useCallback(() => {
    const s = ref.current
    if (s.timer !== null) clearTimeout(s.timer)
    s.timer = null
    s.token += 1
    const was = s.active
    s.active = false
    if (was) setStatus(null)
    return was
  }, [])

  const start = useCallback(
    (args, onDone) => {
      cancel()
      const s = ref.current
      const token = s.token
      const run = createBaseProposalRun(args)
      s.active = true
      setStatus({ progress: 0 })
      let reported = now()
      const slice = () => {
        s.timer = null
        if (s.token !== token) return
        const t0 = now()
        const finished = run.step(() => now() - t0 >= SLICE_MS)
        if (s.token !== token) return
        if (finished) {
          s.active = false
          setStatus(null)
          const res = run.result()
          if (res) onDone(res)
          return
        }
        if (now() - reported >= PROGRESS_MS) {
          reported = now()
          setStatus({ progress: run.progress() })
        }
        s.timer = setTimeout(slice, 0)
      }
      s.timer = setTimeout(slice, 0)
    },
    [cancel],
  )

  // sair da página a meio: a corrida pára
  useEffect(() => cancel, [cancel])

  return { running: status !== null, progress: status?.progress ?? 0, start, cancel }
}
