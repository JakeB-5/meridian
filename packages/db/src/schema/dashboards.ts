import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ── Dashboards Table ────────────────────────────────────────────────
// A dashboard is a collection of question cards arranged on a grid.

export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Dashboard display name */
    name: varchar('name', { length: 255 }).notNull(),

    /** Optional description shown in listings and detail views */
    description: text('description'),

    /** Owning organization */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** User who created this dashboard */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),

    /**
     * Public dashboards are accessible without authentication
     * (e.g. for embedding or sharing).
     */
    isPublic: boolean('is_public').default(false).notNull(),

    /**
     * Grid layout configuration (columns, row height, breakpoints).
     * Stored as DashboardLayout JSON.
     */
    layout: jsonb('layout').$type<Record<string, unknown>>().default({}).notNull(),

    /**
     * Dashboard-level filters that apply to all cards.
     * Stored as DashboardFilter[] JSON.
     */
    filters: jsonb('filters').$type<Record<string, unknown>[]>().default([]).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('dashboards_organization_id_idx').on(table.organizationId),
    index('dashboards_created_by_idx').on(table.createdBy),
    index('dashboards_is_public_idx').on(table.isPublic),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
