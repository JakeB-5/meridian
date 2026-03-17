// ── SQL Generator ───────────────────────────────────────────────────
// Generates parameterized SQL strings from AbstractQuery + SQLDialect.
// This is the core of the query pipeline.

import type { AggregationType, FilterOperator } from '@meridian/shared';
import type {
  AbstractQuery,
  Selection,
  ColumnSelection,
  AggregateSelection,
  RawSelection,
  WildcardSelection,
  Filter,
  ComparisonFilter,
  LogicalFilter,
  NotFilter,
  RawFilter,
  GroupByClause,
  OrderByClause,
  JoinClause,
  JoinCondition,
  QuerySource,
} from '../ir/abstract-query.js';
import type { SQLDialect } from '../dialects/sql-dialect.js';

// ── Output Types ────────────────────────────────────────────────────

/** The result of SQL generation */
export interface GeneratedSQL {
  /** The SQL string (with parameter placeholders) */
  readonly sql: string;
  /** Parameter values in order of their placeholders */
  readonly params: unknown[];
  /** Whether the query uses parameterized values */
  readonly parameterized: boolean;
}

// ── Generator Options ───────────────────────────────────────────────

export interface SQLGeneratorOptions {
  /** Whether to pretty-print the SQL with newlines and indentation */
  prettyPrint?: boolean;
  /** Indentation string for pretty printing */
  indent?: string;
  /** Whether to uppercase SQL keywords */
  uppercaseKeywords?: boolean;
}

const DEFAULT_OPTIONS: Required<SQLGeneratorOptions> = {
  prettyPrint: false,
  indent: '  ',
  uppercaseKeywords: true,
};

// ── SQL Generator ───────────────────────────────────────────────────

/**
 * Generates parameterized SQL from an AbstractQuery using a given SQLDialect.
 *
 * The generator handles:
 * - SELECT clause (columns, aggregations, expressions, wildcards)
 * - FROM clause (table with optional schema, subqueries)
 * - JOIN clauses (INNER, LEFT, RIGHT, FULL, CROSS)
 * - WHERE clause (comparison, logical, NOT, raw; all parameterized)
 * - GROUP BY clause
 * - HAVING clause
 * - ORDER BY clause
 * - LIMIT / OFFSET
 * - DISTINCT
 */
export class SQLGenerator {
  private readonly dialect: SQLDialect;
  private readonly options: Required<SQLGeneratorOptions>;

  constructor(dialect: SQLDialect, options: SQLGeneratorOptions = {}) {
    this.dialect = dialect;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate SQL from an AbstractQuery.
   */
  generate(query: AbstractQuery): GeneratedSQL {
    const ctx = new GenerationContext(this.dialect, this.options);

    const parts: string[] = [];

    // SELECT
    parts.push(ctx.generateSelect(query));

    // FROM
    parts.push(ctx.generateFrom(query.source));

    // JOIN
    if (query.joins.length > 0) {
      for (const join of query.joins) {
        parts.push(ctx.generateJoin(join));
      }
    }

    // WHERE
    if (query.filters.length > 0) {
      parts.push(ctx.generateWhere(query.filters));
    }

    // GROUP BY
    if (query.groupBy.length > 0) {
      parts.push(ctx.generateGroupBy(query.groupBy));
    }

    // HAVING
    if (query.having.length > 0) {
      parts.push(ctx.generateHaving(query.having));
    }

    // ORDER BY
    if (query.orderBy.length > 0) {
      parts.push(ctx.generateOrderBy(query.orderBy));
    }

    // LIMIT / OFFSET
    if (query.limit !== undefined) {
      parts.push(this.dialect.formatLimit(query.limit, query.offset));
    }

    const separator = this.options.prettyPrint ? '\n' : ' ';
    const sql = parts.join(separator);

    return {
      sql,
      params: ctx.getParams(),
      parameterized: ctx.getParams().length > 0,
    };
  }

  /**
   * Generate a COUNT(*) wrapper around the given query for pagination.
   */
  generateCount(query: AbstractQuery): GeneratedSQL {
    // Build inner query without ORDER BY and LIMIT for efficiency
    const innerQuery: AbstractQuery = {
      ...query,
      orderBy: [],
      limit: undefined,
      offset: undefined,
    };

    const inner = this.generate(innerQuery);
    const sql = `SELECT COUNT(*) AS ${this.dialect.quoteIdentifier('total_count')} FROM (${inner.sql}) AS ${this.dialect.quoteIdentifier('_count_subquery')}`;

    return {
      sql,
      params: inner.params,
      parameterized: inner.parameterized,
    };
  }

  /**
   * Get the dialect used by this generator.
   */
  getDialect(): SQLDialect {
    return this.dialect;
  }
}

// ── Generation Context ──────────────────────────────────────────────
// Internal class that tracks parameter state during generation.

class GenerationContext {
  private readonly dialect: SQLDialect;
  private readonly options: Required<SQLGeneratorOptions>;
  private params: unknown[] = [];

