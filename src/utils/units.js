/**
 * Constantes e conversões geodésicas partilhadas.
 *
 * Toda a app trabalha em WGS84 (EPSG:4326), ordem [lon, lat], com distâncias
 * em metros. À escala de um levantamento (poucos km) a conversão local
 * grau ↔ metro por um factor constante em latitude e um factor em cosseno
 * para a longitude é suficiente: o erro face à geodésica fica muito abaixo
 * da resolução de qualquer MDT usado aqui.
 *
 * Viviam nove cópias destes dois valores espalhadas pelos módulos; qualquer
 * afinação futura (elipsóide, latitude de referência) tinha de ser repetida
 * nove vezes sem nada que apanhasse um esquecimento. Passam a ter um só sítio.
 */

/** Metros por grau de latitude (aprox. WGS84, média global). */
export const M_PER_DEG_LAT = 110574

/** Metros por grau de longitude à latitude dada. */
export function metersPerDegLon(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180)
}

/**
 * Igual a `metersPerDegLon`, com piso de 1 m/grau. Para uso em DIVISÕES:
 * junto aos polos o cosseno tende a zero e o quociente explodiria.
 */
export function metersPerDegLonSafe(lat) {
  return Math.max(1, metersPerDegLon(lat))
}
