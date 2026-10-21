/**
 * Pure helpers for the field checklist (T2.4/R2.6).
 *
 * A checklist group may carry `appliesTo: 'camera' | 'lidar' | 'face' |
 * 'corridor'`; groups without it are universal. 'camera'/'lidar' follow the
 * active sensor type; 'face' and 'corridor' show only when a mission of that
 * mode is active (opts.face / opts.corridor). Filtering happens inside the iteration loops WITHOUT
 * re-indexing the groups array — the persisted check state is keyed by
 * phase/group-index/item-index, so indices must stay stable whichever
 * payload or mission mode is active.
 */
export function groupApplies(group, sensorType, opts = {}) {
  if (!group.appliesTo) return true
  if (group.appliesTo === 'face') return Boolean(opts.face)
  if (group.appliesTo === 'corridor') return Boolean(opts.corridor)
  return group.appliesTo === sensorType
}

/**
 * Linhas do registo de voos a partir dos blocos do plano («Importar blocos
 * do plano»): pela ordem de voo, com o rótulo do voo (A-1) em «#», a área
 * e o tempo previsto (o do bloco com o trânsito da sua base) em «Previsto
 * (min)». «Duração (min)» é o tempo realmente voado e fica em branco para
 * o piloto: o previsto escrito aí saía no registo como se tivesse sido
 * voado. Só as colunas preenchidas; quem chama junta as restantes.
 * @param {Array<{id?: number, areaHa?: number, timeS?: number}>} blocks
 * @param {Record<string, {flight?: number, flightLabel?: string, transitS?: number}>|null} [flightLabels]
 *   voo de cada bloco (layoutBlocks: byBlock)
 * @returns {Array<{n: string, area: string, previsto: string, duracao: string}>}
 */
export function flightLogRows(blocks, flightLabels = null) {
  if (!Array.isArray(blocks) || blocks.length === 0) return []
  const voo = (b) => flightLabels?.[b.id] ?? null
  const ordenados = [...blocks].sort((a, b) => (voo(a)?.flight ?? a.id) - (voo(b)?.flight ?? b.id))
  return ordenados.map((b, i) => ({
    n: voo(b)?.flightLabel || String(b.id ?? i + 1),
    area: Number.isFinite(b.areaHa) ? b.areaHa.toFixed(1) : '',
    previsto: Number.isFinite(b.timeS)
      ? String(Math.round((b.timeS + (voo(b)?.transitS ?? 0)) / 60))
      : '',
    duracao: '',
  }))
}

/** O rótulo (coluna «#») de uma linha do registo de voos, aparado. */
const rotulo = (l) => String(l?.n ?? '').trim()
/** A «Hora fim» de uma linha, aparada: vazia, o voo não está feito. */
const horaFim = (l) => String(l?.fim ?? '').trim()
/** Uma linha com alguma coisa escrita (o identificador interno não conta). */
const escrita = (l) =>
  Object.entries(l ?? {}).some(([k, v]) => k !== '_id' && String(v ?? '').trim() !== '')
/** A primeira linha de cada rótulo (as linhas sem rótulo ficam de fora). */
function porRotulo(linhas) {
  const m = new Map()
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const n = rotulo(l)
    if (n && !m.has(n)) m.set(n, l)
  }
  return m
}

/**
 * As linhas do plano que «Importar blocos do plano» junta ao registo: as dos
 * voos que ainda não têm linha. Um voo marcado feito no planeador («Operação
 * do dia») já tem a sua, com as do plano que faltavam, e importar depois
 * repetia-as todas.
 * @param {any[]} linhas o registo de voos
 * @param {any[]} plano as linhas do plano (flightLogRows)
 * @returns {any[]}
 */
export function missingPlanRows(linhas, plano) {
  const tem = porRotulo(linhas)
  return (Array.isArray(plano) ? plano : []).filter((p) => !tem.has(rotulo(p)))
}

/**
 * O registo de voos da página com o que outro separador gravou entretanto,
 * numa fusão a três pelo rótulo do voo: `base` é o registo gravado que a
 * página conhece (o que leu ao abrir ou escreveu por último), `gravado` o
 * que está gravado agora e `local` o da página, talvez com edições por
 * gravar. O planeador («Operação do dia») marca um voo feito escrevendo a
 * «Hora fim» na linha do voo e, sem ela, junta antes as linhas do plano que
 * faltam, como «Importar blocos do plano»; desmarcar apaga a hora.
 *
 * - Uma «Hora fim» que mudou no gravado entra na linha local do voo que a
 *   tem vazia; apagada no gravado, sai da local só se esta ainda tem a da
 *   base (a página não lhe mexeu). Escrita dos dois lados e diferente, fica
 *   a local: foi escrita à mão.
 * - A linha gravada de um voo que a página não tem junta-se ao fim (e saem
 *   as linhas vazias, como em «Importar blocos do plano») quando a base não
 *   a tinha (o planeador juntou-a) ou quando lhe escreveram uma hora nova;
 *   uma linha que a página apagou, sem hora nova, não volta.
 *
 * Nada do que a página escreveu se perde, nem as horas novas do gravado; e
 * a fusão repetida não muda mais nada (pode correr em cada evento e de novo
 * antes de gravar).
 * @param {any[]} local
 * @param {any[]|null|undefined} gravado
 * @param {any[]|null|undefined} base
 * @param {(linha: any) => any} [nova] a linha local feita de uma linha gravada
 * @returns {any[]} `local`, o mesmo array, quando nada muda
 */
export function mergeFlightLog(local, gravado, base, nova = (l) => ({ ...l })) {
  if (!Array.isArray(local) || !Array.isArray(gravado)) return local
  const daBase = porRotulo(base)
  const locais = porRotulo(local)
  const horas = new Map()
  const novas = []
  for (const [n, g] of porRotulo(gravado)) {
    const b = daBase.get(n)
    const hb = b ? horaFim(b) : ''
    const hg = horaFim(g)
    const l = locais.get(n)
    if (!l) {
      if (!b || (hg && hg !== hb)) novas.push(nova(g))
      continue
    }
    if (hg === hb) continue
    const hl = horaFim(l)
    if (hg && !hl) horas.set(l, g.fim)
    else if (!hg && hl && hl === hb) horas.set(l, '')
  }
  if (horas.size === 0 && novas.length === 0) return local
  const linhas = local.map((l) => (horas.has(l) ? { ...l, fim: horas.get(l) } : l))
  return novas.length ? [...linhas.filter(escrita), ...novas] : linhas
}