  constructor(dialect: SQLDialect, options: Required<SQLGeneratorOptions>) {
    this.dialect = dialect;
    this.options = options;
  }

  getParams(): unknown[] {
    return this.params;
  }

  // ── Keyword formatting ────────────────────────────────────────

  private kw(keyword: string): string {
    return this.options.uppercaseKeywords ? keyword.toUpperCase() : keyword.toLowerCase();
  }

  // ── SELECT ────────────────────────────────────────────────────

  generateSelect(query: AbstractQuery): string {
    const distinct = query.distinct ? ` ${this.kw('distinct')}` : '';

    if (query.selections.length === 0) {
      return `${this.kw('select')}${distinct} *`;
    }

    const columns = query.selections.map((s) => this.renderSelection(s));
    return `${this.kw('select')}${distinct} ${columns.join(', ')}`;
  }

  private renderSelection(sel: Selection): string {
    switch (sel.kind) {
      case 'column':
        return this.renderColumnSelection(sel);
      case 'aggregate':
        return this.renderAggregateSelection(sel);
      case 'raw':
        return this.renderRawSelection(sel);
      case 'wildcard':
        return this.renderWildcardSelection(sel);
    }
  }

  private renderColumnSelection(sel: ColumnSelection): string {
    let expr: string;
    if (sel.table) {
      expr = `${this.dialect.quoteIdentifier(sel.table)}.${this.dialect.quoteIdentifier(sel.column)}`;
    } else {
      expr = this.dialect.quoteIdentifier(sel.column);
    }

    if (sel.alias) {
      return `${expr} ${this.kw('as')} ${this.dialect.quoteIdentifier(sel.alias)}`;
    }
    return expr;
  }

  private renderAggregateSelection(sel: AggregateSelection): string {
    const innerExpr = this.renderAggregateInner(sel);
    const fnStr = this.renderAggregateFunction(sel.fn, innerExpr);

    if (sel.alias) {
      return `${fnStr} ${this.kw('as')} ${this.dialect.quoteIdentifier(sel.alias)}`;
    }
    return fnStr;
  }

  private renderAggregateInner(sel: AggregateSelection): string {
    if (sel.column === '*') {
      return '*';
    }
    if (sel.table) {
      return `${this.dialect.quoteIdentifier(sel.table)}.${this.dialect.quoteIdentifier(sel.column)}`;
    }
    return this.dialect.quoteIdentifier(sel.column);
  }

  private renderAggregateFunction(fn: AggregationType, inner: string): string {
    switch (fn) {
      case 'count':
        return `${this.kw('count')}(${inner})`;
      case 'count_distinct':
        return `${this.kw('count')}(${this.kw('distinct')} ${inner})`;
      case 'sum':
        return `${this.kw('sum')}(${inner})`;
      case 'avg':
        return `${this.kw('avg')}(${inner})`;
      case 'min':
        return `${this.kw('min')}(${inner})`;
      case 'max':
        return `${this.kw('max')}(${inner})`;
    }
  }

  private renderRawSelection(sel: RawSelection): string {
    if (sel.alias) {
      return `${sel.expression} ${this.kw('as')} ${this.dialect.quoteIdentifier(sel.alias)}`;
    }
    return sel.expression;
  }

  private renderWildcardSelection(sel: WildcardSelection): string {
    if (sel.table) {
      return `${this.dialect.quoteIdentifier(sel.table)}.*`;
    }
    return '*';
  }

  // ── FROM ──────────────────────────────────────────────────────

  generateFrom(source: QuerySource): string {
    switch (source.kind) {
      case 'table': {
        let ref = this.dialect.formatTableRef(source.table, source.schema);
        if (source.alias) {
          ref += ` ${this.kw('as')} ${this.dialect.quoteIdentifier(source.alias)}`;
        }
        return `${this.kw('from')} ${ref}`;
      }
      case 'subquery': {
        // Generate the subquery SQL
        const subGen = new SQLGenerator(this.dialect, this.options);
        const sub = subGen.generate(source.query);
        // Merge params
        this.params.push(...sub.params);
        return `${this.kw('from')} (${sub.sql}) ${this.kw('as')} ${this.dialect.quoteIdentifier(source.alias)}`;
      }
    }
  }

