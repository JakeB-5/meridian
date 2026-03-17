import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  defaultNumberFormat,
  formatDecimal,
  formatWithThousands,
  formatCompact,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDuration,
  isDateType,
  isNumericType,
  toDate,
  createAxisFormatter,
  formatTooltipValue,
} from './format.js';

describe('formatNumber', () => {
  it('should format with default when no config provided', () => {
    expect(formatNumber(1234)).toBe(defaultNumberFormat(1234));
  });

  it('should format as decimal', () => {
    const result = formatNumber(1234.567, {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(result).toBe('1,234.57');
  });

  it('should format as currency', () => {
    const result = formatNumber(1234.5, { style: 'currency', currency: 'USD' });
    expect(result).toMatch(/\$1,234\.50/);
  });

  it('should format as percent', () => {
    const result = formatNumber(0.456, { style: 'percent' });
    expect(result).toMatch(/46/); // 45.6% or 46%
  });

  it('should format as compact', () => {
    const result = formatNumber(1500000, { style: 'compact' });
    expect(result).toMatch(/1\.5M/);
  });

  it('should handle non-finite values', () => {
    expect(formatNumber(Infinity)).toBe('—');
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('defaultNumberFormat', () => {
  it('should format integers < 1000 as-is', () => {
    expect(defaultNumberFormat(42)).toBe('42');
    expect(defaultNumberFormat(0)).toBe('0');
  });

  it('should format thousands with separators', () => {
    const result = defaultNumberFormat(5432);
    expect(result).toMatch(/5/);
  });

  it('should use compact notation for large numbers', () => {
    const result = defaultNumberFormat(1500000);
    expect(result).toMatch(/1\.5M/);
  });

  it('should format decimals with up to 2 places', () => {
    expect(defaultNumberFormat(3.14159)).toBe('3.14');
  });

  it('should return dash for non-finite', () => {
    expect(defaultNumberFormat(NaN)).toBe('—');
    expect(defaultNumberFormat(Infinity)).toBe('—');
  });
});

describe('formatDecimal', () => {
  it('should format with specified fraction digits', () => {
    expect(formatDecimal(1234.5, 2, 2)).toBe('1,234.50');
    expect(formatDecimal(1234.567, 0, 1)).toBe('1,234.6');
  });
});

describe('formatWithThousands', () => {
  it('should add thousands separators', () => {
    expect(formatWithThousands(1234567, 0)).toBe('1,234,567');
  });
});

describe('formatCompact', () => {
  it('should format thousands as K', () => {
    expect(formatCompact(1500)).toMatch(/1\.5K/);
  });

  it('should format millions as M', () => {
    expect(formatCompact(2500000)).toMatch(/2\.5M/);
  });

  it('should format billions as B', () => {
    expect(formatCompact(1200000000)).toMatch(/1\.2B/);
  });
});

describe('formatCurrency', () => {
  it('should format USD by default', () => {
    const result = formatCurrency(99.99);
    expect(result).toMatch(/\$99\.99/);
  });

  it('should format other currencies', () => {
    const result = formatCurrency(1000, 'EUR');
    expect(result).toMatch(/1,000/);
  });
});

describe('formatPercent', () => {
  it('should format ratio as percentage', () => {
    expect(formatPercent(0.5)).toMatch(/50%/);
    expect(formatPercent(1.0)).toMatch(/100%/);
  });

  it('should handle fraction digits', () => {
    const result = formatPercent(0.1234, 1, 1);
    expect(result).toMatch(/12\.3%/);
  });
});

describe('formatDate', () => {
  const isoDate = '2024-01-15T14:30:00Z';

  it('should format as date', () => {
    const result = formatDate(isoDate, 'date');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  it('should format as ISO', () => {
    expect(formatDate(isoDate, 'iso')).toBe('2024-01-15');
  });

  it('should format as month-year', () => {
    const result = formatDate(isoDate, 'month-year');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2024/);
  });

  it('should format as quarter', () => {
    const result = formatDate(isoDate, 'quarter');
    expect(result).toBe('Q1 2024');
  });

  it('should format as year', () => {
    expect(formatDate(isoDate, 'year')).toBe('2024');
  });

  it('should handle Date objects', () => {
    const result = formatDate(new Date(2024, 0, 15), 'iso');
    expect(result).toBe('2024-01-15');
  });

  it('should handle timestamps', () => {
    const ts = new Date('2024-06-01').getTime();
    const result = formatDate(ts, 'year');
    expect(result).toBe('2024');
  });

  it('should return dash for invalid dates', () => {
    expect(formatDate('not-a-date', 'date')).toBe('—');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3_780_000)).toBe('1h 3m');
  });

  it('should format days and hours', () => {
    expect(formatDuration(90_000_000)).toBe('1d 1h');
  });

  it('should handle edge cases', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
  });
});

describe('isDateType', () => {
  it('should recognize date types', () => {
    expect(isDateType('date')).toBe(true);
    expect(isDateType('datetime')).toBe(true);
    expect(isDateType('timestamp')).toBe(true);
    expect(isDateType('TIMESTAMPTZ')).toBe(true);
  });

  it('should reject non-date types', () => {
    expect(isDateType('integer')).toBe(false);
    expect(isDateType('varchar')).toBe(false);
  });
});

describe('isNumericType', () => {
  it('should recognize numeric types', () => {
    expect(isNumericType('integer')).toBe(true);
    expect(isNumericType('bigint')).toBe(true);
    expect(isNumericType('float')).toBe(true);
    expect(isNumericType('DECIMAL')).toBe(true);
    expect(isNumericType('numeric')).toBe(true);
  });

  it('should reject non-numeric types', () => {
    expect(isNumericType('varchar')).toBe(false);
    expect(isNumericType('text')).toBe(false);
    expect(isNumericType('boolean')).toBe(false);
  });
});

describe('toDate', () => {
  it('should handle Date objects', () => {
    const d = new Date(2024, 0, 1);
    expect(toDate(d)).toEqual(d);
  });

  it('should handle ISO strings', () => {
    const result = toDate('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it('should handle timestamps', () => {
    const ts = Date.now();
    const result = toDate(ts);
    expect(result).toBeInstanceOf(Date);
  });

  it('should return null for non-parseable values', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate({})).toBeNull();
  });
});

describe('createAxisFormatter', () => {
  it('should create number formatter for numeric types', () => {
    const fmt = createAxisFormatter('integer');
    expect(fmt(1234)).toBeDefined();
    expect(typeof fmt(1234)).toBe('string');
  });

  it('should create date formatter for date types', () => {
    const fmt = createAxisFormatter('timestamp');
    const result = fmt('2024-01-15');
    expect(typeof result).toBe('string');
  });

  it('should create string formatter for text types', () => {
    const fmt = createAxisFormatter('varchar');
    expect(fmt('hello')).toBe('hello');
  });
});

describe('formatTooltipValue', () => {
  it('should format numbers for numeric columns', () => {
    const result = formatTooltipValue(1234, 'integer');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should format dates for date columns', () => {
    const result = formatTooltipValue('2024-01-15', 'timestamp');
    expect(result).toMatch(/Jan/);
  });

  it('should return dash for null', () => {
    expect(formatTooltipValue(null, 'integer')).toBe('—');
  });
});
