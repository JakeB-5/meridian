import { describe, it, expect } from 'vitest';
import type { QueryResult, VisualizationConfig } from '@meridian/shared';
import {
  toCategorySeries,
  toPieData,
  toScatterData,
  toHeatmapData,
  toFunnelData,
  toTreemapData,
  toSingleValue,
  toTableData,
  detectColumnRoles,
  getDimensionColumnIndex,
  getMeasureColumnIndices,
} from './data-transformer.js';

// --- Test Fixtures ---

function makeSalesData(): QueryResult {
  return {
    columns: [
      { name: 'month', type: 'varchar', nullable: false },
      { name: 'revenue', type: 'integer', nullable: false },
      { name: 'cost', type: 'integer', nullable: false },
    ],
    rows: [
      { month: 'Jan', revenue: 1000, cost: 400 },
      { month: 'Feb', revenue: 1500, cost: 600 },
      { month: 'Mar', revenue: 1200, cost: 500 },
      { month: 'Apr', revenue: 1800, cost: 700 },
    ],
    rowCount: 4,
    executionTimeMs: 10,
    truncated: false,
  };
}

function makeDateData(): QueryResult {
  return {
    columns: [
      { name: 'date', type: 'timestamp', nullable: false },
      { name: 'value', type: 'float', nullable: false },
    ],
    rows: [
      { date: '2024-03-01', value: 300 },
      { date: '2024-01-01', value: 100 },
      { date: '2024-02-01', value: 200 },
    ],
    rowCount: 3,
    executionTimeMs: 5,
    truncated: false,
  };
}

function makePieData(): QueryResult {
  return {
    columns: [
      { name: 'category', type: 'varchar', nullable: false },
      { name: 'amount', type: 'integer', nullable: false },
    ],
    rows: [
      { category: 'Electronics', amount: 450 },
      { category: 'Clothing', amount: 300 },
      { category: 'Food', amount: 200 },
      { category: 'Books', amount: 50 },
    ],
    rowCount: 4,
    executionTimeMs: 3,
    truncated: false,
  };
}

function makeScatterData(): QueryResult {
  return {
    columns: [
      { name: 'label', type: 'varchar', nullable: false },
      { name: 'x', type: 'float', nullable: false },
      { name: 'y', type: 'float', nullable: false },
      { name: 'size', type: 'float', nullable: true },
    ],
    rows: [
      { label: 'A', x: 1, y: 10, size: 5 },
      { label: 'B', x: 2, y: 20, size: 8 },
      { label: 'C', x: 3, y: 15, size: null },
    ],
    rowCount: 3,
    executionTimeMs: 2,
    truncated: false,
  };
}

function makeHeatmapData(): QueryResult {
  return {
    columns: [
      { name: 'day', type: 'varchar', nullable: false },
      { name: 'hour', type: 'varchar', nullable: false },
      { name: 'count', type: 'integer', nullable: false },
    ],
    rows: [
      { day: 'Mon', hour: '9am', count: 10 },
      { day: 'Mon', hour: '10am', count: 20 },
      { day: 'Tue', hour: '9am', count: 15 },
      { day: 'Tue', hour: '10am', count: 25 },
    ],
    rowCount: 4,
    executionTimeMs: 2,
    truncated: false,
  };
}

function makeEmptyData(): QueryResult {
  return {
    columns: [
      { name: 'x', type: 'varchar', nullable: false },
      { name: 'y', type: 'integer', nullable: false },
    ],
    rows: [],
    rowCount: 0,
    executionTimeMs: 0,
    truncated: false,
  };
}

function makeSingleValueData(): QueryResult {
  return {
    columns: [
      { name: 'total_revenue', type: 'float', nullable: false },
    ],
    rows: [{ total_revenue: 42567.89 }],
    rowCount: 1,
    executionTimeMs: 1,
    truncated: false,
  };
}

