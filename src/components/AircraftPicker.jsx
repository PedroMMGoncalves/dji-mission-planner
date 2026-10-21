import { useId } from 'react'
import { useT } from '../i18n.jsx'
import {
  AIRCRAFT,
  PAYLOADS,
  aircraftLabel,
  aircraftShortLabel,
  payloadDesc,
  payloadLabel,
} from '../data/drones.js'
import { Note, Select, signedText } from './ModePanel.jsx'

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
 * A escolha em poucas palavras, para o resumo da secção «Aeronave e sensor»:
 * o nome curto da aeronave, o payload e, com câmara, o intervalo do gimbal
 * (`detail` 'gimbal', na face e na órbita) ou a focal ('focal').
 * @param {(key: string, vars?: any) => string} t
 * @param {{aircraftId: string, payloadId: string}} drone
 * @param {{type: string, focalLength?: number}} sensor
 * @param {'gimbal'|'focal'} detail
 */
export function aircraftSummary(t, drone, sensor, detail) {
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  // o nome curto do resumo do cartão 1 da área
  const name = aircraftShortLabel(aircraft, t)
  const camera = sensor?.type === 'camera'
  const extra = !camera
    ? null
    : detail === 'gimbal'
      ? payload.gimbalPitch &&
        t('mp.aircraft.gimbal', {
          min: signedText(payload.gimbalPitch.min),
          max: signedText(payload.gimbalPitch.max),
        })
      : Number.isFinite(sensor.focalLength) && t('mp.aircraft.focal', { f: sensor.focalLength })
  return [name, payloadLabel(payload, t), extra].filter(Boolean).join(' · ')
}

/**
 * Aeronave e sensor do projecto, no topo dos painéis da face, da órbita, do
 * corredor e do circular: a mesma escolha do cartão 1 da área (uma por
 * projecto), que antes só se mudava no separador Área — sem câmara, estes
 * modos ficavam sem fotos e sem maneira de a escolher.
 * `sensor` é o sensor resolvido (resolveSensor): o payload próprio é câmara
 * ou LiDAR conforme o editor do cartão 1 da área, que fica lá.
 * @param {{drone: {aircraftId: string, payloadId: string}, setDrone: (d: any) => void,
 *   sensor: {type: string, focalLength?: number}}} props
 */
export default function AircraftPicker({ drone, setDrone, sensor }) {
  const t = useT()
  const descId = useId()
  const aircraft = AIRCRAFT[drone.aircraftId]
  const payload = PAYLOADS[drone.payloadId]
  return (
    <div data-testid="aircraft-picker" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Select
          label={t('cards.aircraft')}
          value={drone.aircraftId}
          testId="aircraft-picker-aircraft"
          describedBy={descId}
          onChange={(v) => setDrone(droneForAircraft(drone, v))}
        >
          {Object.values(AIRCRAFT).map((a) => (
            <option key={a.id} value={a.id}>
              {aircraftLabel(a, t)}
            </option>
          ))}
        </Select>
        {aircraft.payloads.length > 1 && (
          <Select
            label={t('cp.drone.payload')}
            value={drone.payloadId}
            testId="aircraft-picker-payload"
            describedBy={descId}
            onChange={(v) => setDrone({ ...drone, payloadId: v })}
            className="mt-1.5"
          >
            {aircraft.payloads.map((pid) => (
              <option key={pid} value={pid}>
                {payloadLabel(PAYLOADS[pid], t)}
              </option>
            ))}
          </Select>
        )}
        <p id={descId} className="text-xs leading-normal text-slate-400">
          {sensor?.type === 'camera'
            ? t('ap.camera', {
                camera: payloadDesc(payload, t),
                focal: sensor.focalLength,
                min: payload.gimbalPitch?.min ?? '—',
                max: payload.gimbalPitch?.max ?? '—',
              })
            : t('ap.noCamera', { desc: payloadDesc(payload, t) })}
          {payload.type === 'custom' && ` ${t('ap.custom')}`}
        </p>
      </div>
      <Note tone="info">{t('mp.aircraftShared')}</Note>
    </div>
  )
}
