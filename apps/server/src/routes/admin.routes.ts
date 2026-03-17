import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthorizationError,
} from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const listAuditLogsQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const updateSettingsBodySchema = z.object({
  allowPublicRegistration: z.boolean().optional(),
  requireEmailVerification: z.boolean().optional(),
  defaultUserRole: z.enum(['viewer', 'editor', 'admin']).optional(),
  maxDashboardsPerOrg: z.coerce.number().int().positive().max(10_000).optional(),
  maxQuestionsPerOrg: z.coerce.number().int().positive().max(100_000).optional(),
  maxDataSourcesPerOrg: z.coerce.number().int().positive().max(1_000).optional(),
  embedTokenDefaultExpiryHours: z.coerce.number().int().positive().max(8760).optional(),
  auditLogRetentionDays: z.coerce.number().int().positive().max(3650).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  analyticsEnabled: z.boolean().optional(),
  debugMode: z.boolean().optional(),
});

// ── In-Memory Audit Log Store ────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Exported so middleware can append entries
export const auditLogStore: AuditLogEntry[] = [];

// ── In-Memory Settings Store ─────────────────────────────────────────

export interface OrgSettings {
  organizationId: string;
  allowPublicRegistration: boolean;
  requireEmailVerification: boolean;
  defaultUserRole: 'viewer' | 'editor' | 'admin';
  maxDashboardsPerOrg: number;
  maxQuestionsPerOrg: number;
  maxDataSourcesPerOrg: number;
  embedTokenDefaultExpiryHours: number;
  auditLogRetentionDays: number;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  analyticsEnabled: boolean;
  debugMode: boolean;
  updatedAt: Date;
  updatedBy: string;
}

const settingsStore = new Map<string, OrgSettings>();

function getOrCreateSettings(orgId: string, userId: string): OrgSettings {
  if (!settingsStore.has(orgId)) {
    settingsStore.set(orgId, {
      organizationId: orgId,
      allowPublicRegistration: true,
      requireEmailVerification: false,
      defaultUserRole: 'viewer',
      maxDashboardsPerOrg: 500,
      maxQuestionsPerOrg: 5000,
      maxDataSourcesPerOrg: 50,
      embedTokenDefaultExpiryHours: 24,
      auditLogRetentionDays: 90,
      maintenanceMode: false,
      analyticsEnabled: true,
      debugMode: false,
      updatedAt: new Date(),
      updatedBy: userId,
    });
  }
  return settingsStore.get(orgId)!;
}

// ── Response Helpers ─────────────────────────────────────────────────

function toAuditLogResponse(entry: AuditLogEntry) {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    userId: entry.userId,
    userEmail: entry.userEmail,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt.toISOString(),
  };
}

// ── Route Registration ──────────────────────────────────────────────

/**
 * Admin routes — system-level settings and audit log access.
 * All endpoints require admin-level permission.
 */
export async function adminRoutes(
  app: FastifyInstance,
  container: ServiceContainer,
): Promise<void> {
  const { userService, logger } = container;

  // ── Helper: Require admin role ───────────────────────────────────

  async function requireAdmin(request: FastifyRequest): Promise<void> {
    const user = request.user!;
    const result = await userService.getById(user.sub);
    if (!result.ok) throw result.error;
    if (!result.value.isAdmin) {
      throw new AuthorizationError('Admin access required');
    }
  }

  // ── GET /api/admin/settings — Get organization settings ──────────

  app.get('/api/admin/settings', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    await requireAdmin(request);

    const settings = getOrCreateSettings(user.orgId, user.sub);

    logger.debug('Admin settings fetched', { orgId: user.orgId, userId: user.sub });

    return reply.status(200).send({ data: settings });
  });

  // ── PUT /api/admin/settings — Update organization settings ───────

  app.put('/api/admin/settings', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    await requireAdmin(request);

    const body = updateSettingsBodySchema.parse(request.body);

    const current = getOrCreateSettings(user.orgId, user.sub);
    const updated: OrgSettings = {
      ...current,
      ...body,
      organizationId: user.orgId,
      updatedAt: new Date(),
      updatedBy: user.sub,
    };
    settingsStore.set(user.orgId, updated);

    // Write audit entry for settings change
    auditLogStore.push({
      id: crypto.randomUUID(),
      organizationId: user.orgId,
      userId: user.sub,
      userEmail: user.email,
      action: 'settings.update',
      resourceType: 'settings',
      metadata: { changes: Object.keys(body) },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      createdAt: new Date(),
    });

    logger.info('Admin settings updated', {
      orgId: user.orgId,
      userId: user.sub,
      changes: Object.keys(body),
    });

    return reply.status(200).send({ data: updated });
  });

  // ── GET /api/admin/audit-logs — List audit log entries ──────────

  app.get('/api/admin/audit-logs', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    await requireAdmin(request);

    const query = listAuditLogsQuerySchema.parse(request.query);

    let entries = auditLogStore.filter(
      (e) => e.organizationId === user.orgId,
    );

    if (query.userId) {
      entries = entries.filter((e) => e.userId === query.userId);
    }
    if (query.action) {
      entries = entries.filter((e) => e.action.includes(query.action!));
    }
    if (query.resourceType) {
      entries = entries.filter((e) => e.resourceType === query.resourceType);
    }
    if (query.resourceId) {
      entries = entries.filter((e) => e.resourceId === query.resourceId);
    }
    if (query.startDate) {
      const start = new Date(query.startDate);
      entries = entries.filter((e) => e.createdAt >= start);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      entries = entries.filter((e) => e.createdAt <= end);
    }

    // Sort descending by createdAt
    entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = entries.length;
    const page = entries.slice(query.offset, query.offset + query.limit);

    return reply.status(200).send({
      data: page.map(toAuditLogResponse),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  });

  // ── GET /api/admin/audit-logs/:id — Get single audit log entry ──

  app.get('/api/admin/audit-logs/:id', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    await requireAdmin(request);

    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const entry = auditLogStore.find(
      (e) => e.id === id && e.organizationId === user.orgId,
    );

    if (!entry) {
      return reply.status(404).send({
        error: {
          code: 'ERR_NOT_FOUND',
          message: `Audit log entry '${id}' not found`,
          statusCode: 404,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      });
    }

    return reply.status(200).send({ data: toAuditLogResponse(entry) });
  });

  // ── GET /api/admin/stats — Organization-level stats ─────────────

  app.get('/api/admin/stats', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    await requireAdmin(request);

    const orgAuditCount = auditLogStore.filter(
      (e) => e.organizationId === user.orgId,
    ).length;

    // In a real implementation, these would be database aggregations.
    // For now return stub counts augmented by what we know.
    const stats = {
      organizationId: user.orgId,
      auditLogEntries: orgAuditCount,
      activeUsers: 0,
      totalDashboards: 0,
      totalQuestions: 0,
      totalDataSources: 0,
      generatedAt: new Date().toISOString(),
    };

    logger.debug('Admin stats fetched', { orgId: user.orgId, userId: user.sub });

    return reply.status(200).send({ data: stats });
  });
}