function makeNullData(): QueryResult {
  return {
    columns: [
      { name: 'category', type: 'varchar', nullable: false },
      { name: 'value', type: 'integer', nullable: true },
    ],
    rows: [
      { category: 'A', value: 100 },
      { category: 'B', value: null },
      { category: 'C', value: 300 },
    ],
    rowCount: 3,
    executionTimeMs: 2,
    truncated: false,
  };
}

// --- Tests ---

describe('detectColumnRoles', () => {
  it('should detect dimension and measure columns', () => {
    const result = detectColumnRoles(makeSalesData().columns);
    expect(result.dimensions).toEqual([0]); // month is varchar
    expect(result.measures).toEqual([1, 2]); // revenue, cost are integer
  });

  it('should handle all-numeric columns', () => {
    const result = detectColumnRoles([
      { name: 'a', type: 'integer', nullable: false },
      { name: 'b', type: 'float', nullable: false },
    ]);
    // With all numeric, first is treated as dimension
    expect(result.dimensions).toEqual([0]);
    expect(result.measures).toEqual([1]);
  });
});

describe('getDimensionColumnIndex', () => {
  it('should auto-detect first non-numeric column', () => {
    expect(getDimensionColumnIndex(makeSalesData().columns)).toBe(0);
  });

  it('should use xAxis.label from config', () => {
    const config: VisualizationConfig = {
      type: 'bar',
      xAxis: { label: 'cost' },
    };
    expect(getDimensionColumnIndex(makeSalesData().columns, config)).toBe(2);
  });

  it('should use options.dimensionColumn from config', () => {
    const config: VisualizationConfig = {
      type: 'bar',
      options: { dimensionColumn: 'revenue' },
    };
    expect(getDimensionColumnIndex(makeSalesData().columns, config)).toBe(1);
  });
});

describe('getMeasureColumnIndices', () => {
  it('should auto-detect numeric columns', () => {
    const indices = getMeasureColumnIndices(makeSalesData().columns);
    expect(indices).toEqual([1, 2]);
  });

  it('should use options.measureColumns from config', () => {
    const config: VisualizationConfig = {
      type: 'bar',
      options: { measureColumns: ['cost'] },
    };
    const indices = getMeasureColumnIndices(makeSalesData().columns, config);
    expect(indices).toEqual([2]);
  });
});

describe('toCategorySeries', () => {
  it('should transform sales data into categories and series', () => {
    const result = toCategorySeries(makeSalesData());
    expect(result.categories).toEqual(['Jan', 'Feb', 'Mar', 'Apr']);
    expect(result.series).toHaveLength(2);
    expect(result.series[0].name).toBe('revenue');
    expect(result.series[0].values).toEqual([1000, 1500, 1200, 1800]);
    expect(result.series[1].name).toBe('cost');
    expect(result.series[1].values).toEqual([400, 600, 500, 700]);
  });

  it('should sort date columns chronologically', () => {
    const result = toCategorySeries(makeDateData());
    expect(result.categories).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
    expect(result.series[0].values).toEqual([100, 200, 300]);
  });

  it('should handle null values', () => {
    const result = toCategorySeries(makeNullData());
    expect(result.series[0].values).toEqual([100, null, 300]);
  });

  it('should return empty for empty data', () => {
    const result = toCategorySeries(makeEmptyData());
    expect(result.categories).toEqual([]);
    expect(result.series).toEqual([]);
  });
});

describe('toPieData', () => {
  it('should transform into name/value pairs', () => {
    const result = toPieData(makePieData());
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ name: 'Electronics', value: 450 });
    expect(result[3]).toEqual({ name: 'Books', value: 50 });
  });

  it('should filter out zero/negative values', () => {
    const data: QueryResult = {
      columns: [
        { name: 'cat', type: 'varchar', nullable: false },
        { name: 'val', type: 'integer', nullable: false },
      ],
      rows: [
        { cat: 'A', val: 100 },
        { cat: 'B', val: 0 },
        { cat: 'C', val: -5 },
      ],
      rowCount: 3,
      executionTimeMs: 1,
      truncated: false,
    };
    const result = toPieData(data);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('A');
  });

  it('should return empty for empty data', () => {
    expect(toPieData(makeEmptyData())).toEqual([]);
  });
});

