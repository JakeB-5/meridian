// ── Date Utilities ──────────────────────────────────────────────────

/**
 * Format a Date to a human-readable string.
 * Uses ISO-like formatting by default: "YYYY-MM-DD HH:mm:ss"
 */
export const formatDate = (date: Date, locale?: string): string => {
  if (locale) {
    return date.toLocaleString(locale);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
};

/**
 * Parse a date string into a Date object.
 * Returns null if parsing fails.
 */
export const parseDate = (input: string): Date | null => {
  const ts = Date.parse(input);
  if (Number.isNaN(ts)) {
    return null;
  }
  return new Date(ts);
};

/**
 * Check if a date has passed (i.e. is expired relative to now).
 */
export const isExpired = (expiresAt: Date, now: Date = new Date()): boolean => {
  return expiresAt.getTime() <= now.getTime();
};

/**
 * Duration units for addDuration.
 */
export type DurationUnit = 'ms' | 'seconds' | 'minutes' | 'hours' | 'days';

const UNIT_TO_MS: Record<DurationUnit, number> = {
  ms: 1,
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/**
 * Add a duration to a date, returning a new Date.
 */
export const addDuration = (date: Date, amount: number, unit: DurationUnit): Date => {
  const ms = amount * UNIT_TO_MS[unit];
  return new Date(date.getTime() + ms);
};

/**
 * Convert a Date to an ISO 8601 string.
 */
export const toISOString = (date: Date): string => {
  return date.toISOString();
};

/**
 * Parse an ISO 8601 string into a Date.
 * Returns null if parsing fails.
 */
export const fromISOString = (isoString: string): Date | null => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

/**
 * Get the difference between two dates in milliseconds.
 */
export const diffMs = (a: Date, b: Date): number => {
  return a.getTime() - b.getTime();
};

/**
 * Check whether a date falls within a range (inclusive).
 */
export const isWithinRange = (date: Date, start: Date, end: Date): boolean => {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
};
