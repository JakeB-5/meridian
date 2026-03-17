import { describe, it, expect } from 'vitest';
import {
  formatMetricValue,
  formatCompactNumber,
  formatBytes,
  formatPercent,
  formatChange,
  formatAxisValue,
  parseFormattedNumber,
  generateAxisTicks,
  calculateStats,
} from './format';

describe('formatMetricValue', () => {
  it('should format number', () => {
    expect(formatMetricValue(1234567, 'number')).toBe('1,234,567');
  });

  it('should format currency', () => {
    const result = formatMetricValue(1234.5, 'currency');
    expect(result).toContain('1,234');
    expect(result).toContain('$');
  });

  it('should format percent', () => {
    expect(formatMetricValue(75, 'percent')).toBe('75.0%');
  });

  it('should format decimal', () => {
    expect(formatMetricValue(3.14159, 'decimal')).toBe('3.14');
  });

  it('should format integer', () => {
    expect(formatMetricValue(3.7, 'integer')).toBe('4');
  });

  it('should format compact', () => {
    expect(formatMetricValue(1500000, 'compact')).toBe('1.5M');
  });
});

describe('formatCompactNumber', () => {
  it('should format thousands', () => {
    expect(formatCompactNumber(1500)).toBe('1.5K');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('should format millions', () => {
    expect(formatCompactNumber(2500000)).toBe('2.5M');
  });

  it('should format billions', () => {
    expect(formatCompactNumber(1200000000)).toBe('1.2B');
  });

  it('should format trillions', () => {
    expect(formatCompactNumber(1500000000000)).toBe('1.5T');
  });

  it('should handle negative numbers', () => {
    expect(formatCompactNumber(-2500)).toBe('-2.5K');
  });

  it('should handle zero', () => {
    expect(formatCompactNumber(0)).toBe('0');
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });
});

describe('formatPercent', () => {
  it('should format with default decimals', () => {
    expect(formatPercent(75.5)).toBe('75.5%');
  });

  it('should format with custom decimals', () => {
    expect(formatPercent(33.333, 2)).toBe('33.33%');
  });
});

describe('formatChange', () => {
  it('should format positive change', () => {
    expect(formatChange(12.5)).toBe('+12.5%');
  });

  it('should format negative change', () => {
    expect(formatChange(-3.2)).toBe('-3.2%');
  });

  it('should format zero change', () => {
    expect(formatChange(0)).toBe('0.0%');
  });
});

describe('formatAxisValue', () => {
  it('should format small numbers', () => {
    expect(formatAxisValue(42)).toBe('42');
  });

  it('should format thousands', () => {
    expect(formatAxisValue(5000)).toBe('5K');
  });

  it('should format millions', () => {
    expect(formatAxisValue(2500000)).toBe('3M');
  });

  it('should format decimals', () => {
    expect(formatAxisValue(0.123)).toBe('0.12');
  });
});

describe('parseFormattedNumber', () => {
  it('should parse plain numbers', () => {
    expect(parseFormattedNumber('42')).toBe(42);
    expect(parseFormattedNumber('3.14')).toBe(3.14);
  });

  it('should parse formatted numbers', () => {
    expect(parseFormattedNumber('1,234')).toBe(1234);
    expect(parseFormattedNumber('$1,234.56')).toBe(1234.56);
  });

  it('should parse compact notation', () => {
    expect(parseFormattedNumber('1.5K')).toBe(1500);
    expect(parseFormattedNumber('2.5M')).toBe(2500000);
    expect(parseFormattedNumber('1B')).toBe(1000000000);
  });

  it('should parse percent', () => {
    expect(parseFormattedNumber('75.5%')).toBe(75.5);
  });

  it('should return null for invalid', () => {
    expect(parseFormattedNumber('')).toBe(null);
    expect(parseFormattedNumber('abc')).toBe(null);
  });
});

describe('generateAxisTicks', () => {
  it('should generate ticks for a range', () => {
    const ticks = generateAxisTicks(0, 100, 5);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(100);
  });

  it('should handle zero range', () => {
    const ticks = generateAxisTicks(50, 50);
    expect(ticks).toEqual([50]);
  });

  it('should produce evenly spaced ticks', () => {
    const ticks = generateAxisTicks(0, 1000, 5);
    if (ticks.length > 2) {
      const step = ticks[1] - ticks[0];
      for (let i = 2; i < ticks.length; i++) {
        expect(Math.abs(ticks[i] - ticks[i - 1] - step)).toBeLessThan(0.01);
      }
    }
  });
});

describe('calculateStats', () => {
  it('should handle empty array', () => {
    const stats = calculateStats([]);
    expect(stats.count).toBe(0);
    expect(stats.mean).toBe(0);
  });

  it('should calculate stats for simple array', () => {
    const stats = calculateStats([1, 2, 3, 4, 5]);
    expect(stats.count).toBe(5);
    expect(stats.sum).toBe(15);
    expect(stats.mean).toBe(3);
    expect(stats.median).toBe(3);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
  });

  it('should calculate median for even-length array', () => {
    const stats = calculateStats([1, 2, 3, 4]);
    expect(stats.median).toBe(2.5);
  });

  it('should calculate standard deviation', () => {
    const stats = calculateStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.stdDev).toBeCloseTo(2, 0);
  });

  it('should handle single value', () => {
    const stats = calculateStats([42]);
    expect(stats.count).toBe(1);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
    expect(stats.stdDev).toBe(0);
  });
});
