/**
 * Cache persistente dos tiles de relevo (src/utils/tileCache.js), com uma
 * CacheStorage falsa: a segunda leitura nao vai a rede, respostas com erro
 * nao entram, e uma cache avariada cai no fetch simples; uma cache que
 * falha a ler, a guardar ou a apagar nao trava nada; sem cache indicada
 * usa-se a Cache API do browser; e o estado da rede.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  TILE_CACHE_NAME,
  clearTileCache,
  isOffline,
  withTileCache,
} from '../../src/utils/tileCache.js'

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

describe('falhas a meio e a Cache API do browser', () => {
  afterEach(() => vi.unstubAllGlobals())
  const net = async () => response(true, 'png')

  test('cache que falha a ler ou a guardar: a rede serve na mesma e conta-se o que ficou', async () => {
    const ilegivel = {
      open: async () => ({
        match: async () => {
          throw new Error('ilegivel')
        },
        put: async () => {},
      }),
    }
    const a = withTileCache(net, { cacheStorage: ilegivel, cacheName: 't' })
    expect((await a.fetch('u/6')).ok).toBe(true)
    expect(a.stats).toEqual({ hits: 0, misses: 1, stored: 1 })
    const quotaCheia = {
      open: async () => ({
        match: async () => undefined,
        put: async () => {
          throw new Error('quota')
        },
      }),
    }
    const b = withTileCache(net, { cacheStorage: quotaCheia, cacheName: 't' })
    expect((await b.fetch('u/7')).ok).toBe(true)
    expect(b.stats).toEqual({ hits: 0, misses: 1, stored: 0 })
  })

  test('sem cache indicada usa a Cache API do browser, com o nome por omissao', async () => {
    const storage = fakeStorage()
    vi.stubGlobal('caches', storage)
    const c = withTileCache(net)
    expect(c.enabled).toBe(true)
    await c.fetch('u/8')
    await c.fetch('u/8')
    expect(c.stats).toEqual({ hits: 1, misses: 1, stored: 1 })
    expect([...storage.stores.keys()]).toEqual([TILE_CACHE_NAME])
    expect(await clearTileCache()).toBe(true)
    expect(storage.stores.size).toBe(0)
  })

  test('apagar uma cache que falha, ou sem forma de apagar: false, sem rebentar', async () => {
    const bloqueada = {
      delete: async () => {
        throw new Error('bloqueada')
      },
    }
    expect(await clearTileCache(bloqueada, 't')).toBe(false)
    expect(await clearTileCache({ open: async () => null }, 't')).toBe(false)
  })

  test('sem rede: o browser diz se esta ligado; sem essa informacao, null', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(isOffline()).toBe(true)
    vi.stubGlobal('navigator', { onLine: true })
    expect(isOffline()).toBe(false)
    vi.stubGlobal('navigator', {})
    expect(isOffline()).toBeNull()
    vi.stubGlobal('navigator', undefined)
    expect(isOffline()).toBeNull()
  })
})
