# Group D3: @meridian/scheduler — Job Scheduling System

## Task
Implement a job scheduling system for periodic data refresh, report generation, and other background tasks using BullMQ.

## Files to Create

### src/types.ts
```typescript
export type JobType = 'query_refresh' | 'dashboard_refresh' | 'export_csv' | 'export_pdf' | 'cache_cleanup' | 'health_check';

export interface JobDefinition {
  type: JobType;
  name: string;
  cron?: string;           // Cron expression for recurring jobs
  data: Record<string, unknown>;
  options?: JobOptions;
}

export interface JobOptions {
  priority?: number;        // 1 (highest) - 10 (lowest)
  maxRetries?: number;      // default 3
  retryDelay?: number;      // ms, default 5000
  timeout?: number;         // ms, default 300000 (5min)
  removeOnComplete?: boolean;
}

export interface JobStatus {
  id: string;
  type: JobType;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  data: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  attemptsMade: number;
}
```

### src/scheduler.ts
Main scheduler class:
```typescript
export class Scheduler {
  constructor(private queue: Queue, private registry: JobRegistry) {}
  schedule(definition: JobDefinition): Promise<string>; // returns job ID
  scheduleRecurring(name: string, cron: string, definition: JobDefinition): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  cancelRecurring(name: string): Promise<void>;
  getJobStatus(jobId: string): Promise<JobStatus | null>;
  listJobs(type?: JobType, status?: string): Promise<JobStatus[]>;
  pauseAll(): Promise<void>;
  resumeAll(): Promise<void>;
}
```

### src/job-registry.ts
Registry of job handlers:
```typescript
export class JobRegistry {
  register(type: JobType, handler: JobHandler): void;
  getHandler(type: JobType): JobHandler | undefined;
  listRegistered(): JobType[];
}

export interface JobHandler {
  handle(data: Record<string, unknown>, progress: (n: number) => void): Promise<unknown>;
}
```

### src/handlers/query-refresh.handler.ts
Refreshes cached query results:
- Finds questions due for refresh
- Re-executes queries
- Updates cache entries

### src/handlers/cache-cleanup.handler.ts
Removes expired cache entries

### src/handlers/health-check.handler.ts
Tests all datasource connections periodically

### src/cron/cron-parser.ts
Cron expression parser and validator:
- Standard 5-field cron (minute hour day month weekday)
- @daily, @hourly, @weekly shortcuts
- Next run time calculation

### src/queue/queue-factory.ts
BullMQ queue creation with Redis connection:
```typescript
export function createQueue(name: string, redisUrl: string): Queue;
export function createWorker(name: string, redisUrl: string, registry: JobRegistry): Worker;
```

### src/index.ts — re-exports

## Tests
- src/scheduler.test.ts (schedule, cancel, list, pause/resume)
- src/job-registry.test.ts (register, lookup)
- src/cron/cron-parser.test.ts (parse, validate, next-run)
- src/handlers/query-refresh.handler.test.ts
- src/handlers/cache-cleanup.handler.test.ts

## Dependencies
- @meridian/core, @meridian/cache, @meridian/shared
- bullmq

## Estimated LOC: ~3000 + ~1000 tests
