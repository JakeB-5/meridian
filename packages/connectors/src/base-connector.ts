// ── Base Connector ──────────────────────────────────────────────────
// Abstract base class providing common connector functionality:
// - Connection lifecycle management (connect/disconnect guards)
// - Query timeout enforcement
// - Result row limit (MAX_QUERY_ROWS)
// - Error normalization
// - Event emission
// - Logging

import {
  MAX_QUERY_ROWS,
  DEFAULT_QUERY_TIMEOUT_MS,
  MAX_QUERY_TIMEOUT_MS,
} from '@meridian/shared';
import type { Logger } from '@meridian/shared';
import { createLogger, createNoopLogger } from '@meridian/shared';

import type {
  Connector,
  ConnectorConfig,
  ConnectorEventType,
  ConnectorEventListener,
  ConnectorEvent,
  DatabaseType,
  DataSourceConfig,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  QueryExecutionContext,
  PoolStats,
} from './types.js';

import {
  ConnectorNotConnectedError,
  ConnectorAlreadyConnectedError,
  ConnectorQueryTimeoutError,
  ConnectorConnectionTimeoutError,
  normalizeConnectorError,
} from './errors.js';

// ── Helper: Generate query IDs ──────────────────────────────────────

let queryIdCounter = 0;

export function generateQueryId(): string {
  queryIdCounter += 1;
  return `q_${Date.now()}_${queryIdCounter}`;
}

// ── Abstract Base Connector ─────────────────────────────────────────

export interface BaseConnectorOptions {
  /** Data source configuration from the shared layer */
  dataSource: DataSourceConfig;
  /** Optional extended connector configuration */
  connectorConfig?: Partial<ConnectorConfig>;
  /** Logger instance — if not provided, a default one is created */
  logger?: Logger;
  /** Maximum rows to return from queries. Defaults to MAX_QUERY_ROWS */
  maxRows?: number;
  /** Default query timeout in ms. Defaults to DEFAULT_QUERY_TIMEOUT_MS */
  queryTimeoutMs?: number;
}

/**
 * Abstract base connector that implements common patterns for all database connectors.
 *
 * Subclasses must implement:
 * - `doConnect()`: Establish the actual connection/pool
 * - `doDisconnect()`: Close the actual connection/pool
 * - `doExecuteQuery()`: Execute a query against the database
 * - `doTestConnection()`: Perform a lightweight connectivity check
 * - `doGetSchemas()`: Fetch schema list from the database
 * - `doGetTables()`: Fetch table list from the database
 * - `doGetColumns()`: Fetch column metadata from the database
 * - `doGetVersion()`: Fetch the database server version
 * - `doCancelQuery()`: Cancel a running query (optional, default no-op)
 */
export abstract class BaseConnector implements Connector {
  public readonly type: DatabaseType;
  public readonly id: string;
  public readonly name: string;

  protected readonly config: DataSourceConfig;
  protected readonly connectorConfig: Partial<ConnectorConfig>;
  protected readonly logger: Logger;
  protected readonly maxRows: number;
  protected readonly queryTimeoutMs: number;

  private _connected: boolean = false;
  private _connecting: boolean = false;
  private _disconnecting: boolean = false;
  private readonly _eventListeners: Map<ConnectorEventType, Set<ConnectorEventListener>> = new Map();
  private readonly _activeQueries: Map<string, AbortController> = new Map();

  constructor(options: BaseConnectorOptions) {
    this.config = options.dataSource;
    this.type = options.dataSource.type;
    this.id = options.dataSource.id;
    this.name = options.dataSource.name;
    this.connectorConfig = options.connectorConfig ?? {};
    this.logger = options.logger ?? createLogger(`connector:${this.type}:${this.id}`, { level: 'info' });
    this.maxRows = options.maxRows ?? MAX_QUERY_ROWS;
    this.queryTimeoutMs = Math.min(
      options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
      MAX_QUERY_TIMEOUT_MS,
    );
  }

