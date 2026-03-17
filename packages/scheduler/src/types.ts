/**
 * Job types supported by the Meridian scheduler.
 */
export type JobType =
  | 'query_refresh'
  | 'dashboard_refresh'
  | 'export_csv'
  | 'export_pdf'
  | 'cache_cleanup'
  | 'health_check';

/**
 * Defines a job to be scheduled — its type, name, optional cron expression,
 * payload data, and execution options.
 */
export interface JobDefinition {
  /** Discriminator for routing to the correct handler. */
  type: JobType;
  /** Human-readable name for the job (also used as the recurring job key). */
  name: string;
  /**
   * Optional cron expression for recurring jobs.
   * Supported: standard 5-field cron + shortcuts (@daily, @hourly, @weekly).
   */
  cron?: string;
  /** Arbitrary payload passed to the handler at execution time. */
  data: Record<string, unknown>;
  /** Fine-grained execution options. */
  options?: JobOptions;
}

/**
 * Execution options that control retry behaviour, priority, and lifecycle.
 */
export interface JobOptions {
  /** Job priority: 1 (highest urgency) – 10 (lowest urgency). Default 5. */
  priority?: number;
  /** Maximum number of retry attempts on failure. Default 3. */
  maxRetries?: number;
  /** Delay in milliseconds between retry attempts. Default 5 000. */
  retryDelay?: number;
  /** Maximum execution time in milliseconds before the job is killed. Default 300 000 (5 min). */
  timeout?: number;
  /** Whether to automatically remove the job record once it completes successfully. Default false. */
  removeOnComplete?: boolean;
}

/**
 * A point-in-time snapshot of a job's execution state.
 */
export interface JobStatus {
  /** Unique job identifier assigned by BullMQ. */
  id: string;
  /** The job type that was executed. */
  type: JobType;
  /** Current lifecycle stage. */
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  /** 0–100 progress percentage reported by the handler. */
  progress: number;
  /** The payload the handler received. */
  data: Record<string, unknown>;
  /** The value returned by the handler on success. */
  result?: unknown;
  /** Error message if the job failed. */
  error?: string;
  /** Timestamp when the job first started executing. */
  startedAt?: Date;
  /** Timestamp when the job reached a terminal state. */
  completedAt?: Date;
  /** Number of execution attempts made so far. */
  attemptsMade: number;
}

/**
 * Internal representation of a recurring job registration.
 */
export interface RecurringJobEntry {
  name: string;
  cron: string;
  definition: JobDefinition;
  registeredAt: Date;
}
