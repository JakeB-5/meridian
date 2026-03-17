// ── Query Builder ───────────────────────────────────────────────────
// Fluent API for constructing AbstractQuery objects.

import type { AggregationType, SortDirection, FilterOperator } from '@meridian/shared';
import type {
  AbstractQuery,
  QuerySource,
  Selection,
  Filter,
  GroupByClause,
  OrderByClause,
  JoinClause,
  JoinCondition,
  JoinType,
} from './abstract-query.js';

/**
 * Fluent builder for constructing AbstractQuery objects.
 *
 * Usage:
 * ```ts
 * const query = new QueryBuilder()
 *   .from('users', 'public')
 *   .select('id', 'name', 'email')
 *   .where('active', 'eq', true)
 *   .orderBy('name', 'asc')
 *   .limit(100)
 *   .build();
 * ```
 */
export class QueryBuilder {
  private _source: QuerySource | null = null;
  private _selections: Selection[] = [];
  private _filters: Filter[] = [];
  private _groupByClauses: GroupByClause[] = [];
  private _orderByClauses: OrderByClause[] = [];
  private _limit?: number;
  private _offset?: number;
  private _joins: JoinClause[] = [];
  private _having: Filter[] = [];
  private _distinct = false;

  /**
   * Set the primary table source.
   */
  from(table: string, schema?: string, alias?: string): this {
    this._source = { kind: 'table', table, schema, alias };
    return this;
  }

  /**
   * Set a subquery as the source.
   */
  fromSubquery(query: AbstractQuery, alias: string): this {
    this._source = { kind: 'subquery', query, alias };
    return this;
  }

  /**
   * Add column selections. Each argument is a column name.
   * For aliased columns, use selectAs().
   */
  select(...columns: string[]): this {
    for (const column of columns) {
      this._selections.push({ kind: 'column', column });
    }
    return this;
  }

  /**
   * Add a column selection with an explicit alias.
   */
  selectAs(column: string, alias: string, table?: string): this {
    this._selections.push({ kind: 'column', column, alias, table });
    return this;
  }

  /**
   * Select all columns (wildcard).
   */
  selectAll(table?: string): this {
    this._selections.push({ kind: 'wildcard', table });
    return this;
  }

  /**
   * Add a raw SQL expression as a selection.
   */
  selectRaw(expression: string, alias?: string): this {
    this._selections.push({ kind: 'raw', expression, alias });
    return this;
  }

  /**
   * Add an aggregation selection.
   */
  aggregate(fn: AggregationType, column: string, alias?: string, table?: string): this {
    this._selections.push({ kind: 'aggregate', fn, column, alias, table });
    return this;
  }

  /**
   * Enable SELECT DISTINCT.
   */
  distinct(enabled = true): this {
    this._distinct = enabled;
    return this;
  }

  /**
   * Add a comparison filter (WHERE clause).
   */
  where(column: string, operator: FilterOperator, value?: unknown): this {
    this._filters.push({
      kind: 'comparison',
      column,
      operator,
      value,
    });
    return this;
  }

  /**
   * Add a comparison filter scoped to a specific table.
   */
  whereTable(table: string, column: string, operator: FilterOperator, value?: unknown): this {
    this._filters.push({
      kind: 'comparison',
      column,
      table,
      operator,
      value,
    });
    return this;
  }

  /**
   * Add multiple filters combined with AND.
   */
  whereAnd(...filters: Filter[]): this {
    if (filters.length === 1) {
      this._filters.push(filters[0]);
    } else if (filters.length > 1) {
      this._filters.push({ kind: 'logical', operator: 'and', conditions: filters });
    }
    return this;
  }

  /**
   * Add multiple filters combined with OR.
   */
  whereOr(...filters: Filter[]): this {
    if (filters.length === 1) {
      this._filters.push(filters[0]);
    } else if (filters.length > 1) {
      this._filters.push({ kind: 'logical', operator: 'or', conditions: filters });
    }
    return this;
  }

  /**
   * Add a NOT filter.
   */
  whereNot(filter: Filter): this {
    this._filters.push({ kind: 'not', condition: filter });
    return this;
  }

  /**
   * Add a raw SQL condition to WHERE.
   */
  whereRaw(expression: string, params?: unknown[]): this {
    this._filters.push({ kind: 'raw', expression, params });
    return this;
  }

  /**
   * Add GROUP BY columns.
   */
  groupBy(...columns: string[]): this {
    for (const column of columns) {
      this._groupByClauses.push({ kind: 'column', column });
    }
    return this;
  }

  /**
   * Add GROUP BY with table scope.
   */
  groupByTable(table: string, ...columns: string[]): this {
    for (const column of columns) {
      this._groupByClauses.push({ kind: 'column', column, table });
    }
    return this;
  }

  /**
   * Add a raw expression to GROUP BY.
   */
  groupByRaw(expression: string): this {
    this._groupByClauses.push({ kind: 'raw', expression });
    return this;
  }

  /**
   * Add an ORDER BY clause.
   */
  orderBy(column: string, direction: SortDirection = 'asc', nulls?: 'first' | 'last'): this {
    this._orderByClauses.push({ kind: 'column', column, direction, nulls });
    return this;
  }

