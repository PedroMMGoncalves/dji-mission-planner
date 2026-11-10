/**
 * Voos confirmados no campo (docs/VALIDACAO.md, §5): a combinação aeronave +
 * payload + modo com um KMZ aceite pelo Pilot 2 e voado. Fora desta lista o
 * preflight lembra que é o primeiro voo da combinação (M3-U19): contar as
 * fotos, conferir as alturas e a lente, e registar na matriz.
 */
export const VERIFIED_FLIGHTS = [
  { aircraftId: 'M3E', payloadId: 'M3E_WIDE', mode: 'area' },
  { aircraftId: 'M4T', payloadId: 'M4T_WIDE', mode: 'area' },
]

/** @param {{aircraftId: string, payloadId: string, mode: string}} f */
export function isVerifiedFlight(f) {
  return VERIFIED_FLIGHTS.some(
    (v) => v.aircraftId === f.aircraftId && v.payloadId === f.payloadId && v.mode === f.mode,
  )
}

/**
 * Os enums do payload («50/1») quando não estão na página de suporte de
 * produtos do Cloud API e vêm só de ficheiros escritos pelo Pilot 2
 * (`wpmlEnumsObserved`: a P1 e o Mapper+ do M300, VALIDACAO §5.4); senão
 * null. Com eles, o lembrete do primeiro voo diz de onde vêm e que a
 * importação está por confirmar.
 * @param {{wpmlEnumsObserved?: boolean, wpml?: {payloadEnumValue?: number,
 *   payloadSubEnumValue?: number}}|null|undefined} payload
 * @returns {string|null}
 */
export function observedPayloadEnums(payload) {
  if (!payload?.wpmlEnumsObserved || !payload.wpml) return null
  return `${payload.wpml.payloadEnumValue}/${payload.wpml.payloadSubEnumValue ?? 0}`
}
