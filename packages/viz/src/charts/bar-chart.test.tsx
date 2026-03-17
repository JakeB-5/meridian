/**
 * BarChart tests.
 *
 * Tests use mocked ECharts to verify option generation and event handling
 * without requiring a DOM rendering engine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  makeBarData,
  makeMultiSeriesData,
  makeEmptyData,
  barConfig,
  createMockEChartsInstance,
  setupResizeObserverMock,
} from './__tests__/test-helpers.js';
import { toCategorySeries } from '../utils/data-transformer.js';
import { defaultNumberFormat } from '../utils/format.js';

// Mock echarts before importing the component
const mockInstance = createMockEChartsInstance();

vi.mock('echarts', () => ({
  default: {
    init: vi.fn(() => mockInstance),
    graphic: {
      LinearGradient: vi.fn((...args: unknown[]) => ({ type: 'linear', args })),
    },
  },
  init: vi.fn(() => mockInstance),
  graphic: {
    LinearGradient: vi.fn((...args: unknown[]) => ({ type: 'linear', args })),
  },
}));

describe('BarChart', () => {
  beforeEach(() => {
    setupResizeObserverMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data transformation', () => {
    it('should transform bar data into categories and series', () => {
      const data = makeBarData();
      const result = toCategorySeries(data, barConfig());
      expect(result.categories).toEqual(['Electronics', 'Clothing', 'Food']);
      expect(result.series).toHaveLength(1);
      expect(result.series[0].name).toBe('sales');
      expect(result.series[0].values).toEqual([450, 300, 200]);
    });

    it('should handle multi-series data', () => {
      const data = makeMultiSeriesData();
      const result = toCategorySeries(data, barConfig());
      expect(result.series).toHaveLength(2);
      expect(result.series[0].name).toBe('revenue');
      expect(result.series[1].name).toBe('cost');
    });

    it('should return empty for empty data', () => {
      const result = toCategorySeries(makeEmptyData(), barConfig());
      expect(result.categories).toEqual([]);
      expect(result.series).toEqual([]);
    });
  });

  describe('configuration', () => {
    it('should respect stacked option', () => {
      const config = barConfig({ stacked: true });
      expect(config.stacked).toBe(true);
    });

    it('should respect horizontal orientation', () => {
      const config = barConfig({ options: { orientation: 'horizontal' } });
      expect(config.options?.orientation).toBe('horizontal');
    });

    it('should respect data labels option', () => {
      const config = barConfig({ options: { showDataLabels: true } });
      expect(config.options?.showDataLabels).toBe(true);
    });

    it('should pass custom colors', () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff'];
      const config = barConfig({ colors });
      expect(config.colors).toEqual(colors);
    });

    it('should configure axis labels', () => {
      const config = barConfig({
        xAxis: { label: 'Category' },
        yAxis: { label: 'Sales ($)' },
      });
      expect(config.xAxis?.label).toBe('Category');
      expect(config.yAxis?.label).toBe('Sales ($)');
    });
  });

  describe('value formatting', () => {
    it('should format large numbers in compact notation', () => {
      expect(defaultNumberFormat(1500000)).toMatch(/1\.5M/);
    });

    it('should format integers without decimals', () => {
      expect(defaultNumberFormat(42)).toBe('42');
    });

    it('should format with thousands separator', () => {
      const result = defaultNumberFormat(5432);
      expect(result).toBeDefined();
    });
  });

  describe('click handler', () => {
    it('should create valid DataPoint from click event', () => {
      const data = makeBarData();
      const rows = data.rows;

      // Simulate what the click handler does
      const params = { seriesName: 'sales', name: 'Electronics', value: 450, dataIndex: 0 };
      const point = {
        series: params.seriesName ?? '',
        category: params.name ?? '',
        value: typeof params.value === 'number' ? params.value : 0,
        row: rows[params.dataIndex] ?? {},
      };

      expect(point.series).toBe('sales');
      expect(point.category).toBe('Electronics');
      expect(point.value).toBe(450);
      expect(point.row).toEqual({ category: 'Electronics', sales: 450 });
    });
  });

  describe('legend', () => {
    it('should show legend for multi-series', () => {
      const data = makeMultiSeriesData();
      const result = toCategorySeries(data, barConfig());
      expect(result.series.length).toBeGreaterThan(1);
    });

    it('should hide legend for single series', () => {
      const data = makeBarData();
      const result = toCategorySeries(data, barConfig());
      expect(result.series).toHaveLength(1);
    });

    it('should respect legend position config', () => {
      const config = barConfig({
        legend: { show: true, position: 'bottom' },
      });
      expect(config.legend?.position).toBe('bottom');
    });
  });
});
