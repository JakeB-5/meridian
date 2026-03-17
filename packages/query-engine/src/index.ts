// ── @meridian/query-engine ───────────────────────────────────────────
// SQL generation, query optimization, and execution engine.
//
// Pipeline: VisualQuery → AbstractQuery (IR) → Optimized IR → SQL → Execute
//
// Usage:
//   import { QueryBuilder, SQLGenerator, PostgreSQLDialect } from '@meridian/query-engine';
//
//   const query = new QueryBuilder()
//     .from('users')
//     .select('id', 'name')
//     .where('active', 'eq', true)
//     .build();
//
//   const generator = new SQLGenerator(new PostgreSQLDialect());
//   const { sql, params } = generator.generate(query);

// ── IR (Intermediate Representation) ────────────────────────────────
export type {
  AbstractQuery,
  QuerySource,
  TableSource,
  SubquerySource,
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
  ColumnGroupBy,
  RawGroupBy,
  OrderByClause,
  ColumnOrderBy,
  RawOrderBy,
  JoinType,
  JoinCondition,
  JoinClause,
} from './ir/abstract-query.js';

export { createEmptyQuery } from './ir/abstract-query.js';

export { QueryBuilder, comparison, and, or, not } from './ir/query-builder.js';

// ── Translator ──────────────────────────────────────────────────────
export type {
  TranslationOptions,
  TranslationResult,
  TranslationWarning,
} from './translator/visual-to-abstract.js';

export {
  translateVisualToAbstract,
  translateBatch,
} from './translator/visual-to-abstract.js';

// ── Dialects ────────────────────────────────────────────────────────
export type {
  SQLDialect,
  DateTruncUnit,
  DateDiffUnit,
} from './dialects/sql-dialect.js';

export { BaseSQLDialect } from './dialects/sql-dialect.js';

export { PostgreSQLDialect } from './dialects/postgresql.dialect.js';
export { MySQLDialect } from './dialects/mysql.dialect.js';
export { SQLiteDialect } from './dialects/sqlite.dialect.js';
export { ClickHouseDialect } from './dialects/clickhouse.dialect.js';
export { DuckDBDialect } from './dialects/duckdb.dialect.js';

// ── Generator ───────────────────────────────────────────────────────
export type {
  GeneratedSQL,
  SQLGeneratorOptions,
} from './generator/sql-generator.js';

export { SQLGenerator, createGenerator } from './generator/sql-generator.js';

// ── Optimizer ───────────────────────────────────────────────────────
export type {
  OptimizationResult,
  OptimizerOptions,
} from './optimizer/query-optimizer.js';

export {
  QueryOptimizer,
  createOptimizer,
  optimizeQuery,
} from './optimizer/query-optimizer.js';

// ── Executor ────────────────────────────────────────────────────────
export type {
  CacheProvider,
  ConnectorFactory,
  QueryExecutorOptions,
  ExecutionMetadata,
  ExecutionResult,
} from './executor/query-executor.js';

export {
  QueryExecutor,
  createQueryExecutor,
  QUERY_ENGINE_ERROR_CODES,
} from './executor/query-executor.js';

export type {
  RunningQuery,
  CancellationRegistryOptions,
} from './executor/query-cancellation.js';

export {
  QueryCancellationRegistry,
  createCancellationRegistry,
} from './executor/query-cancellation.js';
