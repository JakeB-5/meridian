import { createLogger } from '@meridian/shared';
import { HandlerNotRegisteredError } from './errors.js';
import type { JobType } from './types.js';

/**
 * Contract that every job handler must satisfy.
 *
 * @param data     - The arbitrary payload stored on the job.
 * @param progress - Callback accepting a 0–100 integer; the scheduler
 *                   relays updates to BullMQ so callers can observe progress.
 * @returns        Arbitrary result value stored on the completed job.
 */
export interface JobHandler {
  handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<unknown>;
}

const logger = createLogger('@meridian/scheduler:job-registry');

/**
 * Central registry that maps job types to their handler implementations.
 *
 * Handlers are registered at application startup and looked up at execution
 * time by the BullMQ worker processor.
 */
export class JobRegistry {
  private readonly handlers = new Map<JobType, JobHandler>();

  /**
   * Register a handler for a given job type.
   * Registering a second handler for the same type overwrites the first.
   */
  register(type: JobType, handler: JobHandler): void {
    if (this.handlers.has(type)) {
      logger.warn('overwriting existing handler', { type });
    }
    this.handlers.set(type, handler);
    logger.info('handler registered', { type });
  }

  /**
   * Look up the handler for a given job type.
   * Returns `undefined` when no handler has been registered.
   */
  getHandler(type: JobType): JobHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Return the handler for a given job type.
   * Throws `HandlerNotRegisteredError` when no handler is found.
   */
  requireHandler(type: JobType): JobHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new HandlerNotRegisteredError(type);
    }
    return handler;
  }

  /**
   * List all job types that currently have a registered handler.
   */
  listRegistered(): JobType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Remove a registered handler.  Returns `true` if the handler existed.
   */
  unregister(type: JobType): boolean {
    const existed = this.handlers.has(type);
    this.handlers.delete(type);
    if (existed) {
      logger.info('handler unregistered', { type });
    }
    return existed;
  }

  /**
   * Clear all registered handlers.  Primarily useful in tests.
   */
  clear(): void {
    this.handlers.clear();
    logger.debug('all handlers cleared');
  }
}
