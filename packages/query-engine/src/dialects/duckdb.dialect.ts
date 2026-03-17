// ── DuckDB Dialect ──────────────────────────────────────────────────
// SQL dialect implementation for DuckDB.
// Uses double-quote identifiers, $N parameter placeholders,
// and DuckDB-specific functions and extensions.

import { BaseSQLDialect } from './sql-dialect.js';
import type { DateTruncUnit, DateDiffUnit } from './sql-dialect.js';

/**
 * DuckDB SQL dialect.
 *
 * Key characteristics:
 * - Double-quote identifiers: "table_name"
 * - Dollar-sign parameters: $1, $2, ...
 * - RETURNING support
 * - date_trunc() for date truncation (PostgreSQL-compatible)
 * - datediff() / date_diff() for date differences
 * - String concat with ||
 * - Full window function and CTE support
 * - Native Parquet/CSV/JSON file reading
 * - ASOF JOIN, LATERAL JOIN support
 * - LIST and STRUCT types
 * - QUALIFY clause for window function filtering
 */
export class DuckDBDialect extends BaseSQLDialect {
  readonly name = 'duckdb';

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
    // DuckDB uses PostgreSQL-compatible date_trunc
    return `date_trunc('${unit}', ${field})`;
  }

  getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string {
    // DuckDB supports datediff(unit, start, end)
    return `datediff('${unit}', ${startField}, ${endField})`;
  }

  getConcatExpression(parts: string[]): string {
    return parts.join(' || ');
  }

  getCurrentTimestamp(): string {
    return 'current_timestamp';
  }

  /**
   * DuckDB-specific: Read from a Parquet file.
   */
  getReadParquetExpression(path: string): string {
    return `read_parquet(${this.quoteString(path)})`;
  }

  /**
   * DuckDB-specific: Read from a CSV file.
   */
  getReadCsvExpression(path: string, options?: Record<string, string>): string {
    if (options && Object.keys(options).length > 0) {
      const optionParts = Object.entries(options).map(
        ([k, v]) => `${k} = ${this.quoteString(v)}`,
      );
      return `read_csv(${this.quoteString(path)}, ${optionParts.join(', ')})`;
    }
    return `read_csv(${this.quoteString(path)})`;
  }

  /**
   * DuckDB-specific: Read from a JSON file.
   */
  getReadJsonExpression(path: string): string {
    return `read_json_auto(${this.quoteString(path)})`;
  }

  /**
   * DuckDB-specific: QUALIFY clause for window function filtering.
   */
  formatQualify(condition: string): string {
    return `QUALIFY ${condition}`;
  }

  /**
   * DuckDB-specific: LIST aggregation (like PostgreSQL array_agg).
   */
  getListAggExpression(expr: string): string {
    return `list(${expr})`;
  }

  /**
   * DuckDB-specific: String aggregation.
   */
  getStringAggExpression(expr: string, delimiter: string): string {
    return `string_agg(${expr}, ${this.quoteString(delimiter)})`;
  }

  /**
   * DuckDB-specific: Struct creation.
   */
  getStructExpression(fields: Record<string, string>): string {
    const parts = Object.entries(fields).map(
      ([k, v]) => `${this.quoteString(k)}: ${v}`,
    );
    return `{${parts.join(', ')}}`;
  }

  /**
   * DuckDB-specific: UNNEST for expanding lists.
   */
  getUnnestExpression(expr: string): string {
    return `UNNEST(${expr})`;
  }

  /**
   * DuckDB-specific: Interval expression.
   */
  getIntervalExpression(value: number, unit: string): string {
    return `INTERVAL ${value} ${unit}`;
  }

  /**
   * DuckDB-specific: EPOCH function.
   */
  getEpochExpression(field: string): string {
    return `epoch(${field})`;
  }

  /**
   * DuckDB-specific: approximate count distinct.
   */
  getApproxCountDistinctExpression(expr: string): string {
    return `approx_count_distinct(${expr})`;
  }

  /**
   * DuckDB-specific: SAMPLE clause.
   */
  formatSample(count: number, method: 'system' | 'bernoulli' | 'reservoir' = 'system'): string {
    return `USING SAMPLE ${count} (${method})`;
  }

  /**
   * DuckDB-specific: PIVOT statement.
   */
  formatPivot(
    source: string,
    aggExpr: string,
    pivotColumn: string,
    values: string[],
  ): string {
    const valueList = values.map((v) => this.quoteString(v)).join(', ');
    return `PIVOT ${source} ON ${pivotColumn} IN (${valueList}) USING ${aggExpr}`;
  }
}
