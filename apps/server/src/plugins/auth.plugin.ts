import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { Permission } from '@meridian/shared';
import { AuthenticationError, AuthorizationError } from '@meridian/shared';
import type { TokenServiceLike, TokenPayload } from '../services/container.js';

// ── Augment Fastify Types ───────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user payload from JWT */
    user: TokenPayload | null;
  }

  interface FastifyInstance {
    requireAuth: (
      request: FastifyRequest,
      reply: FastifyReply,
      done: (err?: Error) => void,
    ) => void;
    requirePermission: (
      ...permissions: Permission[]
    ) => (
      request: FastifyRequest,
      reply: FastifyReply,
      done: (err?: Error) => void,
    ) => void;
  }
}

// ── Plugin Options ──────────────────────────────────────────────────

export interface AuthPluginOptions {
  tokenService: TokenServiceLike;
  /** Paths that skip authentication entirely */
  publicPaths?: string[];
}

// ── Auth Plugin ─────────────────────────────────────────────────────

/**
 * Fastify plugin that decorates requests with authenticated user info.
 *
 * - Parses Bearer token from Authorization header
 * - Verifies JWT signature and expiry
 * - Decorates request.user with the token payload
 * - Provides requireAuth and requirePermission preHandler hooks
 */
async function authPlugin(app: FastifyInstance, options: AuthPluginOptions): Promise<void> {
  const { tokenService, publicPaths = [] } = options;

  const publicPathSet = new Set(publicPaths);

  // Decorate request with user = null by default
  app.decorateRequest('user', null);

  // Parse and verify JWT on every request (non-blocking)
  app.addHook('onRequest', async (request: FastifyRequest) => {
    // Reset user for each request
    request.user = null;

    const authHeader = request.headers.authorization;
    if (!authHeader) return;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return;

    const token = parts[1]!;
    const result = await tokenService.verifyToken(token);

    if (result.ok) {
      request.user = result.value;
    }
  });

  // ── Hook Factories ──────────────────────────────────────────────

  app.decorate('requireAuth', function requireAuth(
    request: FastifyRequest,
    _reply: FastifyReply,
    done: (err?: Error) => void,
  ): void {
    if (publicPathSet.has(request.routeOptions.url ?? request.url)) {
      done();
      return;
    }

    if (!request.user) {
      done(new AuthenticationError('Authentication required'));
      return;
    }

    done();
  });

  app.decorate('requirePermission', function requirePermission(
    ...permissions: Permission[]
  ) {
    return function permissionHook(
      request: FastifyRequest,
      _reply: FastifyReply,
      done: (err?: Error) => void,
    ): void {
      if (!request.user) {
        done(new AuthenticationError('Authentication required'));
        return;
      }

      const userPermissions = request.user.permissions;

      // Admin has all permissions
      if (userPermissions.includes('admin')) {
        done();
        return;
      }

      const hasPermission = permissions.some((p) => userPermissions.includes(p));
      if (!hasPermission) {
        done(
          new AuthorizationError(
            `Insufficient permissions. Required: ${permissions.join(' or ')}`,
          ),
        );
        return;
      }

      done();
    };
  });
}

export default fp(authPlugin, {
  name: 'meridian-auth',
  fastify: '5.x',
});
