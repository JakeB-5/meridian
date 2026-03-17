import { createLogger } from '../logger.js';
import type { CacheOptions, CacheProvider, CacheStats } from '../types.js';

const logger = createLogger('@meridian/cache:memory');

interface Entry<T> {
  value: T;
  /** Unix ms timestamp when this entry expires. 0 = no expiry. */
  expiresAt: number;
  /** Insertion order counter used for LRU tracking. */
  lastAccessed: number;
}

export interface MemoryCacheOptions {
  /** Maximum number of entries before LRU eviction. Default: 1000. */
  maxSize?: number;
  /** Default TTL in seconds applied when no per-entry TTL is given. */
  defaultTtlSeconds?: number;
}

/**
 * LRU in-memory cache implementing CacheProvider.
 *
 * Key design choices:
 *  - Keys are stored as `{namespace}:{key}` when a namespace is provided.
 *  - Expiry is checked lazily on get() and eagerly during set() eviction.
 *  - LRU eviction removes the entry with the smallest `lastAccessed` value.
 *  - Stats (hits/misses) are tracked across all operations.
 */
export class MemoryCache implements CacheProvider {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly maxSize: number;
  private readonly defaultTtlSeconds: number | undefined;

  private _hits = 0;
  private _misses = 0;
  private _accessCounter = 0;

  constructor(options: MemoryCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTtlSeconds = options.defaultTtlSeconds;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private isExpired(entry: Entry<unknown>): boolean {
    return entry.expiresAt !== 0 && Date.now() > entry.expiresAt;
  }

  private evictExpired(): void {
    for (const [k, entry] of this.store) {
      if (this.isExpired(entry)) {
        this.store.delete(k);
      }
    }
  }

  private evictLRU(): void {
    // Remove oldest accessed entry to stay within maxSize.
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [k, entry] of this.store) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = k;
      }
    }

    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
      logger.debug('LRU evicted entry', { key: oldestKey });
    }
  }

  private computeExpiresAt(ttlSeconds?: number): number {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    if (ttl === undefined || ttl <= 0) return 0;
    return Date.now() + ttl * 1000;
  }

  // ---------------------------------------------------------------------------
  // CacheProvider implementation
  // ---------------------------------------------------------------------------

  async get<T>(key: string, namespace?: string): Promise<T | null> {
    const fullKey = this.buildKey(key, namespace);
    const entry = this.store.get(fullKey);

    if (entry === undefined) {
      this._misses++;
      logger.debug('cache miss', { key: fullKey });
      return null;
    }

    if (this.isExpired(entry)) {
      this.store.delete(fullKey);
      this._misses++;
      logger.debug('cache miss (expired)', { key: fullKey });
      return null;
    }

    // Update LRU timestamp.
    entry.lastAccessed = ++this._accessCounter;
    this._hits++;
    logger.debug('cache hit', { key: fullKey });
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options?.namespace);

    // First clean expired entries to reclaim space.
    this.evictExpired();

    // If we are at capacity and this is a new key, evict LRU.
    if (!this.store.has(fullKey) && this.store.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: Entry<T> = {
      value,
      expiresAt: this.computeExpiresAt(options?.ttlSeconds),
      lastAccessed: ++this._accessCounter,
    };

    this.store.set(fullKey, entry);
    logger.debug('cache set', { key: fullKey, ttlSeconds: options?.ttlSeconds });
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.buildKey(key, namespace);
    const existed = this.store.has(fullKey);
    this.store.delete(fullKey);
    logger.debug('cache delete', { key: fullKey, existed });
    return existed;
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.buildKey(key, namespace);
    const entry = this.store.get(fullKey);
    if (entry === undefined) return false;
    if (this.isExpired(entry)) {
      this.store.delete(fullKey);
      return false;
    }
    return true;
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace === undefined) {
      this.store.clear();
      logger.debug('cache cleared (all)');
      return;
    }

    const prefix = `${namespace}:`;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
      }
    }
    logger.debug('cache cleared', { namespace });
  }

  async keys(pattern?: string): Promise<string[]> {
    // Prune expired entries first so callers see accurate key lists.
    this.evictExpired();

    const allKeys = Array.from(this.store.keys());

    if (pattern === undefined) return allKeys;

    // Convert simple glob pattern (* and ?) to a RegExp.
    const regex = globToRegex(pattern);
    return allKeys.filter((k) => regex.test(k));
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): CacheStats {
    this.evictExpired();
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      size: this.store.size,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
  }
}

// ---------------------------------------------------------------------------
// Utility: glob → RegExp
// ---------------------------------------------------------------------------

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special regex chars
    .replace(/\*/g, '.*')                   // * → .*
    .replace(/\?/g, '.');                   // ? → .
  return new RegExp(`^${escaped}$`);
}
