/**
 * A operação do dia: os voos da área com bases pela ordem de voo, os feitos
 * (o registo de voos da checklist de campo, useFlightLog), o painel aberto
 * e o voo em foco no mapa — o seguinte, ou o que o operador pediu com «Ver
 * no mapa» —, com os voos feitos marcados. Só no separador Área, com a área
 * dividida em voos e bases marcadas (as fichas de campo por base).
 */
import { useCallback, useMemo, useState } from 'react'
import { dayFlights } from '../mission/dayPlan.js'
import { useFlightLog } from './useFlightLog.js'

export function useDayOperation({ missionName, missionMode, area, sheets, ops, t }) {
  const { blocks, baseLayout } = area
  const { fieldSheets } = sheets
  const flights = useMemo(
    () =>
      missionMode === 'area' && ops.perBlockBases
        ? dayFlights(fieldSheets, baseLayout, blocks)
        : [],
    [missionMode, ops.perBlockBases, fieldSheets, baseLayout, blocks],
  )
  const {
    done,
    toggle: toggleLog,
    mark: markLog,
  } = useFlightLog({ missionName, blocks, byBlock: baseLayout?.byBlock ?? null })
  const available = flights.length > 0
  const [wanted, setWanted] = useState(false)
  // fora da Área o painel fecha; sem voos (o plano a refazer-se) fica
  // escondido até eles voltarem
  if (wanted && missionMode !== 'area') setWanted(false)
  const open = wanted && available
  // o voo pedido no mapa (null: o seguinte) e um contador, para enquadrar de novo
  const [shown, setShown] = useState({ blockId: /** @type {number|null} */ (null), key: 0 })
  const next = flights.find((f) => !done.has(f.label)) ?? null
  const focus = flights.find((f) => f.blockId === shown.blockId) ?? next
  const show = useCallback((blockId) => setShown((s) => ({ blockId, key: s.key + 1 })), [])
  const setOpen = useCallback((v) => {
    setWanted(v)
    setShown((s) => ({ blockId: null, key: s.key }))
  }, [])
  // marcar um voo devolve o foco do mapa ao seguinte
  const toggle = useCallback(
    (label) => {
      toggleLog(label)
      setShown((s) => ({ blockId: null, key: s.key }))
    },
    [toggleLog],
  )
  const mark = useCallback(
    (label) => {
      markLog(label)
      setShown((s) => ({ blockId: null, key: s.key }))
    },
    [markLog],
  )
  // o que o mapa desenha com o painel aberto: o voo em foco (o contorno do
  // bloco, o anel na base e o rótulo) e um visto em cada voo feito
  const map = useMemo(() => {
    if (!open) return null
    const doneIds = flights.filter((f) => done.has(f.label)).map((f) => f.blockId)
    if (!focus) return { focus: null, done: doneIds }
    const vars = { base: focus.base.label, flight: focus.label }
    const text = focus === next ? t('day.mapNext', vars) : t('day.mapFlight', vars)
    return {
      done: doneIds,
      focus: {
        blockIds: [focus.blockId],
        baseId: focus.base.id,
        label: done.has(focus.label) ? t('day.mapDone', { text }) : text,
        // só «Ver no mapa» enquadra; o seguinte por omissão fica onde está
        key: shown.blockId == null ? 0 : shown.key,
      },
    }
  }, [open, flights, done, focus, next, shown, t])
  return {
    available,
    open,
    setOpen,
    flights,
    done,
    next,
    focusId: focus?.blockId ?? null,
    show,
    toggle,
    mark,
    map,
  }
}
