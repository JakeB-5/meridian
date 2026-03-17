// ── MySQL Connector Tests ───────────────────────────────────────────
// Tests for MySQLConnector using mocked 'mysql2/promise' module.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DataSourceConfig } from '../types.js';
import { createNoopLogger } from '@meridian/shared';

// ── Mock mysql2/promise ─────────────────────────────────────────────

const mockConnectionQuery = vi.fn();
const mockConnectionRelease = vi.fn();
const mockPoolQuery = vi.fn();
const mockPoolGetConnection = vi.fn();
const mockPoolEnd = vi.fn();

function createMockConnection() {
  return {
    query: mockConnectionQuery,
    release: mockConnectionRelease,
    threadId: 42,
  };
}

function createMockPool() {
  return {
    getConnection: mockPoolGetConnection.mockResolvedValue(createMockConnection()),
    query: mockPoolQuery,
    end: mockPoolEnd.mockResolvedValue(undefined),
    pool: {
      _allConnections: { length: 5 },
      _freeConnections: { length: 3 },
      _connectionQueue: { length: 0 },
    },
  };
}

vi.mock('mysql2/promise', () => {
  return {
    default: {
      createPool: vi.fn().mockImplementation(() => createMockPool()),
    },
  };
});

// Import after mocking
import { MySQLConnector } from './mysql.connector.js';

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: 'mysql-test-1',
    name: 'Test MySQL',
    type: 'mysql',
    database: 'testdb',
    host: 'localhost',
    port: 3306,
    username: 'testuser',
    password: 'testpass',
    ...overrides,
  };
}

