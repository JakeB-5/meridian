// ── SQLite Dialect ───────────────────────────────────────────────────
// SQL dialect implementation for SQLite.
// Uses double-quote identifiers, ? parameter placeholders,
// and SQLite-specific date/time functions.

import { BaseSQLDialect } from './sql-dialect.js';
import type { DateTruncUnit, DateDiffUnit } from './sql-dialect.js';

/** Mapping from DateTruncUnit to strftime format strings */
const SQLITE_STRFTIME_FORMATS: Record<DateTruncUnit, string> = {
  year: '%Y-01-01 00:00:00',
  quarter: '', // Handled specially
  month: '%Y-%m-01 00:00:00',
  week: '', // Handled specially
  day: '%Y-%m-%d 00:00:00',
  hour: '%Y-%m-%d %H:00:00',
  minute: '%Y-%m-%d %H:%M:00',
  second: '%Y-%m-%d %H:%M:%S',
};

/**
 * SQLite SQL dialect.
 *
 * Key characteristics:
 * - Double-quote identifiers: "table_name"
 * - Question mark parameters: ?
 * - RETURNING support (since SQLite 3.35.0)
 * - strftime() for date truncation
 * - julianday() for date differences
 * - String concat with ||
 * - Limited window function support (since 3.25.0)
 */
export class SQLiteDialect extends BaseSQLDialect {
  readonly name = 'sqlite';

  quoteIdentifier(name: string): string {
    // Escape embedded double quotes by doubling them
    const escaped = name.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  supportsReturning(): boolean {
    // SQLite supports RETURNING since 3.35.0
    return true;
  }

  getParameterPlaceholder(_index: number): string {
    return '?';
  }

  formatBoolean(value: boolean): string {
    return value ? '1' : '0';
  }

  getDateTruncExpression(field: string, unit: DateTruncUnit): string {
    if (unit === 'quarter') {
      // Truncate to start of quarter
      return `strftime('%Y-', ${field}) || CASE ((CAST(strftime('%m', ${field}) AS INTEGER) - 1) / 3) WHEN 0 THEN '01' WHEN 1 THEN '04' WHEN 2 THEN '07' WHEN 3 THEN '10' END || '-01 00:00:00'`;
    }
    if (unit === 'week') {
      // Truncate to start of week (Monday)
      return `strftime('%Y-%m-%d 00:00:00', ${field}, 'weekday 0', '-6 days')`;
    }

    const format = SQLITE_STRFTIME_FORMATS[unit];
    return `strftime('${format}', ${field})`;
  }

  getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string {
    // SQLite uses julianday() for date arithmetic
    const dayDiff = `(julianday(${endField}) - julianday(${startField}))`;

    switch (unit) {
      case 'second':
        return `CAST(${dayDiff} * 86400 AS INTEGER)`;
      case 'minute':
        return `CAST(${dayDiff} * 1440 AS INTEGER)`;
      case 'hour':
        return `CAST(${dayDiff} * 24 AS INTEGER)`;
      case 'day':
        return `CAST(${dayDiff} AS INTEGER)`;
      case 'month':
        return `CAST((${dayDiff}) / 30.4375 AS INTEGER)`;
      case 'year':
        return `CAST((${dayDiff}) / 365.25 AS INTEGER)`;
    }
  }

  getConcatExpression(parts: string[]): string {
    return parts.join(' || ');
  }

  getCurrentTimestamp(): string {
    return "datetime('now')";
  }

  /**
   * SQLite-specific: typeof() expression.
   */
  getTypeOfExpression(expr: string): string {
    return `typeof(${expr})`;
  }

  /**
   * SQLite-specific: GROUP_CONCAT for string aggregation.
   */
  getGroupConcatExpression(expr: string, delimiter: string): string {
    return `group_concat(${expr}, ${this.quoteString(delimiter)})`;
  }

  /**
   * SQLite-specific: JSON extraction.
   */
  getJsonExtractExpression(field: string, path: string): string {
    return `json_extract(${field}, ${this.quoteString(path)})`;
  }

  /**
   * SQLite-specific: IIF expression (ternary).
   */
  getIifExpression(condition: string, trueExpr: string, falseExpr: string): string {
    return `IIF(${condition}, ${trueExpr}, ${falseExpr})`;
  }
}
