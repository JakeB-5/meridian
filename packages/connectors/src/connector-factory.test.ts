// ── Connector Factory Tests ─────────────────────────────────────────
// Tests for the createConnector factory function, registry management,
// and connector type resolution.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DataSourceConfig, Connector, DatabaseType } from './types.js';
import {
  createConnector,
  getSupportedTypes,
  isConnectorRegistered,
  registerConnector,
  unregisterConnector,
  getConnectorConstructor,
} from './connector-factory.js';
import { PostgreSQLConnector } from './connectors/postgresql.connector.js';
import { MySQLConnector } from './connectors/mysql.connector.js';
import { SQLiteConnector } from './connectors/sqlite.connector.js';
import { ClickHouseConnector } from './connectors/clickhouse.connector.js';
import { DuckDBConnector } from './connectors/duckdb.connector.js';
import { BigQueryConnector } from './connectors/bigquery.connector.js';
import { SnowflakeConnector } from './connectors/snowflake.connector.js';
import { BaseConnector } from './base-connector.js';
import type { BaseConnectorOptions } from './base-connector.js';
import type {
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  QueryExecutionContext,
} from './types.js';
import { ConnectorConfigError } from './errors.js';
import { createNoopLogger } from '@meridian/shared';

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(type: DatabaseType, overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: `test-${type}-1`,
    name: `Test ${type}`,
    type,
    database: type === 'sqlite' ? ':memory:' : 'testdb',
    host: 'localhost',
    username: 'user',
    password: 'pass',
    ...overrides,
  };
}

// ── Custom Test Connector for Registry Tests ────────────────────────

class CustomTestConnector extends BaseConnector {
  protected async doConnect(): Promise<void> {}
  protected async doDisconnect(): Promise<void> {}
  protected async doTestConnection(): Promise<void> {}
  protected async doGetSchemas(): Promise<SchemaInfo[]> { return []; }
  protected async doGetTables(): Promise<TableInfo[]> { return []; }
  protected async doGetColumns(): Promise<TableColumnInfo[]> { return []; }
  protected async doExecuteQuery(
    _sql: string,
    _params: unknown[] | undefined,
    _ctx: QueryExecutionContext,
  ): Promise<QueryResult> {
    return { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, truncated: false };
  }
  protected async doGetVersion(): Promise<string> { return 'custom 1.0'; }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Connector Factory', () => {
  // ── createConnector ───────────────────────────────────────────

  describe('createConnector', () => {
    it('should create a PostgreSQLConnector for postgresql type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('postgresql'),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(PostgreSQLConnector);
      expect(connector.type).toBe('postgresql');
    });

    it('should create a MySQLConnector for mysql type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('mysql'),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(MySQLConnector);
      expect(connector.type).toBe('mysql');
    });

