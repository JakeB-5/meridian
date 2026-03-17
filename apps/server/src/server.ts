import { createApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Server entry point.
 * Creates the Fastify app and starts listening.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const { app, container } = await createApp({ config });
  const { logger } = container;

  // ── Start Listening ─────────────────────────────────────────────

  try {
    const address = await app.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    logger.info('Meridian API server started', {
      address,
      port: config.PORT,
      env: config.NODE_ENV,
      logLevel: config.LOG_LEVEL,
      corsOrigin: config.CORS_ORIGIN,
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }

  // ── Graceful Shutdown ───────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await app.close();
      logger.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    void shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
