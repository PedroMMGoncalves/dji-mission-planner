/**
 * Concluir um desenho (polígono da área, eixo do corredor, linha de base da
 * fachada): os vértices quase-duplicados consecutivos saem (o 2.º clique do
 * duplo-clique, com tolerância para o jitter de ~1 píxel) e o desenho só se
 * fecha com o mínimo de vértices. Função pura (M3-C12): os efeitos
 * (histórico, anel, modo) ficam no hook, fora do actualizador de estado —
 * dentro dele o StrictMode corria-os duas vezes.
 * @param {number[][]} draft vértices [lon, lat]
 * @param {number} min vértices mínimos (3 no polígono, 2 numa linha)
 * @param {number} [eps] tolerância em graus (~1 píxel)
 * @returns {{ok: boolean, clean: number[][]}}
 */
export function finishDraft(draft, min, eps = 1e-6) {
  const pts = Array.isArray(draft) ? draft : []
  // compara com o último vértice que ficou, e não com o clique anterior:
  // três cliques no mesmo sítio, o 2.º para um lado e o 3.º para o outro,
  // deixavam dois vértices quase iguais seguidos (um eixo de um só ponto)
  const clean = []
  for (const v of pts) {
    const last = clean[clean.length - 1]
    if (!last || Math.abs(v[0] - last[0]) > eps || Math.abs(v[1] - last[1]) > eps) clean.push(v)
  }
  return { ok: clean.length >= min, clean }
}
