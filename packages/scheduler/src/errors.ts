import { MeridianError } from '@meridian/shared';

/**
 * Thrown when a requested job cannot be found in the queue.
 */
export class JobNotFoundError extends MeridianError {
  constructor(jobId: string) {
    super(`Job '${jobId}' not found`, 'ERR_JOB_NOT_FOUND', 404, { jobId });
    this.name = 'JobNotFoundError';
  }
}

/**
 * Thrown when a job handler has not been registered for a given job type.
 */
export class HandlerNotRegisteredError extends MeridianError {
  constructor(jobType: string) {
    super(
      `No handler registered for job type '${jobType}'`,
      'ERR_HANDLER_NOT_REGISTERED',
      500,
      { jobType },
    );
    this.name = 'HandlerNotRegisteredError';
  }
}

/**
 * Thrown when a cron expression cannot be parsed or is structurally invalid.
 */
export class InvalidCronError extends MeridianError {
  constructor(expression: string, reason?: string) {
    super(
      `Invalid cron expression '${expression}'${reason ? `: ${reason}` : ''}`,
      'ERR_INVALID_CRON',
      400,
      { expression, reason },
    );
    this.name = 'InvalidCronError';
  }
}

/**
 * Thrown when the scheduler fails to enqueue or cancel a job via BullMQ.
 */
export class SchedulerError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_SCHEDULER', 500, details);
    this.name = 'SchedulerError';
  }
}
