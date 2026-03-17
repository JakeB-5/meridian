// ── @meridian/scheduler ─────────────────────────────────────────────────────
// Job scheduling system for periodic data refresh, cache cleanup, and
// datasource health checks.

// Types
export type {
  JobType,
  JobDefinition,
  JobOptions,
  JobStatus,
  RecurringJobEntry,
} from './types.js';

// Errors
export {
  JobNotFoundError,
  HandlerNotRegisteredError,
  InvalidCronError,
  SchedulerError,
} from './errors.js';

// Core
export { Scheduler } from './scheduler.js';
export { JobRegistry } from './job-registry.js';
export type { JobHandler } from './job-registry.js';

// Cron
export {
  parseCron,
  isValidCron,
  getNextRunTime,
  getNextRunTimes,
  describeCron,
} from './cron/cron-parser.js';
export type { ParsedCron, ParsedCronField } from './cron/cron-parser.js';

// Queue factory
export { createQueue, createWorker, parseRedisUrl } from './queue/queue-factory.js';

// Handlers
export { QueryRefreshHandler } from './handlers/query-refresh.handler.js';
export type {
  QueryRefreshJobData,
  QueryRefreshResult,
  QueryExecutor,
} from './handlers/query-refresh.handler.js';

export { CacheCleanupHandler } from './handlers/cache-cleanup.handler.js';
export type {
  CacheCleanupJobData,
  CacheCleanupResult,
} from './handlers/cache-cleanup.handler.js';

export { HealthCheckHandler } from './handlers/health-check.handler.js';
export type {
  HealthCheckJobData,
  HealthCheckResult,
  DatasourceHealthResult,
  DatasourceConnector,
  DatasourceRegistry,
} from './handlers/health-check.handler.js';
