/**
 * Registo de voo em CSV (Airdata, DJI Flight Log exportado, ou qualquer
 * CSV com colunas de tempo, latitude, longitude, altura e velocidade):
 * duração, velocidade média em movimento, distância máxima à base.
 */
const pick = (row, ...names) => {
  for (const n of names) {
    const k = Object.keys(row).find((key) => key.toLowerCase().replace(/[^a-z]/g, '') === n)
    if (k != null && row[k] !== '') return row[k]
  }
  return null
}
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseFlightLog(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim())
  return lines
    .slice(1)
    .map((l) => {
      const cells = l.split(',')
      const row = {}
      header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()))
      return {
        tMs: num(pick(row, 'timemillisecond', 'timems', 'time')),
        lat: num(pick(row, 'latitude', 'lat')),
        lon: num(pick(row, 'longitude', 'lon')),
        heightM: num(
          pick(
            row,
            'heightabovetakeoffmeters',
            'heightabovetakeoff',
            'altitudem',
            'height',
            'altitude',
          ),
        ),
        speedMS: num(pick(row, 'speedms', 'speed', 'xspeed')),
      }
    })
    .filter((r) => r.lat != null && r.lon != null)
}

export function measureFlightLog(rows, { basePoint = null } = {}) {
  if (rows.length < 2) return { error: 'registo de voo com menos de dois pontos' }
  const t = rows.map((r) => r.tMs).filter((v) => v != null)
  const durationS = t.length >= 2 ? (Math.max(...t) - Math.min(...t)) / 1000 : null
  const moving = rows.map((r) => r.speedMS).filter((v) => v != null && v > 0.5)
  const meanSpeedMS = moving.length ? moving.reduce((s, v) => s + v, 0) / moving.length : null
  const maxSpeedMS = moving.length ? Math.max(...moving) : null
  const lat0 = rows[0].lat
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const base = basePoint ?? [rows[0].lon, rows[0].lat]
  let maxDistM = 0
  let maxHeightM = null
  for (const r of rows) {
    const d = Math.hypot((r.lon - base[0]) * mLon, (r.lat - base[1]) * 110574)
    if (d > maxDistM) maxDistM = d
    if (r.heightM != null && (maxHeightM == null || r.heightM > maxHeightM)) maxHeightM = r.heightM
  }
  return { samples: rows.length, durationS, meanSpeedMS, maxSpeedMS, maxDistM, maxHeightM }
}
