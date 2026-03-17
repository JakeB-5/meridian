/** Column metadata from a query result */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

/** Result set from executing a query */
export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

/** Supported aggregation functions */
export type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Filter comparison operators */
export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'like' | 'not_like'
  | 'is_null' | 'is_not_null'
  | 'between';

/** A single filter condition */
export interface FilterClause {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

/** A single sort directive */
export interface SortClause {
  column: string;
  direction: SortDirection;
}

/** A single aggregation directive */
export interface AggregationClause {
  column: string;
  aggregation: AggregationType;
  alias?: string;
}

/** Visual query builder representation - no raw SQL */
export interface VisualQuery {
  dataSourceId: string;
  table: string;
  columns: string[];
  filters: FilterClause[];
  sorts: SortClause[];
  aggregations: AggregationClause[];
  groupBy: string[];
  limit?: number;
  offset?: number;
}
