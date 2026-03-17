import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withCache, invalidateCache, invalidateCacheNamespace } from './cacheable.js';
import { MemoryCache } from '../providers/memory-cache.js';
import type { CacheProvider } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimpleProvider(): CacheProvider {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async <T>(key: string): Promise<T | null> => (store.get(key) as T) ?? null) as CacheProvider['get'],
    set: vi.fn(async <T>(key: string, value: T): Promise<void> => { store.set(key, value); }),
    delete: vi.fn(async (key: string): Promise<boolean> => store.delete(key)),
    has: vi.fn(async (key: string): Promise<boolean> => store.has(key)),
    clear: vi.fn(async (): Promise<void> => { store.clear(); }),
    keys: vi.fn(async (): Promise<string[]> => Array.from(store.keys())),
  };
}

// ---------------------------------------------------------------------------
// withCache
// ---------------------------------------------------------------------------

describe('withCache', () => {
  let cache: CacheProvider;

  beforeEach(() => {
    cache = makeSimpleProvider();
  });

  it('calls the wrapped function on first invocation (cache miss)', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const cached = withCache<string>(cache, () => 'my-key')(fn);

    const result = await cached();
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on second invocation (cache hit)', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const cached = withCache<string>(cache, () => 'my-key')(fn);

    await cached(); // miss — stores result
    await cached(); // hit — fn should not be called again

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to keyFn', async () => {
    const keyFn = vi.fn((...args: unknown[]) => `key:${args[0]}`);
    const fn = vi.fn().mockResolvedValue(42);
    const cached = withCache<number>(cache, keyFn)(fn);

    await cached('arg1');

    expect(keyFn).toHaveBeenCalledWith('arg1');
    expect(cache.get).toHaveBeenCalledWith('key:arg1');
  });

  it('passes arguments to the wrapped function on cache miss', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const cached = withCache<string>(cache, (a: unknown) => `k:${a}`)(fn);

    await cached('foo');

    expect(fn).toHaveBeenCalledWith('foo');
  });

  it('stores result in cache after a miss', async () => {
    const fn = vi.fn().mockResolvedValue('stored-value');
    const cached = withCache<string>(cache, () => 'the-key')(fn);

    await cached();
    // Allow micro-task for the fire-and-forget set to complete.
    await Promise.resolve();

    expect(cache.set).toHaveBeenCalledWith('the-key', 'stored-value', undefined);
  });

  it('forwards cache options (TTL, namespace) to cache.set', async () => {
    const fn = vi.fn().mockResolvedValue('val');
    const opts = { ttlSeconds: 30, namespace: 'test-ns' };
    const cached = withCache<string>(cache, () => 'k', opts)(fn);

    await cached();
    await Promise.resolve();

    expect(cache.set).toHaveBeenCalledWith('k', 'val', opts);
  });

  it('bypasses cache when keyFn returns empty string', async () => {
    const fn = vi.fn().mockResolvedValue('direct');
    const cached = withCache<string>(cache, () => '')(fn);

    const result = await cached();

    expect(result).toBe('direct');
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('each unique key has independent cache state', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce('for-a')
      .mockResolvedValueOnce('for-b');
    const cached = withCache<string>(cache, (k: unknown) => String(k))(fn);

    const ra = await cached('a');
    const rb = await cached('b');

    expect(ra).toBe('for-a');
    expect(rb).toBe('for-b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('serves second call from cache for same key', async () => {
    const fn = vi.fn().mockResolvedValue('cached-val');
    const cached = withCache<string>(cache, () => 'same-key')(fn);

    const r1 = await cached();
    await Promise.resolve(); // allow fire-and-forget set
    const r2 = await cached();

    expect(r1).toBe('cached-val');
    expect(r2).toBe('cached-val');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('works with a real MemoryCache', async () => {
    const realCache = new MemoryCache();
    const fn = vi.fn().mockResolvedValue({ data: [1, 2, 3] });
    const cached = withCache<{ data: number[] }>(realCache, () => 'data-key')(fn);

    const r1 = await cached();
    await Promise.resolve();
    const r2 = await cached();

    expect(r1).toEqual({ data: [1, 2, 3] });
    expect(r2).toEqual({ data: [1, 2, 3] });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not suppress errors thrown by the wrapped function', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const cached = withCache<string>(cache, () => 'k')(fn);

    await expect(cached()).rejects.toThrow('boom');
  });
});

// ---------------------------------------------------------------------------
// invalidateCache
// ---------------------------------------------------------------------------

describe('invalidateCache', () => {
  it('calls cache.delete with the given key', async () => {
    const cache = makeSimpleProvider();
    await invalidateCache(cache, 'my-key');
    expect(cache.delete).toHaveBeenCalledWith('my-key');
  });

  it('returns true when key existed', async () => {
    const cache = makeSimpleProvider();
    await cache.set('k', 'v');
    const result = await invalidateCache(cache, 'k');
    expect(result).toBe(true);
  });

  it('returns false when key did not exist', async () => {
    const cache = makeSimpleProvider();
    const result = await invalidateCache(cache, 'ghost');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// invalidateCacheNamespace
// ---------------------------------------------------------------------------

describe('invalidateCacheNamespace', () => {
  it('calls cache.clear with the given namespace', async () => {
    const cache = makeSimpleProvider();
    await invalidateCacheNamespace(cache, 'my-ns');
    expect(cache.clear).toHaveBeenCalledWith('my-ns');
  });

  it('resolves without error', async () => {
    const cache = makeSimpleProvider();
    await expect(invalidateCacheNamespace(cache, 'ns')).resolves.toBeUndefined();
  });
});
