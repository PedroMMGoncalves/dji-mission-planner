/**
 * Código QR da ficha de campo (src/utils/qrCode.js): o caminho SVG que vai
 * para o papel, rasterizado módulo a módulo e lido por um descodificador
 * independente (jsQR, só nos testes), dá de volta exactamente o texto
 * codificado — a ligação dos mapas do ponto da base (mapLinks), com
 * latitudes e longitudes de qualquer sinal. Se o codificador, a correcção
 * ou o desenho do caminho mudassem, o telemóvel abria outro sítio, ou nada.
 */
import fc from 'fast-check'
import jsQR from 'jsqr'
import { describe, expect, test } from 'vitest'
import { QR_QUIET, qrSvg } from '../../src/utils/qrCode.js'
import { mapLinks } from '../../src/mission/fieldSheet.js'

/** Píxeis RGBA do caminho, `scale` píxeis por módulo, a branco por baixo. */
function raster({ size, path }, scale = 4) {
  const w = size * scale
  const px = new Uint8ClampedArray(w * w * 4).fill(255)
  let rects = 0
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x0, y0, len, back] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    expect(back).toBe(len)
    rects += 1
    for (let y = y0 * scale; y < (y0 + 1) * scale; y++)
      for (let x = x0 * scale; x < (x0 + len) * scale; x++) {
        const i = (y * w + x) * 4
        px[i] = px[i + 1] = px[i + 2] = 0
      }
  }
  // o caminho é só feito destes rectângulos
  expect(path.replace(/M\d+ \d+h\d+v1h-\d+z/g, '')).toBe('')
  expect(rects).toBeGreaterThan(0)
  return { px, w }
}

/** O texto que o descodificador lê do caminho SVG. */
function decode(qr) {
  const { px, w } = raster(qr)
  return jsQR(px, w, w)?.data ?? null
}

describe('código QR da ficha de campo: o que se imprime lê-se', () => {
  test('a ligação do Google Maps de uma base volta igual', () => {
    const link = mapLinks([-9.12331, 38.711744], 'Base J').https
    expect(link).toBe('https://www.google.com/maps/search/?api=1&query=38.711744,-9.123310')
    const qr = qrSvg(link)
    // versão 5 (37 módulos) com a correcção M, e a margem clara de 4 módulos
    expect(qr.modules).toBe(37)
    expect(qr.size).toBe(37 + 2 * QR_QUIET)
    expect(decode(qr)).toBe(link)
  })

  test('a margem clara fica em volta: nenhum módulo escuro nela', () => {
    const qr = qrSvg('https://www.google.com/maps/search/?api=1&query=0.000000,0.000000')
    for (const m of qr.path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      const [x, y, len] = [Number(m[1]), Number(m[2]), Number(m[3])]
      expect(x).toBeGreaterThanOrEqual(QR_QUIET)
      expect(y).toBeGreaterThanOrEqual(QR_QUIET)
      expect(x + len).toBeLessThanOrEqual(qr.size - QR_QUIET)
      expect(y).toBeLessThan(qr.size - QR_QUIET)
    }
    const semMargem = qrSvg('abc', { quiet: 0 })
    expect(semMargem.size).toBe(semMargem.modules)
  })

  test('qualquer ponto da Terra: a ligação de mapLinks lê-se de volta, com sinal e 6 casas', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -90, max: 90, noNaN: true }),
        (lon, lat) => {
          const link = mapLinks([lon, lat]).https
          expect(decode(qrSvg(link))).toBe(link)
        },
      ),
      { numRuns: 60 },
    )
  })

  test('a ligação geo: (com o nome do marcador) também se lê de volta', () => {
    const geo = mapLinks([-8.5, 41.25], 'Base A').geo
    expect(decode(qrSvg(geo))).toBe(geo)
  })

  test('sem texto, ou com mais do que cabe num código: sem código (null), sem erro', () => {
    expect(qrSvg('')).toBeNull()
    expect(qrSvg(null)).toBeNull()
    expect(qrSvg(undefined)).toBeNull()
    expect(qrSvg('x'.repeat(5000))).toBeNull()
  })
})
