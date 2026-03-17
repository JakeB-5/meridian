import { describe, it, expect } from 'vitest';
import {
  parseCron,
  isValidCron,
  getNextRunTime,
  getNextRunTimes,
  describeCron,
} from './cron-parser.js';
import { InvalidCronError } from '../errors.js';

// ---------------------------------------------------------------------------
// parseCron — basic field parsing
// ---------------------------------------------------------------------------

describe('parseCron()', () => {
  it('parses a simple every-minute expression', () => {
    const parsed = parseCron('* * * * *');
    expect(parsed.minute.values.size).toBe(60);
    expect(parsed.hour.values.size).toBe(24);
    expect(parsed.dayOfMonth.values.size).toBe(31);
    expect(parsed.month.values.size).toBe(12);
    expect(parsed.dayOfWeek.values.size).toBe(8); // 0-7 normalised → 0 appears once (7→0)
  });

  it('parses fixed values in each field', () => {
    const parsed = parseCron('30 9 15 6 1');
    expect([...parsed.minute.values]).toEqual([30]);
    expect([...parsed.hour.values]).toEqual([9]);
    expect([...parsed.dayOfMonth.values]).toEqual([15]);
    expect([...parsed.month.values]).toEqual([6]);
    expect([...parsed.dayOfWeek.values]).toEqual([1]);
  });

  it('parses step expressions (*/15)', () => {
    const parsed = parseCron('*/15 * * * *');
    expect([...parsed.minute.values].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it('parses range expressions (1-5)', () => {
    const parsed = parseCron('0 9-17 * * 1-5');
    expect([...parsed.hour.values].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...parsed.dayOfWeek.values].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses range with step (0-59/5)', () => {
    const parsed = parseCron('0-59/5 * * * *');
    const values = [...parsed.minute.values].sort((a, b) => a - b);
    expect(values).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('parses comma-separated lists', () => {
    const parsed = parseCron('0,15,30,45 * * * *');
    expect([...parsed.minute.values].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it('parses mixed comma + range', () => {
    const parsed = parseCron('0 8,12,18 * * *');
    expect([...parsed.hour.values].sort((a, b) => a - b)).toEqual([8, 12, 18]);
  });

  it('normalises Sunday weekday 7 → 0', () => {
    const parsed = parseCron('0 0 * * 7');
    expect(parsed.dayOfWeek.values.has(0)).toBe(true);
    expect(parsed.dayOfWeek.values.has(7)).toBe(false);
  });

  it('parses named month abbreviations (case-insensitive)', () => {
    const parsed = parseCron('0 0 1 Jan,Jul *');
    expect(parsed.month.values.has(1)).toBe(true);
    expect(parsed.month.values.has(7)).toBe(true);
    expect(parsed.month.values.size).toBe(2);
  });

  it('parses named weekday abbreviations (case-insensitive)', () => {
    const parsed = parseCron('0 0 * * Mon,Wed,Fri');
    expect(parsed.dayOfWeek.values.has(1)).toBe(true);
    expect(parsed.dayOfWeek.values.has(3)).toBe(true);
    expect(parsed.dayOfWeek.values.has(5)).toBe(true);
  });

  it('stores the original and expanded expressions', () => {
    const parsed = parseCron('@daily');
    expect(parsed.originalExpression).toBe('@daily');
    expect(parsed.expression).toBe('0 0 * * *');
  });

  // ── Shortcuts ──────────────────────────────────────────────────────────────

  describe('shortcuts', () => {
    it('@daily → 0 0 * * *', () => {
      const parsed = parseCron('@daily');
      expect([...parsed.minute.values]).toEqual([0]);
      expect([...parsed.hour.values]).toEqual([0]);
    });

    it('@hourly → 0 * * * *', () => {
      const parsed = parseCron('@hourly');
      expect([...parsed.minute.values]).toEqual([0]);
      expect(parsed.hour.values.size).toBe(24);
    });

    it('@weekly → 0 0 * * 0', () => {
      const parsed = parseCron('@weekly');
      expect([...parsed.dayOfWeek.values]).toEqual([0]);
    });

    it('@monthly → 0 0 1 * *', () => {
      const parsed = parseCron('@monthly');
      expect([...parsed.dayOfMonth.values]).toEqual([1]);
    });

    it('@yearly → 0 0 1 1 *', () => {
      const parsed = parseCron('@yearly');
      expect([...parsed.dayOfMonth.values]).toEqual([1]);
      expect([...parsed.month.values]).toEqual([1]);
    });

    it('@annually is an alias for @yearly', () => {
      const a = parseCron('@annually');
      const b = parseCron('@yearly');
      expect([...a.minute.values]).toEqual([...b.minute.values]);
    });

    it('@midnight is an alias for @daily', () => {
      const a = parseCron('@midnight');
      const b = parseCron('@daily');
      expect([...a.hour.values]).toEqual([...b.hour.values]);
    });
  });

  // ── Error cases ────────────────────────────────────────────────────────────

  describe('invalid expressions', () => {
    it('throws InvalidCronError for wrong field count', () => {
      expect(() => parseCron('* * * *')).toThrow(InvalidCronError);
      expect(() => parseCron('* * * * * *')).toThrow(InvalidCronError);
    });

    it('throws for out-of-range minute', () => {
      expect(() => parseCron('60 * * * *')).toThrow(InvalidCronError);
    });

    it('throws for out-of-range hour', () => {
      expect(() => parseCron('0 24 * * *')).toThrow(InvalidCronError);
    });

    it('throws for out-of-range day-of-month', () => {
      expect(() => parseCron('0 0 32 * *')).toThrow(InvalidCronError);
    });

    it('throws for out-of-range month', () => {
      expect(() => parseCron('0 0 1 13 *')).toThrow(InvalidCronError);
    });

    it('throws for zero step value', () => {
      expect(() => parseCron('*/0 * * * *')).toThrow(InvalidCronError);
    });

    it('throws for non-numeric token', () => {
      expect(() => parseCron('abc * * * *')).toThrow(InvalidCronError);
    });

    it('throws for inverted range (5-3)', () => {
      expect(() => parseCron('5-3 * * * *')).toThrow(InvalidCronError);
    });

    it('throws for empty string', () => {
      expect(() => parseCron('')).toThrow(InvalidCronError);
    });
  });
});

// ---------------------------------------------------------------------------
// isValidCron
// ---------------------------------------------------------------------------

describe('isValidCron()', () => {
  it('returns true for valid expressions', () => {
    expect(isValidCron('* * * * *')).toBe(true);
    expect(isValidCron('@daily')).toBe(true);
    expect(isValidCron('0 9 * * 1-5')).toBe(true);
    expect(isValidCron('*/15 * * * *')).toBe(true);
  });

  it('returns false for invalid expressions', () => {
    expect(isValidCron('')).toBe(false);
    expect(isValidCron('* * * *')).toBe(false);
    expect(isValidCron('60 * * * *')).toBe(false);
    expect(isValidCron('not-a-cron')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNextRunTime
// ---------------------------------------------------------------------------

describe('getNextRunTime()', () => {
  it('returns a date strictly after `from`', () => {
    const from = new Date('2024-01-15T10:30:00Z');
    const next = getNextRunTime('* * * * *', from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it('advances exactly one minute for every-minute cron', () => {
    const from = new Date('2024-01-15T10:30:00Z');
    const next = getNextRunTime('* * * * *', from);
    expect(next.getTime() - from.getTime()).toBe(60_000);
  });

  it('finds the correct next hourly run', () => {
    // from = 10:30 → next @hourly = 11:00
    const from = new Date('2024-01-15T10:30:00Z');
    const next = getNextRunTime('@hourly', from);
    expect(next.getUTCHours()).toBe(11);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('finds the correct next @daily run', () => {
    const from = new Date('2024-01-15T10:30:00Z');
    const next = getNextRunTime('@daily', from);
    // Next midnight UTC on Jan 16
    expect(next.getUTCDate()).toBe(16);
    expect(next.getUTCHours()).toBe(0);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('skips to next month when day-of-month does not exist in current month', () => {
    // 31st of February doesn't exist — should roll to March 31
    const from = new Date('2024-02-01T00:00:00Z');
    const next = getNextRunTime('0 0 31 * *', from);
    expect(next.getUTCMonth()).toBe(2); // March = 2
    expect(next.getUTCDate()).toBe(31);
  });

  it('finds next weekday-based run', () => {
    // from = 2024-01-15 (Monday) → next "0 9 * * 1" should be the same day at 09:00
    const from = new Date('2024-01-15T08:00:00Z');
    const next = getNextRunTime('0 9 * * 1', from);
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(0);
    // Still Monday
    expect(next.getUTCDay()).toBe(1);
  });

  it('throws for unsatisfiable expression (Feb 30)', () => {
    // Feb 30 never exists
    expect(() => getNextRunTime('0 0 30 2 *', new Date('2024-01-01T00:00:00Z'))).toThrow();
  });

  it('parses expression before computing next run (throws on bad expression)', () => {
    expect(() => getNextRunTime('invalid', new Date())).toThrow(InvalidCronError);
  });
});

// ---------------------------------------------------------------------------
// getNextRunTimes
// ---------------------------------------------------------------------------

describe('getNextRunTimes()', () => {
  it('returns N strictly increasing dates', () => {
    const from = new Date('2024-01-15T10:00:00Z');
    const times = getNextRunTimes('@hourly', 5, from);
    expect(times).toHaveLength(5);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!.getTime()).toBeGreaterThan(times[i - 1]!.getTime());
    }
  });

  it('returns an empty array when count is 0', () => {
    const times = getNextRunTimes('@daily', 0, new Date());
    expect(times).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describeCron
// ---------------------------------------------------------------------------

describe('describeCron()', () => {
  it('returns human-readable text for known shortcuts', () => {
    expect(describeCron('@daily')).toBe('daily at midnight');
    expect(describeCron('@hourly')).toBe('every hour');
    expect(describeCron('@weekly')).toBe('weekly on Sunday at midnight');
    expect(describeCron('@monthly')).toBe('monthly on the 1st at midnight');
    expect(describeCron('@yearly')).toBe('yearly on January 1st at midnight');
    expect(describeCron('@midnight')).toBe('daily at midnight');
  });

  it('returns the raw expression for non-shorthand cron', () => {
    expect(describeCron('0 9 * * 1-5')).toBe('0 9 * * 1-5');
  });

  it('is case-insensitive for shortcuts', () => {
    expect(describeCron('@DAILY')).toBe('daily at midnight');
  });
});
