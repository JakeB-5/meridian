import { eq, lte, sql, SQL, desc } from 'drizzle-orm';
import { cacheEntries } from '../schema/cache-entries.js';
import type { CacheEntry, NewCacheEntry } from '../schema/cache-entries.js';
import type { Database } from '../connection.js';

// ── Types ───────────────────────────────────────────────────────────

export interface CacheSetOptions {
  /** Time-to-live in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
}

// ── Repository ──────────────────────────────────────────────────────

/**
 * Repository for the database-backed cache layer.
 * Provides simple get/set/delete semantics with TTL-based expiration.
 */
export class CacheEntryRepository {
  constructor(private readonly db: Database) {}

  // ── Core Operations ─────────────────────────────────────────────

  /**
   * Get a cache entry by key.
   * Returns null if the key doesn't exist or has expired.
   */
  async get(key: string): Promise<unknown | null> {
    const rows = await this.db
      .select()
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .limit(1);

    const entry = rows[0];
    if (!entry) return null;

    // Check expiration
    if (new Date() > entry.expiresAt) {
      // Lazily clean up expired entry
      await this.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Get the full cache entry (including metadata) by key.
   */
  async getEntry(key: string): Promise<CacheEntry | null> {
    const rows = await this.db
      .select()
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .limit(1);

    const entry = rows[0];
    if (!entry) return null;

    // Check expiration
    if (new Date() > entry.expiresAt) {
      await this.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Set a cache entry. If the key already exists, it is overwritten.
   */
  async set(
    key: string,
    value: unknown,
    options?: CacheSetOptions,
  ): Promise<CacheEntry> {
    const ttl = options?.ttlSeconds ?? 300;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Upsert: try to insert, update on conflict
    const rows = await this.db
      .insert(cacheEntries)
      .values({
        key,
        value,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: cacheEntries.key,
        set: {
          value,
          expiresAt,
          createdAt: new Date(),
        },
      })
      .returning();

    return rows[0]!;
  }

  /**
   * Delete a cache entry by key.
   * Returns true if the entry existed and was deleted.
   */
  async delete(key: string): Promise<boolean> {
    const rows = await this.db
      .delete(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .returning({ id: cacheEntries.id });

    return rows.length > 0;
  }

  /**
   * Check if a non-expired cache entry exists for the given key.
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Get multiple cache entries by keys.
   * Returns a Map of key → value for entries that exist and haven't expired.
   */
  async getMany(keys: string[]): Promise<Map<string, unknown>> {
    if (keys.length === 0) return new Map();

    const result = new Map<string, unknown>();
    const now = new Date();

    // Fetch all matching entries
    const rows = await this.db
      .select()
      .from(cacheEntries)
      .where(sql`${cacheEntries.key} = ANY(${keys})`);

    const expiredIds: string[] = [];

    for (const row of rows) {
      if (now > row.expiresAt) {
        expiredIds.push(row.id);
      } else {
        result.set(row.key, row.value);
      }
    }

    // Clean up expired entries in background (don't await)
    if (expiredIds.length > 0) {
      void this.deleteExpiredByIds(expiredIds);
    }

    return result;
  }

  /**
   * Set multiple cache entries in a single batch.
   */
  async setMany(
    entries: Array<{ key: string; value: unknown }>,
    options?: CacheSetOptions,
  ): Promise<CacheEntry[]> {
    if (entries.length === 0) return [];

    const ttl = options?.ttlSeconds ?? 300;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const results: CacheEntry[] = [];
    for (const entry of entries) {
      const result = await this.set(entry.key, entry.value, { ttlSeconds: ttl });
      results.push(result);
    }

    return results;
  }

  /**
   * Delete multiple cache entries by keys.
   */
  async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    const rows = await this.db
      .delete(cacheEntries)
      .where(sql`${cacheEntries.key} = ANY(${keys})`)
      .returning({ id: cacheEntries.id });

    return rows.length;
  }

  // ── Maintenance ─────────────────────────────────────────────────

  /**
   * Delete all expired cache entries.
   * Should be called periodically by a scheduled job.
   */
  async purgeExpired(): Promise<number> {
    const rows = await this.db
      .delete(cacheEntries)
      .where(lte(cacheEntries.expiresAt, new Date()))
      .returning({ id: cacheEntries.id });

    return rows.length;
  }

  /**
   * Delete all cache entries.
   */
  async purgeAll(): Promise<number> {
    const rows = await this.db
      .delete(cacheEntries)
      .returning({ id: cacheEntries.id });

    return rows.length;
  }

  /**
   * Count all non-expired cache entries.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(cacheEntries)
      .where(sql`${cacheEntries.expiresAt} > NOW()`);

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count expired (stale) cache entries awaiting cleanup.
   */
  async countExpired(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(cacheEntries)
      .where(lte(cacheEntries.expiresAt, new Date()));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Get cache entries sorted by expiration (soonest first).
   * Useful for monitoring and debugging.
   */
  async findExpiringSoon(limit: number = 20): Promise<CacheEntry[]> {
    return this.db
      .select()
      .from(cacheEntries)
      .where(sql`${cacheEntries.expiresAt} > NOW()`)
      .orderBy(cacheEntries.expiresAt)
      .limit(limit);
  }

  // ── Internal ────────────────────────────────────────────────────

  private async deleteExpiredByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.db
      .delete(cacheEntries)
      .where(sql`${cacheEntries.id} = ANY(${ids})`);
  }
}