describe('toScatterData', () => {
  it('should transform into XY series data', () => {
    const result = toScatterData(makeScatterData());
    expect(result).toHaveLength(1);
    expect(result[0].points).toHaveLength(3);
    expect(result[0].points[0].x).toBe(1);
    expect(result[0].points[0].y).toBe(10);
  });

  it('should include size encoding', () => {
    const result = toScatterData(makeScatterData());
    expect(result[0].points[0].size).toBe(5);
    expect(result[0].points[2].size).toBeUndefined(); // null in data
  });

  it('should include labels', () => {
    const result = toScatterData(makeScatterData());
    expect(result[0].points[0].label).toBe('A');
  });

  it('should return empty for empty data', () => {
    expect(toScatterData(makeEmptyData())).toEqual([]);
  });
});

describe('toHeatmapData', () => {
  it('should transform into heatmap points with labels', () => {
    const result = toHeatmapData(makeHeatmapData());
    expect(result.xLabels).toContain('Mon');
    expect(result.xLabels).toContain('Tue');
    expect(result.yLabels).toContain('9am');
    expect(result.yLabels).toContain('10am');
    expect(result.points).toHaveLength(4);
    expect(result.min).toBe(10);
    expect(result.max).toBe(25);
  });

  it('should return empty for empty data', () => {
    const result = toHeatmapData(makeEmptyData());
    expect(result.points).toEqual([]);
  });
});

describe('toFunnelData', () => {
  it('should return sorted descending slices', () => {
    const result = toFunnelData(makePieData());
    expect(result).toHaveLength(4);
    // Should be sorted by value descending
    expect(result[0].value).toBeGreaterThanOrEqual(result[1].value);
    expect(result[1].value).toBeGreaterThanOrEqual(result[2].value);
  });
});

describe('toTreemapData', () => {
  it('should transform into flat tree nodes', () => {
    const result = toTreemapData(makePieData());
    expect(result).toHaveLength(4);
    expect(result[0].name).toBe('Electronics');
    expect(result[0].value).toBe(450);
  });

  it('should return empty for empty data', () => {
    expect(toTreemapData(makeEmptyData())).toEqual([]);
  });
});

describe('toSingleValue', () => {
  it('should extract first numeric value', () => {
    const result = toSingleValue(makeSingleValueData());
    expect(result).not.toBeNull();
    expect(result!.value).toBe(42567.89);
    expect(result!.label).toBe('total_revenue');
  });

  it('should return null for empty data', () => {
    expect(toSingleValue(makeEmptyData())).toBeNull();
  });
});

describe('toTableData', () => {
  it('should return rows as-is without sorting', () => {
    const result = toTableData(makeSalesData());
    expect(result).toHaveLength(4);
    expect(result[0].month).toBe('Jan');
  });

  it('should sort ascending by column', () => {
    const result = toTableData(makeSalesData(), 'revenue', 'asc');
    expect(result[0].revenue).toBe(1000);
    expect(result[result.length - 1].revenue).toBe(1800);
  });

  it('should sort descending by column', () => {
    const result = toTableData(makeSalesData(), 'revenue', 'desc');
    expect(result[0].revenue).toBe(1800);
    expect(result[result.length - 1].revenue).toBe(1000);
  });

  it('should sort string columns', () => {
    const result = toTableData(makeSalesData(), 'month', 'asc');
    expect(result[0].month).toBe('Apr');
    expect(result[result.length - 1].month).toBe('Mar');
  });

  it('should handle null values in sort', () => {
    const result = toTableData(makeNullData(), 'value', 'asc');
    // Nulls should sort to the end
    expect(result[result.length - 1].value).toBeNull();
  });

  it('should return empty for empty data', () => {
    expect(toTableData(makeEmptyData())).toEqual([]);
  });
});
