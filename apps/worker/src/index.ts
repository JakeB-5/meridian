// Entry point for @meridian/worker
// Loads config and starts the background job processor.

import { loadConfig } from './config.js';
import { startWorker } from './worker.js';
import { createLogger } from '@meridian/shared';

const logger = createLogger('@meridian/worker');

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    logger.error('Failed to load worker configuration', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  try {
    await startWorker(config);
  } catch (error) {
    logger.error('Worker startup failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
