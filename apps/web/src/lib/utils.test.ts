import { describe, it, expect } from 'vitest';
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatCompact,
  formatDuration,
  truncate,
  generateId,
  deepClone,
  pluralize,
  getInitials,
  isNonEmptyString,
} from './utils';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should filter falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('should handle empty call', () => {
    expect(cn()).toBe('');
  });
});

describe('formatCompact', () => {
  it('should format thousands', () => {
    expect(formatCompact(1500)).toBe('1.5K');
  });

  it('should format millions', () => {
    expect(formatCompact(2500000)).toBe('2.5M');
  });

  it('should format billions', () => {
    expect(formatCompact(1200000000)).toBe('1.2B');
  });

  it('should not format small numbers', () => {
    expect(formatCompact(42)).toBe('42');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(2500)).toBe('2.5s');
  });

  it('should format minutes', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate long strings', () => {
    expect(truncate('hello world', 8)).toBe('hello w...');
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should return a non-empty string', () => {
    expect(generateId().length).toBeGreaterThan(0);
  });
});

describe('deepClone', () => {
  it('should clone objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it('should clone arrays', () => {
    const arr = [1, [2, 3]];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
  });
});

describe('pluralize', () => {
  it('should return singular for 1', () => {
    expect(pluralize(1, 'item')).toBe('item');
  });

  it('should add s for other counts', () => {
    expect(pluralize(0, 'item')).toBe('items');
    expect(pluralize(2, 'item')).toBe('items');
    expect(pluralize(100, 'item')).toBe('items');
  });

  it('should use custom plural', () => {
    expect(pluralize(2, 'person', 'people')).toBe('people');
  });
});

describe('getInitials', () => {
  it('should extract initials', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('should handle single name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('should max at 2 initials', () => {
    expect(getInitials('John Michael Doe')).toBe('JM');
  });
});

describe('isNonEmptyString', () => {
  it('should return true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
  });

  it('should return false for empty strings', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('  ')).toBe(false);
  });

  it('should return false for non-strings', () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  it('should show just now for recent dates', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('should show minutes for recent past', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('should show hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
  });

  it('should show days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
  });
});

describe('formatDate', () => {
  it('should format date strings', () => {
    const result = formatDate('2025-03-15T10:30:00Z');
    expect(result).toContain('2025');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });
});

describe('formatDateTime', () => {
  it('should include time', () => {
    const result = formatDateTime('2025-03-15T10:30:00Z');
    expect(result).toContain('2025');
  });
});
