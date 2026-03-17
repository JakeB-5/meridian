// ── DuckDB Connector Tests ─────────────────────────────────────────
// Mock-based tests for the DuckDB connector covering connection
// lifecycle, schema introspection, query execution, and file import.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseConnectorOptions } from '../base-connector.js';
import type { DataSourceConfig } from '../types.js';

// ── Mock duckdb ────────────────────────────────────────────────────

const mockAll = vi.fn();
const mockConnect = vi.fn();
const mockDbClose = vi.fn();

vi.mock('duckdb', () => {
  const OPEN_READONLY = 1;
  const OPEN_READWRITE = 2;
  const OPEN_CREATE = 4;

  class MockConnection {
    all = mockAll;
  }

  class MockDatabase {
    constructor(_path: string, _mode: number, callback: (err: Error | null) => void) {
      mockConnect();
      setTimeout(() => callback(null), 0);
    }
    connect() {
      return new MockConnection();
    }
    close(callback: (err: Error | null) => void) {
      mockDbClose();
      callback(null);
    }
  }

  return {
    default: {
      Database: MockDatabase,
      OPEN_READONLY,
      OPEN_READWRITE,
      OPEN_CREATE,
    },
  };
});

const { DuckDBConnector } = await import('./duckdb.connector.js');
const { createNoopLogger } = await import('@meridian/shared');

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: 'duck-test-1',
    name: 'Test DuckDB',
    type: 'duckdb',
    database: ':memory:',
    ...overrides,
  };
}

