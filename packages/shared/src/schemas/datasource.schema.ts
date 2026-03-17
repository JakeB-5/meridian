import { z } from 'zod';

// ── Data Source Schemas ─────────────────────────────────────────────

export const databaseTypeSchema = z.enum([
  'postgresql',
  'mysql',
  'sqlite',
  'clickhouse',
  'bigquery',
  'snowflake',
  'duckdb',
]);

export const dataSourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  type: databaseTypeSchema,
  host: z.string().optional(),
  port: z.number().int().positive().max(65535).optional(),
  database: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

export const createDataSourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: databaseTypeSchema,
  host: z.string().optional(),
  port: z.number().int().positive().max(65535).optional(),
  database: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
  organizationId: z.string().min(1),
});

export const updateDataSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  host: z.string().optional(),
  port: z.number().int().positive().max(65535).optional(),
  database: z.string().min(1).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

export const connectionTestResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  latencyMs: z.number().nonnegative(),
});

export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>;
export type UpdateDataSourceInput = z.infer<typeof updateDataSourceSchema>;
