// ── ClickHouse Dialect ───────────────────────────────────────────────
// SQL dialect implementation for ClickHouse.
// Uses backtick identifiers, {name:Type} named parameters,
// and ClickHouse-specific date/time functions.

import { BaseSQLDialect } from './sql-dialect.js';
import type { DateTruncUnit, DateDiffUnit } from './sql-dialect.js';

/** Mapping from DateTruncUnit to ClickHouse toStartOf functions */
const CH_DATE_TRUNC_FNS: Record<DateTruncUnit, string> = {
  year: 'toStartOfYear',
  quarter: 'toStartOfQuarter',
  month: 'toStartOfMonth',
  week: 'toStartOfWeek',
  day: 'toStartOfDay',
  hour: 'toStartOfHour',
  minute: 'toStartOfMinute',
  second: 'toStartOfSecond',
};

/** Mapping from DateDiffUnit to ClickHouse dateDiff unit strings */
const CH_DATE_DIFF_UNITS: Record<DateDiffUnit, string> = {
  year: 'year',
  month: 'month',
  day: 'day',
  hour: 'hour',
  minute: 'minute',
  second: 'second',
};

/**
 * ClickHouse SQL dialect.
 *
 * Key characteristics:
 * - Backtick identifiers: `table_name`
 * - Named parameters: {p0:String}, {p1:UInt32}
 *   (we use positional naming: {p0}, {p1}, ...)
 * - No RETURNING clause support
 * - toStartOf*() functions for date truncation
 * - dateDiff() for date differences
 * - concat() for string concatenation
 * - Full window function and CTE support
 * - MergeTree engine family
 * - Columnar storage optimized for analytics
 */
export class ClickHouseDialect extends BaseSQLDialect {
  readonly name = 'clickhouse';

  quoteIdentifier(name: string): string {
    // Escape embedded backticks by doubling them
    const escaped = name.replace(/`/g, '``');
    return `\`${escaped}\``;
  }

  supportsReturning(): boolean {
    return false;
  }

  getParameterPlaceholder(index: number): string {
    // ClickHouse uses named parameters; we map index to {p0}, {p1}, etc.
    return `{p${index}:String}`;
  }

  formatBoolean(value: boolean): string {
    return value ? '1' : '0';
  }

  getDateTruncExpression(field: string, unit: DateTruncUnit): string {
    const fn = CH_DATE_TRUNC_FNS[unit];
    return `${fn}(${field})`;
  }

  getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string {
    const chUnit = CH_DATE_DIFF_UNITS[unit];
    return `dateDiff('${chUnit}', ${startField}, ${endField})`;
  }

  getConcatExpression(parts: string[]): string {
    return `concat(${parts.join(', ')})`;
  }

  getCurrentTimestamp(): string {
    return 'now()';
  }

  /**
   * ClickHouse-specific: Use FINAL modifier for ReplacingMergeTree tables.
   */
  getFinalModifier(): string {
    return 'FINAL';
  }

  /**
   * ClickHouse-specific: PREWHERE clause (optimized filter for MergeTree).
   */
  formatPreWhere(condition: string): string {
    return `PREWHERE ${condition}`;
  }

  /**
   * ClickHouse-specific: Array functions.
   */
  getArrayJoinExpression(arrayExpr: string): string {
    return `arrayJoin(${arrayExpr})`;
  }

  /**
   * ClickHouse-specific: groupArray aggregation.
   */
  getGroupArrayExpression(expr: string, maxSize?: number): string {
    if (maxSize !== undefined) {
      return `groupArray(${maxSize})(${expr})`;
    }
    return `groupArray(${expr})`;
  }

  /**
   * ClickHouse-specific: groupUniqArray aggregation.
   */
  getGroupUniqArrayExpression(expr: string): string {
    return `groupUniqArray(${expr})`;
  }

  /**
   * ClickHouse-specific: approximate count distinct.
   */
  getUniqExpression(expr: string): string {
    return `uniq(${expr})`;
  }

  /**
   * ClickHouse-specific: quantile function.
   */
  getQuantileExpression(expr: string, level: number): string {
    return `quantile(${level})(${expr})`;
  }

  /**
   * ClickHouse-specific: If function.
   */
  getIfExpression(condition: string, trueExpr: string, falseExpr: string): string {
    return `if(${condition}, ${trueExpr}, ${falseExpr})`;
  }

  /**
   * ClickHouse-specific: multiIf (CASE equivalent).
   */
  getMultiIfExpression(cases: Array<{ condition: string; result: string }>, elseResult: string): string {
    const args = cases.flatMap((c) => [c.condition, c.result]);
    args.push(elseResult);
    return `multiIf(${args.join(', ')})`;
  }

  /**
   * ClickHouse-specific: Format engine.
   */
  getFormatExpression(query: string, format: string): string {
    return `${query} FORMAT ${format}`;
  }

  /**
   * ClickHouse-specific: SAMPLE clause.
   */
  formatSample(rate: number): string {
    return `SAMPLE ${rate}`;
  }
}