function createConnector(overrides?: Partial<BaseConnectorOptions>) {
  return new DuckDBConnector({
    dataSource: overrides?.dataSource ?? createTestDataSource(),
    connectorConfig: overrides?.connectorConfig,
    logger: overrides?.logger ?? createNoopLogger(),
    maxRows: overrides?.maxRows,
    queryTimeoutMs: overrides?.queryTimeoutMs,
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('DuckDBConnector', () => {
  let connector: InstanceType<typeof DuckDBConnector>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rawQuery for settings returns empty
    mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
      const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
      if (typeof callback === 'function') {
        callback(null, []);
      }
    });
    connector = createConnector();
  });

  afterEach(async () => {
    if (connector.isConnected()) {
      await connector.disconnect();
    }
  });

  // ── Constructor ─────────────────────────────────────────────────

  describe('constructor', () => {
    it('should set type to duckdb', () => {
      expect(connector.type).toBe('duckdb');
    });

    it('should set id from dataSource', () => {
      expect(connector.id).toBe('duck-test-1');
    });

    it('should set name from dataSource', () => {
      expect(connector.name).toBe('Test DuckDB');
    });
  });

  // ── Connection Lifecycle ────────────────────────────────────────

  describe('connect', () => {
    it('should open in-memory database', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('should throw on double connect', async () => {
      await connector.connect();
      await expect(connector.connect()).rejects.toThrow();
    });

    it('should use :memory: when database is empty', async () => {
      const emptyDb = createConnector({
        dataSource: createTestDataSource({ database: '' }),
      });
      await emptyDb.connect();
      expect(emptyDb.isConnected()).toBe(true);
      await emptyDb.disconnect();
    });
  });

  describe('disconnect', () => {
    it('should close database and clear state', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
      expect(mockDbClose).toHaveBeenCalledOnce();
    });

    it('should silently ignore when not connected', async () => {
      await expect(connector.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should return success when health check passes', async () => {
      await connector.connect();
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
    });
  });

  // ── Schema Introspection ────────────────────────────────────────

  describe('getSchemas', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getSchemas()).rejects.toThrow();
    });

    it('should return schemas from information_schema', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('information_schema')) {
          callback(null, [
            { name: 'main', tableCount: 3 },
            { name: 'temp', tableCount: 1 },
          ]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas.length).toBeGreaterThanOrEqual(1);
    });

    it('should return default main schema when none found', async () => {
      mockAll.mockImplementation((_sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        callback(null, []);
      });
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas).toHaveLength(1);
      expect(schemas[0]!.name).toBe('main');
    });
  });

  describe('getTables', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getTables()).rejects.toThrow();
    });

    it('should return tables with type info', async () => {
      let callNum = 0;
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        callNum++;
        if (sql.includes('information_schema.tables')) {
          callback(null, [
            { name: 'users', schema: 'main', type: 'table' },
            { name: 'user_view', schema: 'main', type: 'view' },
          ]);
        } else if (sql.includes('COUNT(*)')) {
          callback(null, [{ cnt: 100 }]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const tables = await connector.getTables('main');
      expect(tables.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getColumns', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getColumns('users')).rejects.toThrow();
    });

    it('should return column metadata with primary key detection', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('information_schema.columns')) {
          callback(null, [
            { name: 'id', type: 'BIGINT', nullable: false, defaultValue: null, ordinal_position: 1 },
            { name: 'name', type: 'VARCHAR', nullable: true, defaultValue: null, ordinal_position: 2 },
          ]);
        } else if (sql.includes('PRIMARY KEY')) {
          callback(null, [{ column_name: 'id' }]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const columns = await connector.getColumns('users', 'main');
      expect(columns).toHaveLength(2);
      expect(columns[0]!.name).toBe('id');
      expect(columns[0]!.primaryKey).toBe(true);
      expect(columns[1]!.primaryKey).toBe(false);
    });
  });

  // ── Query Execution ─────────────────────────────────────────────

  describe('executeQuery', () => {
    it('should throw if not connected', async () => {
      await expect(connector.executeQuery('SELECT 1')).rejects.toThrow();
    });

    it('should execute a query and return results', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('SELECT')) {
          callback(null, [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const result = await connector.executeQuery('SELECT id, name FROM users');
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
    });

    it('should handle query errors', async () => {
      mockAll.mockImplementation((_sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        callback(new Error('Table not found'), []);
      });
      await connector.connect();
      await expect(connector.executeQuery('SELECT * FROM missing')).rejects.toThrow();
    });

    it('should handle empty result set', async () => {
      mockAll.mockImplementation((_sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        callback(null, []);
      });
      await connector.connect();
      const result = await connector.executeQuery('SELECT 1 WHERE false');
      expect(result.rows).toHaveLength(0);
      expect(result.columns).toHaveLength(0);
    });

    it('should infer column types from result values', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('SELECT')) {
          callback(null, [
            { count: 42, ratio: 0.5, name: 'test', active: true, empty: null },
          ]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const result = await connector.executeQuery('SELECT count, ratio, name, active, empty FROM t');
      const typeMap = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
      expect(typeMap['count']).toBe('BIGINT');
      expect(typeMap['ratio']).toBe('DOUBLE');
      expect(typeMap['name']).toBe('VARCHAR');
      expect(typeMap['active']).toBe('BOOLEAN');
      expect(typeMap['empty']).toBe('VARCHAR');
    });
  });

  // ── Metadata ────────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getVersion()).rejects.toThrow();
    });

    it('should return version string', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('version()')) {
          callback(null, [{ version: 'v0.10.0' }]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toBe('v0.10.0');
    });
  });

  // ── DuckDB-Specific Methods ─────────────────────────────────────

  describe('readParquet', () => {
    it('should create a view from parquet file', async () => {
      await connector.connect();
      await expect(connector.readParquet('/data/file.parquet', 'my_view')).resolves.toBeUndefined();
    });
  });

  describe('readCSV', () => {
    it('should create a view from CSV file', async () => {
      await connector.connect();
      await expect(connector.readCSV('/data/file.csv', 'csv_view')).resolves.toBeUndefined();
    });

    it('should pass CSV options', async () => {
      await connector.connect();
      await expect(
        connector.readCSV('/data/file.csv', 'csv_view', {
          delimiter: '|',
          header: true,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('readJSON', () => {
    it('should create a view from JSON file', async () => {
      await connector.connect();
      await expect(connector.readJSON('/data/file.json', 'json_view')).resolves.toBeUndefined();
    });
  });

  describe('exportToParquet', () => {
    it('should export query to parquet file', async () => {
      await connector.connect();
      await expect(connector.exportToParquet('SELECT 1', '/out.parquet')).resolves.toBeUndefined();
    });
  });

  describe('exportToCSV', () => {
    it('should export query to CSV file', async () => {
      await connector.connect();
      await expect(connector.exportToCSV('SELECT 1', '/out.csv')).resolves.toBeUndefined();
    });

    it('should pass CSV options', async () => {
      await connector.connect();
      await expect(
        connector.exportToCSV('SELECT 1', '/out.csv', { delimiter: '|', header: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe('installExtension', () => {
    it('should install and load an extension', async () => {
      await connector.connect();
      await expect(connector.installExtension('httpfs')).resolves.toBeUndefined();
    });
  });

  describe('getExtensions', () => {
    it('should return installed extensions', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('duckdb_extensions')) {
          callback(null, [
            { name: 'httpfs', loaded: true, installed: true },
            { name: 'json', loaded: false, installed: true },
          ]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const extensions = await connector.getExtensions();
      expect(extensions).toHaveLength(2);
      expect(extensions[0]!.name).toBe('httpfs');
      expect(extensions[0]!.loaded).toBe(true);
    });
  });

  describe('getSettings', () => {
    it('should return settings', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('duckdb_settings')) {
          callback(null, [{ name: 'threads', value: '4' }]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const settings = await connector.getSettings();
      expect(settings).toHaveLength(1);
    });
  });

  describe('setSetting', () => {
    it('should set a DuckDB setting', async () => {
      await connector.connect();
      await expect(connector.setSetting('threads', 4)).resolves.toBeUndefined();
    });
  });

  describe('describeQuery', () => {
    it('should describe a query without executing', async () => {
      mockAll.mockImplementation((sql: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: Error | null, result: unknown[]) => void;
        if (sql.includes('DESCRIBE')) {
          callback(null, [
            { column_name: 'id', column_type: 'BIGINT', null: 'NO' },
            { column_name: 'name', column_type: 'VARCHAR', null: 'YES' },
          ]);
        } else {
          callback(null, []);
        }
      });
      await connector.connect();
      const columns = await connector.describeQuery('SELECT id, name FROM users');
      expect(columns).toHaveLength(2);
      expect(columns[0]!.name).toBe('id');
      expect(columns[0]!.type).toBe('BIGINT');
      expect(columns[0]!.nullable).toBe(false);
      expect(columns[1]!.nullable).toBe(true);
    });
  });

  // ── Pool Stats ──────────────────────────────────────────────────

  describe('getPoolStats', () => {
    it('should return null (DuckDB is in-process)', () => {
      expect(connector.getPoolStats()).toBeNull();
    });
  });
});
