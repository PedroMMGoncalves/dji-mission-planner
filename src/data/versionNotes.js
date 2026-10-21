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
      'Quadrados por bateria mais pequenos: o prolongamento das faixas, a faixa transversal de amarração e a margem passam a contar no lado do quadrado.',
      'Disparo por distância e por tempo escrito em «sequence»: no M4T as fotos saíam só nos cantos das faixas (a confirmar no primeiro voo).',
      'Tempo e distância pela rota 3D quando segue o terreno; os blocos por área deixam de contar o prolongamento como área.',
      'Bloqueios novos no preflight: buracos no relevo debaixo da rota, deslocação entre a base e a rota a entrar no relevo, face a cortar o modelo local (MDT/MDS), corredor com passagens sem cobertura.',
      'Circular: o número de pontos por círculo segue a pegada no bordo exterior (mais pontos); órbita a começar do lado da base.',
      'Um só identificador de voo (o do mapa e do ficheiro); os blocos sem base deixam de ter «B04» e «Bloco 4».',
      'Altura de regresso (RTH) e altura de segurança na descolagem escritas no KMZ, agora à vista no cartão 5, na ficha e na checklist.',
      'Face: nos cantos, fotos extra com o rumo a rodar, em posições diferentes ao longo da linha afastada; a primeira e a última coluna de fotos passam a ficar meia imagem para lá das pontas (desliga-se em «Prolongar as pontas meia imagem»).',
      'Órbita em vídeo: o gimbal passa a rodar de forma uniforme em cada troço (gimbalEvenlyRotate), em vez de saltar à chegada aos pontos.',
      'Órbita e circular sem câmara (LiDAR): o KMZ deixa de levar um takePhoto em cada ponto.',
    ],
    en: [
      'Smaller battery squares: per-line overshoot, the tie line and the buffer now count in the square side.',
      'Distance and time triggers written as “sequence”: on the M4T photos were only taken at the line corners (to be confirmed on the first flight).',
      'Time and distance follow the 3D route with terrain following; area blocks no longer count the overshoot as area.',
      'New preflight blockers: terrain holes under the route, base-to-route transit into the terrain, face clipping the local DTM/DSM, corridor passes without coverage.',
      'Circular: points per circle follow the footprint on the outer edge (more points); orbit starts on the base side.',
      'One flight identifier (the one on the map and in the file); blocks without a base no longer show “B04” and “Block 4”.',
      'Return height (RTH) and take-off safety height written in the KMZ, now shown on card 5, the field sheet and the checklist.',
      'Face: at corners, extra photos with the heading turning, at different positions along the offset line; the first and last photo columns now sit half an image beyond the ends (switch off “Extend the ends by half an image”).',
      'Orbit video: the gimbal now turns evenly along each segment (gimbalEvenlyRotate) instead of jumping on arrival at points.',
      'Orbit and circular without a camera (LiDAR): the KMZ no longer carries a takePhoto at each point.',
    ],
  },
  {
    version: '1.6.0',
    pt: [
      'Margem por bloco: com a área dividida, a margem passa a ser a percentagem do lado de cada bloco, e não da área inteira; com margem, os quadrados por bateria mudam de tamanho e de número, e um voo (o «A-4» de antes) pode ser outro quadrado.',
    ],
    en: [
      'Buffer per block: with the area split, the buffer is now a percentage of each block’s side, not of the whole area; with a buffer, the battery squares change size and number, and a flight (the former “A-4”) may be a different square.',
    ],
  },
]

/** As notas que se aplicam a um projecto gravado pela versão `saved` (null = anterior a todas). */
export function notesSince(saved, versionBefore) {
  return VERSION_NOTES.filter((n) => saved == null || versionBefore(saved, n.version))
}
