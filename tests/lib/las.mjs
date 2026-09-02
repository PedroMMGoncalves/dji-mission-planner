/**
 * Escritor de LAS 1.2 (formato de ponto 0) para os testes: pontos XYZ
 * dados, escala 0.01 m. Só o cabeçalho público e os registos, nada mais.
 */
export function writeLas(points, { scale = 0.01 } = {}) {
  const HEADER = 227
  const REC = 20
  const buf = Buffer.alloc(HEADER + points.length * REC)
  buf.write('LASF', 0, 'ascii')
  buf[24] = 1
  buf[25] = 2
  buf.write('dji-mission-planner tests', 26, 'ascii')
  buf.write('tests/lib/las.mjs', 58, 'ascii')
  buf.writeUInt16LE(HEADER, 94)
  buf.writeUInt32LE(HEADER, 96)
  buf.writeUInt32LE(0, 100) // VLRs
  buf[104] = 0
  buf.writeUInt16LE(REC, 105)
  buf.writeUInt32LE(points.length, 107)
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const zs = points.map((p) => p[2] ?? 0)
  const min = (a) => a.reduce((m, v) => (v < m ? v : m), a.length ? a[0] : 0)
  const max = (a) => a.reduce((m, v) => (v > m ? v : m), a.length ? a[0] : 0)
  const off = [min(xs), min(ys), min(zs)]
  ;[scale, scale, scale].forEach((s, i) => buf.writeDoubleLE(s, 131 + i * 8))
  off.forEach((o, i) => buf.writeDoubleLE(o, 155 + i * 8))
  buf.writeDoubleLE(max(xs), 179)
  buf.writeDoubleLE(min(xs), 187)
  buf.writeDoubleLE(max(ys), 195)
  buf.writeDoubleLE(min(ys), 203)
  buf.writeDoubleLE(max(zs), 211)
  buf.writeDoubleLE(min(zs), 219)
  points.forEach((p, i) => {
    const b = HEADER + i * REC
    buf.writeInt32LE(Math.round((p[0] - off[0]) / scale), b)
    buf.writeInt32LE(Math.round((p[1] - off[1]) / scale), b + 4)
    buf.writeInt32LE(Math.round(((p[2] ?? 0) - off[2]) / scale), b + 8)
  })
  return buf
}
