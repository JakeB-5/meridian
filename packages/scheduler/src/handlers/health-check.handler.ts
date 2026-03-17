import { createLogger } from '@meridian/shared';
import type { JobHandler } from '../job-registry.js';

const logger = createLogger('@meridian/scheduler:health-check-handler');

// ---------------------------------------------------------------------------
// Datasource connector interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a datasource connector.
 * The health-check handler accepts any object that implements this.
 */
export interface DatasourceConnector {
  /** Unique identifier for this datasource (e.g. UUID from the DB). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /**
   * Test the connection.
   * Should resolve with `{ ok: true }` on success or `{ ok: false, error }` on failure.
   */
  testConnection(): Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
}

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

/**
 * Expected fields inside the job's `data` payload for a health_check job.
 */
export interface HealthCheckJobData {
  /**
   * IDs of the datasources to check.  When omitted, all registered sources are checked.
   */
  datasourceIds?: string[];
  /**
   * Timeout in milliseconds for each individual connection test.  Default 10 000.
   */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface DatasourceHealthResult {
  id: string;
  name: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}

export interface HealthCheckResult {
  healthy: number;
  unhealthy: number;
  results: DatasourceHealthResult[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Connector registry interface
// ---------------------------------------------------------------------------

/**
 * Registry from which the handler resolves datasource connectors by ID.
 */
export interface DatasourceRegistry {
  /**
   * List all connectors that should be health-checked.
   * When `ids` is provided, only connectors with matching IDs are returned.
   */
  listConnectors(ids?: string[]): DatasourceConnector[];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Tests the connectivity of all (or specified) datasource connectors.
 *
 * Execution flow:
 * 1. Resolve the list of connectors (from registry, optionally filtered by ID).
 * 2. Run each connection test with an individual timeout.
 * 3. Collect results — failures do not abort the remaining checks.
 * 4. Report incremental progress after each test.
 */
export class HealthCheckHandler implements JobHandler {
  constructor(private readonly datasourceRegistry: DatasourceRegistry) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<HealthCheckResult> {
    const payload = data as HealthCheckJobData;
    const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const datasourceIds = payload.datasourceIds;

    const startedAt = Date.now();

    const connectors = this.datasourceRegistry.listConnectors(datasourceIds);

    logger.info('health check started', {
      total: connectors.length,
      filter: datasourceIds ?? 'all',
      timeoutMs,
    });

    if (connectors.length === 0) {
      logger.warn('no datasource connectors to check');
      progress(100);
      return {
        healthy: 0,
        unhealthy: 0,
        results: [],
        durationMs: Date.now() - startedAt,
      };
    }

    const results: DatasourceHealthResult[] = [];

    for (let i = 0; i < connectors.length; i++) {
      const connector = connectors[i]!;
      const checkedAt = new Date();

      let testResult: { ok: boolean; error?: string; latencyMs?: number };

      try {
        testResult = await withTimeout(connector.testConnection(), timeoutMs);
        logger.debug('connection test result', {
          id: connector.id,
          name: connector.name,
          ok: testResult.ok,
          latencyMs: testResult.latencyMs,
        });
      } catch (err) {
        const errorMessage =
          err instanceof TimeoutError
            ? `Connection timed out after ${timeoutMs}ms`
            : err instanceof Error
              ? err.message
              : String(err);

        logger.warn('connection test threw', {
          id: connector.id,
          name: connector.name,
          error: errorMessage,
        });

        testResult = { ok: false, error: errorMessage };
      }

      results.push({
        id: connector.id,
        name: connector.name,
        ok: testResult.ok,
        latencyMs: testResult.latencyMs,
        error: testResult.error,
        checkedAt,
      });

      const pct = Math.round(((i + 1) / connectors.length) * 100);
      progress(pct);
    }

    const healthy = results.filter((r) => r.ok).length;
    const unhealthy = results.filter((r) => !r.ok).length;
    const durationMs = Date.now() - startedAt;

    logger.info('health check complete', { healthy, unhealthy, durationMs });

    if (unhealthy > 0) {
      const failedNames = results
        .filter((r) => !r.ok)
        .map((r) => r.name)
        .join(', ');
      logger.warn('unhealthy datasources detected', { count: unhealthy, names: failedNames });
    }

    return { healthy, unhealthy, results, durationMs };
  }
}

// ---------------------------------------------------------------------------
// Internal timeout helper
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
