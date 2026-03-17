import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';
import { datasources } from './datasources.js';

// ── Enums ───────────────────────────────────────────────────────────

/**
 * Question authoring mode.
 * - visual: built with the drag-and-drop query builder (stored as VisualQuery JSON)
 * - sql: hand-written SQL string
 */
export const questionTypeEnum = pgEnum('question_type', ['visual', 'sql']);

// ── Questions Table ─────────────────────────────────────────────────
// A "question" is the core analytical unit: a saved query + visualization.

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Short display name */
    name: varchar('name', { length: 255 }).notNull(),

    /** Optional longer description / notes */
    description: text('description'),

    /** How the query was authored */
    type: questionTypeEnum('type').notNull(),

    /** Target data source to execute against */
    dataSourceId: uuid('data_source_id')
      .notNull()
      .references(() => datasources.id, { onDelete: 'restrict' }),

    /**
     * The query payload.
     * For visual questions: VisualQuery JSON.
     * For SQL questions: { sql: string, parameters?: unknown[] }.
     */
    query: jsonb('query').$type<Record<string, unknown>>().notNull(),

    /**
     * Visualization configuration (chart type, axes, colors, etc.).
     * Stored as VisualizationConfig JSON.
     */
    visualization: jsonb('visualization').$type<Record<string, unknown>>().default({}).notNull(),

    /** Owning organization */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** User who created this question */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),

    /** Soft-archive flag: archived questions are hidden from listings */
    isArchived: boolean('is_archived').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('questions_organization_id_idx').on(table.organizationId),
    index('questions_data_source_id_idx').on(table.dataSourceId),
    index('questions_created_by_idx').on(table.createdBy),
    index('questions_type_idx').on(table.type),
    index('questions_is_archived_idx').on(table.isArchived),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
