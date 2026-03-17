import type {
  FastifyRequest,
  FastifyReply,
  HookHandlerDoneFunction,
} from 'fastify';
import { RateLimitExceededError } from '../errors/auth-errors.js';

/** Configuration for a rate limiter window */
export interface RateLimitConfig {
  /** Time window in milliseconds — default 60_000 (1 minute) */
  windowMs?: number;
  /** Maximum requests allowed in the window — default 100 */
  maxRequests?: number;
  /**
   * Key extraction strategy.
   * - 'user'   : use authenticated user ID (falls back to IP if no user)
   * - 'ip'     : use client IP address
   * - 'both'   : apply separate limits for user and IP
   */
  keyStrategy?: 'user' | 'ip' | 'both';
  /** Optional Redis client for distributed rate limiting */
  redisClient?: RedisLike;
  /** Skip rate limiting for these IP addresses (e.g. internal health-checks) */
  skipIPs?: string[];
}

/** Minimal Redis interface — compatible with ioredis and other clients */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: 'PX', exMs: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
}

/** Per-window request count entry (in-memory store) */
interface CountEntry {
  count: number;
  resetAt: number; // Unix ms
}

/** Result of a rate limit check */
export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

const DEFAULT_CONFIG: Required<Omit<RateLimitConfig, 'redisClient' | 'skipIPs'>> = {
  windowMs: 60_000,
  maxRequests: 100,
  keyStrategy: 'user',
};

/**
 * In-memory rate limiter with optional Redis backing.
 *
 * When a Redis client is provided, counts are stored in Redis using the
 * pattern `ratelimit:<key>` with a TTL equal to the window.
 * Without Redis, counts live in a Map on the instance (single-process only).
 */
export class RateLimiter {
  private readonly config: Required<Omit<RateLimitConfig, 'redisClient' | 'skipIPs'>>;
  private readonly redis: RedisLike | undefined;
  /** In-memory fallback store */
  private readonly store = new Map<string, CountEntry>();

  constructor(config: RateLimitConfig = {}) {
    this.config = {
      windowMs: config.windowMs ?? DEFAULT_CONFIG.windowMs,
      maxRequests: config.maxRequests ?? DEFAULT_CONFIG.maxRequests,
      keyStrategy: config.keyStrategy ?? DEFAULT_CONFIG.keyStrategy,
    };
    this.redis = config.redisClient;
  }

  /** Check and increment the counter for a given identifier key */
  async check(key: string): Promise<RateLimitCheckResult> {
    if (this.redis) {
      return this.checkRedis(key);
    }
    return this.checkMemory(key);
  }

  private async checkRedis(key: string): Promise<RateLimitCheckResult> {
    const redisKey = `ratelimit:${key}`;
    const redis = this.redis!;

    const count = await redis.incr(redisKey);

    if (count === 1) {
      // First request in this window — set the TTL
      await redis.pexpire(redisKey, this.config.windowMs);
    }

    const ttlMs = await redis.pttl(redisKey);
    const resetAt = Date.now() + Math.max(ttlMs, 0);
    const remaining = Math.max(0, this.config.maxRequests - count);
    const allowed = count <= this.config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs: allowed ? 0 : Math.max(ttlMs, 0),
    };
  }

  private checkMemory(key: string): RateLimitCheckResult {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.config.windowMs };
      this.store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    const allowed = entry.count <= this.config.maxRequests;
    const retryAfterMs = allowed ? 0 : Math.max(0, entry.resetAt - now);

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
      retryAfterMs,
    };
  }

  /** Extract the rate-limit key from a Fastify request */
  extractKey(request: FastifyRequest): string {
    const ip = this.getClientIp(request);
    const userId = (request as FastifyRequest & { user?: { sub: string } }).user?.sub;

    switch (this.config.keyStrategy) {
      case 'ip':
        return `ip:${ip}`;
      case 'user':
        return userId ? `user:${userId}` : `ip:${ip}`;
      case 'both':
        // Returns composite key; caller may split or handle separately
        return userId ? `user:${userId}:ip:${ip}` : `ip:${ip}`;
    }
  }

  /** Get the client IP, respecting common proxy headers */
  private getClientIp(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim() ?? request.ip;
    }
    return request.ip ?? 'unknown';
  }

  /** Purge expired in-memory entries (call periodically to prevent memory leak) */
  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /** Reset the counter for a specific key (useful in tests) */
  reset(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  /** Return current store size (in-memory mode only) */
  get storeSize(): number {
    return this.store.size;
  }
}

/**
 * Create a Fastify preHandler hook that enforces rate limiting.
 *
 * Usage:
 *   fastify.addHook('preHandler', createRateLimitHook({ maxRequests: 60 }));
 *   // or per-route:
 *   fastify.post('/login', { preHandler: createRateLimitHook({ maxRequests: 5, windowMs: 60_000 }) }, handler);
 */
export function createRateLimitHook(
  config: RateLimitConfig = {},
): (
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) => Promise<void> {
  const limiter = new RateLimiter(config);
  const skipIPs = new Set(config.skipIPs ?? []);

  return async function rateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const clientIp =
      (typeof request.headers['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) ?? request.ip;

    if (skipIPs.has(clientIp ?? '')) return;

    const key = limiter.extractKey(request);
    const result = await limiter.check(key);

    // Always set rate limit headers
    void reply.header('X-RateLimit-Limit', String(config.maxRequests ?? DEFAULT_CONFIG.maxRequests));
    void reply.header('X-RateLimit-Remaining', String(result.remaining));
    void reply.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      void reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      const error = new RateLimitExceededError(key, result.retryAfterMs);
      await reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        retryAfterMs: result.retryAfterMs,
      });
    }
  };
}

/** Standalone rate limiter instance factory for service-layer use */
export function createRateLimiter(config: RateLimitConfig = {}): RateLimiter {
  return new RateLimiter(config);
}
