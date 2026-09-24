/**
 * Cota de referência das alturas relativas.
 *
 * O WPML exporta alturas relativas ao ponto de descolagem; para o perfil de
 * elevação, a vista 3D, a folga ao solo E as alturas do seguimento de
 * terreno é preciso assumir a cota desse ponto. A cadeia é:
 *
 *   base marcada com relevo → cota MÍNIMA do relevo debaixo da rota → nenhuma
 *
 * A mínima, e não a máxima nem o primeiro waypoint, porque a altura real
 * acima do solo em cada ponto é
 *   AGL real = AGL planeado + (cota real da descolagem − cota assumida)
 * e, descolando em qualquer ponto da área, a cota real é ≥ mínima: o termo
 * é ≥ 0 e o drone voa mais alto do que o planeado, nunca mais baixo. O
 * primeiro waypoint não tem essa propriedade (descolar num vale abaixo dele
 * punha a rota mais baixa do que a verificação de folga dizia), e 0 m —
 * o que acontecia com a base fora do relevo — punha o voo debaixo da terra.
 *
 * A conservadora paga em GSD quando a descolagem é acima da mínima; é a
 * base marcada que recupera a precisão, e o preflight lembra-o quando o
 * desnível da área torna a diferença relevante.
 */
import { terrainRangeAlong } from './clearance.js'

/**
 * @param {{elevationAt?: ((lon: number, lat: number) => number|null)|null,
 *   basePoint?: number[]|null, waypoints?: number[][]|null}} args
 * @returns {{elev: number|null, source: 'base'|'area-min'|null, baseOutside: boolean,
 *   terrainMin: number|null, terrainMax: number|null, reliefM: number|null}}
 */
export function referenceElevation({ elevationAt, basePoint, waypoints }) {
  const none = {
    elev: null,
    source: null,
    baseOutside: false,
    terrainMin: null,
    terrainMax: null,
    reliefM: null,
  }
  if (typeof elevationAt !== 'function') return none
  const range = terrainRangeAlong(waypoints ?? [], { elevationAt })
  const terrain = range
    ? { terrainMin: range.minM, terrainMax: range.maxM, reliefM: range.maxM - range.minM }
    : { terrainMin: null, terrainMax: null, reliefM: null }
  const atBase =
    Array.isArray(basePoint) && Number.isFinite(basePoint[0]) && Number.isFinite(basePoint[1])
      ? elevationAt(basePoint[0], basePoint[1])
      : null
  if (Number.isFinite(atBase))
    return { ...terrain, elev: atBase, source: 'base', baseOutside: false }
  const baseOutside = Array.isArray(basePoint)
  if (range) return { ...terrain, elev: range.minM, source: 'area-min', baseOutside }
  return { ...none, baseOutside }
}
