import Redis, { type RedisOptions } from 'ioredis';
import { CacheConnectionError, CacheError, CacheSerializationError } from '../errors.js';
import { createLogger } from '../logger.js';
import type { CacheOptions, CacheProvider } from '../types.js';

const logger = createLogger('@meridian/cache:redis');

export interface RedisCacheOptions {
  /** Redis connection URL (e.g. redis://localhost:6379) or ioredis RedisOptions object. */
  connection: string | RedisOptions;
  /** Global key prefix prepended to every key before storage. Default: 'meridian'. */
  keyPrefix?: string;
  /** Default TTL in seconds when none is specified per operation. */
  defaultTtlSeconds?: number;
  /** Maximum number of connection retry attempts. Default: 5. */
  maxRetries?: number;
  /** Delay in ms between reconnection attempts. Default: 500. */
  retryDelayMs?: number;
}

const SCAN_COUNT = 100;

/**
 * Redis-backed cache provider built on ioredis.
 *
 * Responsibilities:
 *  - JSON serialization / deserialization of all values.
 *  - Namespace isolation via `{keyPrefix}:{namespace}:{key}` compound keys.
 *  - TTL delegation to Redis EXPIRE command.
 *  - Pattern-based key deletion via SCAN + DEL (avoids KEYS blocking).
 *  - Lazy connection: connect() must be called before first use.
 */
export class RedisCache implements CacheProvider {
  private client: Redis | null = null;
  private readonly options: Required<
    Omit<RedisCacheOptions, 'connection' | 'defaultTtlSeconds'>
  > & {
    connection: string | RedisOptions;
    defaultTtlSeconds: number | undefined;
  };

  constructor(options: RedisCacheOptions) {
    this.options = {
      connection: options.connection,
      keyPrefix: options.keyPrefix ?? 'meridian',
      defaultTtlSeconds: options.defaultTtlSeconds,
      maxRetries: options.maxRetries ?? 5,
      retryDelayMs: options.retryDelayMs ?? 500,
    };
  }

  // ---------------------------------------------------------------------------
  // Connection management
  // ---------------------------------------------------------------------------

  /**
   * Establish the Redis connection. Must be called before any cache operations.
   * Safe to call multiple times — subsequent calls are no-ops if already connected.
   */
  async connect(): Promise<void> {
    if (this.client !== null) return;

    const { connection, maxRetries, retryDelayMs } = this.options;

    const ioredisOptions: RedisOptions =
      typeof connection === 'string'
        ? {
            lazyConnect: true,
            enableReadyCheck: true,
            maxRetriesPerRequest: maxRetries,
            retryStrategy: (times: number) => {
              if (times > maxRetries) return null; // stop retrying
              return times * retryDelayMs;
            },
          }
        : {
            lazyConnect: true,
            enableReadyCheck: true,
            maxRetriesPerRequest: maxRetries,
            retryStrategy: (times: number) => {
              if (times > maxRetries) return null;
              return times * retryDelayMs;
            },
            ...connection,
          };

    try {
      if (typeof connection === 'string') {
        this.client = new Redis(connection, ioredisOptions);
      } else {
        this.client = new Redis(ioredisOptions);
      }

      // Register error handler to prevent unhandled-rejection crashes.
      this.client.on('error', (err: Error) => {
        logger.error('Redis client error', { message: err.message });
      });

      await this.client.connect();
      logger.info('Redis connected');
    } catch (err) {
      this.client = null;
      throw new CacheConnectionError('Failed to connect to Redis', {
        error: String(err),
      });
    }
  }

  /**
   * Gracefully close the Redis connection.
   */
  async disconnect(): Promise<void> {
    if (this.client === null) return;
    await this.client.quit();
    this.client = null;
    logger.info('Redis disconnected');
  }

  /**
   * Returns true if the client is connected and ready.
   */
  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private assertConnected(): Redis {
    if (this.client === null || this.client.status !== 'ready') {
      throw new CacheConnectionError(
        'Redis client is not connected. Call connect() first.',
      );
    }
    return this.client;
  }

