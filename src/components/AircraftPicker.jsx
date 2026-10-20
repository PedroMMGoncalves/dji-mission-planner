import { useT } from '../i18n.jsx'
import { AIRCRAFT, PAYLOADS } from '../data/drones.js'

const SELECT_CLASS =
  'mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

/**
 * A escolha `drone` com outra aeronave: fica o payload, se a nova o monta,
 * senão o primeiro dela (o cartão 1 da área faz o mesmo).
 * @param {{aircraftId: string, payloadId: string}} drone
 * @param {string} aircraftId
 */
export function droneForAircraft(drone, aircraftId) {
  const a = AIRCRAFT[aircraftId]
  return {
    aircraftId: a.id,
    payloadId: a.payloads.includes(drone.payloadId) ? drone.payloadId : a.payloads[0],
  }
}

/**
 * Aeronave e sensor do projecto, compactos, no topo dos painéis da face, da
 * órbita, do corredor e do circular: a mesma escolha do cartão 1 da área
 * (uma por projecto), que antes só se mudava no separador Área — sem câmara,
 * estes modos ficavam sem fotos e sem maneira de a escolher.
 * `sensor` é o sensor resolvido (resolveSensor): o payload próprio é câmara
 * ou LiDAR conforme o editor do cartão 1 da área, que fica lá.
 * @param {{drone: {aircraftId: string, payloadId: string}, setDrone: (d: any) => void,
 *   sensor: {type: string, focalLength?: number}}} props
 */
export default function AircraftPicker({ drone, setDrone, sensor }) {
  const t = useT()
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  return (
    <div data-testid="aircraft-picker">
      <select
        className={SELECT_CLASS}
        value={drone.aircraftId}
        aria-label={t('cards.aircraft')}
        data-testid="aircraft-picker-aircraft"
        onChange={(e) => setDrone(droneForAircraft(drone, e.target.value))}
      >
        {Object.values(AIRCRAFT).map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      {aircraft.payloads.length > 1 && (
        <select
          className={SELECT_CLASS}
          value={drone.payloadId}
          aria-label={t('cp.drone.payload')}
          data-testid="aircraft-picker-payload"
          onChange={(e) => setDrone({ ...drone, payloadId: e.target.value })}
        >
          {aircraft.payloads.map((pid) => (
            <option key={pid} value={pid}>
              {PAYLOADS[pid].label}
            </option>
          ))}
        </select>
      )}
      <p className="text-xs leading-relaxed text-slate-400">
        {sensor?.type === 'camera'
          ? t('ap.camera', {
              camera: payload.desc,
              focal: sensor.focalLength,
              min: payload.gimbalPitch?.min ?? '—',
              max: payload.gimbalPitch?.max ?? '—',
            })
          : t('ap.noCamera', { desc: payload.desc })}
        {payload.type === 'custom' && ` ${t('ap.custom')}`}
      </p>
    </div>
  )
}
