import type { Logger } from '@meridian/shared';
import { createNoopLogger } from '@meridian/shared';
import type { ChannelManager } from '../channel-manager.js';
import type { ClientRegistry } from '../client-registry.js';
import { channelName } from '../channel-manager.js';
import { createMessage } from '../message-serializer.js';

// ── Event Payload Types ───────────────────────────────────────────────

/**
 * Payload emitted when a query result is updated for a question.
 */
export interface QueryResultUpdatedPayload {
  questionId: string;
  dashboardId?: string;
  /** ISO timestamp of when the result was computed */
  computedAt: string;
  /** Optional row count for quick preview */
  rowCount?: number;
  /** Optional error message if the query failed */
  error?: string;
}

/**
 * Payload emitted when a dashboard layout or config is edited.
 */
export interface DashboardEditedPayload {
  dashboardId: string;
  editedBy: string;
  /** ISO timestamp of the edit */
  editedAt: string;
  /** Which aspects changed */
  changes: {
    layout?: boolean;
    filters?: boolean;
    title?: boolean;
    cards?: boolean;
  };
}

/**
 * Payload emitted when a data source's connection status changes.
 */
export interface DataSourceStatusChangedPayload {
  dataSourceId: string;
  previousStatus: 'connected' | 'disconnected' | 'error' | 'testing';
  currentStatus: 'connected' | 'disconnected' | 'error' | 'testing';
  /** ISO timestamp of the status change */
  changedAt: string;
  /** Error message if status is 'error' */
  error?: string;
  /** IDs of dashboards that use this data source */
  affectedDashboardIds?: string[];
}

/**
 * Payload emitted when a dashboard's cache is invalidated.
 */
export interface DashboardCacheInvalidatedPayload {
  dashboardId: string;
  reason: 'manual' | 'schedule' | 'datasource_change' | 'query_change';
  /** ISO timestamp */
  invalidatedAt: string;
}

/**
 * Payload emitted when a question's definition is updated.
 */
export interface QuestionUpdatedPayload {
  questionId: string;
  updatedBy: string;
  updatedAt: string;
  /** IDs of dashboards that embed this question */
  affectedDashboardIds?: string[];
}

// ── DashboardEventEmitter ─────────────────────────────────────────────

/**
 * Emits WebSocket broadcast events for dashboard-related lifecycle changes.
 *
 * Acts as the bridge between backend domain events (scheduler, worker, API)
 * and the WebSocket pub/sub layer.
 */
export class DashboardEventEmitter {
  private readonly logger: Logger;

  constructor(
    private readonly channelManager: ChannelManager,
    private readonly clientRegistry: ClientRegistry,
    logger?: Logger,
  ) {
    this.logger = logger ?? createNoopLogger();
  }

  // ── Query Result Updated ──────────────────────────────────────────

