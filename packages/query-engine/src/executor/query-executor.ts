// ── Query Executor ──────────────────────────────────────────────────
// Orchestrates the full query pipeline: translate → optimize →
// generate SQL → check cache → execute → cache result.

import type { VisualQuery, QueryResult } from '@meridian/shared';
import { MeridianError, ok, err } from '@meridian/shared';
import type { Result } from '@meridian/shared';
import type { Connector } from '@meridian/connectors';

import type { AbstractQuery } from '../ir/abstract-query.js';
import type { SQLDialect } from '../dialects/sql-dialect.js';
import type { GeneratedSQL } from '../generator/sql-generator.js';
import { SQLGenerator } from '../generator/sql-generator.js';
import { QueryOptimizer } from '../optimizer/query-optimizer.js';
import { translateVisualToAbstract } from '../translator/visual-to-abstract.js';
import type { TranslationOptions } from '../translator/visual-to-abstract.js';
import { QueryCancellationRegistry } from './query-cancellation.js';

// ── Cache Interface ─────────────────────────────────────────────────

/**
 * Minimal cache interface the executor depends on.
 * The actual cache implementation is injected from @meridian/cache.
 */
export interface CacheProvider {
  /** Get a cached value by key. Returns null/undefined on miss. */
  get<T>(key: string): Promise<T | null | undefined>;
  /** Set a cached value with optional TTL in seconds. */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Delete a cached entry. */
  delete(key: string): Promise<void>;
}

// ── Connector Factory ───────────────────────────────────────────────

/**
 * Factory for obtaining database connectors by data source ID.
 * The actual implementation resolves connectors from the registry.
 */
export interface ConnectorFactory {
  /** Get a connected connector for the given data source. */
  getConnector(dataSourceId: string): Promise<Connector>;
  /** Get the SQL dialect for a given data source. */
  getDialect(dataSourceId: string): Promise<SQLDialect>;
}

// ── Executor Options ────────────────────────────────────────────────

export interface QueryExecutorOptions {
  /** Cache TTL in seconds for query results. 0 disables caching. */
  cacheTtlSeconds?: number;
  /** Maximum rows to return from any query */
  maxRows?: number;
  /** Default query timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Whether to enable query optimization */
  enableOptimization?: boolean;
  /** Default schema to use when translating visual queries */
  defaultSchema?: string;
  /** Translation options passed to the visual-to-abstract translator */
  translationOptions?: TranslationOptions;
}

const DEFAULT_OPTIONS: Required<Omit<QueryExecutorOptions, 'translationOptions' | 'defaultSchema'>> & {
  defaultSchema?: string;
  translationOptions?: TranslationOptions;
} = {
  cacheTtlSeconds: 300,
  maxRows: 10_000,
  defaultTimeoutMs: 30_000,
  enableOptimization: true,
  defaultSchema: undefined,
  translationOptions: undefined,
};

// ── Execution Result ────────────────────────────────────────────────

export interface ExecutionMetadata {
  /** Whether the result was served from cache */
  cached: boolean;
  /** The generated SQL (for debugging/logging) */
  sql: string;
  /** Parameter values used */
  params: unknown[];
  /** Time to generate SQL in ms */
  generationTimeMs: number;
  /** Time to execute the query in ms */
  executionTimeMs: number;
  /** Total time from request to response in ms */
  totalTimeMs: number;
  /** Optimizations applied (if any) */
  optimizations: string[];
  /** Translation warnings (if any) */
  warnings: string[];
  /** The query ID for cancellation */
  queryId: string;
}

export interface ExecutionResult {
  /** The query result data */
  result: QueryResult;
  /** Execution metadata */
  metadata: ExecutionMetadata;
}

// ── Error Codes ─────────────────────────────────────────────────────

export const QUERY_ENGINE_ERROR_CODES = {
  TRANSLATION_FAILED: 'QE_TRANSLATION_FAILED',
  GENERATION_FAILED: 'QE_GENERATION_FAILED',
  EXECUTION_FAILED: 'QE_EXECUTION_FAILED',
  OPTIMIZATION_FAILED: 'QE_OPTIMIZATION_FAILED',
  CONNECTOR_NOT_FOUND: 'QE_CONNECTOR_NOT_FOUND',
  QUERY_CANCELLED: 'QE_QUERY_CANCELLED',
  QUERY_TIMEOUT: 'QE_QUERY_TIMEOUT',
  CACHE_ERROR: 'QE_CACHE_ERROR',
} as const;

// ── Query Executor ──────────────────────────────────────────────────

/**
 * Main entry point for executing queries.
 * Handles the full pipeline: translate → optimize → generate → cache → execute.
 */
export class QueryExecutor {
  private readonly connectorFactory: ConnectorFactory;
  private readonly cache: CacheProvider | null;
  private readonly options: typeof DEFAULT_OPTIONS;
  private readonly optimizer: QueryOptimizer;
  private readonly cancellationRegistry: QueryCancellationRegistry;
  private queryCounter = 0;

