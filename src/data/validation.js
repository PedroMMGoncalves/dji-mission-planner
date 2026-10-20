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
