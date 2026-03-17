import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { createLogger } from '@meridian/shared';
import { HandlerNotRegisteredError } from '../errors.js';
import type { JobRegistry } from '../job-registry.js';
import type { JobType } from '../types.js';

const logger = createLogger('@meridian/scheduler:queue-factory');

// ---------------------------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Redis URL string into a BullMQ-compatible `ConnectionOptions` object.
 *
 * Supports:
 *   redis://[:password@]host[:port][/db]
 *   rediss://... (TLS)
 */
export function parseRedisUrl(redisUrl: string): ConnectionOptions {
  try {
    const url = new URL(redisUrl);
    const options: ConnectionOptions & { tls?: boolean } = {
      host: url.hostname || '127.0.0.1',
      port: url.port ? parseInt(url.port, 10) : 6379,
    };
    if (url.password) options.password = url.password;
    if (url.username) options.username = url.username;
    if (url.pathname && url.pathname !== '/') {
      const db = parseInt(url.pathname.slice(1), 10);
      if (!isNaN(db)) (options as Record<string, unknown>)['db'] = db;
    }
    if (url.protocol === 'rediss:') options.tls = true;
    return options;
  } catch {
    // Fall back to treating the whole string as a host
    return { host: redisUrl, port: 6379 };
  }
}

// ---------------------------------------------------------------------------
// Queue factory
// ---------------------------------------------------------------------------

/**
 * Create a named BullMQ `Queue` connected to Redis.
 *
 * The queue is configured with sensible defaults:
 * - Default job TTL for completed jobs: 24 h
 * - Default job TTL for failed jobs: 7 days
 */
export function createQueue(name: string, redisUrl: string): Queue {
  const connection = parseRedisUrl(redisUrl);

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },
      removeOnComplete: {
        age: 24 * 60 * 60,   // 24 hours in seconds
        count: 1_000,
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60, // 7 days in seconds
      },
    },
  });

  queue.on('error', (err) => {
    logger.error('queue error', { queue: name, error: err.message });
  });

  logger.info('queue created', { name, host: (connection as Record<string, unknown>)['host'] });
  return queue;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Create a named BullMQ `Worker` that dispatches jobs to the `JobRegistry`.
 *
 * The worker:
 * 1. Looks up the handler for the job's `type` field.
 * 2. Calls `handler.handle(data, progressCallback)`.
 * 3. Reports progress percentages back to BullMQ.
 * 4. Returns the handler's result value (stored on the job).
 */
export function createWorker(
  name: string,
  redisUrl: string,
  registry: JobRegistry,
): Worker {
  const connection = parseRedisUrl(redisUrl);

  const worker = new Worker(
    name,
    async (job: Job) => {
      const jobType = job.data?.type as JobType | undefined;

      if (!jobType) {
        throw new Error(`Job ${job.id} is missing required 'type' field in data`);
      }

      const handler = registry.getHandler(jobType);
      if (!handler) {
        throw new HandlerNotRegisteredError(jobType);
      }

      logger.info('executing job', { id: job.id, type: jobType, name: job.name });

      const progressCallback = async (percent: number) => {
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        await job.updateProgress(clamped);
        logger.debug('job progress', { id: job.id, type: jobType, progress: clamped });
      };

      const result = await handler.handle(job.data as Record<string, unknown>, progressCallback);

      logger.info('job completed', { id: job.id, type: jobType });
      return result;
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info('worker: job completed', { id: job.id, name: job.name });
  });

  worker.on('failed', (job, err) => {
    logger.error('worker: job failed', {
      id: job?.id,
      name: job?.name,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('worker error', { queue: name, error: err.message });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('worker: job stalled', { jobId, queue: name });
  });

  logger.info('worker created', { name, host: (connection as Record<string, unknown>)['host'] });
  return worker;
}
