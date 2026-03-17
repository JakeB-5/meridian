// Simple HTTP health check server running on a separate port.
// Exposes GET /health with worker status and job counts.

import * as http from 'node:http';
import type { Worker } from 'bullmq';
import { createLogger } from '@meridian/shared';

const logger = createLogger('@meridian/worker:health');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  timestamp: string;
  version: string;
}

export interface HealthServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Counters (updated via worker event listeners)
// ---------------------------------------------------------------------------

export interface WorkerCounters {
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const WORKER_VERSION = process.env['npm_package_version'] ?? '0.0.1';
const START_TIME = Date.now();

/**
 * Create and return a minimal HTTP server that serves health check responses.
 * The counters are updated externally by attaching listeners to the BullMQ worker.
 */
export function createHealthServer(
  port: number,
  worker: Worker,
): HealthServer {
  const counters: WorkerCounters = {
    activeJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
  };

  // Track active job count via worker events
  worker.on('active', () => {
    counters.activeJobs++;
  });

  worker.on('completed', () => {
    if (counters.activeJobs > 0) counters.activeJobs--;
    counters.completedJobs++;
  });

  worker.on('failed', () => {
    if (counters.activeJobs > 0) counters.activeJobs--;
    counters.failedJobs++;
  });

  worker.on('error', () => {
    if (counters.activeJobs > 0) counters.activeJobs--;
    counters.failedJobs++;
  });

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/health') {
      const isRunning = !worker.closing;

      const body: HealthStatus = {
        status: isRunning ? 'ok' : 'degraded',
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        activeJobs: counters.activeJobs,
        completedJobs: counters.completedJobs,
        failedJobs: counters.failedJobs,
        timestamp: new Date().toISOString(),
        version: WORKER_VERSION,
      };

      const statusCode = isRunning ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body, null, 2));
      return;
    }

    if (url.pathname === '/ready') {
      const isReady = !worker.closing;
      res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: isReady }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return {
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.listen(port, () => {
          logger.info('Health server listening', { port });
          resolve();
        });
        server.on('error', (err) => {
          logger.error('Health server error', { error: err.message });
          reject(err);
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => {
          logger.info('Health server stopped');
          resolve();
        });
      });
    },
  };
}
