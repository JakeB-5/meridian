// Handler: cache_cleanup
// Removes expired cache entries from both the database cache_entries table
// and from the Redis / in-memory cache providers.

import { createLogger } from '@meridian/shared';
import type { WorkerConfig } from '../config.js';
import type { MultiLayerCache } from '@meridian/cache';

const logger = createLogger('@meridian/worker:cache-cleanup');

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface CacheCleanupPayload {
  /** Maximum number of DB rows to delete per batch (default: 500) */
  batchSize?: number;
  /** Only delete entries older than this many seconds (default: 0 = all expired) */
  olderThanSeconds?: number;
  /** Namespace pattern to target (default: all namespaces) */
  namespace?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface CacheCleanupResult {
  dbEntriesDeleted: number;
  cacheKeysCleared: number;
  durationMs: number;
  cleanedAt: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class CacheCleanupHandler {
  constructor(
    private readonly config: WorkerConfig,
    private readonly cache: MultiLayerCache,
  ) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<CacheCleanupResult> {
    const payload = data as unknown as CacheCleanupPayload;
    const { batchSize = 500, olderThanSeconds = 0, namespace } = payload;

    const startTime = Date.now();
    logger.info('Starting cache cleanup', { batchSize, olderThanSeconds, namespace });
    await progress(5);

    let dbEntriesDeleted = 0;
    let cacheKeysCleared = 0;

    // ── Step 1: Clean expired entries from the DB cache_entries table ──────
    try {
      const { createDatabaseFromUrl } = await import('@meridian/db');
      const db = createDatabaseFromUrl(this.config.databaseUrl);
      await progress(15);

      dbEntriesDeleted = await deleteExpiredDbEntries(db, batchSize, olderThanSeconds);
      logger.info('DB cache entries deleted', { count: dbEntriesDeleted });
    } catch (error) {
      logger.error('Failed to clean DB cache entries', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue — try Redis/memory cleanup even if DB fails
    }

    await progress(50);

    // ── Step 2: Clear matching keys from the multi-layer cache ─────────────
    try {
      if (namespace) {
        await this.cache.clear(namespace);
        // Approximate count from listed keys before clear
        cacheKeysCleared = await countAndClearNamespace(this.cache, namespace);
      } else {
        // Clear all expired entries — MultiLayerCache.clear() with no namespace
        // flushes the in-memory layer; Redis TTL handles its own expiry.
        await this.cache.clear();
        cacheKeysCleared = -1; // Unknown count when doing full clear
        logger.info('Full cache clear performed');
      }
    } catch (error) {
      logger.error('Failed to clear cache keys', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await progress(90);

    const durationMs = Date.now() - startTime;
    logger.info('Cache cleanup complete', {
      dbEntriesDeleted,
      cacheKeysCleared,
      durationMs,
    });

    await progress(100);

    return {
      dbEntriesDeleted,
      cacheKeysCleared: cacheKeysCleared === -1 ? 0 : cacheKeysCleared,
      durationMs,
      cleanedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Delete expired rows from the cache_entries table in batches.
 * Returns the total number of rows deleted.
 */
async function deleteExpiredDbEntries(
  db: Awaited<ReturnType<typeof import('@meridian/db').createDatabaseFromUrl>>,
  batchSize: number,
  olderThanSeconds: number,
): Promise<number> {
  const { sql, lt } = await import('drizzle-orm');
  const { cacheEntries } = await import('@meridian/db');

  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  let totalDeleted = 0;

  while (true) {
    // Delete a batch of expired rows
    const deleted = await (db as unknown as {
      delete: (table: unknown) => {
        where: (condition: unknown) => {
          limit: (n: number) => {
            returning: () => Promise<Array<{ id: string }>>;
          };
        };
      };
    })
      .delete(cacheEntries)
      .where(lt(cacheEntries.expiresAt, cutoff))
      .limit(batchSize)
      .returning();

    const count = deleted.length;
    totalDeleted += count;

    if (count < batchSize) {
      // No more rows to delete
      break;
    }

    // Small pause between batches to avoid locking the DB
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return totalDeleted;
}

/**
 * List keys in a namespace, then clear the namespace.
 * Returns the approximate number of keys cleared.
 */
async function countAndClearNamespace(
  cache: MultiLayerCache,
  namespace: string,
): Promise<number> {
  try {
    const keys = await cache.keys(`${namespace}:*`);
    await cache.clear(namespace);
    return keys.length;
  } catch {
    await cache.clear(namespace);
    return 0;
  }
}
