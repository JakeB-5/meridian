import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryRefreshHandler } from './query-refresh.handler.js';
import type { QueryExecutor } from './query-refresh.handler.js';
import type { CacheProvider } from '@meridian/cache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockExecutor(
  questionIds: string[] = ['q1', 'q2', 'q3'],
): QueryExecutor {
  return {
    executeQuestion: vi.fn(async (id: string) => ({ rows: [{ id }], count: 1 })),
    listCachedQuestionIds: vi.fn(async () => questionIds),
  };
}

function makeMockCache(): CacheProvider {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    has: vi.fn(async (key: string) => store.has(key)),
    clear: vi.fn(async () => store.clear()),
    keys: vi.fn(async (pattern?: string) => {
      const all = Array.from(store.keys());
      if (!pattern || pattern === '*') return all;
      return all.filter((k) => k.includes(pattern.replace('*', '')));
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueryRefreshHandler', () => {
  let executor: QueryExecutor;
  let cache: CacheProvider;
  let handler: QueryRefreshHandler;
  let progress: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executor = makeMockExecutor();
    cache = makeMockCache();
    handler = new QueryRefreshHandler(executor, cache);
    progress = vi.fn();
  });

  // ── full refresh (no questionIds) ──────────────────────────────────────────

  describe('full refresh (no questionIds in payload)', () => {
    it('calls listCachedQuestionIds to discover what to refresh', async () => {
      await handler.handle({}, progress);
      expect(executor.listCachedQuestionIds).toHaveBeenCalledOnce();
    });

    it('executes each discovered question', async () => {
      await handler.handle({}, progress);
      expect(executor.executeQuestion).toHaveBeenCalledWith('q1');
      expect(executor.executeQuestion).toHaveBeenCalledWith('q2');
      expect(executor.executeQuestion).toHaveBeenCalledWith('q3');
    });

    it('writes results to cache with default namespace and TTL', async () => {
      await handler.handle({}, progress);
      expect(cache.set).toHaveBeenCalledWith(
        'query:q1',
        expect.anything(),
        expect.objectContaining({ ttlSeconds: 300, namespace: 'query' }),
      );
    });

    it('returns all question IDs in refreshed list', async () => {
      const result = await handler.handle({}, progress);
      expect(result.refreshed).toEqual(expect.arrayContaining(['q1', 'q2', 'q3']));
      expect(result.failed).toHaveLength(0);
    });

    it('reports progress for each question (final progress = 100)', async () => {
      await handler.handle({}, progress);
      const calls = progress.mock.calls.map(([p]) => p as number);
      expect(calls[calls.length - 1]).toBe(100);
    });
  });

  // ── targeted refresh (questionIds provided) ────────────────────────────────

  describe('targeted refresh (questionIds in payload)', () => {
    it('does NOT call listCachedQuestionIds when IDs are specified', async () => {
      await handler.handle({ questionIds: ['q1'] }, progress);
      expect(executor.listCachedQuestionIds).not.toHaveBeenCalled();
    });

    it('only refreshes the specified questions', async () => {
      await handler.handle({ questionIds: ['q2'] }, progress);
      expect(executor.executeQuestion).toHaveBeenCalledOnce();
      expect(executor.executeQuestion).toHaveBeenCalledWith('q2');
    });

    it('respects custom namespace and TTL', async () => {
      await handler.handle(
        { questionIds: ['q1'], cacheNamespace: 'dash', cacheTtlSeconds: 60 },
        progress,
      );
      expect(cache.set).toHaveBeenCalledWith(
        'dash:q1',
        expect.anything(),
        expect.objectContaining({ ttlSeconds: 60, namespace: 'dash' }),
      );
    });
  });

  // ── error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('collects failures without aborting the batch', async () => {
      const failingExecutor: QueryExecutor = {
        executeQuestion: vi.fn(async (id: string) => {
          if (id === 'q2') throw new Error('Query failed for q2');
          return { rows: [] };
        }),
        listCachedQuestionIds: vi.fn(async () => ['q1', 'q2', 'q3']),
      };
      const h = new QueryRefreshHandler(failingExecutor, cache);

      const result = await h.handle({}, progress);

      expect(result.refreshed).toContain('q1');
      expect(result.refreshed).toContain('q3');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.questionId).toBe('q2');
      expect(result.failed[0]!.error).toContain('Query failed for q2');
    });

    it('returns empty refreshed list when all questions fail', async () => {
      const allFail: QueryExecutor = {
        executeQuestion: vi.fn(async () => { throw new Error('Boom'); }),
        listCachedQuestionIds: vi.fn(async () => ['q1', 'q2']),
      };
      const h = new QueryRefreshHandler(allFail, cache);

      const result = await h.handle({}, progress);
      expect(result.refreshed).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
    });
  });

  // ── result shape ──────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('includes durationMs as a positive number', async () => {
      const result = await handler.handle({}, progress);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
