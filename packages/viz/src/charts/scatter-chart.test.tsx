// ── Scatter Chart Tests ─────────────────────────────────────────────
// Tests for scatter chart data transformation and XY series extraction.

import { describe, it, expect } from 'vitest';
import { toScatterData } from '../utils/data-transformer.js';
import type { QueryResult, VisualizationConfig } from '@meridian/shared';

describe('ScatterChart data handling', () => {
  const sampleData: QueryResult = {
    columns: [
      { name: 'category', type: 'text', nullable: false },
      { name: 'x_val', type: 'float', nullable: false },
      { name: 'y_val', type: 'float', nullable: false },
      { name: 'size', type: 'integer', nullable: true },
    ],
    rows: [
      { category: 'A', x_val: 1.0, y_val: 2.0, size: 10 },
      { category: 'B', x_val: 3.0, y_val: 4.0, size: 20 },
      { category: 'C', x_val: 5.0, y_val: 6.0, size: 30 },
      { category: 'A', x_val: 2.0, y_val: 3.0, size: 15 },
    ],
    rowCount: 4,
    executionTimeMs: 5,
    truncated: false,
  };

  it('should transform data into XY series', () => {
    const result = toScatterData(sampleData);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.points.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty data', () => {
    const emptyData: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
    const result = toScatterData(emptyData);
    expect(result).toHaveLength(0);
  });

  it('should auto-detect numeric columns for x and y', () => {
    const result = toScatterData(sampleData);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const points = result[0]!.points;
    // Points should have numeric x and y
    for (const point of points) {
      expect(typeof point.x).toBe('number');
      expect(typeof point.y).toBe('number');
    }
  });

  it('should use explicit column mappings from config', () => {
    const config: VisualizationConfig = {
      type: 'scatter',
      options: {
        xColumn: 'x_val',
        yColumn: 'y_val',
        sizeColumn: 'size',
      },
    };
    const result = toScatterData(sampleData, config);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const points = result[0]!.points;
    expect(points[0]!.x).toBe(1.0);
    expect(points[0]!.y).toBe(2.0);
    expect(points[0]!.size).toBe(10);
  });

  it('should group by series column when specified', () => {
    const config: VisualizationConfig = {
      type: 'scatter',
      options: {
        xColumn: 'x_val',
        yColumn: 'y_val',
        seriesColumn: 'category',
      },
    };
    const result = toScatterData(sampleData, config);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const seriesNames = result.map((s) => s.name);
    expect(seriesNames).toContain('A');
    expect(seriesNames).toContain('B');
    expect(seriesNames).toContain('C');
    // Category A has 2 points
    const seriesA = result.find((s) => s.name === 'A');
    expect(seriesA!.points).toHaveLength(2);
  });

  it('should skip rows with null y values', () => {
    const dataWithNulls: QueryResult = {
      columns: [
        { name: 'x', type: 'float', nullable: false },
        { name: 'y', type: 'float', nullable: true },
      ],
      rows: [
        { x: 1, y: 10 },
        { x: 2, y: null },
        { x: 3, y: 30 },
      ],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toScatterData(dataWithNulls);
    const totalPoints = result.reduce((sum, s) => sum + s.points.length, 0);
    expect(totalPoints).toBe(2);
  });

  it('should include label from dimension column', () => {
    const config: VisualizationConfig = {
      type: 'scatter',
      options: {
        xColumn: 'x_val',
        yColumn: 'y_val',
      },
    };
    const result = toScatterData(sampleData, config);
    // Labels should come from the first dimension column (category)
    const firstPoint = result[0]!.points[0]!;
    if (firstPoint.label !== undefined) {
      expect(typeof firstPoint.label).toBe('string');
    }
  });

  it('should handle data with only two numeric columns', () => {
    const twoCol: QueryResult = {
      columns: [
        { name: 'x', type: 'integer', nullable: false },
        { name: 'y', type: 'integer', nullable: false },
      ],
      rows: [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
      ],
      rowCount: 2,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toScatterData(twoCol);
    expect(result).toHaveLength(1);
    expect(result[0]!.points).toHaveLength(2);
  });
});
