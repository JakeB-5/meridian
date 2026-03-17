import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheCleanupHandler } from './cache-cleanup.handler.js';
import type { CacheProvider } from '@meridian/cache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCache(initialKeys: string[] = []): CacheProvider {
  const store = new Set<string>(initialKeys);
  return {
    get: vi.fn(async (key: string) => (store.has(key) ? { value: key } : null)),
    set: vi.fn(async () => {}),
    delete: vi.fn(async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      return had;
    }),
    has: vi.fn(async (key: string) => store.has(key)),
    clear: vi.fn(async () => store.clear()),
    keys: vi.fn(async (pattern?: string) => {
      const all = Array.from(store);
      if (!pattern || pattern === '*') return all;
      // Simple glob: convert "ns:*" to prefix match
      const prefix = pattern.replace(/\*.*$/, '');
      return all.filter((k) => k.startsWith(prefix));
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CacheCleanupHandler', () => {
  let cache: CacheProvider;
  let handler: CacheCleanupHandler;
  let progress: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = makeMockCache([
      'query:q1', 'query:q2', 'query:q3',
      'dashboard:d1',
      'schema:s1', 'schema:s2',
      'export:e1',
    ]);
    handler = new CacheCleanupHandler(cache);
    progress = vi.fn();
  });

  // ── default namespace cleanup ──────────────────────────────────────────────

  describe('default namespace cleanup', () => {
    it('calls cache.keys for each default namespace', async () => {
      await handler.handle({}, progress);
      // Default namespaces: query, dashboard, schema, export
      expect(cache.keys).toHaveBeenCalledWith('query:*');
      expect(cache.keys).toHaveBeenCalledWith('dashboard:*');
      expect(cache.keys).toHaveBeenCalledWith('schema:*');
      expect(cache.keys).toHaveBeenCalledWith('export:*');
    });

    it('deletes all keys in default namespaces', async () => {
      await handler.handle({}, progress);
      // 3 query + 1 dashboard + 2 schema + 1 export = 7 keys total
      expect(cache.delete).toHaveBeenCalledTimes(7);
    });

    it('reports 100% at the end', async () => {
      await handler.handle({}, progress);
      const calls = progress.mock.calls.map(([p]) => p as number);
      expect(calls[calls.length - 1]).toBe(100);
    });

    it('returns eligible count equal to total keys found', async () => {
      const result = await handler.handle({}, progress);
      expect(result.eligible).toBe(7);
    });

    it('returns deleted count equal to eligible when dryRun=false', async () => {
      const result = await handler.handle({}, progress);
      expect(result.deleted).toBe(7);
    });
  });

  // ── targeted namespace cleanup ─────────────────────────────────────────────

  describe('targeted namespace cleanup', () => {
    it('only cleans specified namespaces', async () => {
      await handler.handle({ namespaces: ['query'] }, progress);
      expect(cache.keys).toHaveBeenCalledWith('query:*');
      expect(cache.keys).not.toHaveBeenCalledWith('dashboard:*');
    });

    it('deletes only keys in specified namespaces', async () => {
      const result = await handler.handle({ namespaces: ['query'] }, progress);
      expect(result.deleted).toBe(3);
      expect(result.eligible).toBe(3);
    });

    it('includes processed namespaces in result', async () => {
      const result = await handler.handle({ namespaces: ['query', 'schema'] }, progress);
      expect(result.namespacesProcessed).toContain('query');
      expect(result.namespacesProcessed).toContain('schema');
    });
  });

  // ── dry-run mode ──────────────────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('does not call cache.delete in dry-run mode', async () => {
      await handler.handle({ dryRun: true }, progress);
      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('still counts eligible keys in dry-run mode', async () => {
      const result = await handler.handle({ dryRun: true }, progress);
      expect(result.eligible).toBe(7);
    });

    it('returns deleted=0 in dry-run mode', async () => {
      const result = await handler.handle({ dryRun: true }, progress);
      expect(result.deleted).toBe(0);
    });

    it('sets dryRun=true in result', async () => {
      const result = await handler.handle({ dryRun: true }, progress);
      expect(result.dryRun).toBe(true);
    });
  });

  // ── maxDeletions limit ────────────────────────────────────────────────────

  describe('maxDeletions limit', () => {
    it('stops after reaching maxDeletions', async () => {
      const result = await handler.handle({ maxDeletions: 2 }, progress);
      // Can't delete more than 2 even though eligible=7
      expect(cache.delete).toHaveBeenCalledTimes(2);
      expect(result.deleted).toBe(2);
    });
  });

  // ── custom keyPattern ──────────────────────────────────────────────────────

  describe('custom keyPattern', () => {
    it('passes pattern to cache.keys with namespace prefix', async () => {
      await handler.handle({ namespaces: ['query'], keyPattern: 'q1*' }, progress);
      expect(cache.keys).toHaveBeenCalledWith('query:q1*');
    });
  });

  // ── error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('continues to next namespace if cache.keys throws', async () => {
      let callCount = 0;
      (cache.keys as ReturnType<typeof vi.fn>).mockImplementation(async (pattern: string) => {
        callCount++;
        if (callCount === 1) throw new Error('Redis error');
        // Return keys for subsequent namespaces
        return pattern.startsWith('dashboard:')
          ? ['dashboard:d1']
          : [];
      });

      // Should not throw
      const result = await handler.handle({ namespaces: ['query', 'dashboard'] }, progress);
      expect(result.eligible).toBeGreaterThanOrEqual(0);
    });

    it('continues to next key if cache.delete throws', async () => {
      (cache.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Delete failed'));
      // Should not throw overall
      await expect(
        handler.handle({ namespaces: ['query'] }, progress),
      ).resolves.toBeDefined();
    });
  });

  // ── empty cache ───────────────────────────────────────────────────────────

  describe('empty cache', () => {
    it('returns zero eligible and zero deleted for an empty cache', async () => {
      const empty = makeMockCache([]);
      const h = new CacheCleanupHandler(empty);
      const result = await h.handle({}, progress);
      expect(result.eligible).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('reports 100% progress even when no keys exist', async () => {
      const empty = makeMockCache([]);
      const h = new CacheCleanupHandler(empty);
      await h.handle({}, progress);
      expect(progress).toHaveBeenLastCalledWith(100);
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
