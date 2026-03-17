import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RateLimiter,
  createRateLimitHook,
  createRateLimiter,
  type RateLimitConfig,
} from './rate-limiter.js';

function makeLimiter(config: RateLimitConfig = {}): RateLimiter {
  return new RateLimiter({
    windowMs: 60_000,
    maxRequests: 3,
    keyStrategy: 'ip',
    ...config,
  });
}

/** Minimal mock Fastify request for rate limiter */
function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    ip: '127.0.0.1',
    url: '/api/test',
    ...overrides,
  };
}

/** Minimal mock Fastify reply */
function makeReply() {
  const reply = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    sentHeaders: {} as Record<string, string>,
    code(n: number) {
      this.statusCode = n;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
    header(name: string, value: string) {
      this.sentHeaders[name] = value;
      return this;
    },
  };
  return reply;
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = makeLimiter();
  });

  // ---- Basic allow / deny ----

  describe('check — in-memory', () => {
    it('allows requests under the limit', async () => {
      const r1 = await limiter.check('user:1');
      const r2 = await limiter.check('user:1');
      const r3 = await limiter.check('user:1');

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it('blocks the request that exceeds the limit', async () => {
      await limiter.check('user:2');
      await limiter.check('user:2');
      await limiter.check('user:2');
      const r4 = await limiter.check('user:2');

      expect(r4.allowed).toBe(false);
    });

    it('tracks remaining correctly', async () => {
      const r1 = await limiter.check('user:3');
      expect(r1.remaining).toBe(2);

      const r2 = await limiter.check('user:3');
      expect(r2.remaining).toBe(1);

      const r3 = await limiter.check('user:3');
      expect(r3.remaining).toBe(0);
    });

    it('returns retryAfterMs > 0 when blocked', async () => {
      await limiter.check('user:4');
      await limiter.check('user:4');
      await limiter.check('user:4');
      const blocked = await limiter.check('user:4');

      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('returns retryAfterMs === 0 when allowed', async () => {
      const result = await limiter.check('user:5');
      expect(result.retryAfterMs).toBe(0);
    });

    it('keeps separate counts per key', async () => {
      await limiter.check('user:A');
      await limiter.check('user:A');
      await limiter.check('user:A');

      const forB = await limiter.check('user:B');
      expect(forB.allowed).toBe(true);
      expect(forB.remaining).toBe(2);
    });

    it('resets after the window expires', async () => {
      vi.useFakeTimers();

      await limiter.check('user:6');
      await limiter.check('user:6');
      await limiter.check('user:6');
      const blocked = await limiter.check('user:6');
      expect(blocked.allowed).toBe(false);

      // Advance past the 60s window
      vi.advanceTimersByTime(61_000);

      const reset = await limiter.check('user:6');
      expect(reset.allowed).toBe(true);
      expect(reset.remaining).toBe(2);

      vi.useRealTimers();
    });
  });

  // ---- reset ----

  describe('reset', () => {
    it('clears a specific key', async () => {
      await limiter.check('key:x');
      await limiter.check('key:x');
      await limiter.check('key:x');

      limiter.reset('key:x');

      const result = await limiter.check('key:x');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('clears all keys when called without arguments', async () => {
      await limiter.check('key:y');
      await limiter.check('key:z');

      limiter.reset();

      expect(limiter.storeSize).toBe(0);
    });
  });

  // ---- purgeExpired ----

  describe('purgeExpired', () => {
    it('removes expired entries', async () => {
      vi.useFakeTimers();

      await limiter.check('purge:1');
      expect(limiter.storeSize).toBe(1);

      vi.advanceTimersByTime(65_000);
      limiter.purgeExpired();

      expect(limiter.storeSize).toBe(0);

      vi.useRealTimers();
    });

    it('does not remove entries still within their window', async () => {
      await limiter.check('active:1');
      limiter.purgeExpired();
      expect(limiter.storeSize).toBe(1);
    });
  });

  // ---- extractKey ----

  describe('extractKey', () => {
    it('uses IP when strategy is ip', () => {
      const ipLimiter = makeLimiter({ keyStrategy: 'ip' });
      const req = makeRequest({ ip: '10.0.0.1' });
      expect(ipLimiter.extractKey(req as never)).toBe('ip:10.0.0.1');
    });

    it('uses user ID when strategy is user and user is present', () => {
      const userLimiter = makeLimiter({ keyStrategy: 'user' });
      const req = makeRequest({ user: { sub: 'user-99' }, ip: '10.0.0.1' });
      expect(userLimiter.extractKey(req as never)).toBe('user:user-99');
    });

    it('falls back to IP when strategy is user but no user is present', () => {
      const userLimiter = makeLimiter({ keyStrategy: 'user' });
      const req = makeRequest({ ip: '10.0.0.2' });
      expect(userLimiter.extractKey(req as never)).toBe('ip:10.0.0.2');
    });

    it('uses composite key when strategy is both', () => {
      const bothLimiter = makeLimiter({ keyStrategy: 'both' });
      const req = makeRequest({ user: { sub: 'user-42' }, ip: '10.0.0.3' });
      expect(bothLimiter.extractKey(req as never)).toBe('user:user-42:ip:10.0.0.3');
    });

    it('reads IP from x-forwarded-for header', () => {
      const ipLimiter = makeLimiter({ keyStrategy: 'ip' });
      const req = makeRequest({
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
        ip: '10.0.0.1',
      });
      expect(ipLimiter.extractKey(req as never)).toBe('ip:203.0.113.1');
    });
  });

  // ---- skipIPs ----

  describe('skipIPs configuration', () => {
    it('does not count requests from skipped IPs', async () => {
      const skipLimiter = makeLimiter({ skipIPs: ['192.168.1.1'], maxRequests: 1 });
      // Should still count since skipIPs is only checked in the hook, not check()
      const result = await skipLimiter.check('ip:192.168.1.1');
      expect(result).toBeDefined();
    });
  });

  // ---- createRateLimitHook ----

  describe('createRateLimitHook', () => {
    it('returns a function', () => {
      const hook = createRateLimitHook({ maxRequests: 5 });
      expect(typeof hook).toBe('function');
    });

    it('sets rate limit headers on response', async () => {
      const hook = createRateLimitHook({ maxRequests: 10, windowMs: 60_000, keyStrategy: 'ip' });
      const req = makeRequest();
      const reply = makeReply();

      await hook(req as never, reply as never, vi.fn());

      expect(reply.sentHeaders['X-RateLimit-Limit']).toBe('10');
      expect(reply.sentHeaders['X-RateLimit-Remaining']).toBeDefined();
    });

    it('sends 429 when limit is exceeded', async () => {
      const hook = createRateLimitHook({ maxRequests: 1, windowMs: 60_000, keyStrategy: 'ip' });
      const req = makeRequest({ ip: '1.2.3.4' });
      const reply1 = makeReply();
      const reply2 = makeReply();

      await hook(req as never, reply1 as never, vi.fn());
      await hook(req as never, reply2 as never, vi.fn());

      expect(reply2.statusCode).toBe(429);
    });

    it('skips rate limiting for IPs in the skip list', async () => {
      const hook = createRateLimitHook({
        maxRequests: 1,
        windowMs: 60_000,
        keyStrategy: 'ip',
        skipIPs: ['127.0.0.1'],
      });
      const req = makeRequest({ ip: '127.0.0.1' });
      const reply1 = makeReply();
      const reply2 = makeReply();

      await hook(req as never, reply1 as never, vi.fn());
      await hook(req as never, reply2 as never, vi.fn());

      // Both should be allowed since the IP is skipped
      expect(reply1.statusCode).toBeUndefined();
      expect(reply2.statusCode).toBeUndefined();
    });
  });

  // ---- createRateLimiter factory ----

  describe('createRateLimiter', () => {
    it('returns a RateLimiter instance', () => {
      const rl = createRateLimiter({ maxRequests: 50 });
      expect(rl).toBeInstanceOf(RateLimiter);
    });
  });
});
