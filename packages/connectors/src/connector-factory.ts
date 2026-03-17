// ── Connector Factory ───────────────────────────────────────────────
// Factory function that creates the appropriate connector based on
// the data source configuration type.

import type { DataSourceConfig, Connector, ConnectorConfig, DatabaseType } from './types.js';
import type { BaseConnectorOptions } from './base-connector.js';
import type { Logger } from '@meridian/shared';

import { PostgreSQLConnector } from './connectors/postgresql.connector.js';
import { MySQLConnector } from './connectors/mysql.connector.js';
import { SQLiteConnector } from './connectors/sqlite.connector.js';
import { ClickHouseConnector } from './connectors/clickhouse.connector.js';
import { DuckDBConnector } from './connectors/duckdb.connector.js';
import { BigQueryConnector } from './connectors/bigquery.connector.js';
import { SnowflakeConnector } from './connectors/snowflake.connector.js';
import { ConnectorConfigError } from './errors.js';

// ── Factory Options ─────────────────────────────────────────────────

export interface CreateConnectorOptions {
  /** Data source configuration (required) */
  dataSource: DataSourceConfig;
  /** Optional extended connector configuration */
  connectorConfig?: Partial<ConnectorConfig>;
  /** Optional logger instance */
  logger?: Logger;
  /** Maximum rows to return from queries */
  maxRows?: number;
  /** Default query timeout in milliseconds */
  queryTimeoutMs?: number;
}

// ── Connector Registry ──────────────────────────────────────────────

type ConnectorConstructor = new (options: BaseConnectorOptions) => Connector;

/**
 * Registry mapping database types to their connector constructors.
 * Can be extended at runtime to support custom connectors (plugins).
 */
const connectorRegistry = new Map<DatabaseType, ConnectorConstructor>([
  ['postgresql', PostgreSQLConnector as unknown as ConnectorConstructor],
  ['mysql', MySQLConnector as unknown as ConnectorConstructor],
  ['sqlite', SQLiteConnector as unknown as ConnectorConstructor],
  ['clickhouse', ClickHouseConnector as unknown as ConnectorConstructor],
  ['duckdb', DuckDBConnector as unknown as ConnectorConstructor],
  ['bigquery', BigQueryConnector as unknown as ConnectorConstructor],
  ['snowflake', SnowflakeConnector as unknown as ConnectorConstructor],
]);

// ── Factory Function ────────────────────────────────────────────────

/**
 * Create a connector instance for the given data source configuration.
 *
 * @param options - Configuration for the connector
 * @returns A new Connector instance (not yet connected — call `.connect()` to establish)
 *
 * @example
 * ```ts
 * const connector = createConnector({
 *   dataSource: {
 *     id: 'ds-1',
 *     name: 'Production DB',
 *     type: 'postgresql',
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     username: 'user',
 *     password: 'pass',
 *   },
 * });
 *
 * await connector.connect();
 * const result = await connector.executeQuery('SELECT * FROM users LIMIT 10');
 * await connector.disconnect();
 * ```
 */
export function createConnector(options: CreateConnectorOptions): Connector {
  const { dataSource } = options;

  if (!dataSource) {
    throw new ConnectorConfigError('DataSource configuration is required');
  }

  if (!dataSource.type) {
    throw new ConnectorConfigError('DataSource type is required');
  }

  if (!dataSource.id) {
    throw new ConnectorConfigError('DataSource id is required');
  }

  const ConnectorClass = connectorRegistry.get(dataSource.type);

  if (!ConnectorClass) {
    throw new ConnectorConfigError(
      `Unsupported database type: '${dataSource.type}'. Supported types: ${getSupportedTypes().join(', ')}`,
      dataSource.type,
    );
  }

  const connectorOptions: BaseConnectorOptions = {
    dataSource,
    connectorConfig: options.connectorConfig,
    logger: options.logger,
    maxRows: options.maxRows,
    queryTimeoutMs: options.queryTimeoutMs,
  };

  return new ConnectorClass(connectorOptions);
}

// ── Convenience: Create and Connect ─────────────────────────────────

/**
 * Create a connector and immediately establish a connection.
 *
 * @param options - Configuration for the connector
 * @returns A connected Connector instance
 */
export async function createAndConnect(options: CreateConnectorOptions): Promise<Connector> {
  const connector = createConnector(options);
  await connector.connect();
  return connector;
}

// ── Registry Management ─────────────────────────────────────────────

/**
 * Register a custom connector constructor for a database type.
 * This allows plugins to add support for new database types at runtime.
 *
 * @param type - The database type identifier
 * @param constructor - The connector constructor class
 */
export function registerConnector(type: DatabaseType, constructor: ConnectorConstructor): void {
  connectorRegistry.set(type, constructor);
}

/**
 * Unregister a connector constructor for a database type.
 *
 * @param type - The database type to unregister
 * @returns true if the connector was registered and has been removed
 */
export function unregisterConnector(type: DatabaseType): boolean {
  return connectorRegistry.delete(type);
}

/**
 * Check if a connector is registered for a given database type.
 *
 * @param type - The database type to check
 */
export function isConnectorRegistered(type: DatabaseType): boolean {
  return connectorRegistry.has(type);
}

/**
 * Get the list of supported database types.
 */
export function getSupportedTypes(): DatabaseType[] {
  return Array.from(connectorRegistry.keys());
}

/**
 * Get a connector constructor for a specific database type.
 * Useful for checking capabilities before creating instances.
 *
 * @param type - The database type
 * @returns The constructor or undefined if not registered
 */
export function getConnectorConstructor(type: DatabaseType): ConnectorConstructor | undefined {
  return connectorRegistry.get(type);
}
