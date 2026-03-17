// Handler: query_refresh
// Re-executes a saved question's query and writes the result to cache.

import { createLogger } from '@meridian/shared';
import type { QueryResult } from '@meridian/shared';
import { MultiLayerCache, generateCacheKey } from '@meridian/cache';
import { DEFAULT_CACHE_TTL_SECONDS } from '@meridian/shared';
import type { WorkerConfig } from '../config.js';

const logger = createLogger('@meridian/worker:query-refresh');

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface QueryRefreshPayload {
  /** Question (saved query) ID to refresh */
  questionId: string;
  /** Organization the question belongs to */
  organizationId: string;
  /** Override cache TTL in seconds (default: DEFAULT_CACHE_TTL_SECONDS) */
  cacheTtl?: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface QueryRefreshResult {
  questionId: string;
  rowCount: number;
  executionTimeMs: number;
  cachedAt: string;
  cacheKey: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class QueryRefreshHandler {
  private readonly cache: MultiLayerCache;

  constructor(
    private readonly config: WorkerConfig,
    cache: MultiLayerCache,
  ) {
    this.cache = cache;
  }

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<QueryRefreshResult> {
    const payload = data as unknown as QueryRefreshPayload;
    const { questionId, organizationId, cacheTtl } = payload;

    if (!questionId) {
      throw new Error('questionId is required in query_refresh job data');
    }

    logger.info('Starting query refresh', { questionId, organizationId });
    await progress(5);

    // Dynamically load DB and connector modules to avoid startup-time failures
    // when packages are not yet built. In production these are always available.
    const { createDatabaseFromUrl } = await import('@meridian/db');
    await progress(10);

    const db = createDatabaseFromUrl(this.config.databaseUrl);

    // Load question
    const { QuestionRepository } = await import('@meridian/db');
    const questionRepo = new QuestionRepository(db);
    const question = await questionRepo.findById(questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    await progress(20);

    // Load data source
    const { DataSourceRepository } = await import('@meridian/db');
    const datasourceRepo = new DataSourceRepository(db);
    const datasource = await datasourceRepo.findById(question.dataSourceId);
    if (!datasource) {
      throw new Error(`DataSource not found: ${question.dataSourceId}`);
    }

    await progress(30);

    // Build connector
    const { createConnector } = await import('@meridian/connectors');
    const dsConfig = {
      id: datasource.id,
      name: datasource.name,
      type: datasource.type,
      ...(datasource.config as Record<string, unknown>),
    };

    const connector = createConnector(dsConfig);

    try {
      await connector.connect();
      await progress(40);

      // Extract SQL
      const sql = extractSql(question.query);
      if (!sql) {
        throw new Error(
          `Question ${questionId} has no executable SQL. ` +
            'Visual queries must be translated before refresh.',
        );
      }

      logger.info('Executing query', {
        questionId,
        sqlPreview: sql.substring(0, 120),
        datasourceType: datasource.type,
      });

      await progress(50);
      const result: QueryResult = await connector.executeQuery(sql);
      await progress(80);

      // Cache the result
      const cacheKey = generateCacheKey({
        namespace: 'query',
        identifier: questionId,
        version: 'v1',
      });

      const ttl = cacheTtl ?? DEFAULT_CACHE_TTL_SECONDS;
      await this.cache.set(cacheKey, result, { ttlSeconds: ttl });

      await progress(95);

      logger.info('Query refresh complete', {
        questionId,
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
      });

      await progress(100);

      return {
        questionId,
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
        cachedAt: new Date().toISOString(),
        cacheKey,
      };
    } finally {
      await connector.disconnect().catch((err: Error) => {
        logger.warn('Failed to disconnect connector after query refresh', {
          questionId,
          error: err.message,
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a raw SQL string from a question's query payload.
 * - SQL questions store `{ sql: string }`
 * - Visual questions are not yet translatable in the worker context
 */
function extractSql(query: Record<string, unknown>): string | null {
  if (typeof query['sql'] === 'string' && query['sql'].trim().length > 0) {
    return query['sql'];
  }
  return null;
}
