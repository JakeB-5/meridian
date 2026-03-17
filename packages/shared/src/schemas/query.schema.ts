import { z } from 'zod';

// ── Query Schemas ───────────────────────────────────────────────────

export const filterOperatorSchema = z.enum([
  'eq', 'neq',
  'gt', 'gte', 'lt', 'lte',
  'in', 'not_in',
  'like', 'not_like',
  'is_null', 'is_not_null',
  'between',
]);

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const aggregationTypeSchema = z.enum([
  'count', 'sum', 'avg', 'min', 'max', 'count_distinct',
]);

export const filterClauseSchema = z.object({
  column: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.unknown(),
});

export const sortClauseSchema = z.object({
  column: z.string().min(1),
  direction: sortDirectionSchema,
});

export const aggregationClauseSchema = z.object({
  column: z.string().min(1),
  aggregation: aggregationTypeSchema,
  alias: z.string().optional(),
});

export const visualQuerySchema = z.object({
  dataSourceId: z.string().min(1),
  table: z.string().min(1),
  columns: z.array(z.string().min(1)),
  filters: z.array(filterClauseSchema),
  sorts: z.array(sortClauseSchema),
  aggregations: z.array(aggregationClauseSchema),
  groupBy: z.array(z.string().min(1)),
  limit: z.number().int().positive().max(10_000).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const columnInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
});

export const queryResultSchema = z.object({
  columns: z.array(columnInfoSchema),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  executionTimeMs: z.number().nonnegative(),
  truncated: z.boolean(),
});

export type VisualQueryInput = z.infer<typeof visualQuerySchema>;
export type FilterClauseInput = z.infer<typeof filterClauseSchema>;
export type SortClauseInput = z.infer<typeof sortClauseSchema>;
