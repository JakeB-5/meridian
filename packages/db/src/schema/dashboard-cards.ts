import { pgTable, uuid, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { dashboards } from './dashboards.js';
import { questions } from './questions.js';

// ── Dashboard Cards Table ───────────────────────────────────────────
// Junction table placing question cards onto a dashboard grid.
// Each card has a position (x,y) and size (width,height) in grid units.

export const dashboardCards = pgTable(
  'dashboard_cards',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Parent dashboard */
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),

    /** Question rendered inside this card */
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),

    /** Horizontal grid position (0-based, left edge) */
    positionX: integer('position_x').default(0).notNull(),

    /** Vertical grid position (0-based, top edge) */
    positionY: integer('position_y').default(0).notNull(),

    /** Card width in grid columns */
    width: integer('width').default(6).notNull(),

    /** Card height in grid rows */
    height: integer('height').default(4).notNull(),

    /**
     * Per-card overrides: title visibility, refresh interval,
     * card-level filters, custom styles, etc.
     */
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [
    index('dashboard_cards_dashboard_id_idx').on(table.dashboardId),
    index('dashboard_cards_question_id_idx').on(table.questionId),
    index('dashboard_cards_position_idx').on(table.dashboardId, table.positionX, table.positionY),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type DashboardCard = typeof dashboardCards.$inferSelect;
export type NewDashboardCard = typeof dashboardCards.$inferInsert;
