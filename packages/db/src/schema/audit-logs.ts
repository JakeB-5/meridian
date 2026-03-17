import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// ── Audit Logs Table ────────────────────────────────────────────────
// Immutable append-only audit trail for compliance and debugging.
// Records who did what to which entity, and when.

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * The user who performed the action.
     * Nullable for system-initiated actions (migrations, scheduled jobs).
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    /**
     * Action verb describing what happened.
     * Convention: "entity.verb" — e.g. "datasource.created", "dashboard.deleted",
     * "user.login", "question.executed".
     */
    action: varchar('action', { length: 255 }).notNull(),

    /**
     * The type of entity affected (e.g. "user", "datasource", "dashboard").
     */
    entityType: varchar('entity_type', { length: 100 }).notNull(),

    /** The ID of the affected entity */
    entityId: varchar('entity_id', { length: 255 }).notNull(),

    /**
     * Extra context: old/new values for updates, request params,
     * error details for failures, etc.
     */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),

    /** Client IP address at the time of the action */
    ipAddress: varchar('ip_address', { length: 45 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_entity_type_idx').on(table.entityType),
    index('audit_logs_entity_id_idx').on(table.entityId),
    index('audit_logs_entity_lookup_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
