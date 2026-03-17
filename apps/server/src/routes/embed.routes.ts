import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthenticationError,
  AuthorizationError,
  generateId,
} from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

const generateTokenBodySchema = z.object({
  resourceType: z.enum(['dashboard', 'question']),
  resourceId: z.string().min(1, 'Resource ID is required'),
  expiresInHours: z.coerce.number().int().positive().max(8760).optional().default(24),
  permissions: z.object({
    canInteract: z.boolean().optional().default(true),
    canDownload: z.boolean().optional().default(false),
    canFilter: z.boolean().optional().default(true),
  }).optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional().default('auto'),
  locale: z.string().min(2).max(10).optional().default('en'),
  parameters: z.record(z.unknown()).optional(),
  allowedDomains: z.array(z.string()).optional(),
});

const executeBodySchema = z.object({
  parameters: z.record(z.unknown()).optional(),
  limit: z.coerce.number().int().positive().max(10_000).optional().default(1000),
});

// ── In-memory embed token store ─────────────────────────────────────

interface EmbedTokenData {
  token: string;
  resourceType: 'dashboard' | 'question';
  resourceId: string;
  organizationId: string;
  createdBy: string;
  permissions: {
    canInteract: boolean;
    canDownload: boolean;
    canFilter: boolean;
  };
  theme: string;
  locale: string;
  parameters?: Record<string, unknown>;
  allowedDomains?: string[];
  expiresAt: Date;
  createdAt: Date;
}

const embedTokenStore = new Map<string, EmbedTokenData>();

// ── Response Types ──────────────────────────────────────────────────

interface EmbedTokenResponse {
  token: string;
  embedUrl: string;
  resourceType: string;
  resourceId: string;
  permissions: {
    canInteract: boolean;
    canDownload: boolean;
    canFilter: boolean;
  };
  theme: string;
  locale: string;
  expiresAt: string;
  createdAt: string;
}

// ── Helper: Validate embed token ────────────────────────────────────

function validateEmbedToken(token: string): EmbedTokenData {
  const data = embedTokenStore.get(token);
  if (!data) {
    throw new AuthenticationError('Invalid embed token');
  }
  if (data.expiresAt.getTime() < Date.now()) {
    embedTokenStore.delete(token);
    throw new AuthenticationError('Embed token has expired');
  }
  return data;
}

// ── Route Registration ──────────────────────────────────────────────

