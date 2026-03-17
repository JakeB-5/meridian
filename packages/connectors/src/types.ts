// ── Connector Types ─────────────────────────────────────────────────
// Core interfaces and types for database connectors.

import type {
  DatabaseType,
  DataSourceConfig,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  ColumnInfo,
  QueryResult,
} from '@meridian/shared';

// ── Re-exports from shared ──────────────────────────────────────────
export type {
  DatabaseType,
  DataSourceConfig,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  ColumnInfo,
  QueryResult,
};

// ── Connector Configuration ─────────────────────────────────────────

/** Extended connector configuration with connection pool settings */
export interface ConnectorConfig {
  /** Hostname or IP address of the database server */
  host: string;
  /** Port number */
  port: number;
  /** Database / catalog name */
  database: string;
  /** Username for authentication */
  username: string;
  /** Password for authentication */
  password: string;
  /** SSL configuration — true for default SSL, or an object for custom settings */
  ssl?: boolean | SslConfig;
  /** Maximum number of connections in the pool */
  maxConnections?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
  /** Idle timeout for connections in milliseconds */
  idleTimeout?: number;
  /** Additional driver-specific options */
  driverOptions?: Record<string, unknown>;
}

/** SSL configuration for database connections */
export interface SslConfig {
  /** Reject unauthorized certificates */
  rejectUnauthorized?: boolean;
  /** CA certificate (PEM encoded) */
  ca?: string;
  /** Client certificate (PEM encoded) */
  cert?: string;
  /** Client private key (PEM encoded) */
  key?: string;
}

// ── Connector Interface ─────────────────────────────────────────────

/**
 * Core interface that all database connectors must implement.
 * Provides connection management, schema introspection, and query execution.
 */
export interface Connector {
  /** The type of database this connector targets */
  readonly type: DatabaseType;

  /** Unique identifier for this connector instance (usually the datasource ID) */
  readonly id: string;

  /** Human-readable name of this connector */
  readonly name: string;

  // ── Lifecycle ───────────────────────────────────────────────

  /** Establish a connection (or pool) to the database */
  connect(): Promise<void>;

  /** Gracefully close all connections */
  disconnect(): Promise<void>;

  /** Check whether the connector currently has an active connection */
  isConnected(): boolean;

  /** Test the connection and return latency information */
  testConnection(): Promise<ConnectionTestResult>;

  // ── Schema Introspection ────────────────────────────────────

  /** List available schemas/databases */
  getSchemas(): Promise<SchemaInfo[]>;

  /** List tables and views, optionally filtered by schema */
  getTables(schema?: string): Promise<TableInfo[]>;

  /** Get column metadata for a specific table */
  getColumns(table: string, schema?: string): Promise<TableColumnInfo[]>;

  // ── Query Execution ─────────────────────────────────────────

  /**
   * Execute a SQL query and return structured results.
   * Results are automatically truncated to MAX_QUERY_ROWS.
   */
  executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Cancel a running query by its identifier.
   * Not all connectors support this — unsupported ones should resolve silently.
   */
  cancelQuery(queryId: string): Promise<void>;

  // ── Metadata ────────────────────────────────────────────────

  /** Get the database server version string */
  getVersion(): Promise<string>;
}

// ── Query Execution Context ─────────────────────────────────────────

/** Context passed to query execution for tracking and cancellation */
export interface QueryExecutionContext {
  /** Unique query identifier for cancellation */
  queryId: string;
  /** Maximum time allowed for the query in milliseconds */
  timeoutMs: number;
  /** Maximum number of rows to return */
  maxRows: number;
  /** Signal for cooperative cancellation */
  abortSignal?: AbortSignal;
}

// ── Connection Pool Types ───────────────────────────────────────────

/** Statistics about a connection pool */
export interface PoolStats {
  /** Total number of connections (active + idle) */
  totalConnections: number;
  /** Number of connections currently in use */
  activeConnections: number;
  /** Number of idle connections */
  idleConnections: number;
  /** Number of requests waiting for a connection */
  waitingRequests: number;
}

/** Connection pool configuration */
export interface PoolConfig {
  /** Minimum number of idle connections to maintain */
  minConnections?: number;
  /** Maximum number of connections in the pool */
  maxConnections?: number;
  /** Time in ms a connection can be idle before being destroyed */
  idleTimeoutMs?: number;
  /** Time in ms to wait for a connection from the pool */
  acquireTimeoutMs?: number;
  /** Interval in ms between health checks */
  healthCheckIntervalMs?: number;
  /** Maximum lifetime of a connection in ms */
  maxLifetimeMs?: number;
}

/** Default pool configuration values */
export const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  minConnections: 1,
  maxConnections: 10,
  idleTimeoutMs: 30_000,
  acquireTimeoutMs: 10_000,
  healthCheckIntervalMs: 60_000,
  maxLifetimeMs: 1_800_000, // 30 minutes
};

// ── Connector Events ────────────────────────────────────────────────

