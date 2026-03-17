// ── Query Executor Tests ────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryExecutor } from './query-executor.js';
import type { CacheProvider, ConnectorFactory } from './query-executor.js';
import type { Connector } from '@meridian/connectors';
import type { SQLDialect } from '../dialects/sql-dialect.js';
import type { QueryResult, VisualQuery } from '@meridian/shared';
import { PostgreSQLDialect } from '../dialects/postgresql.dialect.js';
import { QueryBuilder } from '../ir/query-builder.js';

// ── Mock Helpers ────────────────────────────────────────────────────

function mockQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    columns: [{ name: 'id', type: 'integer', nullable: false }],
    rows: [{ id: 1 }, { id: 2 }],
    rowCount: 2,
    executionTimeMs: 10,
    truncated: false,
    ...overrides,
  };
}

function mockConnector(queryResult?: QueryResult): Connector {
  return {
    type: 'postgresql',
    id: 'conn-1',
    name: 'Test PG',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'ok', latencyMs: 5 }),
    getSchemas: vi.fn().mockResolvedValue([]),
    getTables: vi.fn().mockResolvedValue([]),
    getColumns: vi.fn().mockResolvedValue([]),
    executeQuery: vi.fn().mockResolvedValue(queryResult ?? mockQueryResult()),
    cancelQuery: vi.fn().mockResolvedValue(undefined),
    getVersion: vi.fn().mockResolvedValue('15.0'),
  };
}

function mockConnectorFactory(connector?: Connector, dialect?: SQLDialect): ConnectorFactory {
  return {
    getConnector: vi.fn().mockResolvedValue(connector ?? mockConnector()),
    getDialect: vi.fn().mockResolvedValue(dialect ?? new PostgreSQLDialect()),
  };
}

