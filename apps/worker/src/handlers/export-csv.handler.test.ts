// Tests for ExportCsvHandler and formatAsCsv utility

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExportCsvHandler, formatAsCsv } from './export-csv.handler.js';
import type { WorkerConfig } from '../config.js';
import type { QueryResult } from '@meridian/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockQuestion = {
  id: 'question-1',
  name: 'Revenue Report',
  type: 'sql' as const,
  dataSourceId: 'ds-1',
  query: { sql: 'SELECT id, name, amount FROM orders' },
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
  config: { host: 'localhost', port: 5432, database: 'prod', username: 'app', password: 's3cr3t' },
  organizationId: 'org-1',
  createdBy: 'user-1',
  status: 'active' as const,
  lastTestedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockQueryResult: QueryResult = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'name', type: 'text', nullable: true },
    { name: 'amount', type: 'numeric', nullable: true },
  ],
  rows: [
    { id: 1, name: 'Alice', amount: 100.5 },
    { id: 2, name: 'Bob, Jr.', amount: 200 },
    { id: 3, name: 'Carol "CEO"', amount: 350.75 },
  ],
  rowCount: 3,
  executionTimeMs: 20,
  truncated: false,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuestionRepo = { findById: vi.fn().mockResolvedValue(mockQuestion) };
const mockDatasourceRepo = { findById: vi.fn().mockResolvedValue(mockDatasource) };
const mockConnector = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  executeQuery: vi.fn().mockResolvedValue(mockQueryResult),
  type: 'postgresql',
  id: 'ds-1',
  name: 'Production DB',
};

vi.mock('@meridian/db', () => ({
  createDatabaseFromUrl: vi.fn().mockReturnValue({}),
  QuestionRepository: vi.fn().mockImplementation(() => mockQuestionRepo),
  DataSourceRepository: vi.fn().mockImplementation(() => mockDatasourceRepo),
}));

vi.mock('@meridian/connectors', () => ({
  createConnector: vi.fn().mockReturnValue(mockConnector),
}));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TMP_DIR = '/tmp/meridian-test-csv';

