/**
 * Margens do enquadramento da área no mapa (Leaflet fitBounds), para a área
 * não ficar por baixo do que flutua por cima dele: em cima a barra de
 * desenho, à direita o cartão das métricas aberto. Recebe rectângulos no
 * ecrã (getBoundingClientRect); sem um deles, a margem de base desse lado.
 * O espaço livre nunca fica abaixo de metade do mapa em cada eixo: num mapa
 * estreito, o cartão aberto deixava a área minúscula (fica por baixo dele
 * na parte que não cabe, como antes).
 *
 * @typedef {{left: number, top: number, right: number, bottom: number}} Rect
 * @param {Rect} map o contentor do mapa
 * @param {{top?: Rect|null, right?: Rect|null}} [avoid] o que fica por cima:
 *   `top` encosta ao cimo do mapa (a área fica por baixo dele), `right` à
 *   direita (a área fica à esquerda dele)
 * @param {{margin?: number, gap?: number}} [opts] margem de base e folga
 *   entre a área e o que ela evita, em píxeis
 * @returns {{paddingTopLeft: [number, number], paddingBottomRight: [number, number]}}
 */
export function fitPadding(map, avoid = {}, { margin = 60, gap = 16 } = {}) {
  const width = map.right - map.left
  const height = map.bottom - map.top
  const below = avoid.top ? avoid.top.bottom - map.top + gap : 0
  const beside = avoid.right ? map.right - avoid.right.left + gap : 0
  const top = Math.max(margin, Math.min(below, height / 2 - margin))
  const right = Math.max(margin, Math.min(beside, width / 2 - margin))
  return { paddingTopLeft: [margin, top], paddingBottomRight: [right, margin] }
}
