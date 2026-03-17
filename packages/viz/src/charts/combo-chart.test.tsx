// ── Combo Chart Tests ───────────────────────────────────────────────
// Tests for combo chart data handling (multiple series types).

import { describe, it, expect } from 'vitest';
import { toCategorySeries, detectColumnRoles, getDimensionColumnIndex, getMeasureColumnIndices } from '../utils/data-transformer.js';
import type { QueryResult, VisualizationConfig } from '@meridian/shared';

describe('ComboChart data handling', () => {
  const sampleData: QueryResult = {
    columns: [
      { name: 'quarter', type: 'text', nullable: false },
      { name: 'revenue', type: 'integer', nullable: false },
      { name: 'profit', type: 'integer', nullable: false },
      { name: 'margin', type: 'float', nullable: false },
    ],
    rows: [
      { quarter: 'Q1', revenue: 1000, profit: 200, margin: 0.20 },
      { quarter: 'Q2', revenue: 1200, profit: 300, margin: 0.25 },
      { quarter: 'Q3', revenue: 1100, profit: 250, margin: 0.23 },
      { quarter: 'Q4', revenue: 1500, profit: 400, margin: 0.27 },
    ],
    rowCount: 4,
    executionTimeMs: 8,
    truncated: false,
  };

  it('should detect dimension and measure columns', () => {
    const roles = detectColumnRoles(sampleData.columns);
    expect(roles.dimensions).toContain(0); // quarter is text
    expect(roles.measures).toContain(1); // revenue
    expect(roles.measures).toContain(2); // profit
    expect(roles.measures).toContain(3); // margin
  });

  it('should transform into multiple series for combo charts', () => {
    const result = toCategorySeries(sampleData);
    expect(result.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(result.series).toHaveLength(3);
    expect(result.series.map((s) => s.name)).toEqual(['revenue', 'profit', 'margin']);
  });

  it('should allow selecting specific measure columns via config', () => {
    const config: VisualizationConfig = {
      type: 'combo',
      options: {
        measureColumns: ['revenue', 'margin'],
      },
    };
    const measureIndices = getMeasureColumnIndices(sampleData.columns, config);
    expect(measureIndices).toHaveLength(2);
    const result = toCategorySeries(sampleData, config);
    expect(result.series).toHaveLength(2);
    expect(result.series.map((s) => s.name)).toEqual(['revenue', 'margin']);
  });

  it('should respect explicit dimension column', () => {
    const config: VisualizationConfig = {
      type: 'combo',
      options: { dimensionColumn: 'quarter' },
    };
    const dimIdx = getDimensionColumnIndex(sampleData.columns, config);
    expect(dimIdx).toBe(0);
  });

  it('should handle all numeric columns', () => {
    const allNumeric: QueryResult = {
      columns: [
        { name: 'a', type: 'integer', nullable: false },
        { name: 'b', type: 'integer', nullable: false },
        { name: 'c', type: 'integer', nullable: false },
      ],
      rows: [
        { a: 1, b: 10, c: 100 },
        { a: 2, b: 20, c: 200 },
      ],
      rowCount: 2,
      executionTimeMs: 1,
      truncated: false,
    };
    const roles = detectColumnRoles(allNumeric.columns);
    // Fallback: first column becomes dimension
    expect(roles.dimensions).toContain(0);
  });
});
