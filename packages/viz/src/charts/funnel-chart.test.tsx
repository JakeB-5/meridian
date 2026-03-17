// ── Funnel Chart Tests ──────────────────────────────────────────────
// Tests for funnel chart data transformation (sorted descending).

import { describe, it, expect } from 'vitest';
import { toFunnelData } from '../utils/data-transformer.js';
import type { QueryResult } from '@meridian/shared';

describe('FunnelChart data handling', () => {
  const sampleData: QueryResult = {
    columns: [
      { name: 'stage', type: 'text', nullable: false },
      { name: 'count', type: 'integer', nullable: false },
    ],
    rows: [
      { stage: 'Visit', count: 1000 },
      { stage: 'Signup', count: 500 },
      { stage: 'Trial', count: 200 },
      { stage: 'Purchase', count: 50 },
    ],
    rowCount: 4,
    executionTimeMs: 3,
    truncated: false,
  };

  it('should sort funnel slices descending by value', () => {
    const result = toFunnelData(sampleData);
    expect(result).toHaveLength(4);
    expect(result[0]!.value).toBeGreaterThanOrEqual(result[1]!.value);
    expect(result[1]!.value).toBeGreaterThanOrEqual(result[2]!.value);
    expect(result[2]!.value).toBeGreaterThanOrEqual(result[3]!.value);
  });

  it('should preserve labels', () => {
    const result = toFunnelData(sampleData);
    const names = result.map((s) => s.name);
    expect(names).toContain('Visit');
    expect(names).toContain('Purchase');
  });

  it('should handle empty data', () => {
    const emptyData: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
    const result = toFunnelData(emptyData);
    expect(result).toHaveLength(0);
  });

  it('should handle already sorted data', () => {
    const sortedData: QueryResult = {
      columns: [
        { name: 'step', type: 'text', nullable: false },
        { name: 'users', type: 'integer', nullable: false },
      ],
      rows: [
        { step: 'A', users: 500 },
        { step: 'B', users: 300 },
        { step: 'C', users: 100 },
      ],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toFunnelData(sortedData);
    expect(result[0]!.name).toBe('A');
    expect(result[0]!.value).toBe(500);
    expect(result[2]!.name).toBe('C');
    expect(result[2]!.value).toBe(100);
  });

  it('should handle reverse-sorted data', () => {
    const reverseData: QueryResult = {
      columns: [
        { name: 'step', type: 'text', nullable: false },
        { name: 'users', type: 'integer', nullable: false },
      ],
      rows: [
        { step: 'C', users: 100 },
        { step: 'B', users: 300 },
        { step: 'A', users: 500 },
      ],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toFunnelData(reverseData);
    expect(result[0]!.value).toBe(500);
    expect(result[2]!.value).toBe(100);
  });

  it('should filter out zero-value slices', () => {
    const dataWithZeros: QueryResult = {
      columns: [
        { name: 'stage', type: 'text', nullable: false },
        { name: 'count', type: 'integer', nullable: false },
      ],
      rows: [
        { stage: 'A', count: 100 },
        { stage: 'B', count: 0 },
        { stage: 'C', count: 50 },
      ],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toFunnelData(dataWithZeros);
    // toPieData filters out value <= 0
    expect(result.every((s) => s.value > 0)).toBe(true);
  });

  it('should handle equal values', () => {
    const equalData: QueryResult = {
      columns: [
        { name: 'stage', type: 'text', nullable: false },
        { name: 'count', type: 'integer', nullable: false },
      ],
      rows: [
        { stage: 'A', count: 100 },
        { stage: 'B', count: 100 },
        { stage: 'C', count: 100 },
      ],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toFunnelData(equalData);
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.value === 100)).toBe(true);
  });
});
