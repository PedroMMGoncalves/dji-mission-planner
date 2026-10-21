/**
 * A operação do dia (o painel «Operação do dia»): os voos da área pela
 * ordem de voo, cada um com a ficha da sua base, e o que já se voou, lido do
 * «Registo de voos» da checklist de campo da missão — um voo está feito
 * quando a sua linha tem a «Hora fim». «Marcar feito» escreve-a nessa linha
 * e, sem linha para o voo, junta antes as linhas do plano que faltam, como
 * «Importar blocos do plano»: o painel e a checklist lêem e escrevem o mesmo
 * registo, sem um estado à parte, e a exportação JSON da checklist não muda
 * enquanto o registo não muda. Lógica pura; a leitura e a escrita no
 * armazenamento do browser estão em src/hooks/useFlightLog.js.
 */

const fin = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * @typedef {object} DayFlight
 * @property {number} blockId
 * @property {string} label rótulo do voo (A-1), o da coluna «#» do registo
 * @property {number} order posição na ordem de voo (1, 2, …)
 * @property {any} base a ficha de campo da base (baseFieldSheets): rótulo,
 *   cor, zona, voos e conjuntos
 * @property {number} flightS tempo no bloco
 * @property {number} transitS deslocação, ida e volta, no pior caso
 * @property {number} totalS
 * @property {number|null} pctUseful percentagem do tempo útil (com a deslocação)
 * @property {number|null} worstVlosM a maior distância à base
 * @property {boolean} withinVlos
 * @property {number|null} areaHa área do bloco
 * @property {number|null} lengthM comprimento das faixas do bloco
 */

/**
 * Os voos do dia pela ordem de voo (a numeração da disposição por bases:
 * base a base, pela ordem dos rótulos, A-1, B-2, …), cada um com a ficha da
 * sua base e, do bloco, a área e o comprimento das faixas (os da tabela dos
 * voos do painel).
 * @param {any[]|null|undefined} sheets fichas de campo por base (baseFieldSheets)
 * @param {{byBlock?: Record<string, {flight?: number}>}|null|undefined} layout
 *   disposição por bases (layoutBlocks)
 * @param {Array<{id: number, areaHa?: number, lengthM?: number}>|null|undefined} blocks
 * @returns {DayFlight[]}
 */
export function dayFlights(sheets, layout, blocks) {
  const byId = new Map((blocks ?? []).map((b) => [b.id, b]))
  /** @type {DayFlight[]} */
  const out = []
  for (const base of sheets ?? [])
    for (const f of base?.flights ?? []) {
      const b = byId.get(f.blockId)
      const order = layout?.byBlock?.[f.blockId]?.flight
      out.push({
        blockId: f.blockId,
        label: String(f.flightLabel ?? f.blockId),
        order: fin(order) ? order : out.length + 1,
        base,
        flightS: fin(f.flightS) ? f.flightS : 0,
        transitS: fin(f.transitS) ? f.transitS : 0,
        totalS: fin(f.totalS) ? f.totalS : 0,
        pctUseful: fin(f.pctUseful) ? f.pctUseful : null,
        worstVlosM: fin(f.worstVlosM) ? f.worstVlosM : null,
        withinVlos: f.withinVlos !== false,
        areaHa: fin(b?.areaHa) ? b.areaHa : null,
        lengthM: fin(b?.lengthM) ? b.lengthM : null,
      })
    }
  return out.sort((a, b) => a.order - b.order)
}

/** O rótulo (coluna «#») de uma linha do registo, aparado. */
const labelOf = (row) => String(row?.n ?? '').trim()
/** A «Hora fim» de uma linha do registo, aparada: vazia, o voo não está feito. */
const endOf = (row) => String(row?.fim ?? '').trim()
/** Uma linha com alguma coisa escrita (o identificador interno não conta). */
const filled = (row) =>
  Object.entries(row ?? {}).some(([k, v]) => k !== '_id' && String(v ?? '').trim() !== '')

