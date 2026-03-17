import { createLogger } from './logger.js';
import type { CacheOptions, CacheProvider } from './types.js';

const logger = createLogger('@meridian/cache:multi-layer');

/**
 * Cascading multi-layer cache.
 *
 * Layers are ordered from fastest (L1, index 0) to slowest (LN, last index).
 * Typical usage: layers[0] = MemoryCache, layers[1] = RedisCache.
 *
 * Behaviour:
 *  - get:    Checks each layer in order. On a hit, back-fills all faster layers
 *            that missed, preserving the original TTL if known.
 *  - set:    Writes to every layer in parallel.
 *  - delete: Deletes from every layer in parallel.
 *  - clear:  Clears every layer in parallel.
 *  - keys:   Returns the union of keys from all layers (deduplicated).
 *  - has:    Returns true if any layer holds the key.
 */
export class MultiLayerCache implements CacheProvider {
  constructor(private readonly layers: CacheProvider[]) {
    if (layers.length === 0) {
      throw new Error('MultiLayerCache requires at least one layer');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const missedLayers: number[] = [];

    for (let i = 0; i < this.layers.length; i++) {
      const value = await this.layers[i]!.get<T>(key);

      if (value !== null) {
        logger.debug('multi-layer hit', { key, layer: i });

        // Back-fill all faster layers that missed.
        if (missedLayers.length > 0) {
          await Promise.all(
            missedLayers.map((idx) => {
              logger.debug('back-filling layer', { key, layer: idx });
              return this.layers[idx]!.set(key, value);
            }),
          );
        }

        return value;
      }

      missedLayers.push(i);
    }

    logger.debug('multi-layer miss', { key });
    return null;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    await Promise.all(
      this.layers.map((layer, i) => {
        logger.debug('multi-layer set', { key, layer: i });
        return layer.set(key, value, options);
      }),
    );
  }

  async delete(key: string): Promise<boolean> {
    const results = await Promise.all(
      this.layers.map((layer) => layer.delete(key)),
    );
    // Return true if at least one layer actually deleted the key.
    return results.some(Boolean);
  }

  async has(key: string): Promise<boolean> {
    for (const layer of this.layers) {
      if (await layer.has(key)) return true;
    }
    return false;
  }

  async clear(namespace?: string): Promise<void> {
    await Promise.all(this.layers.map((layer) => layer.clear(namespace)));
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeySets = await Promise.all(
      this.layers.map((layer) => layer.keys(pattern)),
    );

    // Deduplicate across layers.
    const seen = new Set<string>();
    for (const keySet of allKeySets) {
      for (const k of keySet) {
        seen.add(k);
      }
    }
    return Array.from(seen);
  }
}
