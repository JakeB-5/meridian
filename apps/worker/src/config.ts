// Worker configuration loaded from environment variables

import * as fs from 'node:fs';

export interface WorkerConfig {
  /** Redis connection URL for BullMQ */
  redisUrl: string;
  /** PostgreSQL database URL */
  databaseUrl: string;
  /** BullMQ queue name */
  queueName: string;
  /** Worker concurrency (number of concurrent jobs) */
  concurrency: number;
  /** HTTP health check port */
  healthPort: number;
  /** Log level */
  logLevel: string;
  /** Temporary directory for export files */
  tmpDir: string;
}

export function loadConfig(): WorkerConfig {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const tmpDir = process.env['TMP_DIR'] ?? '/tmp/meridian';
  // Ensure tmp directory exists
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch {
    // Ignore if already exists or can't create
  }

  return {
    redisUrl,
    databaseUrl,
    queueName: process.env['QUEUE_NAME'] ?? 'meridian',
    concurrency: parseInt(process.env['WORKER_CONCURRENCY'] ?? '5', 10),
    healthPort: parseInt(process.env['HEALTH_PORT'] ?? '3002', 10),
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    tmpDir,
  };
}
