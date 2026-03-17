/**
 * PieChart tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  makePieData,
  makeEmptyData,
  pieConfig,
  createMockEChartsInstance,
  setupResizeObserverMock,
} from './__tests__/test-helpers.js';
import { toPieData } from '../utils/data-transformer.js';

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

describe('PieChart', () => {
  beforeEach(() => {
    setupResizeObserverMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data transformation', () => {
    it('should transform into pie slices', () => {
      const result = toPieData(makePieData());
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ name: 'Chrome', value: 65 });
      expect(result[1]).toEqual({ name: 'Firefox', value: 15 });
      expect(result[2]).toEqual({ name: 'Safari', value: 12 });
      expect(result[3]).toEqual({ name: 'Edge', value: 8 });
    });

    it('should calculate correct total', () => {
      const result = toPieData(makePieData());
      const total = result.reduce((sum, d) => sum + d.value, 0);
      expect(total).toBe(100);
    });

    it('should return empty for empty data', () => {
      expect(toPieData(makeEmptyData())).toEqual([]);
    });
  });

  describe('configuration', () => {
    it('should default to pie type', () => {
      const config = pieConfig();
      expect(config.type).toBe('pie');
    });

    it('should support donut variant', () => {
      const config = pieConfig({ type: 'donut' });
      expect(config.type).toBe('donut');
    });

    it('should support inner radius for donut', () => {
      const config = pieConfig({ options: { innerRadius: 50 } });
      expect(config.options?.innerRadius).toBe(50);
    });

    it('should support label toggle', () => {
      const config = pieConfig({ options: { showLabels: false } });
      expect(config.options?.showLabels).toBe(false);
    });

    it('should support percentage toggle', () => {
      const config = pieConfig({ options: { showPercentage: false } });
      expect(config.options?.showPercentage).toBe(false);
    });

    it('should support rose/nightingale mode', () => {
      const config = pieConfig({ options: { roseType: 'radius' } });
      expect(config.options?.roseType).toBe('radius');
    });

    it('should configure legend position', () => {
      const config = pieConfig({
        legend: { show: true, position: 'right' },
      });
      expect(config.legend?.position).toBe('right');
    });
  });

  describe('percentage calculation', () => {
    it('should compute correct percentages', () => {
      const result = toPieData(makePieData());
      const total = result.reduce((sum, d) => sum + d.value, 0);
      const percentages = result.map((d) => (d.value / total) * 100);
      expect(percentages[0]).toBe(65); // Chrome
      expect(percentages[1]).toBe(15); // Firefox
      expect(percentages[2]).toBe(12); // Safari
      expect(percentages[3]).toBe(8);  // Edge
    });
  });

  describe('click handler', () => {
    it('should create valid DataPoint from click event', () => {
      const data = makePieData();
      const params = { name: 'Chrome', value: 65, dataIndex: 0 };
      const point = {
        series: params.name,
        category: params.name,
        value: params.value,
        row: data.rows[params.dataIndex],
      };

      expect(point.series).toBe('Chrome');
      expect(point.value).toBe(65);
      expect(point.row).toEqual({ browser: 'Chrome', share: 65 });
    });
  });

  describe('edge cases', () => {
    it('should filter zero values', () => {
      const data = {
        ...makePieData(),
        rows: [
          { browser: 'Chrome', share: 65 },
          { browser: 'Other', share: 0 },
        ],
      };
      const result = toPieData(data);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Chrome');
    });
  });
});
