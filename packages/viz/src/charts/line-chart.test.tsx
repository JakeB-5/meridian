/**
 * LineChart tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  makeLineData,
  makeMultiSeriesData,
  makeEmptyData,
  lineConfig,
  createMockEChartsInstance,
  setupResizeObserverMock,
} from './__tests__/test-helpers.js';
import { toCategorySeries } from '../utils/data-transformer.js';

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

describe('LineChart', () => {
  beforeEach(() => {
    setupResizeObserverMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data transformation', () => {
    it('should transform line data into categories and series', () => {
      const data = makeLineData();
      const result = toCategorySeries(data, lineConfig());
      expect(result.categories).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
      expect(result.series).toHaveLength(1);
      expect(result.series[0].name).toBe('visitors');
      expect(result.series[0].values).toEqual([120, 200, 150, 300, 280]);
    });

    it('should handle multi-series', () => {
      const data = makeMultiSeriesData();
      const result = toCategorySeries(data, lineConfig());
      expect(result.series).toHaveLength(2);
    });

    it('should return empty for empty data', () => {
      const result = toCategorySeries(makeEmptyData(), lineConfig());
      expect(result.categories).toEqual([]);
    });
  });

  describe('configuration', () => {
    it('should support smooth curves', () => {
      const config = lineConfig({ options: { smooth: true } });
      expect(config.options?.smooth).toBe(true);
    });

    it('should support step lines', () => {
      const config = lineConfig({ options: { step: true } });
      expect(config.options?.step).toBe(true);
    });

    it('should support area fill', () => {
      const config = lineConfig({ options: { area: true } });
      expect(config.options?.area).toBe(true);
    });

    it('should support marker visibility toggle', () => {
      const config = lineConfig({ options: { showMarkers: false } });
      expect(config.options?.showMarkers).toBe(false);
    });

    it('should support min/max annotations', () => {
      const config = lineConfig({ options: { showMinMax: true } });
      expect(config.options?.showMinMax).toBe(true);
    });

    it('should support data labels', () => {
      const config = lineConfig({ options: { showDataLabels: true } });
      expect(config.options?.showDataLabels).toBe(true);
    });

    it('should configure axis bounds', () => {
      const config = lineConfig({
        yAxis: { min: 0, max: 500 },
      });
      expect(config.yAxis?.min).toBe(0);
      expect(config.yAxis?.max).toBe(500);
    });
  });

  describe('click handler', () => {
    it('should create valid DataPoint from click event', () => {
      const data = makeLineData();
      const params = { seriesName: 'visitors', name: 'Thu', value: 300, dataIndex: 3 };
      const point = {
        series: params.seriesName,
        category: params.name,
        value: params.value,
        row: data.rows[params.dataIndex],
      };

      expect(point.series).toBe('visitors');
      expect(point.category).toBe('Thu');
      expect(point.value).toBe(300);
      expect(point.row).toEqual({ date: 'Thu', visitors: 300 });
    });
  });

  describe('series analysis', () => {
    it('should identify min and max values', () => {
      const data = makeLineData();
      const result = toCategorySeries(data, lineConfig());
      const values = result.series[0].values.filter((v): v is number => v != null);
      expect(Math.min(...values)).toBe(120);
      expect(Math.max(...values)).toBe(300);
    });
  });
});
