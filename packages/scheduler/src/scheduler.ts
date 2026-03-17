import type { Queue } from 'bullmq';
import { createLogger } from '@meridian/shared';
import { JobNotFoundError, SchedulerError } from './errors.js';
import type { JobRegistry } from './job-registry.js';
import type {
  JobDefinition,
  JobOptions,
  JobStatus,
  JobType,
  RecurringJobEntry,
} from './types.js';
import { parseCron } from './cron/cron-parser.js';

const logger = createLogger('@meridian/scheduler:scheduler');

// Default execution options applied when callers omit them.
const DEFAULT_OPTIONS: Required<JobOptions> = {
  priority: 5,
  maxRetries: 3,
  retryDelay: 5_000,
  timeout: 300_000,
  removeOnComplete: false,
};

/**
 * Central scheduler that enqueues one-off and recurring jobs onto a BullMQ
 * queue, and provides lifecycle management (cancel, pause, resume, status).
 */
export class Scheduler {
  /** In-memory registry of active recurring job entries (keyed by name). */
  private readonly recurringJobs = new Map<string, RecurringJobEntry>();

  constructor(
    private readonly queue: Queue,
    private readonly registry: JobRegistry,
  ) {}

  // ---------------------------------------------------------------------------
  // One-off job scheduling
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a one-off job immediately.
   *
   * @returns The BullMQ job ID.
   * @throws `SchedulerError` if enqueuing fails.
   */
  async schedule(definition: JobDefinition): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...definition.options };

    // Validate cron if accidentally passed for a one-off.
    if (definition.cron) {
      parseCron(definition.cron); // throws InvalidCronError on bad expression
    }

    try {
      const job = await this.queue.add(
        definition.name,
        // Embed type inside data so the worker can route to the right handler.
        { ...definition.data, type: definition.type },
        {
          priority: opts.priority,
          attempts: opts.maxRetries,
          backoff: { type: 'fixed', delay: opts.retryDelay },
          jobId: undefined, // let BullMQ generate a unique ID
          removeOnComplete: opts.removeOnComplete,
        },
      );

      if (!job.id) {
        throw new SchedulerError('BullMQ returned a job without an ID', {
          name: definition.name,
        });
      }

      logger.info('job scheduled', { id: job.id, type: definition.type, name: definition.name });
      return job.id;
    } catch (err) {
      if (err instanceof SchedulerError) throw err;
      throw new SchedulerError(`Failed to enqueue job '${definition.name}'`, {
        type: definition.type,
        error: (err as Error).message,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Recurring job scheduling (cron)
  // ---------------------------------------------------------------------------

  /**
   * Register a recurring job driven by a cron expression.
   *
   * Idempotent: calling again with the same `name` updates the schedule.
   *
   * @param name       Unique name for this recurring schedule.
   * @param cron       5-field cron expression or @-shorthand.
   * @param definition Job payload and options.
   */
  async scheduleRecurring(
    name: string,
    cron: string,
    definition: JobDefinition,
  ): Promise<void> {
    // Validate and expand the cron expression before touching the queue.
    const parsed = parseCron(cron);
    const expandedCron = parsed.expression;

    const opts = { ...DEFAULT_OPTIONS, ...definition.options };

    try {
      // Remove any existing repeat for this name first to allow updates.
      await this.cancelRecurring(name).catch(() => {
        // Ignore — might not exist yet.
      });

      await this.queue.add(
        name,
        { ...definition.data, type: definition.type },
        {
          repeat: { pattern: expandedCron },
          priority: opts.priority,
          attempts: opts.maxRetries,
          backoff: { type: 'fixed', delay: opts.retryDelay },
          removeOnComplete: opts.removeOnComplete,
        },
      );

      const entry: RecurringJobEntry = {
        name,
        cron,
        definition,
        registeredAt: new Date(),
      };
      this.recurringJobs.set(name, entry);

      logger.info('recurring job scheduled', { name, cron, type: definition.type });
    } catch (err) {
      if (err instanceof SchedulerError) throw err;
      throw new SchedulerError(`Failed to schedule recurring job '${name}'`, {
        cron,
        type: definition.type,
        error: (err as Error).message,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  /**
   * Cancel a one-off (or specific) job by its BullMQ job ID.
   *
   * @throws `JobNotFoundError` if no job with that ID exists.
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }
    await job.remove();
    logger.info('job cancelled', { id: jobId });
  }

  /**
   * Cancel a recurring job by its logical name and remove it from the
   * in-memory registry.
   *
   * No-op (with a warning) when the name is not registered.
   */
  async cancelRecurring(name: string): Promise<void> {
    // BullMQ requires the repeat key to remove a repeatable job.
    // The key format used by BullMQ is `name:::pattern`.
    const repeatables = await this.queue.getRepeatableJobs();
    const match = repeatables.find((r) => r.name === name);

    if (match) {
      await this.queue.removeRepeatableByKey(match.key);
      logger.info('recurring job cancelled', { name, key: match.key });
    } else {
      logger.warn('recurring job not found in queue; removing from registry only', { name });
    }

    this.recurringJobs.delete(name);
  }

  // ---------------------------------------------------------------------------
  // Status & listing
  // ---------------------------------------------------------------------------

  /**
   * Fetch the current status snapshot of a job by its BullMQ job ID.
   *
   * Returns `null` when the job does not exist (e.g. already removed).
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();

    return {
      id: job.id!,
      type: (job.data?.type ?? 'query_refresh') as JobType,
      status: state as JobStatus['status'],
      progress: typeof job.progress === 'number' ? job.progress : 0,
      data: job.data as Record<string, unknown>,
      result: job.returnvalue ?? undefined,
      error: job.failedReason ?? undefined,
      startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      attemptsMade: job.attemptsMade,
    };
  }

  /**
   * List jobs in the queue, optionally filtered by type and/or status.
   *
   * Fetches up to 100 jobs from each relevant BullMQ bucket.
   */
  async listJobs(type?: JobType, status?: JobStatus['status']): Promise<JobStatus[]> {
    const statuses: Array<JobStatus['status']> = status
      ? [status]
      : ['waiting', 'active', 'completed', 'failed', 'delayed'];

    const allJobs = await Promise.all(
      statuses.map(async (s) => {
        try {
          switch (s) {
            case 'waiting':
              return await this.queue.getWaiting(0, 99);
            case 'active':
              return await this.queue.getActive(0, 99);
            case 'completed':
              return await this.queue.getCompleted(0, 99);
            case 'failed':
              return await this.queue.getFailed(0, 99);
            case 'delayed':
              return await this.queue.getDelayed(0, 99);
            default:
              return [];
          }
        } catch {
          return [];
        }
      }),
    );

    const flat = allJobs.flat();

    const statuses2 = await Promise.all(
      flat.map(async (job) => {
        const state = await job.getState();
        return {
          id: job.id!,
          type: (job.data?.type ?? 'query_refresh') as JobType,
          status: state as JobStatus['status'],
          progress: typeof job.progress === 'number' ? job.progress : 0,
          data: job.data as Record<string, unknown>,
          result: job.returnvalue ?? undefined,
          error: job.failedReason ?? undefined,
          startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
          completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
          attemptsMade: job.attemptsMade,
        } satisfies JobStatus;
      }),
    );

    if (!type) return statuses2;
    return statuses2.filter((s) => s.type === type);
  }

  // ---------------------------------------------------------------------------
  // Pause / resume
  // ---------------------------------------------------------------------------

  /**
   * Pause the queue — no new jobs will be processed until `resumeAll` is called.
   */
  async pauseAll(): Promise<void> {
    await this.queue.pause();
    logger.info('queue paused', { name: this.queue.name });
  }

  /**
   * Resume a previously paused queue.
   */
  async resumeAll(): Promise<void> {
    await this.queue.resume();
    logger.info('queue resumed', { name: this.queue.name });
  }

  // ---------------------------------------------------------------------------
  // Introspection helpers
  // ---------------------------------------------------------------------------

  /**
   * List all currently registered recurring jobs.
   */
  listRecurring(): RecurringJobEntry[] {
    return Array.from(this.recurringJobs.values());
  }

  /**
   * Return queue-level counts (waiting, active, completed, failed, delayed).
   */
  async getQueueCounts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  }

  /**
   * Close the underlying queue connection gracefully.
   */
  async close(): Promise<void> {
    await this.queue.close();
    logger.info('queue closed', { name: this.queue.name });
  }
}
