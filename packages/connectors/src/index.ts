// ── @meridian/connectors ────────────────────────────────────────────
// Database connector package for the Meridian BI platform.
// Provides unified access to PostgreSQL, MySQL, SQLite, ClickHouse,
// DuckDB, BigQuery (stub), and Snowflake (stub).

// ── Types ───────────────────────────────────────────────────────────
export type {
  // Core types re-exported from @meridian/shared
  DatabaseType,
  DataSourceConfig,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  ColumnInfo,
  QueryResult,
  // Connector-specific types
  Connector,
  ConnectorConfig,
  SslConfig,
  QueryExecutionContext,
  PoolStats,
  PoolConfig,
  ConnectorEventType,
  ConnectorEventListener,
  ConnectorEvent,
  ConnectorErrorCode,
  IdentifierQuoteStyle,
  SqlDialectConfig,
} from './types.js';

export {
  DEFAULT_POOL_CONFIG,
  DEFAULT_PORTS,
  CONNECTOR_ERROR_CODES,
  SQL_DIALECT_CONFIGS,
} from './types.js';

// ── Errors ──────────────────────────────────────────────────────────
export {
  ConnectorError,
  ConnectorConnectionError,
  ConnectorConnectionTimeoutError,
  ConnectorQueryError,
  ConnectorQueryTimeoutError,
  ConnectorQueryCancelledError,
  ConnectorSchemaError,
  ConnectorNotConnectedError,
  ConnectorAlreadyConnectedError,
  ConnectorNotImplementedError,
  ConnectorConfigError,
  ConnectorPoolExhaustedError,
  ConnectorPoolTimeoutError,
  normalizeConnectorError,
} from './errors.js';

// ── Base Connector ──────────────────────────────────────────────────
export { BaseConnector, generateQueryId } from './base-connector.js';
export type { BaseConnectorOptions } from './base-connector.js';

// ── Concrete Connectors ─────────────────────────────────────────────
export { PostgreSQLConnector } from './connectors/postgresql.connector.js';
export { MySQLConnector } from './connectors/mysql.connector.js';
export { SQLiteConnector } from './connectors/sqlite.connector.js';
export { ClickHouseConnector } from './connectors/clickhouse.connector.js';
export { DuckDBConnector } from './connectors/duckdb.connector.js';
export { BigQueryConnector } from './connectors/bigquery.connector.js';
export type { BigQueryConfig } from './connectors/bigquery.connector.js';
export { SnowflakeConnector } from './connectors/snowflake.connector.js';
export type { SnowflakeConfig } from './connectors/snowflake.connector.js';

// ── Factory ─────────────────────────────────────────────────────────
export {
  createConnector,
  createAndConnect,
  registerConnector,
  unregisterConnector,
  isConnectorRegistered,
  getSupportedTypes,
  getConnectorConstructor,
} from './connector-factory.js';
export type { CreateConnectorOptions } from './connector-factory.js';

// ── Connection Pool ─────────────────────────────────────────────────
export {
  ConnectionPoolManager,
  getDefaultPool,
  shutdownDefaultPool,
} from './connection-pool.js';
export type { ConnectionPoolManagerOptions } from './connection-pool.js';
