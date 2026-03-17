import { createLogger } from '../logger.js';
import type { CacheOptions, CacheProvider } from '../types.js';

const logger = createLogger('@meridian/cache:cacheable');

/**
 * Higher-order function that wraps an async function with cache-aside logic.
 *
 * Usage:
 * ```ts
 * const cachedFetch = withCache(
 *   cache,
 *   (...args) => `my-key:${args[0]}`,
 *   { ttlSeconds: 60 },
 * )(fetchData);
 *
 * const result = await cachedFetch('arg1');
 * ```
 *
 * On cache hit the wrapped function is never invoked.
 * On cache miss the wrapped function executes and its result is stored.
 *
 * @param cache    The cache provider to use.
 * @param keyFn    Function that derives the cache key from the wrapped fn's
 *                 arguments. Must return a non-empty string.
 * @param options  Optional TTL and namespace forwarded to cache.set().
 */
export function withCache<T>(
  cache: CacheProvider,
  keyFn: (...args: unknown[]) => string,
  options?: CacheOptions,
): (fn: (...args: unknown[]) => Promise<T>) => (...args: unknown[]) => Promise<T> {
  return (fn: (...args: unknown[]) => Promise<T>) => {
    return async (...args: unknown[]): Promise<T> => {
      const key = keyFn(...args);

      if (!key) {
        logger.warn('withCache: keyFn returned empty key, bypassing cache');
        return fn(...args);
      }

      // Cache-aside: check cache first.
      const cached = await cache.get<T>(key);
      if (cached !== null) {
        logger.debug('withCache hit', { key });
        return cached;
      }

      // Cache miss: execute the real function.
      logger.debug('withCache miss, invoking fn', { key });
      const result = await fn(...args);

      // Store result (fire-and-forget to avoid blocking the caller).
      cache.set(key, result, options).catch((err: unknown) => {
        logger.error('withCache: failed to store result', {
          key,
          error: String(err),
        });
      });

      return result;
    };
  };
}

/**
 * Invalidate a specific cached value.
 *
 * Convenience wrapper around cache.delete() for use alongside withCache().
 */
export async function invalidateCache(
  cache: CacheProvider,
  key: string,
): Promise<boolean> {
  logger.debug('invalidateCache', { key });
  return cache.delete(key);
}

/**
 * Invalidate all cached values within a namespace.
 *
 * Convenience wrapper around cache.clear() for use alongside withCache().
 */
export async function invalidateCacheNamespace(
  cache: CacheProvider,
  namespace: string,
): Promise<void> {
  logger.debug('invalidateCacheNamespace', { namespace });
  return cache.clear(namespace);
}
