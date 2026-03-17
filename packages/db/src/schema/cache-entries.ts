import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

// ── Cache Entries Table ─────────────────────────────────────────────
// Database-backed cache layer for query results and computed values.
// Used as a fallback / overflow when the Redis cache is unavailable
// or for persisting cache entries across restarts.

export const cacheEntries = pgTable(
  'cache_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * Unique cache key.
     * Typically a hash of (query + params + connector config).
     */
    key: varchar('key', { length: 512 }).notNull().unique(),

    /** Cached payload stored as JSONB */
    value: jsonb('value').$type<unknown>().notNull(),

    /** When this entry should be considered stale */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('cache_entries_key_idx').on(table.key),
    index('cache_entries_expires_at_idx').on(table.expiresAt),
  ],
);

// ── Drizzle inferred types ──────────────────────────────────────────

export type CacheEntry = typeof cacheEntries.$inferSelect;
export type NewCacheEntry = typeof cacheEntries.$inferInsert;
