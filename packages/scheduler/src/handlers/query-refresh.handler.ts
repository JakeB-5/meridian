import { createLogger } from '@meridian/shared';
import type { CacheProvider } from '@meridian/cache';
import type { JobHandler } from '../job-registry.js';

const logger = createLogger('@meridian/scheduler:query-refresh-handler');

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

/**
 * Expected fields inside the job's `data` payload for a query_refresh job.
 */
export interface QueryRefreshJobData {
  /** IDs of the questions/queries to refresh. When omitted, all cached queries are refreshed. */
  questionIds?: string[];
  /** Cache namespace where query results are stored (default: "query"). */
  cacheNamespace?: string;
  /** TTL in seconds for refreshed cache entries (default: 300 = 5 min). */
  cacheTtlSeconds?: number;
}

/**
 * A minimal query executor interface that the handler depends on.
 * Callers inject a concrete implementation (e.g. backed by the query engine).
 */
export interface QueryExecutor {
  /**
   * Re-execute a question by ID and return its serialisable result.
   * Throws if the question cannot be found or the query fails.
   */
  executeQuestion(questionId: string): Promise<unknown>;

  /**
   * List all question IDs that have a currently cached result.
   */
  listCachedQuestionIds(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface QueryRefreshResult {
  refreshed: string[];
  failed: Array<{ questionId: string; error: string }>;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Re-executes question queries and updates their cache entries.
 *
 * Execution flow:
 * 1. Determine the list of question IDs to refresh (from payload or full scan).
 * 2. Execute each query in sequence, reporting progress after each one.
 * 3. Write successful results back to the cache with the configured TTL.
 * 4. Collect errors for failed queries without aborting the whole batch.
 */
export class QueryRefreshHandler implements JobHandler {
  constructor(
    private readonly queryExecutor: QueryExecutor,
    private readonly cache: CacheProvider,
  ) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<QueryRefreshResult> {
    const payload = data as QueryRefreshJobData;
    const namespace = payload.cacheNamespace ?? 'query';
    const ttlSeconds = payload.cacheTtlSeconds ?? 300;

    const startedAt = Date.now();

    // Resolve the list of IDs to refresh.
    let ids: string[];
    if (payload.questionIds && payload.questionIds.length > 0) {
      ids = payload.questionIds;
      logger.info('refreshing specified questions', { count: ids.length, namespace });
    } else {
      logger.info('listing all cached question IDs for full refresh', { namespace });
      ids = await this.queryExecutor.listCachedQuestionIds();
      logger.info('full refresh: found cached questions', { count: ids.length });
    }

    const refreshed: string[] = [];
    const failed: Array<{ questionId: string; error: string }> = [];

    for (let i = 0; i < ids.length; i++) {
      const questionId = ids[i]!;

      try {
        logger.debug('refreshing question', { questionId });
        const result = await this.queryExecutor.executeQuestion(questionId);

        const cacheKey = `${namespace}:${questionId}`;
        await this.cache.set(cacheKey, result, { ttlSeconds, namespace });

        refreshed.push(questionId);
        logger.debug('question refreshed and cached', { questionId, cacheKey });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('failed to refresh question', { questionId, error: errorMessage });
        failed.push({ questionId, error: errorMessage });
      }

      // Report progress as a percentage of total IDs processed.
      const pct = Math.round(((i + 1) / ids.length) * 100);
      progress(pct);
    }

    const durationMs = Date.now() - startedAt;

    logger.info('query refresh complete', {
      refreshed: refreshed.length,
      failed: failed.length,
      durationMs,
    });

    return { refreshed, failed, durationMs };
  }
}
