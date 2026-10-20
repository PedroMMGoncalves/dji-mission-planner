/**
 * O grupo «Qualidade» do painel de métricas, por separador: o GSD (com o
 * intervalo da incerteza só na área), a pegada, o espaçamento, o intervalo
 * de disparo, a velocidade e a densidade LiDAR do modo aberto — nunca os da
 * grelha da área noutro separador. O corredor tem tudo à sua altura, com o
 * gimbal nadir; o circular só o GSD à inclinação do gimbal e a corda entre
 * fotos ao longo do círculo; a face e a órbita têm o GSD no próprio plano
 * (stats.gsdCm) e nenhuma das outras. Lógica pura.
 */
import { computeFootprint, computeGSD, lidarPointDensity, lineSpacing } from '../utils/geo.js'

/**
 * @typedef {object} QualityStats
 * @property {number|null} gsd cm/px ao centro da imagem (null sem câmara)
 * @property {number} gimbalPitch inclinação a que o GSD está calculado
 * @property {any|null} uncertainty intervalos [pior, melhor] (só na área)
 * @property {{across: number, along: number|null}|null} footprint pegada no solo
 * @property {number|null} spacing espaçamento entre faixas ou passagens (m)
 * @property {number|null} interval intervalo de disparo (m)
 * @property {number|null} intervalS segundos do disparo por tempo (só na área)
 * @property {boolean} intervalManual intervalo escrito pelo piloto (só na área)
 * @property {string|null} triggerMode 'distance' | 'time' | 'waypoint'
 * @property {number|null} speed m/s
 * @property {any|null} pointDensity densidade LiDAR (lidarPointDensity)
 */

/** Nenhuma métrica de qualidade própria: a face e a órbita (o GSD vem do plano). */
const NONE = Object.freeze({
  gsd: null,
  gimbalPitch: -90,
  uncertainty: null,
  footprint: null,
  spacing: null,
  interval: null,
  intervalS: null,
  intervalManual: false,
  triggerMode: null,
  speed: null,
  pointDensity: null,
})

/**
 * @param {string} missionMode separador aberto
 * @param {object} c
 * @param {{gsd?: number|null, gsdPitch?: number, uncertainty?: any, footprint?: any,
 *   spacing?: number|null, interval?: number|null, intervalS?: number|null,
 *   intervalManual?: boolean, triggerMode?: string|null, speed?: number|null,
 *   pointDensity?: any}} c.area as métricas da grelha da área (useAreaParams), tal como
 *   estavam, com os intervalos da incerteza (usePreflight)
 * @param {any} c.sensor sensor resolvido (resolveSensor)
 * @param {any} [c.payload] payload activo (maxPrr para a densidade LiDAR)
 * @param {{altitude: number, sideOverlap: number, interval: number|null}|null} [c.corridorFlight]
 *   altura, sobreposição lateral e intervalo que o corredor usa (useCorridorMission)
 * @param {number|null} [c.corridorSpeed]
 * @param {{altitude: number}|null} [c.circularFlight] altura que o circular usa
 * @param {number} [c.circularPitch] inclinação do gimbal do circular
 * @param {any} [c.circularStats] stats do plano circular (gsdCm, gimbalPitch, chordM)
 * @param {number|null} [c.circularSpeed]
 * @returns {QualityStats}
 */
export function qualityStatsFor(
  missionMode,
  {
    area,
    sensor,
    payload = null,
    corridorFlight = null,
    corridorSpeed = null,
    circularFlight = null,
    circularPitch = -45,
    circularStats = null,
    circularSpeed = null,
  },
) {
  if (missionMode === 'area') {
    return {
      gsd: area.gsd ?? null,
      gimbalPitch: area.gsdPitch ?? -90,
      uncertainty: area.uncertainty ?? null,
      footprint: area.footprint ?? null,
      spacing: area.spacing ?? null,
      interval: area.interval ?? null,
      intervalS: area.intervalS ?? null,
      intervalManual: Boolean(area.intervalManual),
      triggerMode: area.triggerMode ?? null,
      speed: area.speed ?? null,
      pointDensity: area.pointDensity ?? null,
    }
  }
  if (missionMode === 'corridor' && corridorFlight && sensor) {
    // as mesmas contas de generateCorridorPlan: pegada à altura do corredor,
    // espaçamento pela sobreposição lateral dele; o disparo é sempre por
    // distância, ao intervalo automático (null com LiDAR: não há disparo)
    const altitude = corridorFlight.altitude
    const footprint = computeFootprint(sensor, altitude)
    const spacing = lineSpacing(footprint.across, corridorFlight.sideOverlap)
    const lidar = sensor.type === 'lidar'
    return {
      gsd: computeGSD(sensor, altitude, -90),
      gimbalPitch: -90,
      uncertainty: null,
      footprint,
      spacing,
      interval: lidar ? null : (corridorFlight.interval ?? null),
      intervalS: null,
      intervalManual: false,
      triggerMode: 'distance',
      speed: corridorSpeed,
      pointDensity:
        lidar && payload?.maxPrr
          ? lidarPointDensity({
              prr: payload.maxPrr,
              speed: corridorSpeed,
              swathM: footprint.across,
              spacingM: spacing,
            })
          : null,
    }
  }
  if (missionMode === 'circular' && sensor) {
    // o GSD do plano (à inclinação do gimbal, no eixo óptico) e a corda
    // entre fotos ao longo do círculo, que é o que o obturador acompanha;
    // sem plano ainda, o GSD à altura e à inclinação pedidas
    const camera = sensor.type === 'camera'
    const pitch = circularStats?.gimbalPitch ?? Math.round(circularPitch)
    const gsd = circularStats
      ? (circularStats.gsdCm ?? null)
      : circularFlight
        ? computeGSD(sensor, circularFlight.altitude, pitch)
        : null
    return {
      ...NONE,
      gsd: camera ? gsd : null,
      gimbalPitch: pitch,
      interval: camera ? (circularStats?.chordM ?? null) : null,
      triggerMode: 'distance',
      speed: circularSpeed,
    }
  }
  return NONE
}
