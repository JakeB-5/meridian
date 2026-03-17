import type {
  Result,
  VisualQuery,
  QueryResult,
} from '@meridian/shared';

/** Options for query execution */
export interface QueryExecutionOptions {
  /** Maximum time to wait for query in ms */
  timeoutMs?: number;
  /** Maximum rows to return */
  maxRows?: number;
  /** Whether to use cached results if available */
  useCache?: boolean;
  /** Cache TTL in ms (if caching result) */
  cacheTtlMs?: number;
}

/** Query execution status tracking */
export interface QueryExecution {
  id: string;
  dataSourceId: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'error';
  query: VisualQuery | string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  rowCount?: number;
  executionTimeMs?: number;
}

/**
 * Service interface for query execution.
 * Handles running queries against data sources, with caching and cancellation.
 */
export interface QueryExecutionService {
  /** Execute a visual query against a data source */
  executeVisualQuery(
    dataSourceId: string,
    query: VisualQuery,
    options?: QueryExecutionOptions,
  ): Promise<Result<QueryResult>>;

  /** Execute raw SQL against a data source */
  executeRawSQL(
    dataSourceId: string,
    sql: string,
    params?: unknown[],
    options?: QueryExecutionOptions,
  ): Promise<Result<QueryResult>>;

  /** Cancel a running query */
  cancelQuery(queryId: string): Promise<Result<void>>;

  /** Get the status of a query execution */
  getExecutionStatus(queryId: string): Promise<Result<QueryExecution>>;

  /** List recent query executions for a user */
  listRecentExecutions(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<Result<QueryExecution[]>>;
}