  // ── JOIN ──────────────────────────────────────────────────────

  generateJoin(join: JoinClause): string {
    const joinType = this.renderJoinType(join.type);
    let tableRef = this.dialect.formatTableRef(join.table, join.schema);
    if (join.alias) {
      tableRef += ` ${this.kw('as')} ${this.dialect.quoteIdentifier(join.alias)}`;
    }

    if (join.type === 'cross') {
      return `${joinType} ${tableRef}`;
    }

    const conditions = join.conditions.map((c) => this.renderJoinCondition(c, join)).join(` ${this.kw('and')} `);
    return `${joinType} ${tableRef} ${this.kw('on')} ${conditions}`;
  }

  private renderJoinType(type: JoinClause['type']): string {
    switch (type) {
      case 'inner': return this.kw('inner join');
      case 'left': return this.kw('left join');
      case 'right': return this.kw('right join');
      case 'full': return this.kw('full outer join');
      case 'cross': return this.kw('cross join');
    }
  }

  private renderJoinCondition(cond: JoinCondition, join: JoinClause): string {
    const leftCol = cond.leftTable
      ? `${this.dialect.quoteIdentifier(cond.leftTable)}.${this.dialect.quoteIdentifier(cond.leftColumn)}`
      : this.dialect.quoteIdentifier(cond.leftColumn);

    const rightTable = cond.rightTable ?? join.alias ?? join.table;
    const rightCol = `${this.dialect.quoteIdentifier(rightTable)}.${this.dialect.quoteIdentifier(cond.rightColumn)}`;

    const op = cond.operator ?? 'eq';
    return `${leftCol} ${this.filterOpToSQL(op)} ${rightCol}`;
  }

  // ── WHERE ─────────────────────────────────────────────────────

  generateWhere(filters: Filter[]): string {
    if (filters.length === 0) return '';

    // Multiple top-level filters are ANDed together
    const condition = filters.length === 1
      ? this.renderFilter(filters[0])
      : filters.map((f) => this.renderFilter(f)).join(` ${this.kw('and')} `);

    return `${this.kw('where')} ${condition}`;
  }

  private renderFilter(filter: Filter): string {
    switch (filter.kind) {
      case 'comparison':
        return this.renderComparisonFilter(filter);
      case 'logical':
        return this.renderLogicalFilter(filter);
      case 'not':
        return this.renderNotFilter(filter);
      case 'raw':
        return this.renderRawFilter(filter);
    }
  }

  private renderComparisonFilter(filter: ComparisonFilter): string {
    const col = filter.table
      ? `${this.dialect.quoteIdentifier(filter.table)}.${this.dialect.quoteIdentifier(filter.column)}`
      : this.dialect.quoteIdentifier(filter.column);

    return this.renderComparison(col, filter.operator, filter.value);
  }

  private renderComparison(column: string, operator: FilterOperator, value: unknown): string {
    switch (operator) {
      case 'eq':
        return `${column} = ${this.addParam(value)}`;
      case 'neq':
        return `${column} <> ${this.addParam(value)}`;
      case 'gt':
        return `${column} > ${this.addParam(value)}`;
      case 'gte':
        return `${column} >= ${this.addParam(value)}`;
      case 'lt':
        return `${column} < ${this.addParam(value)}`;
      case 'lte':
        return `${column} <= ${this.addParam(value)}`;
      case 'like':
        return `${column} ${this.kw('like')} ${this.addParam(value)}`;
      case 'not_like':
        return `${column} ${this.kw('not like')} ${this.addParam(value)}`;
      case 'in':
        return this.renderInClause(column, value, false);
      case 'not_in':
        return this.renderInClause(column, value, true);
      case 'is_null':
        return `${column} ${this.kw('is null')}`;
      case 'is_not_null':
        return `${column} ${this.kw('is not null')}`;
      case 'between':
        return this.renderBetween(column, value);
    }
  }

  private renderInClause(column: string, value: unknown, negate: boolean): string {
    const arr = Array.isArray(value) ? value : [value];
    if (arr.length === 0) {
      // Empty IN: always false; empty NOT IN: always true
      return negate ? '1 = 1' : '1 = 0';
    }
    const placeholders = arr.map((v) => this.addParam(v)).join(', ');
    const notStr = negate ? `${this.kw('not')} ` : '';
    return `${column} ${notStr}${this.kw('in')} (${placeholders})`;
  }

