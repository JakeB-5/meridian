// ── Query Cancellation Registry ─────────────────────────────────────
// Tracks running queries and provides cancellation + timeout enforcement.

import type { Connector } from '@meridian/connectors';

// ── Running Query Entry ─────────────────────────────────────────────

export interface RunningQuery {
  /** Unique query identifier */
  queryId: string;
  /** The connector executing this query */
  connector: Connector;
  /** Data source identifier */
  dataSourceId: string;
  /** When the query started */
  startedAt: number;
  /** Timeout timer handle (if timeout is set) */
  timeoutHandle?: ReturnType<typeof setTimeout>;
  /** Whether cancellation has been requested */
  cancelRequested: boolean;
}

// ── Registry Options ────────────────────────────────────────────────

export interface CancellationRegistryOptions {
  /** Default timeout in milliseconds for queries. 0 = no timeout. */
  defaultTimeoutMs?: number;
  /** Callback invoked when a query times out */
  onTimeout?: (queryId: string, elapsedMs: number) => void;
  /** Callback invoked when a query is cancelled */
  onCancel?: (queryId: string) => void;
}

// ── Registry ────────────────────────────────────────────────────────

/**
 * Registry for tracking and cancelling running queries.
 *
 * Features:
 * - Register/unregister running queries
 * - Cancel individual queries via connector.cancelQuery()
 * - Automatic timeout enforcement
 * - Cancel all queries for a data source
 * - Cancel all queries globally
 */
export class QueryCancellationRegistry {
  private readonly queries = new Map<string, RunningQuery>();
  private readonly options: CancellationRegistryOptions;

  constructor(options: CancellationRegistryOptions = {}) {
    this.options = options;
  }

  /**
   * Register a running query for tracking.
   */
  register(
    queryId: string,
    connector: Connector,
    dataSourceId: string,
    timeoutMs?: number,
  ): void {
    const entry: RunningQuery = {
      queryId,
      connector,
      dataSourceId,
      startedAt: Date.now(),
      cancelRequested: false,
    };

    // Set up timeout if configured
    const timeout = timeoutMs ?? this.options.defaultTimeoutMs;
    if (timeout && timeout > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.handleTimeout(queryId);
      }, timeout);
    }

    this.queries.set(queryId, entry);
  }

  /**
   * Unregister a query (e.g. when it completes normally).
   */
  unregister(queryId: string): void {
    const entry = this.queries.get(queryId);
    if (entry) {
      if (entry.timeoutHandle) {
        clearTimeout(entry.timeoutHandle);
      }
      this.queries.delete(queryId);
    }
  }

  /**
   * Cancel a specific running query.
   */
  async cancel(queryId: string): Promise<boolean> {
    const entry = this.queries.get(queryId);
    if (!entry) {
      return false; // Query not found (already completed or never registered)
    }

    entry.cancelRequested = true;

    try {
      await entry.connector.cancelQuery(queryId);
    } catch {
      // Best-effort cancellation; connector may not support it
    }

    if (entry.timeoutHandle) {
      clearTimeout(entry.timeoutHandle);
    }

    this.queries.delete(queryId);
    this.options.onCancel?.(queryId);

    return true;
  }

  /**
   * Cancel all running queries for a specific data source.
   */
  async cancelByDataSource(dataSourceId: string): Promise<number> {
    let cancelled = 0;
    const promises: Promise<boolean>[] = [];

    for (const [queryId, entry] of this.queries) {
      if (entry.dataSourceId === dataSourceId) {
        promises.push(this.cancel(queryId));
        cancelled++;
      }
    }

    await Promise.allSettled(promises);
    return cancelled;
  }

  /**
   * Cancel ALL running queries.
   */
  async cancelAll(): Promise<number> {
    const queryIds = Array.from(this.queries.keys());
    const promises = queryIds.map((id) => this.cancel(id));
    await Promise.allSettled(promises);
    return queryIds.length;
  }

  /**
   * Get information about a running query.
   */
  getRunningQuery(queryId: string): RunningQuery | undefined {
    return this.queries.get(queryId);
  }

  /**
   * Get all running queries.
   */
  getRunningQueries(): RunningQuery[] {
    return Array.from(this.queries.values());
  }

  /**
   * Get running queries for a specific data source.
   */
  getRunningQueriesForDataSource(dataSourceId: string): RunningQuery[] {
    return Array.from(this.queries.values()).filter(
      (q) => q.dataSourceId === dataSourceId,
    );
  }

  /**
   * Check if a specific query is still running.
   */
  isRunning(queryId: string): boolean {
    return this.queries.has(queryId);
  }

  /**
   * Get the number of currently running queries.
   */
  get size(): number {
    return this.queries.size;
  }

  /**
   * Get the elapsed time for a running query in milliseconds.
   */
  getElapsedMs(queryId: string): number | undefined {
    const entry = this.queries.get(queryId);
    if (!entry) return undefined;
    return Date.now() - entry.startedAt;
  }

  /**
   * Clean up: cancel all queries and clear the registry.
   */
  async dispose(): Promise<void> {
    await this.cancelAll();
    this.queries.clear();
  }

  // ── Private ───────────────────────────────────────────────────

  private handleTimeout(queryId: string): void {
    const entry = this.queries.get(queryId);
    if (!entry) return;

    const elapsed = Date.now() - entry.startedAt;
    this.options.onTimeout?.(queryId, elapsed);

    // Attempt to cancel the timed-out query
    this.cancel(queryId).catch(() => {
      // Swallow errors from timeout cancellation
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Create a cancellation registry with the given options.
 */
export function createCancellationRegistry(
  options?: CancellationRegistryOptions,
): QueryCancellationRegistry {
  return new QueryCancellationRegistry(options);
}
