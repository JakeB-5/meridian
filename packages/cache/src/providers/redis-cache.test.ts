import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RedisCache } from './redis-cache.js';
import { CacheConnectionError, CacheSerializationError } from '../errors.js';

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------

const mockRedisInstance = {
  status: 'ready' as string,
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue(['0', []]),
  on: vi.fn(),
};

vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => mockRedisInstance);
  return { default: MockRedis };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache(overrides?: Partial<ConstructorParameters<typeof RedisCache>[0]>): RedisCache {
  return new RedisCache({
    connection: 'redis://localhost:6379',
    keyPrefix: 'test',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RedisCache', () => {
  let cache: RedisCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisInstance.status = 'ready';
    cache = makeCache();
    await cache.connect();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  // ---------------------------------------------------------------------------
  // Connection management
  // ---------------------------------------------------------------------------

  describe('connection management', () => {
    it('connect() calls client.connect()', () => {
      expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('isConnected() returns true when status is ready', () => {
      expect(cache.isConnected()).toBe(true);
    });

    it('isConnected() returns false when status is not ready', () => {
      mockRedisInstance.status = 'end';
      expect(cache.isConnected()).toBe(false);
    });

    it('disconnect() calls client.quit()', async () => {
      await cache.disconnect();
      expect(mockRedisInstance.quit).toHaveBeenCalledTimes(1);
    });

    it('connect() is idempotent — second call is a no-op', async () => {
      await cache.connect(); // second call
      expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('throws CacheConnectionError when not connected', async () => {
      const disconnectedCache = makeCache();
      // Do NOT call connect()
      await expect(disconnectedCache.get('key')).rejects.toBeInstanceOf(CacheConnectionError);
    });
  });

  // ---------------------------------------------------------------------------
  // get
  // ---------------------------------------------------------------------------

  describe('get()', () => {
    it('returns null on cache miss', async () => {
      mockRedisInstance.get.mockResolvedValueOnce(null);
      expect(await cache.get('missing')).toBeNull();
    });

    it('returns deserialized value on hit', async () => {
      mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify({ id: 1 }));
      expect(await cache.get<{ id: number }>('obj')).toEqual({ id: 1 });
    });

    it('uses namespaced key when namespace provided', async () => {
      mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify('val'));
      await cache.get('key', 'ns');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test:ns:key');
    });

    it('uses prefixed key without namespace', async () => {
      mockRedisInstance.get.mockResolvedValueOnce(null);
      await cache.get('key');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test:key');
    });

    it('throws CacheSerializationError on invalid JSON', async () => {
      mockRedisInstance.get.mockResolvedValueOnce('not-valid-json{{{');
      await expect(cache.get('bad')).rejects.toBeInstanceOf(CacheSerializationError);
    });
  });

  // ---------------------------------------------------------------------------
  // set
  // ---------------------------------------------------------------------------

  describe('set()', () => {
    it('calls Redis SET with serialized value', async () => {
      await cache.set('key', { x: 1 });
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:key',
        JSON.stringify({ x: 1 }),
      );
    });

    it('calls Redis SET with EX when TTL is provided', async () => {
      await cache.set('key', 'val', { ttlSeconds: 30 });
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:key',
        JSON.stringify('val'),
        'EX',
        30,
      );
    });

    it('uses namespaced key when namespace provided', async () => {
      await cache.set('key', 'val', { namespace: 'ns' });
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:ns:key',
        expect.any(String),
      );
    });

    it('uses defaultTtlSeconds when no per-operation TTL given', async () => {
      const cacheWithDefault = makeCache({ defaultTtlSeconds: 60 });
      await cacheWithDefault.connect();
      vi.clearAllMocks(); // clear connect call
      await cacheWithDefault.set('k', 'v');
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:k',
        expect.any(String),
        'EX',
        60,
      );
      await cacheWithDefault.disconnect();
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('returns true when Redis DEL removes the key', async () => {
      mockRedisInstance.del.mockResolvedValueOnce(1);
      expect(await cache.delete('key')).toBe(true);
    });

    it('returns false when key did not exist', async () => {
      mockRedisInstance.del.mockResolvedValueOnce(0);
      expect(await cache.delete('missing')).toBe(false);
    });

    it('deletes the correct prefixed key', async () => {
      await cache.delete('key');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('test:key');
    });
  });

  // ---------------------------------------------------------------------------
  // has
  // ---------------------------------------------------------------------------

  describe('has()', () => {
    it('returns true when EXISTS > 0', async () => {
      mockRedisInstance.exists.mockResolvedValueOnce(1);
      expect(await cache.has('key')).toBe(true);
    });

    it('returns false when EXISTS = 0', async () => {
      mockRedisInstance.exists.mockResolvedValueOnce(0);
      expect(await cache.has('missing')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------

  describe('clear()', () => {
    it('scans and deletes namespace pattern', async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(['0', ['test:ns:a', 'test:ns:b']]);

      await cache.clear('ns');

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'test:ns:*',
        'COUNT',
        100,
      );
      expect(mockRedisInstance.del).toHaveBeenCalledWith('test:ns:a', 'test:ns:b');
    });

    it('scans all keys when no namespace given', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', ['test:a']]);

      await cache.clear();

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'test:*',
        'COUNT',
        100,
      );
    });

    it('handles empty scan result without calling DEL', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      await cache.clear('empty-ns');

      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });

    it('iterates multiple scan pages until cursor is 0', async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(['42', ['test:ns:a']])
        .mockResolvedValueOnce(['0', ['test:ns:b']]);

      await cache.clear('ns');

      expect(mockRedisInstance.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisInstance.del).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // keys
  // ---------------------------------------------------------------------------

  describe('keys()', () => {
    it('returns prefixed keys from scan', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', ['test:a', 'test:b']]);

      const keys = await cache.keys();
      expect(keys).toEqual(['test:a', 'test:b']);
    });

    it('uses pattern when provided', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      await cache.keys('user:*');

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'test:user:*',
        'COUNT',
        100,
      );
    });
  });
});