  // ── Public API — Lifecycle ──────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) {
      throw new ConnectorAlreadyConnectedError(this.type);
    }
    if (this._connecting) {
      throw new ConnectorAlreadyConnectedError(this.type, {
        reason: 'Connection is already in progress',
      });
    }

    this._connecting = true;
    const startTime = Date.now();

    try {
      const timeoutMs = this.connectorConfig.connectionTimeout ?? 10_000;

      await Promise.race([
        this.doConnect(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new ConnectorConnectionTimeoutError(timeoutMs, { connectorType: this.type })),
            timeoutMs,
          );
        }),
      ]);

      this._connected = true;
      const elapsed = Date.now() - startTime;
      this.logger.info('Connected successfully', { elapsed, type: this.type, id: this.id });
      this.emit('connect', { elapsed });
    } catch (error) {
      this.logger.error('Connection failed', {
        type: this.type,
        id: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw normalizeConnectorError(error, this.type, 'connect');
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected) {
      // Silently ignore if not connected
      return;
    }
    if (this._disconnecting) {
      return;
    }

    this._disconnecting = true;

    try {
      // Cancel all active queries
      await this.cancelAllActiveQueries();

      await this.doDisconnect();
      this._connected = false;
      this.logger.info('Disconnected', { type: this.type, id: this.id });
      this.emit('disconnect');
    } catch (error) {
      this.logger.error('Disconnect failed', {
        type: this.type,
        id: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Force disconnected state even on error
      this._connected = false;
      throw normalizeConnectorError(error, this.type, 'disconnect');
    } finally {
      this._disconnecting = false;
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      const wasConnected = this._connected;

      if (!wasConnected) {
        await this.connect();
      }

      await this.doTestConnection();
      const latencyMs = Date.now() - startTime;

      if (!wasConnected) {
        await this.disconnect();
      }

      return {
        success: true,
        message: `Successfully connected to ${this.type} database`,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Connection test failed: ${message}`,
        latencyMs,
      };
    }
  }

  // ── Public API — Schema Introspection ───────────────────────

  async getSchemas(): Promise<SchemaInfo[]> {
    this.ensureConnected();
    try {
      return await this.doGetSchemas();
    } catch (error) {
      this.logger.error('Schema fetch failed', {
        type: this.type,
        id: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw normalizeConnectorError(error, this.type, 'getSchemas');
    }
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    this.ensureConnected();
    try {
      return await this.doGetTables(schema);
    } catch (error) {
      this.logger.error('Table fetch failed', {
        type: this.type,
        id: this.id,
        schema,
        error: error instanceof Error ? error.message : String(error),
      });
      throw normalizeConnectorError(error, this.type, 'getTables');
    }
  }

  async getColumns(table: string, schema?: string): Promise<TableColumnInfo[]> {
    this.ensureConnected();
    try {
      return await this.doGetColumns(table, schema);
    } catch (error) {
      this.logger.error('Column fetch failed', {
        type: this.type,
        id: this.id,
        table,
        schema,
        error: error instanceof Error ? error.message : String(error),
      });
      throw normalizeConnectorError(error, this.type, 'getColumns');
    }
  }

  // ── Public API — Query Execution ────────────────────────────

  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.ensureConnected();

    const queryId = generateQueryId();
    const abortController = new AbortController();
    this._activeQueries.set(queryId, abortController);

    const context: QueryExecutionContext = {
      queryId,
      timeoutMs: this.queryTimeoutMs,
      maxRows: this.maxRows,
      abortSignal: abortController.signal,
    };

    const startTime = Date.now();
    this.emit('query:start', { queryId, sql: sql.substring(0, 200) });
    this.logger.debug('Executing query', { queryId, sqlPreview: sql.substring(0, 100) });

    try {
      const result = await Promise.race([
        this.doExecuteQuery(sql, params, context),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            abortController.abort();
            reject(
              new ConnectorQueryTimeoutError(context.timeoutMs, {
                connectorType: this.type,
                sql: sql.substring(0, 200),
              }),
            );
          }, context.timeoutMs);

          // Clean up timer if the query finishes first
          abortController.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
        }),
      ]);

      // Enforce row limit
      const truncated = result.rows.length > this.maxRows;
      const rows = truncated ? result.rows.slice(0, this.maxRows) : result.rows;
      const executionTimeMs = Date.now() - startTime;

      const finalResult: QueryResult = {
        ...result,
        rows,
        // For mutation queries (INSERT/UPDATE/DELETE), rows is empty and rowCount
        // reflects affectedRows from the connector. For SELECT, use rows.length.
        rowCount: rows.length > 0 ? rows.length : result.rowCount,
        executionTimeMs,
        truncated: truncated || result.truncated,
      };

      this.emit('query:end', { queryId, rowCount: finalResult.rowCount, executionTimeMs });
      this.logger.debug('Query completed', {
        queryId,
        rowCount: finalResult.rowCount,
        executionTimeMs,
        truncated: finalResult.truncated,
      });

      return finalResult;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      if (abortController.signal.aborted) {
        this.emit('query:cancel', { queryId, executionTimeMs });
      } else {
        this.emit('query:end', { queryId, executionTimeMs, error: true });
      }

      this.logger.error('Query failed', {
        queryId,
        executionTimeMs,
        error: error instanceof Error ? error.message : String(error),
      });

      throw normalizeConnectorError(error, this.type, 'executeQuery');
    } finally {
      this._activeQueries.delete(queryId);
    }
  }

  async cancelQuery(queryId: string): Promise<void> {
    const controller = this._activeQueries.get(queryId);
    if (controller) {
      controller.abort();
      this._activeQueries.delete(queryId);
    }

    try {
      await this.doCancelQuery(queryId);
      this.emit('query:cancel', { queryId });
      this.logger.info('Query cancelled', { queryId });
    } catch (error) {
      this.logger.warn('Query cancellation failed', {
        queryId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw on cancellation failure — best effort
    }
  }

  // ── Public API — Metadata ───────────────────────────────────

  async getVersion(): Promise<string> {
    this.ensureConnected();
    try {
      return await this.doGetVersion();
    } catch (error) {
      this.logger.error('Version fetch failed', {
        type: this.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw normalizeConnectorError(error, this.type, 'getVersion');
    }
  }

  // ── Event System ────────────────────────────────────────────

  on(event: ConnectorEventType, listener: ConnectorEventListener): void {
    let listeners = this._eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this._eventListeners.set(event, listeners);
    }
    listeners.add(listener);
  }

  off(event: ConnectorEventType, listener: ConnectorEventListener): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  protected emit(type: ConnectorEventType, data?: Record<string, unknown>): void {
    const event: ConnectorEvent = {
      type,
      connectorId: this.id,
      timestamp: new Date(),
      data,
    };

    const listeners = this._eventListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          this.logger.warn('Event listener error', {
            eventType: type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // ── Pool Stats (optional override) ─────────────────────────

  getPoolStats(): PoolStats | null {
    return null;
  }

  // ── Protected Helpers ───────────────────────────────────────

  protected ensureConnected(): void {
    if (!this._connected) {
      throw new ConnectorNotConnectedError(this.type);
    }
  }

  protected getActiveQueryCount(): number {
    return this._activeQueries.size;
  }

  protected getHost(): string {
    return this.config.host ?? this.connectorConfig.host ?? 'localhost';
  }

  protected getPort(defaultPort: number): number {
    return this.config.port ?? this.connectorConfig.port ?? defaultPort;
  }

  protected getDatabase(): string {
    return this.config.database ?? this.connectorConfig.database ?? '';
  }

  protected getUsername(): string {
    return this.config.username ?? this.connectorConfig.username ?? '';
  }

  protected getPassword(): string {
    return this.config.password ?? this.connectorConfig.password ?? '';
  }

  protected getSsl(): boolean | object | undefined {
    return this.config.ssl ?? this.connectorConfig.ssl;
  }

  protected getMaxConnections(): number {
    return this.connectorConfig.maxConnections ?? 10;
  }

  protected getConnectionTimeout(): number {
    return this.connectorConfig.connectionTimeout ?? 10_000;
  }

  protected getDriverOptions(): Record<string, unknown> {
    return {
      ...this.connectorConfig.driverOptions,
      ...this.config.options,
    };
  }

  // ── Private Helpers ─────────────────────────────────────────

  private async cancelAllActiveQueries(): Promise<void> {
    const queryIds = Array.from(this._activeQueries.keys());
    for (const queryId of queryIds) {
      const controller = this._activeQueries.get(queryId);
      if (controller) {
        controller.abort();
      }
    }
    this._activeQueries.clear();
  }

  // ── Abstract Methods — Subclass Must Implement ──────────────

  /** Establish the actual database connection or pool */
  protected abstract doConnect(): Promise<void>;

  /** Close the actual database connection or pool */
  protected abstract doDisconnect(): Promise<void>;

  /** Execute a query against the database. Timeout/cancellation is handled by the base class. */
  protected abstract doExecuteQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): Promise<QueryResult>;

  /** Perform a lightweight connectivity check (e.g., SELECT 1) */
  protected abstract doTestConnection(): Promise<void>;

  /** Fetch available schemas from the database */
  protected abstract doGetSchemas(): Promise<SchemaInfo[]>;

  /** Fetch tables/views from the database, optionally filtered by schema */
  protected abstract doGetTables(schema?: string): Promise<TableInfo[]>;

  /** Fetch column metadata for a specific table */
  protected abstract doGetColumns(table: string, schema?: string): Promise<TableColumnInfo[]>;

  /** Fetch the database server version string */
  protected abstract doGetVersion(): Promise<string>;

  /** Cancel a running query. Default implementation is a no-op. */
  protected async doCancelQuery(_queryId: string): Promise<void> {
    // No-op by default. Subclasses can override.
  }
}

// ── Noop Logger Factory ─────────────────────────────────────────────
// Re-export for convenience in tests
export { createNoopLogger };
