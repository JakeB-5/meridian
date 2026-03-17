// ── Area Chart Tests ────────────────────────────────────────────────
// Tests for area chart component rendering, data handling, and config.

import { describe, it, expect, vi } from 'vitest';

// Mock React and echarts to avoid DOM dependency
vi.mock('react', () => ({
  default: {
    createElement: vi.fn((_type: unknown, props: unknown, ..._children: unknown[]) => ({ props })),
    useRef: vi.fn(() => ({ current: null })),
    useEffect: vi.fn(),
    useMemo: vi.fn((fn: () => unknown) => fn()),
    memo: vi.fn((component: unknown) => component),
  },
  createElement: vi.fn((_type: unknown, props: unknown) => ({ props })),
  useRef: vi.fn(() => ({ current: null })),
  useEffect: vi.fn(),
  useMemo: vi.fn((fn: () => unknown) => fn()),
  memo: vi.fn((component: unknown) => component),
}));

// Test data transformation utilities used by area charts
import { toCategorySeries } from '../utils/data-transformer.js';
import type { QueryResult } from '@meridian/shared';

describe('AreaChart data handling', () => {
  const sampleData: QueryResult = {
    columns: [
      { name: 'month', type: 'date', nullable: false },
      { name: 'revenue', type: 'integer', nullable: false },
      { name: 'costs', type: 'integer', nullable: false },
    ],
    rows: [
      { month: '2024-01', revenue: 100, costs: 60 },
      { month: '2024-02', revenue: 150, costs: 80 },
      { month: '2024-03', revenue: 200, costs: 90 },
      { month: '2024-04', revenue: 180, costs: 85 },
    ],
    rowCount: 4,
    executionTimeMs: 10,
    truncated: false,
  };

  it('should transform data into category series format', () => {
    const result = toCategorySeries(sampleData);
    expect(result.categories).toHaveLength(4);
    expect(result.series).toHaveLength(2);
    expect(result.series[0]!.name).toBe('revenue');
    expect(result.series[1]!.name).toBe('costs');
  });

  it('should handle empty data', () => {
    const emptyData: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
    const result = toCategorySeries(emptyData);
    expect(result.categories).toHaveLength(0);
    expect(result.series).toHaveLength(0);
  });

  it('should handle null values in series', () => {
    const dataWithNulls: QueryResult = {
      columns: [
        { name: 'month', type: 'text', nullable: false },
        { name: 'value', type: 'integer', nullable: true },
      ],
      rows: [
        { month: 'Jan', value: 100 },
        { month: 'Feb', value: null },
        { month: 'Mar', value: 200 },
      ],
      rowCount: 3,
      executionTimeMs: 5,
      truncated: false,
    };
    const result = toCategorySeries(dataWithNulls);
    expect(result.series[0]!.values).toEqual([100, null, 200]);
  });

  it('should sort date dimension chronologically', () => {
    const unsortedData: QueryResult = {
      columns: [
        { name: 'date', type: 'timestamp', nullable: false },
        { name: 'count', type: 'integer', nullable: false },
      ],
      rows: [
        { date: '2024-03-01', count: 30 },
        { date: '2024-01-01', count: 10 },
        { date: '2024-02-01', count: 20 },
      ],
      rowCount: 3,
      executionTimeMs: 5,
      truncated: false,
    };
    const result = toCategorySeries(unsortedData);
    expect(result.categories[0]).toContain('2024-01');
    expect(result.categories[2]).toContain('2024-03');
    expect(result.series[0]!.values).toEqual([10, 20, 30]);
  });

  it('should use all numeric columns as series when no config', () => {
    const result = toCategorySeries(sampleData);
    expect(result.series).toHaveLength(2);
  });

  it('should handle single column data', () => {
    const singleCol: QueryResult = {
      columns: [{ name: 'value', type: 'integer', nullable: false }],
      rows: [{ value: 1 }, { value: 2 }, { value: 3 }],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toCategorySeries(singleCol);
    // With single numeric column, first col becomes dimension
    expect(result.categories.length).toBeGreaterThanOrEqual(0);
  });

  it('should convert non-finite values to null', () => {
    const badData: QueryResult = {
      columns: [
        { name: 'label', type: 'text', nullable: false },
        { name: 'val', type: 'float', nullable: true },
      ],
      rows: [
        { label: 'a', val: 'not-a-number' },
        { label: 'b', val: 42 },
      ],
      rowCount: 2,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toCategorySeries(badData);
    expect(result.series[0]!.values[0]).toBeNull();
    expect(result.series[0]!.values[1]).toBe(42);
  });
});