  private renderBetween(column: string, value: unknown): string {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error('BETWEEN filter requires a two-element array value');
    }
    const low = this.addParam(value[0]);
    const high = this.addParam(value[1]);
    return `${column} ${this.kw('between')} ${low} ${this.kw('and')} ${high}`;
  }

  private renderLogicalFilter(filter: LogicalFilter): string {
    if (filter.conditions.length === 0) return '1 = 1';
    if (filter.conditions.length === 1) return this.renderFilter(filter.conditions[0]);

    const op = filter.operator === 'and' ? this.kw('and') : this.kw('or');
    const parts = filter.conditions.map((c) => this.renderFilter(c));
    return `(${parts.join(` ${op} `)})`;
  }

  private renderNotFilter(filter: NotFilter): string {
    return `${this.kw('not')} (${this.renderFilter(filter.condition)})`;
  }

  private renderRawFilter(filter: RawFilter): string {
    // Add any raw filter params
    if (filter.params) {
      for (const p of filter.params) {
        this.addParam(p);
      }
    }
    return filter.expression;
  }

  // ── GROUP BY ──────────────────────────────────────────────────

  generateGroupBy(clauses: GroupByClause[]): string {
    const parts = clauses.map((c) => this.renderGroupByClause(c));
    return `${this.kw('group by')} ${parts.join(', ')}`;
  }

  private renderGroupByClause(clause: GroupByClause): string {
    switch (clause.kind) {
      case 'column': {
        if (clause.table) {
          return `${this.dialect.quoteIdentifier(clause.table)}.${this.dialect.quoteIdentifier(clause.column)}`;
        }
        return this.dialect.quoteIdentifier(clause.column);
      }
      case 'raw':
        return clause.expression;
    }
  }

  // ── HAVING ────────────────────────────────────────────────────

  generateHaving(filters: Filter[]): string {
    if (filters.length === 0) return '';

    const condition = filters.length === 1
      ? this.renderFilter(filters[0])
      : filters.map((f) => this.renderFilter(f)).join(` ${this.kw('and')} `);

    return `${this.kw('having')} ${condition}`;
  }

  // ── ORDER BY ──────────────────────────────────────────────────

  generateOrderBy(clauses: OrderByClause[]): string {
    const parts = clauses.map((c) => this.renderOrderByClause(c));
    return `${this.kw('order by')} ${parts.join(', ')}`;
  }

  private renderOrderByClause(clause: OrderByClause): string {
    const dir = clause.direction === 'asc' ? this.kw('asc') : this.kw('desc');

    switch (clause.kind) {
      case 'column': {
        let col: string;
        if (clause.table) {
          col = `${this.dialect.quoteIdentifier(clause.table)}.${this.dialect.quoteIdentifier(clause.column)}`;
        } else {
          col = this.dialect.quoteIdentifier(clause.column);
        }
        let result = `${col} ${dir}`;
        if (clause.nulls) {
          result += ` ${this.kw('nulls')} ${clause.nulls === 'first' ? this.kw('first') : this.kw('last')}`;
        }
        return result;
      }
      case 'raw':
        return `${clause.expression} ${dir}`;
    }
  }

  // ── Parameter handling ────────────────────────────────────────

  private addParam(value: unknown): string {
    this.params.push(value);
    return this.dialect.getParameterPlaceholder(this.params.length - 1);
  }

  // ── Operator mapping ──────────────────────────────────────────

  private filterOpToSQL(op: FilterOperator): string {
    switch (op) {
      case 'eq': return '=';
      case 'neq': return '<>';
      case 'gt': return '>';
      case 'gte': return '>=';
      case 'lt': return '<';
      case 'lte': return '<=';
      case 'like': return this.kw('like');
      case 'not_like': return `${this.kw('not')} ${this.kw('like')}`;
      case 'in': return this.kw('in');
      case 'not_in': return `${this.kw('not')} ${this.kw('in')}`;
      case 'is_null': return `${this.kw('is null')}`;
      case 'is_not_null': return `${this.kw('is not null')}`;
      case 'between': return this.kw('between');
    }
  }
}

// ── Convenience factory ─────────────────────────────────────────────

/**
 * Create a SQLGenerator for a specific dialect.
 */
export function createGenerator(dialect: SQLDialect, options?: SQLGeneratorOptions): SQLGenerator {
  return new SQLGenerator(dialect, options);
}
