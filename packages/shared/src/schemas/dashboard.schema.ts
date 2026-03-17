import { z } from 'zod';
import {
  DEFAULT_DASHBOARD_COLUMNS,
  DEFAULT_ROW_HEIGHT,
  MIN_CARD_WIDTH,
  MIN_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  MAX_CARD_HEIGHT,
  MAX_DASHBOARD_COLUMNS,
} from '../constants/defaults.js';

// ── Dashboard Schemas ───────────────────────────────────────────────

export const cardPositionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

export const cardSizeSchema = z.object({
  width: z.number().int().min(MIN_CARD_WIDTH).max(MAX_CARD_WIDTH),
  height: z.number().int().min(MIN_CARD_HEIGHT).max(MAX_CARD_HEIGHT),
});

export const dashboardLayoutSchema = z.object({
  columns: z.number().int().min(1).max(MAX_DASHBOARD_COLUMNS).default(DEFAULT_DASHBOARD_COLUMNS),
  rowHeight: z.number().int().positive().default(DEFAULT_ROW_HEIGHT),
});

export const dashboardFilterSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  column: z.string().min(1),
  defaultValue: z.unknown().optional(),
});

export const dashboardCardSchema = z.object({
  id: z.string().min(1),
  dashboardId: z.string().min(1),
  questionId: z.string().min(1),
  position: cardPositionSchema,
  size: cardSizeSchema,
});

export const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  organizationId: z.string().min(1),
  isPublic: z.boolean().default(false),
  layout: dashboardLayoutSchema.optional(),
  filters: z.array(dashboardFilterSchema).optional(),
});

export const updateDashboardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional(),
  layout: dashboardLayoutSchema.optional(),
  filters: z.array(dashboardFilterSchema).optional(),
});

export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;
