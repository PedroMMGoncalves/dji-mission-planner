/**
 * O registo de voos da checklist de campo da missão, lido e escrito pela
 * operação do dia: um voo está feito quando a sua linha tem a «Hora fim»
 * (src/mission/dayPlan.js). Lê-se da mesma chave do armazenamento do browser
 * que a checklist (checklistStorageKey), a cada render — a checklist e o
 * planeador nunca estão abertos ao mesmo tempo, e ao voltar dela o painel
 * lê o que ela gravou —, e de outro separador (o evento «storage»). Sem
 * armazenamento (modo privado, quota), as marcas ficam só nesta sessão.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { checklistStorageKey } from '../components/ChecklistPage.jsx'
import { flightLogRows } from '../data/checklist.js'
import {
  clockText,
  doneLabels,
  markFlightDone,
  savedChecklist,
  unmarkFlight,
  withFlightLog,
} from '../mission/dayPlan.js'
import { browserStorage } from '../utils/browserStorage.js'

// A chave antiga da checklist, sem missão, que a checklist ainda lê quando a
// missão não tem a sua: a chave de uma missão sem nome (…:missao) sem o fim
const LEGACY_KEY = checklistStorageKey('').replace(/:missao$/, '')
/** O evento com que esta página avisa que escreveu o registo. */
const CHANGED = 'dmp:flight-log'
/** O registo escrito quando o browser recusou o armazenamento, por chave. */
const memory = new Map()

function read(key) {
  try {
    return browserStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}
function parse(raw) {
  try {
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}
/** A checklist gravada a partir do texto lido (`l…`: a da chave antiga, se for desta missão). */
function savedOf(raw, missionName) {
  const v = parse(raw.slice(1))
  return raw.charAt(0) === 'l' ? savedChecklist(null, v, missionName) : v
}
function subscribe(onChange) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGED, onChange)
  }
}

/**
 * @param {{missionName: string, blocks: any[]|null, byBlock: Record<string, any>|null}} o
 *   os blocos e a disposição dão as linhas de «Importar blocos do plano»
 * @returns {{done: Set<string>, toggle: (label: string) => void, mark: (label: string) => void}}
 */
export function useFlightLog({ missionName, blocks, byBlock }) {
  const key = checklistStorageKey(missionName)
  // o texto gravado (a chave da missão, ou a antiga): uma string, que o
  // React compara pelo valor
  const snapshot = useCallback(() => {
    if (memory.has(key)) return `m${memory.get(key)}`
    const own = read(key)
    if (own != null) return `o${own}`
    const legacy = read(LEGACY_KEY)
    return legacy != null ? `l${legacy}` : ''
  }, [key])
  const raw = useSyncExternalStore(subscribe, snapshot, () => '')
  const saved = useMemo(() => savedOf(raw, missionName), [raw, missionName])
  const done = useMemo(() => doneLabels(saved?.voos), [saved])

  /** Escreve o registo devolvido por `change` (a partir do que está gravado agora). */
  const write = useCallback(
    (change) => {
      const current = savedOf(snapshot(), missionName)
      const rows = change(current?.voos)
      if (rows === current?.voos) return
      // a data como a checklist a grava (savedAt)
      const text = JSON.stringify(
        withFlightLog(current, missionName, rows, new Date().toISOString().slice(0, 10)),
      )
      let stored = false
      try {
        const st = browserStorage()
        if (st) {
          st.setItem(key, text)
          stored = true
        }
      } catch {
        /* quota excedida: fica só nesta sessão */
      }
      if (stored) memory.delete(key)
      else memory.set(key, text)
      window.dispatchEvent(new Event(CHANGED))
    },
    [snapshot, key, missionName],
  )
  const planRows = useMemo(() => flightLogRows(blocks ?? [], byBlock), [blocks, byBlock])
  const mark = useCallback(
    (label) => write((rows) => markFlightDone(rows, label, clockText(new Date()), planRows)),
    [write, planRows],
  )
  const toggle = useCallback(
    (label) => (done.has(label) ? write((rows) => unmarkFlight(rows, label)) : mark(label)),
    [done, write, mark],
  )
  return { done, toggle, mark }
}
