import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

// ── Organizations Table ─────────────────────────────────────────────
// Top-level tenant entity. Every user, role, datasource, question, and
// dashboard belongs to exactly one organization.

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Human-readable organization name */
    name: varchar('name', { length: 255 }).notNull(),

    /** URL-safe unique slug used in routes and API keys */
    slug: varchar('slug', { length: 255 }).notNull().unique(),

    /**
     * Arbitrary org-level settings stored as JSONB.
     * Examples: default timezone, locale, feature flags, branding overrides.
     */
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('organizations_slug_idx').on(table.slug),
    index('organizations_name_idx').on(table.name),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
