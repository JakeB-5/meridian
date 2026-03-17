import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryCache } from './memory-cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache({ maxSize: 5 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic get / set / delete / has
  // ---------------------------------------------------------------------------

  describe('basic operations', () => {
    it('returns null for a missing key', async () => {
      expect(await cache.get('missing')).toBeNull();
    });

    it('stores and retrieves a value', async () => {
      await cache.set('key1', { foo: 'bar' });
      expect(await cache.get('key1')).toEqual({ foo: 'bar' });
    });

    it('overwrites an existing key', async () => {
      await cache.set('key1', 'first');
      await cache.set('key1', 'second');
      expect(await cache.get('key1')).toBe('second');
    });

    it('delete returns true when key existed', async () => {
      await cache.set('key1', 'value');
      expect(await cache.delete('key1')).toBe(true);
      expect(await cache.get('key1')).toBeNull();
    });

    it('delete returns false when key did not exist', async () => {
      expect(await cache.delete('nope')).toBe(false);
    });

    it('has returns true for an existing key', async () => {
      await cache.set('key1', 42);
      expect(await cache.has('key1')).toBe(true);
    });

    it('has returns false for a missing key', async () => {
      expect(await cache.has('nope')).toBe(false);
    });

    it('stores different value types', async () => {
      await cache.set('num', 99);
      await cache.set('arr', [1, 2, 3]);
      await cache.set('bool', false);

      expect(await cache.get('num')).toBe(99);
      expect(await cache.get('arr')).toEqual([1, 2, 3]);
      expect(await cache.get('bool')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // TTL
  // ---------------------------------------------------------------------------

  describe('TTL', () => {
    it('returns value before TTL expires', async () => {
      vi.useFakeTimers();
      await cache.set('ttl-key', 'alive', { ttlSeconds: 10 });

      vi.advanceTimersByTime(9_000);
      expect(await cache.get('ttl-key')).toBe('alive');
    });

    it('returns null after TTL expires', async () => {
      vi.useFakeTimers();
      await cache.set('ttl-key', 'alive', { ttlSeconds: 5 });

      vi.advanceTimersByTime(6_000);
      expect(await cache.get('ttl-key')).toBeNull();
    });

    it('has returns false for an expired key', async () => {
      vi.useFakeTimers();
      await cache.set('ttl-key', 'alive', { ttlSeconds: 2 });

      vi.advanceTimersByTime(3_000);
      expect(await cache.has('ttl-key')).toBe(false);
    });

    it('expired key is removed from keys() list', async () => {
      vi.useFakeTimers();
      await cache.set('live', 'yes', { ttlSeconds: 10 });
      await cache.set('dead', 'no', { ttlSeconds: 1 });

      vi.advanceTimersByTime(2_000);
      const keys = await cache.keys();
      expect(keys).toContain('live');
      expect(keys).not.toContain('dead');
    });

    it('no-TTL entry lives indefinitely', async () => {
      vi.useFakeTimers();
      await cache.set('forever', 'value');

      vi.advanceTimersByTime(1_000_000);
      expect(await cache.get('forever')).toBe('value');
    });
  });

  // ---------------------------------------------------------------------------
  // Namespace
  // ---------------------------------------------------------------------------

  describe('namespace', () => {
    it('isolates keys under different namespaces', async () => {
      await cache.set('id', 'ns1-value', { namespace: 'ns1' });
      await cache.set('id', 'ns2-value', { namespace: 'ns2' });

      expect(await cache.get('id', 'ns1')).toBe('ns1-value');
      expect(await cache.get('id', 'ns2')).toBe('ns2-value');
      // Without namespace should miss.
      expect(await cache.get('id')).toBeNull();
    });

    it('clear with namespace only removes that namespace', async () => {
      await cache.set('a', 1, { namespace: 'ns1' });
      await cache.set('b', 2, { namespace: 'ns2' });

      await cache.clear('ns1');

      expect(await cache.get('a', 'ns1')).toBeNull();
      expect(await cache.get('b', 'ns2')).toBe(2);
    });

    it('clear without namespace removes everything', async () => {
      await cache.set('a', 1, { namespace: 'ns1' });
      await cache.set('b', 2);

      await cache.clear();

      expect(await cache.get('a', 'ns1')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });

    it('delete with namespace removes only the namespaced key', async () => {
      await cache.set('k', 'ns', { namespace: 'myns' });
      await cache.set('k', 'bare');

      await cache.delete('k', 'myns');

      expect(await cache.get('k', 'myns')).toBeNull();
      expect(await cache.get('k')).toBe('bare');
    });
  });

  // ---------------------------------------------------------------------------
  // LRU eviction
  // ---------------------------------------------------------------------------

  describe('LRU eviction', () => {
    it('evicts the least-recently-used entry when maxSize is reached', async () => {
      // maxSize = 5, fill to capacity.
      for (let i = 0; i < 5; i++) {
        await cache.set(`k${i}`, i);
      }

      // Access k0 so it becomes most-recently-used.
      await cache.get('k0');

      // Add a 6th entry — should evict k1 (oldest unaccessed).
      await cache.set('k5', 5);

      // k0 was accessed, should still be present.
      expect(await cache.get('k0')).toBe(0);
      // The new entry must be present.
      expect(await cache.get('k5')).toBe(5);
      // Total size should not exceed maxSize.
      expect(cache.getStats().size).toBeLessThanOrEqual(5);
    });

    it('does not exceed maxSize', async () => {
      for (let i = 0; i < 20; i++) {
        await cache.set(`key-${i}`, i);
      }
      expect(cache.getStats().size).toBeLessThanOrEqual(5);
    });

    it('updating an existing key does not grow the cache', async () => {
      for (let i = 0; i < 5; i++) {
        await cache.set(`k${i}`, i);
      }
      // Update an existing key.
      await cache.set('k0', 999);
      expect(cache.getStats().size).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // keys()
  // ---------------------------------------------------------------------------

  describe('keys()', () => {
    it('returns all keys when no pattern given', async () => {
      await cache.set('alpha', 1);
      await cache.set('beta', 2);

      const keys = await cache.keys();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
    });

    it('filters keys by glob pattern', async () => {
      await cache.set('user:1', 'a');
      await cache.set('user:2', 'b');
      await cache.set('post:1', 'c');

      const userKeys = await cache.keys('user:*');
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
      expect(userKeys).not.toContain('post:1');
    });
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  describe('stats', () => {
    it('tracks hits and misses correctly', async () => {
      await cache.set('x', 1);

      await cache.get('x');        // hit
      await cache.get('x');        // hit
      await cache.get('missing');  // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('calculates hitRate correctly', async () => {
      await cache.set('k', 'v');
      await cache.get('k');        // hit
      await cache.get('missing');  // miss

      const { hitRate } = cache.getStats();
      expect(hitRate).toBeCloseTo(0.5);
    });

    it('hitRate is 0 when there are no accesses', async () => {
      expect(cache.getStats().hitRate).toBe(0);
    });

    it('resetStats clears hits and misses', async () => {
      await cache.set('k', 'v');
      await cache.get('k');
      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('reports correct size', async () => {
      expect(cache.getStats().size).toBe(0);
      await cache.set('a', 1);
      await cache.set('b', 2);
      expect(cache.getStats().size).toBe(2);
    });
  });
});
