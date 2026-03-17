// ── Abstract Query IR ───────────────────────────────────────────────
// Intermediate representation for queries. The query pipeline converts
// VisualQuery -> AbstractQuery -> SQL string.

import type { AggregationType, SortDirection, FilterOperator } from '@meridian/shared';

// ── Source Types ────────────────────────────────────────────────────

/** A concrete table source */
export interface TableSource {
  readonly kind: 'table';
  /** Table name */
  readonly table: string;
  /** Schema name (e.g. "public") */
  readonly schema?: string;
  /** Optional alias for the table in the query */
  readonly alias?: string;
}

/** A subquery used as a source */
export interface SubquerySource {
  readonly kind: 'subquery';
  /** The subquery as an AbstractQuery */
  readonly query: AbstractQuery;
  /** Required alias for the subquery */
  readonly alias: string;
}

export type QuerySource = TableSource | SubquerySource;

// ── Selection Types ─────────────────────────────────────────────────

/** A plain column reference */
export interface ColumnSelection {
  readonly kind: 'column';
  /** Column name */
  readonly column: string;
  /** Table alias or name (for disambiguation in JOINs) */
  readonly table?: string;
  /** Output alias */
  readonly alias?: string;
}

/** An aggregation expression */
export interface AggregateSelection {
  readonly kind: 'aggregate';
  /** Aggregation function */
  readonly fn: AggregationType;
  /** Column to aggregate (use '*' for count(*)) */
  readonly column: string;
  /** Table alias or name */
  readonly table?: string;
  /** Output alias */
  readonly alias?: string;
}

/** A raw SQL expression (escape hatch) */
export interface RawSelection {
  readonly kind: 'raw';
  /** Raw SQL expression */
  readonly expression: string;
  /** Output alias */
  readonly alias?: string;
}

/** A wildcard selection (SELECT *) */
export interface WildcardSelection {
  readonly kind: 'wildcard';
  /** Table alias for table.* */
  readonly table?: string;
}

export type Selection = ColumnSelection | AggregateSelection | RawSelection | WildcardSelection;

// ── Filter Types ────────────────────────────────────────────────────

/** A single comparison filter */
export interface ComparisonFilter {
  readonly kind: 'comparison';
  /** Column to filter on */
  readonly column: string;
  /** Table alias or name */
  readonly table?: string;
  /** Comparison operator */
  readonly operator: FilterOperator;
  /** Value(s) to compare against. undefined for is_null/is_not_null */
  readonly value: unknown;
}

/** A logical combination of filters (AND / OR) */
export interface LogicalFilter {
  readonly kind: 'logical';
  /** Logical operator */
  readonly operator: 'and' | 'or';
  /** Child filters */
  readonly conditions: Filter[];
}

/** A NOT wrapper for a filter */
export interface NotFilter {
  readonly kind: 'not';
  /** The filter to negate */
  readonly condition: Filter;
}

/** A raw SQL expression used as a filter */
export interface RawFilter {
  readonly kind: 'raw';
  /** Raw SQL condition */
  readonly expression: string;
  /** Parameter values for the raw expression */
  readonly params?: unknown[];
}

export type Filter = ComparisonFilter | LogicalFilter | NotFilter | RawFilter;

// ── Group By ────────────────────────────────────────────────────────

/** A column reference for GROUP BY */
export interface ColumnGroupBy {
  readonly kind: 'column';
  readonly column: string;
  readonly table?: string;
}

/** A raw expression for GROUP BY */
export interface RawGroupBy {
  readonly kind: 'raw';
  readonly expression: string;
}

export type GroupByClause = ColumnGroupBy | RawGroupBy;

// ── Order By ────────────────────────────────────────────────────────

/** A column reference for ORDER BY */
export interface ColumnOrderBy {
  readonly kind: 'column';
  readonly column: string;
  readonly table?: string;
  readonly direction: SortDirection;
  /** NULLS FIRST / NULLS LAST */
  readonly nulls?: 'first' | 'last';
}

/** A raw expression for ORDER BY */
export interface RawOrderBy {
  readonly kind: 'raw';
  readonly expression: string;
  readonly direction: SortDirection;
}

export type OrderByClause = ColumnOrderBy | RawOrderBy;

// ── Join Types ──────────────────────────────────────────────────────

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'cross';

/** A condition for a JOIN ON clause */
export interface JoinCondition {
  /** Left-side column (from the source table) */
  readonly leftColumn: string;
  /** Left-side table alias */
  readonly leftTable?: string;
  /** Right-side column (from the joined table) */
  readonly rightColumn: string;
  /** Right-side table alias */
  readonly rightTable?: string;
  /** Comparison operator (defaults to eq) */
  readonly operator?: FilterOperator;
}

/** A single JOIN clause */
export interface JoinClause {
  /** Type of join */
  readonly type: JoinType;
  /** The table to join */
  readonly table: string;
  /** Schema of the joined table */
  readonly schema?: string;
  /** Alias for the joined table */
  readonly alias?: string;
  /** Join conditions (combined with AND) */
  readonly conditions: JoinCondition[];
}

// ── Abstract Query ──────────────────────────────────────────────────

/**
 * The core intermediate representation for a database query.
 * Generated from a VisualQuery and consumed by the SQL generator.
 */
export interface AbstractQuery {
  /** The primary table or subquery source */
  readonly source: QuerySource;
  /** Columns and expressions to select */
  readonly selections: Selection[];
  /** WHERE conditions */
  readonly filters: Filter[];
  /** GROUP BY clauses */
  readonly groupBy: GroupByClause[];
  /** ORDER BY clauses */
  readonly orderBy: OrderByClause[];
  /** Maximum rows to return */
  readonly limit?: number;
  /** Number of rows to skip */
  readonly offset?: number;
  /** JOIN clauses */
  readonly joins: JoinClause[];
  /** HAVING conditions (post-aggregation filters) */
  readonly having: Filter[];
  /** Whether to select DISTINCT */
  readonly distinct?: boolean;
}

/**
 * Create an empty AbstractQuery with default values.
 * Useful as a starting point for building queries programmatically.
 */
export function createEmptyQuery(table: string, schema?: string): AbstractQuery {
  return {
    source: { kind: 'table', table, schema },
    selections: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    joins: [],
    having: [],
  };
}
