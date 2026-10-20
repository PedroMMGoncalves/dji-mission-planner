/**
 * Intervalo de disparo da área: o automático, pela pegada ao longo da faixa
 * e pela sobreposição frontal, ou o que o piloto escreve, em metros
 * (disparo por distância ou por waypoint) ou em segundos (por tempo,
 * convertido com a velocidade). O intervalo em metros é o que o plano, as
 * fotos no mapa e na vista 3D, as estatísticas e os avisos usam; os
 * segundos são os que vão para o ficheiro no disparo por tempo; e a
 * sobreposição frontal que daí resulta é a que o painel mostra com o
 * intervalo manual. Lógica pura.
 */
import { photoInterval } from '../utils/geo.js'
import { triggerParamValue, triggerSecondsFor } from '../utils/exporters.js'
import { clampParam } from './defaults.js'

/**
 * @param {{footprintAlong: number|null, frontOverlapPct: number, triggerMode: string,
 *   intervalMode?: string, manualIntervalM?: number, manualIntervalS?: number,
 *   speed: number}} p
 * @returns {{intervalM: number|null, autoIntervalM: number|null, seconds: number|null,
 *   manual: boolean, frontOverlapPct: number|null}}
 */
export function triggerInterval({
  footprintAlong,
  frontOverlapPct,
  triggerMode,
  intervalMode = 'auto',
  manualIntervalM,
  manualIntervalS,
  speed,
}) {
  const autoIntervalM = photoInterval(footprintAlong, frontOverlapPct)
  const manual = intervalMode === 'manual'
  let intervalM = autoIntervalM
  let seconds = null
  if (manual && triggerMode === 'time') {
    const s = clampParam('manualIntervalS', Number(manualIntervalS))
    seconds = Number.isFinite(s) ? triggerParamValue(s) : null
    intervalM = seconds != null && speed > 0 ? seconds * speed : null
  } else if (manual) {
    const m = clampParam('manualIntervalM', Number(manualIntervalM))
    // o valor que vai para o ficheiro (por defeito à décima): o plano usa o mesmo
    intervalM = Number.isFinite(m) ? triggerParamValue(m) : null
  }
  if (triggerMode === 'time' && seconds == null) seconds = triggerSecondsFor(intervalM, speed)
  const frontOverlap =
    footprintAlong > 0 && intervalM > 0 ? 100 * (1 - intervalM / footprintAlong) : null
  return { intervalM, autoIntervalM, seconds, manual, frontOverlapPct: frontOverlap }
}
