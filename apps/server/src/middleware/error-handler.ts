import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { MeridianError } from '@meridian/shared';
import { ZodError } from 'zod';
import type { Logger } from '@meridian/shared';

// ── Error Response Shape ────────────────────────────────────────────

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
}

// ── Zod Error Formatting ────────────────────────────────────────────

function formatZodError(error: ZodError): { code: string; message: string; details: Record<string, unknown> } {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }

  return {
    code: 'ERR_VALIDATION',
    message: 'Request validation failed',
    details: { fields: fieldErrors },
  };
}

// ── Auth Error Detection ────────────────────────────────────────────

/**
 * Detect auth-package errors by duck-typing (avoids deep imports).
 * Auth errors have: name, code, statusCode properties, and extend Error.
 */
function isAuthError(error: unknown): error is { code: string; statusCode: number; message: string } {
  if (!(error instanceof Error)) return false;
  const e = error as Record<string, unknown>;
  return typeof e['code'] === 'string' && typeof e['statusCode'] === 'number' && (
    e['name'] === 'AuthError' ||
    e['name'] === 'TokenExpiredError' ||
    e['name'] === 'TokenInvalidError' ||
    e['name'] === 'TokenMissingError' ||
    e['name'] === 'PermissionDeniedError' ||
    e['name'] === 'OrganizationAccessDeniedError' ||
    e['name'] === 'PasswordWeakError'
  );
}

// ── Error Handler Factory ───────────────────────────────────────────

/**
 * Create a Fastify error handler that maps domain errors to HTTP responses.
 *
 * Error mapping:
 * - MeridianError -> uses the error's own statusCode and code
 * - Auth errors -> uses the auth error's own statusCode and code
 * - ZodError -> 400 with field-level details
 * - Fastify validation error -> 400
 * - Unknown errors -> 500 with generic message (details logged server-side)
 */
export function createErrorHandler(logger: Logger) {
  return function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const requestId = request.id;

    // ── MeridianError (domain errors) ─────────────────────────────
    if (error instanceof MeridianError) {
      const response: ErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          details: error.details,
          timestamp: error.timestamp.toISOString(),
          requestId,
        },
      };

      if (error.statusCode >= 500) {
        logger.error('Server error', {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          requestId,
          path: request.url,
          method: request.method,
        });
      } else {
        logger.debug('Client error', {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          requestId,
        });
      }

      void reply.status(error.statusCode).send(response);
      return;
    }

    // ── Auth errors (duck-typed) ──────────────────────────────────
    if (isAuthError(error)) {
      const response: ErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      logger.debug('Auth error', {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        requestId,
      });

      void reply.status(error.statusCode).send(response);
      return;
    }

    // ── ZodError (schema validation) ──────────────────────────────
    if (error instanceof ZodError) {
      const formatted = formatZodError(error);
      const response: ErrorResponse = {
        error: {
          code: formatted.code,
          message: formatted.message,
          statusCode: 400,
          details: formatted.details,
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      logger.debug('Validation error', {
        code: formatted.code,
        fields: formatted.details,
        requestId,
      });

      void reply.status(400).send(response);
      return;
    }

    // ── Fastify validation error ──────────────────────────────────
    if ('validation' in error && (error as FastifyError).validation) {
      const fastifyErr = error as FastifyError;
      const response: ErrorResponse = {
        error: {
          code: 'ERR_VALIDATION',
          message: fastifyErr.message,
          statusCode: 400,
          details: {
            validation: fastifyErr.validation,
            validationContext: (fastifyErr as Record<string, unknown>)['validationContext'],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      void reply.status(400).send(response);
      return;
    }

    // ── Fastify known status code errors ──────────────────────────
    if ('statusCode' in error && typeof (error as FastifyError).statusCode === 'number') {
      const statusCode = (error as FastifyError).statusCode ?? 500;
      const response: ErrorResponse = {
        error: {
          code: (error as FastifyError).code ?? 'ERR_HTTP',
          message: error.message,
          statusCode,
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      if (statusCode >= 500) {
        logger.error('HTTP server error', {
          message: error.message,
          statusCode,
          stack: error.stack,
          requestId,
          path: request.url,
          method: request.method,
        });
      }

      void reply.status(statusCode).send(response);
      return;
    }

    // ── Unknown / unexpected errors ───────────────────────────────
    logger.error('Unexpected error', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      requestId,
      path: request.url,
      method: request.method,
    });

    const response: ErrorResponse = {
      error: {
        code: 'ERR_INTERNAL',
        message: 'An unexpected error occurred',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    void reply.status(500).send(response);
  };
}
