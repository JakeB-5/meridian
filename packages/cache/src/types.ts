/**
 * Cache provider options for get/set operations.
 */
export interface CacheOptions {
  /** Time-to-live in seconds. If omitted, entry lives indefinitely. */
  ttlSeconds?: number;
  /** Namespace prefix to logically isolate keys. */
  namespace?: string;
}

/**
 * Unified interface for all cache provider implementations.
 */
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  /** Clear all keys, or all keys within a namespace if provided. */
  clear(namespace?: string): Promise<void>;
  /** Return all stored keys, optionally filtered by glob pattern. */
  keys(pattern?: string): Promise<string[]>;
}

/**
 * Runtime statistics snapshot for a cache provider.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  /** Current number of entries stored. */
  size: number;
  /** hits / (hits + misses). NaN when both are zero. */
  hitRate: number;
}
