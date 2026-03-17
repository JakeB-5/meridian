import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from '@meridian/shared';

// ── Request Logger Plugin ───────────────────────────────────────────

/**
 * Request/response logging middleware using pino.
 * Logs request start, completion with timing, and errors.
 */
export function registerRequestLogger(app: FastifyInstance, logger: Logger): void {
  // Log incoming requests
  app.addHook('onRequest', async (request: FastifyRequest) => {
    logger.info('Incoming request', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });

  // Log response completion with timing
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = reply.elapsedTime;
    const statusCode = reply.statusCode;

    const logData = {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode,
      responseTimeMs: Math.round(responseTime * 100) / 100,
    };

    if (statusCode >= 500) {
      logger.error('Request completed with server error', logData);
    } else if (statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  // Log request errors
  app.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
    logger.error('Request error', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack,
    });
  });
}
