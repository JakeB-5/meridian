import { createLogger } from '@meridian/shared';
import type { CacheProvider } from '@meridian/cache';
import type { JobHandler } from '../job-registry.js';

const logger = createLogger('@meridian/scheduler:cache-cleanup-handler');

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

/**
 * Expected fields inside the job's `data` payload for a cache_cleanup job.
 */
export interface CacheCleanupJobData {
  /**
   * Namespaces to clean.  When omitted, the handler cleans all known namespaces.
   */
  namespaces?: string[];
  /**
   * Key glob pattern used to filter which keys to inspect (default: "*").
   * Only keys matching this pattern are eligible for eviction.
   */
  keyPattern?: string;
  /**
   * When true, perform a dry-run: calculate what would be removed but do not
   * actually delete anything.  Useful for auditing before a real cleanup.
   */
  dryRun?: boolean;
  /**
   * Hard upper limit on the number of keys to delete in a single run.
   * Prevents accidentally deleting huge numbers of entries.  Default: 10 000.
   */
  maxDeletions?: number;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface CacheCleanupResult {
  /** Number of keys actually deleted (0 in dry-run mode). */
  deleted: number;
  /** Number of keys that would have been deleted (always populated). */
  eligible: number;
  /** Namespaces that were processed. */
  namespacesProcessed: string[];
  /** Whether the run was a dry-run. */
  dryRun: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Default namespaces to clean when none are specified
// ---------------------------------------------------------------------------

const DEFAULT_NAMESPACES = ['query', 'dashboard', 'schema', 'export'];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Removes expired or stale cache entries.
 *
 * Execution flow:
 * 1. Determine namespaces to clean (from payload or defaults).
 * 2. For each namespace, list all matching keys.
 * 3. Delete each key (or skip in dry-run mode).
 * 4. Report progress incrementally across all namespaces + keys.
 *
 * Note: The handler relies on the `CacheProvider.keys()` method to discover
 * entries and `CacheProvider.delete()` to remove them.  Expiry is enforced
 * either by the underlying provider (Redis TTL, LRU eviction) or by clearing
 * a namespace wholesale when requested.  For a more fine-grained approach,
 * callers can extend this handler with a custom staleness predicate.
 */
export class CacheCleanupHandler implements JobHandler {
  constructor(private readonly cache: CacheProvider) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<CacheCleanupResult> {
    const payload = data as CacheCleanupJobData;
    const namespaces = payload.namespaces ?? DEFAULT_NAMESPACES;
    const keyPattern = payload.keyPattern ?? '*';
    const dryRun = payload.dryRun ?? false;
    const maxDeletions = payload.maxDeletions ?? 10_000;

    const startedAt = Date.now();
    let deleted = 0;
    let eligible = 0;

    logger.info('cache cleanup started', {
      namespaces,
      keyPattern,
      dryRun,
      maxDeletions,
    });

    for (let nsIdx = 0; nsIdx < namespaces.length; nsIdx++) {
      const ns = namespaces[nsIdx]!;

      // Build the glob pattern to pass to the cache provider.
      // Convention: keys are stored as "namespace:rest-of-key".
      const fullPattern = keyPattern === '*' ? `${ns}:*` : `${ns}:${keyPattern}`;

      let keys: string[];
      try {
        keys = await this.cache.keys(fullPattern);
      } catch (err) {
        logger.warn('failed to list keys for namespace', {
          namespace: ns,
          pattern: fullPattern,
          error: (err as Error).message,
        });
        keys = [];
      }

      logger.debug('namespace key scan', { namespace: ns, count: keys.length });
      eligible += keys.length;

      for (let kIdx = 0; kIdx < keys.length; kIdx++) {
        if (deleted >= maxDeletions) {
          logger.warn('max deletions limit reached; stopping early', {
            maxDeletions,
            remaining: keys.length - kIdx,
          });
          break;
        }

        const key = keys[kIdx]!;

        if (!dryRun) {
          try {
            await this.cache.delete(key);
            deleted++;
          } catch (err) {
            logger.warn('failed to delete cache key', {
              key,
              error: (err as Error).message,
            });
          }
        }

        // Report progress: combine namespace-level and key-level progress.
        const nsWeight = 1 / namespaces.length;
        const nsBase = nsIdx / namespaces.length;
        const kProgress = keys.length > 0 ? (kIdx + 1) / keys.length : 1;
        const pct = Math.round((nsBase + nsWeight * kProgress) * 100);
        progress(pct);
      }
    }

    // Ensure we always report 100% at the end.
    progress(100);

    const durationMs = Date.now() - startedAt;

    logger.info('cache cleanup complete', {
      deleted,
      eligible,
      dryRun,
      durationMs,
    });

    return {
      deleted: dryRun ? 0 : deleted,
      eligible,
      namespacesProcessed: namespaces,
      dryRun,
      durationMs,
    };
  }
}
