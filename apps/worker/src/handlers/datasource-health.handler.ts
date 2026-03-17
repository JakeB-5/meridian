// Handler: health_check (datasource health)
// Tests all active datasource connections and updates their status in the DB.

import { createLogger } from '@meridian/shared';
import type { WorkerConfig } from '../config.js';

const logger = createLogger('@meridian/worker:datasource-health');

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface DatasourceHealthPayload {
  /** Specific organization to check (default: all organizations) */
  organizationId?: string;
  /** Specific datasource IDs to check (default: all active) */
  datasourceIds?: string[];
  /** Timeout per connection test in ms (default: 10000) */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface DatasourceHealthResult {
  total: number;
  healthy: number;
  unhealthy: number;
  skipped: number;
  durationMs: number;
  results: Array<{
    datasourceId: string;
    name: string;
    type: string;
    success: boolean;
    latencyMs?: number;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class DatasourceHealthHandler {
  constructor(private readonly config: WorkerConfig) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<DatasourceHealthResult> {
    const payload = data as unknown as DatasourceHealthPayload;
    const { organizationId, datasourceIds, timeoutMs = 10_000 } = payload;

    const startTime = Date.now();
    logger.info('Starting datasource health check', { organizationId, datasourceIds });
    await progress(5);

    // Load DB
    const { createDatabaseFromUrl } = await import('@meridian/db');
    const db = createDatabaseFromUrl(this.config.databaseUrl);
    await progress(10);

    const { DataSourceRepository } = await import('@meridian/db');
    const datasourceRepo = new DataSourceRepository(db);

    // Load datasources to check
    let datasources: Array<{
      id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      status: string;
    }>;

    if (datasourceIds && datasourceIds.length > 0) {
      // Check specific datasources
      const results = await Promise.all(
        datasourceIds.map((id) => datasourceRepo.findById(id)),
      );
      datasources = results.filter(Boolean) as typeof datasources;
    } else if (organizationId) {
      const page = await datasourceRepo.findByOrganization(organizationId, {}, { page: 1, limit: 100 });
      datasources = page.data as typeof datasources;
    } else {
      const page = await datasourceRepo.findAll({}, { page: 1, limit: 200 });
      datasources = page.data as typeof datasources;
    }

    await progress(20);

    const total = datasources.length;
    if (total === 0) {
      logger.info('No datasources to check');
      await progress(100);
      return {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        skipped: 0,
        durationMs: Date.now() - startTime,
        results: [],
      };
    }

    const { createConnector } = await import('@meridian/connectors');

    const checkResults: DatasourceHealthResult['results'] = [];
    let healthy = 0;
    let unhealthy = 0;
    let skipped = 0;

    for (let i = 0; i < datasources.length; i++) {
      const ds = datasources[i]!;
      const pctBase = 20 + Math.round((i / total) * 70);
      await progress(pctBase);

      try {
        const dsConfig = {
          id: ds.id,
          name: ds.name,
          type: ds.type,
          ...(ds.config as Record<string, unknown>),
        };

        const connector = createConnector(dsConfig);

        // Run test with timeout
        const testResult = await withTimeout(
          connector.testConnection(),
          timeoutMs,
          `Connection test timed out after ${timeoutMs}ms`,
        );

        if (testResult.success) {
          healthy++;
          // Update DB status to active
          await datasourceRepo.markTested(ds.id);
          logger.info('Datasource healthy', {
            id: ds.id,
            name: ds.name,
            latencyMs: testResult.latencyMs,
          });
          checkResults.push({
            datasourceId: ds.id,
            name: ds.name,
            type: ds.type,
            success: true,
            latencyMs: testResult.latencyMs,
          });
        } else {
          unhealthy++;
          await datasourceRepo.markError(ds.id);
          logger.warn('Datasource unhealthy', {
            id: ds.id,
            name: ds.name,
            message: testResult.message,
          });
          checkResults.push({
            datasourceId: ds.id,
            name: ds.name,
            type: ds.type,
            success: false,
            latencyMs: testResult.latencyMs,
            error: testResult.message,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('Unsupported connector type')) {
          // Cannot test — skip
          skipped++;
          logger.info('Skipping unsupported connector type', { id: ds.id, type: ds.type });
          checkResults.push({
            datasourceId: ds.id,
            name: ds.name,
            type: ds.type,
            success: false,
            error: `Skipped: ${message}`,
          });
        } else {
          unhealthy++;
          try {
            await datasourceRepo.markError(ds.id);
          } catch {
            // Ignore DB update failure
          }
          logger.error('Datasource health check failed', {
            id: ds.id,
            name: ds.name,
            error: message,
          });
          checkResults.push({
            datasourceId: ds.id,
            name: ds.name,
            type: ds.type,
            success: false,
            error: message,
          });
        }
      }
    }

    await progress(95);

    const durationMs = Date.now() - startTime;
    logger.info('Datasource health check complete', {
      total,
      healthy,
      unhealthy,
      skipped,
      durationMs,
    });

    await progress(100);

    return {
      total,
      healthy,
      unhealthy,
      skipped,
      durationMs,
      results: checkResults,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}
