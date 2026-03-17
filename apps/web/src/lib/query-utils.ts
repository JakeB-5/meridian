// ── Query utility functions ──────────────────────────────────────────
// Helpers for building, validating, and transforming visual queries.

import type {
  VisualQuery,
  FilterClause,
  SortClause,
  AggregationClause,
  FilterOperator,
} from '@meridian/shared';

/**
 * Check if a visual query is valid (has minimum required fields).
 */
export function isValidVisualQuery(query: VisualQuery): boolean {
  if (!query.dataSourceId) return false;
  if (!query.table) return false;
  // A query with no columns, aggregations is valid (SELECT *)
  return true;
}

/**
 * Validate a filter clause has all required fields.
 */
export function isValidFilter(filter: FilterClause): boolean {
  if (!filter.column) return false;
  if (!filter.operator) return false;

  // These operators don't need a value
  const noValueOperators: FilterOperator[] = ['is_null', 'is_not_null'];
  if (noValueOperators.includes(filter.operator)) return true;

  // All other operators need a non-empty value
  if (filter.value === null || filter.value === undefined || filter.value === '') {
    return false;
  }
  return true;
}

/**
 * Clean a visual query by removing invalid filters, sorts, etc.
 */
export function cleanVisualQuery(query: VisualQuery): VisualQuery {
  return {
    ...query,
    filters: query.filters.filter(isValidFilter),
    sorts: query.sorts.filter((s) => !!s.column),
    aggregations: query.aggregations.filter((a) => !!a.column && !!a.aggregation),
    groupBy: query.groupBy.filter((g) => !!g),
    columns: query.columns.filter((c) => !!c),
  };
}

/**
 * Create an empty visual query for a given data source.
 */
export function createEmptyVisualQuery(dataSourceId: string): VisualQuery {
  return {
    dataSourceId,
    table: '',
    columns: [],
    filters: [],
    sorts: [],
    aggregations: [],
    groupBy: [],
    limit: 1000,
  };
}

/**
 * Generate a human-readable summary of a visual query.
 */
export function describeVisualQuery(query: VisualQuery): string {
  const parts: string[] = [];

  // SELECT
  if (query.aggregations.length > 0) {
    const aggParts = query.aggregations.map((a) => {
      const alias = a.alias ? ` as ${a.alias}` : '';
      return `${a.aggregation}(${a.column})${alias}`;
    });
    parts.push(`SELECT ${aggParts.join(', ')}`);
  } else if (query.columns.length > 0) {
    parts.push(`SELECT ${query.columns.join(', ')}`);
  } else {
    parts.push('SELECT *');
  }

  // FROM
  parts.push(`FROM ${query.table || '?'}`);

  // WHERE
  if (query.filters.length > 0) {
    const filterParts = query.filters
      .filter(isValidFilter)
      .map(describeFilter);
    if (filterParts.length > 0) {
      parts.push(`WHERE ${filterParts.join(' AND ')}`);
    }
  }

  // GROUP BY
  if (query.groupBy.length > 0) {
    parts.push(`GROUP BY ${query.groupBy.join(', ')}`);
  }

  // ORDER BY
  if (query.sorts.length > 0) {
    const sortParts = query.sorts.map((s) => `${s.column} ${s.direction.toUpperCase()}`);
    parts.push(`ORDER BY ${sortParts.join(', ')}`);
  }

  // LIMIT
  if (query.limit) {
    parts.push(`LIMIT ${query.limit}`);
  }

  return parts.join(' ');
}

/**
 * Describe a single filter in human-readable form.
 */
function describeFilter(filter: FilterClause): string {
  const operatorLabels: Record<string, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    in: 'IN',
    not_in: 'NOT IN',
    like: 'LIKE',
    not_like: 'NOT LIKE',
    is_null: 'IS NULL',
    is_not_null: 'IS NOT NULL',
    between: 'BETWEEN',
  };

  const op = operatorLabels[filter.operator] ?? filter.operator;

  if (filter.operator === 'is_null' || filter.operator === 'is_not_null') {
    return `${filter.column} ${op}`;
  }

  return `${filter.column} ${op} ${JSON.stringify(filter.value)}`;
}

/**
 * Determine the suggested chart type based on query structure.
 */