  /**
   * Add an ORDER BY clause scoped to a specific table.
   */
  orderByTable(
    table: string,
    column: string,
    direction: SortDirection = 'asc',
    nulls?: 'first' | 'last',
  ): this {
    this._orderByClauses.push({ kind: 'column', column, table, direction, nulls });
    return this;
  }

  /**
   * Add a raw ORDER BY expression.
   */
  orderByRaw(expression: string, direction: SortDirection = 'asc'): this {
    this._orderByClauses.push({ kind: 'raw', expression, direction });
    return this;
  }

  /**
   * Set the LIMIT.
   */
  limit(n: number): this {
    if (n < 0) {
      throw new Error('LIMIT must be non-negative');
    }
    this._limit = n;
    return this;
  }

  /**
   * Set the OFFSET.
   */
  offset(n: number): this {
    if (n < 0) {
      throw new Error('OFFSET must be non-negative');
    }
    this._offset = n;
    return this;
  }

  /**
   * Add a JOIN clause.
   */
  join(type: JoinType, table: string, conditions: JoinCondition | JoinCondition[], options?: {
    schema?: string;
    alias?: string;
  }): this {
    const conditionArray = Array.isArray(conditions) ? conditions : [conditions];
    this._joins.push({
      type,
      table,
      schema: options?.schema,
      alias: options?.alias,
      conditions: conditionArray,
    });
    return this;
  }

  /**
   * Shorthand for INNER JOIN.
   */
  innerJoin(table: string, leftColumn: string, rightColumn: string, alias?: string): this {
    return this.join('inner', table, { leftColumn, rightColumn }, { alias });
  }

  /**
   * Shorthand for LEFT JOIN.
   */
  leftJoin(table: string, leftColumn: string, rightColumn: string, alias?: string): this {
    return this.join('left', table, { leftColumn, rightColumn }, { alias });
  }

  /**
   * Shorthand for RIGHT JOIN.
   */
  rightJoin(table: string, leftColumn: string, rightColumn: string, alias?: string): this {
    return this.join('right', table, { leftColumn, rightColumn }, { alias });
  }

  /**
   * Shorthand for FULL OUTER JOIN.
   */
  fullJoin(table: string, leftColumn: string, rightColumn: string, alias?: string): this {
    return this.join('full', table, { leftColumn, rightColumn }, { alias });
  }

  /**
   * Shorthand for CROSS JOIN (no conditions).
   */
  crossJoin(table: string, alias?: string): this {
    this._joins.push({
      type: 'cross',
      table,
      alias,
      conditions: [],
    });
    return this;
  }

  /**
   * Add a HAVING filter (post-aggregation).
   */
  having(column: string, operator: FilterOperator, value?: unknown): this {
    this._having.push({
      kind: 'comparison',
      column,
      operator,
      value,
    });
    return this;
  }

  /**
   * Add a raw HAVING condition.
   */
  havingRaw(expression: string, params?: unknown[]): this {
    this._having.push({ kind: 'raw', expression, params });
    return this;
  }

  /**
   * Build the final AbstractQuery.
   * Throws if no source has been set.
   */
  build(): AbstractQuery {
    if (!this._source) {
      throw new Error('QueryBuilder: source is required. Call from() or fromSubquery() first.');
    }

    return {
      source: this._source,
      selections: this._selections,
      filters: this._filters,
      groupBy: this._groupByClauses,
      orderBy: this._orderByClauses,
      limit: this._limit,
      offset: this._offset,
      joins: this._joins,
      having: this._having,
      distinct: this._distinct || undefined,
    };
  }

  /**
   * Reset the builder to its initial state.
   */
  reset(): this {
    this._source = null;
    this._selections = [];
    this._filters = [];
    this._groupByClauses = [];
    this._orderByClauses = [];
    this._limit = undefined;
    this._offset = undefined;
    this._joins = [];
    this._having = [];
    this._distinct = false;
    return this;
  }

  /**
   * Create a deep clone of this builder.
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder();
    if (this._source) {
      // Source is readonly/immutable so shallow copy is fine
      cloned._source = this._source;
    }
    cloned._selections = [...this._selections];
    cloned._filters = [...this._filters];
    cloned._groupByClauses = [...this._groupByClauses];
    cloned._orderByClauses = [...this._orderByClauses];
    cloned._limit = this._limit;
    cloned._offset = this._offset;
    cloned._joins = [...this._joins];
    cloned._having = [...this._having];
    cloned._distinct = this._distinct;
    return cloned;
  }
}

// ── Helper functions for creating filters programmatically ──────────

/**
 * Create a comparison filter node.
 */
export function comparison(
  column: string,
  operator: FilterOperator,
  value?: unknown,
  table?: string,
): Filter {
  return { kind: 'comparison', column, operator, value, table };
}

/**
 * Create an AND logical filter.
 */
export function and(...conditions: Filter[]): Filter {
  if (conditions.length === 0) {
    throw new Error('and() requires at least one condition');
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { kind: 'logical', operator: 'and', conditions };
}

/**
 * Create an OR logical filter.
 */
export function or(...conditions: Filter[]): Filter {
  if (conditions.length === 0) {
    throw new Error('or() requires at least one condition');
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { kind: 'logical', operator: 'or', conditions };
}

/**
 * Create a NOT filter.
 */
export function not(condition: Filter): Filter {
  return { kind: 'not', condition };
}
