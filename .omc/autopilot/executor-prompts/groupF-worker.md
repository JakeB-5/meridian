# Group F2: apps/worker — Background Job Processor

## Task
Implement the background worker that processes queued jobs via BullMQ.

## Files to Create

### src/worker.ts
Main worker entry:
```typescript
export async function startWorker(config: WorkerConfig): Promise<void> {
  const registry = new JobRegistry();
  registerHandlers(registry);
  const worker = createWorker('meridian', config.redisUrl, registry);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
  });
}
```

### src/config.ts
Worker configuration from env vars

### src/handlers/index.ts
Register all job handlers:
- query-refresh
- dashboard-refresh (refresh all questions in a dashboard)
- export-csv
- export-pdf (using basic HTML-to-PDF)
- cache-cleanup
- datasource-health-check
- audit-log-cleanup (remove old logs)

### src/handlers/query-refresh.handler.ts
Re-execute and cache a question's query

### src/handlers/dashboard-refresh.handler.ts
Refresh all questions in a dashboard, then notify via realtime

### src/handlers/export-csv.handler.ts
Execute query, format as CSV, save to tmp file, return path

### src/handlers/export-pdf.handler.ts
Stub for PDF export

### src/handlers/cache-cleanup.handler.ts
Remove expired cache entries from DB and Redis

### src/handlers/datasource-health.handler.ts
Test all datasource connections, update status

### src/health.ts
HTTP health check endpoint (simple HTTP server on separate port):
- GET /health → { status: 'ok', activeJobs, completedJobs, failedJobs }

### src/index.ts
Entry point: startWorker()

## Tests
- src/handlers/query-refresh.handler.test.ts
- src/handlers/export-csv.handler.test.ts
- src/handlers/cache-cleanup.handler.test.ts
- src/health.test.ts

## Dependencies
- @meridian/core, @meridian/db, @meridian/connectors, @meridian/query-engine
- @meridian/cache, @meridian/scheduler, @meridian/realtime, @meridian/shared
- bullmq

## Estimated LOC: ~3000 + ~800 tests
