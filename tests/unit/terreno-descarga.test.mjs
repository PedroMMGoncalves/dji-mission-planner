/**
 * Descarga do relevo global (src/utils/terrain.js, loadTerrain) com as APIs
 * do browser substituidas: a caixa devolvida e a dos tiles descarregados (e
 * nao a pedida), e um tile preso conta como falhado em vez de prender o
 * relevo em "a descarregar" para sempre.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { loadTerrain } from '../../src/utils/terrain.js'

const TILE = 4
beforeAll(() => {
  // tile plano a 0 m: Terrarium (128, 0, 0)
  globalThis.createImageBitmap = async () => ({ width: TILE, height: TILE, close() {} })
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage() {},
        getImageData: () => {
          const data = new Uint8ClampedArray(TILE * TILE * 4)
          for (let i = 0; i < data.length; i += 4) data.set([128, 0, 0, 255], i)
          return { data }
        },
      }
    }
  }
})
afterAll(() => {
  delete globalThis.createImageBitmap
  delete globalThis.OffscreenCanvas
})

const ok = async () => ({ ok: true, status: 200, blob: async () => ({}) })
const box = /** @type {[number, number, number, number]} */ ([-8.01, 39.49, -7.99, 39.51])

describe('descarga do relevo global', () => {
  test('a caixa devolvida e a dos tiles, com o tile de margem, e contem a pedida', async () => {
    const t = await loadTerrain(box, { fetchImpl: ok, cacheStorage: null })
    expect(t.requestedBbox).toEqual(box)
    const [w, s, e, n] = t.bbox
    expect(w).toBeLessThan(box[0])
    expect(s).toBeLessThan(box[1])
    expect(e).toBeGreaterThan(box[2])
    expect(n).toBeGreaterThan(box[3])
    // um tile de zoom 12 tem ~7,5 km a esta latitude: pelo menos um de margem
    const kmLon = 111.32 * Math.cos((39.5 * Math.PI) / 180)
    expect((box[0] - w) * kmLon).toBeGreaterThan(5)
    expect((e - box[2]) * kmLon).toBeGreaterThan(5)
    // e ha dados em toda ela (tiles planos a 0 m)
    expect(t.elevationAt(w + 0.001, s + 0.001)).toBeCloseTo(0, 5)
    expect(t.elevationAt(e - 0.001, n - 0.001)).toBeCloseTo(0, 5)
  })

  test('um tile preso conta como falhado; a descarga termina na mesma', async () => {
    let calls = 0
    const oneHangs = (url) => {
      calls += 1
      return calls === 1 ? new Promise(() => {}) : ok(url)
    }
    const t = await loadTerrain(box, { fetchImpl: oneHangs, cacheStorage: null, tileTimeoutMs: 50 })
    expect(t.failedCount).toBe(1)
    expect(t.tileCount).toBe(calls - 1)
  })

  test('todos presos: erro, e nao uma espera sem fim', async () => {
    const hang = () => new Promise(() => {})
    await expect(
      loadTerrain(box, { fetchImpl: hang, cacheStorage: null, tileTimeoutMs: 30 }),
    ).rejects.toThrow(/Falha ao descarregar/)
  })
})
