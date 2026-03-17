import { pgTable, uuid, varchar, jsonb, boolean, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';

// ── Enums ───────────────────────────────────────────────────────────

/**
 * Plugin type categories.
 * Kept in sync with PluginType from @meridian/shared.
 */
export const pluginTypeEnum = pgEnum('plugin_type', [
  'connector',
  'visualization',
  'transformation',
  'api',
]);

// ── Plugin Registry Table ───────────────────────────────────────────
// Tracks installed plugins and their configuration.

export const pluginRegistry = pgTable(
  'plugin_registry',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Unique plugin identifier (npm-style, e.g. "@meridian/connector-mysql") */
    name: varchar('name', { length: 255 }).notNull().unique(),

    /** Installed semver version */
    version: varchar('version', { length: 50 }).notNull(),

    /** Plugin category */
    type: pluginTypeEnum('type').notNull(),

    /**
     * Plugin-specific configuration overrides.
     * Merged with defaults from the plugin manifest at load time.
     */
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),

    /** Whether this plugin is active and should be loaded on startup */
    isEnabled: boolean('is_enabled').default(true).notNull(),

    /** When the plugin was first installed */
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),

    /** When the plugin config or version was last changed */
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('plugin_registry_name_idx').on(table.name),
    index('plugin_registry_type_idx').on(table.type),
    index('plugin_registry_is_enabled_idx').on(table.isEnabled),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type PluginRegistryEntry = typeof pluginRegistry.$inferSelect;
export type NewPluginRegistryEntry = typeof pluginRegistry.$inferInsert;
