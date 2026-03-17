import type {
  FastifyPluginCallback,
  FastifyRequest,
  FastifyReply,
  FastifyInstance,
  HookHandlerDoneFunction,
} from 'fastify';
import type { Permission } from '@meridian/shared';
import type { TokenPayload } from '../jwt/token-service.js';
import { TokenService } from '../jwt/token-service.js';
import { PermissionChecker } from '../rbac/permission-checker.js';
import {
  TokenMissingError,
  TokenInvalidError,
  PermissionDeniedError,
} from '../errors/auth-errors.js';

/** Augment Fastify's request interface to carry the authenticated user */
declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export interface AuthMiddlewareOptions {
  tokenService: TokenService;
  /** Routes to skip authentication for (exact path match) */
  skipPaths?: string[];
  /** If true, missing tokens result in a 401 rather than being ignored */
  strict?: boolean;
}

/**
 * Extract the Bearer token from the Authorization header.
 * Returns undefined if the header is missing or malformed.
 */
function extractBearerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (!authHeader) return undefined;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return undefined;
  return parts[1];
}

/**
 * Fastify plugin that authenticates incoming requests by verifying
 * the Bearer JWT in the Authorization header and attaching the decoded
 * TokenPayload to `request.user`.
 *
 * Usage:
 *   fastify.register(createAuthPlugin, { tokenService });
 */
export function createAuthPlugin(
  options: AuthMiddlewareOptions,
): FastifyPluginCallback {
  const { tokenService, skipPaths = [], strict = false } = options;

  return function authPlugin(
    fastify: FastifyInstance,
    _opts: Record<string, unknown>,
    done: HookHandlerDoneFunction,
  ): void {
    fastify.decorateRequest('user', undefined);

    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        // Skip configured paths (e.g. /health, /login)
        if (skipPaths.includes(request.url)) return;

        const token = extractBearerToken(request);

        if (!token) {
          if (strict) {
            const error = new TokenMissingError();
            await reply.code(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          // Non-strict: allow the request through without a user
          return;
        }

        const result = await tokenService.verifyToken(token);
        if (!result.ok) {
          const error = result.error;
          const statusCode = 'statusCode' in error ? (error as { statusCode: number }).statusCode : 401;
          await reply.code(statusCode).send({
            error: 'code' in error ? (error as { code: string }).code : 'TOKEN_INVALID',
            message: error.message,
          });
          return;
        }

        request.user = result.value;
      },
    );

    done();
  };
}

/**
 * Convenience factory — wraps createAuthPlugin and registers it on the instance.
 */
export function createAuthMiddleware(tokenService: TokenService): FastifyPluginCallback {
  return createAuthPlugin({ tokenService, strict: false });
}

const permissionChecker = new PermissionChecker();

/**
 * Fastify preHandler factory that asserts the authenticated user holds
 * ALL of the specified permissions before the route handler runs.
 *
 * Usage:
 *   fastify.get('/secret', { preHandler: requirePermission('admin') }, handler);
 */
export function requirePermission(
  ...permissions: Permission[]
): (
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) => void {
  return function requirePermissionHandler(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    if (!request.user) {
      const error = new TokenMissingError();
      void reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    for (const permission of permissions) {
      if (!permissionChecker.hasPermission(request.user, permission)) {
        const error = new PermissionDeniedError(permission);
        void reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
        });
        return;
      }
    }

    done();
  };
}

/**
 * Fastify preHandler that asserts the authenticated user holds
 * AT LEAST ONE of the specified permissions.
 */
export function requireAnyPermission(
  ...permissions: Permission[]
): (
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) => void {
  return function requireAnyPermissionHandler(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    if (!request.user) {
      const error = new TokenMissingError();
      void reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (!permissionChecker.hasAnyPermission(request.user, permissions)) {
      const error = new PermissionDeniedError(permissions.join(' | '));
      void reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    done();
  };
}

/**
 * Fastify preHandler that blocks unauthenticated requests.
 * Use this on routes that require login but no specific permission.
 */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (!request.user) {
    const error = new TokenMissingError();
    void reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
    return;
  }
  done();
}

export { TokenMissingError, TokenInvalidError, PermissionDeniedError };