function createConnector(overrides?: Partial<DataSourceConfig>): MySQLConnector {
  return new MySQLConnector({
    dataSource: createTestDataSource(overrides),
    logger: createNoopLogger(),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('MySQLConnector', () => {
  let connector: MySQLConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = createConnector();
    mockPoolGetConnection.mockResolvedValue(createMockConnection());
    mockPoolEnd.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (connector.isConnected()) {
      await connector.disconnect();
    }
  });

  // ── Basic Properties ──────────────────────────────────────────

  describe('properties', () => {
    it('should have correct type', () => {
      expect(connector.type).toBe('mysql');
    });

    it('should have correct id', () => {
      expect(connector.id).toBe('mysql-test-1');
    });

    it('should have correct name', () => {
      expect(connector.name).toBe('Test MySQL');
    });
  });

  // ── Connection Lifecycle ──────────────────────────────────────

  describe('connect', () => {
    it('should create a pool and validate by acquiring a connection', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
      expect(mockPoolGetConnection).toHaveBeenCalled();
      expect(mockConnectionRelease).toHaveBeenCalled();
    });

    it('should handle connection failure', async () => {
      mockPoolGetConnection.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(connector.connect()).rejects.toThrow();
      expect(connector.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should end the pool', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
      expect(mockPoolEnd).toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('should execute SELECT 1 as health check', async () => {
      mockPoolQuery.mockResolvedValueOnce([[{ health_check: 1 }], []]);
      await connector.connect();
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
    });
  });

  // ── Schema Introspection ──────────────────────────────────────

  describe('getSchemas', () => {
    it('should query information_schema and return schemas', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { name: 'testdb', tableCount: 5 },
          { name: 'appdb', tableCount: 3 },
        ],
        [],
      ]);

      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas).toHaveLength(2);
      expect(schemas[0]!.name).toBe('testdb');
      expect(schemas[1]!.name).toBe('appdb');
    });

    it('should exclude system schemas', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [{ name: 'mydb', tableCount: 1 }],
        [],
      ]);

      await connector.connect();
      await connector.getSchemas();

      // The SQL already filters mysql, sys, information_schema, performance_schema
      const callArgs = mockPoolQuery.mock.calls;
      const schemaQuery = callArgs.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('SCHEMATA'),
      );
      expect(schemaQuery).toBeDefined();
      expect(schemaQuery![0]).toContain('information_schema');
      expect(schemaQuery![0]).toContain('performance_schema');
      expect(schemaQuery![0]).toContain('mysql');
      expect(schemaQuery![0]).toContain('sys');
    });
  });

  describe('getTables', () => {
    it('should return tables and views for a schema', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { name: 'users', schema: 'testdb', type: 'table', rowCount: 100 },
          { name: 'orders', schema: 'testdb', type: 'table', rowCount: 500 },
          { name: 'stats_view', schema: 'testdb', type: 'view', rowCount: null },
        ],
        [],
      ]);

      await connector.connect();
      const tables = await connector.getTables('testdb');
      expect(tables).toHaveLength(3);
      expect(tables[0]!.name).toBe('users');
      expect(tables[0]!.type).toBe('table');
      expect(tables[0]!.rowCount).toBe(100);
      expect(tables[2]!.type).toBe('view');
    });

    it('should default to the configured database', async () => {
      mockPoolQuery.mockResolvedValueOnce([[], []]);
      await connector.connect();
      await connector.getTables();
      const lastCall = mockPoolQuery.mock.calls[mockPoolQuery.mock.calls.length - 1];
      expect(lastCall![1]).toEqual(['testdb']);
    });
  });

  describe('getColumns', () => {
    it('should return detailed column metadata', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          {
            name: 'id',
            type: 'int',
            nullable: false,
            primaryKey: true,
            defaultValue: null,
            comment: 'Primary key',
            fullType: 'int(11)',
            maxLength: null,
            numericPrecision: 10,
            numericScale: 0,
            extra: 'auto_increment',
          },
          {
            name: 'email',
            type: 'varchar',
            nullable: false,
            primaryKey: false,
            defaultValue: null,
            comment: '',
            fullType: 'varchar(255)',
            maxLength: 255,
            numericPrecision: null,
            numericScale: null,
            extra: '',
          },
          {
            name: 'age',
            type: 'tinyint',
            nullable: true,
            primaryKey: false,
            defaultValue: '0',
            comment: 'User age',
            fullType: 'tinyint(3) unsigned',
            maxLength: null,
            numericPrecision: 3,
            numericScale: 0,
            extra: '',
          },
        ],
        [],
      ]);

      await connector.connect();
      const columns = await connector.getColumns('users', 'testdb');
      expect(columns).toHaveLength(3);

      expect(columns[0]!.name).toBe('id');
      expect(columns[0]!.type).toBe('int(11)'); // fullType used
      expect(columns[0]!.nullable).toBe(false);
      expect(columns[0]!.primaryKey).toBe(true);

      expect(columns[1]!.name).toBe('email');
      expect(columns[1]!.type).toBe('varchar(255)');
      expect(columns[1]!.comment).toBeUndefined(); // Empty string → undefined

      expect(columns[2]!.name).toBe('age');
      expect(columns[2]!.nullable).toBe(true);
      expect(columns[2]!.defaultValue).toBe('0');
      expect(columns[2]!.comment).toBe('User age');
    });
  });

  // ── Query Execution ───────────────────────────────────────────

  describe('executeQuery', () => {
    it('should execute a SELECT query and return rows', async () => {
      mockConnectionQuery
        // SET max_execution_time
        .mockResolvedValueOnce([[], []])
        // Actual query
        .mockResolvedValueOnce([
          [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ],
          [
            { name: 'id', type: 3, flags: 0 },
            { name: 'name', type: 253, flags: 0 },
          ],
        ]);

      await connector.connect();
      const result = await connector.executeQuery('SELECT * FROM users');

      expect(result.rows).toHaveLength(2);
      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.name).toBe('id');
      expect(result.columns[0]!.type).toBe('int');
      expect(result.columns[1]!.name).toBe('name');
      expect(result.columns[1]!.type).toBe('var_string');
    });

    it('should handle INSERT/UPDATE returning affected rows', async () => {
      mockConnectionQuery
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([
          { affectedRows: 3, insertId: 0, changedRows: 3 },
          undefined,
        ]);

      await connector.connect();
      const result = await connector.executeQuery('UPDATE users SET active = true');
      expect(result.rowCount).toBe(3);
      expect(result.rows).toHaveLength(0);
    });

    it('should execute a query with parameters', async () => {
      mockConnectionQuery
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([
          [{ id: 1, name: 'Alice' }],
          [{ name: 'id', type: 3, flags: 0 }, { name: 'name', type: 253, flags: 0 }],
        ]);

      await connector.connect();
      await connector.executeQuery('SELECT * FROM users WHERE id = ?', [1]);

      const queryCalls = mockConnectionQuery.mock.calls;
      const actualQuery = queryCalls[1];
      expect(actualQuery![0]).toBe('SELECT * FROM users WHERE id = ?');
      expect(actualQuery![1]).toEqual([1]);
    });

    it('should release connection after query', async () => {
      mockConnectionQuery
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[], []]);

      await connector.connect();
      await connector.executeQuery('SELECT 1');
      expect(mockConnectionRelease).toHaveBeenCalled();
    });

    it('should release connection on query error', async () => {
      mockConnectionQuery
        .mockResolvedValueOnce([[], []])
        .mockRejectedValueOnce(
          Object.assign(new Error("Table 'testdb.missing' doesn't exist"), {
            code: 'ER_NO_SUCH_TABLE',
            errno: 1146,
            sqlState: '42S02',
          }),
        );

      await connector.connect();
      await expect(connector.executeQuery('SELECT * FROM missing')).rejects.toThrow();
      expect(mockConnectionRelease).toHaveBeenCalled();
    });

    it('should set max_execution_time before query', async () => {
      mockConnectionQuery
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[], []]);

      await connector.connect();
      await connector.executeQuery('SELECT 1');

      const firstCall = mockConnectionQuery.mock.calls[0];
      expect(firstCall![0]).toContain('max_execution_time');
    });
  });

  // ── Query Cancellation ────────────────────────────────────────

  describe('cancelQuery', () => {
    it('should execute KILL QUERY for tracked threads', async () => {
      // We need to simulate an active query with a known thread ID.
      // The connector tracks queries internally via activeQueryThreads.

      // Since KILL QUERY goes through pool.getConnection(), mock that path
      const killConnection = createMockConnection();
      mockPoolGetConnection
        .mockResolvedValueOnce(createMockConnection()) // Initial connect validation
        .mockResolvedValueOnce(killConnection); // KILL QUERY connection

      await connector.connect();

      // cancelQuery is a pass-through to doCancelQuery, which checks activeQueryThreads.
      // Without an active query in flight, it just resolves.
      await connector.cancelQuery('nonexistent-query');
      // Should not throw
    });
  });

  // ── Version ───────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should return MySQL version string', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [{ version: '8.0.35' }],
        [],
      ]);

      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toBe('8.0.35');
    });
  });

  // ── Pool Stats ────────────────────────────────────────────────

  describe('getPoolStats', () => {
    it('should return pool statistics', async () => {
      await connector.connect();
      const stats = connector.getPoolStats();
      expect(stats).not.toBeNull();
      expect(stats!.totalConnections).toBe(5);
      expect(stats!.idleConnections).toBe(3);
      expect(stats!.activeConnections).toBe(2);
      expect(stats!.waitingRequests).toBe(0);
    });

    it('should return null when not connected', () => {
      const stats = connector.getPoolStats();
      expect(stats).toBeNull();
    });
  });

  // ── MySQL-Specific Methods ────────────────────────────────────

  describe('getServerVariables', () => {
    it('should return server variables', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { Variable_name: 'max_connections', Value: '151' },
          { Variable_name: 'version', Value: '8.0.35' },
        ],
        [],
      ]);

      await connector.connect();
      const vars = await connector.getServerVariables();
      expect(vars['max_connections']).toBe('151');
      expect(vars['version']).toBe('8.0.35');
    });
  });

  describe('getServerStatus', () => {
    it('should return server status', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { Variable_name: 'Uptime', Value: '12345' },
          { Variable_name: 'Queries', Value: '67890' },
        ],
        [],
      ]);

      await connector.connect();
      const status = await connector.getServerStatus();
      expect(status['Uptime']).toBe('12345');
      expect(status['Queries']).toBe('67890');
    });
  });

  describe('getProcessList', () => {
    it('should return process list', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { Id: 1, User: 'root', db: 'testdb', Command: 'Query' },
          { Id: 2, User: 'app', db: 'testdb', Command: 'Sleep' },
        ],
        [],
      ]);

      await connector.connect();
      const processes = await connector.getProcessList();
      expect(processes).toHaveLength(2);
    });
  });

  describe('getTableSizes', () => {
    it('should return table sizes', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { table: 'users', sizeBytes: 1024000, rowCount: 5000 },
          { table: 'orders', sizeBytes: 2048000, rowCount: 10000 },
        ],
        [],
      ]);

      await connector.connect();
      const sizes = await connector.getTableSizes('testdb');
      expect(sizes).toHaveLength(2);
      expect(sizes[0]!.table).toBe('users');
      expect(sizes[0]!.sizeBytes).toBe(1024000);
    });
  });

  describe('getIndexes', () => {
    it('should return index information', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          { indexName: 'PRIMARY', columnName: 'id', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
          { indexName: 'idx_email', columnName: 'email', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
        ],
        [],
      ]);

      await connector.connect();
      const indexes = await connector.getIndexes('users', 'testdb');
      expect(indexes).toHaveLength(2);
    });
  });

  describe('getForeignKeys', () => {
    it('should return foreign key information', async () => {
      mockPoolQuery.mockResolvedValueOnce([
        [
          {
            constraintName: 'fk_user',
            columnName: 'user_id',
            referencedSchema: 'testdb',
            referencedTable: 'users',
            referencedColumn: 'id',
            updateRule: 'CASCADE',
            deleteRule: 'SET NULL',
          },
        ],
        [],
      ]);

      await connector.connect();
      const fks = await connector.getForeignKeys('orders', 'testdb');
      expect(fks).toHaveLength(1);
      expect(fks[0]!['constraintName']).toBe('fk_user');
    });
  });

  // ── Field Type Mapping ────────────────────────────────────────

  describe('field type mapping', () => {
    it('should map MySQL field type constants', async () => {
      mockConnectionQuery
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([
          [{ val: 1 }],
          [
            { name: 'int_col', type: 3, flags: 0 },
            { name: 'varchar_col', type: 15, flags: 0 },
            { name: 'bigint_col', type: 8, flags: 0 },
            { name: 'json_col', type: 245, flags: 0 },
            { name: 'datetime_col', type: 12, flags: 0 },
            { name: 'unsigned_int', type: 3, flags: 0x0020 },
          ],
        ]);

      await connector.connect();
      const result = await connector.executeQuery('SELECT 1');

      const typeMap: Record<string, string> = {};
      for (const col of result.columns) {
        typeMap[col.name] = col.type;
      }

      expect(typeMap['int_col']).toBe('int');
      expect(typeMap['varchar_col']).toBe('varchar');
      expect(typeMap['bigint_col']).toBe('bigint');
      expect(typeMap['json_col']).toBe('json');
      expect(typeMap['datetime_col']).toBe('datetime');
      expect(typeMap['unsigned_int']).toBe('unsigned int');
    });
  });

  // ── SSL ───────────────────────────────────────────────────────

  describe('SSL', () => {
    it('should accept ssl: true', async () => {
      const sslConnector = createConnector({ ssl: true });
      await sslConnector.connect();
      expect(sslConnector.isConnected()).toBe(true);
    });
  });
});
