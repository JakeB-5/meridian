// Tests for QueryRefreshHandler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryRefreshHandler } from './query-refresh.handler.js';
import type { WorkerConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuestion = {
  id: 'question-1',
  name: 'Monthly Revenue',
  type: 'sql' as const,
  dataSourceId: 'ds-1',
  query: { sql: 'SELECT month, SUM(revenue) FROM orders GROUP BY month' },
  visualization: {},
  organizationId: 'org-1',
  createdBy: 'user-1',
  isArchived: false,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDatasource = {
  id: 'ds-1',
  name: 'Production DB',
  type: 'postgresql' as const,
  config: { host: 'localhost', port: 5432, database: 'prod', username: 'app', password: 'secret' },
  organizationId: 'org-1',
  createdBy: 'user-1',
  status: 'active' as const,
  lastTestedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockQueryResult = {
  columns: [
    { name: 'month', type: 'text', nullable: true },
    { name: 'revenue', type: 'numeric', nullable: true },
  ],
  rows: [
    { month: '2024-01', revenue: 150000 },
    { month: '2024-02', revenue: 165000 },
  ],
  rowCount: 2,
  executionTimeMs: 45,
  truncated: false,
};

// Mock cache
const mockCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  has: vi.fn().mockResolvedValue(false),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
};

// Mock connector
const mockConnector = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  executeQuery: vi.fn().mockResolvedValue(mockQueryResult),
  testConnection: vi.fn().mockResolvedValue({ success: true, latencyMs: 10, message: 'OK' }),
  isConnected: vi.fn().mockReturnValue(true),
  getSchemas: vi.fn().mockResolvedValue([]),
  getTables: vi.fn().mockResolvedValue([]),
  getColumns: vi.fn().mockResolvedValue([]),
  getVersion: vi.fn().mockResolvedValue('14.0'),
  cancelQuery: vi.fn().mockResolvedValue(undefined),
  type: 'postgresql',
  id: 'ds-1',
  name: 'Production DB',
};

// Mock DB repositories
const mockQuestionRepo = {
  findById: vi.fn().mockResolvedValue(mockQuestion),
};
const mockDatasourceRepo = {
  findById: vi.fn().mockResolvedValue(mockDatasource),
};

// ---------------------------------------------------------------------------
// Module mocks via vi.mock
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({
  createDatabaseFromUrl: vi.fn().mockReturnValue({}),
  QuestionRepository: vi.fn().mockImplementation(() => mockQuestionRepo),
  DataSourceRepository: vi.fn().mockImplementation(() => mockDatasourceRepo),
}));

vi.mock('@meridian/connectors', () => ({
  createConnector: vi.fn().mockReturnValue(mockConnector),
}));

vi.mock('@meridian/cache', () => ({
  generateCacheKey: vi.fn().mockReturnValue('query:question-1:v1'),
  MultiLayerCache: vi.fn().mockImplementation(() => mockCache),
  MemoryCache: vi.fn(),
  RedisCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
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

describe('QueryRefreshHandler', () => {
  let handler: QueryRefreshHandler;
  let progressCalls: number[];

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new QueryRefreshHandler(config, mockCache as unknown as import('@meridian/cache').MultiLayerCache);
    progressCalls = [];
  });

  const trackProgress = async (pct: number) => {
    progressCalls.push(pct);
  };

  it('should refresh a SQL question and cache the result', async () => {
    const result = await handler.handle(
      { type: 'query_refresh', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    expect(result.questionId).toBe('question-1');
    expect(result.rowCount).toBe(2);
    expect(result.cacheKey).toBe('query:question-1:v1');
    expect(result.cachedAt).toBeDefined();
    expect(result.executionTimeMs).toBe(45);
  });

  it('should report progress from 5 to 100', async () => {
    await handler.handle(
      { type: 'query_refresh', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    expect(progressCalls[0]).toBe(5);
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
    // Progress is monotonically non-decreasing
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i]!).toBeGreaterThanOrEqual(progressCalls[i - 1]!);
    }
  });

  it('should throw when questionId is missing', async () => {
    await expect(
      handler.handle({ type: 'query_refresh', organizationId: 'org-1' }, trackProgress),
    ).rejects.toThrow('questionId is required');
  });

  it('should throw when question is not found', async () => {
    mockQuestionRepo.findById.mockResolvedValueOnce(null);

    await expect(
      handler.handle(
        { type: 'query_refresh', questionId: 'missing-question', organizationId: 'org-1' },
        trackProgress,
      ),
    ).rejects.toThrow('Question not found');
  });

  it('should throw when datasource is not found', async () => {
    mockDatasourceRepo.findById.mockResolvedValueOnce(null);

    await expect(
      handler.handle(
        { type: 'query_refresh', questionId: 'question-1', organizationId: 'org-1' },
        trackProgress,
      ),
    ).rejects.toThrow('DataSource not found');
  });

  it('should throw when question has no SQL', async () => {
    mockQuestionRepo.findById.mockResolvedValueOnce({
      ...mockQuestion,
      type: 'visual',
      query: { type: 'visual', source: 'orders', aggregations: [] },
    });

    await expect(
      handler.handle(
        { type: 'query_refresh', questionId: 'question-1', organizationId: 'org-1' },
        trackProgress,
      ),
    ).rejects.toThrow('no executable SQL');
  });

  it('should use custom cacheTtl when provided', async () => {
    const { generateCacheKey } = await import('@meridian/cache');

    await handler.handle(
      {
        type: 'query_refresh',
        questionId: 'question-1',
        organizationId: 'org-1',
        cacheTtl: 3600,
      },
      trackProgress,
    );

    expect(mockCache.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ ttlSeconds: 3600 }),
    );
  });

  it('should disconnect connector even when query fails', async () => {
    mockConnector.executeQuery.mockRejectedValueOnce(new Error('Query timeout'));

    await expect(
      handler.handle(
        { type: 'query_refresh', questionId: 'question-1', organizationId: 'org-1' },
        trackProgress,
      ),
    ).rejects.toThrow('Query timeout');

    expect(mockConnector.disconnect).toHaveBeenCalled();
  });

  it('should cache with correct key structure', async () => {
    const { generateCacheKey } = await import('@meridian/cache');
    vi.mocked(generateCacheKey).mockReturnValueOnce('query:question-1:v1');

    await handler.handle(
      { type: 'query_refresh', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    expect(generateCacheKey).toHaveBeenCalledWith({
      namespace: 'query',
      identifier: 'question-1',
      version: 'v1',
    });
    expect(mockCache.set).toHaveBeenCalledWith(
      'query:question-1:v1',
      mockQueryResult,
      expect.any(Object),
    );
  });
});
