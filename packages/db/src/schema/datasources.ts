import { pgTable, uuid, varchar, jsonb, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ── Enums ───────────────────────────────────────────────────────────

/**
 * Supported database connector types.
 * Kept in sync with DatabaseType from @meridian/shared.
 */
export const databaseTypeEnum = pgEnum('database_type', [
  'postgresql',
  'mysql',
  'sqlite',
  'clickhouse',
  'bigquery',
  'snowflake',
  'duckdb',
]);

/**
 * Connection health status for a data source.
 */
export const datasourceStatusEnum = pgEnum('datasource_status', [
  'active',
  'inactive',
  'error',
  'testing',
]);

// ── Datasources Table ───────────────────────────────────────────────
// External database connections that users query through Meridian.

export const datasources = pgTable(
  'datasources',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Human-readable name */
    name: varchar('name', { length: 255 }).notNull(),

    /** Connector driver type */
    type: databaseTypeEnum('type').notNull(),

    /**
     * Connection configuration stored as JSONB.
     * Contains host, port, database, credentials, SSL settings, etc.
     * Sensitive fields (password) should be encrypted at the application layer.
     */
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),

    /** Owning organization */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** User who created this data source */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),

    /** Current connection health status */
    status: datasourceStatusEnum('status').default('inactive').notNull(),

    /** When the connection was last successfully tested */
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('datasources_organization_id_idx').on(table.organizationId),
    index('datasources_created_by_idx').on(table.createdBy),
    index('datasources_type_idx').on(table.type),
    index('datasources_status_idx').on(table.status),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type DataSource = typeof datasources.$inferSelect;
export type NewDataSource = typeof datasources.$inferInsert;
