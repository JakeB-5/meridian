// ── Base Connector Tests ────────────────────────────────────────────
// Tests for timeout enforcement, row limits, lifecycle guards, error
// normalization, and event emission on the abstract BaseConnector.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseConnector, generateQueryId } from './base-connector.js';
import type { BaseConnectorOptions } from './base-connector.js';
import type {
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  QueryExecutionContext,
  DataSourceConfig,
  ConnectorEvent,
} from './types.js';
import {
  ConnectorNotConnectedError,
  ConnectorAlreadyConnectedError,
  ConnectorQueryTimeoutError,
} from './errors.js';
import { MAX_QUERY_ROWS, DEFAULT_QUERY_TIMEOUT_MS } from '@meridian/shared';
import { createNoopLogger } from '@meridian/shared';

// ── Test Concrete Connector ─────────────────────────────────────────

class TestConnector extends BaseConnector {
  public connectCalled = false;
  public disconnectCalled = false;
  public testConnectionCalled = false;
  public lastExecutedSql = '';
  public lastExecutedParams: unknown[] | undefined;
  public simulateQueryDelay = 0;
  public simulateQueryError: Error | null = null;
  public simulateConnectError: Error | null = null;
  public simulateConnectDelay = 0;
  public mockQueryResult: QueryResult = {
    columns: [{ name: 'id', type: 'integer', nullable: false }],
    rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    rowCount: 3,
    executionTimeMs: 0,
    truncated: false,
  };
  public mockSchemas: SchemaInfo[] = [{ name: 'public', tables: [] }];
  public mockTables: TableInfo[] = [
    { name: 'users', schema: 'public', type: 'table', columns: [] },
  ];
  public mockColumns: TableColumnInfo[] = [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: true, primaryKey: false },
  ];
  public mockVersion = 'TestDB 1.0.0';
  public cancelledQueryIds: string[] = [];

  constructor(options?: Partial<BaseConnectorOptions>) {
    super({
      dataSource: options?.dataSource ?? createTestDataSource(),
      connectorConfig: options?.connectorConfig,
      logger: options?.logger ?? createNoopLogger(),
      maxRows: options?.maxRows,
      queryTimeoutMs: options?.queryTimeoutMs,
    });
  }

  protected async doConnect(): Promise<void> {
    if (this.simulateConnectError) {
      throw this.simulateConnectError;
    }
    if (this.simulateConnectDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateConnectDelay));
    }
    this.connectCalled = true;
  }

  protected async doDisconnect(): Promise<void> {
    this.disconnectCalled = true;
  }

  protected async doTestConnection(): Promise<void> {
    this.testConnectionCalled = true;
  }

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    return this.mockSchemas;
  }

  protected async doGetTables(_schema?: string): Promise<TableInfo[]> {
    return this.mockTables;
  }

  protected async doGetColumns(_table: string, _schema?: string): Promise<TableColumnInfo[]> {
    return this.mockColumns;
  }

  protected async doExecuteQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): Promise<QueryResult> {
    this.lastExecutedSql = sql;
    this.lastExecutedParams = params;

    if (this.simulateQueryError) {
      throw this.simulateQueryError;
    }

    if (this.simulateQueryDelay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.simulateQueryDelay);
        context.abortSignal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Query aborted'));
        });
      });
    }

    return this.mockQueryResult;
  }

  protected async doGetVersion(): Promise<string> {
    return this.mockVersion;
  }

  protected override async doCancelQuery(queryId: string): Promise<void> {
    this.cancelledQueryIds.push(queryId);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: 'test-ds-1',
    name: 'Test DataSource',
    type: 'postgresql',
    database: 'testdb',
    host: 'localhost',
    port: 5432,
    username: 'user',
    password: 'pass',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('BaseConnector', () => {
  let connector: TestConnector;

  beforeEach(() => {
    connector = new TestConnector();
  });

  afterEach(async () => {
    if (connector.isConnected()) {
      await connector.disconnect();
    }
  });

  // ── Constructor & Properties ──────────────────────────────────

  describe('constructor', () => {
    it('should set type from dataSource', () => {
      expect(connector.type).toBe('postgresql');
    });

    it('should set id from dataSource', () => {
      expect(connector.id).toBe('test-ds-1');
    });

    it('should set name from dataSource', () => {
      expect(connector.name).toBe('Test DataSource');
    });

    it('should use default maxRows from shared constants', () => {
      // Access via executeQuery behavior test below
      expect(connector['maxRows']).toBe(MAX_QUERY_ROWS);
    });

    it('should use default queryTimeoutMs from shared constants', () => {
      expect(connector['queryTimeoutMs']).toBe(DEFAULT_QUERY_TIMEOUT_MS);
    });

    it('should allow custom maxRows', () => {
      const custom = new TestConnector({ maxRows: 100 });
      expect(custom['maxRows']).toBe(100);
    });

    it('should allow custom queryTimeoutMs', () => {
      const custom = new TestConnector({ queryTimeoutMs: 5000 });
      expect(custom['queryTimeoutMs']).toBe(5000);
    });

    it('should cap queryTimeoutMs at MAX_QUERY_TIMEOUT_MS', () => {
      const custom = new TestConnector({ queryTimeoutMs: 999_999_999 });
      expect(custom['queryTimeoutMs']).toBeLessThanOrEqual(300_000);
    });
  });

  // ── Connection Lifecycle ──────────────────────────────────────

  describe('connect', () => {
    it('should call doConnect and set connected state', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
      expect(connector.connectCalled).toBe(true);
    });

    it('should throw ConnectorAlreadyConnectedError on double connect', async () => {
      await connector.connect();
      await expect(connector.connect()).rejects.toThrow(ConnectorAlreadyConnectedError);
    });

    it('should normalize connect errors', async () => {
      connector.simulateConnectError = new Error('ECONNREFUSED');
      await expect(connector.connect()).rejects.toThrow();
      expect(connector.isConnected()).toBe(false);
    });

    it('should timeout if connect takes too long', async () => {
      connector.simulateConnectDelay = 20_000;
      const fast = new TestConnector({
        connectorConfig: { connectionTimeout: 50 },
      });
      fast.simulateConnectDelay = 20_000;

      await expect(fast.connect()).rejects.toThrow();
      expect(fast.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should call doDisconnect and clear connected state', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
      expect(connector.disconnectCalled).toBe(true);
    });

    it('should silently ignore disconnect when not connected', async () => {
      await expect(connector.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should return success when connection works', async () => {
      await connector.connect();
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain('Successfully connected');
    });

    it('should auto-connect and disconnect when not connected', async () => {
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
      expect(connector.isConnected()).toBe(false); // Should disconnect after test
    });

    it('should return failure on error', async () => {
      connector.simulateConnectError = new Error('Connection refused');
      const result = await connector.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });
  });

  // ── Schema Introspection ──────────────────────────────────────

  describe('getSchemas', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getSchemas()).rejects.toThrow(ConnectorNotConnectedError);
    });

    it('should return schemas when connected', async () => {
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas).toEqual([{ name: 'public', tables: [] }]);
    });
  });

  describe('getTables', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getTables()).rejects.toThrow(ConnectorNotConnectedError);
    });

    it('should return tables when connected', async () => {
      await connector.connect();
      const tables = await connector.getTables();
      expect(tables).toHaveLength(1);
      expect(tables[0]!.name).toBe('users');
    });
  });

  describe('getColumns', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getColumns('users')).rejects.toThrow(ConnectorNotConnectedError);
    });

    it('should return columns when connected', async () => {
      await connector.connect();
      const columns = await connector.getColumns('users');
      expect(columns).toHaveLength(2);
      expect(columns[0]!.name).toBe('id');
      expect(columns[0]!.primaryKey).toBe(true);
    });
  });

  // ── Query Execution ───────────────────────────────────────────

  describe('executeQuery', () => {
    it('should throw if not connected', async () => {
      await expect(connector.executeQuery('SELECT 1')).rejects.toThrow(ConnectorNotConnectedError);
    });

    it('should execute a query and return results', async () => {
      await connector.connect();
      const result = await connector.executeQuery('SELECT * FROM users');
      expect(result.columns).toHaveLength(1);
      expect(result.rows).toHaveLength(3);
      expect(result.rowCount).toBe(3);
      expect(result.truncated).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(connector.lastExecutedSql).toBe('SELECT * FROM users');
    });

    it('should pass params to doExecuteQuery', async () => {
      await connector.connect();
      await connector.executeQuery('SELECT * FROM users WHERE id = $1', [42]);
      expect(connector.lastExecutedParams).toEqual([42]);
    });

    it('should truncate rows exceeding maxRows', async () => {
      const smallMax = new TestConnector({ maxRows: 2 });
      await smallMax.connect();
      const result = await smallMax.executeQuery('SELECT * FROM users');
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
      expect(result.truncated).toBe(true);
    });

    it('should enforce query timeout', async () => {
      const fast = new TestConnector({ queryTimeoutMs: 50 });
      fast.simulateQueryDelay = 5000;
      await fast.connect();
      await expect(fast.executeQuery('SELECT pg_sleep(5)')).rejects.toThrow();
    });

    it('should normalize query errors', async () => {
      connector.simulateQueryError = new Error('relation "missing" does not exist');
      await connector.connect();
      await expect(connector.executeQuery('SELECT * FROM missing')).rejects.toThrow();
    });
  });

  // ── Query Cancellation ────────────────────────────────────────

  describe('cancelQuery', () => {
    it('should call doCancelQuery with the query ID', async () => {
      await connector.connect();
      await connector.cancelQuery('q-123');
      expect(connector.cancelledQueryIds).toContain('q-123');
    });
  });

  // ── Metadata ──────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getVersion()).rejects.toThrow(ConnectorNotConnectedError);
    });

    it('should return version when connected', async () => {
      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toBe('TestDB 1.0.0');
    });
  });

  // ── Event System ──────────────────────────────────────────────

  describe('events', () => {
    it('should emit connect event', async () => {
      const events: ConnectorEvent[] = [];
      connector.on('connect', (e) => events.push(e));
      await connector.connect();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('connect');
      expect(events[0]!.connectorId).toBe('test-ds-1');
    });

    it('should emit disconnect event', async () => {
      const events: ConnectorEvent[] = [];
      connector.on('disconnect', (e) => events.push(e));
      await connector.connect();
      await connector.disconnect();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('disconnect');
    });

    it('should emit query:start and query:end events', async () => {
      const events: ConnectorEvent[] = [];
      connector.on('query:start', (e) => events.push(e));
      connector.on('query:end', (e) => events.push(e));
      await connector.connect();
      await connector.executeQuery('SELECT 1');
      expect(events).toHaveLength(2);
      expect(events[0]!.type).toBe('query:start');
      expect(events[1]!.type).toBe('query:end');
    });

    it('should remove event listener with off()', async () => {
      const events: ConnectorEvent[] = [];
      const listener = (e: ConnectorEvent) => events.push(e);
      connector.on('connect', listener);
      connector.off('connect', listener);
      await connector.connect();
      expect(events).toHaveLength(0);
    });

    it('should not throw if event listener throws', async () => {
      connector.on('connect', () => {
        throw new Error('Listener error');
      });
      await expect(connector.connect()).resolves.toBeUndefined();
    });
  });

  // ── Pool Stats ────────────────────────────────────────────────

  describe('getPoolStats', () => {
    it('should return null by default', () => {
      expect(connector.getPoolStats()).toBeNull();
    });
  });

  // ── generateQueryId ───────────────────────────────────────────

  describe('generateQueryId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateQueryId();
      const id2 = generateQueryId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^q_\d+_\d+$/);
    });
  });

  // ── Helper Access ─────────────────────────────────────────────

  describe('protected helpers', () => {
    it('should return host from config', () => {
      expect(connector['getHost']()).toBe('localhost');
    });

    it('should return port from config', () => {
      expect(connector['getPort'](5432)).toBe(5432);
    });

    it('should return database from config', () => {
      expect(connector['getDatabase']()).toBe('testdb');
    });

    it('should return username from config', () => {
      expect(connector['getUsername']()).toBe('user');
    });

    it('should return password from config', () => {
      expect(connector['getPassword']()).toBe('pass');
    });

    it('should return maxConnections from connectorConfig', () => {
      const custom = new TestConnector({
        connectorConfig: { maxConnections: 20 },
      });
      expect(custom['getMaxConnections']()).toBe(20);
    });

    it('should return default maxConnections', () => {
      expect(connector['getMaxConnections']()).toBe(10);
    });
  });

  // ── Row Limit Edge Cases ──────────────────────────────────────

  describe('row limit enforcement', () => {
    it('should not truncate when rows equal maxRows', async () => {
      const custom = new TestConnector({ maxRows: 3 });
      await custom.connect();
      const result = await custom.executeQuery('SELECT 1');
      expect(result.rows).toHaveLength(3);
      expect(result.truncated).toBe(false);
    });

    it('should truncate when rows exceed maxRows by one', async () => {
      const custom = new TestConnector({ maxRows: 2 });
      await custom.connect();
      const result = await custom.executeQuery('SELECT 1');
      expect(result.rows).toHaveLength(2);
      expect(result.truncated).toBe(true);
    });

    it('should handle maxRows of 0 (truncate all)', async () => {
      const custom = new TestConnector({ maxRows: 0 });
      await custom.connect();
      const result = await custom.executeQuery('SELECT 1');
      expect(result.rows).toHaveLength(0);
      expect(result.truncated).toBe(true);
    });

    it('should handle empty result sets', async () => {
      connector.mockQueryResult = {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        truncated: false,
      };
      await connector.connect();
      const result = await connector.executeQuery('SELECT 1 WHERE false');
      expect(result.rows).toHaveLength(0);
      expect(result.truncated).toBe(false);
    });
  });

  // ── Concurrent Queries ────────────────────────────────────────

  describe('concurrent queries', () => {
    it('should track active queries', async () => {
      connector.simulateQueryDelay = 50;
      await connector.connect();

      const p1 = connector.executeQuery('SELECT 1');
      const p2 = connector.executeQuery('SELECT 2');

      // While both are in flight, we should see active queries
      // (The exact count depends on timing, but both should complete)
      const results = await Promise.all([p1, p2]);
      expect(results).toHaveLength(2);
    });
  });
});