export async function embedRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { dashboardService, questionService, tokenService, logger } = container;

  // ── POST /api/embed/token — Generate embed token ────────────────

  app.post('/api/embed/token', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = generateTokenBodySchema.parse(request.body);

    // Verify the resource exists and user has access
    if (body.resourceType === 'dashboard') {
      const result = await dashboardService.getById(body.resourceId);
      if (!result.ok) throw result.error;
      if (result.value.organizationId !== user.orgId) {
        throw new AuthorizationError('Access denied to this dashboard');
      }
    } else {
      const result = await questionService.getById(body.resourceId);
      if (!result.ok) throw result.error;
      if (result.value.organizationId !== user.orgId) {
        throw new AuthorizationError('Access denied to this question');
      }
    }

    // Generate embed token
    const token = generateId();
    const expiresAt = new Date(Date.now() + body.expiresInHours * 3600_000);
    const now = new Date();

    const embedData: EmbedTokenData = {
      token,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      organizationId: user.orgId,
      createdBy: user.sub,
      permissions: {
        canInteract: body.permissions?.canInteract ?? true,
        canDownload: body.permissions?.canDownload ?? false,
        canFilter: body.permissions?.canFilter ?? true,
      },
      theme: body.theme,
      locale: body.locale,
      parameters: body.parameters,
      allowedDomains: body.allowedDomains,
      expiresAt,
      createdAt: now,
    };

    embedTokenStore.set(token, embedData);

    logger.info('Embed token generated', {
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      expiresAt: expiresAt.toISOString(),
      userId: user.sub,
    });

    const response: EmbedTokenResponse = {
      token,
      embedUrl: `/embed/${body.resourceType}/${body.resourceId}?token=${token}`,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      permissions: embedData.permissions,
      theme: embedData.theme,
      locale: embedData.locale,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };

    return reply.status(201).send({ data: response });
  });

  // ── GET /api/embed/dashboard/:id — Get dashboard for embed ──────

  app.get('/api/embed/dashboard/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);

    // Extract embed token from query or header
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? request.headers['x-embed-token'] as string | undefined;

    if (!token) {
      throw new AuthenticationError('Embed token is required');
    }

    const embedData = validateEmbedToken(token);

    // Verify the token is for this resource
    if (embedData.resourceType !== 'dashboard' || embedData.resourceId !== id) {
      throw new AuthorizationError('Token is not valid for this resource');
    }

    // Get the dashboard
    const result = await dashboardService.getById(id);
    if (!result.ok) throw result.error;

    const dashboard = result.value;

    return reply.status(200).send({
      data: {
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        layout: dashboard.layout,
        filters: dashboard.filters,
        cards: dashboard.cards.map((c) => ({
          id: c.id,
          dashboardId: c.dashboardId,
          questionId: c.questionId,
          position: c.position,
          size: c.size,
          title: c.title,
        })),
        cardCount: dashboard.cardCount,
      },
      embed: {
        permissions: embedData.permissions,
        theme: embedData.theme,
        locale: embedData.locale,
        parameters: embedData.parameters,
      },
    });
  });

  // ── GET /api/embed/question/:id — Get question for embed ────────

  app.get('/api/embed/question/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);

    // Extract embed token
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? request.headers['x-embed-token'] as string | undefined;

    if (!token) {
      throw new AuthenticationError('Embed token is required');
    }

    const embedData = validateEmbedToken(token);

    // Verify the token is for this resource
    if (embedData.resourceType !== 'question' || embedData.resourceId !== id) {
      throw new AuthorizationError('Token is not valid for this resource');
    }

    // Get the question
    const result = await questionService.getById(id);
    if (!result.ok) throw result.error;

    const question = result.value;

    return reply.status(200).send({
      data: {
        id: question.id,
        name: question.name,
        description: question.description,
        type: question.type,
        visualization: question.visualization,
      },
      embed: {
        permissions: embedData.permissions,
        theme: embedData.theme,
        locale: embedData.locale,
        parameters: embedData.parameters,
      },
    });
  });

  // ── POST /api/embed/question/:id/execute — Execute for embed ────

  app.post('/api/embed/question/:id/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = executeBodySchema.parse(request.body ?? {});

    // Extract embed token
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? request.headers['x-embed-token'] as string | undefined;

    if (!token) {
      throw new AuthenticationError('Embed token is required');
    }

    const embedData = validateEmbedToken(token);

    // Verify the token is for this resource or a dashboard containing it
    if (embedData.resourceType === 'question' && embedData.resourceId !== id) {
      throw new AuthorizationError('Token is not valid for this resource');
    }

    // Get the question to verify it exists
    const result = await questionService.getById(id);
    if (!result.ok) throw result.error;

    const question = result.value;

    // Stub query execution for embed
    const stubResult = {
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'value', type: 'text', nullable: true },
      ],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };

    logger.info('Embed question executed', {
      questionId: id,
      type: question.type,
      embedToken: token.slice(0, 8) + '...',
    });

    return reply.status(200).send({ data: stubResult });
  });

  // ── GET /api/embed/validate — Validate an embed token ───────────

  app.get('/api/embed/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? request.headers['x-embed-token'] as string | undefined;

    if (!token) {
      return reply.status(200).send({
        data: { valid: false, reason: 'No token provided' },
      });
    }

    try {
      const embedData = validateEmbedToken(token);
      return reply.status(200).send({
        data: {
          valid: true,
          resourceType: embedData.resourceType,
          resourceId: embedData.resourceId,
          permissions: embedData.permissions,
          expiresAt: embedData.expiresAt.toISOString(),
        },
      });
    } catch {
      return reply.status(200).send({
        data: { valid: false, reason: 'Token is invalid or expired' },
      });
    }
  });
}
