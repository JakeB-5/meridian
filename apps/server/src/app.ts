import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { Logger } from '@meridian/shared';
import { loadConfig, parseCorsOrigins, type ServerConfig } from './config.js';
import { createContainerAsync, type ServiceContainer } from './services/container.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { registerRequestLogger } from './middleware/request-logger.js';
import { registerRateLimiter } from './middleware/rate-limiter.js';
import authPlugin from './plugins/auth.plugin.js';
import websocketPlugin from './plugins/websocket.plugin.js';
import { authRoutes } from './routes/auth.routes.js';
import { datasourceRoutes } from './routes/datasources.routes.js';
import { questionRoutes } from './routes/questions.routes.js';
import { dashboardRoutes } from './routes/dashboards.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { pluginRoutes } from './routes/plugins.routes.js';
import { embedRoutes } from './routes/embed.routes.js';

// ── App Factory Options ─────────────────────────────────────────────

export interface CreateAppOptions {
  /** Override config (useful for testing) */
  config?: ServerConfig;
  /** Override container (useful for testing) */
  container?: ServiceContainer;
  /** Override logger */
  logger?: Logger;
  /** Skip rate limiting (useful for testing) */
  skipRateLimit?: boolean;
  /** Skip WebSocket setup (useful for testing) */
  skipWebSocket?: boolean;
}

// ── App Factory ─────────────────────────────────────────────────────

/**
 * Create and configure a Fastify application instance.
 *
 * Registers all plugins, middleware, and routes.
 * Does NOT start listening -- call app.listen() separately.
 */
export async function createApp(options: CreateAppOptions = {}): Promise<{
  app: FastifyInstance;
  container: ServiceContainer;
}> {
  // Load configuration
  const config = options.config ?? loadConfig();

  // Create DI container
  const container = options.container ?? await createContainerAsync({
    config,
    logger: options.logger,
  });

  const { logger } = container;

  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our own logger
    trustProxy: config.TRUST_PROXY,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // ── Global Error Handler ──────────────────────────────────────────

  app.setErrorHandler(createErrorHandler(logger));

  // ── Request Logging ───────────────────────────────────────────────

  registerRequestLogger(app, logger);

  // ── CORS ──────────────────────────────────────────────────────────

  const corsOrigins = parseCorsOrigins(config.CORS_ORIGIN);
  await app.register(cors, {
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Embed-Token',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-Id',
    ],
    maxAge: 86400,
  });

  // ── Rate Limiting ─────────────────────────────────────────────────

  if (!options.skipRateLimit) {
    registerRateLimiter(app, config, logger);
  }

  // ── Auth Plugin ───────────────────────────────────────────────────

  await app.register(authPlugin, {
    tokenService: container.tokenService,
    publicPaths: [
      '/health',
      '/api/health',
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/refresh',
      '/api/embed/dashboard/:id',
      '/api/embed/question/:id',
      '/api/embed/question/:id/execute',
      '/api/embed/validate',
    ],
  });

  // ── WebSocket ─────────────────────────────────────────────────────

  if (!options.skipWebSocket) {
    await app.register(websocket);
    await app.register(websocketPlugin, {
      tokenService: container.tokenService,
      logger: logger.child({ component: 'websocket' }),
    });
  }

  // ── Health Check ──────────────────────────────────────────────────

  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      uptime: process.uptime(),
    });
  });

  app.get('/api/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      uptime: process.uptime(),
      services: {
        database: 'ok',
        redis: 'ok',
      },
    });
  });

  // ── API Routes ────────────────────────────────────────────────────

  await authRoutes(app, container);
  await datasourceRoutes(app, container);
  await questionRoutes(app, container);
  await dashboardRoutes(app, container);
  await userRoutes(app, container);
  await pluginRoutes(app, container);
  await embedRoutes(app, container);

  // ── Not Found Handler ─────────────────────────────────────────────

  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'ERR_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    });
  });

  // ── Graceful Shutdown Hook ────────────────────────────────────────

  app.addHook('onClose', async () => {
    logger.info('Server shutting down gracefully');
  });

  return { app, container };
}
