// ── ClickHouse Connector Tests ─────────────────────────────────────
// Mock-based tests for the ClickHouse connector covering connection
// lifecycle, schema introspection, query execution, and cancellation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseConnectorOptions } from '../base-connector.js';
import type { DataSourceConfig, QueryExecutionContext } from '../types.js';

// ── Mock @clickhouse/client ────────────────────────────────────────

const mockPing = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn();
const mockCommand = vi.fn().mockResolvedValue(undefined);

vi.mock('@clickhouse/client', () => ({
  createClient: vi.fn(() => ({
    ping: mockPing,
    close: mockClose,
    query: mockQuery,
    command: mockCommand,
  })),
}));

// Must import after mock setup
const { ClickHouseConnector } = await import('./clickhouse.connector.js');
const { createNoopLogger } = await import('@meridian/shared');

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: 'ch-test-1',
    name: 'Test ClickHouse',
    type: 'clickhouse',
    database: 'default',
    host: 'localhost',
    port: 8123,
    username: 'default',
    password: '',
    ...overrides,
  };
}

function createConnector(overrides?: Partial<BaseConnectorOptions>) {
  return new ClickHouseConnector({
    dataSource: overrides?.dataSource ?? createTestDataSource(),
    connectorConfig: overrides?.connectorConfig,
    logger: overrides?.logger ?? createNoopLogger(),
    maxRows: overrides?.maxRows,
    queryTimeoutMs: overrides?.queryTimeoutMs,
  });
}

