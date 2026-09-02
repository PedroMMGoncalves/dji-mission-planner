/**
 * Cache persistente dos tiles de relevo (Cache API do browser). Os tiles
 * Terrarium são imutáveis, pelo que uma resposta guardada serve para
 * sempre: uma área já vista carrega sem rede, e no campo, sem cobertura,
 * o relevo continua disponível para as áreas planeadas no gabinete.
 * Sem Cache API (Node, browsers antigos, contexto inseguro) cai no fetch
 * simples; qualquer falha da cache também.
 */

export const TILE_CACHE_NAME = 'dji-mission-planner:terrarium:v1'

/**
 * Devolve uma função fetch com cache à frente e um contador de acertos.
 * @param {(url: string) => Promise<Response>} doFetch fetch de rede
 * @param {{ cacheStorage?: CacheStorage|null, cacheName?: string }} [opts]
 */
export function withTileCache(doFetch, { cacheStorage = null, cacheName = TILE_CACHE_NAME } = {}) {
  const storage = cacheStorage ?? (typeof caches !== 'undefined' ? caches : null)
  const stats = { hits: 0, misses: 0, stored: 0 }
  if (!storage || typeof storage.open !== 'function') {
    return {
      fetch: async (url) => {
        stats.misses += 1
        return doFetch(url)
      },
      stats,
      enabled: false,
    }
  }
  let cachePromise = null
  const openCache = () => {
    if (!cachePromise) cachePromise = storage.open(cacheName).catch(() => null)
    return cachePromise
  }
  return {
    enabled: true,
    stats,
    fetch: async (url) => {
      const cache = await openCache()
      if (cache) {
        try {
          const hit = await cache.match(url)
          if (hit) {
            stats.hits += 1
            return hit
          }
        } catch {
          /* cache ilegível: segue para a rede */
        }
      }
      stats.misses += 1
      const res = await doFetch(url)
      if (cache && res && res.ok) {
        try {
          await cache.put(url, res.clone())
          stats.stored += 1
        } catch {
          /* quota cheia ou resposta opaca: a rede serviu na mesma */
        }
      }
      return res
    },
  }
}

/** Apaga a cache de tiles (botão "limpar" ou mudança de fonte). */
export async function clearTileCache(cacheStorage = null, cacheName = TILE_CACHE_NAME) {
  const storage = cacheStorage ?? (typeof caches !== 'undefined' ? caches : null)
  if (!storage || typeof storage.delete !== 'function') return false
  try {
    return await storage.delete(cacheName)
  } catch {
    return false
  }
}

/** Sem rede neste momento? (null quando o browser não sabe dizer) */
export function isOffline() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return null
  return navigator.onLine === false
}
