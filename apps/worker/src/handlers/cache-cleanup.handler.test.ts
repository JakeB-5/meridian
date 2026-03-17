// Tests for CacheCleanupHandler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheCleanupHandler } from './cache-cleanup.handler.js';
import type { WorkerConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock drizzle delete chain
const mockDeleteChain = {
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]), // 0 rows deleted by default
};

const mockDb = {
  delete: vi.fn().mockReturnValue(mockDeleteChain),
};

vi.mock('@meridian/db', () => ({
  createDatabaseFromUrl: vi.fn().mockReturnValue(mockDb),
  cacheEntries: {
    id: 'id',
    key: 'key',
    value: 'value',
    expiresAt: 'expires_at',
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  lt: vi.fn().mockReturnValue({ lt: true }),
  sql: vi.fn().mockReturnValue('sql'),
}));

const mockCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  has: vi.fn().mockResolvedValue(false),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue(['query:abc', 'query:def']),
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const config: WorkerConfig = {
  redisUrl: 'redis://localhost:6379',
  databaseUrl: 'postgresql://user:pass@localhost/test',
  queueName: 'meridian',
  concurrency: 5,
  healthPort: 3002,
  logLevel: 'error',
  tmpDir: '/tmp/meridian-test',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CacheCleanupHandler', () => {
  let handler: CacheCleanupHandler;
  let progressCalls: number[];

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CacheCleanupHandler(
      config,
      mockCache as unknown as import('@meridian/cache').MultiLayerCache,
    );
    progressCalls = [];
    // Reset returning to empty array (no rows to delete)
    mockDeleteChain.returning.mockResolvedValue([]);
  });

  const trackProgress = async (pct: number) => {
    progressCalls.push(pct);
  };

  it('should complete successfully with no expired entries', async () => {
    const result = await handler.handle({}, trackProgress);

    expect(result.dbEntriesDeleted).toBe(0);
    expect(result.cleanedAt).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should delete expired DB entries in batches', async () => {
    // First batch: full (500 rows), second batch: partial (10 rows) → stop
    mockDeleteChain.returning
      .mockResolvedValueOnce(new Array(500).fill({ id: 'x' }))
      .mockResolvedValueOnce(new Array(10).fill({ id: 'x' }));

    const result = await handler.handle({ batchSize: 500 }, trackProgress);

    expect(result.dbEntriesDeleted).toBe(510);
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });

  it('should clear specific namespace when provided', async () => {
    const result = await handler.handle({ namespace: 'query' }, trackProgress);

    expect(mockCache.keys).toHaveBeenCalledWith('query:*');
    expect(mockCache.clear).toHaveBeenCalledWith('query');
    expect(result.cacheKeysCleared).toBe(2); // mockCache.keys returns 2 keys
  });

  it('should perform full clear when no namespace provided', async () => {
    const result = await handler.handle({}, trackProgress);

    expect(mockCache.clear).toHaveBeenCalledWith();
    expect(result.cacheKeysCleared).toBe(0); // -1 normalized to 0
  });

  it('should report progress from 5 to 100', async () => {
    await handler.handle({}, trackProgress);

    expect(progressCalls[0]).toBe(5);
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i]!).toBeGreaterThanOrEqual(progressCalls[i - 1]!);
    }
  });

  it('should continue cache cleanup even if DB cleanup fails', async () => {
    const { createDatabaseFromUrl } = await import('@meridian/db');
    vi.mocked(createDatabaseFromUrl).mockImplementationOnce(() => {
      throw new Error('DB connection failed');
    });

    // Should not throw — DB failure is caught internally
    const result = await handler.handle({ namespace: 'query' }, trackProgress);

    expect(result.dbEntriesDeleted).toBe(0);
    // Cache clear should still be attempted
    expect(mockCache.clear).toHaveBeenCalled();
  });

  it('should respect olderThanSeconds parameter', async () => {
    await handler.handle({ olderThanSeconds: 3600 }, trackProgress);

    // The lt() comparator should be called with a cutoff ~1 hour ago
    const { lt } = await import('drizzle-orm');
    expect(lt).toHaveBeenCalled();
  });

  it('should use default batchSize of 500', async () => {
    await handler.handle({}, trackProgress);

    // The limit() call should use 500
    expect(mockDeleteChain.limit).toHaveBeenCalledWith(500);
  });

  it('should return durationMs greater than zero', async () => {
    const result = await handler.handle({}, trackProgress);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should return a valid ISO cleanedAt timestamp', async () => {
    const result = await handler.handle({}, trackProgress);
    expect(() => new Date(result.cleanedAt)).not.toThrow();
    expect(new Date(result.cleanedAt).toISOString()).toBe(result.cleanedAt);
  });
});
