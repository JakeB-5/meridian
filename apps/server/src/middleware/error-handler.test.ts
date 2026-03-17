import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  MeridianError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ConnectionError,
  createNoopLogger,
} from '@meridian/shared';
import { ZodError } from 'zod';
import { createErrorHandler, type ErrorResponse } from './error-handler.js';

// ── Test Setup ──────────────────────────────────────────────────────

let app: FastifyInstance;
const logger = createNoopLogger();

beforeEach(async () => {
  app = Fastify({ logger: false });
  app.setErrorHandler(createErrorHandler(logger));
});

// ── Helper ──────────────────────────────────────────────────────────

function parseErrorResponse(payload: string): ErrorResponse {
  return JSON.parse(payload) as ErrorResponse;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Error Handler', () => {
  describe('MeridianError handling', () => {
    it('should handle NotFoundError with 404', async () => {
      app.get('/test', async () => {
        throw new NotFoundError('User', 'abc123');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(404);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_NOT_FOUND');
      expect(body.error.message).toContain('abc123');
      expect(body.error.statusCode).toBe(404);
      expect(body.error.timestamp).toBeDefined();
    });

    it('should handle ValidationError with 400', async () => {
      app.get('/test', async () => {
        throw new ValidationError('Name is required');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(400);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_VALIDATION');
      expect(body.error.message).toBe('Name is required');
    });

    it('should handle AuthenticationError with 401', async () => {
      app.get('/test', async () => {
        throw new AuthenticationError('Invalid credentials');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(401);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_AUTHENTICATION');
    });

    it('should handle AuthorizationError with 403', async () => {
      app.get('/test', async () => {
        throw new AuthorizationError('Insufficient permissions');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(403);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_AUTHORIZATION');
    });

    it('should handle ConflictError with 409', async () => {
      app.get('/test', async () => {
        throw new ConflictError('Resource already exists');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(409);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_CONFLICT');
    });

    it('should handle ConnectionError with 503', async () => {
      app.get('/test', async () => {
        throw new ConnectionError('Database unreachable');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(503);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_CONNECTION');
    });

    it('should include error details when provided', async () => {
      app.get('/test', async () => {
        throw new ValidationError('Invalid input', { fields: ['name', 'email'] });
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = parseErrorResponse(response.payload);
      expect(body.error.details).toEqual({ fields: ['name', 'email'] });
    });
  });

  describe('ZodError handling', () => {
    it('should handle ZodError with 400 and field details', async () => {
      app.get('/test', async () => {
        throw new ZodError([
          {
            code: 'too_small',
            minimum: 1,
            type: 'string',
            inclusive: true,
            exact: false,
            message: 'Name is required',
            path: ['name'],
          },
          {
            code: 'invalid_type',
            expected: 'string',
            received: 'number',
            message: 'Expected string, received number',
            path: ['email'],
          },
        ]);
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(400);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_VALIDATION');
      expect(body.error.message).toBe('Request validation failed');
      expect(body.error.details).toBeDefined();
      expect((body.error.details as Record<string, unknown>).fields).toBeDefined();
    });
  });

  describe('Unknown error handling', () => {
    it('should handle unknown errors with 500', async () => {
      app.get('/test', async () => {
        throw new Error('Something went wrong');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(500);

      const body = parseErrorResponse(response.payload);
      expect(body.error.code).toBe('ERR_INTERNAL');
      expect(body.error.message).toBe('An unexpected error occurred');
      // Should not leak internal error message
      expect(body.error.message).not.toContain('Something went wrong');
    });

    it('should include requestId in error responses', async () => {
      app.get('/test', async () => {
        throw new NotFoundError('Item');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-request-id': 'req-123' },
      });

      const body = parseErrorResponse(response.payload);
      expect(body.error.requestId).toBeDefined();
    });
  });

  describe('Response structure', () => {
    it('should always return a consistent error envelope', async () => {
      app.get('/test', async () => {
        throw new NotFoundError('Widget');
      });

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = parseErrorResponse(response.payload);

      // Verify all required fields are present
      expect(body.error).toBeDefined();
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
      expect(typeof body.error.statusCode).toBe('number');
      expect(typeof body.error.timestamp).toBe('string');
    });
  });
});