  /**
   * Broadcast a query result update to all subscribers of the question channel
   * and optionally to the associated dashboard channel.
   *
   * Called by the Worker after a query completes execution.
   */
  onQueryResultUpdated(payload: QueryResultUpdatedPayload): void {
    const questionChannel = channelName('question', payload.questionId);

    const message = createMessage<QueryResultUpdatedPayload>('data_update', {
      channel: questionChannel,
      payload,
    });

    const questionSent = this.channelManager.broadcast(
      questionChannel,
      message,
      (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
    );

    this.logger.debug('Broadcast query result update to question channel', {
      questionId: payload.questionId,
      channel: questionChannel,
      clientsNotified: questionSent,
    });

    // Also broadcast to the dashboard channel if provided
    if (payload.dashboardId) {
      const dashboardChannel = channelName('dashboard', payload.dashboardId);
      const dashboardMessage = createMessage<QueryResultUpdatedPayload>('data_update', {
        channel: dashboardChannel,
        payload,
      });

      const dashboardSent = this.channelManager.broadcast(
        dashboardChannel,
        dashboardMessage,
        (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
      );

      this.logger.debug('Broadcast query result update to dashboard channel', {
        dashboardId: payload.dashboardId,
        channel: dashboardChannel,
        clientsNotified: dashboardSent,
      });
    }
  }

  // ── Dashboard Edited ──────────────────────────────────────────────

  /**
   * Broadcast a dashboard edit event to all dashboard subscribers.
   *
   * Called by the API server when a dashboard is saved.
   */
  onDashboardEdited(payload: DashboardEditedPayload): void {
    const channel = channelName('dashboard', payload.dashboardId);

    const message = createMessage<DashboardEditedPayload>('data_update', {
      channel,
      payload,
    });

    const sent = this.channelManager.broadcast(
      channel,
      message,
      (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
    );

    this.logger.info('Broadcast dashboard edit event', {
      dashboardId: payload.dashboardId,
      editedBy: payload.editedBy,
      channel,
      clientsNotified: sent,
    });
  }

  // ── Data Source Status Changed ────────────────────────────────────

  /**
   * Broadcast a data source status change to the datasource channel
   * and optionally to all affected dashboard channels.
   *
   * Called by the connector layer when a data source's health changes.
   */
  onDataSourceStatusChanged(payload: DataSourceStatusChangedPayload): void {
    const datasourceChannel = channelName('datasource', payload.dataSourceId);

    const message = createMessage<DataSourceStatusChangedPayload>('data_update', {
      channel: datasourceChannel,
      payload,
    });

    const datasourceSent = this.channelManager.broadcast(
      datasourceChannel,
      message,
      (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
    );

    this.logger.info('Broadcast data source status change', {
      dataSourceId: payload.dataSourceId,
      previousStatus: payload.previousStatus,
      currentStatus: payload.currentStatus,
      channel: datasourceChannel,
      clientsNotified: datasourceSent,
    });

    // Notify affected dashboard subscribers
    if (payload.affectedDashboardIds && payload.affectedDashboardIds.length > 0) {
      for (const dashboardId of payload.affectedDashboardIds) {
        const dashboardChannel = channelName('dashboard', dashboardId);
        const dashboardMessage = createMessage<DataSourceStatusChangedPayload>('data_update', {
          channel: dashboardChannel,
          payload,
        });

        const sent = this.channelManager.broadcast(
          dashboardChannel,
          dashboardMessage,
          (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
        );

        this.logger.debug('Broadcast data source status to dashboard channel', {
          dataSourceId: payload.dataSourceId,
          dashboardId,
          channel: dashboardChannel,
          clientsNotified: sent,
        });
      }
    }
  }

  // ── Dashboard Cache Invalidated ───────────────────────────────────

  /**
   * Broadcast a cache invalidation notice to all dashboard subscribers,
   * signaling that clients should expect a fresh query result soon.
   *
   * Called by the Scheduler when a refresh cycle begins.
   */
  onDashboardCacheInvalidated(payload: DashboardCacheInvalidatedPayload): void {
    const channel = channelName('dashboard', payload.dashboardId);

    const message = createMessage<DashboardCacheInvalidatedPayload>('data_update', {
      channel,
      payload,
    });

    const sent = this.channelManager.broadcast(
      channel,
      message,
      (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
    );

    this.logger.debug('Broadcast dashboard cache invalidation', {
      dashboardId: payload.dashboardId,
      reason: payload.reason,
      channel,
      clientsNotified: sent,
    });
  }

  // ── Question Updated ──────────────────────────────────────────────

  /**
   * Broadcast a question definition update to the question channel
   * and optionally to all affected dashboard channels.
   *
   * Called by the API server when a question's SQL or config is saved.
   */
  onQuestionUpdated(payload: QuestionUpdatedPayload): void {
    const questionChannel = channelName('question', payload.questionId);

    const message = createMessage<QuestionUpdatedPayload>('data_update', {
      channel: questionChannel,
      payload,
    });

    const questionSent = this.channelManager.broadcast(
      questionChannel,
      message,
      (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
    );

    this.logger.info('Broadcast question updated event', {
      questionId: payload.questionId,
      updatedBy: payload.updatedBy,
      channel: questionChannel,
      clientsNotified: questionSent,
    });

    // Notify affected dashboards
    if (payload.affectedDashboardIds && payload.affectedDashboardIds.length > 0) {
      for (const dashboardId of payload.affectedDashboardIds) {
        const dashboardChannel = channelName('dashboard', dashboardId);
        const dashboardMessage = createMessage<QuestionUpdatedPayload>('data_update', {
          channel: dashboardChannel,
          payload,
        });

        const sent = this.channelManager.broadcast(
          dashboardChannel,
          dashboardMessage,
          (clientId) => this.clientRegistry.getSocketOrUndefined(clientId),
        );

        this.logger.debug('Broadcast question update to dashboard channel', {
          questionId: payload.questionId,
          dashboardId,
          channel: dashboardChannel,
          clientsNotified: sent,
        });
      }
    }
  }
}