  constructor(
    connectorFactory: ConnectorFactory,
    cache?: CacheProvider | null,
    options: QueryExecutorOptions = {},
  ) {
    this.connectorFactory = connectorFactory;
    this.cache = cache ?? null;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.optimizer = new QueryOptimizer();
    this.cancellationRegistry = new QueryCancellationRegistry();
  }

  /**
   * Execute a visual query against a data source.
   * Full pipeline: translate → optimize → generate → cache check → execute → cache store.
   */
  async executeVisual(
    query: VisualQuery,
    dataSourceId: string,
  ): Promise<Result<ExecutionResult>> {
    const totalStart = performance.now();
    const queryId = this.nextQueryId();

    try {
      // Step 1: Get dialect for the data source
      const dialect = await this.connectorFactory.getDialect(dataSourceId);

      // Step 2: Translate VisualQuery → AbstractQuery
      const translationOptions: TranslationOptions = {
        ...this.options.translationOptions,
        defaultSchema: this.options.defaultSchema,
        maxRows: this.options.maxRows,
      };

      const translation = translateVisualToAbstract(query, translationOptions);
      let abstractQuery = translation.query;
      let optimizations: string[] = [];

      // Step 3: Optimize
      if (this.options.enableOptimization) {
        const optResult = this.optimizer.optimize(abstractQuery);
        abstractQuery = optResult.query;
        optimizations = optResult.appliedOptimizations;
      }

      // Step 4: Generate SQL
      const genStart = performance.now();
      const generator = new SQLGenerator(dialect);
      const generated = generator.generate(abstractQuery);
      const generationTimeMs = performance.now() - genStart;

      // Step 5: Check cache
      const cacheKey = this.buildCacheKey(dataSourceId, generated);
      const cached = await this.tryGetCache<QueryResult>(cacheKey);

      if (cached) {
        const totalTimeMs = performance.now() - totalStart;
        return ok({
          result: cached,
          metadata: {
            cached: true,
            sql: generated.sql,
            params: generated.params,
            generationTimeMs,
            executionTimeMs: 0,
            totalTimeMs,
            optimizations,
            warnings: translation.warnings.map((w) => w.message),
            queryId,
          },
        });
      }

      // Step 6: Execute via connector
      const execResult = await this.executeGenerated(
        generated,
        dataSourceId,
        queryId,
      );

      if (!execResult.ok) {
        return execResult;
      }

      const queryResult = execResult.value;
      const totalTimeMs = performance.now() - totalStart;
      const executionTimeMs = queryResult.executionTimeMs;

      // Step 7: Cache the result
      await this.trySetCache(cacheKey, queryResult);

      return ok({
        result: queryResult,
        metadata: {
          cached: false,
          sql: generated.sql,
          params: generated.params,
          generationTimeMs,
          executionTimeMs,
          totalTimeMs,
          optimizations,
          warnings: translation.warnings.map((w) => w.message),
          queryId,
        },
      });
    } catch (error) {
      return err(this.wrapError(error, QUERY_ENGINE_ERROR_CODES.EXECUTION_FAILED));
    }
  }

  /**
   * Execute a raw SQL query against a data source.
   * Bypasses translation and optimization, but still uses cache.
   */
  async executeRaw(
    sql: string,
    dataSourceId: string,
    params?: unknown[],
  ): Promise<Result<ExecutionResult>> {
    const totalStart = performance.now();
    const queryId = this.nextQueryId();

    try {
      // Check cache
      const cacheKey = this.buildRawCacheKey(dataSourceId, sql, params);
      const cached = await this.tryGetCache<QueryResult>(cacheKey);

      if (cached) {
        const totalTimeMs = performance.now() - totalStart;
        return ok({
          result: cached,
          metadata: {
            cached: true,
            sql,
            params: params ?? [],
            generationTimeMs: 0,
            executionTimeMs: 0,
            totalTimeMs,
            optimizations: [],
            warnings: [],
            queryId,
          },
        });
      }

      // Execute
      const connector = await this.connectorFactory.getConnector(dataSourceId);
      this.cancellationRegistry.register(queryId, connector, dataSourceId);

      const execStart = performance.now();
      const queryResult = await connector.executeQuery(sql, params);
      const executionTimeMs = performance.now() - execStart;

      this.cancellationRegistry.unregister(queryId);

      const result: QueryResult = {
        ...queryResult,
        executionTimeMs,
      };

      // Cache
      await this.trySetCache(cacheKey, result);

      const totalTimeMs = performance.now() - totalStart;
      return ok({
        result,
        metadata: {
          cached: false,
          sql,
          params: params ?? [],
          generationTimeMs: 0,
          executionTimeMs,
          totalTimeMs,
          optimizations: [],
          warnings: [],
          queryId,
        },
      });
    } catch (error) {
      this.cancellationRegistry.unregister(queryId);
      return err(this.wrapError(error, QUERY_ENGINE_ERROR_CODES.EXECUTION_FAILED));
    }
  }

