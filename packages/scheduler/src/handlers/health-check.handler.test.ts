import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckHandler } from './health-check.handler.js';
import type {
  DatasourceConnector,
  DatasourceRegistry,
} from './health-check.handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConnector(
  id: string,
  name: string,
  result: { ok: boolean; error?: string; latencyMs?: number } = { ok: true, latencyMs: 5 },
): DatasourceConnector {
  return {
    id,
    name,
    testConnection: vi.fn(async () => result),
  };
}

function makeRegistry(connectors: DatasourceConnector[]): DatasourceRegistry {
  return {
    listConnectors: vi.fn((ids?: string[]) => {
      if (!ids) return connectors;
      return connectors.filter((c) => ids.includes(c.id));
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HealthCheckHandler', () => {
  let registry: DatasourceRegistry;
  let handler: HealthCheckHandler;
  let progress: ReturnType<typeof vi.fn>;

  const connectorA = makeConnector('ds-1', 'Postgres prod', { ok: true, latencyMs: 12 });
  const connectorB = makeConnector('ds-2', 'MySQL staging', { ok: true, latencyMs: 8 });
  const connectorC = makeConnector('ds-3', 'BigQuery analytics', { ok: false, error: 'Auth failed' });

  beforeEach(() => {
    vi.clearAllMocks();
    registry = makeRegistry([connectorA, connectorB, connectorC]);
    handler = new HealthCheckHandler(registry);
    progress = vi.fn();
  });

  // ── basic execution ────────────────────────────────────────────────────────

  describe('basic execution', () => {
    it('checks all connectors when no IDs specified', async () => {
      await handler.handle({}, progress);
      expect(connectorA.testConnection).toHaveBeenCalledOnce();
      expect(connectorB.testConnection).toHaveBeenCalledOnce();
      expect(connectorC.testConnection).toHaveBeenCalledOnce();
    });

    it('counts healthy and unhealthy separately', async () => {
      const result = await handler.handle({}, progress);
      expect(result.healthy).toBe(2);
      expect(result.unhealthy).toBe(1);
    });

    it('returns one result entry per connector', async () => {
      const result = await handler.handle({}, progress);
      expect(result.results).toHaveLength(3);
    });

    it('result entries contain expected fields', async () => {
      const result = await handler.handle({}, progress);
      const entry = result.results.find((r) => r.id === 'ds-1')!;
      expect(entry.ok).toBe(true);
      expect(entry.latencyMs).toBe(12);
      expect(entry.checkedAt).toBeInstanceOf(Date);
    });

    it('includes error message for unhealthy connectors', async () => {
      const result = await handler.handle({}, progress);
      const unhealthy = result.results.find((r) => r.id === 'ds-3')!;
      expect(unhealthy.ok).toBe(false);
      expect(unhealthy.error).toBe('Auth failed');
    });
  });

  // ── filtered by ID ─────────────────────────────────────────────────────────

  describe('filtered by datasourceIds', () => {
    it('only checks connectors whose IDs match', async () => {
      await handler.handle({ datasourceIds: ['ds-1', 'ds-2'] }, progress);
      expect(connectorA.testConnection).toHaveBeenCalledOnce();
      expect(connectorB.testConnection).toHaveBeenCalledOnce();
      expect(connectorC.testConnection).not.toHaveBeenCalled();
    });

    it('returns correct counts for filtered set', async () => {
      const result = await handler.handle({ datasourceIds: ['ds-1'] }, progress);
      expect(result.healthy).toBe(1);
      expect(result.unhealthy).toBe(0);
    });
  });

  // ── progress reporting ─────────────────────────────────────────────────────

  describe('progress reporting', () => {
    it('calls progress callback for each connector checked', async () => {
      await handler.handle({}, progress);
      // 3 connectors → 3 progress calls
      expect(progress).toHaveBeenCalledTimes(3);
    });

    it('final progress call is 100', async () => {
      await handler.handle({}, progress);
      const calls = progress.mock.calls.map(([p]) => p as number);
      expect(calls[calls.length - 1]).toBe(100);
    });

    it('progress values are strictly increasing', async () => {
      await handler.handle({}, progress);
      const calls = progress.mock.calls.map(([p]) => p as number);
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i]!).toBeGreaterThan(calls[i - 1]!);
      }
    });
  });

  // ── empty registry ─────────────────────────────────────────────────────────

  describe('empty registry', () => {
    it('handles zero connectors gracefully', async () => {
      const emptyRegistry = makeRegistry([]);
      const h = new HealthCheckHandler(emptyRegistry);
      const result = await h.handle({}, progress);
      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('calls progress(100) even with no connectors', async () => {
      const emptyRegistry = makeRegistry([]);
      const h = new HealthCheckHandler(emptyRegistry);
      await h.handle({}, progress);
      expect(progress).toHaveBeenCalledWith(100);
    });
  });

  // ── timeout handling ───────────────────────────────────────────────────────

  describe('timeout handling', () => {
    it('marks connector as unhealthy when connection test times out', async () => {
      const slowConnector: DatasourceConnector = {
        id: 'slow-ds',
        name: 'Slow DB',
        testConnection: vi.fn(
          () => new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: true }), 500)),
        ),
      };
      const r = makeRegistry([slowConnector]);
      const h = new HealthCheckHandler(r);

      const result = await h.handle({ timeoutMs: 50 }, progress);
      expect(result.unhealthy).toBe(1);
      expect(result.results[0]!.error).toContain('timed out');
    });
  });

  // ── exception thrown by testConnection ────────────────────────────────────

  describe('exception from testConnection', () => {
    it('marks connector as unhealthy when testConnection throws', async () => {
      const throwingConnector: DatasourceConnector = {
        id: 'throw-ds',
        name: 'Throw DB',
        testConnection: vi.fn(async () => { throw new Error('Connection refused'); }),
      };
      const r = makeRegistry([throwingConnector]);
      const h = new HealthCheckHandler(r);

      const result = await h.handle({}, progress);
      expect(result.unhealthy).toBe(1);
      expect(result.results[0]!.ok).toBe(false);
      expect(result.results[0]!.error).toContain('Connection refused');
    });

    it('continues checking remaining connectors after one throws', async () => {
      const throwingConnector: DatasourceConnector = {
        id: 'throw-ds',
        name: 'Throw DB',
        testConnection: vi.fn(async () => { throw new Error('Connection refused'); }),
      };
      const okConnector = makeConnector('ok-ds', 'OK DB', { ok: true });
      const r = makeRegistry([throwingConnector, okConnector]);
      const h = new HealthCheckHandler(r);

      const result = await h.handle({}, progress);
      expect(result.healthy).toBe(1);
      expect(result.unhealthy).toBe(1);
    });
  });

  // ── result shape ──────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('includes durationMs as a non-negative number', async () => {
      const result = await handler.handle({}, progress);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