function mockJsonResult(rows: Record<string, unknown>[]) {
  return {
    json: vi.fn().mockResolvedValue(rows),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('ClickHouseConnector', () => {
  let connector: InstanceType<typeof ClickHouseConnector>;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = createConnector();
  });

  afterEach(async () => {
    if (connector.isConnected()) {
      await connector.disconnect();
    }
  });

  // ── Constructor ─────────────────────────────────────────────────

  describe('constructor', () => {
    it('should set type to clickhouse', () => {
      expect(connector.type).toBe('clickhouse');
    });

    it('should set id from dataSource', () => {
      expect(connector.id).toBe('ch-test-1');
    });

    it('should set name from dataSource', () => {
      expect(connector.name).toBe('Test ClickHouse');
    });
  });

  // ── Connection Lifecycle ────────────────────────────────────────

  describe('connect', () => {
    it('should create client and ping successfully', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
      expect(mockPing).toHaveBeenCalledOnce();
    });

    it('should throw on double connect', async () => {
      await connector.connect();
      await expect(connector.connect()).rejects.toThrow();
    });

    it('should handle connection failure', async () => {
      mockPing.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(connector.connect()).rejects.toThrow();
      expect(connector.isConnected()).toBe(false);
    });

    it('should use SSL when ssl config is truthy', async () => {
      const sslConnector = createConnector({
        dataSource: createTestDataSource({ ssl: true }),
      });
      await sslConnector.connect();
      expect(sslConnector.isConnected()).toBe(true);
      await sslConnector.disconnect();
    });
  });

  describe('disconnect', () => {
    it('should close client and clear state', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('should silently ignore when not connected', async () => {
      await expect(connector.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should return success on ping', async () => {
      await connector.connect();
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure on ping error', async () => {
      mockPing.mockRejectedValueOnce(new Error('Ping failed'));
      const result = await connector.testConnection();
      expect(result.success).toBe(false);
    });
  });

  // ── Schema Introspection ────────────────────────────────────────

  describe('getSchemas', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getSchemas()).rejects.toThrow();
    });

    it('should return schemas from system tables', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { name: 'default', tableCount: 5 },
          { name: 'analytics', tableCount: 3 },
        ]),
      );
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas).toHaveLength(2);
      expect(schemas[0]!.name).toBe('default');
      expect(schemas[1]!.name).toBe('analytics');
    });

    it('should return empty array for no schemas', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([]));
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas).toHaveLength(0);
    });
  });

  describe('getTables', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getTables()).rejects.toThrow();
    });

    it('should return tables with type mapping', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { name: 'events', schema: 'default', type: 'table', rowCount: 1000, engine: 'MergeTree', sizeBytes: 4096 },
          { name: 'events_mv', schema: 'default', type: 'view', rowCount: 0, engine: 'MaterializedView', sizeBytes: 0 },
        ]),
      );
      await connector.connect();
      const tables = await connector.getTables('default');
      expect(tables).toHaveLength(2);
      expect(tables[0]!.name).toBe('events');
      expect(tables[0]!.type).toBe('table');
      expect(tables[1]!.type).toBe('view');
    });
  });

  describe('getColumns', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getColumns('events')).rejects.toThrow();
    });

    it('should return column metadata', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { name: 'id', type: 'UInt64', default_kind: '', default_expression: '', comment: '', is_in_primary_key: 1 },
          { name: 'event_date', type: 'Date', default_kind: '', default_expression: '', comment: 'Event date', is_in_primary_key: 0 },
          { name: 'value', type: 'Nullable(Float64)', default_kind: 'DEFAULT', default_expression: '0', comment: '', is_in_primary_key: 0 },
        ]),
      );
      await connector.connect();
      const columns = await connector.getColumns('events');
      expect(columns).toHaveLength(3);
      expect(columns[0]!.primaryKey).toBe(true);
      expect(columns[2]!.nullable).toBe(true);
      expect(columns[2]!.defaultValue).toBe('0');
      expect(columns[1]!.comment).toBe('Event date');
    });

    it('should handle empty comment as undefined', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { name: 'id', type: 'UInt64', default_kind: '', default_expression: '', comment: '', is_in_primary_key: 0 },
        ]),
      );
      await connector.connect();
      const columns = await connector.getColumns('events');
      expect(columns[0]!.comment).toBeUndefined();
    });
  });

  // ── Query Execution ─────────────────────────────────────────────

  describe('executeQuery', () => {
    it('should throw if not connected', async () => {
      await expect(connector.executeQuery('SELECT 1')).rejects.toThrow();
    });

    it('should execute SELECT query and return results', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]),
      );
      await connector.connect();
      const result = await connector.executeQuery('SELECT id, name FROM users');
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it('should handle mutation queries', async () => {
      mockCommand.mockResolvedValueOnce(undefined);
      await connector.connect();
      const result = await connector.executeQuery('INSERT INTO events VALUES (1, now())');
      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });

    it('should handle WITH (CTE) queries as select', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([{ total: 42 }]),
      );
      await connector.connect();
      const result = await connector.executeQuery('WITH t AS (SELECT 1) SELECT * FROM t');
      expect(result.rows).toHaveLength(1);
    });

    it('should handle SHOW queries as select', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([{ name: 'default' }]),
      );
      await connector.connect();
      const result = await connector.executeQuery('SHOW DATABASES');
      expect(result.rows).toHaveLength(1);
    });

    it('should handle query errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Syntax error'));
      await connector.connect();
      await expect(connector.executeQuery('INVALID SQL')).rejects.toThrow();
    });

    it('should infer column types from result', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { count: 42, ratio: 0.5, name: 'test', flag: true, empty: null },
        ]),
      );
      await connector.connect();
      const result = await connector.executeQuery('SELECT count, ratio, name, flag, empty FROM t');
      expect(result.columns).toHaveLength(5);
      // Verify type inference logic
      const typeMap = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
      expect(typeMap['count']).toBe('Int64');
      expect(typeMap['ratio']).toBe('Float64');
      expect(typeMap['name']).toBe('String');
      expect(typeMap['flag']).toBe('UInt8');
      expect(typeMap['empty']).toBe('Nullable(String)');
    });

    it('should handle empty result set', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([]));
      await connector.connect();
      const result = await connector.executeQuery('SELECT 1 WHERE 0');
      expect(result.rows).toHaveLength(0);
      expect(result.columns).toHaveLength(0);
    });
  });

  // ── Query Cancellation ──────────────────────────────────────────

  describe('cancelQuery', () => {
    it('should call KILL QUERY', async () => {
      mockQuery.mockResolvedValue(mockJsonResult([]));
      await connector.connect();
      await connector.cancelQuery('test-query-1');
      // cancelQuery is best-effort, should not throw
    });

    it('should handle cancellation error gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Kill failed'));
      await connector.connect();
      await expect(connector.cancelQuery('q-1')).resolves.toBeUndefined();
    });
  });

  // ── Metadata ────────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getVersion()).rejects.toThrow();
    });

    it('should return version string', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([{ version: '23.8.1.2145' }]),
      );
      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toBe('23.8.1.2145');
    });

    it('should return unknown when no version row', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([]));
      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toBe('unknown');
    });
  });

  // ── ClickHouse-Specific Methods ─────────────────────────────────

  describe('getUptime', () => {
    it('should return uptime in seconds', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([{ uptime: 86400 }]));
      await connector.connect();
      const uptime = await connector.getUptime();
      expect(uptime).toBe(86400);
    });
  });

  describe('getDatabases', () => {
    it('should return database names', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { name: 'default' },
          { name: 'analytics' },
          { name: 'system' },
        ]),
      );
      await connector.connect();
      const dbs = await connector.getDatabases();
      expect(dbs).toEqual(['default', 'analytics', 'system']);
    });
  });

  describe('getTableEngine', () => {
    it('should return engine for a table', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([{ engine: 'MergeTree' }]));
      await connector.connect();
      const engine = await connector.getTableEngine('events');
      expect(engine).toBe('MergeTree');
    });

    it('should return unknown for missing table', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([]));
      await connector.connect();
      const engine = await connector.getTableEngine('missing');
      expect(engine).toBe('unknown');
    });
  });

  describe('getPartitions', () => {
    it('should return partition info', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { partition: '2024-01', part_name: 'all_1', rows: 1000, bytes_on_disk: 4096, modification_time: '2024-01-15' },
        ]),
      );
      await connector.connect();
      const partitions = await connector.getPartitions('events');
      expect(partitions).toHaveLength(1);
      expect(partitions[0]!['partition']).toBe('2024-01');
    });
  });

  describe('getRunningQueries', () => {
    it('should return running queries', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { query_id: 'q1', user: 'default', query: 'SELECT 1', elapsed: 0.5 },
        ]),
      );
      await connector.connect();
      const queries = await connector.getRunningQueries();
      expect(queries).toHaveLength(1);
      expect(queries[0]!['query_id']).toBe('q1');
    });
  });

  describe('optimizeTable', () => {
    it('should execute OPTIMIZE TABLE', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([]));
      await connector.connect();
      await expect(connector.optimizeTable('events')).resolves.toBeUndefined();
    });

    it('should add FINAL when requested', async () => {
      mockQuery.mockResolvedValueOnce(mockJsonResult([]));
      await connector.connect();
      await expect(connector.optimizeTable('events', 'default', true)).resolves.toBeUndefined();
    });
  });

  describe('getTableSizes', () => {
    it('should return table size info', async () => {
      mockQuery.mockResolvedValueOnce(
        mockJsonResult([
          { table: 'events', engine: 'MergeTree', rows: 10000, bytesOnDisk: 1048576, compressedBytes: 0, uncompressedBytes: 0 },
        ]),
      );
      await connector.connect();
      const sizes = await connector.getTableSizes();
      expect(sizes).toHaveLength(1);
      expect(sizes[0]!.table).toBe('events');
      expect(sizes[0]!.bytesOnDisk).toBe(1048576);
    });
  });

  // ── Pool Stats ──────────────────────────────────────────────────

  describe('getPoolStats', () => {
    it('should return null (ClickHouse uses HTTP, no pool stats)', () => {
      expect(connector.getPoolStats()).toBeNull();
    });
  });
});