  private buildKey(key: string, namespace?: string): string {
    const { keyPrefix } = this.options;
    if (namespace) {
      return `${keyPrefix}:${namespace}:${key}`;
    }
    return `${keyPrefix}:${key}`;
  }

  private buildNamespacePattern(namespace: string): string {
    return `${this.options.keyPrefix}:${namespace}:*`;
  }

  private buildAllPattern(): string {
    return `${this.options.keyPrefix}:*`;
  }

  private serialize<T>(value: T): string {
    try {
      return JSON.stringify(value);
    } catch (err) {
      throw new CacheSerializationError('Failed to serialize cache value', {
        error: String(err),
      });
    }
  }

  private deserialize<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      throw new CacheSerializationError('Failed to deserialize cache value', {
        raw,
        error: String(err),
      });
    }
  }

  private resolveTtl(ttlSeconds?: number): number | undefined {
    return ttlSeconds ?? this.options.defaultTtlSeconds;
  }

  // ---------------------------------------------------------------------------
  // CacheProvider implementation
  // ---------------------------------------------------------------------------

  async get<T>(key: string, namespace?: string): Promise<T | null> {
    const client = this.assertConnected();
    const fullKey = this.buildKey(key, namespace);

    try {
      const raw = await client.get(fullKey);
      if (raw === null) {
        logger.debug('cache miss', { key: fullKey });
        return null;
      }
      logger.debug('cache hit', { key: fullKey });
      return this.deserialize<T>(raw);
    } catch (err) {
      if (err instanceof CacheSerializationError) throw err;
      throw new CacheError(`Redis GET failed for key: ${fullKey}`, {
        error: String(err),
      });
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const client = this.assertConnected();
    const fullKey = this.buildKey(key, options?.namespace);
    const ttl = this.resolveTtl(options?.ttlSeconds);

    try {
      const serialized = this.serialize(value);
      if (ttl !== undefined && ttl > 0) {
        await client.set(fullKey, serialized, 'EX', ttl);
      } else {
        await client.set(fullKey, serialized);
      }
      logger.debug('cache set', { key: fullKey, ttl });
    } catch (err) {
      if (err instanceof CacheSerializationError) throw err;
      throw new CacheError(`Redis SET failed for key: ${fullKey}`, {
        error: String(err),
      });
    }
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const client = this.assertConnected();
    const fullKey = this.buildKey(key, namespace);

    try {
      const deleted = await client.del(fullKey);
      logger.debug('cache delete', { key: fullKey, deleted });
      return deleted > 0;
    } catch (err) {
      throw new CacheError(`Redis DEL failed for key: ${fullKey}`, {
        error: String(err),
      });
    }
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    const client = this.assertConnected();
    const fullKey = this.buildKey(key, namespace);

    try {
      const exists = await client.exists(fullKey);
      return exists > 0;
    } catch (err) {
      throw new CacheError(`Redis EXISTS failed for key: ${fullKey}`, {
        error: String(err),
      });
    }
  }

  async clear(namespace?: string): Promise<void> {
    const client = this.assertConnected();
    const pattern = namespace
      ? this.buildNamespacePattern(namespace)
      : this.buildAllPattern();

    await this.scanAndDelete(client, pattern);
    logger.debug('cache cleared', { namespace: namespace ?? '(all)' });
  }

  async keys(pattern?: string): Promise<string[]> {
    const client = this.assertConnected();
    const searchPattern = pattern
      ? `${this.options.keyPrefix}:${pattern}`
      : this.buildAllPattern();

    return this.scanKeys(client, searchPattern);
  }

  // ---------------------------------------------------------------------------
  // SCAN-based helpers (non-blocking alternative to KEYS)
  // ---------------------------------------------------------------------------

  private async scanKeys(client: Redis, pattern: string): Promise<string[]> {
    const collected: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        SCAN_COUNT,
      );
      cursor = nextCursor;
      collected.push(...keys);
    } while (cursor !== '0');

    return collected;
  }

  private async scanAndDelete(client: Redis, pattern: string): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        SCAN_COUNT,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  }
}
