import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { roles } from './roles.js';

// ── Users Table ─────────────────────────────────────────────────────
// Application users. Each user belongs to one organization and has one role.

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Unique email address used for login */
    email: varchar('email', { length: 255 }).notNull().unique(),

    /** Display name */
    name: varchar('name', { length: 255 }).notNull(),

    /** Argon2id hashed password */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),

    /** Optional avatar image URL */
    avatarUrl: varchar('avatar_url', { length: 500 }),

    /** Owning organization */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Assigned RBAC role */
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    /** Soft-disable flag: inactive users cannot authenticate */
    isActive: boolean('is_active').default(true).notNull(),

    /** Timestamp of most recent successful authentication */
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_organization_id_idx').on(table.organizationId),
    index('users_role_id_idx').on(table.roleId),
    index('users_is_active_idx').on(table.isActive),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
