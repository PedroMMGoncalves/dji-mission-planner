/**
 * O que mudou no plano entre versões (M3-U17): ao reabrir um projecto gravado
 * por uma versão anterior, o cartão 1 lista o que pode ter mudado no plano —
 * o «A-4» de agora pode ser outro quadrado, e refazer o voo que falhou
 * reexportaria o quadrado errado. A ajuda mostra a mesma lista. Cada entrada
 * vale para os projectos gravados ANTES de `version`.
 */
export const VERSION_NOTES = [
  {
    version: '1.5.0',
    pt: [
      'Quadrados por bateria mais pequenos: o prolongamento das faixas, a fiada de amarração e a margem passam a contar no lado do quadrado.',
      'Bloqueios novos no preflight: buracos no relevo debaixo da rota, trânsito entre a base e a rota a entrar no relevo, fachada a cortar o DSM.',
      'Circular: o número de pontos por círculo segue a pegada no bordo exterior (mais pontos); órbita a começar do lado da base.',
      'Um só identificador de voo (o do mapa e do ficheiro); os blocos sem base deixam de ter «B04» e «Bloco 4».',
      'Altura de regresso (RTH) e subida de descolagem escritas no KMZ, agora à vista no cartão 5, na ficha e na checklist.',
    ],
    en: [
      'Smaller battery squares: per-line overshoot, the tie line and the margin now count in the square side.',
      'New preflight blockers: terrain holes under the route, base-to-route transit into the terrain, facade clipping the DSM.',
      'Circular: points per circle follow the footprint on the outer edge (more points); orbit starts on the base side.',
      'One flight identifier (the one on the map and in the file); blocks without a base no longer show "B04" and "Block 4".',
      'Return height (RTH) and take-off climb written in the KMZ, now shown on card 5, the field sheet and the checklist.',
    ],
  },
]

/** As notas que se aplicam a um projecto gravado pela versão `saved` (null = anterior a todas). */
export function notesSince(saved, versionBefore) {
  return VERSION_NOTES.filter((n) => saved == null || versionBefore(saved, n.version))
}