  /**
   * Execute a pre-built AbstractQuery against a data source.
   * Useful for programmatic query construction via QueryBuilder.
   */
  async executeAbstract(
    abstractQuery: AbstractQuery,
    dataSourceId: string,
  ): Promise<Result<ExecutionResult>> {
    const totalStart = performance.now();
    const queryId = this.nextQueryId();

    try {
      const dialect = await this.connectorFactory.getDialect(dataSourceId);
      let query = abstractQuery;
      let optimizations: string[] = [];

      // Optimize
      if (this.options.enableOptimization) {
        const optResult = this.optimizer.optimize(query);
        query = optResult.query;
        optimizations = optResult.appliedOptimizations;
      }

      // Generate SQL
      const genStart = performance.now();
      const generator = new SQLGenerator(dialect);
      const generated = generator.generate(query);
      const generationTimeMs = performance.now() - genStart;

      // Cache check
      const cacheKey = this.buildCacheKey(dataSourceId, generated);
      const cached = await this.tryGetCache<QueryResult>(cacheKey);

      if (cached) {
        const totalTimeMs = performance.now() - totalStart;
        return ok({
          result: cached,
          metadata: {
            cached: true,
            sql: generated.sql,
            params: generated.params,
            generationTimeMs,
            executionTimeMs: 0,
            totalTimeMs,
            optimizations,
            warnings: [],
            queryId,
          },
        });
      }

      // Execute
      const execResult = await this.executeGenerated(generated, dataSourceId, queryId);
      if (!execResult.ok) return execResult;

      const queryResult = execResult.value;
      const totalTimeMs = performance.now() - totalStart;

      await this.trySetCache(cacheKey, queryResult);

      return ok({
        result: queryResult,
        metadata: {
          cached: false,
          sql: generated.sql,
          params: generated.params,
          generationTimeMs,
          executionTimeMs: queryResult.executionTimeMs,
          totalTimeMs,
          optimizations,
          warnings: [],
          queryId,
        },
      });
    } catch (error) {
      return err(this.wrapError(error, QUERY_ENGINE_ERROR_CODES.EXECUTION_FAILED));
    }
  }

  /**
   * Cancel a running query by ID.
   */
  async cancelQuery(queryId: string): Promise<Result<void>> {
    try {
      await this.cancellationRegistry.cancel(queryId);
      return ok(undefined);
    } catch (error) {
      return err(this.wrapError(error, QUERY_ENGINE_ERROR_CODES.QUERY_CANCELLED));
    }
  }

  /**
   * Get the cancellation registry for external management.
   */
  getCancellationRegistry(): QueryCancellationRegistry {
    return this.cancellationRegistry;
  }

  // ── Private Helpers ───────────────────────────────────────────

  private async executeGenerated(
    generated: GeneratedSQL,
    dataSourceId: string,
    queryId: string,
  ): Promise<Result<QueryResult>> {
    try {
      const connector = await this.connectorFactory.getConnector(dataSourceId);
      this.cancellationRegistry.register(queryId, connector, dataSourceId);

      const execStart = performance.now();
      const result = await connector.executeQuery(generated.sql, generated.params);
      const executionTimeMs = performance.now() - execStart;

      this.cancellationRegistry.unregister(queryId);

      return ok({
        ...result,
        executionTimeMs,
      });
    } catch (error) {
      this.cancellationRegistry.unregister(queryId);
      return err(this.wrapError(error, QUERY_ENGINE_ERROR_CODES.EXECUTION_FAILED));
    }
  }

  private nextQueryId(): string {
    this.queryCounter++;
    return `qe-${Date.now()}-${this.queryCounter}`;
  }

  private buildCacheKey(dataSourceId: string, generated: GeneratedSQL): string {
    const content = `${dataSourceId}:${generated.sql}:${JSON.stringify(generated.params)}`;
    return `qe:${simpleHash(content)}`;
  }

  private buildRawCacheKey(dataSourceId: string, sql: string, params?: unknown[]): string {
    const content = `${dataSourceId}:${sql}:${JSON.stringify(params ?? [])}`;
    return `qe:raw:${simpleHash(content)}`;
  }

  private async tryGetCache<T>(key: string): Promise<T | null> {
    if (!this.cache || this.options.cacheTtlSeconds === 0) {
      return null;
    }
    try {
      const result = await this.cache.get<T>(key);
      return result ?? null;
    } catch {
      // Cache errors should not break query execution
      return null;
    }
  }

  private async trySetCache<T>(key: string, value: T): Promise<void> {
    if (!this.cache || this.options.cacheTtlSeconds === 0) {
      return;
    }
    try {
      await this.cache.set(key, value, this.options.cacheTtlSeconds);
    } catch {
      // Cache write failures are non-fatal
    }
  }

  private wrapError(error: unknown, code: string): MeridianError {
    if (error instanceof MeridianError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new MeridianError(message, code, 500, {
      originalError: error instanceof Error ? error.stack : undefined,
    });
  }
}

// ── Utility ─────────────────────────────────────────────────────────

/**
 * Simple string hash for cache keys.
 * Not cryptographic — just for deduplication.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Create a QueryExecutor with the given dependencies.
 */
export function createQueryExecutor(
  connectorFactory: ConnectorFactory,
  cache?: CacheProvider | null,
  options?: QueryExecutorOptions,
): QueryExecutor {
  return new QueryExecutor(connectorFactory, cache, options);
}
