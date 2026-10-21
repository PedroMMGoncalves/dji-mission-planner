/**
 * As páginas da folha A4 de uma base (BaseSheetPage), a partir das alturas
 * medidas no ecrã, que tem a largura útil da página. A folha cabe numa página
 * tal como está, ou com a letra reduzida (zoom) até `minZoom`; com mais voos
 * do que isso, pagina-se de propósito, à letra normal: os blocos inteiros, e
 * as tabelas de voos (`rows`) partidas entre linhas, com o cabeçalho repetido.
 * Cada página reserva o rodapé (com o número da página) e, a partir da
 * segunda, a linha de continuação do topo. Lógica pura.
 */

/**
 * @typedef {object} SheetBlock
 * @property {string} id
 * @property {number} h altura do bloco inteiro (px)
 * @property {number[]} [rows] alturas das linhas de uma tabela que se pode partir
 * @property {number} [head] o que o bloco tem além das linhas (título e cabeçalho), em cada pedaço
 */

/**
 * @typedef {object} SheetPiece
 * @property {string} id
 * @property {number} [from] primeira linha deste pedaço (só nas tabelas)
 * @property {number} [to] a seguir à última
 */

/**
 * @param {SheetBlock[]} blocks pela ordem da folha
 * @param {{cap: number, gap: number, footer: number, cont: number, minZoom?: number}} o
 *   `cap` a altura útil da página; `gap` o intervalo entre blocos (também antes
 *   do rodapé); `footer` o rodapé; `cont` a linha de continuação das páginas
 *   seguintes (com o seu intervalo)
 * @returns {{zoom: number, pages: SheetPiece[][]|null}} `pages` null: uma página
 */
export function paginateSheet(blocks, { cap, gap, footer, cont, minZoom = 0.75 }) {
  const total = blocks.reduce((a, b) => a + b.h, 0) + gap * blocks.length + footer
  if (total <= cap) return { zoom: 1, pages: null }
  const zoom = Math.floor((100 * cap) / total) / 100
  if (zoom >= minZoom) return { zoom, pages: null }

  // o conteúdo de cada página vai até ao intervalo antes do rodapé
  const limit = cap - gap - footer
  /** @type {SheetPiece[][]} */
  const pages = []
  /** @type {SheetPiece[]} */
  let page = []
  let used = 0
  const fits = (h) => used + (used > 0 ? gap : 0) + h <= limit
  const put = (piece, h) => {
    used += (used > 0 ? gap : 0) + h
    page.push(piece)
  }
  const turn = () => {
    pages.push(page)
    page = []
    used = cont
  }
  for (const b of blocks) {
    const rows = b.rows ?? []
    if (!rows.length) {
      if (page.length && !fits(b.h)) turn()
      put({ id: b.id }, b.h)
      continue
    }
    const head = b.head ?? 0
    for (let i = 0; i < rows.length;) {
      // o cabeçalho nunca fica sozinho: vai com a primeira linha
      if (page.length && !fits(head + rows[i])) turn()
      let h = head + rows[i]
      let j = i + 1
      while (j < rows.length && fits(h + rows[j])) h += rows[j++]
      put({ id: b.id, from: i, to: j }, h)
      if (j < rows.length) turn()
      i = j
    }
  }
  pages.push(page)
  return { zoom: 1, pages }
}
