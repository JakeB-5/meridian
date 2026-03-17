import { InvalidCronError } from '../errors.js';

// ---------------------------------------------------------------------------
// Cron shorthand expansions
// ---------------------------------------------------------------------------

const CRON_SHORTCUTS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

// ---------------------------------------------------------------------------
// Field range definitions  [min, max]
// ---------------------------------------------------------------------------

const FIELD_RANGES: [number, number][] = [
  [0, 59],  // minute
  [0, 23],  // hour
  [1, 31],  // day-of-month
  [1, 12],  // month
  [0, 7],   // day-of-week  (0 and 7 both mean Sunday)
];

const FIELD_NAMES = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'];

// ---------------------------------------------------------------------------
// Month and weekday name maps
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

// ---------------------------------------------------------------------------
// Parsed cron field representation
// ---------------------------------------------------------------------------

/** An expanded cron field containing the exact set of matching values. */
export interface ParsedCronField {
  /** Every value that matches for this field position. */
  values: Set<number>;
  /** The original field string before expansion. */
  raw: string;
}

/** All five parsed fields plus the original expression. */
export interface ParsedCron {
  minute: ParsedCronField;
  hour: ParsedCronField;
  dayOfMonth: ParsedCronField;
  month: ParsedCronField;
  dayOfWeek: ParsedCronField;
  /** The expression after shorthand substitution. */
  expression: string;
  /** The original expression before shorthand substitution. */
  originalExpression: string;
}

// ---------------------------------------------------------------------------
// Low-level field parsing helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a named value (e.g. "jan", "sun") to its numeric equivalent.
 * Returns `undefined` when the token is not a known alias.
 */
function resolveAlias(token: string, fieldIndex: number): number | undefined {
  const lower = token.toLowerCase();
  if (fieldIndex === 3) return MONTH_NAMES[lower];
  if (fieldIndex === 4) return WEEKDAY_NAMES[lower];
  return undefined;
}

/**
 * Parse a single token ("*", "5", "1-5", "0-23/2", "MON", …) within a field.
 * Returns the set of matching values or throws `InvalidCronError`.
 */
function parseToken(
  token: string,
  fieldIndex: number,
  expression: string,
): Set<number> {
  const [min, max] = FIELD_RANGES[fieldIndex]!;
  const result = new Set<number>();

  // Wildcard with optional step: * or */n
  if (token === '*' || token.startsWith('*/')) {
    const step = token === '*' ? 1 : parseInt(token.slice(2), 10);
    if (isNaN(step) || step < 1) {
      throw new InvalidCronError(expression, `invalid step in field ${FIELD_NAMES[fieldIndex]}: '${token}'`);
    }
    for (let v = min; v <= max; v += step) result.add(v);
    return result;
  }

  // Range with optional step: a-b or a-b/n
  if (token.includes('-')) {
    const [rangePart, stepStr] = token.split('/');
    const step = stepStr !== undefined ? parseInt(stepStr, 10) : 1;
    const [startStr, endStr] = rangePart!.split('-');

    const startAlias = resolveAlias(startStr!, fieldIndex);
    const endAlias = resolveAlias(endStr!, fieldIndex);
    const start = startAlias !== undefined ? startAlias : parseInt(startStr!, 10);
    const end = endAlias !== undefined ? endAlias : parseInt(endStr!, 10);

    if (isNaN(start) || isNaN(end) || isNaN(step) || step < 1) {
      throw new InvalidCronError(expression, `invalid range in field ${FIELD_NAMES[fieldIndex]}: '${token}'`);
    }
    if (start < min || end > max || start > end) {
      throw new InvalidCronError(
        expression,
        `range out of bounds in field ${FIELD_NAMES[fieldIndex]}: '${token}' (allowed ${min}-${max})`,
      );
    }
    for (let v = start; v <= end; v += step) result.add(v);
    return result;
  }

  // Single value or alias
  const alias = resolveAlias(token, fieldIndex);
  const value = alias !== undefined ? alias : parseInt(token, 10);

  if (isNaN(value)) {
    throw new InvalidCronError(expression, `invalid value in field ${FIELD_NAMES[fieldIndex]}: '${token}'`);
  }
  // Normalise Sunday: 7 → 0
  const normalised = fieldIndex === 4 && value === 7 ? 0 : value;
  if (normalised < min || normalised > max) {
    throw new InvalidCronError(
      expression,
      `value out of bounds in field ${FIELD_NAMES[fieldIndex]}: ${normalised} (allowed ${min}-${max})`,
    );
  }
  result.add(normalised);
  return result;
}

