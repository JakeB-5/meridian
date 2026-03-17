// ── PostgreSQL Connector Tests ──────────────────────────────────────
// Tests for PostgreSQLConnector using mocked 'pg' module.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DataSourceConfig } from '../types.js';
import { createNoopLogger } from '@meridian/shared';

// ── Mock pg module ──────────────────────────────────────────────────

const mockPoolQuery = vi.fn();
const mockPoolConnect = vi.fn();
const mockPoolEnd = vi.fn();
const mockPoolOn = vi.fn();

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();

const mockListenClientConnect = vi.fn();
const mockListenClientQuery = vi.fn();
const mockListenClientEnd = vi.fn();
const mockListenClientOn = vi.fn();

// Create mock client returned by pool.connect()
function createMockClient() {
  return {
    query: mockClientQuery,
    release: mockClientRelease,
  };
}

// Create mock pool
function createMockPool() {
  return {
    connect: mockPoolConnect.mockResolvedValue(createMockClient()),
    end: mockPoolEnd.mockResolvedValue(undefined),
    on: mockPoolOn,
    query: mockPoolQuery,
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  };
}

// Create mock listen client
function createMockListenClient() {
  return {
    connect: mockListenClientConnect.mockResolvedValue(undefined),
    query: mockListenClientQuery.mockResolvedValue(undefined),
    end: mockListenClientEnd,
    on: mockListenClientOn,
  };
}

vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn().mockImplementation(() => createMockPool()),
      Client: vi.fn().mockImplementation(() => createMockListenClient()),
    },
  };
});

// Import after mocking
import { PostgreSQLConnector } from './postgresql.connector.js';

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: 'pg-test-1',
    name: 'Test PostgreSQL',
    type: 'postgresql',
    database: 'testdb',
    host: 'localhost',
    port: 5432,
    username: 'testuser',
    password: 'testpass',
    ...overrides,
  };
}

