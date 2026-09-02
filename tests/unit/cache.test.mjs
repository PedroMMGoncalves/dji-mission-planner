/**
 * Cache persistente dos tiles de relevo (src/utils/tileCache.js), com uma
 * CacheStorage falsa: a segunda leitura nao vai a rede, respostas com erro
 * nao entram, e uma cache avariada cai no fetch simples.
 */
import { describe, expect, test } from 'vitest'
import { withTileCache, clearTileCache } from '../../src/utils/tileCache.js'

const fakeStorage = () => {
  const stores = new Map()
  return {
    stores,
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)
      return {
        match: async (url) => m.get(url) ?? undefined,
        put: async (url, res) => m.set(url, res),
      }
    },
    delete: async (name) => stores.delete(name),
  }
}
const response = (ok, body) => ({
  ok,
  status: ok ? 200 : 500,
  body,
  clone() {
    return { ...this }
  },
})

describe('cache de tiles', () => {
  test('primeira leitura vai a rede e guarda; a segunda vem da cache', async () => {
    let calls = 0
    const net = async () => {
      calls += 1
      return response(true, 'png')
    }
    const c = withTileCache(net, { cacheStorage: fakeStorage(), cacheName: 't' })
    expect(c.enabled).toBe(true)
    const a = await c.fetch('u/1')
    const b = await c.fetch('u/1')
    expect(a.ok && b.ok).toBe(true)
    expect(calls).toBe(1)
    expect(c.stats).toEqual({ hits: 1, misses: 1, stored: 1 })
  })

  test('respostas com erro nao ficam em cache', async () => {
    let calls = 0
    const net = async () => {
      calls += 1
      return response(false, null)
    }
    const c = withTileCache(net, { cacheStorage: fakeStorage(), cacheName: 't' })
    await c.fetch('u/2')
    await c.fetch('u/2')
    expect(calls).toBe(2)
    expect(c.stats.stored).toBe(0)
  })

  test('sem Cache API ou com cache avariada: fetch simples, sem rebentar', async () => {
    let calls = 0
    const net = async () => {
      calls += 1
      return response(true, 'png')
    }
    const none = withTileCache(net, { cacheStorage: null })
    expect(none.enabled).toBe(typeof caches !== 'undefined')
    await none.fetch('u/3')
    const broken = withTileCache(net, {
      cacheStorage: {
        open: async () => {
          throw new Error('quota')
        },
      },
      cacheName: 't',
    })
    const r = await broken.fetch('u/4')
    expect(r.ok).toBe(true)
    expect(calls).toBe(2)
  })

  test('limpar a cache', async () => {
    const storage = fakeStorage()
    const c = withTileCache(async () => response(true, 'png'), {
      cacheStorage: storage,
      cacheName: 't',
    })
    await c.fetch('u/5')
    expect(storage.stores.has('t')).toBe(true)
    expect(await clearTileCache(storage, 't')).toBe(true)
    expect(storage.stores.has('t')).toBe(false)
    expect(await clearTileCache(null, 'x')).toBe(
      typeof caches !== 'undefined' ? expect.anything() : false,
    )
  })
})
