import { z } from 'zod';
import { visualQuerySchema } from './query.schema.js';

// ── Question Schemas ────────────────────────────────────────────────

export const questionTypeSchema = z.enum(['visual', 'sql']);

export const chartTypeSchema = z.enum([
  'bar', 'line', 'area', 'pie', 'donut',
  'scatter', 'table', 'number', 'gauge',
  'funnel', 'treemap', 'heatmap', 'map',
  'sankey', 'radar', 'waterfall', 'boxplot',
  'histogram', 'combo',
]);

export const axisConfigSchema = z.object({
  label: z.string().optional(),
  format: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const legendConfigSchema = z.object({
  show: z.boolean(),
  position: z.enum(['top', 'bottom', 'left', 'right']),
});

export const visualizationConfigSchema = z.object({
  type: chartTypeSchema,
  title: z.string().optional(),
  xAxis: axisConfigSchema.optional(),
  yAxis: axisConfigSchema.optional(),
  colors: z.array(z.string()).optional(),
  legend: legendConfigSchema.optional(),
  tooltip: z.boolean().optional(),
  stacked: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

export const createQuestionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: questionTypeSchema,
  dataSourceId: z.string().min(1),
  query: z.union([visualQuerySchema, z.string().min(1).max(50_000)]),
  visualization: visualizationConfigSchema,
  organizationId: z.string().min(1),
});

export const updateQuestionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  query: z.union([visualQuerySchema, z.string().min(1).max(50_000)]).optional(),
  visualization: visualizationConfigSchema.optional(),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