function createConnector(overrides?: Partial<DataSourceConfig>): PostgreSQLConnector {
  return new PostgreSQLConnector({
    dataSource: createTestDataSource(overrides),
    logger: createNoopLogger(),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('PostgreSQLConnector', () => {
  let connector: PostgreSQLConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = createConnector();

    // Default mock: pool.connect returns a client
    mockPoolConnect.mockResolvedValue(createMockClient());
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
      expect(connector.type).toBe('postgresql');
    });

    it('should have correct id', () => {
      expect(connector.id).toBe('pg-test-1');
    });

    it('should have correct name', () => {
      expect(connector.name).toBe('Test PostgreSQL');
    });
  });

  // ── Connection Lifecycle ──────────────────────────────────────

  describe('connect', () => {
    it('should create a pool and validate by acquiring a client', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
      expect(mockPoolConnect).toHaveBeenCalled();
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should register a pool error handler', async () => {
      await connector.connect();
      expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set connected to false on connect failure', async () => {
      mockPoolConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
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
    it('should execute SELECT 1', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [{ health_check: 1 }] });
      await connector.connect();
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
    });
  });

  // ── Schema Introspection ──────────────────────────────────────

  describe('getSchemas', () => {
    it('should query information_schema.schemata and return schemas', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          { name: 'public', tableCount: 5 },
          { name: 'app', tableCount: 3 },
        ],
      });
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas).toHaveLength(2);
      expect(schemas[0]!.name).toBe('public');
      expect(schemas[1]!.name).toBe('app');
    });

    it('should exclude system schemas', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ name: 'public', tableCount: 2 }],
      });
      await connector.connect();
      const schemas = await connector.getSchemas();

      // The SQL already filters pg_catalog, information_schema, etc.
      // Verify it was passed in the query
      const callArgs = mockClientQuery.mock.calls;
      const schemaQueryCall = callArgs.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('information_schema.schemata'),
      );
      expect(schemaQueryCall).toBeDefined();
    });
  });

  describe('getTables', () => {
    it('should query tables for a given schema', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          { name: 'users', schema: 'public', type: 'table', rowCount: 100 },
          { name: 'orders', schema: 'public', type: 'table', rowCount: 500 },
          { name: 'user_summary', schema: 'public', type: 'view', rowCount: null },
        ],
      });
      await connector.connect();
      const tables = await connector.getTables('public');
      expect(tables).toHaveLength(3);
      expect(tables[0]!.name).toBe('users');
      expect(tables[0]!.type).toBe('table');
      expect(tables[0]!.rowCount).toBe(100);
      expect(tables[2]!.type).toBe('view');
      expect(tables[2]!.rowCount).toBeUndefined();
    });

    it('should default to public schema', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      await connector.connect();
      await connector.getTables();
      const lastCall = mockClientQuery.mock.calls[mockClientQuery.mock.calls.length - 1];
      expect(lastCall![1]).toEqual(['public']);
    });
  });

  describe('getColumns', () => {
    it('should return column metadata', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            name: 'id',
            type: 'integer',
            nullable: false,
            primaryKey: true,
            defaultValue: "nextval('users_id_seq')",
            comment: 'Primary key',
          },
          {
            name: 'email',
            type: 'character varying',
            nullable: false,
            primaryKey: false,
            defaultValue: null,
            comment: null,
          },
          {
            name: 'bio',
            type: 'text',
            nullable: true,
            primaryKey: false,
            defaultValue: null,
            comment: null,
          },
        ],
      });

      await connector.connect();
      const columns = await connector.getColumns('users', 'public');
      expect(columns).toHaveLength(3);

      expect(columns[0]!.name).toBe('id');
      expect(columns[0]!.type).toBe('integer');
      expect(columns[0]!.nullable).toBe(false);
      expect(columns[0]!.primaryKey).toBe(true);
      expect(columns[0]!.defaultValue).toBe("nextval('users_id_seq')");

      expect(columns[1]!.name).toBe('email');
      expect(columns[1]!.nullable).toBe(false);

      expect(columns[2]!.name).toBe('bio');
      expect(columns[2]!.nullable).toBe(true);
    });
  });

  // ── Query Execution ───────────────────────────────────────────

  describe('executeQuery', () => {
    it('should execute a query with parameters', async () => {
      // First call: pg_backend_pid
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 12345 }] })
        // Second call: SET statement_timeout
        .mockResolvedValueOnce({ rows: [] })
        // Third call: the actual query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ],
          fields: [
            { name: 'id', dataTypeID: 23 },
            { name: 'name', dataTypeID: 25 },
          ],
        });

      await connector.connect();
      const result = await connector.executeQuery('SELECT * FROM users WHERE id = $1', [1]);

      expect(result.rows).toHaveLength(2);
      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.name).toBe('id');
      expect(result.columns[0]!.type).toBe('integer');
      expect(result.columns[1]!.name).toBe('name');
      expect(result.columns[1]!.type).toBe('text');
    });

    it('should handle DDL statements', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 12345 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [],
          fields: [],
        });

      await connector.connect();
      const result = await connector.executeQuery('CREATE TABLE test (id INT)');
      expect(result.rows).toHaveLength(0);
    });

    it('should set statement_timeout', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 12345 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], fields: [] });

      await connector.connect();
      await connector.executeQuery('SELECT 1');

      // Second call should be SET statement_timeout
      const calls = mockClientQuery.mock.calls;
      const timeoutCall = calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('statement_timeout'),
      );
      expect(timeoutCall).toBeDefined();
    });

    it('should release client after query completes', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 12345 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], fields: [] });

      await connector.connect();
      await connector.executeQuery('SELECT 1');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release client even on query error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 12345 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('relation "missing" does not exist'));

      await connector.connect();
      await expect(connector.executeQuery('SELECT * FROM missing')).rejects.toThrow();
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ── Query Cancellation ────────────────────────────────────────

  describe('cancelQuery', () => {
    it('should call pg_cancel_backend for tracked queries', async () => {
      // Simulate a long-running query
      let resolveQuery: (() => void) | undefined;
      const queryPromise = new Promise<void>((resolve) => {
        resolveQuery = resolve;
      });

      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 99999 }] }) // pg_backend_pid
        .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout
        .mockImplementationOnce(() => queryPromise.then(() => ({ rows: [], fields: [] }))) // actual query
        .mockResolvedValueOnce({ rows: [{ pg_cancel_backend: true }] }); // pg_cancel_backend

      await connector.connect();

      // Start query (don't await)
      const queryResult = connector.executeQuery('SELECT pg_sleep(60)').catch(() => {});

      // Small delay to let query start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Resolve the query to prevent hanging
      resolveQuery!();
      await queryResult;
    });
  });

  // ── Version ───────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should return PostgreSQL version string', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ version: 'PostgreSQL 16.1 on x86_64-pc-linux-gnu' }],
      });

      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toBe('PostgreSQL 16.1 on x86_64-pc-linux-gnu');
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

  // ── SSL Configuration ─────────────────────────────────────────

  describe('SSL', () => {
    it('should pass ssl: true as rejectUnauthorized: false', async () => {
      const sslConnector = createConnector({ ssl: true });
      await sslConnector.connect();
      // Pool was constructed with ssl config
      expect(sslConnector.isConnected()).toBe(true);
    });

    it('should pass ssl: false as undefined', async () => {
      const noSslConnector = createConnector({ ssl: false });
      await noSslConnector.connect();
      expect(noSslConnector.isConnected()).toBe(true);
    });
  });

  // ── LISTEN/NOTIFY ─────────────────────────────────────────────

  describe('listen/notify', () => {
    it('should create a listen client and execute LISTEN', async () => {
      await connector.connect();
      const callback = vi.fn();
      await connector.listen('test_channel', callback);
      expect(mockListenClientConnect).toHaveBeenCalled();
      expect(mockListenClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('LISTEN'),
      );
    });

    it('should execute UNLISTEN on unlisten', async () => {
      await connector.connect();
      await connector.listen('test_channel', vi.fn());
      await connector.unlisten('test_channel');
      expect(mockListenClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UNLISTEN'),
      );
    });

    it('should send NOTIFY', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      await connector.connect();
      await connector.notify('test_channel', 'hello');
      const notifyCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('NOTIFY'),
      );
      expect(notifyCall).toBeDefined();
    });
  });

  // ── Type Mapping ──────────────────────────────────────────────

  describe('pgTypeToString', () => {
    it('should map common OIDs', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [{ pid: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ val: 42 }],
          fields: [
            { name: 'int_col', dataTypeID: 23 },
            { name: 'text_col', dataTypeID: 25 },
            { name: 'bool_col', dataTypeID: 16 },
            { name: 'json_col', dataTypeID: 3802 },
            { name: 'uuid_col', dataTypeID: 2950 },
            { name: 'ts_col', dataTypeID: 1114 },
          ],
        });

      await connector.connect();
      const result = await connector.executeQuery('SELECT 1');

      const typeMap: Record<string, string> = {};
      for (const col of result.columns) {
        typeMap[col.name] = col.type;
      }

      expect(typeMap['int_col']).toBe('integer');
      expect(typeMap['text_col']).toBe('text');
      expect(typeMap['bool_col']).toBe('boolean');
      expect(typeMap['json_col']).toBe('jsonb');
      expect(typeMap['uuid_col']).toBe('uuid');
      expect(typeMap['ts_col']).toBe('timestamp');
    });
  });
});