/** Events emitted by connectors */
export type ConnectorEventType =
  | 'connect'
  | 'disconnect'
  | 'error'
  | 'query:start'
  | 'query:end'
  | 'query:cancel'
  | 'query:timeout'
  | 'pool:acquire'
  | 'pool:release'
  | 'pool:error';

/** Base event payload */
export interface ConnectorEvent {
  type: ConnectorEventType;
  connectorId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/** Listener function for connector events */
export type ConnectorEventListener = (event: ConnectorEvent) => void;

// ── Error Types ─────────────────────────────────────────────────────

/** Connector-specific error codes */
export const CONNECTOR_ERROR_CODES = {
  CONNECTION_FAILED: 'CONNECTOR_CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTOR_CONNECTION_TIMEOUT',
  QUERY_FAILED: 'CONNECTOR_QUERY_FAILED',
  QUERY_TIMEOUT: 'CONNECTOR_QUERY_TIMEOUT',
  QUERY_CANCELLED: 'CONNECTOR_QUERY_CANCELLED',
  SCHEMA_FETCH_FAILED: 'CONNECTOR_SCHEMA_FETCH_FAILED',
  NOT_CONNECTED: 'CONNECTOR_NOT_CONNECTED',
  ALREADY_CONNECTED: 'CONNECTOR_ALREADY_CONNECTED',
  NOT_IMPLEMENTED: 'CONNECTOR_NOT_IMPLEMENTED',
  INVALID_CONFIG: 'CONNECTOR_INVALID_CONFIG',
  POOL_EXHAUSTED: 'CONNECTOR_POOL_EXHAUSTED',
  POOL_TIMEOUT: 'CONNECTOR_POOL_TIMEOUT',
  DRIVER_ERROR: 'CONNECTOR_DRIVER_ERROR',
} as const;

export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[keyof typeof CONNECTOR_ERROR_CODES];

// ── Database Default Ports ──────────────────────────────────────────

/** Default port numbers for each database type */
export const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: 0,
  clickhouse: 8123,
  bigquery: 443,
  snowflake: 443,
  duckdb: 0,
};

// ── SQL Dialect Helpers ─────────────────────────────────────────────

/** Quote identifier styles for different SQL dialects */
export type IdentifierQuoteStyle = 'double' | 'backtick' | 'bracket' | 'none';

/** Configuration for SQL dialect differences */
export interface SqlDialectConfig {
  /** How to quote identifiers (table/column names) */
  identifierQuoteStyle: IdentifierQuoteStyle;
  /** Parameter placeholder style ('$1', '?', ':name') */
  parameterStyle: 'dollar' | 'question' | 'named' | 'at';
  /** Whether the database supports LIMIT/OFFSET syntax */
  supportsLimitOffset: boolean;
  /** Whether the database supports RETURNING clause */
  supportsReturning: boolean;
  /** Whether the database supports CTEs (WITH clause) */
  supportsCTE: boolean;
  /** Whether the database supports window functions */
  supportsWindowFunctions: boolean;
  /** Information schema table name for introspection */
  informationSchemaTable: string;
  /** String concatenation operator */
  concatOperator: string;
  /** Schema separator character */
  schemaSeparator: string;
}

/** SQL dialect configurations for each supported database */
export const SQL_DIALECT_CONFIGS: Record<DatabaseType, SqlDialectConfig> = {
  postgresql: {
    identifierQuoteStyle: 'double',
    parameterStyle: 'dollar',
    supportsLimitOffset: true,
    supportsReturning: true,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'information_schema',
    concatOperator: '||',
    schemaSeparator: '.',
  },
  mysql: {
    identifierQuoteStyle: 'backtick',
    parameterStyle: 'question',
    supportsLimitOffset: true,
    supportsReturning: false,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'information_schema',
    concatOperator: 'CONCAT',
    schemaSeparator: '.',
  },
  sqlite: {
    identifierQuoteStyle: 'double',
    parameterStyle: 'question',
    supportsLimitOffset: true,
    supportsReturning: true,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'sqlite_master',
    concatOperator: '||',
    schemaSeparator: '.',
  },
  clickhouse: {
    identifierQuoteStyle: 'backtick',
    parameterStyle: 'named',
    supportsLimitOffset: true,
    supportsReturning: false,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'system.tables',
    concatOperator: 'concat',
    schemaSeparator: '.',
  },
  duckdb: {
    identifierQuoteStyle: 'double',
    parameterStyle: 'dollar',
    supportsLimitOffset: true,
    supportsReturning: true,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'information_schema',
    concatOperator: '||',
    schemaSeparator: '.',
  },
  bigquery: {
    identifierQuoteStyle: 'backtick',
    parameterStyle: 'at',
    supportsLimitOffset: true,
    supportsReturning: false,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'INFORMATION_SCHEMA',
    concatOperator: 'CONCAT',
    schemaSeparator: '.',
  },
  snowflake: {
    identifierQuoteStyle: 'double',
    parameterStyle: 'question',
    supportsLimitOffset: true,
    supportsReturning: false,
    supportsCTE: true,
    supportsWindowFunctions: true,
    informationSchemaTable: 'INFORMATION_SCHEMA',
    concatOperator: '||',
    schemaSeparator: '.',
  },
};
