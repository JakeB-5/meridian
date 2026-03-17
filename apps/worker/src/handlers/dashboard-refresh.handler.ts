// Handler: dashboard_refresh
// Refreshes all questions in a dashboard, updating cache for each,
// then optionally notifies subscribers via realtime broadcast.

import { createLogger } from '@meridian/shared';
import type { WorkerConfig } from '../config.js';
import type { MultiLayerCache } from '@meridian/cache';
import { generateCacheKey } from '@meridian/cache';
import { DEFAULT_CACHE_TTL_SECONDS } from '@meridian/shared';

const logger = createLogger('@meridian/worker:dashboard-refresh');

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface DashboardRefreshPayload {
  /** Dashboard ID to refresh */
  dashboardId: string;
  /** Organization the dashboard belongs to */
  organizationId: string;
  /** Whether to notify realtime subscribers on completion */
  notifyRealtime?: boolean;
  /** Cache TTL override in seconds */
  cacheTtl?: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface DashboardRefreshResult {
  dashboardId: string;
  refreshedQuestions: number;
  failedQuestions: number;
  totalTimeMs: number;
  questionResults: Array<{
    questionId: string;
    success: boolean;
    rowCount?: number;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class DashboardRefreshHandler {
  constructor(
    private readonly config: WorkerConfig,
    private readonly cache: MultiLayerCache,
  ) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<DashboardRefreshResult> {
    const payload = data as unknown as DashboardRefreshPayload;
    const {
      dashboardId,
      organizationId,
      notifyRealtime = true,
      cacheTtl,
    } = payload;

    if (!dashboardId) {
      throw new Error('dashboardId is required in dashboard_refresh job data');
    }

    const startTime = Date.now();
    logger.info('Starting dashboard refresh', { dashboardId, organizationId });
    await progress(5);

    // Load DB
    const { createDatabaseFromUrl } = await import('@meridian/db');
    const db = createDatabaseFromUrl(this.config.databaseUrl);

    // Load dashboard with cards
    const { DashboardRepository } = await import('@meridian/db');
    const dashboardRepo = new DashboardRepository(db);
    const dashboard = await dashboardRepo.findById(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    // Load cards / questions associated with this dashboard
    const { DashboardCardRepository } = await import('@meridian/db');
    const cardRepo = new DashboardCardRepository(db);
    const cards = await cardRepo.findByDashboard(dashboardId);

    await progress(15);

    if (cards.length === 0) {
      logger.info('Dashboard has no cards, nothing to refresh', { dashboardId });
      await progress(100);
      return {
        dashboardId,
        refreshedQuestions: 0,
        failedQuestions: 0,
        totalTimeMs: Date.now() - startTime,
        questionResults: [],
      };
    }

    // Load questions and connectors
    const { QuestionRepository } = await import('@meridian/db');
    const { DataSourceRepository } = await import('@meridian/db');
    const { createConnector } = await import('@meridian/connectors');

    const questionRepo = new QuestionRepository(db);
    const datasourceRepo = new DataSourceRepository(db);

    const questionIds = [...new Set(cards.map((c: { questionId: string }) => c.questionId))];
    const total = questionIds.length;
    const questionResults: DashboardRefreshResult['questionResults'] = [];
    let refreshedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < questionIds.length; i++) {
      const questionId = questionIds[i]!;
      const pctBase = 15 + Math.round((i / total) * 75);
      await progress(pctBase);

      try {
        const question = await questionRepo.findById(questionId);
        if (!question) {
          throw new Error(`Question not found: ${questionId}`);
        }

        // Extract SQL
        const sql = extractSql(question.query);
        if (!sql) {
          logger.warn('Question has no executable SQL, skipping', { questionId });
          questionResults.push({
            questionId,
            success: false,
            error: 'No executable SQL (visual queries not supported in worker)',
          });
          failedCount++;
          continue;
        }

        const datasource = await datasourceRepo.findById(question.dataSourceId);
        if (!datasource) {
          throw new Error(`DataSource not found: ${question.dataSourceId}`);
        }

        const dsConfig = {
          id: datasource.id,
          name: datasource.name,
          type: datasource.type,
          ...(datasource.config as Record<string, unknown>),
        };

        const connector = createConnector(dsConfig);

        try {
          await connector.connect();
          const result = await connector.executeQuery(sql);

          const cacheKey = generateCacheKey({
            namespace: 'query',
            identifier: questionId,
            version: 'v1',
          });

          const ttl = cacheTtl ?? DEFAULT_CACHE_TTL_SECONDS;
          await this.cache.set(cacheKey, result, { ttlSeconds: ttl });

          questionResults.push({
            questionId,
            success: true,
            rowCount: result.rowCount,
          });
          refreshedCount++;

          logger.info('Question refreshed', {
            questionId,
            rowCount: result.rowCount,
            executionTimeMs: result.executionTimeMs,
          });
        } finally {
          await connector.disconnect().catch((err: Error) => {
            logger.warn('Connector disconnect failed', { questionId, error: err.message });
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Failed to refresh question', { questionId, error: message });
        questionResults.push({ questionId, success: false, error: message });
        failedCount++;
      }
    }

    await progress(92);

    // Notify realtime subscribers
    if (notifyRealtime) {
      try {
        await this.broadcastDashboardRefresh(dashboardId, questionResults);
      } catch (error) {
        logger.warn('Failed to broadcast realtime refresh', {
          dashboardId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalTimeMs = Date.now() - startTime;
    await progress(100);

    logger.info('Dashboard refresh complete', {
      dashboardId,
      refreshedQuestions: refreshedCount,
      failedQuestions: failedCount,
      totalTimeMs,
    });

    return {
      dashboardId,
      refreshedQuestions: refreshedCount,
      failedQuestions: failedCount,
      totalTimeMs,
      questionResults,
    };
  }

  private async broadcastDashboardRefresh(
    dashboardId: string,
    results: DashboardRefreshResult['questionResults'],
  ): Promise<void> {
    // Realtime broadcast is best-effort; errors are caught by caller
    logger.info('Broadcasting dashboard refresh event', {
      dashboardId,
      questionCount: results.length,
    });
    // In a full implementation this would use the @meridian/realtime channel manager
    // to push a 'dashboard:refreshed' event to all subscribers of this dashboardId.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSql(query: Record<string, unknown>): string | null {
  if (typeof query['sql'] === 'string' && query['sql'].trim().length > 0) {
    return query['sql'];
  }
  return null;
}
