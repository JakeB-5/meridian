// Main worker: creates the JobRegistry, registers all handlers,
// starts the BullMQ worker, and sets up graceful shutdown.

import { JobRegistry, createWorker } from '@meridian/scheduler';
import { createLogger } from '@meridian/shared';
import type { WorkerConfig } from './config.js';
import { buildCache, registerHandlers } from './handlers/index.js';
import { createHealthServer } from './health.js';

const logger = createLogger('@meridian/worker:main');

// ---------------------------------------------------------------------------
// startWorker
// ---------------------------------------------------------------------------

/**
 * Initialize and start the background worker.
 *
 * Lifecycle:
 * 1. Build shared cache (MemoryCache + Redis)
 * 2. Create JobRegistry and register all handlers
 * 3. Create BullMQ Worker connected to Redis
 * 4. Start HTTP health check server
 * 5. Register SIGTERM / SIGINT shutdown hooks
 */
export async function startWorker(config: WorkerConfig): Promise<void> {
  logger.info('Initializing Meridian background worker', {
    queueName: config.queueName,
    concurrency: config.concurrency,
    healthPort: config.healthPort,
  });

  // Build shared cache
  const cache = buildCache(config);

  // Build job registry and register handlers
  const registry = new JobRegistry();
  registerHandlers(registry, config, cache);

  logger.info('Registered job handlers', {
    handlers: registry.listRegistered(),
  });

  // Create BullMQ worker
  const worker = createWorker(config.queueName, config.redisUrl, registry);

  // Start health check HTTP server
  const healthServer = createHealthServer(config.healthPort, worker);
  await healthServer.start();

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Received shutdown signal', { signal });
    logger.info('Waiting for active jobs to complete...');

    try {
      // Close the BullMQ worker — waits for active jobs to finish
      await worker.close();
      logger.info('BullMQ worker closed');

      // Stop health server
      await healthServer.stop();
      logger.info('Health server stopped');

      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors so the process doesn't crash silently
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    // Don't exit on unhandled rejections — log and continue
  });

  logger.info('Worker is ready and processing jobs', {
    queue: config.queueName,
    concurrency: config.concurrency,
  });
}
