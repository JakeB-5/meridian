import {
  ok,
  err,
  NotFoundError,
  ConflictError,
  generateId,
  type Result,
} from '@meridian/shared';

// ── Domain Types ────────────────────────────────────────────────────

export type NotificationChannel = 'in-app' | 'email' | 'webhook' | 'slack';
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'acknowledged';
export type AlertConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export interface AlertCondition {
  metricName: string;
  operator: AlertConditionOperator;
  threshold: number;
  /** Optional window in minutes for time-based aggregations */
  windowMinutes?: number;
}

export interface AlertRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  questionId?: string;
  dashboardId?: string;
  conditions: AlertCondition[];
  channels: NotificationChannel[];
  recipients: string[];
  webhookUrl?: string;
  slackWebhookUrl?: string;
  severity: NotificationSeverity;
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggeredAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  organizationId: string;
  alertRuleId?: string;
  userId?: string;
  channel: NotificationChannel;
  severity: NotificationSeverity;
  status: NotificationStatus;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  error?: string;
  createdAt: Date;
}

// ── DTO Types ────────────────────────────────────────────────────────

export interface CreateAlertRuleDto {
  organizationId: string;
  name: string;
  description?: string;
  questionId?: string;
  dashboardId?: string;
  conditions: AlertCondition[];
  channels: NotificationChannel[];
  recipients: string[];
  webhookUrl?: string;
  slackWebhookUrl?: string;
  severity?: NotificationSeverity;
  enabled?: boolean;
  cooldownMinutes?: number;
  createdBy: string;
}

export interface UpdateAlertRuleDto {
  name?: string;
  description?: string;
  conditions?: AlertCondition[];
  channels?: NotificationChannel[];
  recipients?: string[];
  webhookUrl?: string;
  slackWebhookUrl?: string;
  severity?: NotificationSeverity;
  enabled?: boolean;
  cooldownMinutes?: number;
}

export interface SendNotificationDto {
  organizationId: string;
  channel: NotificationChannel;
  severity: NotificationSeverity;
  subject: string;
  body: string;
  recipients: string[];
  alertRuleId?: string;
  userId?: string;
  webhookUrl?: string;
  slackWebhookUrl?: string;
  metadata?: Record<string, unknown>;
}

// ── Notification Dispatchers ─────────────────────────────────────────

/**
 * Dispatch an in-app notification.
 * In a real implementation this would persist to the database and
 * push via WebSocket to the connected client.
 */
async function dispatchInApp(notification: Notification): Promise<void> {
  // Stub: in production, push via WebSocket or Server-Sent Events
  await Promise.resolve();
  notification.status = 'sent';
  notification.sentAt = new Date();
}

/**
 * Dispatch an email notification.
 * Stub — in production use Nodemailer, SendGrid, Resend, etc.
 */
async function dispatchEmail(
  notification: Notification,
  recipients: string[],
): Promise<void> {
  await Promise.resolve();
  // Real implementation: await emailClient.send({ to: recipients, subject, html })
  void recipients;
  notification.status = 'sent';
  notification.sentAt = new Date();
}

/**
 * Dispatch a webhook notification (HTTP POST).
 * Stub — in production use `undici` or `node-fetch`.
 */
async function dispatchWebhook(
  notification: Notification,
  webhookUrl: string,
): Promise<void> {
  // Real implementation:
  // await fetch(webhookUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ ...notification }),
  // });
  await Promise.resolve();
  void webhookUrl;
  notification.status = 'sent';
  notification.sentAt = new Date();
}

/**
 * Dispatch a Slack notification via an incoming webhook URL.
 * Stub — in production POST to the Slack webhook with a formatted Block Kit message.
 */
async function dispatchSlack(
  notification: Notification,
  webhookUrl: string,
): Promise<void> {
  // Real implementation:
  // await fetch(webhookUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text: `*${notification.subject}*\n${notification.body}` }),
  // });
  await Promise.resolve();
  void webhookUrl;
  notification.status = 'sent';
  notification.sentAt = new Date();
}

// ── Service ──────────────────────────────────────────────────────────

/**
 * NotificationService manages alert rules and dispatches notifications
 * across multiple channels (in-app, email, webhook, Slack).
 *
 * Alert rules define threshold-based conditions on question metrics.
 * When a condition is met, a notification is dispatched to all
 * configured channels and recipients for the rule.
 */
export class NotificationService {
  private readonly alertRuleStore = new Map<string, AlertRule>();
  private readonly notificationStore = new Map<string, Notification>();

  // ── Alert Rules ────────────────────────────────────────────────