export function suggestChartType(query: VisualQuery): string {
  const hasAggregations = query.aggregations.length > 0;
  const hasGroupBy = query.groupBy.length > 0;
  const groupByCount = query.groupBy.length;

  // Single aggregation without group by -> number card
  if (hasAggregations && !hasGroupBy) {
    return 'number';
  }

  // One group by dimension with aggregation -> bar or pie
  if (hasAggregations && groupByCount === 1) {
    // If the group by is likely a date/time column, suggest line
    const groupCol = query.groupBy[0].toLowerCase();
    if (
      groupCol.includes('date') ||
      groupCol.includes('time') ||
      groupCol.includes('month') ||
      groupCol.includes('year') ||
      groupCol.includes('week') ||
      groupCol.includes('day')
    ) {
      return 'line';
    }
    return 'bar';
  }

  // Two group by dimensions -> stacked bar or heatmap
  if (hasAggregations && groupByCount === 2) {
    return 'bar'; // stacked
  }

  // No aggregations -> table
  return 'table';
}

/**
 * Parse a raw SQL string into a basic structure for validation.
 */
export function parseSqlBasicInfo(sql: string): {
  type: 'select' | 'insert' | 'update' | 'delete' | 'other';
  hasLimit: boolean;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
} {
  const trimmed = sql.trim().toUpperCase();

  let type: 'select' | 'insert' | 'update' | 'delete' | 'other' = 'other';
  if (trimmed.startsWith('SELECT')) type = 'select';
  else if (trimmed.startsWith('INSERT')) type = 'insert';
  else if (trimmed.startsWith('UPDATE')) type = 'update';
  else if (trimmed.startsWith('DELETE')) type = 'delete';

  const hasLimit = /\bLIMIT\b/i.test(sql);

  // Complexity heuristic
  const joinCount = (sql.match(/\bJOIN\b/gi) ?? []).length;
  const subqueryCount = (sql.match(/\(\s*SELECT\b/gi) ?? []).length;
  const windowCount = (sql.match(/\bOVER\s*\(/gi) ?? []).length;
  const cteCount = (sql.match(/\bWITH\b/gi) ?? []).length;

  let estimatedComplexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (joinCount >= 3 || subqueryCount >= 2 || windowCount >= 1 || cteCount >= 1) {
    estimatedComplexity = 'complex';
  } else if (joinCount >= 1 || subqueryCount >= 1) {
    estimatedComplexity = 'moderate';
  }

  return { type, hasLimit, estimatedComplexity };
}

/**
 * Ensure a SQL query has a LIMIT clause to prevent runaway queries.
 */
export function ensureSqlLimit(sql: string, maxLimit = 10000): string {
  const trimmed = sql.trim();
  if (/\bLIMIT\b/i.test(trimmed)) return trimmed;

  // Only add LIMIT to SELECT queries
  if (!trimmed.toUpperCase().startsWith('SELECT')) return trimmed;

  // Remove trailing semicolon if present, add LIMIT, then re-add
  const withoutSemicolon = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  return `${withoutSemicolon}\nLIMIT ${maxLimit}`;
}

/**
 * Calculate the column types from query result for visualization hints.
 */
export function categorizeColumns(
  columns: Array<{ name: string; type: string }>,
): {
  numeric: string[];
  temporal: string[];
  categorical: string[];
} {
  const numeric: string[] = [];
  const temporal: string[] = [];
  const categorical: string[] = [];

  const numericTypes = new Set([
    'integer', 'int', 'int4', 'int8', 'bigint', 'smallint',
    'float', 'float4', 'float8', 'double', 'decimal', 'numeric',
    'real', 'money', 'number',
  ]);

  const temporalTypes = new Set([
    'date', 'time', 'timestamp', 'timestamptz', 'datetime',
    'interval', 'timestamp with time zone', 'timestamp without time zone',
  ]);

  for (const col of columns) {
    const typeLower = col.type.toLowerCase();
    if (numericTypes.has(typeLower)) {
      numeric.push(col.name);
    } else if (temporalTypes.has(typeLower)) {
      temporal.push(col.name);
    } else {
      categorical.push(col.name);
    }
  }

  return { numeric, temporal, categorical };
}