const config: WorkerConfig = {
  redisUrl: 'redis://localhost:6379',
  databaseUrl: 'postgresql://user:pass@localhost/test',
  queueName: 'meridian',
  concurrency: 5,
  healthPort: 3002,
  logLevel: 'error',
  tmpDir: TMP_DIR,
};

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe('ExportCsvHandler', () => {
  let handler: ExportCsvHandler;
  let progressCalls: number[];

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ExportCsvHandler(config);
    progressCalls = [];
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp files
    try {
      const files = fs.readdirSync(TMP_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TMP_DIR, file));
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  const trackProgress = async (pct: number) => {
    progressCalls.push(pct);
  };

  it('should export a CSV file and return metadata', async () => {
    const result = await handler.handle(
      { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    expect(result.questionId).toBe('question-1');
    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(3);
    expect(result.filename).toMatch(/\.csv$/);
    expect(result.fileSizeBytes).toBeGreaterThan(0);
    expect(result.exportedAt).toBeDefined();
    expect(result.filePath).toContain(TMP_DIR);
  });

  it('should write a readable CSV file to disk', async () => {
    const result = await handler.handle(
      { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('id,name,amount');
    expect(content).toContain('1,Alice,100.5');
  });

  it('should quote fields that contain commas', async () => {
    const result = await handler.handle(
      { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('"Bob, Jr."');
  });

  it('should quote fields that contain double-quotes', async () => {
    const result = await handler.handle(
      { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    const content = fs.readFileSync(result.filePath, 'utf-8');
    // Embedded " are doubled: Carol "CEO" → "Carol ""CEO"""
    expect(content).toContain('"Carol ""CEO"""');
  });

  it('should use custom filename when provided', async () => {
    const result = await handler.handle(
      {
        type: 'export_csv',
        questionId: 'question-1',
        organizationId: 'org-1',
        filename: 'my_report',
      },
      trackProgress,
    );

    expect(result.filename).toBe('my_report.csv');
  });

  it('should report progress from 5 to 100', async () => {
    await handler.handle(
      { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
      trackProgress,
    );

    expect(progressCalls[0]).toBe(5);
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
  });

  it('should throw when questionId is missing', async () => {
    await expect(
      handler.handle({ type: 'export_csv', organizationId: 'org-1' }, trackProgress),
    ).rejects.toThrow('questionId is required');
  });

  it('should throw for visual (non-SQL) questions', async () => {
    mockQuestionRepo.findById.mockResolvedValueOnce({
      ...mockQuestion,
      type: 'visual',
      query: { source: 'orders', aggregations: [] },
    });

    await expect(
      handler.handle(
        { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
        trackProgress,
      ),
    ).rejects.toThrow('no executable SQL');
  });

  it('should disconnect connector even if query fails', async () => {
    mockConnector.executeQuery.mockRejectedValueOnce(new Error('Connection reset'));

    await expect(
      handler.handle(
        { type: 'export_csv', questionId: 'question-1', organizationId: 'org-1' },
        trackProgress,
      ),
    ).rejects.toThrow('Connection reset');

    expect(mockConnector.disconnect).toHaveBeenCalled();
  });

  it('should support custom delimiter', async () => {
    const result = await handler.handle(
      {
        type: 'export_csv',
        questionId: 'question-1',
        organizationId: 'org-1',
        delimiter: ';',
      },
      trackProgress,
    );

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('id;name;amount');
  });

  it('should omit header when includeHeader is false', async () => {
    const result = await handler.handle(
      {
        type: 'export_csv',
        questionId: 'question-1',
        organizationId: 'org-1',
        includeHeader: false,
      },
      trackProgress,
    );

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).not.toContain('id,name,amount');
    expect(content).toContain('1,Alice,100.5');
  });
});

// ---------------------------------------------------------------------------
// formatAsCsv unit tests
// ---------------------------------------------------------------------------

describe('formatAsCsv', () => {
  const result: QueryResult = {
    columns: [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'name', type: 'text', nullable: true },
      { name: 'value', type: 'numeric', nullable: true },
    ],
    rows: [
      { id: 1, name: 'Alpha', value: 1.5 },
      { id: 2, name: 'Beta', value: null },
    ],
    rowCount: 2,
    executionTimeMs: 10,
    truncated: false,
  };

  it('should produce a header row by default', () => {
    const csv = formatAsCsv(result);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('id,name,value');
  });

  it('should produce the correct number of data rows', () => {
    const csv = formatAsCsv(result);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3); // 1 header + 2 data
  });

  it('should represent null values as empty strings', () => {
    const csv = formatAsCsv(result);
    expect(csv).toContain('2,Beta,');
  });

  it('should quote fields with commas', () => {
    const r: QueryResult = {
      ...result,
      rows: [{ id: 1, name: 'Smith, John', value: 10 }],
      rowCount: 1,
    };
    const csv = formatAsCsv(r);
    expect(csv).toContain('"Smith, John"');
  });

  it('should double-quote embedded double-quote characters', () => {
    const r: QueryResult = {
      ...result,
      rows: [{ id: 1, name: 'He said "hello"', value: 0 }],
      rowCount: 1,
    };
    const csv = formatAsCsv(r);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('should quote fields with newlines', () => {
    const r: QueryResult = {
      ...result,
      rows: [{ id: 1, name: 'line1\nline2', value: 0 }],
      rowCount: 1,
    };
    const csv = formatAsCsv(r);
    expect(csv).toContain('"line1\nline2"');
  });

  it('should use custom delimiter', () => {
    const csv = formatAsCsv(result, { includeHeader: true, delimiter: '\t' });
    const header = csv.split('\r\n')[0];
    expect(header).toBe('id\tname\tvalue');
  });

  it('should omit header when includeHeader is false', () => {
    const csv = formatAsCsv(result, { includeHeader: false, delimiter: ',' });
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('1,Alpha,1.5');
  });

  it('should serialize Date values as ISO strings', () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    const r: QueryResult = {
      columns: [{ name: 'created_at', type: 'timestamp', nullable: false }],
      rows: [{ created_at: date }],
      rowCount: 1,
      executionTimeMs: 5,
      truncated: false,
    };
    const csv = formatAsCsv(r);
    expect(csv).toContain('2024-01-15T00:00:00.000Z');
  });

  it('should serialize objects as JSON', () => {
    const r: QueryResult = {
      columns: [{ name: 'data', type: 'json', nullable: true }],
      rows: [{ data: { key: 'value' } }],
      rowCount: 1,
      executionTimeMs: 5,
      truncated: false,
    };
    const csv = formatAsCsv(r);
    expect(csv).toContain('{"key":"value"}');
  });

  it('should handle empty result set', () => {
    const r: QueryResult = { ...result, rows: [], rowCount: 0 };
    const csv = formatAsCsv(r);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1); // Only header
  });

  it('should handle empty columns', () => {
    const r: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
    const csv = formatAsCsv(r);
    expect(csv).toBe('');
  });
});
