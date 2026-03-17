// ── MySQL Dialect ────────────────────────────────────────────────────
// SQL dialect implementation for MySQL.
// Uses backtick identifiers, ? parameter placeholders,
// and MySQL-specific date/time functions.

import { BaseSQLDialect } from './sql-dialect.js';
import type { DateTruncUnit, DateDiffUnit } from './sql-dialect.js';

/** Mapping from DateTruncUnit to MySQL DATE_FORMAT patterns */
const MYSQL_DATE_TRUNC_FORMATS: Record<DateTruncUnit, string> = {
  year: '%Y-01-01 00:00:00',
  quarter: '', // Handled specially
  month: '%Y-%m-01 00:00:00',
  week: '', // Handled specially
  day: '%Y-%m-%d 00:00:00',
  hour: '%Y-%m-%d %H:00:00',
  minute: '%Y-%m-%d %H:%i:00',
  second: '%Y-%m-%d %H:%i:%s',
};

/** Mapping from DateDiffUnit to MySQL TIMESTAMPDIFF unit */
const MYSQL_TIMESTAMPDIFF_UNITS: Record<DateDiffUnit, string> = {
  year: 'YEAR',
  month: 'MONTH',
  day: 'DAY',
  hour: 'HOUR',
  minute: 'MINUTE',
  second: 'SECOND',
};

/**
 * MySQL SQL dialect.
 *
 * Key characteristics:
 * - Backtick identifiers: `table_name`
 * - Question mark parameters: ?
 * - No RETURNING clause support
 * - DATE_FORMAT for date truncation
 * - TIMESTAMPDIFF for date differences
 * - CONCAT() function for string concatenation
 * - GROUP_CONCAT for string aggregation
 */
export class MySQLDialect extends BaseSQLDialect {
  readonly name = 'mysql';

  quoteIdentifier(name: string): string {
    // Escape embedded backticks by doubling them
    const escaped = name.replace(/`/g, '``');
    return `\`${escaped}\``;
  }

  supportsReturning(): boolean {
    return false;
  }

  getParameterPlaceholder(_index: number): string {
    return '?';
  }

  formatBoolean(value: boolean): string {
    return value ? '1' : '0';
  }

  getDateTruncExpression(field: string, unit: DateTruncUnit): string {
    // Quarter and week need special handling
    if (unit === 'quarter') {
      return `DATE_FORMAT(MAKEDATE(YEAR(${field}), 1) + INTERVAL (QUARTER(${field}) - 1) QUARTER, '%Y-%m-%d 00:00:00')`;
    }
    if (unit === 'week') {
      return `DATE_FORMAT(DATE_SUB(${field}, INTERVAL WEEKDAY(${field}) DAY), '%Y-%m-%d 00:00:00')`;
    }

    const format = MYSQL_DATE_TRUNC_FORMATS[unit];
    return `DATE_FORMAT(${field}, '${format}')`;
  }

  getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string {
    const mysqlUnit = MYSQL_TIMESTAMPDIFF_UNITS[unit];
    return `TIMESTAMPDIFF(${mysqlUnit}, ${startField}, ${endField})`;
  }

  getConcatExpression(parts: string[]): string {
    return `CONCAT(${parts.join(', ')})`;
  }

  getCurrentTimestamp(): string {
    return 'NOW()';
  }

  /**
   * MySQL-specific: GROUP_CONCAT for string aggregation.
   */
  getGroupConcatExpression(
    expr: string,
    delimiter: string,
    distinct = false,
    orderBy?: string,
  ): string {
    const distinctStr = distinct ? 'DISTINCT ' : '';
    const orderStr = orderBy ? ` ORDER BY ${orderBy}` : '';
    return `GROUP_CONCAT(${distinctStr}${expr}${orderStr} SEPARATOR ${this.quoteString(delimiter)})`;
  }

  /**
   * MySQL-specific: JSON aggregation.
   */
  getJsonArrayAggExpression(expr: string): string {
    return `JSON_ARRAYAGG(${expr})`;
  }

  /**
   * MySQL-specific: IF expression.
   */
  getIfExpression(condition: string, trueExpr: string, falseExpr: string): string {
    return `IF(${condition}, ${trueExpr}, ${falseExpr})`;
  }

  /**
   * MySQL-specific: IFNULL.
   */
  getIfNullExpression(expr: string, fallback: string): string {
    return `IFNULL(${expr}, ${fallback})`;
  }
}
