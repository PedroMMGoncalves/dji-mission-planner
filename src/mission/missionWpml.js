/**
 * Os campos WPML da missão (M3-T3 da revisão do código): os da aeronave, os
 * do payload, os limites do gimbal e a lente. A lente (`imageFormat`) é a que
 * a exportação escreve em cada acção de câmara dos payloads multi-lente —
 * sem ela o M4T térmico fotografava com a lente que o Pilot 2 tivesse por
 * omissão (B2 da revisão da exportação). Com um payload próprio os enums
 * vêm do editor; com uma aeronave própria, também o da aeronave.
 *
 * Função pura, para os testes a importarem sem montar o App.
 * @param {{id?: string, wpml?: object}} aircraft
 * @param {{type?: string, wpml?: object, gimbalPitch?: {min: number, max: number}|null,
 *   imageFormat?: string|null}} payload
 * @param {{payloadEnumValue?: number, droneEnumValue?: number}} [custom]
 * @returns {Record<string, any>}
 */
export function missionWpml(aircraft, payload, custom = {}) {
  const merged = {
    ...(aircraft?.wpml ?? {}),
    ...(payload?.wpml ?? {}),
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
