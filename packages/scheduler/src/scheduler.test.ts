import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { Scheduler } from './scheduler.js';
import { JobRegistry } from './job-registry.js';
import { JobNotFoundError, InvalidCronError, SchedulerError } from './errors.js';
import type { JobDefinition } from './types.js';

// ---------------------------------------------------------------------------
// BullMQ Queue mock
// ---------------------------------------------------------------------------

/** Minimal mock that satisfies the Queue contract used by Scheduler. */
function makeMockQueue() {
  const jobs = new Map<string, MockJob>();
  let idCounter = 1;

  function makeJob(id: string, data: Record<string, unknown>, name: string): MockJob {
    return {
      id,
      name,
      data,
      progress: 0,
      attemptsMade: 0,
      processedOn: undefined,
      finishedOn: undefined,
      returnvalue: undefined,
      failedReason: undefined,
      getState: vi.fn(async () => 'waiting'),
      remove: vi.fn(async () => {}),
      updateProgress: vi.fn(async (_n: number) => {}) as any,
    };
  }

  return {
    name: 'test-queue',
    add: vi.fn(async (name: string, data: Record<string, unknown>, _opts?: unknown) => {
      const id = String(idCounter++);
      const job = makeJob(id, data, name);
      jobs.set(id, job);
      return job;
    }),
    getJob: vi.fn(async (id: string) => jobs.get(id) ?? null),
    getRepeatableJobs: vi.fn(async () => []),
    removeRepeatableByKey: vi.fn(async () => {}),
    getWaiting: vi.fn(async () => []),
    getActive: vi.fn(async () => []),
    getCompleted: vi.fn(async () => []),
    getFailed: vi.fn(async () => []),
    getDelayed: vi.fn(async () => []),
    getJobCounts: vi.fn(async () => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    _jobs: jobs,
    _makeJob: makeJob,
  };
}

type MockQueue = ReturnType<typeof makeMockQueue>;
type MockJob = {
  id: string;
  name: string;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  returnvalue: unknown;
  failedReason: string | undefined;
  getState: MockedFunction<() => Promise<string>>;
  remove: MockedFunction<() => Promise<void>>;
  updateProgress: MockedFunction<(n: number) => Promise<void>>;
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('Scheduler', () => {
  let queue: MockQueue;
  let registry: JobRegistry;
  let scheduler: Scheduler;

  const baseDefinition: JobDefinition = {
    type: 'query_refresh',
    name: 'test-job',
    data: { questionId: 'q1' },
  };

  beforeEach(() => {
    queue = makeMockQueue();
    registry = new JobRegistry();
    // Cast — Scheduler only uses the subset of Queue we mock.
    scheduler = new Scheduler(queue as never, registry);
  });

  // ── schedule ───────────────────────────────────────────────────────────────

  describe('schedule()', () => {
    it('returns a string job ID', async () => {
      const id = await scheduler.schedule(baseDefinition);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('calls queue.add with embedded type in data', async () => {
      await scheduler.schedule(baseDefinition);
      expect(queue.add).toHaveBeenCalledOnce();
      const [name, data] = (queue.add as MockedFunction<typeof queue.add>).mock.calls[0]!;
      expect(name).toBe('test-job');
      expect((data as Record<string, unknown>)['type']).toBe('query_refresh');
    });

    it('applies default options when none provided', async () => {
      await scheduler.schedule(baseDefinition);
      const [, , opts] = (queue.add as MockedFunction<typeof queue.add>).mock.calls[0]!;
      expect((opts as Record<string, unknown>)['priority']).toBe(5);
      expect((opts as Record<string, unknown>)['attempts']).toBe(3);
    });

    it('applies caller-provided options', async () => {
      await scheduler.schedule({
        ...baseDefinition,
        options: { priority: 1, maxRetries: 5 },
      });
      const [, , opts] = (queue.add as MockedFunction<typeof queue.add>).mock.calls[0]!;
      expect((opts as Record<string, unknown>)['priority']).toBe(1);
      expect((opts as Record<string, unknown>)['attempts']).toBe(5);
    });

    it('throws SchedulerError when queue.add fails', async () => {
      (queue.add as MockedFunction<typeof queue.add>).mockRejectedValueOnce(new Error('Redis down'));
      await expect(scheduler.schedule(baseDefinition)).rejects.toThrow(SchedulerError);
    });

    it('validates cron when included in definition', async () => {
      await expect(
        scheduler.schedule({ ...baseDefinition, cron: 'invalid-cron' }),
      ).rejects.toThrow(InvalidCronError);
    });

    it('does not throw for a valid cron on a one-off definition', async () => {
      await expect(
        scheduler.schedule({ ...baseDefinition, cron: '*/5 * * * *' }),
      ).resolves.toBeDefined();
    });
  });

  // ── scheduleRecurring ──────────────────────────────────────────────────────

  describe('scheduleRecurring()', () => {
    it('calls queue.add with repeat pattern', async () => {
      await scheduler.scheduleRecurring('nightly', '@daily', baseDefinition);
      expect(queue.add).toHaveBeenCalled();
      const [, , opts] = (queue.add as MockedFunction<typeof queue.add>).mock.calls[0]!;
      const repeat = (opts as Record<string, unknown>)['repeat'] as Record<string, unknown>;
      expect(repeat?.['pattern']).toBe('0 0 * * *'); // @daily expanded
    });

    it('stores recurring job in internal registry', async () => {
      await scheduler.scheduleRecurring('nightly', '@daily', baseDefinition);
      const recurring = scheduler.listRecurring();
      expect(recurring).toHaveLength(1);
      expect(recurring[0]!.name).toBe('nightly');
      expect(recurring[0]!.cron).toBe('@daily');
    });

    it('throws InvalidCronError for invalid cron expression', async () => {
      await expect(
        scheduler.scheduleRecurring('bad', 'not-a-cron', baseDefinition),
      ).rejects.toThrow(InvalidCronError);
    });

    it('overwrites existing recurring job with same name', async () => {
      // Setup: getRepeatableJobs returns an existing entry
      (queue.getRepeatableJobs as any).mockResolvedValue([
        { name: 'nightly', key: 'nightly:::pattern', id: '', pattern: '', next: 0, endDate: null, tz: null, every: null }
      ]);

      await scheduler.scheduleRecurring('nightly', '@daily', baseDefinition);
      await scheduler.scheduleRecurring('nightly', '@weekly', baseDefinition);

      const recurring = scheduler.listRecurring();
      // After overwrite only one entry with the latest cron
      const entry = recurring.find((r) => r.name === 'nightly');
      expect(entry?.cron).toBe('@weekly');
    });
  });

  // ── cancelJob ─────────────────────────────────────────────────────────────

  describe('cancelJob()', () => {
    it('removes the job from the queue', async () => {
      const id = await scheduler.schedule(baseDefinition);
      const job = queue._jobs.get(id)!;
      await scheduler.cancelJob(id);
      expect(job.remove).toHaveBeenCalledOnce();
    });

    it('throws JobNotFoundError when job does not exist', async () => {
      await expect(scheduler.cancelJob('nonexistent-id')).rejects.toThrow(JobNotFoundError);
    });
  });

  // ── cancelRecurring ────────────────────────────────────────────────────────

  describe('cancelRecurring()', () => {
    it('calls removeRepeatableByKey when job exists in queue', async () => {
      (queue.getRepeatableJobs as any).mockResolvedValue([
        { name: 'nightly', key: 'nightly:::0 0 * * *', id: '', pattern: '', next: 0, endDate: null, tz: null, every: null },
      ]);
      await scheduler.scheduleRecurring('nightly', '@daily', baseDefinition);
      await scheduler.cancelRecurring('nightly');
      expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('nightly:::0 0 * * *');
    });

    it('removes the entry from the internal registry', async () => {
      await scheduler.scheduleRecurring('nightly', '@daily', baseDefinition);
      await scheduler.cancelRecurring('nightly');
      expect(scheduler.listRecurring().find((r) => r.name === 'nightly')).toBeUndefined();
    });

    it('does not throw when name is not in queue (logs warning only)', async () => {
      await scheduler.scheduleRecurring('nightly', '@daily', baseDefinition);
      // Queue returns no repeatables for this name
      (queue.getRepeatableJobs as MockedFunction<typeof queue.getRepeatableJobs>).mockResolvedValue([]);
      await expect(scheduler.cancelRecurring('nightly')).resolves.toBeUndefined();
    });
  });

  // ── getJobStatus ──────────────────────────────────────────────────────────

  describe('getJobStatus()', () => {
    it('returns null for non-existent job', async () => {
      const status = await scheduler.getJobStatus('ghost');
      expect(status).toBeNull();
    });

    it('returns a JobStatus snapshot for an existing job', async () => {
      const id = await scheduler.schedule(baseDefinition);
      const status = await scheduler.getJobStatus(id);
      expect(status).not.toBeNull();
      expect(status!.id).toBe(id);
      expect(status!.type).toBe('query_refresh');
      expect(status!.status).toBe('waiting');
    });

    it('populates error field from failedReason', async () => {
      const id = await scheduler.schedule(baseDefinition);
      const job = queue._jobs.get(id)!;
      job.failedReason = 'Something went wrong';
      job.getState.mockResolvedValueOnce('failed');

      const status = await scheduler.getJobStatus(id);
      expect(status!.status).toBe('failed');
      expect(status!.error).toBe('Something went wrong');
    });

    it('populates completedAt when finishedOn is set', async () => {
      const id = await scheduler.schedule(baseDefinition);
      const job = queue._jobs.get(id)!;
      const ts = Date.now();
      job.finishedOn = ts;
      job.getState.mockResolvedValueOnce('completed');

      const status = await scheduler.getJobStatus(id);
      expect(status!.completedAt).toEqual(new Date(ts));
    });
  });

  // ── listJobs ───────────────────────────────────────────────────────────────

  describe('listJobs()', () => {
    it('returns empty array when no jobs exist', async () => {
      const jobs = await scheduler.listJobs();
      expect(jobs).toEqual([]);
    });

    it('aggregates jobs from all status buckets', async () => {
      const id = await scheduler.schedule(baseDefinition);
      const job = queue._jobs.get(id)!;
      (queue.getWaiting as MockedFunction<typeof queue.getWaiting>).mockResolvedValueOnce([job as never]);

      const jobs = await scheduler.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.id).toBe(id);
    });

    it('filters by type when provided', async () => {
      const id = await scheduler.schedule(baseDefinition);
      const job = queue._jobs.get(id)!;
      (queue.getWaiting as MockedFunction<typeof queue.getWaiting>).mockResolvedValueOnce([job as never]);

      const filtered = await scheduler.listJobs('cache_cleanup');
      expect(filtered).toHaveLength(0);

      (queue.getWaiting as MockedFunction<typeof queue.getWaiting>).mockResolvedValueOnce([job as never]);
      const unfiltered = await scheduler.listJobs('query_refresh');
      expect(unfiltered).toHaveLength(1);
    });
  });

  // ── pauseAll / resumeAll ───────────────────────────────────────────────────

  describe('pauseAll() and resumeAll()', () => {
    it('calls queue.pause()', async () => {
      await scheduler.pauseAll();
      expect(queue.pause).toHaveBeenCalledOnce();
    });

    it('calls queue.resume()', async () => {
      await scheduler.resumeAll();
      expect(queue.resume).toHaveBeenCalledOnce();
    });
  });

  // ── getQueueCounts ─────────────────────────────────────────────────────────

  describe('getQueueCounts()', () => {
    it('delegates to queue.getJobCounts', async () => {
      (queue.getJobCounts as MockedFunction<typeof queue.getJobCounts>).mockResolvedValueOnce({
        waiting: 3,
        active: 1,
        completed: 10,
        failed: 2,
        delayed: 0,
      });

      const counts = await scheduler.getQueueCounts();
      expect(counts['waiting']).toBe(3);
      expect(counts['active']).toBe(1);
    });
  });

  // ── close ──────────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('calls queue.close()', async () => {
      await scheduler.close();
      expect(queue.close).toHaveBeenCalledOnce();
    });
  });
});
