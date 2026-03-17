// Register all job handlers with the JobRegistry.

import type { JobRegistry } from '@meridian/scheduler';
import { MultiLayerCache, MemoryCache, RedisCache } from '@meridian/cache';
import type { WorkerConfig } from '../config.js';
import { QueryRefreshHandler } from './query-refresh.handler.js';
import { DashboardRefreshHandler } from './dashboard-refresh.handler.js';
import { ExportCsvHandler } from './export-csv.handler.js';
import { ExportPdfHandler } from './export-pdf.handler.js';
import { CacheCleanupHandler } from './cache-cleanup.handler.js';
import { DatasourceHealthHandler } from './datasource-health.handler.js';

/**
 * Build the shared MultiLayerCache instance used across handlers.
 * Uses in-memory L1 + Redis L2 when REDIS_URL is set.
 */
export function buildCache(config: WorkerConfig): MultiLayerCache {
  const memCache = new MemoryCache({ maxSize: 500, defaultTtlSeconds: 300 });
  const redisCache = new RedisCache({ url: config.redisUrl });
  return new MultiLayerCache([memCache, redisCache]);
}

/**
 * Register all job handler implementations with the registry.
 * Called once at worker startup before the BullMQ worker begins processing.
 */
export function registerHandlers(
  registry: JobRegistry,
  config: WorkerConfig,
  cache: MultiLayerCache,
): void {
  registry.register('query_refresh', new QueryRefreshHandler(config, cache));
  registry.register('dashboard_refresh', new DashboardRefreshHandler(config, cache));
  registry.register('export_csv', new ExportCsvHandler(config));
  registry.register('export_pdf', new ExportPdfHandler(config));
  registry.register('cache_cleanup', new CacheCleanupHandler(config, cache));
  registry.register('health_check', new DatasourceHealthHandler(config));
}
