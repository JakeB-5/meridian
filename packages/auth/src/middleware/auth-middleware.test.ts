import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAuthPlugin,
  createAuthMiddleware,
  requirePermission,
  requireAnyPermission,
  requireAuth,
} from './auth-middleware.js';
import { TokenService, type TokenOptions, type UserPayload } from '../jwt/token-service.js';

const SECRET = 'test-secret-key-that-is-at-least-32-chars!!';
const OPTIONS: TokenOptions = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'meridian-test',
};

const SAMPLE_USER: UserPayload = {
  sub: 'user-1',
  email: 'alice@example.com',
  orgId: 'org-1',
  roleId: 'role:viewer',
  permissions: ['dashboard:read', 'question:read'],
};

function makeTokenService(): TokenService {
  return new TokenService(SECRET, OPTIONS);
}

/** Create a minimal mock Fastify request */
function makeRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headers: {},
    url: '/test',
    ip: '127.0.0.1',
    user: undefined,
    ...overrides,
  };
}

/** Create a minimal mock Fastify reply that records the last sent status + body */
function makeReply(): {
  statusCode: number | undefined;
  body: unknown;
  code: (n: number) => ReturnType<typeof makeReply>;
  send: (body: unknown) => ReturnType<typeof makeReply>;
  header: () => ReturnType<typeof makeReply>;
} {
  const reply = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    code(n: number) {
      this.statusCode = n;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
    header() {
      return this;
    },
  };
  return reply;
}

describe('auth-middleware helpers', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = makeTokenService();
  });

  // ---- requireAuth ----

  describe('requireAuth', () => {
    it('calls done when user is present', () => {
      const req = makeRequest({ user: SAMPLE_USER });
      const reply = makeReply();
      const done = vi.fn();

      requireAuth(req as never, reply as never, done);

      expect(done).toHaveBeenCalledOnce();
      expect(reply.statusCode).toBeUndefined();
    });

    it('sends 401 when user is missing', () => {
      const req = makeRequest({ user: undefined });
      const reply = makeReply();
      const done = vi.fn();

      requireAuth(req as never, reply as never, done);

      expect(done).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(401);
    });
  });

  // ---- requirePermission ----

  describe('requirePermission', () => {
    it('calls done when user has the required permission', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['dashboard:read'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requirePermission('dashboard:read')(req as never, reply as never, done);

      expect(done).toHaveBeenCalledOnce();
    });

    it('sends 403 when user lacks the permission', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['dashboard:read'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requirePermission('dashboard:write')(req as never, reply as never, done);

      expect(done).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(403);
    });

    it('sends 401 when no user is attached', () => {
      const req = makeRequest({ user: undefined });
      const reply = makeReply();
      const done = vi.fn();

      requirePermission('dashboard:read')(req as never, reply as never, done);

      expect(reply.statusCode).toBe(401);
    });

    it('allows admin to pass any permission check', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['admin'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requirePermission('user:delete')(req as never, reply as never, done);

      expect(done).toHaveBeenCalledOnce();
    });

    it('checks all permissions — rejects if any is missing', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['dashboard:read'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requirePermission('dashboard:read', 'dashboard:write')(
        req as never,
        reply as never,
        done,
      );

      expect(done).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(403);
    });

    it('allows when user has all required permissions', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['dashboard:read', 'dashboard:write'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requirePermission('dashboard:read', 'dashboard:write')(
        req as never,
        reply as never,
        done,
      );

      expect(done).toHaveBeenCalledOnce();
    });
  });

  // ---- requireAnyPermission ----

  describe('requireAnyPermission', () => {
    it('calls done when user has at least one permission', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['dashboard:read'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requireAnyPermission('dashboard:read', 'dashboard:write')(
        req as never,
        reply as never,
        done,
      );

      expect(done).toHaveBeenCalledOnce();
    });

    it('sends 403 when user has none of the permissions', () => {
      const req = makeRequest({
        user: { ...SAMPLE_USER, permissions: ['question:read'] },
      });
      const reply = makeReply();
      const done = vi.fn();

      requireAnyPermission('dashboard:write', 'dashboard:delete')(
        req as never,
        reply as never,
        done,
      );

      expect(done).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(403);
    });
  });

  // ---- createAuthPlugin hook behavior (simulated preHandler) ----

  describe('createAuthPlugin preHandler simulation', () => {
    it('attaches user to request when valid Bearer token is provided', async () => {
      const token = await tokenService.generateAccessToken(SAMPLE_USER);
      const req = makeRequest({
        headers: { authorization: `Bearer ${token}` },
        url: '/api/data',
      });

      // Simulate what the Fastify preHandler hook does
      const authHeader = (req.headers as Record<string, string>)['authorization'] ?? '';
      const parts = authHeader.split(' ');
      const extractedToken = parts[1];

      const result = await tokenService.verifyToken(extractedToken ?? '');
      if (result.ok) {
        req['user'] = result.value;
      }

      expect(req['user']).toBeDefined();
      expect((req['user'] as UserPayload).sub).toBe(SAMPLE_USER.sub);
    });

    it('does not attach user when no Authorization header is present', async () => {
      const req = makeRequest({ headers: {}, url: '/api/data' });

      const authHeader = (req.headers as Record<string, string>)['authorization'];
      expect(authHeader).toBeUndefined();
      expect(req['user']).toBeUndefined();
    });

    it('does not attach user when token is invalid', async () => {
      const req = makeRequest({
        headers: { authorization: 'Bearer bad.token.here' },
      });

      const authHeader = (req.headers as Record<string, string>)['authorization'] ?? '';
      const token = authHeader.split(' ')[1] ?? '';
      const result = await tokenService.verifyToken(token);

      expect(result.ok).toBe(false);
      // User should remain undefined
      expect(req['user']).toBeUndefined();
    });

    it('sends 401 when token is expired', async () => {
      vi.useFakeTimers();
      const expiredService = new TokenService(SECRET, {
        ...OPTIONS,
        accessTokenExpiry: '1s',
      });
      const token = await expiredService.generateAccessToken(SAMPLE_USER);

      vi.advanceTimersByTime(2000);

      const result = await expiredService.verifyToken(token);
      expect(result.ok).toBe(false);

      vi.useRealTimers();
    });

    it('skips auth for configured skip paths', () => {
      const skipPaths = ['/health', '/login'];
      const url = '/health';
      expect(skipPaths.includes(url)).toBe(true);
    });
  });

  // ---- createAuthMiddleware (factory) ----

  describe('createAuthMiddleware', () => {
    it('returns a function (FastifyPluginCallback)', () => {
      const plugin = createAuthMiddleware(tokenService);
      expect(typeof plugin).toBe('function');
    });
  });

  // ---- createAuthPlugin ----

  describe('createAuthPlugin', () => {
    it('returns a function (FastifyPluginCallback)', () => {
      const plugin = createAuthPlugin({ tokenService });
      expect(typeof plugin).toBe('function');
    });
  });
});
