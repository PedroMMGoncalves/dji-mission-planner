/**
 * Constantes e conversões geodésicas partilhadas.
 *
 * Toda a app trabalha em WGS84 (EPSG:4326), ordem [lon, lat], com distâncias
 * em metros. À escala de um levantamento (poucos km) a conversão local
 * grau ↔ metro por um factor constante em latitude e um factor em cosseno
 * para a longitude é suficiente: o erro face à geodésica fica muito abaixo
 * da resolução de qualquer MDT usado aqui.
 *
 * O factor é o do RAIO MÉDIO da esfera com que o turf mede todas as
 * distâncias, comprimentos e rotas da app (6 371 008,8 m, o `earthRadius`
 * do turf): assim um rectângulo de 500 m pedido na âncora, uma célula de
 * 500 m do mosaico ou um afastamento de 25 m medem exactamente isso nas
 * estatísticas. Os valores anteriores (110 574 m, o grau de meridiano no
 * equador, e 111 320·cos φ) davam 498,7 × 504,1 m a um pedido de 500 × 500
 * (M2-G8). Face ao elipsóide WGS84, a 32–42° N a esfera erra ≤ 0,25 % no
 * paralelo e ≤ 0,2 % no meridiano — muito abaixo do que o planeamento vê.
 *
 * Viviam nove cópias destes dois valores espalhadas pelos módulos; qualquer
 * afinação futura (elipsóide, latitude de referência) tinha de ser repetida
 * nove vezes sem nada que apanhasse um esquecimento. Passam a ter um só sítio.
 */

/** Raio médio da Terra usado pelo turf (m). */
export const EARTH_RADIUS_M = 6371008.8

/** Metros por grau de latitude, sobre a esfera do turf. */
export const M_PER_DEG_LAT = (2 * Math.PI * EARTH_RADIUS_M) / 360

/** Metros por grau de longitude à latitude dada. */
export function metersPerDegLon(lat) {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
}

/**
 * Igual a `metersPerDegLon`, com piso de 1 m/grau. Para uso em DIVISÕES:
 * junto aos polos o cosseno tende a zero e o quociente explodiria.
 */
export function metersPerDegLonSafe(lat) {
  return Math.max(1, metersPerDegLon(lat))
}
