// ── PostgreSQL Dialect ───────────────────────────────────────────────
// SQL dialect implementation for PostgreSQL.
// Uses double-quote identifiers, $N parameter placeholders,
// and PostgreSQL-specific date/time functions.

import { BaseSQLDialect } from './sql-dialect.js';
import type { DateTruncUnit, DateDiffUnit } from './sql-dialect.js';

/**
 * PostgreSQL SQL dialect.
 *
 * Key characteristics:
 * - Double-quote identifiers: "table_name"
 * - Dollar-sign parameters: $1, $2, ...
 * - RETURNING support
 * - date_trunc() for date truncation
 * - EXTRACT(EPOCH FROM interval) for date diff
 * - String concat with ||
 * - Full window function and CTE support
 */
export class PostgreSQLDialect extends BaseSQLDialect {
  readonly name = 'postgresql';

  quoteIdentifier(name: string): string {
    // Escape embedded double quotes by doubling them
    const escaped = name.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  supportsReturning(): boolean {
    return true;
  }

  getParameterPlaceholder(index: number): string {
    return `$${index + 1}`;
  }

  getDateTruncExpression(field: string, unit: DateTruncUnit): string {
    return `date_trunc('${unit}', ${field})`;
  }

  getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string {
    // PostgreSQL uses EXTRACT(EPOCH FROM ...) for interval calculation
    const intervalExpr = `(${endField} - ${startField})`;

    switch (unit) {
      case 'second':
        return `EXTRACT(EPOCH FROM ${intervalExpr})`;
      case 'minute':
        return `EXTRACT(EPOCH FROM ${intervalExpr}) / 60`;
      case 'hour':
        return `EXTRACT(EPOCH FROM ${intervalExpr}) / 3600`;
      case 'day':
        return `EXTRACT(EPOCH FROM ${intervalExpr}) / 86400`;
      case 'month':
        return `(EXTRACT(YEAR FROM ${endField}) - EXTRACT(YEAR FROM ${startField})) * 12 + (EXTRACT(MONTH FROM ${endField}) - EXTRACT(MONTH FROM ${startField}))`;
      case 'year':
        return `EXTRACT(YEAR FROM ${endField}) - EXTRACT(YEAR FROM ${startField})`;
    }
  }

  getConcatExpression(parts: string[]): string {
    return parts.join(' || ');
  }

  getCurrentTimestamp(): string {
    return 'NOW()';
  }

  /**
   * PostgreSQL-specific: Generate a generate_series expression.
   */
  getGenerateSeriesExpression(
    start: string,
    end: string,
    step: string,
  ): string {
    return `generate_series(${start}, ${end}, ${step})`;
  }

  /**
   * PostgreSQL-specific: Generate an INTERVAL expression.
   */
  getIntervalExpression(value: number, unit: string): string {
    return `INTERVAL '${value} ${unit}'`;
  }

  /**
   * PostgreSQL-specific: Array aggregation.
   */
  getArrayAggExpression(expr: string, distinct = false): string {
    const distinctStr = distinct ? 'DISTINCT ' : '';
    return `array_agg(${distinctStr}${expr})`;
  }

  /**
   * PostgreSQL-specific: JSON aggregation.
   */
  getJsonAggExpression(expr: string): string {
    return `json_agg(${expr})`;
  }

  /**
   * PostgreSQL-specific: String aggregation.
   */
  getStringAggExpression(expr: string, delimiter: string): string {
    return `string_agg(${expr}, ${this.quoteString(delimiter)})`;
  }
}
