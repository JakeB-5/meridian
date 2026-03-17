import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiLayerCache } from './multi-layer-cache.js';
import type { CacheProvider } from './types.js';

// ---------------------------------------------------------------------------
// Helpers: create minimal mock CacheProvider
// ---------------------------------------------------------------------------

function makeMockProvider(store: Map<string, unknown> = new Map()): CacheProvider {
  return {
    get: vi.fn(async <T>(key: string): Promise<T | null> => {
      return (store.get(key) as T) ?? null;
    }) as CacheProvider['get'],
    set: vi.fn(async <T>(key: string, value: T): Promise<void> => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string): Promise<boolean> => {
      return store.delete(key);
    }),
    has: vi.fn(async (key: string): Promise<boolean> => {
      return store.has(key);
    }),
    clear: vi.fn(async (namespace?: string): Promise<void> => {
      if (namespace === undefined) {
        store.clear();
      } else {
        for (const k of store.keys()) {
          if (k.startsWith(`${namespace}:`)) store.delete(k);
        }
      }
    }),
    keys: vi.fn(async (): Promise<string[]> => {
      return Array.from(store.keys());
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultiLayerCache', () => {
  let l1Store: Map<string, unknown>;
  let l2Store: Map<string, unknown>;
  let l1: CacheProvider;
  let l2: CacheProvider;
  let mlc: MultiLayerCache;

  beforeEach(() => {
    l1Store = new Map();
    l2Store = new Map();
    l1 = makeMockProvider(l1Store);
    l2 = makeMockProvider(l2Store);
    mlc = new MultiLayerCache([l1, l2]);
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  it('throws if constructed with zero layers', () => {
    expect(() => new MultiLayerCache([])).toThrow();
  });

  // ---------------------------------------------------------------------------
  // get — cascade behaviour
  // ---------------------------------------------------------------------------

  describe('get()', () => {
    it('returns null when all layers miss', async () => {
      expect(await mlc.get('missing')).toBeNull();
      expect(l1.get).toHaveBeenCalledWith('missing');
      expect(l2.get).toHaveBeenCalledWith('missing');
    });

    it('returns value from L1 without checking L2', async () => {
      l1Store.set('k', 'l1-value');

      const result = await mlc.get('k');

      expect(result).toBe('l1-value');
      expect(l1.get).toHaveBeenCalledWith('k');
      expect(l2.get).not.toHaveBeenCalled();
    });

    it('returns value from L2 when L1 misses', async () => {
      l2Store.set('k', 'l2-value');

      const result = await mlc.get('k');

      expect(result).toBe('l2-value');
      expect(l1.get).toHaveBeenCalledWith('k');
      expect(l2.get).toHaveBeenCalledWith('k');
    });

    it('back-fills L1 when L2 hits', async () => {
      l2Store.set('k', 'l2-value');

      await mlc.get('k');

      // L1 should now have the value.
      expect(l1.set).toHaveBeenCalledWith('k', 'l2-value');
      expect(l1Store.get('k')).toBe('l2-value');
    });

    it('does not back-fill L2 when L1 hits', async () => {
      l1Store.set('k', 'l1-value');

      await mlc.get('k');

      expect(l2.set).not.toHaveBeenCalled();
    });

    it('back-fills all missed upper layers on deep hit', async () => {
      // 3-layer setup: l1 misses, l2 misses, l3 hits.
      const l3Store = new Map<string, unknown>();
      l3Store.set('k', 'deep-value');
      const l3 = makeMockProvider(l3Store);

      const deepMlc = new MultiLayerCache([l1, l2, l3]);
      await deepMlc.get('k');

      // Both L1 and L2 should be back-filled.
      expect(l1.set).toHaveBeenCalledWith('k', 'deep-value');
      expect(l2.set).toHaveBeenCalledWith('k', 'deep-value');
    });
  });

  // ---------------------------------------------------------------------------
  // set
  // ---------------------------------------------------------------------------

  describe('set()', () => {
    it('writes to all layers', async () => {
      await mlc.set('k', 'val', { ttlSeconds: 10 });

      expect(l1.set).toHaveBeenCalledWith('k', 'val', { ttlSeconds: 10 });
      expect(l2.set).toHaveBeenCalledWith('k', 'val', { ttlSeconds: 10 });
    });

    it('subsequent get returns the value from L1', async () => {
      await mlc.set('k', 'stored');
      expect(await mlc.get('k')).toBe('stored');
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('deletes from all layers', async () => {
      l1Store.set('k', 'v');
      l2Store.set('k', 'v');

      const deleted = await mlc.delete('k');

      expect(deleted).toBe(true);
      expect(l1Store.has('k')).toBe(false);
      expect(l2Store.has('k')).toBe(false);
    });

    it('returns false when key exists in no layer', async () => {
      // Both mock stores are empty.
      vi.mocked(l1.delete).mockResolvedValueOnce(false);
      vi.mocked(l2.delete).mockResolvedValueOnce(false);

      expect(await mlc.delete('ghost')).toBe(false);
    });

    it('returns true if at least one layer deleted the key', async () => {
      l2Store.set('k', 'v');

      const deleted = await mlc.delete('k');
      expect(deleted).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // has
  // ---------------------------------------------------------------------------

  describe('has()', () => {
    it('returns true if L1 has the key', async () => {
      l1Store.set('k', 'v');
      expect(await mlc.has('k')).toBe(true);
    });

    it('returns true if only L2 has the key', async () => {
      l2Store.set('k', 'v');
      expect(await mlc.has('k')).toBe(true);
    });

    it('returns false when no layer has the key', async () => {
      expect(await mlc.has('ghost')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------

  describe('clear()', () => {
    it('clears all layers', async () => {
      l1Store.set('a', 1);
      l2Store.set('b', 2);

      await mlc.clear();

      expect(l1Store.size).toBe(0);
      expect(l2Store.size).toBe(0);
    });

    it('passes namespace to all layers', async () => {
      await mlc.clear('my-ns');

      expect(l1.clear).toHaveBeenCalledWith('my-ns');
      expect(l2.clear).toHaveBeenCalledWith('my-ns');
    });
  });

  // ---------------------------------------------------------------------------
  // keys
  // ---------------------------------------------------------------------------

  describe('keys()', () => {
    it('returns union of keys from all layers', async () => {
      l1Store.set('a', 1);
      l2Store.set('b', 2);

      const keys = await mlc.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('deduplicates keys that appear in multiple layers', async () => {
      l1Store.set('shared', 1);
      l2Store.set('shared', 2);

      const keys = await mlc.keys();
      const sharedCount = keys.filter((k) => k === 'shared').length;
      expect(sharedCount).toBe(1);
    });
  });
});
