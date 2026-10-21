/**
 * Preflight para o ecrã: os itens de preflight.js por nível — bloqueios,
 * avisos e notas, por esta ordem — e, em cada nível, os do mesmo código
 * juntos num grupo quando há mais de um e o código tem tabela
 * (PREFLIGHT_TABLES): as quinze frases «Zona da base X reduzida…» passam a
 * uma tabela com uma linha por base. Um item sozinho fica com a frase de
 * sempre; um grupo leva um título, a parte comum das frases (a nota) e uma
 * coluna por número, sem perder nenhum. Lógica pura: o ecrã só a mostra.
 */

/** Ordem dos níveis no ecrã. */
export const PREFLIGHT_LEVELS = /** @type {const} */ (['block', 'warn', 'info'])

/**
 * Colunas das tabelas e o seu alinhamento. Cada coluna tem o cabeçalho em
 * `preflight.col.<coluna>` e a célula em `preflight.cell.<coluna>`, um
 * texto com os params do item (ex.: «{relief} m a {at} m»).
 */
export const PREFLIGHT_COLUMNS = {
  base: 'left',
  flight: 'left',
  block: 'left',
  flights: 'left',
  zone: 'right',
  relief: 'right',
  requested: 'right',
  drop: 'right',
  noData: 'right',
  distance: 'right',
  time: 'right',
  transit: 'right',
  transitAlone: 'right',
  hidden: 'right',
  hiddenAt: 'right',
  radio: 'right',
  radioAt: 'right',
}

/**
 * Os códigos que se repetem, por base ou por voo, e a tabela de cada um:
 * `cols`, as colunas; `sort`, o param pelo qual as linhas vão do pior para
 * o melhor (sem ele ficam pela ordem do preflight, a das bases e a dos
 * voos); `note`, se há uma parte comum a dizer por cima da tabela (em
 * `preflight.groupNote.<código>`, com os params do primeiro item: o tempo
 * útil e o alcance visual são os mesmos em todos). O título é
 * `preflight.group.<código>`, com {count}.
 */
export const PREFLIGHT_TABLES = {
  'base-zone-drop': { cols: ['base', 'zone', 'relief', 'drop'], sort: 'drop', note: true },
  'base-zone-zero': { cols: ['base', 'relief', 'requested', 'drop'], sort: 'drop', note: true },
  'base-zone-reduced': { cols: ['base', 'zone', 'relief'], note: true },
  'base-zone-partial': { cols: ['base', 'noData'], sort: 'n', note: true },
  'base-zone-no-terrain': { cols: ['base', 'flights'], note: true },
  'block-no-base': { cols: ['flight', 'block'], note: true },
  'block-base-unreachable': {
    cols: ['flight', 'block', 'base', 'transitAlone'],
    sort: 'min',
    note: true,
  },
  'block-vlos': { cols: ['flight', 'block', 'base', 'distance'], sort: 'm', note: true },
  'battery-block-base': {
    cols: ['flight', 'block', 'base', 'time', 'transit'],
    sort: 'min',
    note: true,
  },
  'battery-block': { cols: ['flight', 'time'], sort: 'min', note: true },
  'block-viewshed': { cols: ['flight', 'base', 'hidden', 'hiddenAt'], sort: 'pct', note: true },
  'block-viewshed-minor': { cols: ['flight', 'base', 'hidden', 'hiddenAt'], sort: 'pct' },
  'block-radio': { cols: ['flight', 'base', 'radio', 'radioAt'], sort: 'pct', note: true },
  'block-radio-minor': { cols: ['flight', 'base', 'radio', 'radioAt'], sort: 'pct' },
}

/** A partir de quantos itens do mesmo código se faz a tabela. */
export const GROUP_MIN = 2

/**
 * Do pior para o melhor pelo param `key`; os empates ficam pela ordem que
 * tinham (o sort é estável) e os itens sem número vão para o fim (dois
 * -Infinity dão NaN, que o sort lê como empate).
 */
function worstFirst(items, key) {
  const v = (i) => {
    const n = Number(i.params?.[key])
    return Number.isFinite(n) ? n : -Infinity
  }
  return [...items].sort((a, b) => v(b) - v(a))
}

/**
 * @typedef {{level: string, code: string, params?: object}} PreflightItem
 * @typedef {{kind: 'item', level: string, item: PreflightItem}
 *   | {kind: 'group', level: string, code: string, cols: string[], note: boolean,
 *      items: PreflightItem[]}} PreflightEntry
 */

/**
 * Os itens por nível, com os grupos.
 * @param {PreflightItem[]} items
 * @returns {Array<{level: string, count: number, entries: PreflightEntry[]}>}
 */
export function groupPreflight(items) {
  const list = Array.isArray(items) ? items : []
  return PREFLIGHT_LEVELS.map((level) => {
    const own = list.filter((i) => i?.level === level)
    const repeats = new Map()
    for (const i of own) repeats.set(i.code, (repeats.get(i.code) ?? 0) + 1)
    const entries = []
    const groups = new Map()
    for (const i of own) {
      const table = PREFLIGHT_TABLES[i.code]
      if (!table || repeats.get(i.code) < GROUP_MIN) {
        entries.push({ kind: 'item', level, item: i })
        continue
      }
      let g = groups.get(i.code)
      if (!g) {
        // o grupo fica no lugar do primeiro item do código
        const note = Boolean(table.note)
        g = { kind: 'group', level, code: i.code, cols: table.cols, note, items: [] }
        groups.set(i.code, g)
        entries.push(g)
      }
      g.items.push(i)
    }
    for (const g of groups.values()) {
      const key = PREFLIGHT_TABLES[g.code].sort
      if (key) g.items = worstFirst(g.items, key)
    }
    return { level, count: own.length, entries }
  })
}