  /**
   * Create a new alert rule.
   */
  async createAlertRule(dto: CreateAlertRuleDto): Promise<Result<AlertRule>> {
    const duplicate = Array.from(this.alertRuleStore.values()).find(
      (r) => r.organizationId === dto.organizationId && r.name === dto.name,
    );
    if (duplicate) {
      return err(new ConflictError(`Alert rule '${dto.name}' already exists`));
    }

    const now = new Date();
    const rule: AlertRule = {
      id: generateId(),
      organizationId: dto.organizationId,
      name: dto.name,
      description: dto.description,
      questionId: dto.questionId,
      dashboardId: dto.dashboardId,
      conditions: dto.conditions,
      channels: dto.channels,
      recipients: dto.recipients,
      webhookUrl: dto.webhookUrl,
      slackWebhookUrl: dto.slackWebhookUrl,
      severity: dto.severity ?? 'warning',
      enabled: dto.enabled ?? true,
      cooldownMinutes: dto.cooldownMinutes ?? 60,
      createdBy: dto.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    this.alertRuleStore.set(rule.id, rule);
    return ok(rule);
  }

  /**
   * Get an alert rule by ID.
   */
  async getAlertRuleById(id: string): Promise<Result<AlertRule>> {
    const rule = this.alertRuleStore.get(id);
    if (!rule) return err(new NotFoundError('AlertRule', id));
    return ok(rule);
  }

  /**
   * List alert rules for an organization.
   */
  async listAlertRules(
    organizationId: string,
    options: {
      enabled?: boolean;
      questionId?: string;
      dashboardId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Result<{ rules: AlertRule[]; total: number }>> {
    let rules = Array.from(this.alertRuleStore.values()).filter(
      (r) => r.organizationId === organizationId,
    );

    if (options.enabled !== undefined) {
      rules = rules.filter((r) => r.enabled === options.enabled);
    }
    if (options.questionId) {
      rules = rules.filter((r) => r.questionId === options.questionId);
    }
    if (options.dashboardId) {
      rules = rules.filter((r) => r.dashboardId === options.dashboardId);
    }

    rules.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = rules.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 25;
    return ok({ rules: rules.slice(offset, offset + limit), total });
  }

  /**
   * Update an alert rule.
   */
  async updateAlertRule(
    id: string,
    dto: UpdateAlertRuleDto,
  ): Promise<Result<AlertRule>> {
    const rule = this.alertRuleStore.get(id);
    if (!rule) return err(new NotFoundError('AlertRule', id));

    if (dto.name && dto.name !== rule.name) {
      const dup = Array.from(this.alertRuleStore.values()).find(
        (r) => r.id !== id && r.organizationId === rule.organizationId && r.name === dto.name,
      );
      if (dup) {
        return err(new ConflictError(`Alert rule '${dto.name}' already exists`));
      }
    }

    const updated: AlertRule = {
      ...rule,
      name: dto.name ?? rule.name,
      description: dto.description !== undefined ? dto.description : rule.description,
      conditions: dto.conditions ?? rule.conditions,
      channels: dto.channels ?? rule.channels,
      recipients: dto.recipients ?? rule.recipients,
      webhookUrl: dto.webhookUrl !== undefined ? dto.webhookUrl : rule.webhookUrl,
      slackWebhookUrl: dto.slackWebhookUrl !== undefined ? dto.slackWebhookUrl : rule.slackWebhookUrl,
      severity: dto.severity ?? rule.severity,
      enabled: dto.enabled !== undefined ? dto.enabled : rule.enabled,
      cooldownMinutes: dto.cooldownMinutes ?? rule.cooldownMinutes,
      updatedAt: new Date(),
    };

    this.alertRuleStore.set(id, updated);
    return ok(updated);
  }

  /**
   * Delete an alert rule and its associated notifications.
   */
  async deleteAlertRule(id: string): Promise<Result<void>> {
    const rule = this.alertRuleStore.get(id);
    if (!rule) return err(new NotFoundError('AlertRule', id));

    for (const [notifId, notif] of this.notificationStore) {
      if (notif.alertRuleId === id) {
        this.notificationStore.delete(notifId);
      }
    }

    this.alertRuleStore.delete(id);
    return ok(undefined);
  }

  // ── Notification Dispatch ──────────────────────────────────────

  /**
   * Send a notification via the specified channel.
   * Returns the persisted notification record (including delivery status).
   */
  async send(dto: SendNotificationDto): Promise<Result<Notification>> {
    const notification: Notification = {
      id: generateId(),
      organizationId: dto.organizationId,
      alertRuleId: dto.alertRuleId,
      userId: dto.userId,
      channel: dto.channel,
      severity: dto.severity,
      status: 'pending',
      subject: dto.subject,
      body: dto.body,
      metadata: dto.metadata,
      createdAt: new Date(),
    };

    this.notificationStore.set(notification.id, notification);

    try {
      switch (dto.channel) {
        case 'in-app':
          await dispatchInApp(notification);
          break;
        case 'email':
          await dispatchEmail(notification, dto.recipients);
          break;
        case 'webhook':
          if (!dto.webhookUrl) {
            throw new Error('webhookUrl is required for webhook notifications');
          }
          await dispatchWebhook(notification, dto.webhookUrl);
          break;
        case 'slack':
          if (!dto.slackWebhookUrl) {
            throw new Error('slackWebhookUrl is required for Slack notifications');
          }
          await dispatchSlack(notification, dto.slackWebhookUrl);
          break;
        default:
          notification.status = 'failed';
          notification.error = `Unknown channel: ${dto.channel}`;
      }
    } catch (error) {
      notification.status = 'failed';
      notification.error = (error as Error).message;
    }

    this.notificationStore.set(notification.id, notification);
    return ok(notification);
  }

  /**
   * Trigger all enabled alert rules for an organization, evaluating
   * each condition against the supplied metric values.
   *
   * Returns the list of notifications that were dispatched.
   */
  async triggerAlerts(
    organizationId: string,
    metricValues: Record<string, number>,
  ): Promise<Result<Notification[]>> {
    const rules = Array.from(this.alertRuleStore.values()).filter(
      (r) => r.organizationId === organizationId && r.enabled,
    );

    const now = Date.now();
    const dispatched: Notification[] = [];

    for (const rule of rules) {
      // Respect cooldown
      if (
        rule.lastTriggeredAt &&
        now - rule.lastTriggeredAt.getTime() < rule.cooldownMinutes * 60_000
      ) {
        continue;
      }

      // Evaluate conditions (all must pass — AND logic)
      const triggered = rule.conditions.every((cond) => {
        const value = metricValues[cond.metricName];
        if (value === undefined) return false;
        switch (cond.operator) {
          case 'gt':  return value >  cond.threshold;
          case 'gte': return value >= cond.threshold;
          case 'lt':  return value <  cond.threshold;
          case 'lte': return value <= cond.threshold;
          case 'eq':  return value === cond.threshold;
          case 'neq': return value !== cond.threshold;
          default:    return false;
        }
      });

      if (!triggered) continue;

      // Update lastTriggeredAt
      rule.lastTriggeredAt = new Date();
      this.alertRuleStore.set(rule.id, rule);

      // Dispatch on each configured channel
      for (const channel of rule.channels) {
        const result = await this.send({
          organizationId,
          alertRuleId: rule.id,
          channel,
          severity: rule.severity,
          subject: `[${rule.severity.toUpperCase()}] Alert: ${rule.name}`,
          body: `Alert rule '${rule.name}' was triggered.\n\nConditions met:\n${rule.conditions
            .map((c) => `  ${c.metricName} ${c.operator} ${c.threshold} (actual: ${metricValues[c.metricName]})`)
            .join('\n')}`,
          recipients: rule.recipients,
          webhookUrl: rule.webhookUrl,
          slackWebhookUrl: rule.slackWebhookUrl,
          metadata: { ruleId: rule.id, metricValues },
        });

        if (result.ok) {
          dispatched.push(result.value);
        }
      }
    }

    return ok(dispatched);
  }

  // ── Notification Queries ───────────────────────────────────────

  /**
   * Get a single notification by ID.
   */
  async getNotificationById(id: string): Promise<Result<Notification>> {
    const notif = this.notificationStore.get(id);
    if (!notif) return err(new NotFoundError('Notification', id));
    return ok(notif);
  }

  /**
   * List notifications for an organization.
   */
  async listNotifications(
    organizationId: string,
    options: {
      status?: NotificationStatus;
      channel?: NotificationChannel;
      severity?: NotificationSeverity;
      userId?: string;
      alertRuleId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Result<{ notifications: Notification[]; total: number }>> {
    let notifications = Array.from(this.notificationStore.values()).filter(
      (n) => n.organizationId === organizationId,
    );

    if (options.status) notifications = notifications.filter((n) => n.status === options.status);
    if (options.channel) notifications = notifications.filter((n) => n.channel === options.channel);
    if (options.severity) notifications = notifications.filter((n) => n.severity === options.severity);
    if (options.userId) notifications = notifications.filter((n) => n.userId === options.userId);
    if (options.alertRuleId) notifications = notifications.filter((n) => n.alertRuleId === options.alertRuleId);

    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = notifications.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    return ok({ notifications: notifications.slice(offset, offset + limit), total });
  }

  /**
   * Mark a notification as acknowledged by a user.
   */
  async acknowledge(
    id: string,
    userId: string,
  ): Promise<Result<Notification>> {
    const notif = this.notificationStore.get(id);
    if (!notif) return err(new NotFoundError('Notification', id));

    const updated: Notification = {
      ...notif,
      status: 'acknowledged',
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    };

    this.notificationStore.set(id, updated);
    return ok(updated);
  }

  /**
   * Count unacknowledged in-app notifications for a user.
   */
  countUnread(organizationId: string, userId: string): number {
    return Array.from(this.notificationStore.values()).filter(
      (n) =>
        n.organizationId === organizationId &&
        n.userId === userId &&
        n.channel === 'in-app' &&
        n.status === 'sent',
    ).length;
  }
}
