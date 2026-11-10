import { DEFAULT_WPML_VERSION } from '../utils/exporters.js'

/**
 * Os campos WPML da missão (M3-T3 da revisão do código): os da aeronave, os
 * do payload, os limites do gimbal e a lente. A lente (`imageFormat`) é a que
 * a exportação escreve em cada acção de câmara dos payloads multi-lente —
 * sem ela o M4T térmico fotografava com a lente que o Pilot 2 tivesse por
 * omissão (B2 da revisão da exportação). Com um payload próprio os enums
 * vêm do editor; com uma aeronave própria, também o da aeronave.
 *
 * A posição do payload (`payloadPositionIndex`) é a do suporte onde está
 * montado, escolhida no projecto (payloadPositionFor, src/data/drones.js):
 * vai para o payloadInfo, o payloadParam e cada acção de câmara e de gimbal.
 * A versão do WPML (`wpmlVersion`) é a do namespace dos dois ficheiros,
 * também do projecto (WPML_VERSIONS, src/utils/exporters.js).
 *
 * Função pura, para os testes a importarem sem montar o App.
 * @param {{id?: string, wpml?: object}} aircraft
 * @param {{type?: string, wpml?: object, gimbalPitch?: {min: number, max: number}|null,
 *   imageFormat?: string|null}} payload
 * @param {{payloadEnumValue?: number, droneEnumValue?: number}} [custom]
 * @param {{payloadPositionIndex?: number, wpmlVersion?: string}} [opts]
 * @returns {Record<string, any>}
 */
export function missionWpml(
  aircraft,
  payload,
  custom = {},
  { payloadPositionIndex = 0, wpmlVersion = DEFAULT_WPML_VERSION } = {},
) {
  const merged = {
    ...(aircraft?.wpml ?? {}),
    ...(payload?.wpml ?? {}),
    payloadPositionIndex,
    wpmlVersion,
    // limites do gimbal e lente do payload: a exportação recorta o pitch ao
    // intervalo e nomeia a lente nas acções dos payloads multi-lente
    gimbalPitchRange: payload?.gimbalPitch ?? null,
    imageFormat: payload?.imageFormat ?? null,
  }
  if (payload?.type === 'custom') {
    merged.payloadEnumValue = custom?.payloadEnumValue
    if (aircraft?.id === 'CUSTOM') merged.droneEnumValue = custom?.droneEnumValue
  }
  return merged
}
