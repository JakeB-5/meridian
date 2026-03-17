// Tests for the health check HTTP server

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { createHealthServer } from './health.js';
import type { Worker } from 'bullmq';

// ---------------------------------------------------------------------------
// Mock BullMQ Worker
// ---------------------------------------------------------------------------

function createMockWorker(closing = false): Worker {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  return {
    closing,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event]!.push(cb);
    }),
    emit: (event: string, ...args: unknown[]) => {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Worker;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () =>
          resolve({ statusCode: res.statusCode ?? 0, body: data }),
        );
      })
      .on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHealthServer', () => {
  const PORT = 13999; // Use a non-standard port to avoid conflicts
  let server: ReturnType<typeof createHealthServer>;
  let worker: Worker & { emit: (event: string, ...args: unknown[]) => void };

  beforeEach(async () => {
    worker = createMockWorker() as Worker & { emit: (event: string, ...args: unknown[]) => void };
    server = createHealthServer(PORT, worker);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should respond 200 to GET /health when worker is running', async () => {
    const { statusCode, body } = await httpGet(`http://localhost:${PORT}/health`);

    expect(statusCode).toBe(200);
    const json = JSON.parse(body) as {
      status: string;
      uptime: number;
      activeJobs: number;
      completedJobs: number;
      failedJobs: number;
      timestamp: string;
      version: string;
    };
    expect(json.status).toBe('ok');
    expect(typeof json.uptime).toBe('number');
    expect(json.activeJobs).toBe(0);
    expect(json.completedJobs).toBe(0);
    expect(json.failedJobs).toBe(0);
    expect(json.timestamp).toBeDefined();
  });

  it('should respond 200 to GET /ready when worker is running', async () => {
    const { statusCode, body } = await httpGet(`http://localhost:${PORT}/ready`);

    expect(statusCode).toBe(200);
    const json = JSON.parse(body) as { ready: boolean };
    expect(json.ready).toBe(true);
  });

  it('should respond 404 for unknown routes', async () => {
    const { statusCode } = await httpGet(`http://localhost:${PORT}/unknown`);
    expect(statusCode).toBe(404);
  });

  it('should increment activeJobs counter on active event', async () => {
    worker.emit('active');
    worker.emit('active');

    const { body } = await httpGet(`http://localhost:${PORT}/health`);
    const json = JSON.parse(body) as { activeJobs: number };
    expect(json.activeJobs).toBe(2);
  });

  it('should increment completedJobs and decrement activeJobs on completed event', async () => {
    worker.emit('active');
    worker.emit('active');
    worker.emit('completed');

    const { body } = await httpGet(`http://localhost:${PORT}/health`);
    const json = JSON.parse(body) as { activeJobs: number; completedJobs: number };
    expect(json.activeJobs).toBe(1);
    expect(json.completedJobs).toBe(1);
  });

  it('should increment failedJobs on failed event', async () => {
    worker.emit('active');
    worker.emit('failed');

    const { body } = await httpGet(`http://localhost:${PORT}/health`);
    const json = JSON.parse(body) as { activeJobs: number; failedJobs: number };
    expect(json.activeJobs).toBe(0);
    expect(json.failedJobs).toBe(1);
  });

  it('should not let activeJobs go below zero', async () => {
    // Fire completed without a preceding active
    worker.emit('completed');

    const { body } = await httpGet(`http://localhost:${PORT}/health`);
    const json = JSON.parse(body) as { activeJobs: number };
    expect(json.activeJobs).toBe(0);
  });

  it('should return 503 when worker is closing', async () => {
    const closingWorker = createMockWorker(true);
    const closingServer = createHealthServer(PORT + 1, closingWorker);
    await closingServer.start();

    try {
      const { statusCode, body } = await httpGet(`http://localhost:${PORT + 1}/health`);
      expect(statusCode).toBe(503);
      const json = JSON.parse(body) as { status: string };
      expect(json.status).toBe('degraded');
    } finally {
      await closingServer.stop();
    }
  });

  it('should return JSON content-type for /health', async () => {
    return new Promise<void>((resolve, reject) => {
      http
        .get(`http://localhost:${PORT}/health`, (res) => {
          expect(res.headers['content-type']).toBe('application/json');
          res.resume();
          res.on('end', resolve);
        })
        .on('error', reject);
    });
  });
});
