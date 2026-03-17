// ── SQL Dialect Interface ────────────────────────────────────────────
// Each supported database implements this interface to handle
// dialect-specific SQL generation differences.

/**
 * Abstraction over SQL dialect differences between database engines.
 * Each connector provides its own implementation.
 */
export interface SQLDialect {
  /** Identifier for the dialect (e.g. 'postgresql', 'mysql') */
  readonly name: string;

  /**
   * Quote a database identifier (table or column name).
   * @example PostgreSQL: "users" → "\"users\""
   * @example MySQL: "users" → "`users`"
   */
  quoteIdentifier(name: string): string;

  /**
   * Quote a string literal value for embedding in SQL.
   * This should escape single quotes and handle special characters.
   * NOTE: Prefer parameterized queries over string embedding.
   * @example "O'Brien" → "'O''Brien'"
   */
  quoteString(value: string): string;

  /**
   * Format a LIMIT/OFFSET clause.
   * @example PostgreSQL: "LIMIT 10 OFFSET 5"
   * @example MySQL: "LIMIT 5, 10" or "LIMIT 10 OFFSET 5"
   */
  formatLimit(limit: number, offset?: number): string;

  /**
   * Format a boolean literal.
   * @example PostgreSQL: "TRUE" / "FALSE"
   * @example MySQL: "1" / "0"
   */
  formatBoolean(value: boolean): string;

  /**
   * Whether the dialect supports RETURNING clause (INSERT/UPDATE/DELETE).
   */
  supportsReturning(): boolean;

  /**
   * Whether the dialect supports window functions (OVER, PARTITION BY).
   */
  supportsWindowFunctions(): boolean;

  /**
   * Whether the dialect supports Common Table Expressions (WITH).
   */
  supportsCTE(): boolean;

  /**
   * Generate a CAST expression.
   * @example PostgreSQL: "CAST(col AS TEXT)"
   * @example MySQL: "CAST(col AS CHAR)"
   */
  getCastExpression(expr: string, type: string): string;

  /**
   * Generate a date truncation expression.
   * @example PostgreSQL: "date_trunc('month', col)"
   * @example MySQL: "DATE_FORMAT(col, '%Y-%m-01')"
   */
  getDateTruncExpression(field: string, unit: DateTruncUnit): string;

  /**
   * Generate a date difference expression.
   * @example PostgreSQL: "EXTRACT(EPOCH FROM (end - start))"
   * @example MySQL: "TIMESTAMPDIFF(SECOND, start, end)"
   */
  getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string;

  /**
   * Get the string concatenation expression.
   * @example PostgreSQL: "a || b"
   * @example MySQL: "CONCAT(a, b)"
   */
  getConcatExpression(parts: string[]): string;

  /**
   * Get the parameter placeholder for the given index (0-based).
   * @example PostgreSQL: "$1", "$2"
   * @example MySQL: "?"
   */
  getParameterPlaceholder(index: number): string;

  /**
   * Format a qualified table reference (with optional schema).
   * @example PostgreSQL: "\"public\".\"users\""
   * @example MySQL: "`mydb`.`users`"
   */
  formatTableRef(table: string, schema?: string): string;

  /**
   * Get the current timestamp expression.
   * @example PostgreSQL: "NOW()"
   * @example MySQL: "NOW()"
   * @example SQLite: "datetime('now')"
   */
  getCurrentTimestamp(): string;

  /**
   * Get the COALESCE or IFNULL equivalent.
   */
  getCoalesceExpression(expressions: string[]): string;
}

/** Supported date truncation units */
export type DateTruncUnit =
  | 'year'
  | 'quarter'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

/** Supported date diff units */
export type DateDiffUnit =
  | 'year'
  | 'month'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

// ── Base Dialect ────────────────────────────────────────────────────

/**
 * Abstract base class providing default implementations for common
 * dialect methods. Concrete dialects override where behavior differs.
 */
export abstract class BaseSQLDialect implements SQLDialect {
  abstract readonly name: string;

  abstract quoteIdentifier(name: string): string;

  quoteString(value: string): string {
    // Standard SQL string escaping: double single quotes
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  formatLimit(limit: number, offset?: number): string {
    if (offset !== undefined && offset > 0) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }

  formatBoolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  abstract supportsReturning(): boolean;

  supportsWindowFunctions(): boolean {
    return true;
  }

  supportsCTE(): boolean {
    return true;
  }

  getCastExpression(expr: string, type: string): string {
    return `CAST(${expr} AS ${type})`;
  }

  abstract getDateTruncExpression(field: string, unit: DateTruncUnit): string;
  abstract getDateDiffExpression(startField: string, endField: string, unit: DateDiffUnit): string;

  getConcatExpression(parts: string[]): string {
    return parts.join(' || ');
  }

  abstract getParameterPlaceholder(index: number): string;

  formatTableRef(table: string, schema?: string): string {
    if (schema) {
      return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
    }
    return this.quoteIdentifier(table);
  }

  getCurrentTimestamp(): string {
    return 'NOW()';
  }

  getCoalesceExpression(expressions: string[]): string {
    return `COALESCE(${expressions.join(', ')})`;
  }
}
