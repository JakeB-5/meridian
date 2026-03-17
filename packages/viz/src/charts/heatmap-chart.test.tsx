// ── Heatmap Chart Tests ─────────────────────────────────────────────
// Tests for heatmap data transformation.

import { describe, it, expect } from 'vitest';
import { toHeatmapData } from '../utils/data-transformer.js';
import type { QueryResult, VisualizationConfig } from '@meridian/shared';

describe('HeatmapChart data handling', () => {
  const sampleData: QueryResult = {
    columns: [
      { name: 'day', type: 'text', nullable: false },
      { name: 'hour', type: 'text', nullable: false },
      { name: 'count', type: 'integer', nullable: false },
    ],
    rows: [
      { day: 'Mon', hour: '9am', count: 10 },
      { day: 'Mon', hour: '10am', count: 25 },
      { day: 'Tue', hour: '9am', count: 15 },
      { day: 'Tue', hour: '10am', count: 30 },
      { day: 'Wed', hour: '9am', count: 5 },
      { day: 'Wed', hour: '10am', count: 20 },
    ],
    rowCount: 6,
    executionTimeMs: 5,
    truncated: false,
  };

  it('should extract unique x and y labels', () => {
    const result = toHeatmapData(sampleData);
    expect(result.xLabels).toEqual(['Mon', 'Tue', 'Wed']);
    expect(result.yLabels).toEqual(['9am', '10am']);
  });

  it('should generate heatmap points with x, y indices', () => {
    const result = toHeatmapData(sampleData);
    expect(result.points).toHaveLength(6);
    // First point: Mon, 9am -> x=0, y=0
    expect(result.points[0]!.x).toBe(0);
    expect(result.points[0]!.y).toBe(0);
    expect(result.points[0]!.value).toBe(10);
  });

  it('should compute min and max values', () => {
    const result = toHeatmapData(sampleData);
    expect(result.min).toBe(5);
    expect(result.max).toBe(30);
  });

  it('should handle empty data', () => {
    const emptyData: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
    const result = toHeatmapData(emptyData);
    expect(result.xLabels).toHaveLength(0);
    expect(result.yLabels).toHaveLength(0);
    expect(result.points).toHaveLength(0);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
  });

  it('should use config column mappings', () => {
    const config: VisualizationConfig = {
      type: 'heatmap',
      options: {
        xColumn: 'day',
        yColumn: 'hour',
        valueColumn: 'count',
      },
    };
    const result = toHeatmapData(sampleData, config);
    expect(result.xLabels).toEqual(['Mon', 'Tue', 'Wed']);
    expect(result.yLabels).toEqual(['9am', '10am']);
  });

  it('should handle single row', () => {
    const singleRow: QueryResult = {
      columns: [
        { name: 'x', type: 'text', nullable: false },
        { name: 'y', type: 'text', nullable: false },
        { name: 'val', type: 'integer', nullable: false },
      ],
      rows: [{ x: 'A', y: 'B', val: 42 }],
      rowCount: 1,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toHeatmapData(singleRow);
    expect(result.xLabels).toEqual(['A']);
    expect(result.yLabels).toEqual(['B']);
    expect(result.min).toBe(42);
    expect(result.max).toBe(42);
    expect(result.points).toHaveLength(1);
  });

  it('should handle null values as 0', () => {
    const dataWithNull: QueryResult = {
      columns: [
        { name: 'x', type: 'text', nullable: false },
        { name: 'y', type: 'text', nullable: false },
        { name: 'val', type: 'integer', nullable: true },
      ],
      rows: [
        { x: 'A', y: 'B', val: null },
        { x: 'C', y: 'D', val: 10 },
      ],
      rowCount: 2,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toHeatmapData(dataWithNull);
    expect(result.points[0]!.value).toBe(0);
    expect(result.points[1]!.value).toBe(10);
  });
});
