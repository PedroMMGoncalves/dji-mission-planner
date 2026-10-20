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