/**
 * Os voos feitos: os rótulos das linhas do registo com a «Hora fim» escrita.
 * @param {any[]|null|undefined} rows o registo de voos da checklist (`voos`)
 * @returns {Set<string>}
 */
export function doneLabels(rows) {
  const out = new Set()
  for (const r of Array.isArray(rows) ? rows : []) if (labelOf(r) && endOf(r)) out.add(labelOf(r))
  return out
}

/**
 * O registo com o voo `label` feito à hora `time` («HH:MM»): a hora vai para
 * a «Hora fim» da primeira linha dele. Sem linha para o voo, juntam-se antes
 * as linhas do plano que faltam (`planRows`: as de «Importar blocos do
 * plano», flightLogRows) e saem as linhas vazias, como nesse botão; um voo
 * que nem o plano tem fica numa linha só com o rótulo e a hora. Um voo já
 * feito não muda (a hora escrita fica).
 * @param {any[]|null|undefined} rows
 * @param {string} label
 * @param {string} time
 * @param {Array<Record<string, string>>} [planRows]
 * @returns {any[]} o registo novo (as linhas que não mudam são as mesmas)
 */
export function markFlightDone(rows, label, time, planRows = []) {
  const list = Array.isArray(rows) ? rows : []
  if (doneLabels(list).has(label)) return list
  const has = (n) => list.some((r) => labelOf(r) === n)
  let next = list
  if (!has(label)) {
    const missing = (planRows ?? []).filter((p) => !has(labelOf(p)))
    next = [...list.filter(filled), ...missing]
    if (!next.some((r) => labelOf(r) === label)) next.push({ n: label })
  }
  let marked = false
  return next.map((r) => {
    if (marked || labelOf(r) !== label) return r
    marked = true
    return { ...r, fim: time }
  })
}

/**
 * O registo com o voo `label` por fazer: a «Hora fim» apagada nas linhas
 * dele (o resto da linha fica).
 * @param {any[]|null|undefined} rows
 * @param {string} label
 * @returns {any[]}
 */
export function unmarkFlight(rows, label) {
  const list = Array.isArray(rows) ? rows : []
  return list.map((r) => (labelOf(r) === label && endOf(r) ? { ...r, fim: '' } : r))
}

/**
 * A hora de `date` como o piloto a escreve na «Hora fim»: «HH:MM», hora local.
 * @param {Date} date
 */
export function clockText(date) {
  const two = (n) => String(n).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}

/**
 * O que está gravado da checklist de uma missão, com a regra da própria
 * checklist (ChecklistPage): a da chave da missão; sem ela, a da chave
 * antiga (sem missão), quando é desta missão ou não tem nome; senão nada.
 * @param {any} own o objecto gravado na chave da missão (ou null)
 * @param {any} legacy o da chave antiga (ou null)
 * @param {string} missionName
 * @returns {any|null}
 */
export function savedChecklist(own, legacy, missionName) {
  if (own && typeof own === 'object') return own
  if (!legacy || typeof legacy !== 'object') return null
  const name = legacy.missionName ?? legacy.missao?.missao ?? ''
  return !name || name === missionName ? legacy : null
}

/**
 * O objecto a gravar com o registo `rows`, na forma da checklist
 * ({missionName, savedAt, checked, missao, voos, gcps, notas}): o que estava
 * gravado com o registo novo e a data, nos mesmos lugares; o que não havia
 * continua a não haver (a checklist preenche-o quando abrir).
 * @param {any} saved
 * @param {string} missionName
 * @param {any[]} rows
 * @param {string} today AAAA-MM-DD, como a checklist
 */
export function withFlightLog(saved, missionName, rows, today) {
  return {
    ...(saved && typeof saved === 'object' ? saved : {}),
    missionName,
    savedAt: today,
    voos: rows,
  }
}
