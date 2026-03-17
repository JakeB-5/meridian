import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  isExpired,
  addDuration,
  toISOString,
  fromISOString,
  diffMs,
  isWithinRange,
} from './date.js';

describe('formatDate', () => {
  it('formats a date to YYYY-MM-DD HH:mm:ss', () => {
    const date = new Date(2024, 0, 15, 10, 30, 45); // Month is 0-indexed
    expect(formatDate(date)).toBe('2024-01-15 10:30:45');
  });

  it('pads single-digit values', () => {
    const date = new Date(2024, 2, 5, 3, 7, 9);
    expect(formatDate(date)).toBe('2024-03-05 03:07:09');
  });

  it('supports locale formatting', () => {
    const date = new Date(2024, 0, 15, 10, 30, 0);
    const result = formatDate(date, 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('parseDate', () => {
  it('parses a valid ISO string', () => {
    const result = parseDate('2024-01-15T10:30:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it('parses a date-only string', () => {
    const result = parseDate('2024-06-15');
    expect(result).toBeInstanceOf(Date);
  });

  it('returns null for invalid string', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });
});

describe('isExpired', () => {
  it('returns true when date is in the past', () => {
    const past = new Date(Date.now() - 10_000);
    expect(isExpired(past)).toBe(true);
  });

  it('returns false when date is in the future', () => {
    const future = new Date(Date.now() + 100_000);
    expect(isExpired(future)).toBe(false);
  });

  it('returns true when date equals now', () => {
    const now = new Date();
    expect(isExpired(now, now)).toBe(true);
  });

  it('accepts custom now parameter', () => {
    const target = new Date('2024-06-01T00:00:00Z');
    const before = new Date('2024-05-31T00:00:00Z');
    const after = new Date('2024-06-02T00:00:00Z');
    expect(isExpired(target, before)).toBe(false);
    expect(isExpired(target, after)).toBe(true);
  });
});

describe('addDuration', () => {
  it('adds milliseconds', () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    const result = addDuration(base, 500, 'ms');
    expect(result.getTime() - base.getTime()).toBe(500);
  });

  it('adds seconds', () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    const result = addDuration(base, 30, 'seconds');
    expect(result.getTime() - base.getTime()).toBe(30_000);
  });

  it('adds minutes', () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    const result = addDuration(base, 5, 'minutes');
    expect(result.getTime() - base.getTime()).toBe(300_000);
  });

  it('adds hours', () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    const result = addDuration(base, 2, 'hours');
    expect(result.getTime() - base.getTime()).toBe(7_200_000);
  });

  it('adds days', () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    const result = addDuration(base, 3, 'days');
    expect(result.getTime() - base.getTime()).toBe(259_200_000);
  });

  it('does not mutate the original date', () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    const original = base.getTime();
    addDuration(base, 10, 'days');
    expect(base.getTime()).toBe(original);
  });
});

describe('toISOString / fromISOString', () => {
  it('round-trips a date', () => {
    const date = new Date('2024-06-15T12:30:00.000Z');
    const iso = toISOString(date);
    const parsed = fromISOString(iso);
    expect(parsed).toEqual(date);
  });

  it('fromISOString returns null for invalid input', () => {
    expect(fromISOString('garbage')).toBeNull();
  });
});

describe('diffMs', () => {
  it('returns positive diff when a > b', () => {
    const a = new Date('2024-01-02T00:00:00Z');
    const b = new Date('2024-01-01T00:00:00Z');
    expect(diffMs(a, b)).toBe(86_400_000);
  });

  it('returns negative diff when a < b', () => {
    const a = new Date('2024-01-01T00:00:00Z');
    const b = new Date('2024-01-02T00:00:00Z');
    expect(diffMs(a, b)).toBe(-86_400_000);
  });

  it('returns 0 for equal dates', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    expect(diffMs(d, d)).toBe(0);
  });
});

describe('isWithinRange', () => {
  const start = new Date('2024-01-01T00:00:00Z');
  const end = new Date('2024-12-31T23:59:59Z');

  it('returns true for date within range', () => {
    const date = new Date('2024-06-15T00:00:00Z');
    expect(isWithinRange(date, start, end)).toBe(true);
  });

  it('returns true for date at start boundary', () => {
    expect(isWithinRange(start, start, end)).toBe(true);
  });

  it('returns true for date at end boundary', () => {
    expect(isWithinRange(end, start, end)).toBe(true);
  });

  it('returns false for date before range', () => {
    const before = new Date('2023-12-31T00:00:00Z');
    expect(isWithinRange(before, start, end)).toBe(false);
  });

  it('returns false for date after range', () => {
    const after = new Date('2025-01-01T00:00:00Z');
    expect(isWithinRange(after, start, end)).toBe(false);
  });
});
