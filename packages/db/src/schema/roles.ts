import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// ── Roles Table ─────────────────────────────────────────────────────
// RBAC roles scoped to an organization. System roles (admin, viewer)
// are seeded automatically and cannot be deleted by users.

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Role display name (e.g. "Admin", "Viewer", "Analyst") */
    name: varchar('name', { length: 255 }).notNull(),

    /**
     * Permission identifiers granted by this role.
     * Stored as a Postgres text[] array.
     * Values align with the Permission union type in @meridian/shared.
     */
    permissions: text('permissions').array().notNull().default([]),

    /** Owning organization */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * System roles are seeded by the platform and cannot be modified
     * or deleted through the UI / API.
     */
    isSystem: boolean('is_system').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('roles_organization_id_idx').on(table.organizationId),
    index('roles_name_org_idx').on(table.name, table.organizationId),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