    it('should create a SQLiteConnector for sqlite type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite'),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(SQLiteConnector);
      expect(connector.type).toBe('sqlite');
    });

    it('should create a ClickHouseConnector for clickhouse type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('clickhouse'),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(ClickHouseConnector);
      expect(connector.type).toBe('clickhouse');
    });

    it('should create a DuckDBConnector for duckdb type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('duckdb', { database: ':memory:' }),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(DuckDBConnector);
      expect(connector.type).toBe('duckdb');
    });

    it('should create a BigQueryConnector for bigquery type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('bigquery', {
          options: { projectId: 'my-project' },
        }),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(BigQueryConnector);
      expect(connector.type).toBe('bigquery');
    });

    it('should create a SnowflakeConnector for snowflake type', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('snowflake', {
          options: { account: 'xy12345.us-east-1' },
        }),
        logger: createNoopLogger(),
      });
      expect(connector).toBeInstanceOf(SnowflakeConnector);
      expect(connector.type).toBe('snowflake');
    });

    it('should throw for unsupported database type', () => {
      expect(() =>
        createConnector({
          dataSource: createTestDataSource('mongodb' as DatabaseType),
          logger: createNoopLogger(),
        }),
      ).toThrow(ConnectorConfigError);
    });

    it('should throw when dataSource is undefined', () => {
      expect(() =>
        createConnector({
          dataSource: undefined as unknown as DataSourceConfig,
        }),
      ).toThrow(ConnectorConfigError);
    });

    it('should throw when dataSource.type is missing', () => {
      expect(() =>
        createConnector({
          dataSource: { id: 'test', name: 'test', database: 'db' } as DataSourceConfig,
        }),
      ).toThrow(ConnectorConfigError);
    });

    it('should throw when dataSource.id is missing', () => {
      expect(() =>
        createConnector({
          dataSource: { type: 'postgresql', name: 'test', database: 'db' } as DataSourceConfig,
        }),
      ).toThrow(ConnectorConfigError);
    });

    it('should pass connectorConfig to the connector', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite'),
        connectorConfig: { maxConnections: 20 },
        logger: createNoopLogger(),
      });

      // Access internal state to verify
      expect((connector as unknown as { connectorConfig: { maxConnections: number } }).connectorConfig.maxConnections).toBe(20);
    });

    it('should pass maxRows to the connector', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite'),
        maxRows: 500,
        logger: createNoopLogger(),
      });

      expect((connector as unknown as { maxRows: number }).maxRows).toBe(500);
    });

    it('should pass queryTimeoutMs to the connector', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite'),
        queryTimeoutMs: 5000,
        logger: createNoopLogger(),
      });

      expect((connector as unknown as { queryTimeoutMs: number }).queryTimeoutMs).toBe(5000);
    });

    it('should set connector id from dataSource id', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite', { id: 'my-custom-id' }),
        logger: createNoopLogger(),
      });
      expect(connector.id).toBe('my-custom-id');
    });

    it('should set connector name from dataSource name', () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite', { name: 'My Custom Name' }),
        logger: createNoopLogger(),
      });
      expect(connector.name).toBe('My Custom Name');
    });
  });

  // ── createConnector with SQLite (real :memory:) ───────────────

  describe('createConnector with SQLite :memory:', () => {
    it('should create a working SQLite connector', async () => {
      const connector = createConnector({
        dataSource: createTestDataSource('sqlite'),
        logger: createNoopLogger(),
      });

      await connector.connect();
      expect(connector.isConnected()).toBe(true);

      const result = await connector.executeQuery('SELECT 1 + 1 AS sum');
      expect(result.rows[0]!['sum']).toBe(2);

      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
    });
  });

  // ── getSupportedTypes ─────────────────────────────────────────

  describe('getSupportedTypes', () => {
    it('should return all built-in types', () => {
      const types = getSupportedTypes();
      expect(types).toContain('postgresql');
      expect(types).toContain('mysql');
      expect(types).toContain('sqlite');
      expect(types).toContain('clickhouse');
      expect(types).toContain('duckdb');
      expect(types).toContain('bigquery');
      expect(types).toContain('snowflake');
    });

    it('should return at least 7 types', () => {
      expect(getSupportedTypes().length).toBeGreaterThanOrEqual(7);
    });
  });

  // ── isConnectorRegistered ─────────────────────────────────────

  describe('isConnectorRegistered', () => {
    it('should return true for registered types', () => {
      expect(isConnectorRegistered('postgresql')).toBe(true);
      expect(isConnectorRegistered('mysql')).toBe(true);
      expect(isConnectorRegistered('sqlite')).toBe(true);
    });

    it('should return false for unregistered types', () => {
      expect(isConnectorRegistered('mongodb' as DatabaseType)).toBe(false);
    });
  });

  // ── getConnectorConstructor ───────────────────────────────────

  describe('getConnectorConstructor', () => {
    it('should return a constructor for registered types', () => {
      const ctor = getConnectorConstructor('postgresql');
      expect(ctor).toBeDefined();
    });

    it('should return undefined for unregistered types', () => {
      const ctor = getConnectorConstructor('mongodb' as DatabaseType);
      expect(ctor).toBeUndefined();
    });
  });

  // ── Registry Management ───────────────────────────────────────

  describe('registerConnector / unregisterConnector', () => {
    const customType = 'custom_test_db' as DatabaseType;

    afterEach(() => {
      // Clean up
      unregisterConnector(customType);
    });

    it('should register a custom connector', () => {
      registerConnector(customType, CustomTestConnector as unknown as new (options: BaseConnectorOptions) => Connector);
      expect(isConnectorRegistered(customType)).toBe(true);
    });

    it('should allow creating instances of custom connectors', () => {
      registerConnector(customType, CustomTestConnector as unknown as new (options: BaseConnectorOptions) => Connector);

      const connector = createConnector({
        dataSource: {
          id: 'custom-1',
          name: 'Custom DB',
          type: customType,
          database: 'test',
        },
        logger: createNoopLogger(),
      });

      expect(connector).toBeInstanceOf(CustomTestConnector);
    });

    it('should unregister a connector', () => {
      registerConnector(customType, CustomTestConnector as unknown as new (options: BaseConnectorOptions) => Connector);
      const removed = unregisterConnector(customType);
      expect(removed).toBe(true);
      expect(isConnectorRegistered(customType)).toBe(false);
    });

    it('should return false when unregistering non-existent type', () => {
      const removed = unregisterConnector('nonexistent' as DatabaseType);
      expect(removed).toBe(false);
    });

    it('should override an existing registration', () => {
      registerConnector(customType, CustomTestConnector as unknown as new (options: BaseConnectorOptions) => Connector);

      // Re-register with the same type
      registerConnector(customType, CustomTestConnector as unknown as new (options: BaseConnectorOptions) => Connector);
      expect(isConnectorRegistered(customType)).toBe(true);
    });

    it('should include custom types in getSupportedTypes', () => {
      registerConnector(customType, CustomTestConnector as unknown as new (options: BaseConnectorOptions) => Connector);
      expect(getSupportedTypes()).toContain(customType);
    });
  });

  // ── Error Message Quality ─────────────────────────────────────

  describe('error messages', () => {
    it('should include supported types in error for unsupported type', () => {
      try {
        createConnector({
          dataSource: createTestDataSource('redis' as DatabaseType),
          logger: createNoopLogger(),
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('redis');
        expect((error as Error).message).toContain('postgresql');
        expect((error as Error).message).toContain('mysql');
      }
    });

    it('should have a clear message when dataSource is missing', () => {
      try {
        createConnector({
          dataSource: undefined as unknown as DataSourceConfig,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });
  });

  // ── Connector Not Connected ───────────────────────────────────

  describe('connectors are created disconnected', () => {
    it('should not be connected after creation', () => {
      const types: DatabaseType[] = ['postgresql', 'mysql', 'sqlite', 'clickhouse', 'duckdb', 'bigquery', 'snowflake'];

      for (const type of types) {
        const connector = createConnector({
          dataSource: createTestDataSource(type, {
            database: type === 'sqlite' || type === 'duckdb' ? ':memory:' : 'testdb',
          }),
          logger: createNoopLogger(),
        });
        expect(connector.isConnected()).toBe(false);
      }
    });
  });
});
