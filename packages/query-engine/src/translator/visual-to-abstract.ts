// ── Visual Query to Abstract Query Translator ───────────────────────
// Converts the UI-facing VisualQuery model into the IR AbstractQuery
// representation that can be fed to the SQL generator.

import type {
  VisualQuery,
  FilterClause,
  SortClause,
  AggregationClause,
} from '@meridian/shared';

import type {
  AbstractQuery,
  Selection,
  Filter,
  GroupByClause,
  OrderByClause,
} from '../ir/abstract-query.js';

// ── Translation Options ─────────────────────────────────────────────

export interface TranslationOptions {
  /** Default schema to use for the table source */
  defaultSchema?: string;
  /** Maximum rows to enforce regardless of VisualQuery.limit */
  maxRows?: number;
  /** Whether to add a default ORDER BY when none is specified */
  defaultOrderBy?: string;
  /** Default sort direction for the default ORDER BY */
  defaultOrderDirection?: 'asc' | 'desc';
}

// ── Translation Result ──────────────────────────────────────────────

export interface TranslationResult {
  /** The translated abstract query */
  query: AbstractQuery;
  /** Any warnings generated during translation */
  warnings: TranslationWarning[];
}

export interface TranslationWarning {
  code: string;
  message: string;
}

// ── Main Translator ─────────────────────────────────────────────────

/**
 * Translate a VisualQuery into an AbstractQuery.
 *
 * The translation handles:
 * - Column selections (with optional aggregations)
 * - Filter clauses to comparison filters
 * - Sort clauses to order by clauses
 * - Aggregation + group by generation
 * - Limit/offset passthrough with max row enforcement
 */
export function translateVisualToAbstract(
  visual: VisualQuery,
  options: TranslationOptions = {},
): TranslationResult {
  const warnings: TranslationWarning[] = [];

  // Determine if this is an aggregation query
  const hasAggregations = visual.aggregations.length > 0;

  // Build selections
  const selections = buildSelections(visual, hasAggregations, warnings);

  // Build filters
  const filters = buildFilters(visual.filters, warnings);

  // Build ORDER BY
  const orderBy = buildOrderBy(visual.sorts, options);

  // Build GROUP BY (only if aggregations exist)
  const groupBy = hasAggregations ? buildGroupBy(visual) : [];

  // Compute limit
  const limit = computeLimit(visual.limit, options.maxRows);

  const query: AbstractQuery = {
    source: {
      kind: 'table',
      table: visual.table,
      schema: options.defaultSchema,
    },
    selections,
    filters,
    groupBy,
    orderBy,
    limit,
    offset: visual.offset,
    joins: [],
    having: [],
  };

  return { query, warnings };
}

// ── Selection Building ──────────────────────────────────────────────

function buildSelections(
  visual: VisualQuery,
  hasAggregations: boolean,
  warnings: TranslationWarning[],
): Selection[] {
  const selections: Selection[] = [];

  if (hasAggregations) {
    // In aggregation mode: group-by columns + aggregated columns
    // First add non-aggregated columns (these become part of GROUP BY too)
    for (const col of visual.groupBy) {
      selections.push({ kind: 'column', column: col });
    }

    // Then add aggregated columns
    for (const agg of visual.aggregations) {
      selections.push(translateAggregation(agg));
    }

    // Warn if columns are listed but not in groupBy and not aggregated
    const groupBySet = new Set(visual.groupBy);
    const aggregatedCols = new Set(visual.aggregations.map((a) => a.column));
    for (const col of visual.columns) {
      if (!groupBySet.has(col) && !aggregatedCols.has(col)) {
        warnings.push({
          code: 'COLUMN_NOT_IN_GROUP_BY',
          message: `Column "${col}" is selected but not in GROUP BY or aggregated. It will be excluded from the result.`,
        });
      }
    }
  } else {
    // Simple select mode
    if (visual.columns.length === 0) {
      // No columns specified => SELECT *
      selections.push({ kind: 'wildcard' });
    } else {
      for (const col of visual.columns) {
        selections.push({ kind: 'column', column: col });
      }
    }
  }

  return selections;
}

function translateAggregation(agg: AggregationClause): Selection {
  const alias = agg.alias ?? `${agg.aggregation}_${agg.column}`;
  return {
    kind: 'aggregate',
    fn: agg.aggregation,
    column: agg.column,
    alias,
  };
}

// ── Filter Building ─────────────────────────────────────────────────

function buildFilters(
  clauses: FilterClause[],
  _warnings: TranslationWarning[],
): Filter[] {
  return clauses.map(translateFilterClause);
}

function translateFilterClause(clause: FilterClause): Filter {
  return {
    kind: 'comparison',
    column: clause.column,
    operator: clause.operator,
    value: clause.value,
  };
}

// ── ORDER BY Building ───────────────────────────────────────────────

function buildOrderBy(
  sorts: SortClause[],
  options: TranslationOptions,
): OrderByClause[] {
  const orderBy: OrderByClause[] = sorts.map(translateSortClause);

  // Add default ORDER BY if none specified and option is set
  if (orderBy.length === 0 && options.defaultOrderBy) {
    orderBy.push({
      kind: 'column',
      column: options.defaultOrderBy,
      direction: options.defaultOrderDirection ?? 'asc',
    });
  }

  return orderBy;
}

function translateSortClause(sort: SortClause): OrderByClause {
  return {
    kind: 'column',
    column: sort.column,
    direction: sort.direction,
  };
}

// ── GROUP BY Building ───────────────────────────────────────────────

function buildGroupBy(visual: VisualQuery): GroupByClause[] {
  // If groupBy is explicitly set, use that
  if (visual.groupBy.length > 0) {
    return visual.groupBy.map((col): GroupByClause => ({
      kind: 'column',
      column: col,
    }));
  }

  // If aggregations exist but no groupBy, there's nothing to group by
  // (e.g., SELECT COUNT(*) FROM table)
  return [];
}

// ── Limit Computation ───────────────────────────────────────────────

function computeLimit(
  queryLimit: number | undefined,
  maxRows: number | undefined,
): number | undefined {
  if (queryLimit !== undefined && maxRows !== undefined) {
    return Math.min(queryLimit, maxRows);
  }
  return queryLimit ?? maxRows;
}

// ── Batch translation ───────────────────────────────────────────────

/**
 * Translate multiple visual queries at once.
 * Useful for dashboard rendering where many queries execute simultaneously.
 */
export function translateBatch(
  queries: VisualQuery[],
  options: TranslationOptions = {},
): TranslationResult[] {
  return queries.map((q) => translateVisualToAbstract(q, options));
}
