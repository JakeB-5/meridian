import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config.js';
import type { Logger } from '@meridian/shared';

// ── In-memory Rate Limiter ──────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter.
 * For production, replace with Redis-backed @fastify/rate-limit.
 */
export class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly max: number;
  private readonly windowMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /**
   * Check if a key is rate limited.
   * Returns remaining requests, or -1 if limited.
   */
  consume(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.store.set(key, entry);
    }

    entry.count++;

    if (entry.count > this.max) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return {
      allowed: true,
      remaining: this.max - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Start periodic cleanup of expired entries.
   */
  startCleanup(intervalMs: number = 60_000): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.resetAt <= now) {
          this.store.delete(key);
        }
      }
    }, intervalMs);

    // Allow Node to exit without waiting for this interval
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval.
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.store.clear();
  }
}

// ── Fastify Rate Limit Hook ─────────────────────────────────────────

/**
 * Register rate limiting as a Fastify hook.
 * Uses client IP as the rate limit key.
 */
export function registerRateLimiter(
  app: FastifyInstance,
  config: ServerConfig,
  logger: Logger,
): RateLimiter {
  const limiter = new RateLimiter(config.RATE_LIMIT_MAX, config.RATE_LIMIT_WINDOW_MS);
  limiter.startCleanup();

  app.addHook('onRequest', async (request, reply) => {
    // Skip rate limiting for health checks
    if (request.url === '/health' || request.url === '/api/health') {
      return;
    }

    const key = request.ip;
    const result = limiter.consume(key);

    // Set rate limit headers
    void reply.header('X-RateLimit-Limit', config.RATE_LIMIT_MAX);
    void reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
    void reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
      void reply.header('Retry-After', retryAfterSec);

      logger.warn('Rate limit exceeded', {
        ip: key,
        requestId: request.id,
        path: request.url,
      });

      void reply.status(429).send({
        error: {
          code: 'ERR_RATE_LIMIT',
          message: 'Too many requests. Please try again later.',
          statusCode: 429,
          details: { retryAfterSeconds: retryAfterSec },
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      });
    }
  });

  // Cleanup on server close
  app.addHook('onClose', async () => {
    limiter.stopCleanup();
  });

  return limiter;
}