/**
 * Parse a full cron field string (comma-separated list of tokens).
 */
function parseField(field: string, fieldIndex: number, expression: string): ParsedCronField {
  const values = new Set<number>();
  for (const token of field.split(',')) {
    for (const v of parseToken(token.trim(), fieldIndex, expression)) {
      values.add(v);
    }
  }
  return { values, raw: field };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a cron expression into a structured `ParsedCron` object.
 *
 * Supports:
 * - Standard 5-field syntax: `minute hour dom month dow`
 * - Named shortcuts: `@daily`, `@hourly`, `@weekly`, `@monthly`, `@yearly`
 * - Step values: `* /2`, `0-23/4`
 * - Comma lists: `1,3,5`
 * - Named months/weekdays: `jan-mar`, `mon,wed,fri`
 *
 * @throws `InvalidCronError` for malformed expressions.
 */
export function parseCron(expression: string): ParsedCron {
  const original = expression.trim();
  const expanded = CRON_SHORTCUTS[original.toLowerCase()] ?? original;

  const fields = expanded.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new InvalidCronError(original, `expected 5 fields, got ${fields.length}`);
  }

  const [minuteField, hourField, domField, monthField, dowField] = fields as [
    string, string, string, string, string,
  ];

  return {
    minute: parseField(minuteField, 0, original),
    hour: parseField(hourField, 1, original),
    dayOfMonth: parseField(domField, 2, original),
    month: parseField(monthField, 3, original),
    dayOfWeek: parseField(dowField, 4, original),
    expression: expanded,
    originalExpression: original,
  };
}

/**
 * Validate a cron expression without returning the parsed structure.
 * Returns `true` when valid, `false` otherwise.
 */
export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Next-run calculation
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60_000;

/**
 * Calculate the next Date at which a cron expression will fire, starting
 * strictly *after* `from`.
 *
 * The algorithm advances one minute at a time from `from + 1 minute` and
 * checks whether all five fields match.  It caps the search at one year to
 * prevent infinite loops on unsatisfiable expressions.
 *
 * @throws `InvalidCronError` if the expression is malformed.
 * @throws `Error` if no matching time is found within the next year.
 */
export function getNextRunTime(expression: string, from: Date = new Date()): Date {
  const parsed = parseCron(expression);

  // Start searching from the next whole minute after `from`.
  let candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);
  candidate = new Date(candidate.getTime() + MS_PER_MINUTE);

  const limit = new Date(from.getTime() + 366 * 24 * 60 * MS_PER_MINUTE);

  while (candidate <= limit) {
    const month = candidate.getUTCMonth() + 1; // JS months are 0-based
    const dom = candidate.getUTCDate();
    const dow = candidate.getUTCDay();         // 0 = Sunday
    const hour = candidate.getUTCHours();
    const minute = candidate.getUTCMinutes();

    if (
      parsed.month.values.has(month) &&
      parsed.dayOfMonth.values.has(dom) &&
      parsed.dayOfWeek.values.has(dow) &&
      parsed.hour.values.has(hour) &&
      parsed.minute.values.has(minute)
    ) {
      return candidate;
    }

    candidate = new Date(candidate.getTime() + MS_PER_MINUTE);
  }

  throw new Error(`No matching run time found within the next year for expression: '${expression}'`);
}

/**
 * Calculate the next N run times for a cron expression.
 */
export function getNextRunTimes(expression: string, count: number, from: Date = new Date()): Date[] {
  const results: Date[] = [];
  let cursor = from;
  for (let i = 0; i < count; i++) {
    const next = getNextRunTime(expression, cursor);
    results.push(next);
    cursor = next;
  }
  return results;
}

/**
 * Human-readable description of a cron expression.
 * Returns the shorthand name when applicable, otherwise the raw expression.
 */
export function describeCron(expression: string): string {
  const lower = expression.trim().toLowerCase();
  const knownAliases: Record<string, string> = {
    '@daily': 'daily at midnight',
    '@midnight': 'daily at midnight',
    '@hourly': 'every hour',
    '@weekly': 'weekly on Sunday at midnight',
    '@monthly': 'monthly on the 1st at midnight',
    '@yearly': 'yearly on January 1st at midnight',
    '@annually': 'yearly on January 1st at midnight',
  };
  return knownAliases[lower] ?? expression.trim();
}