function mockCache(): CacheProvider & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeVisualQuery(overrides: Partial<VisualQuery> = {}): VisualQuery {
  return {
    dataSourceId: 'ds-1',
    table: 'users',
    columns: ['id', 'name'],
    filters: [],
    sorts: [],
    aggregations: [],
    groupBy: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('QueryExecutor', () => {
  let cache: ReturnType<typeof mockCache>;
  let connector: Connector;
  let factory: ConnectorFactory;
  let executor: QueryExecutor;

  beforeEach(() => {
    cache = mockCache();
    connector = mockConnector();
    factory = mockConnectorFactory(connector);
    executor = new QueryExecutor(factory, cache);
  });

  // ── executeVisual ─────────────────────────────────────────────

  describe('executeVisual()', () => {
    it('should execute a visual query and return result', async () => {
      const vq = makeVisualQuery();
      const result = await executor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.result.rowCount).toBe(2);
        expect(result.value.metadata.cached).toBe(false);
        expect(result.value.metadata.sql).toBeTruthy();
        expect(result.value.metadata.queryId).toBeTruthy();
      }
    });

    it('should call connector.executeQuery with generated SQL', async () => {
      const vq = makeVisualQuery();
      await executor.executeVisual(vq, 'ds-1');

      expect(connector.executeQuery).toHaveBeenCalled();
      const callArgs = vi.mocked(connector.executeQuery).mock.calls[0];
      expect(callArgs[0]).toContain('SELECT');
      expect(callArgs[0]).toContain('"id"');
      expect(callArgs[0]).toContain('"name"');
    });

    it('should use cache on second call', async () => {
      const cachedResult = mockQueryResult({ rowCount: 99 });

      // First call: cache miss
      cache.get.mockResolvedValueOnce(null);
      const vq = makeVisualQuery();
      await executor.executeVisual(vq, 'ds-1');
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Second call: cache hit
      cache.get.mockResolvedValueOnce(cachedResult);
      const result2 = await executor.executeVisual(vq, 'ds-1');
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.metadata.cached).toBe(true);
        expect(result2.value.result.rowCount).toBe(99);
      }
    });

    it('should skip cache when cacheTtlSeconds is 0', async () => {
      const noCacheExecutor = new QueryExecutor(factory, cache, { cacheTtlSeconds: 0 });
      const vq = makeVisualQuery();
      await noCacheExecutor.executeVisual(vq, 'ds-1');

      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should work without cache provider', async () => {
      const noCacheExecutor = new QueryExecutor(factory, null);
      const vq = makeVisualQuery();
      const result = await noCacheExecutor.executeVisual(vq, 'ds-1');
      expect(result.ok).toBe(true);
    });

    it('should handle connector error gracefully', async () => {
      vi.mocked(connector.executeQuery).mockRejectedValueOnce(new Error('connection lost'));
      const vq = makeVisualQuery();
      const result = await executor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('connection lost');
      }
    });

    it('should handle cache read error gracefully', async () => {
      cache.get.mockRejectedValueOnce(new Error('redis down'));
      const vq = makeVisualQuery();
      const result = await executor.executeVisual(vq, 'ds-1');

      // Should still succeed (cache errors are non-fatal)
      expect(result.ok).toBe(true);
    });

    it('should handle cache write error gracefully', async () => {
      cache.set.mockRejectedValueOnce(new Error('redis down'));
      const vq = makeVisualQuery();
      const result = await executor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
    });

    it('should include optimizations in metadata', async () => {
      const vq = makeVisualQuery({
        filters: [
          { column: 'active', operator: 'eq', value: true },
          { column: 'active', operator: 'eq', value: true },
        ],
      });
      const result = await executor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.optimizations).toContain('merge-redundant-filters');
      }
    });

    it('should skip optimization when disabled', async () => {
      const noOptExecutor = new QueryExecutor(factory, cache, { enableOptimization: false });
      const vq = makeVisualQuery({
        filters: [
          { column: 'active', operator: 'eq', value: true },
          { column: 'active', operator: 'eq', value: true },
        ],
      });
      const result = await noOptExecutor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.optimizations).toHaveLength(0);
      }
    });

    it('should include translation warnings', async () => {
      const vq = makeVisualQuery({
        columns: ['name', 'email'],
        aggregations: [{ column: 'amount', aggregation: 'sum', alias: 'total' }],
        groupBy: ['name'],
      });
      const result = await executor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.warnings.length).toBeGreaterThan(0);
      }
    });

    it('should track execution time in metadata', async () => {
      const vq = makeVisualQuery();
      const result = await executor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.totalTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.value.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── executeRaw ────────────────────────────────────────────────

  describe('executeRaw()', () => {
    it('should execute raw SQL', async () => {
      const result = await executor.executeRaw('SELECT 1', 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.sql).toBe('SELECT 1');
        expect(result.value.metadata.cached).toBe(false);
      }
    });

    it('should pass params to connector', async () => {
      await executor.executeRaw('SELECT * FROM users WHERE id = $1', 'ds-1', [42]);

      expect(connector.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1',
        [42],
      );
    });

    it('should cache raw query results', async () => {
      await executor.executeRaw('SELECT 1', 'ds-1');
      expect(cache.set).toHaveBeenCalled();
    });

    it('should return cached result for same raw query', async () => {
      const cachedResult = mockQueryResult({ rowCount: 42 });
      cache.get.mockResolvedValueOnce(null);
      await executor.executeRaw('SELECT 1', 'ds-1');

      cache.get.mockResolvedValueOnce(cachedResult);
      const result = await executor.executeRaw('SELECT 1', 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.cached).toBe(true);
      }
    });

    it('should handle execution error', async () => {
      vi.mocked(connector.executeQuery).mockRejectedValueOnce(new Error('syntax error'));
      const result = await executor.executeRaw('INVALID SQL', 'ds-1');

      expect(result.ok).toBe(false);
    });
  });

  // ── executeAbstract ───────────────────────────────────────────

  describe('executeAbstract()', () => {
    it('should execute a pre-built AbstractQuery', async () => {
      const query = new QueryBuilder()
        .from('users')
        .select('id', 'name')
        .where('active', 'eq', true)
        .build();

      const result = await executor.executeAbstract(query, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.sql).toContain('SELECT');
        expect(result.value.metadata.params).toEqual([true]);
      }
    });

    it('should use cache for abstract queries', async () => {
      const query = new QueryBuilder().from('users').select('id').build();

      const cachedResult = mockQueryResult({ rowCount: 99 });
      cache.get.mockResolvedValueOnce(null);
      await executor.executeAbstract(query, 'ds-1');

      cache.get.mockResolvedValueOnce(cachedResult);
      const result = await executor.executeAbstract(query, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.cached).toBe(true);
      }
    });
  });

  // ── cancelQuery ───────────────────────────────────────────────

  describe('cancelQuery()', () => {
    it('should cancel a non-existent query without error', async () => {
      const result = await executor.cancelQuery('non-existent');
      expect(result.ok).toBe(true);
    });
  });

  // ── Cancellation Registry ─────────────────────────────────────

  describe('getCancellationRegistry()', () => {
    it('should return the cancellation registry', () => {
      const registry = executor.getCancellationRegistry();
      expect(registry).toBeDefined();
      expect(registry.size).toBe(0);
    });
  });

  // ── Unique query IDs ──────────────────────────────────────────

  describe('query IDs', () => {
    it('should generate unique query IDs', async () => {
      const vq = makeVisualQuery();
      const ids = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const result = await executor.executeVisual(vq, 'ds-1');
        if (result.ok) {
          ids.add(result.value.metadata.queryId);
        }
      }

      expect(ids.size).toBe(5);
    });
  });

  // ── Default schema ────────────────────────────────────────────

  describe('defaultSchema option', () => {
    it('should use default schema in generated SQL', async () => {
      const schemaExecutor = new QueryExecutor(factory, cache, { defaultSchema: 'myschema' });
      const vq = makeVisualQuery();
      const result = await schemaExecutor.executeVisual(vq, 'ds-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.sql).toContain('"myschema"');
      }
    });
  });
});
