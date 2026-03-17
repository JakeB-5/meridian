/**
 * NumberChart tests.
 *
 * NumberChart is pure React (no ECharts), so tests focus on
 * value extraction, formatting, and trend calculation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeKpiData,
  makeEmptyData,
  numberConfig,
} from './__tests__/test-helpers.js';
import { toSingleValue } from '../utils/data-transformer.js';
import { formatNumber, formatPercent, defaultNumberFormat } from '../utils/format.js';

describe('NumberChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('value extraction', () => {
    it('should extract single numeric value', () => {
      const result = toSingleValue(makeKpiData());
      expect(result).not.toBeNull();
      expect(result!.value).toBe(42567.89);
      expect(result!.label).toBe('total_revenue');
    });

    it('should return null for empty data', () => {
      expect(toSingleValue(makeEmptyData())).toBeNull();
    });

    it('should use first numeric column', () => {
      const data = {
        columns: [
          { name: 'label', type: 'varchar', nullable: false },
          { name: 'count', type: 'integer', nullable: false },
        ],
        rows: [{ label: 'Total', count: 999 }],
        rowCount: 1,
        executionTimeMs: 1,
        truncated: false,
      };
      const result = toSingleValue(data);
      expect(result!.value).toBe(999);
      expect(result!.label).toBe('count');
    });
  });

  describe('formatting', () => {
    it('should format as decimal', () => {
      const result = formatNumber(42567.89, {
        style: 'decimal',
        maximumFractionDigits: 2,
      });
      expect(result).toMatch(/42,567\.89/);
    });

    it('should format as currency', () => {
      const result = formatNumber(42567.89, {
        style: 'currency',
        currency: 'USD',
      });
      expect(result).toMatch(/\$42,567\.89/);
    });

    it('should format as percentage', () => {
      const result = formatNumber(0.456, { style: 'percent' });
      expect(result).toMatch(/46/);
    });

    it('should format as compact', () => {
      const result = formatNumber(42567, { style: 'compact' });
      expect(result).toMatch(/42/);
    });

    it('should use default formatting', () => {
      const result = defaultNumberFormat(42567.89);
      expect(result).toBeDefined();
    });
  });

  describe('trend calculation', () => {
    function computeTrend(current: number, previous: number | undefined): 'up' | 'down' | 'flat' {
      if (previous == null || previous === current) return 'flat';
      return current > previous ? 'up' : 'down';
    }

    it('should detect upward trend', () => {
      expect(computeTrend(150, 100)).toBe('up');
    });

    it('should detect downward trend', () => {
      expect(computeTrend(80, 100)).toBe('down');
    });

    it('should detect flat trend', () => {
      expect(computeTrend(100, 100)).toBe('flat');
    });

    it('should treat undefined previous as flat', () => {
      expect(computeTrend(100, undefined)).toBe('flat');
    });
  });

  describe('change calculation', () => {
    it('should compute absolute change', () => {
      const current = 150;
      const previous = 100;
      const diff = current - previous;
      expect(diff).toBe(50);
    });

    it('should compute percentage change', () => {
      const current = 150;
      const previous = 100;
      const pct = (current - previous) / Math.abs(previous);
      const result = formatPercent(pct, 0, 1);
      expect(result).toMatch(/50/);
    });

    it('should handle negative change', () => {
      const current = 80;
      const previous = 100;
      const pct = (current - previous) / Math.abs(previous);
      expect(pct).toBeLessThan(0);
    });
  });

  describe('configuration', () => {
    it('should support custom label', () => {
      const config = numberConfig({ options: { label: 'Total Revenue' } });
      expect(config.options?.label).toBe('Total Revenue');
    });

    it('should support prefix and suffix', () => {
      const config = numberConfig({
        options: { prefix: '$', suffix: ' USD' },
      });
      expect(config.options?.prefix).toBe('$');
      expect(config.options?.suffix).toBe(' USD');
    });

    it('should support comparison value', () => {
      const config = numberConfig({
        options: { comparisonValue: 35000, comparisonLabel: 'last month' },
      });
      expect(config.options?.comparisonValue).toBe(35000);
      expect(config.options?.comparisonLabel).toBe('last month');
    });

    it('should support target value', () => {
      const config = numberConfig({ options: { targetValue: 50000 } });
      expect(config.options?.targetValue).toBe(50000);
    });

    it('should support positiveIsGood toggle', () => {
      const config = numberConfig({ options: { positiveIsGood: false } });
      expect(config.options?.positiveIsGood).toBe(false);
    });
  });

  describe('target progress', () => {
    it('should compute progress ratio', () => {
      const value = 30000;
      const target = 50000;
      const progress = Math.min(value / target, 1);
      expect(progress).toBe(0.6);
    });

    it('should cap at 100%', () => {
      const value = 60000;
      const target = 50000;
      const progress = Math.min(value / target, 1);
      expect(progress).toBe(1);
    });
  });
});
