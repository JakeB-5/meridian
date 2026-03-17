# Group D1: @meridian/query-engine — SQL Generation & Optimization

## Task
Implement the query engine that translates VisualQuery objects into optimized, dialect-specific SQL.

## Pipeline: VisualQuery → AbstractQuery (IR) → SQLQuery (dialect-specific)

## Files to Create

### src/ir/abstract-query.ts
Intermediate representation:
```typescript
export interface AbstractQuery {
  source: TableSource | SubquerySource;
  selections: Selection[];
  filters: Filter[];
  groupBy: GroupByClause[];
  orderBy: OrderByClause[];
  limit?: number;
  offset?: number;
  joins: JoinClause[];
  having: Filter[];
}
```

### src/ir/query-builder.ts
Fluent builder for AbstractQuery:
```typescript
export class QueryBuilder {
  from(table: string, schema?: string): this;
  select(...columns: string[]): this;
  where(column: string, op: FilterOperator, value: unknown): this;
  groupBy(...columns: string[]): this;
  orderBy(column: string, dir: SortDirection): this;
  limit(n: number): this;
  offset(n: number): this;
  join(type: JoinType, table: string, on: JoinCondition): this;
  aggregate(fn: AggregationType, column: string, alias?: string): this;
  build(): AbstractQuery;
}
```

### src/translator/visual-to-abstract.ts
Converts VisualQuery → AbstractQuery:
- Maps columns to selections
- Maps filters to Filter nodes
- Maps aggregations to aggregate selections + groupBy
- Maps sorts to orderBy

### src/dialects/sql-dialect.ts
```typescript
export interface SQLDialect {
  name: string;
  quoteIdentifier(name: string): string;
  quoteString(value: string): string;
  formatLimit(limit: number, offset?: number): string;
  formatBoolean(value: boolean): string;
  supportsReturning(): boolean;
  supportsWindowFunctions(): boolean;
  getCastExpression(expr: string, type: string): string;
  getDateTruncExpression(field: string, unit: string): string;
}
```

### src/dialects/postgresql.dialect.ts
PostgreSQL-specific SQL generation:
- Double-quote identifiers
- LIMIT/OFFSET syntax
- RETURNING support
- window functions, CTEs
- date_trunc, interval, generate_series

### src/dialects/mysql.dialect.ts
MySQL-specific:
- Backtick identifiers
- LIMIT syntax
- No RETURNING
- DATE_FORMAT, TIMESTAMPDIFF

### src/dialects/sqlite.dialect.ts
### src/dialects/clickhouse.dialect.ts
### src/dialects/duckdb.dialect.ts

### src/generator/sql-generator.ts
Generates SQL string from AbstractQuery + SQLDialect:
```typescript
export class SQLGenerator {
  constructor(private dialect: SQLDialect) {}
  generate(query: AbstractQuery): GeneratedSQL;
}

export interface GeneratedSQL {
  sql: string;
  params: unknown[];
  parameterized: boolean;
}
```
- SELECT clause generation
- FROM clause (with schema)
- WHERE clause (with parameter binding)
- GROUP BY, HAVING, ORDER BY
- LIMIT/OFFSET
- JOIN generation

### src/optimizer/query-optimizer.ts
Basic query optimizations:
- Remove unused columns from SELECT
- Push down filters to subqueries
- Merge redundant filters
- Simplify constant expressions
- LIMIT pushdown

### src/executor/query-executor.ts
Execute queries through connectors:
```typescript
export class QueryExecutor {
  constructor(
    private connectorFactory: ConnectorFactory,
    private cache: CacheProvider,
    private generator: SQLGenerator,
  ) {}

  executeVisual(query: VisualQuery, dataSourceId: string): Promise<Result<QueryResult>>;
  executeRaw(sql: string, dataSourceId: string, params?: unknown[]): Promise<Result<QueryResult>>;
}
```
- Check cache first
- Generate SQL from visual query
- Execute via connector
- Cache result
- Apply row limits
- Track execution time

### src/executor/query-cancellation.ts
Query cancellation registry:
- Track running queries by ID
- Cancel via connector.cancelQuery
- Timeout enforcement

### src/index.ts — re-exports

## Tests
- src/ir/query-builder.test.ts (fluent API, edge cases)
- src/translator/visual-to-abstract.test.ts (all query types)
- src/dialects/postgresql.dialect.test.ts (identifier quoting, date functions)
- src/dialects/mysql.dialect.test.ts
- src/generator/sql-generator.test.ts (full SQL generation for each dialect)
- src/optimizer/query-optimizer.test.ts
- src/executor/query-executor.test.ts (cache hit/miss, error handling)

## Dependencies
- @meridian/core, @meridian/connectors, @meridian/shared
- (cache is passed in, not a direct dependency)

## Estimated LOC: ~8000 + ~3000 tests
